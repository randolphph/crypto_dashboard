import { useEffect, useRef } from 'react';
import type { SnapshotPayload } from '@/types/snapshot';
import { snapshotFingerprint } from '@/lib/portfolio/snapshot';

// Don't spam the backend: even if Dashboard re-renders many times we only
// push when content changed AND at least this much time has elapsed. 4h is
// a good balance — enough granularity to see intraday moves a few times,
// but not so frequent that the DB fills with near-duplicate rows.
const MIN_INTERVAL_MS = 4 * 60 * 60 * 1000;

interface Options {
  enabled: boolean;
}

export function useSnapshotPush(
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
    fetch('/api/snapshot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(async (res) => {
        if (res.ok) {
          lastSentAtRef.current = Date.now();
          lastFingerprintRef.current = fp;
        } else {
          const text = await res.text().catch(() => '');
          console.warn('[snapshot] backend rejected:', res.status, text);
        }
      })
      .catch((err) => {
        console.warn('[snapshot] push failed:', err);
      })
      .finally(() => {
        inFlightRef.current = false;
      });
  }, [enabled, payload]);
}
