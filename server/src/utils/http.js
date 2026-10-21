export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.publicMessage = message;
  }
}

export function parsePagination(query = Object.create(null)) {
  if (!query || typeof query !== 'object' || Array.isArray(query)) {
    throw new HttpError(400, 'Query parameters must be an object.');
  }

  const allowed = new Set(['page', 'limit']);
  for (const key of Object.keys(query)) {
    if (!allowed.has(key)) throw new HttpError(400, 'Unsupported query parameter.');
  }

  const page = parsePositiveInteger(query.page, 1, 'page');
  const limit = parsePositiveInteger(query.limit, 50, 'limit');
  if (limit > 100) throw new HttpError(400, 'limit must not exceed 100.');
  const skip = (page - 1) * limit;
  if (!Number.isSafeInteger(skip)) throw new HttpError(400, 'page is out of range.');

  return { page, limit, skip };
}

export function parsePositiveInteger(value, fallback, name) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw new HttpError(400, `${name} must be a positive integer.`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new HttpError(400, `${name} is out of range.`);
  return parsed;
}

export function sendPaginated(response, data, page, limit, total) {
  response.json({
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}
