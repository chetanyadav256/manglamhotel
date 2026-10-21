import mongoose from 'mongoose';

const adminLoginAttemptSchema = new mongoose.Schema({
  windowKey: { type: String, required: true, unique: true },
  count: { type: Number, required: true, default: 0, min: 0 },
  expiresAt: { type: Date, required: true },
}, { versionKey: false });

adminLoginAttemptSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.AdminLoginAttempt
  || mongoose.model('AdminLoginAttempt', adminLoginAttemptSchema);
