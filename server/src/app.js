import express from 'express';
import helmet from 'helmet';
import healthRouter from './routes/health.js';
import { errorHandler, notFoundHandler, requestIdHandler } from './middleware/errors.js';
import { createPublicContentRouter } from './routes/publicContent.js';
import { models as defaultModels } from './models/index.js';
import { isDatabaseReady as defaultDatabaseReady } from './config/database.js';
import { createAdminAuthRouter } from './security/adminAuth.js';
import { readEnv } from './config/env.js';
import { createAdminRoomsRouter } from './routes/adminRooms.js';
import { createAdminRoomImagesRouter } from './routes/adminRoomImages.js';
import { createAdminMenuRouter } from './routes/adminMenu.js';
import { createAdminMenuImagesRouter } from './routes/adminMenuImages.js';

export function createApp({
  models = defaultModels,
  isDatabaseReady = defaultDatabaseReady,
  imageStorage,
  adminConfig = {
    allowedOrigins: readEnv().allowedOrigins,
    production: process.env.NODE_ENV === 'production',
    trustProxyHops: readEnv().trustProxyHops,
  },
} = {}) {
  const application = express();

  application.disable('x-powered-by');
  application.set('trust proxy', adminConfig.trustProxyHops ?? 0);
  application.set('query parser', 'simple');
  application.use(requestIdHandler);
  application.use(helmet());
  application.use(express.json({ limit: '32kb' }));
  application.use('/api/health', healthRouter);
  application.use('/api/admin', createAdminAuthRouter({
    models,
    isDatabaseReady,
    ...adminConfig,
  }));
  application.use('/api/admin/rooms', createAdminRoomImagesRouter({
    models,
    isDatabaseReady,
    ...(imageStorage ? { imageStorage } : {}),
    ...adminConfig,
  }));
  application.use('/api/admin/rooms', createAdminRoomsRouter({ models, isDatabaseReady, ...adminConfig }));
  application.use('/api/admin/menu/items', createAdminMenuImagesRouter({ models, isDatabaseReady, ...(imageStorage ? { imageStorage } : {}), ...adminConfig }));
  application.use('/api/admin/menu', createAdminMenuRouter({ models, isDatabaseReady, ...adminConfig }));
  application.use('/api', createPublicContentRouter({ models, isDatabaseReady }));
  application.use(notFoundHandler);
  application.use(errorHandler);

  return application;
}

export const app = createApp();
