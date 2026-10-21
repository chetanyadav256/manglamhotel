import mongoose from 'mongoose';

const menuItemImageSchema = new mongoose.Schema({
  url: { type: String, required: true, trim: true, maxlength: 2048, match: /^https:\/\/\S+$/ },
  publicId: { type: String, required() { return !this.fileId; }, trim: true, maxlength: 500 },
  fileId: { type: String, trim: true, maxlength: 500 },
  filePath: { type: String, trim: true, maxlength: 2048 },
  alt: { type: String, trim: true, maxlength: 300, default: '' },
}, { _id: false });

const cleanupSchema = new mongoose.Schema({
  cleanupId: { type: String, required: true }, fileId: { type: String, required: true, maxlength: 500 },
  filePath: { type: String, required: true, maxlength: 2048 }, queuedAt: { type: Date, default: Date.now },
}, { _id: false });
const imageOperationSchema = new mongoose.Schema({
  operationId: { type: String, required: true, maxlength: 36 }, completedAt: { type: Date, default: Date.now },
}, { _id: false });

const menuItemSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: 150 },
  description: { type: String, trim: true, maxlength: 3000 },
  category: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'MenuCategory', index: true },
  price: { type: Number, min: 0, validate: Number.isFinite },
  image: { type: menuItemImageSchema, default: undefined },
  imageVersion: { type: Number, default: 0, min: 0, select: false },
  completedImageOperations: { type: [imageOperationSchema], default: [], select: false },
  pendingImageCleanup: { type: [cleanupSchema], default: [], select: false },
  vegetarian: { type: Boolean },
  isAvailable: { type: Boolean, default: true },
  isPublished: { type: Boolean, default: false, index: true },
  isArchived: { type: Boolean, default: false },
  displayOrder: { type: Number, default: 0, min: 0, max: 100000 },
}, { timestamps: true, versionKey: false });

menuItemSchema.index({ isPublished: 1, category: 1, displayOrder: 1, _id: 1 });
menuItemSchema.index({ isArchived: 1, category: 1, displayOrder: 1, _id: 1 });

export default mongoose.models.MenuItem || mongoose.model('MenuItem', menuItemSchema);
