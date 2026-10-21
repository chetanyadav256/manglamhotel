import { Router } from 'express';
import { createAdminProtection } from '../security/adminAuth.js';
import { HttpError } from '../utils/http.js';

const editableFields = ['hotelName', 'phoneNumbers', 'instagramUrl', 'address', 'googleMapsUrl'];
const allowedFields = [...editableFields, 'revision'];

function normalizedText(value, field, maxLength) {
  if (typeof value !== 'string') throw new HttpError(400, `${field} must be text.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new HttpError(400, `${field} must contain 1 to ${maxLength} characters.`);
  }
  return normalized;
}

function normalizePhone(value, field) {
  if (typeof value !== 'string' || value.trim().length > 24) {
    throw new HttpError(400, `${field} must be a valid Indian mobile number.`);
  }
  const compact = value.trim().replace(/[\s()-]/g, '');
  const nationalNumber = compact.startsWith('+91') ? compact.slice(3) : compact;
  if (!/^[6-9]\d{9}$/.test(nationalNumber)) {
    throw new HttpError(400, `${field} must be a valid Indian mobile number.`);
  }
  return `+91 ${nationalNumber}`;
}

function validatedHttpsUrl(value, field, allowedHosts, pathPattern) {
  if (typeof value !== 'string' || value.length > 2048) {
    throw new HttpError(400, `${field} must be a valid HTTPS URL.`);
  }
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new HttpError(400, `${field} must be a valid HTTPS URL.`);
  }
  if (url.protocol !== 'https:' || !allowedHosts.has(url.hostname.toLowerCase())
    || url.username || url.password || url.port || !pathPattern.test(url.pathname)) {
    throw new HttpError(400, `${field} must use an approved HTTPS URL.`);
  }
  return url.toString();
}

export function validateSiteSettingsBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some((field) => !allowedFields.includes(field))
    || allowedFields.some((field) => !Object.hasOwn(body, field))) {
    throw new HttpError(400, 'Request must contain all settings fields and the current revision only.');
  }
  if (!Number.isSafeInteger(body.revision) || body.revision < 0) {
    throw new HttpError(400, 'Settings revision is invalid. Reload the page and try again.');
  }
  if (!Array.isArray(body.phoneNumbers) || body.phoneNumbers.length !== 2) {
    throw new HttpError(400, 'Provide a primary and secondary phone number.');
  }
  return {
    revision: body.revision,
    hotelName: normalizedText(body.hotelName, 'Hotel name', 120),
    phoneNumbers: [
      normalizePhone(body.phoneNumbers[0], 'Primary phone number'),
      normalizePhone(body.phoneNumbers[1], 'Secondary phone number'),
    ],
    instagramUrl: validatedHttpsUrl(
      body.instagramUrl,
      'Instagram URL',
      new Set(['www.instagram.com', 'instagram.com']),
      /^\/[A-Za-z0-9._-]{1,30}\/?$/,
    ),
    address: normalizedText(body.address, 'Hotel address', 500),
    googleMapsUrl: validatedHttpsUrl(
      body.googleMapsUrl,
      'Google Maps URL',
      new Set(['www.google.com', 'google.com', 'maps.google.com']),
      /^\/maps\/place\/.+/,
    ),
  };
}

function serializeSettings(settings) {
  return {
    hotelName: settings.hotelName,
    phoneNumbers: settings.phoneNumbers,
    instagramUrl: settings.instagramUrl,
    address: settings.address,
    googleMapsUrl: settings.googleMapsUrl,
    revision: Number.isSafeInteger(settings.revision) ? settings.revision : 0,
  };
}

export function createAdminSiteSettingsRouter(options) {
  const router = Router();
  router.use(...createAdminProtection(options));

  router.get('/', async (_request, response) => {
    response.set('Cache-Control', 'no-store');
    if (!options.isDatabaseReady()) throw new HttpError(503, 'Database is currently unavailable.');
    const settings = await options.models.SiteSettings.findOne({ singletonKey: 'primary' })
      .select('hotelName phoneNumbers instagramUrl address googleMapsUrl revision')
      .lean();
    if (!settings) throw new HttpError(404, 'Site settings are not configured.');
    response.json({ data: serializeSettings(settings) });
  });

  router.patch('/', async (request, response) => {
    response.set('Cache-Control', 'no-store');
    if (!options.isDatabaseReady()) throw new HttpError(503, 'Database is currently unavailable.');
    const values = validateSiteSettingsBody(request.body);
    const filter = {
      singletonKey: 'primary',
      ...(values.revision === 0
        ? { $or: [{ revision: 0 }, { revision: { $exists: false } }] }
        : { revision: values.revision }),
    };
    const changes = Object.fromEntries(editableFields.map((field) => [field, values[field]]));
    const updated = await options.models.SiteSettings.findOneAndUpdate(
      filter,
      { $set: { ...changes, revision: values.revision + 1 } },
      { returnDocument: 'after', runValidators: true },
    ).lean();
    if (updated) {
      response.json({ data: serializeSettings(updated) });
      return;
    }
    const exists = await options.models.SiteSettings.findOne({ singletonKey: 'primary' }).select('_id').lean();
    if (!exists) throw new HttpError(404, 'Site settings are not configured.');
    throw new HttpError(409, 'Website settings changed in another session. Reload the latest values before saving.');
  });

  return router;
}
