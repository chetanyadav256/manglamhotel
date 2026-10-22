import { createHash, randomUUID } from 'node:crypto';
import { logDiagnosticError } from '../utils/diagnostics.js';

export const menuImageFolder = (id) => `/manglam-hotel/restaurant/${id}/`;
export function ownsMenuImage(id, image) {
  if (!image || typeof image.fileId !== 'string' || !image.fileId || image.fileId.length > 500
    || typeof image.filePath !== 'string' || image.filePath.length > 2048) return false;
  const folder = menuImageFolder(id);
  const name = image.filePath.startsWith(folder) ? image.filePath.slice(folder.length) : '';
  return Boolean(name) && !/[\\/%]/.test(name) && !name.includes('..');
}
export function menuCleanupRecord(image) {
  return { cleanupId: randomUUID(), fileId: image.fileId, filePath: image.filePath, queuedAt: new Date() };
}

export async function queueMenuCleanupJob({ models, itemId, asset, session }) {
  const _id = createHash('sha256').update(JSON.stringify([String(itemId), asset.fileId || asset.publicId || asset.url, asset.filePath])).digest('hex');
  await models.MenuImageCleanupJob.updateOne({ _id }, { $setOnInsert: {
    itemId, asset, requiresReview: !ownsMenuImage(itemId, asset), createdAt: new Date(), attemptedAt: new Date(0),
  } }, { upsert: true, runValidators: true, ...(session ? { session } : {}) });
}

async function referencedElsewhere(models, fileId) {
  return await models.MenuItem.findOne({ 'image.fileId': fileId }).select('_id').lean()
    || await models.Room.findOne({ 'images.fileId': fileId }).select('_id').lean();
}

async function processJobs({ models, imageStorage, itemId, limit }) {
  const Jobs = models.MenuImageCleanupJob;
  const filter = itemId ? { itemId } : {};
  const jobs = await Jobs.find({ ...filter, requiresReview: false }).sort({ attemptedAt: 1, _id: 1 }).limit(limit).lean();
  for (const job of jobs) {
    try {
      await Jobs.updateOne({ _id: job._id }, { $set: { attemptedAt: new Date() } });
      if (!ownsMenuImage(job.itemId, job.asset)) {
        await Jobs.updateOne({ _id: job._id }, { $set: { requiresReview: true } });
        continue;
      }
      if (await referencedElsewhere(models, job.asset.fileId)) continue;
      try { await imageStorage.delete(job.asset.fileId); }
      catch (error) { if (!await imageStorage.isAlreadyDeleted(error)) throw error; }
      await Jobs.deleteOne({ _id: job._id });
    } catch (error) {
      logDiagnosticError(error, { operation: 'imagekit.menu-outbox.retry' });
    }
  }
  return Boolean(await Jobs.findOne(filter).select('_id').lean());
}

export async function processMenuImageCleanup({ models, imageStorage, itemId, limit = 25 }) {
  const Model = models.MenuItem;
  const items = await Model.find({ ...(itemId ? { _id: itemId } : {}), 'pendingImageCleanup.0': { $exists: true } })
    .select('+pendingImageCleanup').limit(limit).lean();
  let pending = false;
  for (const item of items) for (const entry of item.pendingImageCleanup ?? []) {
    if (!ownsMenuImage(item._id, entry)) { pending = true; continue; }
    // Never delete a currently referenced image, even with a malformed old queue.
    // APIs never reattach old IDs; replaced/removed assets cannot become current again.
    const current = await Model.findOne({ _id: item._id }).lean();
    if (!current || await referencedElsewhere(models, entry.fileId)) { pending = true; continue; }
    try { await imageStorage.delete(entry.fileId); }
    catch (error) {
      if (!await imageStorage.isAlreadyDeleted(error)) {
        pending = true;
        logDiagnosticError(error, { category: 'imagekit', operation: 'imagekit.menu-cleanup.retry' });
        continue;
      }
    }
    try {
      await Model.updateOne({ _id: item._id, 'pendingImageCleanup.cleanupId': entry.cleanupId }, { $pull: { pendingImageCleanup: { cleanupId: entry.cleanupId } } });
    } catch (error) {
      pending = true;
      logDiagnosticError(error, { category: 'mongodb', operation: 'mongodb.menu-cleanup.clear' });
    }
  }
  const jobsPending = await processJobs({ models, imageStorage, itemId, limit });
  return pending || jobsPending;
}
