const DECIMAL_PATTERN = /^\+?(\d+)(?:\.(\d+))?$/;

function parseUnsignedDecimal(value: string) {
  const match = value.trim().match(DECIMAL_PATTERN);
  if (!match) throw new Error('请输入普通正数，不能使用科学计数法');
  const integer = match[1].replace(/^0+(?=\d)/, '');
  const fraction = match[2] ?? '';
  return {
    coefficient: BigInt(`${integer}${fraction}` || '0'),
    scale: fraction.length,
  };
}

function formatCoefficient(coefficient: bigint, scale: number) {
  if (coefficient === BigInt(0)) return '0';
  const digits = coefficient.toString().padStart(scale + 1, '0');
  if (scale === 0) return digits;
  const integer = digits.slice(0, -scale);
  const fraction = digits.slice(-scale).replace(/0+$/, '');
  return fraction ? `${integer}.${fraction}` : integer;
}

export function isPositiveDecimal(value: string) {
  try {
    return parseUnsignedDecimal(value).coefficient > BigInt(0);
  } catch {
    return false;
  }
}

export function isNonNegativeDecimal(value: string) {
  try {
    return parseUnsignedDecimal(value).coefficient >= BigInt(0);
  } catch {
    return false;
  }
}

export function multiplyDecimalDown(left: string, right: string, maxDecimals: number) {
  const a = parseUnsignedDecimal(left);
  const b = parseUnsignedDecimal(right);
  const product = a.coefficient * b.coefficient;
  const productScale = a.scale + b.scale;
  if (productScale <= maxDecimals) {
    return formatCoefficient(product * (BigInt(10) ** BigInt(maxDecimals - productScale)), maxDecimals);
  }
  return formatCoefficient(product / (BigInt(10) ** BigInt(productScale - maxDecimals)), maxDecimals);
}
