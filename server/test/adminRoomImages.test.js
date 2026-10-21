import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { access } from 'node:fs/promises';
import { fixtureOrigin, startRoomFixture } from '../../tests/fixtures/roomServer.js';
import { processPendingImageCleanup } from '../src/routes/adminRoomImages.js';
import Room from '../src/models/Room.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nmFQAAAAASUVORK5CYII=', 'base64');
const jpeg = Buffer.from([
  0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
  0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x00, 0xff, 0xd9,
]);
const webp = Buffer.alloc(30);
webp.write('RIFF', 0, 'ascii'); webp.writeUInt32LE(22, 4); webp.write('WEBP', 8, 'ascii');
webp.write('VP8X', 12, 'ascii'); webp.writeUInt32LE(10, 16);
let fixture;
beforeEach(async () => { fixture = await startRoomFixture(); });
afterEach(async () => { await fixture.close(); });

async function request(path, method = 'GET', body) {
  return fetch(`${fixture.url}/api/admin/rooms${path}`, {
    method,
    headers: {
      Cookie: `manglam_admin_session=${fixture.token}; manglam_admin_csrf=${fixture.csrf}`,
      Origin: fixtureOrigin,
      'X-CSRF-Token': fixture.csrf,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function uploadRequest(roomId, files, { headers = {}, query = '', uploadId = randomUUID() } = {}) {
  const form = new FormData();
  form.append('uploadId', uploadId);
  for (const { data = png, type = 'image/png', name = 'room.png', alt = '' } of files) {
    form.append('images', new Blob([data], { type }), name);
    form.append('altTexts', alt);
  }
  return fetch(`${fixture.url}/api/admin/rooms/${roomId}/images${query}`, {
    method: 'POST',
    headers: {
      Cookie: `manglam_admin_session=${fixture.token}; manglam_admin_csrf=${fixture.csrf}`,
      Origin: fixtureOrigin,
      'X-CSRF-Token': fixture.csrf,
      ...headers,
    },
    body: form,
  });
}

async function createRoom() {
  const response = await request('', 'POST', { name: 'Image test room' });
  assert.equal(response.status, 201);
  return (await response.json()).data;
}

test('installed Mongoose rejects pipeline updates without explicit opt-in before reaching persistence', async () => {
  const room = await createRoom();
  await assert.rejects(
    fixture.models.Room.updateOne({ _id: room.id }, [{ $set: { pendingImageReservations: [] } }]),
    /Cannot pass an array to query updates unless the `updatePipeline` option is set/,
  );
  assert.equal(fixture.reservationWrites.length, 0);
  assert.deepEqual(fixture.rooms.get(room.id).pendingImageReservations, []);
});

test('real Mongoose reservation query keeps typed schema-safe values and only writes reservation state', async () => {
  const room = await createRoom();
  // A legacy record can lack the reservation array entirely.
  delete fixture.rooms.get(room.id).pendingImageReservations;
  let reservedRoom;
  fixture.storageState.onUploadStart = () => { reservedRoom = structuredClone(fixture.rooms.get(room.id)); };
  const uploadId = randomUUID();
  assert.equal((await uploadRequest(room.id, [{}, {}], { uploadId })).status, 201);
  const [reservation] = reservedRoom.pendingImageReservations;
  assert.deepEqual(Object.keys(reservation).sort(), ['count', 'expiresAt', 'reservationId', 'startOrder', 'uploadId']);
  assert.match(reservation.reservationId, /^[0-9a-f-]{36}$/);
  assert.equal(reservation.uploadId, uploadId);
  assert.equal(reservation.count, 2);
  assert.equal(reservation.startOrder, 0);
  assert.ok(reservation.expiresAt instanceof Date);
  assert.ok(reservation.expiresAt > new Date());
  await new Room(reservedRoom).validate();
  const [{ filter, update }] = fixture.reservationWrites;
  assert.equal(filter._id.constructor.name, 'ObjectId');
  assert.ok(filter.$expr);
  assert.deepEqual(filter.isArchived, { $ne: true });
  assert.deepEqual(Object.keys(update[0].$set), ['pendingImageReservations']);
  // Mongoose adds a typed timestamp stage, but never casts the reservation data.
  assert.ok(update[1].$set.updatedAt instanceof Date);
  assert.equal(fixture.rooms.get(room.id).images.length, 2);
  assert.deepEqual(fixture.rooms.get(room.id).pendingImageReservations, []);
});

test('reservation write failures before or after persistence release only their own reservation', async () => {
  const room = await createRoom();
  assert.equal((await uploadRequest(room.id, [{}])).status, 201);
  const originalImages = structuredClone(fixture.rooms.get(room.id).images);
  const otherReservation = {
    reservationId: randomUUID(), uploadId: randomUUID(), count: 1,
    startOrder: 1, expiresAt: new Date(Date.now() + 60_000),
  };
  fixture.rooms.get(room.id).pendingImageReservations.push(otherReservation);
  for (const failure of ['before', 'after']) {
    fixture.state.reservationFailure = failure;
    assert.equal((await uploadRequest(room.id, [{}])).status, 503);
    assert.deepEqual(fixture.rooms.get(room.id).images, originalImages);
    assert.deepEqual(fixture.rooms.get(room.id).pendingImageReservations, [otherReservation]);
    assert.equal(fixture.storageState.uploads.length, 1);
    assert.deepEqual(fixture.storageState.deletions, []);
  }
  assert.equal((await uploadRequest(room.id, [{}])).status, 201);
  assert.deepEqual(fixture.rooms.get(room.id).pendingImageReservations, [otherReservation]);
});

test('concurrent successful reservations preserve order, five-image capacity and retry idempotency', async () => {
  const room = await createRoom();
  fixture.storageState.delayMs = 50;
  const uploadId = randomUUID();
  const responses = await Promise.all([
    uploadRequest(room.id, [{}, {}], { uploadId }),
    uploadRequest(room.id, [{}, {}, {}]),
  ]);
  assert.deepEqual(responses.map(({ status }) => status), [201, 201]);
  const stored = fixture.rooms.get(room.id);
  assert.deepEqual(stored.images.map(({ displayOrder }) => displayOrder).sort(), [0, 1, 2, 3, 4]);
  assert.equal(new Set(stored.images.map(({ fileId }) => fileId)).size, 5);
  assert.deepEqual(stored.pendingImageReservations, []);
  await new Room(stored).validate();
  assert.equal((await uploadRequest(room.id, [{}, {}], { uploadId })).status, 200);
  assert.equal((await uploadRequest(room.id, [{}])).status, 409);
  assert.equal(fixture.storageState.uploads.length, 5);
  assert.equal(stored.images.length, 5);
});

test('concurrent requests using the same upload ID persist metadata only once', async () => {
  const room = await createRoom();
  fixture.storageState.delayMs = 50;
  const uploadId = randomUUID();
  const responses = await Promise.all([
    uploadRequest(room.id, [{}], { uploadId }),
    uploadRequest(room.id, [{}], { uploadId }),
  ]);
  assert.deepEqual(responses.map(({ status }) => status).sort(), [201, 409]);
  assert.equal(fixture.rooms.get(room.id).images.length, 1);
  assert.equal(fixture.rooms.get(room.id).completedImageUploads.length, 1);
  assert.deepEqual(fixture.rooms.get(room.id).pendingImageReservations, []);
  assert.equal(fixture.storageState.uploads.length, 1);
});

test('room image routes enforce active admin, CSRF, origin, and strict query validation', async () => {
  const room = await createRoom();
  assert.equal((await request(`/${room.id}/images`, 'GET', undefined)).status, 200);
  const unauthorized = await fetch(`${fixture.url}/api/admin/rooms/${room.id}/images`, { method: 'GET' });
  assert.equal(unauthorized.status, 401);
  assert.equal((await uploadRequest(room.id, [{}], { headers: { Cookie: '' } })).status, 401);
  assert.equal((await uploadRequest(room.id, [{ }], { headers: { 'X-CSRF-Token': '' } })).status, 403);
  assert.equal((await uploadRequest(room.id, [{ }], { headers: { Origin: 'https://untrusted.example' } })).status, 403);
  assert.equal((await request(`/${room.id}/images?unexpected=1`)).status, 400);
  assert.equal((await uploadRequest('invalid', [{}])).status, 400);
  assert.equal((await request(`/${room.id}/images/fixture-file-1`, 'DELETE', {})).status, 400);
  fixture.state.ready = false;
  assert.equal((await request(`/${room.id}/images`)).status, 503);
  fixture.state.ready = true;
  fixture.admin.isActive = false;
  assert.equal((await request(`/${room.id}/images`)).status, 401);
});

test('uploads validate MIME, file signatures, empty and oversized images', async () => {
  const room = await createRoom();
  assert.equal((await uploadRequest(room.id, [{ data: Buffer.from('not an image'), type: 'image/png' }])).status, 415);
  assert.equal((await uploadRequest(room.id, [{ data: png, type: 'image/gif' }])).status, 415);
  assert.equal((await uploadRequest(room.id, [{ data: Buffer.alloc(0) }])).status, 400);
  const oversized = Buffer.concat([png, Buffer.alloc(5 * 1024 * 1024)]);
  assert.equal((await uploadRequest(room.id, [{ data: oversized }])).status, 413);
  assert.equal(fixture.rooms.get(room.id).images.length, 0);
});

test('JPEG, PNG, and WebP signatures are accepted only when their file structures are valid', async () => {
  const room = await createRoom();
  for (const [data, type, name] of [[jpeg, 'image/jpeg', 'room.jpg'], [png, 'image/png', 'room.png'], [webp, 'image/webp', 'room.webp']]) {
    const response = await uploadRequest(room.id, [{ data, type, name }]);
    assert.equal(response.status, 201);
  }
  const invalid = await uploadRequest(room.id, [{ data: Buffer.from([0xff, 0xd8, 0xff]), type: 'image/jpeg' }]);
  assert.equal(invalid.status, 415);
  assert.equal(fixture.rooms.get(room.id).images.length, 3);
});

test('five-photo limit holds and legacy image metadata is preserved without destructive migration', async () => {
  const room = await createRoom();
  const full = await uploadRequest(room.id, Array(5).fill({}));
  assert.equal(full.status, 201);
  assert.equal(fixture.rooms.get(room.id).images.length, 5);
  assert.equal((await uploadRequest(room.id, [{}])).status, 409);

  const legacyRoom = await createRoom();
  const legacy = { url: 'https://example.test/legacy.jpg', publicId: 'legacy-public-id', alt: 'Existing photo' };
  fixture.rooms.get(legacyRoom.id).images.push(legacy);
  const uploaded = await uploadRequest(legacyRoom.id, [{}]);
  assert.equal(uploaded.status, 201);
  assert.equal(fixture.rooms.get(legacyRoom.id).images.length, 2);
  assert.equal(fixture.rooms.get(legacyRoom.id).images[0].publicId, 'legacy-public-id');
  const images = (await (await request(`/${legacyRoom.id}/images`)).json()).data.images;
  assert.equal(images[0].fileId, null);
  assert.equal((await request(`/${legacyRoom.id}/images/${images[0].id}`, 'DELETE', {})).status, 409);
});

test('expired capacity reservations are ignored and replaced on retry', async () => {
  const room = await createRoom();
  const uploadId = randomUUID();
  fixture.rooms.get(room.id).pendingImageReservations = [{
    reservationId: randomUUID(),
    uploadId,
    count: 1,
    startOrder: 0,
    expiresAt: new Date(Date.now() - 1000),
  }];
  const response = await uploadRequest(room.id, [{}], { uploadId });
  assert.equal(response.status, 201);
  assert.equal(fixture.rooms.get(room.id).images.length, 1);
  assert.equal(fixture.rooms.get(room.id).pendingImageReservations.length, 0);
});

test('uploads store ImageKit metadata, order images, select a main image, and expose optimized public photos', async () => {
  const room = await createRoom();
  const uploaded = await uploadRequest(room.id, [
    { name: 'first.png', alt: 'Verified first view' },
    { name: 'second.png', alt: 'Verified second view' },
  ]);
  assert.equal(uploaded.status, 201);
  const images = (await uploaded.json()).data.images;
  assert.equal(images.length, 2);
  assert.equal(images[0].isMain, true);
  assert.equal(images[1].isMain, false);
  assert.equal(images[0].alt, 'Verified first view');
  assert.match(images[0].filePath, new RegExp(`/manglam-hotel/rooms/${room.id}/`));
  assert.ok(images.every((image) => image.fileId && image.url.startsWith('https://ik.imagekit.io/')));
  assert.equal(fixture.rooms.get(room.id).pendingImageReservations.length, 0);
  const retry = await uploadRequest(room.id, [{ name: 'first.png', alt: 'Verified first view' }, { name: 'second.png', alt: 'Verified second view' }], {
    uploadId: fixture.rooms.get(room.id).completedImageUploads[0].uploadId,
  });
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).data.alreadyCompleted, true);
  assert.equal(fixture.storageState.uploads.length, 2);

  const selected = await request(`/${room.id}/images/${images[1].id}/main`, 'PATCH', {});
  assert.equal(selected.status, 200);
  assert.equal((await selected.json()).data.images[0].id, images[1].id);

  await request(`/${room.id}`, 'PATCH', { isPublished: true });
  const publicResponse = await fetch(`${fixture.url}/api/rooms/${room.id}`);
  const publicRoom = (await publicResponse.json()).data;
  assert.deepEqual(publicRoom.images.map(({ alt }) => alt), ['Verified second view', 'Verified first view']);
  assert.match(publicRoom.images[0].src, /tr:w-800,q-80,f-auto/);
  assert.match(publicRoom.images[0].srcSet, /480w/);
});

test('room image capacity reservations prevent concurrent overfill and upload concurrency stays bounded', async () => {
  const room = await createRoom();
  fixture.storageState.delayMs = 60;
  const concurrent = await Promise.all([
    uploadRequest(room.id, Array(3).fill({})),
    uploadRequest(room.id, Array(3).fill({})),
  ]);
  assert.deepEqual(concurrent.map(({ status }) => status).sort(), [201, 409]);
  assert.equal(fixture.rooms.get(room.id).images.length, 3);

  const otherRooms = [await createRoom(), await createRoom(), await createRoom()];
  const results = await Promise.all(otherRooms.map(({ id }) => uploadRequest(id, [{}])));
  assert.equal(results.filter(({ status }) => status === 429).length, 1);
  assert.ok(fixture.storageState.maxConcurrentUploads <= 2);
});

test('failed ImageKit or MongoDB persistence cleans up uploaded assets without changing existing photos', async () => {
  const room = await createRoom();
  const first = await uploadRequest(room.id, [{}]);
  assert.equal(first.status, 201);
  const originalImage = fixture.rooms.get(room.id).images[0];
  fixture.storageState.failUpload = true;
  const imageKitFailure = await uploadRequest(room.id, [{}]);
  assert.equal(imageKitFailure.status, 502);
  assert.deepEqual(fixture.rooms.get(room.id).pendingImageReservations, []);
  assert.ok(imageKitFailure.headers.get('x-request-id'));
  fixture.storageState.failUpload = false;
  fixture.state.imagePersistenceFailure = true;
  assert.equal((await uploadRequest(room.id, [{}])).status, 503);
  assert.deepEqual(fixture.rooms.get(room.id).pendingImageReservations, []);
  assert.deepEqual(fixture.rooms.get(room.id).images, [originalImage]);
  assert.deepEqual(fixture.storageState.deletions, ['fixture-file-2']);
  fixture.storageState.failDelete = true;
  fixture.state.imagePersistenceFailure = true;
  assert.equal((await uploadRequest(room.id, [{}])).status, 503);
  assert.equal(fixture.rooms.get(room.id).pendingImageCleanup.length, 1);
  fixture.storageState.failDelete = false;
  await processPendingImageCleanup({ models: fixture.models, imageStorage: fixture.imageStorage });
  assert.equal(fixture.rooms.get(room.id).pendingImageCleanup.length, 0);
});

test('a MongoDB disconnect after ImageKit upload keeps assets for recovery and expires its reservation', async () => {
  const room = await createRoom();
  fixture.state.disconnectDuringUpload = true;
  const response = await uploadRequest(room.id, [{}]);
  assert.equal(response.status, 503);
  assert.match((await response.json()).error.message, /could not be confirmed/);
  assert.equal(fixture.storageState.uploads.length, 1);
  assert.deepEqual(fixture.storageState.deletions, []);
  assert.equal(fixture.rooms.get(room.id).images.length, 0);
  assert.equal(fixture.rooms.get(room.id).pendingImageReservations.length, 1);

  fixture.state.ready = true;
  fixture.state.failure = null;
  fixture.state.disconnectDuringUpload = false;
  fixture.rooms.get(room.id).pendingImageReservations[0].expiresAt = new Date(Date.now() - 1);
  const retried = await uploadRequest(room.id, [{}], {
    uploadId: fixture.rooms.get(room.id).pendingImageReservations[0].uploadId,
  });
  assert.equal(retried.status, 201);
  assert.equal(fixture.rooms.get(room.id).pendingImageReservations.length, 0);
  assert.equal(fixture.rooms.get(room.id).images.length, 1);
  assert.equal(fixture.storageState.uploads.length, 2);
});

test('client interruption aborts the ImageKit request and removes temporary upload files', async () => {
  const room = await createRoom();
  let uploadStarted;
  const started = new Promise((resolve) => { uploadStarted = resolve; });
  let uploadSignal;
  let temporaryDirectory;
  fixture.storageState.delayMs = 10_000;
  fixture.storageState.onUploadStart = ({ signal, directory }) => {
    uploadSignal = signal;
    temporaryDirectory = directory;
    uploadStarted();
  };

  const form = new FormData();
  form.append('uploadId', randomUUID());
  form.append('images', new Blob([png], { type: 'image/png' }), 'room.png');
  const controller = new AbortController();
  const pendingRequest = fetch(`${fixture.url}/api/admin/rooms/${room.id}/images`, {
    method: 'POST',
    headers: {
      Cookie: `manglam_admin_session=${fixture.token}; manglam_admin_csrf=${fixture.csrf}`,
      Origin: fixtureOrigin,
      'X-CSRF-Token': fixture.csrf,
    },
    body: form,
    signal: controller.signal,
  });
  await started;
  controller.abort();
  await assert.rejects(pendingRequest, { name: 'AbortError' });
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(uploadSignal.aborted, true);
  assert.equal(fixture.rooms.values().next().value.pendingImageReservations.length, 0);
  await assert.rejects(access(temporaryDirectory), { code: 'ENOENT' });
  assert.equal(fixture.storageState.uploads.length, 0);
});

test('database failures include a correlated request ID and sanitized diagnostics', async () => {
  const room = await createRoom();
  fixture.state.failure = Object.assign(
    new Error('Connection failed: mongodb+srv://user:private@cluster.example/db IMAGEKIT_PRIVATE_KEY=private-key-value'),
    { name: 'MongoNetworkError', code: 'ECONNRESET' },
  );
  let diagnostic = '';
  const originalError = console.error;
  console.error = (line) => { diagnostic += line; };
  try {
    const response = await request(`/${room.id}/images`);
    assert.equal(response.status, 503);
    const requestId = response.headers.get('x-request-id');
    assert.match(requestId, /^[0-9a-f-]{36}$/i);
    assert.ok(diagnostic.includes(requestId));
    assert.ok(diagnostic.includes('"category":"mongodb"'));
    assert.ok(diagnostic.includes('ECONNRESET'));
    assert.ok(!diagnostic.includes('private-key-value'));
    assert.ok(!diagnostic.includes('user:private@'));
  } finally {
    console.error = originalError;
  }
});

test('deletion removes only the owned ImageKit asset and durably retries cleanup failures', async () => {
  const room = await createRoom();
  const uploaded = await uploadRequest(room.id, [{}]);
  const [image] = (await uploaded.json()).data.images;
  fixture.storageState.failDelete = true;
  const deleted = await request(`/${room.id}/images/${image.id}`, 'DELETE', {});
  assert.equal(deleted.status, 200);
  assert.equal((await deleted.json()).data.cleanupPending, true);
  assert.equal(fixture.rooms.get(room.id).images.length, 0);
  assert.equal(fixture.rooms.get(room.id).pendingImageCleanup.length, 1);
  assert.deepEqual(fixture.storageState.deletions, [image.fileId]);

  fixture.storageState.failDelete = false;
  await processPendingImageCleanup({ models: fixture.models, imageStorage: fixture.imageStorage });
  assert.equal(fixture.rooms.get(room.id).pendingImageCleanup.length, 0);
  assert.deepEqual(fixture.storageState.deletions, [image.fileId, image.fileId]);
});

test('archived rooms reject upload, delete, and main-photo mutations', async () => {
  const room = await createRoom();
  const uploaded = await uploadRequest(room.id, [{}]);
  const [image] = (await uploaded.json()).data.images;
  await request(`/${room.id}`, 'DELETE', {});
  assert.equal((await uploadRequest(room.id, [{}])).status, 409);
  assert.equal((await request(`/${room.id}/images/${image.id}/main`, 'PATCH', {})).status, 409);
  assert.equal((await request(`/${room.id}/images/${image.id}`, 'DELETE', {})).status, 409);
});
