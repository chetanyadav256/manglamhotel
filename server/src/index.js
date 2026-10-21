import { app } from './app.js';
import { readEnv } from './config/env.js';
import mongoose from 'mongoose';
import { connectDatabase, mongoFailureSummary } from './config/database.js';
import { models } from './models/index.js';
import { imageKitStorage } from './services/imageKitStorage.js';
import { startImageCleanupWorker } from './routes/adminRoomImages.js';
import { processMenuImageCleanup } from './services/menuImageCleanup.js';
import { logDiagnosticError } from './utils/diagnostics.js';

const { port, host, nodeEnv, mongodbUri } = readEnv();
let server;
let stopImageCleanupWorker;

if (mongodbUri) {
  mongoose.connection.on('error', (error) => {
    logDiagnosticError(error, { category: 'mongodb', operation: 'mongoose.connection' });
  });
  mongoose.connection.on('disconnected', () => {
    console.error(JSON.stringify({
      event: 'database_disconnected',
      category: 'mongodb',
      operation: 'mongoose.connection',
      readyState: mongoose.connection.readyState,
    }));
  });
  mongoose.connection.on('reconnected', () => {
    console.info(JSON.stringify({
      event: 'database_reconnected',
      category: 'mongodb',
      operation: 'mongoose.connection',
      readyState: mongoose.connection.readyState,
    }));
  });

  try {
    await connectDatabase(mongodbUri);
    console.log('MongoDB connected to database manglam_hotel.');
  } catch (error) {
    logDiagnosticError(error, { category: 'mongodb', operation: 'mongoose.connect' });
    console.error(`MongoDB connection unavailable: ${mongoFailureSummary(error)}`);
  }
}

if (process.env.IMAGEKIT_PRIVATE_KEY) {
  stopImageCleanupWorker = startImageCleanupWorker({ models, imageStorage: imageKitStorage,
    additionalCleanup: () => processMenuImageCleanup({ models, imageStorage: imageKitStorage }) });
}

server = app.listen(port, host, () => {
  console.log(`Manglam API listening at http://${host}:${port} (${nodeEnv})`);
});

server.on('error', () => {
  console.error('API failed to start.');
  process.exitCode = 1;
});

async function shutdown(signal) {
  console.log(`${signal} received; closing HTTP server.`);
  stopImageCleanupWorker?.();
  const timeout = setTimeout(() => {
    server.closeAllConnections();
  }, 10_000).unref();
  server.close(async (error) => {
    clearTimeout(timeout);
    if (error) {
      console.error('HTTP server shutdown failed.');
      process.exitCode = 1;
    }
    try {
      await mongoose.disconnect();
    } catch {
      console.error('MongoDB shutdown failed.');
      process.exitCode = 1;
    }
  });
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
