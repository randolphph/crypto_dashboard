'use client';

import { useBankAccountStore } from '@/stores/bankAccountStore';
import { usePrivacyFormat } from '@/hooks/usePrivacyFormat';
import { useFx } from '@/hooks/useFx';
import { SourceIcon } from './SourceIcon';
import type { StockCurrency } from '@/types/stocks';

// USD value of a single bank-cash row, using the same FX rates the rest of
// the dashboard consumes. Returns 0 if FX hasn't loaded yet — the rollup will
// just understate temporarily.
function toUsd(
  amount: number,
  currency: StockCurrency,
  fx: { cnyUsd: number; hkdUsd: number; krwUsd: number } | undefined
): number {
  if (!fx) return currency === 'USD' ? amount : 0;
  switch (currency) {
    case 'USD': return amount;
    case 'CNY': return amount * fx.cnyUsd;
    case 'HKD': return amount * fx.hkdUsd;
    case 'KRW': return amount * fx.krwUsd;
  }
}

export function CashSection() {
  const accounts = useBankAccountStore((s) => s.accounts);
  const fxQuery = useFx();
  const { fmtUsd, mask } = usePrivacyFormat();

  if (accounts.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center">
        <p className="text-muted-foreground">
          暂未添加银行账户，点击右上角「添加银行」开始记录。
        </p>
      </div>
    );
  }

  const fx = fxQuery.data;

  // Group by bank for the card layout. Each card shows per-currency rows
  // with their USD equivalent so the user can see both原始 and aggregated.
  const groups = new Map<string, typeof accounts>();
  for (const a of accounts) {
    if (!groups.has(a.bank)) groups.set(a.bank, []);
    groups.get(a.bank)!.push(a);
  }

  const totalUsd = accounts.reduce(
    (s, a) => s + toUsd(a.amount, a.currency, fx),
    0
  );

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-5 shadow-sm flex items-center justify-between">
        <div>
          <p className="text-xs uppercase text-muted-foreground">银行现金合计</p>
          <p className="text-2xl font-semibold tabular-nums">{fmtUsd(totalUsd)}</p>
        </div>
        {!fx && (
          <p className="text-xs text-muted-foreground">汇率加载中…</p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {Array.from(groups.entries()).map(([bank, items]) => {
          const subtotal = items.reduce(
            (s, a) => s + toUsd(a.amount, a.currency, fx),
            0
          );
          return (
            <div key={bank} className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold flex items-center gap-1.5">
                  <SourceIcon label={bank} className="h-4 w-4" />
                  {bank}
                </h3>
                <span className="text-sm font-medium tabular-nums">
                  {fmtUsd(subtotal)}
                </span>
              </div>
              <div className="space-y-1.5">
                {items.map((a) => {
                  const usd = toUsd(a.amount, a.currency, fx);
                  return (
                    <div
                      key={a.id}
                      className="flex items-center justify-between py-1.5 text-sm border-b last:border-0"
                    >
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">
                          {a.currency}
                        </span>
                        <span className="tabular-nums">
                          {mask(a.amount.toLocaleString())}
                        </span>
                        {a.note && (
                          <span className="text-xs text-muted-foreground">
                            {a.note}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        ≈ {fmtUsd(usd)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
