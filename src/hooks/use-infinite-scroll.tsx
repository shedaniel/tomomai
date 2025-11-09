import { useEffect, useRef } from "react";

/**
 * Hook for infinite scroll detection
 * @param callback Function to call when sentinel is visible
 * @param enabled Whether the hook is enabled
 * @returns Ref to attach to sentinel element
 */
export function useInfiniteScroll(callback: () => void, enabled: boolean) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled || !sentinelRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          callback();
        }
      },
      { threshold: 0.1, rootMargin: '200px' }
    );

    observer.observe(sentinelRef.current);

    return () => observer.disconnect();
  }, [callback, enabled]);

  return sentinelRef;
}

