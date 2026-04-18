import { useRef, useState, useCallback, useEffect } from "react";

const THRESHOLD = 72;
const RESIST = 0.45;

export function usePullToRefresh(onRefresh: () => Promise<void>) {
  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [progress, setProgress] = useState(0);
  const startYRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const el = containerRef.current;
    if (!el) return;
    if (el.scrollTop > 0) return;
    startYRef.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (startYRef.current === null) return;
    const el = containerRef.current;
    if (!el || el.scrollTop > 0) { startYRef.current = null; return; }
    const dy = e.touches[0].clientY - startYRef.current;
    if (dy <= 0) return;
    e.preventDefault();
    const clamped = Math.min(dy * RESIST, THRESHOLD * 1.5);
    setProgress(clamped);
    setPulling(true);
  }, []);

  const handleTouchEnd = useCallback(async () => {
    if (!pulling) return;
    setPulling(false);
    if (progress >= THRESHOLD) {
      setRefreshing(true);
      setProgress(THRESHOLD);
      try { await onRefresh(); } finally {
        setRefreshing(false);
        setProgress(0);
      }
    } else {
      setProgress(0);
    }
    startYRef.current = null;
  }, [pulling, progress, onRefresh]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("touchend", handleTouchEnd);
    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return { containerRef, pulling, refreshing, progress, threshold: THRESHOLD };
}
