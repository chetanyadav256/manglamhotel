import { randomUUID } from 'node:crypto';
import { isDatabaseUnavailableError, logDiagnosticError } from '../utils/diagnostics.js';

export function requestIdHandler(request, response, next) {
  request.requestId = randomUUID();
  response.set('X-Request-ID', request.requestId);
  next();
}

export function notFoundHandler(_request, response) {
  response.status(404).json({ error: { message: 'Route not found.' } });
}

// Express requires all four parameters to recognize error middleware.
export function errorHandler(error, request, response, _next) {
  const databaseUnavailable = isDatabaseUnavailableError(error);
  const status = databaseUnavailable
    ? 503
    : Number.isInteger(error.status) && error.status >= 400 && error.status < 600
    ? error.status
    : 500;

  if (status >= 500) {
    const operation = error.operation || (request.route
      ? `${request.method} ${request.baseUrl}${request.route.path}`
      : `${request.method} ${request.path}`);
    logDiagnosticError(error, {
      operation,
      requestId: request.requestId,
    });
  }
  if (response.destroyed || response.headersSent) return;

  let message = 'Request could not be processed.';
  if (status === 400) {
    message = error.type === 'entity.parse.failed'
      ? 'Invalid request body.'
      : error.publicMessage || 'Invalid request.';
  } else if (status === 404) {
    message = error.publicMessage || 'Requested content was not found.';
  } else if (status === 401) {
    message = error.publicMessage || 'Authentication is required.';
  } else if (status === 403) {
    message = error.publicMessage || 'Request is not allowed.';
  } else if (status === 409) {
    message = error.publicMessage || 'The record has changed. Please reload and try again.';
  } else if (status === 415) {
    message = error.publicMessage || 'Unsupported request content type.';
  } else if (status === 429) {
    message = error.publicMessage || 'Too many requests.';
  } else if (status === 413) {
    message = 'Request body is too large.';
  } else if (status === 500) {
    message = 'Internal server error.';
  } else if (status === 503) {
    message = error.publicMessage || 'Database is currently unavailable.';
  } else if (status === 502) {
    message = error.publicMessage || 'A required service could not complete the request.';
  }

  if (status === 429 && error.retryAfterSeconds) {
    response.set('Retry-After', String(error.retryAfterSeconds));
  }
  response.status(status).json({ error: { message } });
}
