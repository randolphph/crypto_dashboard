import type { StockPosition, StocksData } from '@/types/stocks';

interface Contract {
  underlying?: string;
  optionType?: 'call' | 'put';
  strike?: number;
  expiry?: string;
}

function expiryDate(value: string | undefined): string | undefined {
  if (!value || !/^(\d{8}|\d{4}-\d{2}-\d{2})$/.test(value)) return undefined;
  const compact = value?.replaceAll('-', '');
  if (!compact || !/^\d{8}$/.test(compact)) return undefined;
  const year = Number(compact.slice(0, 4)), month = Number(compact.slice(4, 6)), day = Number(compact.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}
const positive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;
const optionType = (raw: string | undefined) => /^(C|CALL)$/i.test(raw ?? '') ? 'call' as const : /^(P|PUT)$/i.test(raw ?? '') ? 'put' as const : undefined;

// OSI: root (optionally space padded), YYMMDD, C/P, strike × 1000.
// Require the complete standard shape and a real expiry date before decoding.
export function parseOptionSymbol(raw: string | undefined): Contract | null {
  const value = raw?.trim().toUpperCase().replace(/\.US$/, '');
  if (!value) return null;
  const osi = value.match(/^([A-Z0-9.]{1,6})\s*(\d{6})([CP])(\d{8})$/);
  if (osi) {
    const expiry = expiryDate(`20${osi[2]}`);
    const strike = Number(osi[4]) / 1000;
    return expiry && positive(strike) ? { underlying: osi[1], expiry, strike, optionType: optionType(osi[3]) } : null;
  }
  // IBKR Flex descriptions, e.g. "COHR 30OCT26 235 P".
  const description = value.match(/^([A-Z0-9.]{1,10})\s+(\d{1,2})([A-Z]{3})(\d{2}|\d{4})\s+(\d+(?:\.\d+)?)\s+(C|P|CALL|PUT)$/);
  if (!description) return null;
  const months: Record<string, string> = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
  const year = description[4].length === 2 ? `20${description[4]}` : description[4];
  const expiry = expiryDate(`${year}${months[description[3]] ?? ''}${description[2].padStart(2, '0')}`);
  const strike = Number(description[5]);
  return expiry && positive(strike) ? { underlying: description[1], expiry, strike, optionType: optionType(description[6]) } : null;
}

export function optionContract(position: Pick<StockPosition, 'id' | 'symbol' | 'name' | 'optionType' | 'strike' | 'expiry'>): Contract {
  const parts = position.id.startsWith('ibkr:pos:') ? position.id.split(':') : [];
  const fromSymbol = parseOptionSymbol(position.symbol);
  const parsed = fromSymbol ?? parseOptionSymbol(parts[2]) ?? parseOptionSymbol(position.name);
  const bareSymbol = position.symbol.trim().toUpperCase().replace(/\.US$/, '');
  const idStrike = parts[3]?.trim() ? Number(parts[3]) : undefined;
  return {
    underlying: fromSymbol?.underlying ?? (/^[A-Z0-9][A-Z0-9.-]{0,15}$/.test(bareSymbol) ? bareSymbol : parsed?.underlying),
    optionType: optionType(position.optionType) ?? optionType(parts[5]) ?? parsed?.optionType,
    strike: positive(position.strike) ? position.strike : positive(idStrike) ? idStrike : parsed?.strike,
    expiry: expiryDate(position.expiry) ?? expiryDate(parts[4]) ?? parsed?.expiry,
  };
}

export function normalizeOptionPosition<T extends StockPosition>(position: T): T {
  if (position.kind !== 'option') return position;
  const { underlying, ...contract } = optionContract(position);
  return { ...position, ...contract, symbol: underlying ?? position.symbol };
}

// Also normalize old React Query responses so an already cached browser result
// uses the stock ticker when assembling supplemental underlying quote requests.
export function normalizeStockData(data: StocksData): StocksData {
  return { ...data, brokers: data.brokers.map(broker => ({ ...broker, positions: broker.positions.map(normalizeOptionPosition) })) };
}
