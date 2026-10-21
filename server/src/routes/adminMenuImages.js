import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Router } from 'express';
import sharp from 'sharp';
import { createAdminProtection } from '../security/adminAuth.js';
import { imageKitStorage } from '../services/imageKitStorage.js';
import { supportedTypes, acquireUploadSlot, releaseUploadSlot, createUploadMiddleware, multipartError } from '../services/imageUploads.js';
import { ownsMenuImage, menuImageFolder, menuCleanupRecord, processMenuImageCleanup } from '../services/menuImageCleanup.js';
import { HttpError } from '../utils/http.js';
import { logDiagnosticError } from '../utils/diagnostics.js';

const uuid = /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const versionFilter = (version) => version === 0 ? { $or: [{ imageVersion: 0 }, { imageVersion: { $exists: false } }] } : { imageVersion: version };
const completed = (item, id) => item?.completedImageOperations?.some((entry) => entry.operationId === id);
const conflict = () => new HttpError(409, 'The photo changed. Reload the photo before trying again.');
function safeUrl(url) {
  try { const value = new URL(url); return url.length <= 2048 && value.protocol === 'https:' && !value.username && !value.password; }
  catch { return false; }
}
function output(item, extra = {}) {
  const image = item.image;
  return { itemId: String(item._id), version: item.imageVersion ?? 0,
    image: image ? { url: safeUrl(image.url) ? image.url : null, alt: image.alt || '', managed: ownsMenuImage(item._id, image) } : null, ...extra };
}
function validateBody(body, method, multipart = false) {
  const allowed = ['version', 'operationId', ...(method !== 'DELETE' ? ['alt'] : [])];
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => !allowed.includes(key))) throw new HttpError(400, 'Unsupported image fields.');
  const version = multipart && typeof body.version === 'string' && /^\d+$/.test(body.version) ? Number(body.version) : body.version;
  if (!Number.isSafeInteger(version) || version < 0) throw new HttpError(400, 'Photo version is invalid. Reload the photo.');
  if (typeof body.operationId !== 'string' || !uuid.test(body.operationId)) throw new HttpError(400, 'Image operation ID is invalid.');
  if (method === 'PATCH' && body.alt === undefined) throw new HttpError(400, 'Provide alternative text.');
  const alt = body.alt ?? '';
  if (typeof alt !== 'string' || alt.length > 300) throw new HttpError(400, 'Alternative text must be at most 300 characters.');
  return { version, operationId: body.operationId, alt: alt.trim() };
}

export function createAdminMenuImagesRouter({ models, isDatabaseReady, imageStorage = imageKitStorage, ...adminConfig }) {
  const router = Router();
  const Model = models.MenuItem;
  const protect = createAdminProtection({ models, isDatabaseReady, ...adminConfig,
    allowMultipart: (request) => ['POST', 'PUT'].includes(request.method) && /^\/[^/]+\/image$/.test(request.path) });
  router.param('id', (_request, _response, next, id) => next(/^[a-f\d]{24}$/i.test(id) ? undefined : new HttpError(400, 'Menu item ID is invalid.')));
  const read = async (id) => {
    const item = await Model.findOne({ _id: id }).select('+imageVersion +completedImageOperations').lean();
    if (!item) throw new HttpError(404, 'Menu item not found.');
    return item;
  };
  function check(item, values, method) {
    if (item.isArchived) throw new HttpError(409, 'Restore this archived menu item before changing its photo.');
    if (completed(item, values.operationId)) return true;
    if ((item.imageVersion ?? 0) !== values.version) throw conflict();
    if (method === 'POST' && item.image) throw new HttpError(409, 'A photo already exists. Use Replace photo.');
    if (method !== 'POST' && !item.image) throw new HttpError(409, 'This item has no photo. Upload a photo first.');
    return false;
  }
  async function clean(id, requestId) {
    try { return await processMenuImageCleanup({ models, imageStorage, itemId: id }); }
    catch (error) {
      logDiagnosticError(error, { category: 'mongodb', operation: 'mongodb.menu-cleanup', requestId });
      return true;
    }
  }
  async function commit(item, values, change, cleanup, recovery) {
    const filter = { _id: item._id, isArchived: { $ne: true }, ...versionFilter(values.version) };
    try {
      const updated = await Model.findOneAndUpdate(filter, { ...change, $inc: { imageVersion: 1 },
        $push: { completedImageOperations: { $each: [{ operationId: values.operationId, completedAt: new Date() }], $slice: -100 },
          ...(cleanup ? { pendingImageCleanup: cleanup } : {}) } },
      { returnDocument: 'after', runValidators: true }).select('+imageVersion +completedImageOperations').lean();
      if (!updated) throw conflict();
      return updated;
    } catch (cause) {
      if (cause.status === 409) throw cause; // An acknowledged no-match never wrote anything.
      recovery.uncertain = true;
      try {
        let current = await read(item._id);
        if (completed(current, values.operationId)) return current;
        if ((current.imageVersion ?? 0) === values.version) {
          // Fence a possibly delayed write before deleting its upload. This CAS
          // is atomic, uses normal update operators, and needs no updatePipeline.
          await Model.updateOne({ _id: item._id, ...versionFilter(values.version) }, { $inc: { imageVersion: 1 } });
          current = await read(item._id);
          if (completed(current, values.operationId)) return current;
        }
        if ((current.imageVersion ?? 0) > values.version) recovery.uncertain = false;
      } catch { /* Cannot prove the write failed: keep all remote assets. */ }
      if (recovery.uncertain) throw new HttpError(503, 'Photo persistence could not be confirmed. Reload the photo before retrying; assets were retained for recovery.');
      throw cause;
    }
  }
  function noQuery(request, _response, next) {
    next(Object.keys(request.query).length ? new HttpError(400, 'Unsupported query parameter.') : undefined);
  }
  router.get('/:id/image', ...protect, noQuery, async (request, response) => response.json({ data: output(await read(request.params.id)) }));

  const upload = async (request, response, next) => {
    if (!request.is('multipart/form-data')) return next(new HttpError(415, 'Use multipart form data for photo uploads.'));
    if (!acquireUploadSlot(imageStorage)) return next(new HttpError(429, 'Image uploads are busy. Try again shortly.'));
    let directory;
    const controller = new AbortController();
    const abort = () => { if (!response.writableEnded) controller.abort(); };
    request.once('aborted', abort); response.once('close', abort);
    let asset;
    let reply;
    let requestError;
    const recovery = { uncertain: false };
    try {
      const item = await read(request.params.id);
      if (item.isArchived) throw new HttpError(409, 'Restore this archived menu item before changing its photo.');
      directory = await mkdtemp(join(tmpdir(), 'manglam-menu-image-'));
      request.imageTempDirectory = directory;
      await new Promise((resolve, reject) => createUploadMiddleware({ maxImages: 1, fieldName: 'image', fields: 3, parts: 4 })(request, response,
        (error) => error ? reject(multipartError(error, 'Provide exactly one file in the image field.')) : resolve()));
      const values = validateBody(request.body, request.method, true);
      if (request.files?.length !== 1) throw new HttpError(400, 'Select exactly one photo.');
      if (check(item, values, request.method)) { reply = { status: 200, data: output(item, { alreadyCompleted: true }) }; return; }
      const file = request.files[0];
      const buffer = await readFile(file.path);
      const type = supportedTypes.get(file.mimetype);
      if (!buffer.length) throw new HttpError(400, 'Image files must not be empty.');
      if (!type?.matches(buffer)) throw new HttpError(415, 'Image file contents do not match a supported format.');
      try {
        // Fully decode bounded raster data; signatures alone cannot detect corrupt pixels.
        await sharp(buffer, { failOn: 'warning', limitInputPixels: 40_000_000 }).stats();
      } catch { throw new HttpError(415, 'The photo is malformed or exceeds the 40-megapixel limit.'); }
      imageStorage.ensureConfigured();
      const fileName = `${randomUUID()}${type.extension}`;
      let result;
      try { result = await imageStorage.upload({ filePath: file.path, fileName, menuItemId: request.params.id, signal: controller.signal }); }
      catch (cause) {
        const error = new HttpError(502, 'Image storage could not complete the upload.'); error.cause = cause; error.diagnosticCategory = 'imagekit'; throw error;
      }
      if (ownsMenuImage(item._id, result) && result.filePath === `${menuImageFolder(item._id)}${fileName}` && result.fileId !== item.image?.fileId) asset = result;
      if (!asset || !safeUrl(result.url)) {
        const error = new HttpError(502, 'Image storage returned invalid photo metadata.');
        error.diagnosticCategory = 'imagekit';
        throw error;
      }
      const oldCleanup = ownsMenuImage(item._id, item.image) ? menuCleanupRecord(item.image) : null;
      const updated = await commit(item, values, { $set: { image: { fileId: asset.fileId, filePath: asset.filePath, url: asset.url, alt: values.alt } } }, oldCleanup, recovery);
      asset = null; // Metadata committed (or confirmed after a lost acknowledgement).
      const cleanupPending = await clean(item._id, request.requestId);
      reply = { status: request.method === 'POST' ? 201 : 200, data: output(updated, { cleanupPending, legacyAssetRetained: Boolean(item.image && !oldCleanup) }) };
    } catch (error) {
      if (asset && !recovery.uncertain) {
        try {
          // Persist the compensation before deletion so a failed delete is retryable.
          await Model.updateOne({ _id: request.params.id }, { $push: { pendingImageCleanup: menuCleanupRecord(asset) } });
          await clean(request.params.id, request.requestId);
        } catch (cleanupError) {
          logDiagnosticError(cleanupError, { category: 'mongodb', operation: 'mongodb.menu-image-compensation', requestId: request.requestId });
        }
      }
      requestError = error;
    } finally {
      request.off('aborted', abort); response.off('close', abort);
      try { if (directory) await rm(directory, { recursive: true, force: true }); }
      catch (error) { logDiagnosticError(error, { operation: 'filesystem.menu-upload-cleanup', requestId: request.requestId }); }
      releaseUploadSlot(imageStorage);
      // Finish temporary-file cleanup and release the slot before acknowledging
      // the request, so a prompt retry cannot inherit this request's capacity.
      if (requestError) next(requestError);
      else if (reply) response.status(reply.status).json({ data: reply.data });
    }
  };
  router.post('/:id/image', ...protect, noQuery, upload);
  router.put('/:id/image', ...protect, noQuery, upload);
  for (const method of ['patch', 'delete']) router[method]('/:id/image', ...protect, noQuery, async (request, response) => {
    const values = validateBody(request.body, request.method);
    const item = await read(request.params.id);
    if (check(item, values, request.method)) return response.json({ data: output(item, { alreadyCompleted: true }) });
    const removing = method === 'delete';
    const cleanup = removing && ownsMenuImage(item._id, item.image) ? menuCleanupRecord(item.image) : null;
    const updated = await commit(item, values, removing ? { $unset: { image: 1 } } : { $set: { 'image.alt': values.alt } }, cleanup, {});
    const cleanupPending = await clean(item._id, request.requestId);
    response.json({ data: output(updated, { cleanupPending, legacyAssetRetained: Boolean(removing && !cleanup) }) });
  });
  return router;
}
