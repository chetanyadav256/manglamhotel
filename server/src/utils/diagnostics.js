const sensitiveValuePatterns = [
  /(mongodb(?:\+srv)?:\/\/)[^\s"'<>]+/gi,
  /(IMAGEKIT_PRIVATE_KEY|MONGODB_URI|authorization|cookie|set-cookie|sessionToken|csrfToken|password|token|secret)(\s*[:=]\s*)[^\s,;'"<>]+/gi,
];

function sanitizeText(value) {
  return sensitiveValuePatterns.reduce(
    (text, pattern) => text.replace(pattern, (_match, key, separator) => (
      separator ? `${key}${separator}[REDACTED]` : `${key}[REDACTED]`
    )),
    String(value).slice(0, 12_000),
  );
}

export function isDatabaseUnavailableError(error) {
  const candidates = [error];
  if (error?.cause) candidates.push(error.cause);

  return candidates.some((candidate) => {
    if (!candidate) return false;
    if (/^(?:MongooseServerSelectionError|MongoServerSelectionError|MongoNetworkError|MongoNetworkTimeoutError|MongoNotConnectedError|MongoTopologyClosedError|MongoPoolClearedError|MongoOperationTimeoutError)$/.test(candidate.name)) {
      return true;
    }
    if (candidate.name === 'MongooseError' && /buffering timed out/i.test(candidate.message)) return true;
    return candidate.name === 'MongoServerError'
      && [6, 7, 89, 91, 189, 9001, 10107].includes(candidate.code);
  });
}

export function classifyError(error) {
  if (error?.diagnosticCategory) return error.diagnosticCategory;
  if (isDatabaseUnavailableError(error)) return 'mongodb';
  if (error?.status === 503) return 'mongodb';
  if ([400, 413, 415].includes(error?.status) || error?.type === 'entity.parse.failed') return 'validation';
  return 'application';
}

export function logDiagnosticError(error, {
  category = classifyError(error),
  operation,
  requestId,
} = {}) {
  const detail = {
    event: 'request_error',
    category,
    operation: operation || 'unknown',
    requestId: requestId || null,
    name: typeof error?.name === 'string' ? error.name : 'Error',
    ...(typeof error?.code === 'string' || typeof error?.code === 'number' ? { code: error.code } : {}),
    ...(error?.stack ? { stack: sanitizeText(error.stack) } : {}),
  };
  if (error?.cause?.stack) detail.causeStack = sanitizeText(error.cause.stack);
  console.error(JSON.stringify(detail));
}
