const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function requestJson(path, { signal } = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    signal,
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    let message = 'The request could not be completed.';
    try {
      const body = await response.json();
      if (typeof body.error?.message === 'string') message = body.error.message;
    } catch {
      // Keep the API boundary error generic if the response isn't JSON.
    }
    throw new ApiError(message, response.status);
  }

  return response.json();
}

async function requestAllPages(path, signal) {
  const allRecords = [];
  let page = 1;

  while (true) {
    const separator = path.includes('?') ? '&' : '?';
    const response = await requestJson(`${path}${separator}page=${page}&limit=100`, { signal });
    if (!Array.isArray(response.data) || !Number.isInteger(response.pagination?.totalPages)) {
      throw new ApiError('The server returned an invalid response.', 502);
    }
    allRecords.push(...response.data);
    if (page >= response.pagination.totalPages) break;
    page += 1;
  }

  return allRecords;
}

export async function getHealth({ signal } = {}) {
  return requestJson('/health', { signal });
}

export async function getRooms({ signal } = {}) {
  return requestAllPages('/rooms', signal);
}

export async function getMenuCategories({ signal } = {}) {
  return requestAllPages('/menu/categories', signal);
}

export async function getMenuItems({ category, signal } = {}) {
  const query = category ? `?category=${encodeURIComponent(category)}` : '';
  return requestAllPages(`/menu/items${query}`, signal);
}

export async function getSiteSettings({ signal } = {}) {
  const response = await requestJson('/site-settings', { signal });
  return response.data;
}

export async function adminRequest(path, { method = 'GET', body, csrfToken, signal } = {}) {
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  const response = await fetch(`${apiBaseUrl}/admin${path}`, {
    method,
    signal,
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(body === undefined || isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    },
    ...(body === undefined ? {} : { body: isFormData ? body : JSON.stringify(body) }),
  });

  if (!response.ok) {
    let message = 'The request could not be completed.';
    try {
      const responseBody = await response.json();
      if (typeof responseBody.error?.message === 'string') message = responseBody.error.message;
    } catch {
      // Keep the error generic when the server response is not JSON.
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) return null;
  return response.json();
}
