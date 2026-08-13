export type LedgerPlatform =
  | 'ibkr'
  | 'longport'
  | 'ths'
  | 'binance'
  | 'okx'
  | 'deribit'
  | 'manual';

export type LedgerSyncMode = 'api' | 'manual' | 'csv';

export interface LedgerAccount {
  id: string;
  name: string;
  platform: LedgerPlatform;
  baseCurrency: string;
  syncMode: LedgerSyncMode;
  enabled: boolean;
  createdAt: number;
}

export type LedgerInstrumentType =
  | 'stock'
  | 'option'
  | 'crypto_spot'
  | 'crypto_perp'
  | 'future';
export type LedgerSide = 'buy' | 'sell';
export type LedgerActivityKind = 'trade' | 'opening_position' | 'delivery';
export type LedgerActivitySource = 'manual' | 'csv' | 'api';
export type LedgerConfirmationStatus =
  | 'provisional'
  | 'confirmed'
  | 'unmatched'
  | 'cancelled'
  | 'corrected';

export interface LedgerActivity {
  id: string;
  accountId: string;
  kind: LedgerActivityKind;
  occurredAt: number;
  recordedAt: number;
  confirmedAt?: number;
  instrumentType: LedgerInstrumentType;
  market: string;
  symbol: string;
  name?: string;
  underlying?: string;
  expiry?: string;
  strike?: number;
  optionType?: 'call' | 'put';
  side: LedgerSide;
  quantity: number;
  price: number;
  currency: string;
  multiplier: number;
  commission: number;
  tax: number;
  otherFee: number;
  feeRate?: number;
  positionAfter?: number;
  markPrice?: number;
  indexPrice?: number;
  settlementPrice?: number;
  cashFlow?: number;
  status: LedgerConfirmationStatus;
  source: LedgerActivitySource;
  externalId?: string;
  importBatchId?: string;
  note?: string;
  operation: LedgerOperation | 'trade';
}

export interface LedgerImportBatch {
  id: string;
  fileName: string;
  importedAt: number;
  inserted: number;
  skipped: number;
  errorCount: number;
}

export type LedgerOperation =
  | 'opening'
  | 'open'
  | 'add'
  | 'reduce'
  | 'close'
  | 'reverse';

export const LEDGER_OPERATION_LABEL: Record<LedgerOperation, string> = {
  opening: '期初仓位',
  open: '建仓',
  add: '加仓',
  reduce: '减仓',
  close: '清仓',
  reverse: '反向开仓',
};

export const LEDGER_PLATFORM_LABEL: Record<LedgerPlatform, string> = {
  ibkr: 'IBKR',
  longport: '长桥',
  ths: 'A 股',
  binance: 'Binance',
  okx: 'OKX',
  deribit: 'Deribit',
  manual: '其他手工账户',
};

export const LEDGER_INSTRUMENT_LABEL: Record<LedgerInstrumentType, string> = {
  stock: '股票',
  option: '期权',
  crypto_spot: '现货',
  crypto_perp: '永续合约',
  future: '期货',
};
