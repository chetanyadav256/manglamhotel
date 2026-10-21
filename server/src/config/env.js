export function readEnv(environment = process.env) {
  const port = Number(environment.PORT ?? 5000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  const trustProxyHops = Number(environment.TRUST_PROXY_HOPS ?? 0);
  if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 10) {
    throw new Error('TRUST_PROXY_HOPS must be an integer between 0 and 10.');
  }

  const nodeEnv = environment.NODE_ENV || 'development';
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error('NODE_ENV must be development, test, or production.');
  }

  const mongodbUri = environment.MONGODB_URI?.trim() || '';
  if (mongodbUri) {
    let parsedUri;
    try {
      parsedUri = new URL(mongodbUri);
    } catch {
      throw new Error('MONGODB_URI must be a valid MongoDB connection URI.');
    }

    if (!['mongodb:', 'mongodb+srv:'].includes(parsedUri.protocol) || !parsedUri.hostname) {
      throw new Error('MONGODB_URI must use mongodb:// or mongodb+srv://.');
    }
    if (/[*\s]/.test(parsedUri.username + parsedUri.password)) {
      throw new Error('MONGODB_URI must not contain placeholder or whitespace credentials.');
    }
  } else if (nodeEnv === 'production') {
    throw new Error('MONGODB_URI is required in production.');
  }

  const configuredOrigins = environment.ADMIN_ALLOWED_ORIGINS
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean) ?? [];
  if (nodeEnv === 'production' && configuredOrigins.length === 0) {
    throw new Error('ADMIN_ALLOWED_ORIGINS is required in production.');
  }
  const defaultOrigins = ['http://127.0.0.1:5173', 'http://localhost:5173'];
  const allowedOrigins = (configuredOrigins.length > 0 ? configuredOrigins : defaultOrigins).map((origin) => {
    let parsedOrigin;
    try {
      parsedOrigin = new URL(origin);
    } catch {
      throw new Error('ADMIN_ALLOWED_ORIGINS must contain valid origins.');
    }
    if (
      parsedOrigin.origin !== origin
      || parsedOrigin.username
      || parsedOrigin.password
      || (nodeEnv === 'production' && parsedOrigin.protocol !== 'https:')
    ) {
      throw new Error('ADMIN_ALLOWED_ORIGINS must contain exact origins (HTTPS in production).');
    }
    return parsedOrigin.origin;
  });
  if (new Set(allowedOrigins).size !== allowedOrigins.length) {
    throw new Error('ADMIN_ALLOWED_ORIGINS must not contain duplicates.');
  }

  return {
    port,
    host: environment.HOST || '127.0.0.1',
    nodeEnv,
    mongodbUri,
    allowedOrigins,
    trustProxyHops,
  };
}
