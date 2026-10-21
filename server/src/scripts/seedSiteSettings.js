import mongoose from 'mongoose';
import { connectDatabase } from '../config/database.js';
import { readEnv } from '../config/env.js';
import SiteSettings from '../models/SiteSettings.js';

const initialSettings = {
  singletonKey: 'primary',
  hotelName: 'Manglam Hotel & Restaurant',
  phoneNumbers: ['+91 7568647755', '+91 9828809155'],
  instagramUrl: 'https://www.instagram.com/thehouseofmanglam/',
  address: 'XHMX+X8, Jaipur Phalodi Express Way, Kalwar Rd, Radha Krishna Enclave Scheme, Kalwad, Rajasthan 303706',
  googleMapsUrl: 'https://www.google.com/maps/place/MANGLAM+HOTEL+%26+RESTAURANT/@26.9828396,75.5950936,672m/data=!3m2!1e3!4b1!4m6!3m5!1s0x396c4f8aaa4eaf61:0x236a45148382adb6!8m2!3d26.9828396!4d75.5976685!16s%2Fg%2F11f60z2g14',
};

async function seedSiteSettings() {
  const { mongodbUri } = readEnv();
  if (!mongodbUri) throw new Error('MONGODB_URI is required to seed site settings.');

  await connectDatabase(mongodbUri);
  await SiteSettings.init();
  const result = await SiteSettings.updateOne(
    { singletonKey: 'primary' },
    { $setOnInsert: initialSettings },
    { upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );

  console.log(result.upsertedCount
    ? 'Initial site settings were created.'
    : 'Site settings already exist; no changes were made.');
}

try {
  await seedSiteSettings();
} catch {
  console.error('Site settings seed failed; verify MongoDB configuration and connectivity.');
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
