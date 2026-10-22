import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { createAdminProtection } from '../security/adminAuth.js';
import { HttpError, parsePagination, sendPaginated } from '../utils/http.js';

import { MAX_MENU_CATEGORIES, menuCategoryIds, normalizeMenuTags } from '../../../shared/menu.js';
import { imageKitStorage } from '../services/imageKitStorage.js';
import { menuTransaction, lockMenuCategories } from '../services/menuTransactions.js';
import { queueMenuCleanupJob, processMenuImageCleanup } from '../services/menuImageCleanup.js';
import { logDiagnosticError } from '../utils/diagnostics.js';
import { menuCategoryFilter, menuSearchFilter } from '../utils/menu.js';

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const validId = (value) => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
const categoryFields = ['name', 'description', 'displayOrder', 'isPublished'];
const itemFields = [...categoryFields, 'category', 'categories', 'tags', 'price', 'isAvailable'];

function assertBody(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some((key) => !allowed.includes(key))) {
    throw new HttpError(400, 'Request contains unsupported fields or an invalid body.');
  }
}

export function validateMenuBody(body, kind, creating = false) {
  const item = kind === 'items';
  assertBody(body, item ? itemFields : categoryFields);
  if (!creating && !Object.keys(body).length) throw new HttpError(400, 'Provide at least one field.');
  const values = {};
  for (const [field, max] of [['name', item ? 150 : 100], ['description', item ? 3000 : 1000]]) {
    if (!(creating && field === 'name') && !Object.hasOwn(body, field)) continue;
    if (typeof body[field] !== 'string') throw new HttpError(400, `${field} must be text.`);
    const value = field === 'name' ? body[field].normalize('NFKC').trim().replace(/\s+/g, ' ') : body[field].trim();
    if (value.length > max || (field === 'name' && !value)) throw new HttpError(400, `${field} must contain ${field === 'name' ? '1 to' : 'at most'} ${max} characters.`);
    values[field] = value;
  }
  if (Object.hasOwn(body, 'displayOrder')) {
    if (!Number.isInteger(body.displayOrder) || body.displayOrder < 0 || body.displayOrder > 100000) throw new HttpError(400, 'Display order must be an integer from 0 to 100000.');
    values.displayOrder = body.displayOrder;
  }
  for (const field of ['isPublished', ...(item ? ['isAvailable'] : [])]) {
    if (!Object.hasOwn(body, field)) continue;
    if (typeof body[field] !== 'boolean') throw new HttpError(400, `${field} must be true or false.`);
    if (creating && field === 'isPublished' && !body[field]) throw new HttpError(400, 'New records are published when added. Use Unpublish afterward to hide a record.');
    values[field] = body[field];
  }
  if (item) {
    if (creating || Object.hasOwn(body, 'categories') || Object.hasOwn(body, 'category')) {
      if (Object.hasOwn(body, 'categories') && Object.hasOwn(body, 'category')) throw new HttpError(400, 'Send categories only, not both category fields.');
      const ids = Object.hasOwn(body, 'categories') ? body.categories : [body.category];
      if (!Array.isArray(ids) || !ids.length || ids.length > MAX_MENU_CATEGORIES || !ids.every(validId)) throw new HttpError(400, 'Select 1 to 50 valid categories.');
      values.categories = [...new Set(ids.map((id) => id.toLowerCase()))];
      values.category = values.categories[0]; // Deprecated single-category compatibility bridge.
    }
    if (Object.hasOwn(body, 'tags')) {
      try { values.tags = normalizeMenuTags(body.tags); }
      catch (error) { throw new HttpError(400, error.message); }
    }
    if (Object.hasOwn(body, 'price')) {
      const price = body.price;
      if (price === null || price === '') values.price = null;
      else if (typeof price !== 'number' || !Number.isFinite(price) || price < 0 || price > 10000000
        || Math.abs(price * 100 - Math.round(price * 100)) > 0.000001) {
        throw new HttpError(400, 'Price must be a non-negative INR amount up to 10000000 with at most two decimal places.');
      } else values.price = Math.round(price * 100) / 100;
    }
  }
  return values;
}

function serialize(record, item) {
  const base = {
    id: String(record._id), name: record.name, description: record.description ?? '',
    displayOrder: record.displayOrder ?? 0, isPublished: record.isPublished === true,
    isArchived: record.isArchived === true, createdAt: record.createdAt, updatedAt: record.updatedAt,
  };
  return item ? { ...base, categories: menuCategoryIds(record), category: menuCategoryIds(record)[0], tags: record.tags ?? [], price: record.price ?? null,
    isAvailable: record.isAvailable !== false,
    image: record.image ? { src: record.image.url, alt: record.image.alt || '' } : null,
  } : { ...base, slug: record.slug };
}

function toUpdate(values) {
  const $set = { ...values };
  const $unset = {};
  for (const field of ['price']) if ($set[field] === null) { delete $set[field]; $unset[field] = 1; }
  return { $set, ...(Object.keys($unset).length ? { $unset } : {}) };
}

export function createAdminMenuRouter(options) {
  const { MenuCategory, MenuItem } = options.models;
  const router = Router();
  router.use(...createAdminProtection(options));

  async function categoryName(values, id) {
    if (values.name === undefined) return;
    values.nameKey = values.name.toLowerCase();
    // Also check legacy categories without a nameKey, including archived names.
    const duplicate = await MenuCategory.findOne({
      ...(id ? { _id: { $ne: id } } : {}),
      $or: [{ nameKey: values.nameKey }, { name: { $regex: `^\\s*${values.name.split(' ').map(escapeRegex).join('\\s+')}\\s*$`, $options: 'i' } }],
    }).lean();
    if (duplicate) throw new HttpError(409, 'A category with this name already exists, possibly in the archive.');
  }
  async function createCategory(values) {
    const base = values.name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100).replace(/-$/g, '') || 'category';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const slug = attempt === 0 ? base : `${base}-${randomBytes(6).toString('hex')}`;
      try { return await MenuCategory.create({ ...values, slug, isPublished: true, isArchived: false }); }
      catch (error) {
        if (error.code !== 11000) throw error;
        if (error.keyPattern?.slug || error.keyValue?.slug) continue;
        throw new HttpError(409, 'A category with this name already exists.');
      }
    }
    throw new HttpError(409, 'Could not allocate a category slug. Please retry.');
  }

  for (const kind of ['categories', 'items']) {
    const item = kind === 'items';
    const Model = item ? MenuItem : MenuCategory;
    const label = item ? 'Menu item' : 'Category';
    const routes = Router();
    routes.param('id', (_request, _response, next, id) => next(validId(id) ? undefined : new HttpError(400, `${label} ID is invalid.`)));
    const get = async (id, session = null) => {
      const record = await Model.findOne({ _id: id }).session(session).lean();
      if (!record) throw new HttpError(404, `${label} not found.`);
      return record;
    };
    const update = async (id, filter, change, session = null) => {
      try {
        const record = await Model.findOneAndUpdate({ _id: id, ...filter }, change, { returnDocument: 'after', runValidators: true, session }).lean();
        if (record) return record;
      } catch (error) {
        if (error.code === 11000) throw new HttpError(409, 'A category with this name already exists.');
        throw error;
      }
      await get(id, session);
      throw new HttpError(409, 'Record status changed. Restore archived records before editing or publishing; only archived records can be restored.');
    };
    routes.get('/', async (request, response) => {
      const { search = '', status = 'active', publication = 'all', ...rest } = request.query;
      if (typeof search !== 'string' || search.length > 150 || !['active', 'archived', 'all'].includes(status)
        || !['all', 'published', 'draft'].includes(publication)) throw new HttpError(400, 'Invalid search or status filter.');
      const filter = status === 'all' ? {} : { isArchived: status === 'archived' ? true : { $ne: true } };
      if (publication !== 'all') filter.isPublished = publication === 'published';
      if (search.trim()) {
        if (item) filter.$and = [menuSearchFilter(search)];
        else filter.name = { $regex: escapeRegex(search.trim()), $options: 'i' };
      }
      if (item) {
        const { category, availability = 'all' } = rest;
        delete rest.category; delete rest.availability;
        if (category !== undefined) {
          if (!validId(category)) throw new HttpError(400, 'Invalid category filter.');
          filter.$and = [...(filter.$and || []), menuCategoryFilter([category])];
        }
        if (!['all', 'available', 'unavailable'].includes(availability)) throw new HttpError(400, 'Invalid availability filter.');
        if (availability !== 'all') filter.isAvailable = availability === 'available' ? { $ne: false } : false;
      }
      const { page, limit, skip } = parsePagination(rest);
      const [records, total] = await Promise.all([
        Model.find(filter).sort({ displayOrder: 1, _id: 1 }).skip(skip).limit(limit).lean(), Model.countDocuments(filter),
      ]);
      sendPaginated(response, records.map((record) => serialize(record, item)), page, limit, total);
    });
    routes.get('/:id', async (request, response) => response.json({ data: serialize(await get(request.params.id), item) }));
    routes.post('/', async (request, response) => {
      const values = validateMenuBody(request.body, kind, true);
      let record;
      if (item) {
        record = await menuTransaction(options.models, async (session) => {
          await lockMenuCategories(options.models, values.categories, session);
          const [created] = await Model.create([{ ...toUpdate(values).$set, isPublished: true, isArchived: false }], { session });
          return created;
        });
      } else {
        await categoryName(values);
        record = await createCategory(values);
      }
      response.status(201).json({ data: serialize(record, item) });
    });
    routes.patch('/:id', async (request, response) => {
      const values = validateMenuBody(request.body, kind);
      const save = async (session = null) => {
        const current = await get(request.params.id, session);
        if (item && Object.hasOwn(request.body, 'category') && menuCategoryIds(current).length > 1) throw new HttpError(409, 'Reload the editor to manage all assigned categories.');
        if (item && (values.categories !== undefined || values.isPublished === true)) await lockMenuCategories(options.models, values.categories ?? menuCategoryIds(current), session);
        if (!item) await categoryName(values, request.params.id);
        return update(request.params.id, { isArchived: { $ne: true } }, toUpdate(values), session);
      };
      const record = item ? await menuTransaction(options.models, save) : await save();
      response.json({ data: serialize(record, item) });
    });
    routes.delete('/:id', async (request, response) => {
      // Old clients used DELETE {} to archive: never interpret that as consent
      // to permanent deletion after this behavior change.
      assertBody(request.body, ['confirmPermanentDelete']);
      if (request.body.confirmPermanentDelete !== true || Object.keys(request.query).length) throw new HttpError(400, 'Explicit permanent deletion confirmation is required. Reload management and confirm Delete.');
      const result = await menuTransaction(options.models, async (session) => {
        const current = await Model.findOne({ _id: request.params.id }).select('+pendingImageCleanup').session(session).lean();
        if (!current) return { deleted: true, alreadyDeleted: true };
        if (item) {
          const assets = [...(current.pendingImageCleanup || []), ...(current.image ? [current.image] : [])];
          for (const asset of assets) await queueMenuCleanupJob({ models: options.models, itemId: current._id, asset, session });
        } else {
          // The write lock serializes this check with every new assignment,
          // including legacy category writes. Count archived and stale references too.
          await Model.updateOne({ _id: current._id }, { $inc: { referenceRevision: 1 } }, { session, timestamps: false });
          const count = await MenuItem.countDocuments({ $or: [{ category: current._id }, { categories: current._id }] }).session(session);
          if (count) throw new HttpError(409, `Cannot delete this category: ${count} menu item${count === 1 ? '' : 's'} still reference it, including archived records. Reassign or delete those dishes first.`);
        }
        await Model.deleteOne({ _id: current._id }, { session });
        return { deleted: true, alreadyDeleted: false };
      });
      let cleanupPending = false;
      if (item) {
        try { cleanupPending = await processMenuImageCleanup({ models: options.models, imageStorage: options.imageStorage || imageKitStorage, itemId: request.params.id }); }
        catch (error) { cleanupPending = true; logDiagnosticError(error, { operation: 'menu-delete.cleanup', requestId: request.requestId }); }
      }
      response.status(cleanupPending ? 202 : 200).json({ data: { ...result, cleanupPending,
        message: cleanupPending ? 'Menu item deleted. Photo cleanup is pending; managed assets will retry automatically. Unverified legacy assets require operator review.' : `${label} permanently deleted.`,
      } });
    });
    routes.post('/:id/restore', async (request, response) => {
      assertBody(request.body, []);
      const restore = async (session = null) => {
        const current = await get(request.params.id, session);
        if (item) await lockMenuCategories(options.models, menuCategoryIds(current), session);
        return update(request.params.id, { isArchived: true }, { $set: { isArchived: false, isPublished: false } }, session);
      };
      response.json({ data: serialize(item ? await menuTransaction(options.models, restore) : await restore(), item) });
    });
    router.use(`/${kind}`, routes);
  }
  return router;
}
