const DECIMAL_PATTERN = /^([+-]?)(\d+)(?:\.(\d+))?$/;

function decimalParts(value: string) {
  const match = DECIMAL_PATTERN.exec(value.trim());
  if (!match) return null;
  const sign = match[1] === '-' ? -1 : 1;
  const integer = (match[2] ?? '0').replace(/^0+(?=\d)/, '');
  const fraction = (match[3] ?? '').replace(/0+$/, '');
  return { sign, integer, fraction };
}

export function compareDecimalStrings(left: string, right: string): number {
  const a = decimalParts(left);
  const b = decimalParts(right);
  if (!a || !b) return left.localeCompare(right);
  if (a.sign !== b.sign) return a.sign - b.sign;
  if (a.integer.length !== b.integer.length) {
    return (a.integer.length - b.integer.length) * a.sign;
  }
  const integerComparison = a.integer.localeCompare(b.integer);
  if (integerComparison !== 0) return integerComparison * a.sign;
  const width = Math.max(a.fraction.length, b.fraction.length);
  return (
    a.fraction.padEnd(width, '0').localeCompare(b.fraction.padEnd(width, '0')) *
    a.sign
  );
}

export function formatDecimalString(
  value: string | null,
  maximumFractionDigits = 4
): string {
  if (value === null) return '—';
  const parts = decimalParts(value);
  if (!parts) return value;

  const groupedInteger = parts.integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fraction = parts.fraction.slice(0, maximumFractionDigits);
  const sign = parts.sign < 0 ? '-' : '';
  return `${sign}${groupedInteger}${fraction ? `.${fraction}` : ''}`;
}

export function formatDateTime(value: string | null): string {
  if (!value) return '尚无数据';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

export function calculateBlockProgress(
  scannedThroughBlock: string | null,
  chainTipBlock: string | null
): number | null {
  if (scannedThroughBlock === null || chainTipBlock === null) return null;
  try {
    const scanned = BigInt(scannedThroughBlock);
    const tip = BigInt(chainTipBlock);
    const zero = BigInt(0);
    const tenThousand = BigInt(10_000);
    if (tip <= zero) return 0;
    const basisPoints = (scanned * tenThousand) / tip;
    const clamped =
      basisPoints < zero
        ? zero
        : basisPoints > tenThousand
          ? tenThousand
          : basisPoints;
    return Number(clamped) / 100;
  } catch {
    return null;
  }
}
