import { useState, useEffect } from 'react';

/**
 * Returns a "show spinner" boolean that only becomes true
 * after `delay` ms of the underlying `isLoading` being true.
 * This prevents a flash of the loading spinner on fast local API calls.
 */
export function useDelayedLoading(isLoading, delay = 150) {
  const [showSpinner, setShowSpinner] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setShowSpinner(false);
      return;
    }
    const timer = setTimeout(() => setShowSpinner(true), delay);
    return () => clearTimeout(timer);
  }, [isLoading, delay]);

  return showSpinner;
}
