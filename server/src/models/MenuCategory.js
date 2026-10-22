import mongoose from 'mongoose';

const menuCategorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: 100 },
  nameKey: { type: String, select: false },
  referenceRevision: { type: Number, default: 0, select: false },
  slug: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    minlength: 1,
    maxlength: 120,
    match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    unique: true,
  },
  description: { type: String, trim: true, maxlength: 1000 },
  displayOrder: { type: Number, default: 0, min: 0, max: 100000 },
  isPublished: { type: Boolean, default: false, index: true },
  isArchived: { type: Boolean, default: false },
}, { timestamps: true, versionKey: false });

menuCategorySchema.index({ isPublished: 1, displayOrder: 1, _id: 1 });
// Legacy records need no backfill. New/renamed categories get a canonical key.
menuCategorySchema.index({ nameKey: 1 }, { unique: true, partialFilterExpression: { nameKey: { $type: 'string' } } });
menuCategorySchema.index({ isArchived: 1, displayOrder: 1, _id: 1 });

export default mongoose.models.MenuCategory || mongoose.model('MenuCategory', menuCategorySchema);
