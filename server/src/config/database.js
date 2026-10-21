import mongoose from 'mongoose';
import { models } from '../models/index.js';

const networkFailureMessages = {
  ENOTFOUND: 'DNS lookup failed; verify the Atlas cluster hostname.',
  EAI_AGAIN: 'DNS lookup was temporarily unavailable; retry after checking network access.',
  ECONNREFUSED: 'The database host refused the connection; check Atlas networking.',
  ETIMEDOUT: 'The connection timed out; check the Atlas IP access list and outbound network.',
  EHOSTUNREACH: 'The database host is unreachable; check outbound network access.',
  ECONNRESET: 'The connection was reset; check Atlas availability and network stability.',
  CERT_HAS_EXPIRED: 'TLS certificate validation failed; verify the system clock and certificate chain.',
  ERR_TLS_CERT_ALTNAME_INVALID: 'TLS hostname validation failed; verify the cluster hostname.',
};

export function mongoFailureSummary(error) {
  const candidates = [error];
  const servers = error.reason?.servers;
  if (servers instanceof Map) {
    for (const server of servers.values()) candidates.push(server.error);
  }
  const code = candidates.find((candidate) => candidate?.code)?.code;
  if (typeof code === 'string' && networkFailureMessages[code]) {
    return networkFailureMessages[code];
  }
  if (candidates.some((candidate) => candidate?.code === 18 || candidate?.code === 8000)) {
    return 'MongoDB rejected authentication; verify the database username and password.';
  }
  return 'Server selection failed; verify Atlas availability, network access, and connection settings.';
}

export async function connectDatabase(uri) {
  await mongoose.connect(uri, {
    dbName: 'manglam_hotel',
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10,
    autoIndex: false,
  });

  try {
    await Promise.all(Object.values(models).map((model) => model.createIndexes()));
  } catch (error) {
    await mongoose.disconnect();
    const failure = new Error('MongoDB index initialization failed.', { cause: error });
    failure.diagnosticCategory = 'mongodb';
    throw failure;
  }

  return mongoose.connection;
}

export function isDatabaseReady() {
  return mongoose.connection.readyState === 1;
}
