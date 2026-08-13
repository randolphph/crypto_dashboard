import { activityFingerprint } from './identity';
import type {
  LedgerAccount,
  LedgerActivity,
  LedgerInstrumentType,
  LedgerSide,
} from '@/types/ledger';

export const LEDGER_CSV_HEADER =
  'occurred_at_day,occurred_at_time,symbol,name,side,quantity,price,currency,fee';

export const LEDGER_EXPORT_CSV_HEADER =
  'account,occurred_at,market,symbol,name,instrument_type,operation,underlying,expiry,strike,option_type,side,quantity,price,currency,commission,tax,other_fee,fee_rate,position_after,mark_price,index_price,settlement_price,cash_flow,external_id,note';

export interface CsvImportResult {
  activities: LedgerActivity[];
  errors: string[];
}

function parseRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field.trim());
      field = '';
    } else if (char === '\n') {
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    rows.push(row);
  }
  return rows.filter((cells) => cells.some(Boolean));
}

const ALIASES: Record<string, string[]> = {
  account: ['account', '账户'],
  occurred_at: ['occurred_at', '成交时间', '时间', '日期'],
  occurred_at_day: ['occurred_at_day', '成交日期'],
  occurred_at_time: ['occurred_at_time', '成交时刻'],
  market: ['market', '市场'],
  symbol: ['symbol', '代码', '证券代码', '产品'],
  name: ['name', '名称', '证券名称'],
  instrument_type: ['instrument_type', '类型', '资产类型'],
  operation: ['operation', '交易标签', '操作'],
  underlying: ['underlying', '标的资产'],
  expiry: ['expiry', '到期日'],
  strike: ['strike', '行权价'],
  option_type: ['option_type', '期权类型'],
  side: ['side', '方向', '买卖', '买卖方'],
  quantity: ['quantity', '数量', '成交数量'],
  price: ['price', '价格', '成交价格'],
  currency: ['currency', '币种'],
  fee: ['fee', '费用', '收取的费用'],
  commission: ['commission', '佣金', '手续费'],
  tax: ['tax', '税费', '印花税'],
  other_fee: ['other_fee', '其他费用'],
  external_id: ['external_id', '成交编号', 'execution_id'],
  note: ['note', '备注'],
  position_after: ['position_after', '仓位'],
  mark_price: ['mark_price', '标记价格'],
  index_price: ['index_price', '指数价格'],
  settlement_price: ['settlement_price', 'settlement price', '结算价格'],
  cash_flow: ['cash_flow', '现金流'],
  fee_rate: ['fee_rate', '交易费'],
};

function headerIndex(headers: string[], field: string): number {
  const normalized = headers.map((header) => header.trim().toLowerCase());
  return ALIASES[field].findIndex((alias) => normalized.includes(alias.toLowerCase())) >= 0
    ? normalized.findIndex((header) =>
        ALIASES[field].some((alias) => alias.toLowerCase() === header)
      )
    : -1;
}

function parseNumber(value: string | undefined, fallback = 0): number {
  if (!value?.trim()) return fallback;
  const parsed = Number(value.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function parseOccurredAt(value: string, day = '', time = ''): number {
  const trimmed = value.trim();
  const compactDay = day.trim();
  if (/^\d{8}$/.test(compactDay)) {
    const year = Number(compactDay.slice(0, 4));
    const month = Number(compactDay.slice(4, 6));
    const date = Number(compactDay.slice(6, 8));
    const timeParts = time.trim().split(':').map(Number);
    const hour = Number.isFinite(timeParts[0]) ? timeParts[0] : 0;
    const minute = Number.isFinite(timeParts[1]) ? timeParts[1] : 0;
    const second = Number.isFinite(timeParts[2]) ? timeParts[2] : 0;
    const timestamp = new Date(year, month - 1, date, hour, minute, second).getTime();
    const check = new Date(timestamp);
    if (
      check.getFullYear() === year &&
      check.getMonth() === month - 1 &&
      check.getDate() === date &&
      check.getHours() === hour &&
      check.getMinutes() === minute &&
      check.getSeconds() === second
    ) return timestamp;
    return Number.NaN;
  }
  if (/^\d{10}$/.test(trimmed)) return Number(trimmed) * 1000;
  if (/^\d{13}$/.test(trimmed)) return Number(trimmed);
  const deribitDate = trimmed.match(
    /^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s+(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/
  );
  if (deribitDate) {
    const months: Record<string, number> = {
      JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
      JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
    };
    const month = months[deribitDate[2].toUpperCase()];
    if (month === undefined) return Number.NaN;
    return new Date(
      Number(deribitDate[3]),
      month,
      Number(deribitDate[1]),
      Number(deribitDate[4]),
      Number(deribitDate[5]),
      Number(deribitDate[6]),
      Number((deribitDate[7] ?? '').padEnd(3, '0'))
    ).getTime();
  }
  return new Date(trimmed.replace(' ', 'T')).getTime();
}

function parseSide(value: string): LedgerSide | null {
  const normalized = value.trim().toLowerCase();
  const words = normalized.split(/\s+/);
  if (['buy', 'b', '买', '买入'].includes(normalized) || words.includes('buy')) return 'buy';
  if (['sell', 's', '卖', '卖出'].includes(normalized) || words.includes('sell')) return 'sell';
  return null;
}

function parseInstrumentType(value: string): LedgerInstrumentType | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized || ['stock', '股票'].includes(normalized)) return 'stock';
  if (['option', '期权'].includes(normalized)) return 'option';
  if (['crypto', 'crypto_spot', 'spot', '加密', '加密货币', '现货'].includes(normalized)) return 'crypto_spot';
  if (['crypto_perp', 'perp', 'perpetual', '永续', '永续合约'].includes(normalized)) return 'crypto_perp';
  if (['future', 'futures', '期货'].includes(normalized)) return 'future';
  return null;
}

function parseOperation(value: string): LedgerActivity['operation'] {
  const normalized = value.trim().toLowerCase();
  if (['open', '建仓'].includes(normalized) || normalized.includes('open ')) return 'open';
  if (['add', '加仓'].includes(normalized)) return 'add';
  if (['reduce', '减仓'].includes(normalized)) return 'reduce';
  if (['close', '清仓'].includes(normalized) || normalized.includes('close ')) return 'close';
  if (['reverse', '反向开仓'].includes(normalized)) return 'reverse';
  if (['opening', '期初仓位'].includes(normalized)) return 'opening';
  return 'trade';
}

function parseDeribitInstrument(symbol: string): {
  instrumentType: LedgerInstrumentType;
  underlying?: string;
  expiry?: string;
  strike?: number;
  optionType?: 'call' | 'put';
  name?: string;
  currency?: string;
} | null {
  const option = symbol.match(/^([A-Z0-9]+)-(\d{1,2})([A-Z]{3})(\d{2})-(\d+(?:\.\d+)?)-([CP])$/i);
  if (option) {
    const months: Record<string, string> = {
      JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
      JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
    };
    const underlying = option[1].toUpperCase();
    const month = months[option[3].toUpperCase()];
    if (!month) return null;
    const expiry = `20${option[4]}-${month}-${option[2].padStart(2, '0')}`;
    const strike = Number(option[5]);
    const optionType = option[6].toUpperCase() === 'C' ? 'call' : 'put';
    return {
      instrumentType: 'option',
      underlying,
      expiry,
      strike,
      optionType,
      name: `${underlying} ${optionType === 'call' ? 'Call' : 'Put'} · ${strike.toLocaleString('en-US')} · ${expiry}`,
      currency: underlying,
    };
  }
  const spot = symbol.match(/^([A-Z0-9]+)_([A-Z0-9]+)$/i);
  if (spot) {
    return {
      instrumentType: 'crypto_spot',
      underlying: spot[1].toUpperCase(),
      name: `${spot[1].toUpperCase()}/${spot[2].toUpperCase()} 现货`,
      currency: spot[2].toUpperCase(),
    };
  }
  return null;
}

function parseOptionalNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = parseNumber(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function makeId(): string {
  return `act-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function parseLedgerCsv(
  text: string,
  accounts: LedgerAccount[],
  defaultAccountId: string,
  existingActivities: LedgerActivity[]
): CsvImportResult {
  const rows = parseRows(text.replace(/^\uFEFF/, ''));
  if (rows.length < 2) return { activities: [], errors: ['CSV 中没有可导入的数据'] };

  const headers = rows[0];
  const indexes = Object.fromEntries(
    Object.keys(ALIASES).map((field) => [field, headerIndex(headers, field)])
  );
  const required = ['symbol', 'side', 'quantity', 'price'];
  const missing = required.filter((field) => indexes[field] < 0);
  if (indexes.occurred_at < 0 && indexes.occurred_at_day < 0) {
    missing.unshift('occurred_at_day');
  }
  if (indexes.occurred_at < 0 && indexes.occurred_at_day >= 0 && indexes.occurred_at_time < 0) {
    missing.push('occurred_at_time');
  }
  if (missing.length > 0) {
    return { activities: [], errors: [`缺少必要列：${missing.join(', ')}`] };
  }

  const accountByName = new Map<string, LedgerAccount>();
  for (const account of accounts) {
    accountByName.set(account.id.toLowerCase(), account);
    accountByName.set(account.name.toLowerCase(), account);
    accountByName.set(account.platform.toLowerCase(), account);
  }
  const fallbackAccount = accounts.find((account) => account.id === defaultAccountId);
  const existingExternalIds = new Set(
    existingActivities
      .filter((activity) => activity.externalId)
      .map((activity) => `${activity.accountId}|${activity.externalId}`)
  );
  const existingFingerprints = new Set(existingActivities.map(activityFingerprint));
  const activities: LedgerActivity[] = [];
  const errors: string[] = [];
  const now = Date.now();

  const cell = (row: string[], field: string): string => {
    const index = indexes[field];
    return index >= 0 ? row[index] ?? '' : '';
  };

  rows.slice(1).forEach((row, rowIndex) => {
    const displayRow = rowIndex + 2;
    const accountValue = cell(row, 'account').toLowerCase();
    const account = accountValue ? accountByName.get(accountValue) : fallbackAccount;
    const occurredAt = parseOccurredAt(
      cell(row, 'occurred_at'),
      cell(row, 'occurred_at_day'),
      cell(row, 'occurred_at_time')
    );
    const side = parseSide(cell(row, 'side'));
    const rawSymbol = cell(row, 'symbol').trim().toUpperCase();
    const deribitInstrument = account?.platform === 'deribit'
      ? parseDeribitInstrument(rawSymbol)
      : null;
    const instrumentTypeValue = cell(row, 'instrument_type');
    const instrumentType = instrumentTypeValue.trim()
      ? parseInstrumentType(instrumentTypeValue) ?? deribitInstrument?.instrumentType ?? null
      : account?.platform === 'deribit'
        ? deribitInstrument?.instrumentType ?? 'option'
        : account && ['binance', 'okx'].includes(account.platform)
          ? 'crypto_spot'
          : 'stock';
    const quantity = parseNumber(cell(row, 'quantity'));
    const price = parseNumber(cell(row, 'price'));
    const commissionValue = cell(row, 'commission');
    const commission = parseNumber(
      commissionValue.trim() ? commissionValue : cell(row, 'fee')
    );
    const tax = parseNumber(cell(row, 'tax'));
    const otherFee = parseNumber(cell(row, 'other_fee'));
    const strikeValue = cell(row, 'strike');
    const strike = strikeValue ? parseNumber(strikeValue) : undefined;
    const symbol = account?.platform === 'ths' && /^\d{1,6}$/.test(rawSymbol)
      ? rawSymbol.padStart(6, '0')
      : rawSymbol;

    if (!account) return errors.push(`第 ${displayRow} 行：找不到目标账户`);
    if (!Number.isFinite(occurredAt)) return errors.push(`第 ${displayRow} 行：成交时间无效`);
    if (!symbol) return errors.push(`第 ${displayRow} 行：证券代码为空`);
    if (!side) return errors.push(`第 ${displayRow} 行：买卖方向无效`);
    if (!instrumentType) return errors.push(`第 ${displayRow} 行：资产类型无效`);
    if (!(quantity > 0)) return errors.push(`第 ${displayRow} 行：数量必须大于 0`);
    if (!(price >= 0)) return errors.push(`第 ${displayRow} 行：价格无效`);
    if (![commission, tax, otherFee].every((value) => Number.isFinite(value) && value >= 0)) {
      return errors.push(`第 ${displayRow} 行：费用无效`);
    }
    if (strike !== undefined && !(strike > 0)) return errors.push(`第 ${displayRow} 行：行权价无效`);

    const optionTypeRaw = cell(row, 'option_type').trim().toLowerCase();
    const optionType = ['call', 'c', '认购'].includes(optionTypeRaw)
      ? 'call' as const
      : ['put', 'p', '认沽'].includes(optionTypeRaw)
        ? 'put' as const
        : undefined;

    const externalId = cell(row, 'external_id').trim() || undefined;
    const rawActivityType = instrumentTypeValue.trim().toLowerCase();
    const sideValue = cell(row, 'side');
    const activity: LedgerActivity = {
      id: makeId(),
      accountId: account.id,
      kind: rawActivityType === 'delivery' ? 'delivery' : 'trade',
      occurredAt,
      recordedAt: now,
      confirmedAt: now,
      instrumentType,
      market: cell(row, 'market').trim().toUpperCase() || (
        ['binance', 'okx', 'deribit'].includes(account.platform)
          ? 'CRYPTO'
          : account.platform === 'ths'
            ? 'A'
            : 'US'
      ),
      symbol,
      name: cell(row, 'name').trim() || deribitInstrument?.name || undefined,
      underlying: cell(row, 'underlying').trim().toUpperCase() || deribitInstrument?.underlying,
      expiry: cell(row, 'expiry').trim() || deribitInstrument?.expiry,
      strike: strike ?? deribitInstrument?.strike,
      optionType: optionType ?? deribitInstrument?.optionType,
      side,
      quantity,
      price,
      currency: cell(row, 'currency').trim().toUpperCase() || deribitInstrument?.currency || account.baseCurrency,
      multiplier: instrumentType === 'option' && account.platform !== 'deribit' ? 100 : 1,
      commission,
      tax,
      otherFee,
      feeRate: parseOptionalNumber(cell(row, 'fee_rate')),
      positionAfter: parseOptionalNumber(cell(row, 'position_after')),
      markPrice: parseOptionalNumber(cell(row, 'mark_price')),
      indexPrice: parseOptionalNumber(cell(row, 'index_price')),
      settlementPrice: parseOptionalNumber(cell(row, 'settlement_price')),
      cashFlow: parseOptionalNumber(cell(row, 'cash_flow')),
      status: 'confirmed',
      source: 'csv',
      externalId,
      note: cell(row, 'note').trim() || undefined,
      operation: rawActivityType === 'delivery'
        ? 'close'
        : parseOperation(cell(row, 'operation') || sideValue),
    };
    const externalKey = externalId ? `${account.id}|${externalId}` : null;
    const fingerprint = activityFingerprint(activity);
    if ((externalKey && existingExternalIds.has(externalKey)) || existingFingerprints.has(fingerprint)) {
      return;
    }
    if (externalKey) existingExternalIds.add(externalKey);
    existingFingerprints.add(fingerprint);
    activities.push(activity);
  });

  return { activities, errors };
}
