import { HttpError } from '../utils/http.js';

// Every assignment and category deletion writes the same category document.
// A reference count read alone would allow snapshot-isolation write skew.
export async function lockMenuCategories(models, ids, session) {
  if (!ids.length) throw new HttpError(400, 'Select at least one active category.');
  for (const id of [...new Set(ids)].sort()) {
    const category = await models.MenuCategory.findOne({ _id: id }).session(session).lean();
    if (!category) throw new HttpError(400, 'Selected category no longer exists. Choose another category.');
    if (category.isArchived) throw new HttpError(409, 'Selected category is archived. Restore it or choose an active category.');
    await models.MenuCategory.updateOne({ _id: id }, { $inc: { referenceRevision: 1 } }, { session, timestamps: false });
  }
}

export async function menuTransaction(models, work) {
  try {
    return await models.MenuItem.db.transaction(work, {
      readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' },
      readPreference: 'primary', maxCommitTimeMS: 5000,
    });
  } catch (error) {
    if (error.code === 20 || error.codeName === 'IllegalOperation') {
      throw new HttpError(503, 'Restaurant changes require a transaction-capable database. No changes were saved.');
    }
    throw error;
  }
}
