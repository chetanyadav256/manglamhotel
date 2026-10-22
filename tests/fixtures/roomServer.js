// Isolated, in-memory persistence fixture. Imports never load server/.env and
// never call mongoose.connect(). Routes, validation and auth middleware are real.
import { randomBytes } from 'node:crypto';
import { dirname } from 'node:path';
import mongoose from 'mongoose';
import { createApp } from '../../server/src/app.js';
import Room from '../../server/src/models/Room.js';
import MenuCategory from '../../server/src/models/MenuCategory.js';
import MenuItem from '../../server/src/models/MenuItem.js';
import SiteSettings from '../../server/src/models/SiteSettings.js';
import { createOpaqueToken, hashSessionToken } from '../../server/src/security/adminAuth.js';

export const fixtureOrigin = 'http://127.0.0.1:5173';

function valuesAt(record, path) {
  return path.split('.').reduce((values, part) => values.flatMap((value) => {
    if (Array.isArray(value)) return /^\d+$/.test(part) ? [value[Number(part)]] : value.map((entry) => entry?.[part]);
    return [value?.[part]];
  }), [record]);
}

export function matches(record, filter) {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === '$and') return expected.every((condition) => matches(record, condition));
    if (key === '$or') return expected.some((condition) => matches(record, condition));
    if (key === '$expr') {
      const [capacityCheck, duplicateCheck] = expected.$let.in.$and;
      const reservations = record.pendingImageReservations ?? [];
      const expiration = expected.$let.vars.activeReservations.$filter.cond.$gt[1];
      const active = reservations.filter((reservation) => reservation.expiresAt > expiration);
      const count = capacityCheck.$lte[0].$add[2];
      const requestedUploadId = duplicateCheck.$not[0].$in[0];
      return (record.images ?? []).length
        + active.reduce((sum, reservation) => sum + reservation.count, 0)
        + count <= 5
        && !active.some((reservation) => reservation.uploadId === requestedUploadId);
    }
    const rawValues = valuesAt(record, key);
    const values = rawValues.flat();
    if (expected && typeof expected === 'object') {
      if ('$ne' in expected) return values.every((value) => value !== expected.$ne);
      if ('$gt' in expected) return values.some((value) => value > expected.$gt);
      if ('$in' in expected) return values.some((value) => expected.$in.some((entry) => String(entry) === String(value)));
      if ('$exists' in expected) return rawValues.some((value) => value !== undefined) === expected.$exists;
      if ('$regex' in expected) return values.some((value) => new RegExp(expected.$regex, expected.$options).test(value));
    }
    return values.some((value) => String(value) === String(expected));
  });
}

function applyUpdate(record, update) {
  if (Array.isArray(update)) {
    const expression = update[0].$set.pendingImageReservations.$let;
    const cutoff = expression.vars.activeReservations.$filter.cond.$gt[1];
    const active = (record.pendingImageReservations ?? []).filter((entry) => entry.expiresAt > cutoff);
    const reservation = structuredClone(expression.in.$concatArrays[1][0]);
    reservation.startOrder = (record.images ?? []).length + active.reduce((sum, entry) => sum + entry.count, 0);
    record.pendingImageReservations = [...active, reservation];
    return;
  }
  for (const [key, value] of Object.entries(update.$set ?? {})) {
    const parts = key.split('.'); let target = record;
    for (const part of parts.slice(0, -1)) { target[part] ??= {}; target = target[part]; }
    target[parts.at(-1)] = structuredClone(value);
  }
  for (const key of Object.keys(update.$unset ?? {})) delete record[key];
  for (const [key, value] of Object.entries(update.$inc ?? {})) record[key] = (record[key] ?? 0) + value;
  for (const [key, value] of Object.entries(update.$push ?? {})) {
    const values = value && typeof value === 'object' && '$each' in value ? value.$each : [value];
    record[key] ??= [];
    record[key].push(...structuredClone(values));
    if (value?.$slice < 0) record[key] = record[key].slice(value.$slice);
    else if (Number.isInteger(value?.$slice)) record[key] = record[key].slice(0, value.$slice);
  }
  for (const [key, condition] of Object.entries(update.$pull ?? {})) {
    record[key] = (record[key] ?? []).filter((entry) => !matches(entry, condition));
  }
}

function query(getValue) {
  let skip = 0; let limit = Infinity; let sort;
  return {
    maxTimeMS() { return this; },
    select() { return this; },
    sort(value) { sort = value; return this; },
    skip(value) { skip = value; return this; },
    limit(value) { limit = value; return this; },
    async lean() {
      let data = await getValue();
      if (Array.isArray(data)) {
        if (sort) data.sort((a, b) => {
          for (const [key, direction] of Object.entries(sort)) {
            if (a[key] < b[key]) return -direction;
            if (a[key] > b[key]) return direction;
          }
          return 0;
        });
        data = data.slice(skip, skip + limit);
      }
      return structuredClone(data);
    },
  };
}

export async function startRoomFixture({ imageStorage } = {}) {
  const rooms = new Map();
  const categories = new Map();
  const items = new Map();
  const settings = {
    singletonKey: 'primary',
    hotelName: 'Manglam Hotel & Restaurant',
    phoneNumbers: ['+91 7568647755', '+91 9828809155'],
    instagramUrl: 'https://www.instagram.com/thehouseofmanglam/',
    address: 'XHMX+X8, Jaipur Phalodi Express Way, Kalwar Rd, Radha Krishna Enclave Scheme, Kalwad, Rajasthan 303706',
    googleMapsUrl: 'https://www.google.com/maps/place/MANGLAM+HOTEL+%26+RESTAURANT/',
    revision: 0,
  };
  // Exercise the installed Mongoose query implementation, including pipeline
  // opt-in, filter casting and timestamps. Only its collection boundary is fake;
  // this isolated instance never opens a connection or loads credentials.
  const pipelineRoom = new mongoose.Mongoose().model('Room', Room.schema.clone());
  const reservationWrites = [];
  const storageState = {
    activeUploads: 0,
    maxConcurrentUploads: 0,
    uploads: [],
    uploadPaths: [],
    deletions: [],
    delayMs: 0,
    failUpload: false,
    failDelete: false,
    onUploadStart: null,
  };
  const testImageStorage = imageStorage || {
    ensureConfigured() {},
    async upload({ fileName, filePath, roomId, menuItemId, signal }) {
      storageState.activeUploads += 1;
      storageState.maxConcurrentUploads = Math.max(storageState.maxConcurrentUploads, storageState.activeUploads);
      storageState.uploadPaths.push(filePath);
      storageState.onUploadStart?.({ signal, directory: dirname(filePath) });
      try {
        if (storageState.delayMs) {
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(resolve, storageState.delayMs);
            signal?.addEventListener('abort', () => {
              clearTimeout(timeout);
              reject(signal.reason || new DOMException('Upload aborted.', 'AbortError'));
            }, { once: true });
          });
        }
        if (storageState.failUpload) throw new Error('Simulated ImageKit failure.');
        if (state.disconnectDuringUpload) {
          state.ready = false;
          state.failure = Object.assign(new Error('Simulated MongoDB network outage.'), {
            name: 'MongoNetworkError',
            code: 'ECONNRESET',
          });
        }
        const folder = menuItemId ? `/manglam-hotel/restaurant/${menuItemId}` : `/manglam-hotel/rooms/${roomId}`;
        const uploaded = {
          fileId: `fixture-file-${storageState.uploads.length + 1}`,
          url: `https://ik.imagekit.io/fixture${folder}/${fileName}`,
          filePath: `${folder}/${fileName}`,
        };
        storageState.uploads.push(uploaded);
        return uploaded;
      } finally {
        storageState.activeUploads -= 1;
      }
    },
    async delete(fileId) {
      storageState.deletions.push(fileId);
      if (storageState.failDelete) throw new Error('Simulated ImageKit deletion failure.');
    },
    async isAlreadyDeleted(error) { return error?.status === 404; },
  };
  const token = createOpaqueToken();
  const csrf = createOpaqueToken();
  const now = Date.now();
  const admin = { _id: 'fixture-admin', email: 'admin@example.com', name: 'Fixture Administrator', isActive: true };
  const session = {
    _id: 'fixture-session', adminId: admin._id, tokenHash: hashSessionToken(token), csrfTokenHash: hashSessionToken(csrf),
    createdAt: new Date(now), lastActivityAt: new Date(now),
    idleExpiresAt: new Date(now + 86400000), absoluteExpiresAt: new Date(now + 604800000), expiresAt: new Date(now + 86400000),
  };
  const state = { ready: true, failure: null, sessionActive: true, imagePersistenceFailure: false };
  const check = () => { if (state.failure) throw state.failure; };
  function menuModel(Model, records) {
    const checkMenu = () => { check(); if (state.menuFailure) throw state.menuFailure; };
    const validate = async (values) => {
      const document = new Model(values);
      await document.validate();
      const record = document.toObject();
      record._id = String(record._id);
      if (record.category) record.category = String(record.category);
      if (record.categories) record.categories = record.categories.map(String);
      return record;
    };
    const unique = (record) => {
      if (Model !== MenuCategory) return;
      for (const key of ['slug', 'nameKey']) {
        if (record[key] === undefined) continue;
        if ([...records.values()].some((existing) => existing._id !== record._id && existing[key] === record[key])) {
          throw Object.assign(new Error('Fixture duplicate key'), { code: 11000, keyPattern: { [key]: 1 } });
        }
      }
    };
    return {
      find: (filter) => query(() => { checkMenu(); return [...records.values()].filter((record) => matches(record, filter)); }),
      findOne: (filter) => query(() => { checkMenu(); return [...records.values()].find((record) => matches(record, filter)) ?? null; }),
      countDocuments: (filter) => { const result = Promise.resolve().then(() => { checkMenu(); return [...records.values()].filter((record) => matches(record, filter)).length; }); result.maxTimeMS = () => result; return result; },
      create: async (values) => {
        checkMenu();
        const record = await validate({ ...values, createdAt: new Date(), updatedAt: new Date() });
        unique(record); records.set(record._id, record); return structuredClone(record);
      },
      updateOne: async (filter, update) => {
        checkMenu();
        const current = [...records.values()].find((record) => matches(record, filter));
        if (!current) return { matchedCount: 0, modifiedCount: 0 };
        applyUpdate(current, update);
        return { matchedCount: 1, modifiedCount: 1 };
      },
      findOneAndUpdate: (filter, update, options) => query(async () => {
        checkMenu();
        if (!options.runValidators || options.returnDocument !== 'after') throw new Error('Required update options missing.');
        const current = [...records.values()].find((record) => matches(record, filter));
        if (!current) return null;
        const imageFailure = update.$inc?.imageVersion ? state.menuImageWriteFailure : null;
        if (imageFailure) state.menuImageWriteFailure = null;
        const writeError = () => Object.assign(new Error('Simulated menu photo persistence failure.'), { name: 'MongoNetworkError' });
        if (imageFailure === 'before') throw writeError();
        const next = structuredClone(current);
        applyUpdate(next, update); next.updatedAt = new Date();
        await validate(next);
        // Simulate the database's atomic compare-and-set after asynchronous validation.
        if (!matches(records.get(current._id), filter)) return null;
        unique(next); records.set(next._id, next);
        if (imageFailure === 'after') throw writeError();
        return next;
      }),
    };
  }
  pipelineRoom.collection.updateOne = async (filter, update) => {
    check();
    reservationWrites.push({ filter, update });
    const failure = state.reservationFailure;
    state.reservationFailure = null;
    const writeError = () => Object.assign(new Error('Simulated reservation write failure.'), { name: 'MongoNetworkError' });
    if (failure === 'before') throw writeError();
    const record = [...rooms.values()].find((room) => matches(room, filter));
    if (!record) return { matchedCount: 0, modifiedCount: 0 };
    applyUpdate(record, update);
    for (const stage of update.slice(1)) applyUpdate(record, stage);
    if (failure === 'after') throw writeError();
    return { matchedCount: 1, modifiedCount: 1 };
  };
  const models = {
    Admin: { findById: () => query(() => admin) },
    AdminSession: {
      findOne: (filter) => query(() => state.sessionActive && matches(session, filter) ? session : null),
      updateOne: async (filter, update) => { if (!state.sessionActive || !matches(session, filter)) return { matchedCount: 0 }; Object.assign(session, update.$set); return { matchedCount: 1 }; },
      deleteOne: async () => { state.sessionActive = false; return { deletedCount: 1 }; },
    },
    Room: {
      find: (filter) => query(() => { check(); return [...rooms.values()].filter((room) => matches(room, filter)); }),
      findOne: (filter) => query(() => { check(); return [...rooms.values()].find((room) => matches(room, filter)) ?? null; }),
      countDocuments: async (filter) => { check(); return [...rooms.values()].filter((room) => matches(room, filter)).length; },
      create: async (values) => {
        check();
        const record = new Room({ ...values, _id: randomBytes(12).toString('hex'), createdAt: new Date(), updatedAt: new Date() });
        await record.validate();
        const plain = record.toObject(); plain._id = String(plain._id);
        rooms.set(plain._id, plain);
        return structuredClone(plain);
      },
      updateOne: async (filter, update, options) => {
        if (Array.isArray(update)) return pipelineRoom.updateOne(filter, update, options).exec();
        check();
        const record = [...rooms.values()].find((room) => matches(room, filter));
        if (!record) return { matchedCount: 0, modifiedCount: 0 };
        applyUpdate(record, update);
        rooms.set(record._id, record);
        return { matchedCount: 1, modifiedCount: 1 };
      },
      findOneAndUpdate: (filter, update, options) => query(async () => {
        check();
        if (!options.runValidators || options.returnDocument !== 'after') throw new Error('Update validators and returnDocument: after must be enabled.');
        if (state.imagePersistenceFailure && update.$push?.images) {
          state.imagePersistenceFailure = false;
          throw Object.assign(new Error('Simulated room image persistence failure.'), {
            name: 'MongoServerError',
            code: 91,
          });
        }
        const record = [...rooms.values()].find((room) => matches(room, filter));
        if (!record) return null;
        const next = structuredClone(record);
        applyUpdate(next, update);
        next.updatedAt = new Date();
        await new Room(next).validate();
        rooms.set(record._id, next);
        return next;
      }),
    },
    MenuCategory: menuModel(MenuCategory, categories),
    MenuItem: menuModel(MenuItem, items),
    SiteSettings: {
      findOne: (filter) => query(() => {
        check();
        return matches(settings, filter) ? settings : null;
      }),
      findOneAndUpdate: (filter, update, options) => query(async () => {
        check();
        if (!options.runValidators || options.returnDocument !== 'after') {
          throw new Error('Settings updates must validate and return the updated document.');
        }
        if (!matches(settings, filter)) return null;
        const next = { ...settings, ...structuredClone(update.$set), updatedAt: new Date() };
        await new SiteSettings(next).validate();
        if (!matches(settings, filter)) return null;
        Object.assign(settings, next);
        return settings;
      }),
    },
  };
  const server = createApp({ models, isDatabaseReady: () => state.ready, imageStorage: testImageStorage, adminConfig: { allowedOrigins: [fixtureOrigin], production: false } }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  return {
    rooms, categories, items, settings, models, state, admin, session, token, csrf, imageStorage: testImageStorage, storageState, reservationWrites,
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}
