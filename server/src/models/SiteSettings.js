import mongoose from 'mongoose';

const siteSettingsSchema = new mongoose.Schema({
  singletonKey: { type: String, required: true, enum: ['primary'], default: 'primary', unique: true },
  hotelName: { type: String, required: true, trim: true, maxlength: 120 },
  phoneNumbers: {
    type: [{ type: String, trim: true, match: /^\+?[0-9][0-9\s()-]{5,24}$/ }],
    required: true,
    validate: (numbers) => numbers.length > 0 && numbers.length <= 10,
  },
  instagramUrl: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2048,
    match: /^https:\/\/www\.instagram\.com\/[A-Za-z0-9._-]+\/?$/,
  },
  address: { type: String, required: true, trim: true, maxlength: 500 },
  googleMapsUrl: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2048,
    match: /^https:\/\/www\.google\.com\/maps\//,
  },
}, { timestamps: true, versionKey: false });

export default mongoose.models.SiteSettings || mongoose.model('SiteSettings', siteSettingsSchema);
