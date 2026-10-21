import mongoose from 'mongoose';

const siteSettingsSchema = new mongoose.Schema({
  singletonKey: { type: String, required: true, enum: ['primary'], default: 'primary', unique: true },
  hotelName: { type: String, required: true, trim: true, maxlength: 120 },
  phoneNumbers: {
    type: [{ type: String, trim: true, match: /^\+91 [6-9]\d{9}$/ }],
    required: true,
    validate: (numbers) => numbers.length > 0 && numbers.length <= 10,
  },
  instagramUrl: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2048,
    match: /^https:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9._-]{1,30}\/?$/,
  },
  address: { type: String, required: true, trim: true, maxlength: 500 },
  googleMapsUrl: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2048,
    match: /^https:\/\/(?:www\.google\.com|google\.com|maps\.google\.com)\/maps\/place\/.+/,
  },
  revision: { type: Number, min: 0, default: 0, validate: Number.isSafeInteger },
}, { timestamps: true, versionKey: false });

export default mongoose.models.SiteSettings || mongoose.model('SiteSettings', siteSettingsSchema);
