import { menuCategoryIds } from '../../../shared/menu.js';
import { menuCategoryFilter, menuSearchFilter } from '../utils/menu.js';
import { Router } from 'express';
import mongoose from 'mongoose';
import { ownsMenuImage } from '../services/menuImageCleanup.js';
import { HttpError, parsePagination, sendPaginated } from '../utils/http.js';

function serializeRoom(room) {
  const images = (room.images ?? [])
    .map((image, index) => ({ image, index }))
    .sort((left, right) => (left.image.displayOrder ?? left.index) - (right.image.displayOrder ?? right.index));
  const result = {
    id: String(room._id),
    name: room.name,
    images: images
      .filter(({ image }) => isHttpsUrl(image.url))
      .map(({ image }) => {
        const optimized = image.fileId
          && typeof image.filePath === 'string'
          && image.filePath.startsWith(`/manglam-hotel/rooms/${room._id}/`)
          ? imageKitVariants(image.url)
          : null;
        return {
          src: optimized?.[1] || image.url,
          alt: image.alt || '',
          ...(optimized ? { srcSet: optimized.map((url, index) => `${url} ${[480, 800, 1280][index]}w`).join(', ') } : {}),
        };
      }),
    amenities: room.amenities ?? [],
  };
  if (room.description) result.description = room.description;
  if (Number.isFinite(room.pricePerNight)) {
    result.pricePerNight = { amount: room.pricePerNight, currency: 'INR' };
  }
  return result;
}

function imageKitVariants(value) {
  try {
    const source = new URL(value);
    if (source.protocol !== 'https:' || source.hostname !== 'ik.imagekit.io') return null;
    const [, endpoint, ...assetPath] = source.pathname.split('/');
    if (!endpoint || !assetPath.length || assetPath[0].startsWith('tr:')) return null;
    return [480, 800, 1280].map((width) => {
      const variant = new URL(source);
      variant.pathname = `/${endpoint}/tr:w-${width},q-80,f-auto/${assetPath.join('/')}`;
      return variant.toString();
    });
  } catch {
    return null;
  }
}

function serializeCategory(category) {
  const result = {
    id: String(category._id),
    name: category.name,
    slug: category.slug,
    isPublished: true,
  };
  if (category.description) result.description = category.description;
  return result;
}

function serializeMenuItem(item, publishedIds) {
  const result = {
    id: String(item._id),
    categoryIds: menuCategoryIds(item).filter((id) => publishedIds.has(id)),
    tags: item.tags ?? [],
    name: item.name,
    isPublished: true,
    isAvailable: item.isAvailable,
  };
  if (item.description) result.description = item.description;
  if (Number.isFinite(item.price)) result.priceInRupees = item.price;
  if (isHttpsUrl(item.image?.url)) {
    const variants = ownsMenuImage(item._id, item.image) ? imageKitVariants(item.image.url) : null;
    result.image = { src: variants?.[1] || item.image.url, alt: item.image.alt || '',
      ...(variants ? { srcSet: variants.map((url, index) => `${url} ${[480, 800, 1280][index]}w`).join(', ') } : {}) };
  }
  result.categoryId = result.categoryIds[0]; // Read compatibility for an older cached client.
  return result;
}

function requireDatabase(isDatabaseReady) {
  if (!isDatabaseReady()) throw new HttpError(503, 'Database is currently unavailable.');
}

function validObjectId(id) {
  return /^[a-f\d]{24}$/i.test(id) && mongoose.Types.ObjectId.isValid(id);
}

function isHttpsUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function validSiteSettings(settings) {
  const instagram = safeSettingsUrl(settings.instagramUrl, new Set(['www.instagram.com', 'instagram.com']), /^\/[A-Za-z0-9._-]{1,30}\/?$/);
  const maps = safeSettingsUrl(settings.googleMapsUrl, new Set(['www.google.com', 'google.com', 'maps.google.com']), /^\/maps\/place\/.+/);
  return typeof settings.hotelName === 'string'
    && settings.hotelName.trim().length > 0
    && settings.hotelName.length <= 120
    && Array.isArray(settings.phoneNumbers)
    && settings.phoneNumbers.length === 2
    && settings.phoneNumbers.every((phone) => typeof phone === 'string' && /^\+91 [6-9]\d{9}$/.test(phone))
    && typeof settings.instagramUrl === 'string'
    && instagram
    && typeof settings.address === 'string'
    && settings.address.trim().length > 0
    && settings.address.length <= 500
    && typeof settings.googleMapsUrl === 'string'
    && maps;
}

function safeSettingsUrl(value, allowedHosts, pathPattern) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && allowedHosts.has(url.hostname.toLowerCase())
      && !url.username && !url.password && !url.port && pathPattern.test(url.pathname);
  } catch {
    return false;
  }
}

export function createPublicContentRouter({ models, isDatabaseReady }) {
  const router = Router();

  router.get('/rooms', async (request, response) => {
    response.set('Cache-Control', 'no-store');
    requireDatabase(isDatabaseReady);
    const { page, limit, skip } = parsePagination(request.query);
    const filter = { isPublished: true, isArchived: { $ne: true } };
    const [rooms, total] = await Promise.all([
      models.Room.find(filter).sort({ displayOrder: 1, _id: 1 }).skip(skip).limit(limit).lean(),
      models.Room.countDocuments(filter),
    ]);
    sendPaginated(response, rooms.map(serializeRoom), page, limit, total);
  });

  router.get('/rooms/:id', async (request, response) => {
    response.set('Cache-Control', 'no-store');
    requireDatabase(isDatabaseReady);
    if (!validObjectId(request.params.id)) throw new HttpError(400, 'Room ID is invalid.');

    const room = await models.Room.findOne({
      _id: request.params.id,
      isPublished: true,
      isArchived: { $ne: true },
    }).lean();
    if (!room) throw new HttpError(404, 'Published room not found.');
    response.json({ data: serializeRoom(room) });
  });

  router.get('/menu/categories', async (request, response) => {
    response.set('Cache-Control', 'no-store');
    requireDatabase(isDatabaseReady);
    const { page, limit, skip } = parsePagination(request.query);
    const filter = { isPublished: true, isArchived: { $ne: true } };
    const [categories, total] = await Promise.all([
      models.MenuCategory.find(filter).sort({ displayOrder: 1, _id: 1 }).skip(skip).limit(limit).lean(),
      models.MenuCategory.countDocuments(filter),
    ]);
    sendPaginated(response, categories.map(serializeCategory), page, limit, total);
  });

  router.get('/menu/items', async (request, response) => {
    response.set('Cache-Control', 'no-store');
    requireDatabase(isDatabaseReady);
    const query = Object.assign(Object.create(null), request.query);
    const categoryId = query.category;
    delete query.category;
    const searchFilter = menuSearchFilter(query.search);
    delete query.search;
    const { page, limit, skip } = parsePagination(query);
    if (categoryId !== undefined && !validObjectId(categoryId)) {
      throw new HttpError(400, 'category must be a valid category ID.');
    }

    const publishedCategories = await models.MenuCategory.find({ isPublished: true, isArchived: { $ne: true } }).select('_id').lean();
    const categoryIds = categoryId === undefined
      ? publishedCategories.map(({ _id }) => _id)
      : publishedCategories
        .filter(({ _id }) => String(_id) === categoryId)
        .map(({ _id }) => _id);
    const filter = { isPublished: true, isArchived: { $ne: true }, $and: [menuCategoryFilter(categoryIds), searchFilter] };
    const [items, total] = await Promise.all([
      models.MenuItem.find(filter).maxTimeMS(3000).sort({ displayOrder: 1, _id: 1 }).skip(skip).limit(limit).lean(),
      models.MenuItem.countDocuments(filter).maxTimeMS(3000),
    ]);
    const publishedIds = new Set(publishedCategories.map(({ _id }) => String(_id)));
    sendPaginated(response, items.map((item) => serializeMenuItem(item, publishedIds)), page, limit, total);
  });

  router.get('/site-settings', async (_request, response) => {
    response.set('Cache-Control', 'no-store');
    requireDatabase(isDatabaseReady);
    const settings = await models.SiteSettings.findOne({ singletonKey: 'primary' })
      .select('hotelName phoneNumbers instagramUrl address googleMapsUrl')
      .lean();
    if (!settings) throw new HttpError(404, 'Site settings are not configured.');
    if (!validSiteSettings(settings)) throw new Error('Site settings are invalid.');
    const { hotelName, phoneNumbers, instagramUrl, address, googleMapsUrl } = settings;
    response.json({ data: { hotelName, phoneNumbers, instagramUrl, address, googleMapsUrl } });
  });

  return router;
}
