/** XKO is an alternate prefix for the same 20-byte EVM account. */
export function normalizeXLayerAddress(address: string): string {
  const match = /^(?:0x|xko)([a-f0-9]{40})$/i.exec(address.trim());
  if (!match) throw new Error('X Layer 地址格式不正确，请填写 0x 或 XKO 开头的完整地址');
  return `0x${match[1]}`;
}
