import type { AssetBalance } from '@/types/common';

export interface TreemapAccount {
  label: string;
  balances: AssetBalance[];
  error?: string;
}

export interface ExchangeTreeNode {
  id: string;
  name: string;
  value: number;
  account: string;
  balances: AssetBalance[];
  children?: ExchangeTreeNode[];
  other?: boolean;
}

// Values are positive asset equity, never futures notionals. Account rows are
// authoritative: the exchange's flattened balances must not be added again.
export function buildExchangeTreemap(accounts: TreemapAccount[]) {
  let excludedCount = 0;
  const groups: ExchangeTreeNode[] = accounts.flatMap((account, index) => {
    if (account.error) return [];
    const leaves = new Map<string, ExchangeTreeNode>();
    for (const balance of account.balances) {
      if (balance.dedupedToDefi) continue;
      if (!Number.isFinite(balance.usdValue) || balance.usdValue <= 0) {
        if (balance.usdValue !== 0 || balance.amount !== 0) excludedCount++;
        continue;
      }
      const key = JSON.stringify([balance.asset, balance.chainId ?? '', balance.tokenAddress ?? '']);
      const existing = leaves.get(key);
      if (existing) {
        existing.value += balance.usdValue;
        existing.balances.push(balance);
      } else {
        leaves.set(key, { id: `${index}:${key}`, name: balance.asset, value: balance.usdValue, account: account.label, balances: [balance] });
      }
    }
    const children = [...leaves.values()].sort((a, b) => b.value - a.value);
    return children.length ? [{ id: `account:${index}`, name: account.label, account: account.label,
      value: children.reduce((sum, child) => sum + child.value, 0), balances: [], children }] : [];
  });
  const leaves = groups.flatMap(group => group.children ?? []);
  // Reserve one Other tile per account. Long tails remain inspectable in the
  // tooltip and original detail table, without inventing a minimum tile size.
  if (leaves.length > 30) {
    const visible = new Set(leaves.slice().sort((a, b) => b.value - a.value)
      .slice(0, Math.max(0, 30 - groups.length)).map(leaf => leaf.id));
    for (const group of groups) {
      const children = group.children ?? [];
      const rest = children.filter(leaf => !visible.has(leaf.id));
      group.children = children.filter(leaf => visible.has(leaf.id));
      if (rest.length) group.children.push({ id: `${group.id}:other`, name: `其他 ${rest.length} 项`,
        account: group.account, value: rest.reduce((sum, leaf) => sum + leaf.value, 0),
        balances: rest.flatMap(leaf => leaf.balances), other: true });
    }
  }
  return { groups, total: groups.reduce((sum, group) => sum + group.value, 0), assetCount: leaves.length, excludedCount };
}
