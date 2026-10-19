import { useCallback, useEffect, useRef, useState } from 'react';

export function useApi(fetcher, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tick, setTick] = useState(0);
  const silentRef = useRef(false);
  const hasDataRef = useRef(false);

  // silent: refresh numbers without blanking the page / showing a loader
  const reload = useCallback((opts = {}) => {
    silentRef.current = !!opts.silent;
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const silent = silentRef.current || hasDataRef.current;
    silentRef.current = false;
    if (!silent) setLoading(true);
    setError(null);
    Promise.resolve()
      .then(() => fetcher())
      .then((result) => {
        if (!cancelled) {
          setData(result);
          hasDataRef.current = true;
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Request failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { data, loading, error, reload, setData };
}
