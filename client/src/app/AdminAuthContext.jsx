import { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet } from 'react-router';
import { adminRequest } from '../services/api.js';
import { AdminAuthContext } from './AdminAuthContext.js';

export default function AdminAuthProvider() {
  const [status, setStatus] = useState('loading');
  const [admin, setAdmin] = useState(null);
  const [csrfToken, setCsrfToken] = useState('');
  const [error, setError] = useState('');

  const loadCurrentAdmin = useCallback(async (signal) => {
    try {
      const response = await adminRequest('/me', { signal });
      if (signal.aborted) return;
      setAdmin(response.data.admin);
      const csrfResponse = await adminRequest('/csrf', { signal });
      if (signal.aborted) return;
      setCsrfToken(csrfResponse.data.csrfToken);
      setStatus('authenticated');
      setError('');
    } catch (requestError) {
      if (signal.aborted) return;
      if (requestError.status === 401) {
        setAdmin(null);
        setCsrfToken('');
        setStatus('anonymous');
        setError('');
      } else {
        setStatus('error');
        setError('Admin services are temporarily unavailable. Please try again.');
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const task = window.setTimeout(() => loadCurrentAdmin(controller.signal), 0);
    return () => {
      window.clearTimeout(task);
      controller.abort();
    };
  }, [loadCurrentAdmin]);

  const login = useCallback(async ({ email, password }) => {
    setError('');
    try {
      const csrfResponse = await adminRequest('/csrf');
      const response = await adminRequest('/login', {
        method: 'POST',
        body: { email, password },
        csrfToken: csrfResponse.data.csrfToken,
      });
      setAdmin(response.data.admin);
      setCsrfToken(response.data.csrfToken);
      setStatus('authenticated');
      return true;
    } catch (requestError) {
      setError(requestError.status === 401 || requestError.status === 429
        ? requestError.message
        : 'Login is temporarily unavailable. Please try again.');
      setStatus('anonymous');
      return false;
    }
  }, []);

  const logout = useCallback(async () => {
    if (!csrfToken) {
      setAdmin(null);
      setStatus('anonymous');
      return true;
    }
    try {
      await adminRequest('/logout', {
        method: 'POST',
        body: {},
        csrfToken,
      });
      setAdmin(null);
      setCsrfToken('');
      setStatus('anonymous');
      setError('');
      return true;
    } catch {
      setError('Logout could not be confirmed. Please try again.');
      return false;
    }
  }, [csrfToken]);

  const request = useCallback(async (path, options = {}) => {
    try {
      // Obtain a fresh session-bound token before each deliberate mutation.
      const mutation = options.method && options.method !== 'GET';
      const token = mutation ? (await adminRequest('/csrf')).data.csrfToken : undefined;
      if (token) setCsrfToken(token);
      return await adminRequest(path, { ...options, csrfToken: token });
    } catch (requestError) {
      if (requestError.status === 401) {
        setAdmin(null);
        setCsrfToken('');
        setStatus('anonymous');
      }
      throw requestError;
    }
  }, []);

  const value = useMemo(() => ({
    request,
    admin,
    status,
    error,
    login,
    logout,
    retry: () => {
      setStatus('loading');
      setError('');
      loadCurrentAdmin(new AbortController().signal);
    },
  }), [admin, status, error, login, logout, loadCurrentAdmin, request]);

  return (
    <AdminAuthContext.Provider value={value}>
      <Outlet />
    </AdminAuthContext.Provider>
  );
}
