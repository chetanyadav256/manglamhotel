import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';

const roomImageSchema = new mongoose.Schema({
  url: { type: String, required: true, trim: true, maxlength: 2048, match: /^https:\/\/\S+$/ },
  imageId: { type: String, default: randomUUID, trim: true, maxlength: 64 },
  fileId: { type: String, trim: true, maxlength: 500 },
  filePath: { type: String, trim: true, maxlength: 2048 },
  publicId: { type: String, trim: true, maxlength: 500 },
  alt: { type: String, trim: true, maxlength: 300, default: '' },
  displayOrder: { type: Number, min: 0, default: 0 },
}, { _id: false });

const imageCleanupSchema = new mongoose.Schema({
  cleanupId: { type: String, required: true, trim: true, maxlength: 64 },
  fileId: { type: String, required: true, trim: true, maxlength: 500 },
  filePath: { type: String, required: true, trim: true, maxlength: 2048 },
  queuedAt: { type: Date, required: true, default: Date.now },
}, { _id: false });

const imageReservationSchema = new mongoose.Schema({
  reservationId: { type: String, required: true, trim: true, maxlength: 64 },
  uploadId: { type: String, required: true, trim: true, maxlength: 36 },
  count: { type: Number, required: true, min: 1, max: 5 },
  startOrder: { type: Number, required: true, min: 0 },
  expiresAt: { type: Date, required: true },
}, { _id: false });

const completedImageUploadSchema = new mongoose.Schema({
  uploadId: { type: String, required: true, trim: true, maxlength: 36 },
  completedAt: { type: Date, required: true, default: Date.now },
}, { _id: false });

const roomSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
  description: { type: String, trim: true, maxlength: 3000 },
  pricePerNight: { type: Number, min: 0, validate: Number.isFinite },
  amenities: {
    type: [{ type: String, trim: true, minlength: 1, maxlength: 120 }],
    default: [],
    validate: (amenities) => amenities.length <= 50,
  },
  images: {
    type: [roomImageSchema],
    default: [],
    validate: (images) => images.length <= 30,
  },
  imagesVersion: { type: Number, default: 0, min: 0, select: false },
  pendingImageReservations: { type: [imageReservationSchema], default: [], select: false },
  completedImageUploads: { type: [completedImageUploadSchema], default: [], select: false },
  pendingImageCleanup: { type: [imageCleanupSchema], default: [], select: false },
  isPublished: { type: Boolean, default: false, index: true },
  isArchived: { type: Boolean, default: false },
  displayOrder: { type: Number, default: 0, min: 0, max: 100000 },
}, { timestamps: true, versionKey: false });

roomSchema.index({ isPublished: 1, displayOrder: 1, _id: 1 });
roomSchema.index({ isArchived: 1, displayOrder: 1, _id: 1 });

export default mongoose.models.Room || mongoose.model('Room', roomSchema);
