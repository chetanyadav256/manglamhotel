import { Router } from 'express';
import { createAdminProtection } from '../security/adminAuth.js';
import { HttpError, parsePagination, sendPaginated } from '../utils/http.js';

const fields = ['name', 'description', 'pricePerNight', 'amenities', 'displayOrder', 'isPublished'];

function assertBody(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some((key) => !allowed.includes(key))) {
    throw new HttpError(400, 'Request contains unsupported fields or an invalid body.');
  }
}

function textField(value, name, max, required = false) {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) {
    throw new HttpError(400, `${name} must ${required ? 'contain 1 to' : 'contain at most'} ${max} characters.`);
  }
  return value.trim();
}

export function validateRoomBody(body, creating = false) {
  assertBody(body, fields);
  const result = {};
  if (!creating && Object.keys(body).length === 0) throw new HttpError(400, 'Provide at least one room field.');
  if (creating || Object.hasOwn(body, 'name')) result.name = textField(body.name, 'Room name', 120, true);
  if (Object.hasOwn(body, 'description')) result.description = textField(body.description, 'Description', 3000);
  if (Object.hasOwn(body, 'pricePerNight')) {
    const price = body.pricePerNight;
    if (price === null || price === '') result.pricePerNight = null;
    else if (typeof price !== 'number' || !Number.isFinite(price) || price < 0 || price > 10000000
      || Math.abs(price * 100 - Math.round(price * 100)) > 0.000001) {
      throw new HttpError(400, 'Price must be a non-negative INR amount up to 10000000 with at most two decimal places.');
    } else result.pricePerNight = price;
  }
  if (Object.hasOwn(body, 'amenities')) {
    if (!Array.isArray(body.amenities) || body.amenities.length > 50) throw new HttpError(400, 'Provide at most 50 amenities.');
    const seen = new Set();
    result.amenities = body.amenities.map((value) => textField(value, 'Each amenity', 120, true))
      .filter((value) => {
        const key = value.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }
  if (Object.hasOwn(body, 'displayOrder')) {
    if (!Number.isInteger(body.displayOrder) || body.displayOrder < 0 || body.displayOrder > 100000) {
      throw new HttpError(400, 'Display order must be an integer from 0 to 100000.');
    }
    result.displayOrder = body.displayOrder;
  }
  if (Object.hasOwn(body, 'isPublished')) {
    if (typeof body.isPublished !== 'boolean' || (creating && body.isPublished)) {
      throw new HttpError(400, 'New rooms must be drafts; publication must be a separate action.');
    }
    result.isPublished = body.isPublished;
  }
  return result;
}

function serialize(room) {
  return {
    id: String(room._id), name: room.name, description: room.description ?? '',
    pricePerNight: room.pricePerNight ?? null, amenities: room.amenities ?? [],
    images: (room.images ?? []).map(({ url, alt }) => ({ src: url, alt: alt || '' })),
    isPublished: room.isPublished === true, isArchived: room.isArchived === true,
    displayOrder: room.displayOrder ?? 0, createdAt: room.createdAt, updatedAt: room.updatedAt,
  };
}

export function createAdminRoomsRouter(options) {
  const { models } = options;
  const router = Router();
  router.use(...createAdminProtection(options));
  router.param('id', (request, _response, next, id) => {
    if (!/^[a-f\d]{24}$/i.test(id)) return next(new HttpError(400, 'Room ID is invalid.'));
    next();
  });

  router.get('/', async (request, response) => {
    const { search = '', status = 'active', ...paginationQuery } = request.query;
    if (typeof search !== 'string' || search.length > 120 || !['active', 'archived', 'all'].includes(status)) {
      throw new HttpError(400, 'Invalid room search or status filter.');
    }
    const { page, limit, skip } = parsePagination(paginationQuery);
    const filter = status === 'all' ? {} : { isArchived: status === 'archived' ? true : { $ne: true } };
    if (search.trim()) filter.name = { $regex: search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    const [rooms, total] = await Promise.all([
      models.Room.find(filter).sort({ displayOrder: 1, _id: 1 }).skip(skip).limit(limit).lean(),
      models.Room.countDocuments(filter),
    ]);
    sendPaginated(response, rooms.map(serialize), page, limit, total);
  });

  router.get('/:id', async (request, response) => {
    const room = await models.Room.findOne({ _id: request.params.id }).lean();
    if (!room) throw new HttpError(404, 'Room not found.');
    response.json({ data: serialize(room) });
  });

  router.post('/', async (request, response) => {
    const values = validateRoomBody(request.body, true);
    if (values.pricePerNight === null) delete values.pricePerNight;
    const room = await models.Room.create({ ...values, isPublished: false, isArchived: false });
    response.status(201).json({ data: serialize(room) });
  });

  async function updateRoom(id, filter, update, conflictMessage) {
    const room = await models.Room.findOneAndUpdate(
      { _id: id, ...filter },
      update,
      { returnDocument: 'after', runValidators: true },
    ).lean();
    if (room) return room;
    if (!await models.Room.findOne({ _id: id }).select('_id').lean()) throw new HttpError(404, 'Room not found.');
    throw new HttpError(409, conflictMessage);
  }

  router.patch('/:id', async (request, response) => {
    const values = validateRoomBody(request.body);
    const update = { $set: values };
    if (values.pricePerNight === null) {
      delete values.pricePerNight;
      update.$unset = { pricePerNight: 1 };
    }
    // The filter and update are atomic: a concurrent archive cannot be reversed
    // by a stale edit/publish. Images and other MongoDB fields are never written.
    const room = await updateRoom(request.params.id, { isArchived: { $ne: true } }, update, 'Restore this archived room before editing or publishing it.');
    response.json({ data: serialize(room) });
  });

  router.delete('/:id', async (request, response) => {
    assertBody(request.body, []);
    const room = await updateRoom(request.params.id, {}, { $set: { isArchived: true, isPublished: false } });
    response.json({ data: serialize(room) });
  });

  router.post('/:id/restore', async (request, response) => {
    assertBody(request.body, []);
    const room = await updateRoom(request.params.id, { isArchived: true }, { $set: { isArchived: false, isPublished: false } }, 'Only archived rooms can be restored.');
    response.json({ data: serialize(room) });
  });
  return router;
}
