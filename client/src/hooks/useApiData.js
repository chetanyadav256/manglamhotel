import { useCallback, useEffect, useState } from 'react';

export default function useApiData(loadData, dependencyKey) {
  const [requestKey, setRequestKey] = useState(0);
  const [state, setState] = useState({
    data: null,
    error: false,
    loading: true,
    requestKey: 0,
  });

  useEffect(() => {
    const controller = new AbortController();

    loadData({ signal: controller.signal })
      .then((data) => {
        setState({ data, error: false, loading: false, requestKey });
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setState({ data: null, error: true, loading: false, requestKey });
        }
      });

    return () => controller.abort();
  }, [loadData, requestKey, dependencyKey]);

  const retry = useCallback(() => setRequestKey((key) => key + 1), []);
  const currentState = state.requestKey === requestKey
    ? state
    : { data: null, error: false, loading: true };
  return { ...currentState, retry };
}
