'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * Keep the tracker showing what is actually in the database.
 *
 * Until this existed the only refresh was the one that followed an action, so
 * an application arriving while the tab was open never appeared. On a phone at
 * a gate the tab is open for hours and backgrounded for most of them, which is
 * exactly when new applications land.
 *
 * Polling rather than Supabase realtime, deliberately. Realtime runs from the
 * browser on the anon key, and row level security on vendor_applications denies
 * anon everything: those rows carry signed agreement records, email addresses
 * and phone numbers. Subscribing from the client would mean opening read access
 * to that table to make a live feed work, which is a bad trade for a page that
 * one person looks at. A poll re-renders the existing server component, which
 * is already behind the admin session and already reads with the service role
 * key, so nothing new is exposed and there is no second data path to keep
 * honest.
 *
 * Three triggers, one floor:
 *
 *   - every INTERVAL_MS while the tab is visible
 *   - the moment it becomes visible again
 *   - on window focus, for a desktop tab that never went hidden
 *
 * Focus and visibility fire together when returning to a backgrounded tab, and
 * a phone can fire them repeatedly while switching apps, so every path goes
 * through one function that refuses to run twice inside MIN_GAP_MS. The timer
 * does not run at all while hidden: a tab left open overnight should cost
 * nothing, not two queries a minute until morning.
 */

/** Thirty seconds. Applications arrive in ones, not floods. */
const INTERVAL_MS = 30_000;

/** No two refreshes closer together than this, whatever asked for them. */
const MIN_GAP_MS = 10_000;

export function useLiveRefresh(refresh: () => void): void {
  const lastRun = useRef(0);
  const saved = useRef(refresh);

  // Kept in a ref so changing the callback does not tear down the timer and
  // the listeners on every render.
  useEffect(() => {
    saved.current = refresh;
  }, [refresh]);

  const run = useCallback((force = false) => {
    const now = Date.now();
    if (!force && now - lastRun.current < MIN_GAP_MS) return;
    lastRun.current = now;
    saved.current();
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer !== null) return;
      timer = setInterval(() => run(), INTERVAL_MS);
    };

    const stop = () => {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        run();
        start();
      } else {
        stop();
      }
    };

    const onFocus = () => run();

    if (document.visibilityState === 'visible') start();

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, [run]);
}
