'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

const MIN_GAP_MS = 30_000;

/** How long the page was hidden, if long enough that GPS tracking visibly stopped. */
export function gapOnReturn(hiddenAt: number | null, now: number, minMs = MIN_GAP_MS): number | null {
  if (hiddenAt === null) return null;
  const gap = now - hiddenAt;
  return gap >= minMs ? gap : null;
}

/**
 * Browsers stop GPS while the screen is locked or the app is in the background. This reports
 * the last such gap during an active inspection so the PPJ knows part of the route is missing.
 */
export function useBackgroundGap(active: boolean): { lastGapMs: number | null; dismiss: () => void } {
  const hiddenAt = useRef<number | null>(null);
  const [lastGapMs, setLastGapMs] = useState<number | null>(null);
  useEffect(() => {
    if (!active) { hiddenAt.current = null; return; }
    const change = () => {
      if (document.visibilityState === 'hidden') { hiddenAt.current = Date.now(); return; }
      const gap = gapOnReturn(hiddenAt.current, Date.now());
      hiddenAt.current = null;
      if (gap !== null) setLastGapMs(gap);
    };
    document.addEventListener('visibilitychange', change);
    return () => document.removeEventListener('visibilitychange', change);
  }, [active]);
  const dismiss = useCallback(() => setLastGapMs(null), []);
  return { lastGapMs, dismiss };
}
