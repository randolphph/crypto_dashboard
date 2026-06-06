import { useEffect, useRef } from 'react';
import type { SnapshotPayload } from '@/types/snapshot';
import { snapshotFingerprint } from '@/lib/portfolio/snapshot';
import { appendSnapshot } from '@/lib/snapshot/store';

// Auto-snapshot ≥ every 12h with content-fingerprint dedup. Long enough that
// the rolling DB doesn't fill with intraday near-dupes; users who want
// finer-grained samples can hit the manual button from the settings panel.
const MIN_INTERVAL_MS = 12 * 60 * 60 * 1000;

interface Options {
  enabled: boolean;
}

// Persists the dashboard snapshot. Primary write is to IndexedDB (lives in
// the browser, survives Mac-mini outages). Secondary best-effort POST to the
// legacy /api/snapshot proxy — if MNAV_API_BASE is unset or the upstream is
// down, that just no-ops; the IDB write already succeeded so user state is
// safe.
export function useSnapshotPersist(
  payload: SnapshotPayload | null,
  { enabled }: Options
) {
  const lastSentAtRef = useRef<number>(0);
  const lastFingerprintRef = useRef<string>('');
  const inFlightRef = useRef<boolean>(false);

  useEffect(() => {
    if (!enabled || !payload) return;
    if (inFlightRef.current) return;
    if (payload.positions.length === 0) return;

    const now = Date.now();
    if (now - lastSentAtRef.current < MIN_INTERVAL_MS) return;

    const fp = snapshotFingerprint(payload);
    if (fp === lastFingerprintRef.current) return;

    inFlightRef.current = true;

    (async () => {
      try {
        await appendSnapshot(payload);
        lastSentAtRef.current = Date.now();
        lastFingerprintRef.current = fp;

        // Best-effort write-through to the legacy backend. Fire and forget;
        // swallow any failure so a dead Mac-mini never blocks the UI.
        fetch('/api/snapshot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).catch(() => {
          // silent
        });
      } catch (err) {
        console.warn('[snapshot persist] indexeddb write failed:', err);
      } finally {
        inFlightRef.current = false;
      }
    })();
  }, [enabled, payload]);
}
