import mongoose from 'mongoose';

const adminSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    maxlength: 254,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    unique: true,
  },
  passwordHash: { type: String, required: true, select: false, maxlength: 500 },
  name: { type: String, trim: true, maxlength: 120 },
  isActive: { type: Boolean, default: true, index: true },
}, { timestamps: true, versionKey: false });

export default mongoose.models.Admin || mongoose.model('Admin', adminSchema);
