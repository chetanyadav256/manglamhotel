import express from 'express';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, sep } from 'node:path';
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
import { createAdminSiteSettingsRouter } from './routes/adminSiteSettings.js';
import { createSeoRouter } from './routes/seo.js';
import { renderSeoDocument } from './services/seoDocument.js';

const serverDirectory = dirname(fileURLToPath(import.meta.url));
const defaultClientBuildDirectory = resolve(serverDirectory, '../../client/dist');

export function createApp(options = {}) {
  const environment = readEnv();
  const {
    models = defaultModels,
    isDatabaseReady = defaultDatabaseReady,
    imageStorage,
    clientBuildDirectory = defaultClientBuildDirectory,
    serveClient = environment.nodeEnv === 'production',
    publicSiteUrl = environment.publicSiteUrl,
    adminConfig = {
      allowedOrigins: environment.allowedOrigins,
      production: environment.nodeEnv === 'production',
      trustProxyHops: environment.trustProxyHops,
    },
  } = options;
  const application = express();

  application.disable('x-powered-by');
  application.set('trust proxy', adminConfig.trustProxyHops ?? 0);
  application.set('query parser', 'simple');
  application.use(requestIdHandler);
  // Preserve Helmet's default CSP while permitting images served by ImageKit.
  application.use(helmet({
    contentSecurityPolicy: {
      directives: {
        imgSrc: ["'self'", 'data:', 'https://ik.imagekit.io'],
      },
    },
  }));
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
  application.use('/api/admin/site-settings', createAdminSiteSettingsRouter({ models, isDatabaseReady, ...adminConfig }));
  application.use('/api', createPublicContentRouter({ models, isDatabaseReady }));
  application.use('/api', notFoundHandler);
  application.use(createSeoRouter({ publicSiteUrl }));

  if (serveClient) {
    const indexFile = resolve(clientBuildDirectory, 'index.html');
    if (!existsSync(indexFile)) {
      throw new Error(`Client production build is missing: ${indexFile}`);
    }
    const indexTemplate = readFile(indexFile, 'utf8');
    application.use(express.static(clientBuildDirectory, {
      index: false,
      fallthrough: true,
      setHeaders(response, filePath) {
        const assetsDirectory = `${resolve(clientBuildDirectory, 'assets')}${sep}`;
        response.set('Cache-Control', filePath.startsWith(assetsDirectory)
          ? 'public, max-age=31536000, immutable'
          : 'public, max-age=0, must-revalidate');
      },
    }));
    application.use(async (request, response, next) => {
      if (!['GET', 'HEAD'].includes(request.method)
        || !request.accepts('html')
        || /\.[^/]+$/.test(request.path)) {
        next();
        return;
      }
      try {
        const template = await indexTemplate;
        response
          .set('Cache-Control', 'no-cache')
          .type('html')
          .send(renderSeoDocument(template, request.path, publicSiteUrl));
      } catch (error) {
        next(error);
      }
    });
  }

  application.use(notFoundHandler);
  application.use(errorHandler);

  return application;
}

export const app = createApp();
