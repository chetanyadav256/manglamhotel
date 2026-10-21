import { randomUUID } from 'node:crypto';
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
    if (!current || current.image?.fileId === entry.fileId) { pending = true; continue; }
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
  return pending;
}
