import { useEffect, useState } from 'react';
import { useAdminAuth } from '../app/useAdminAuth.js';

export default function useAdminMenuData(path, allPages = false) {
  const { request } = useAdminAuth();
  const [state, setState] = useState(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setState(null);
      try {
        let response = await request(path, { signal: controller.signal });
        if (allPages) {
          const records = [...response.data];
          for (let page = 2; page <= response.pagination.totalPages; page += 1) {
            const next = await request(`${path}&page=${page}`, { signal: controller.signal });
            records.push(...next.data);
          }
          response = { ...response, data: records };
        }
        if (!controller.signal.aborted) setState({ path, version, response });
      } catch (error) {
        if (!controller.signal.aborted) setState({ path, version, error: error.message });
      }
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [path, allPages, request, version]);
  const current = state?.path === path && state?.version === version ? state : null;
  return { result: current?.response, error: current?.error, retry: () => setVersion((value) => value + 1) };
}
