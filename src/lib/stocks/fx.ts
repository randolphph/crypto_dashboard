import 'server-only';
import type { FxRates } from '@/types/stocks';

const FX_URL =
  'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json';
const FX_FALLBACK =
  'https://latest.currency-api.pages.dev/v1/currencies/usd.json';

export async function fetchFx(): Promise<FxRates> {
  for (const url of [FX_URL, FX_FALLBACK]) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) continue;
      const data = await res.json();
      const rates = data?.usd;
      const cnyPerUsd = Number(rates?.cny);
      const hkdPerUsd = Number(rates?.hkd);
      const krwPerUsd = Number(rates?.krw);
      if (
        Number.isFinite(cnyPerUsd) &&
        cnyPerUsd > 0 &&
        Number.isFinite(hkdPerUsd) &&
        hkdPerUsd > 0 &&
        Number.isFinite(krwPerUsd) &&
        krwPerUsd > 0
      ) {
        return {
          cnyUsd: 1 / cnyPerUsd,
          hkdUsd: 1 / hkdPerUsd,
          krwUsd: 1 / krwPerUsd,
        };
      }
    } catch {
      // try next
    }
  }
  throw new Error('FX rates unavailable');
}
