import mongoose from 'mongoose';

const adminSessionSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true, select: false },
  csrfTokenHash: { type: String, required: true, select: false },
  createdAt: { type: Date, required: true, default: Date.now },
  lastActivityAt: { type: Date, required: true },
  idleExpiresAt: { type: Date, required: true },
  absoluteExpiresAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
}, { versionKey: false });

adminSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
adminSessionSchema.index({ adminId: 1, expiresAt: 1 });

export default mongoose.models.AdminSession || mongoose.model('AdminSession', adminSessionSchema);
