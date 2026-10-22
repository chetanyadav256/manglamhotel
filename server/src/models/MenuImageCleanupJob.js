import mongoose from 'mongoose';

// Internal outbox: survives deletion of the owning dish. Never accepts API bodies.
const schema = new mongoose.Schema({
  _id: { type: String, required: true },
  itemId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  asset: { type: mongoose.Schema.Types.Mixed, required: true },
  requiresReview: { type: Boolean, required: true },
  attemptedAt: { type: Date, default: () => new Date(0) },
  createdAt: { type: Date, default: Date.now },
}, { versionKey: false });
schema.index({ requiresReview: 1, attemptedAt: 1, _id: 1 });

export default mongoose.models.MenuImageCleanupJob || mongoose.model('MenuImageCleanupJob', schema);
