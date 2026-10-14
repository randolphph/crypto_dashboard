'use client';

import { useStockPositionStore } from '@/stores/stockPositionStore';
import { useCashBalanceStore } from '@/stores/cashBalanceStore';
import { useLedgerStore } from '@/stores/ledgerStore';
import { planAShareTrade, type AShareTradePlan, type ManualAShareTrade } from './manualTrade';

const PENDING_KEY = 'crypto-dashboard-a-share-pending-trade';
let saving = false;
function storage(): Storage | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}
function completed(id: string) {
  return useLedgerStore.getState().aShareExecutions.some((row) => row.id === id);
}
function durablyCompleted(id: string) {
  const raw = storage()?.getItem('crypto-dashboard-ledger');
  return raw ? (JSON.parse(raw) as { state?: { aShareExecutions?: Array<{ id: string }> } }).state?.aShareExecutions?.some((row) => row.id === id) : false;
}
function finish(plan: AShareTradePlan) {
  // The ledger is written last. A durable execution means both asset stores
  // have already been saved; never replay an old balance after later trades.
  if (!durablyCompleted(plan.activity.id)) {
    const beforePositions = useStockPositionStore.getState().positions;
    const beforeCash = useCashBalanceStore.getState().balances;
    const beforeLedger = useLedgerStore.getState();
    try {
      useStockPositionStore.setState({ positions: plan.positions });
      useCashBalanceStore.setState({ balances: plan.cash });
      useLedgerStore.getState().recordAShareActivity(plan.activity);
      useLedgerStore.setState({});
    } catch {
      // Restore visible state even if storage remains unavailable. The
      // pending journal survives and can complete the operation on retry.
      for (const restore of [
        () => useStockPositionStore.setState({ positions: beforePositions }),
        () => useCashBalanceStore.setState({ balances: beforeCash }),
        () => useLedgerStore.setState({ activities: beforeLedger.activities, aShareExecutions: beforeLedger.aShareExecutions }),
      ]) { try { restore(); } catch { /* Recovery journal remains authoritative. */ } }
      throw new Error('交易保存未完成，请重试或刷新恢复；持仓、现金和账本会一起保存');
    }
  }
  storage()?.removeItem(PENDING_KEY);
  return plan;
}
export function recoverAShareTrade(): AShareTradePlan | null {
  const raw = storage()?.getItem(PENDING_KEY);
  if (!raw) return null;
  const plan = JSON.parse(raw) as AShareTradePlan;
  if (!Array.isArray(plan.positions) || !Array.isArray(plan.cash) || !plan.activity?.id?.startsWith('a-share-trade:')) throw new Error('待恢复交易数据无效，请检查本地交易记录');
  return finish(plan);
}
export function saveAShareTrade(input: ManualAShareTrade) {
  if (saving) throw new Error('交易正在保存，请稍候');
  saving = true;
  try {
    const recovered = recoverAShareTrade();
    const id = `a-share-trade:${input.transactionId}`;
    if (completed(id)) return { recorded: false, plan: recovered };
    const plan = planAShareTrade(useStockPositionStore.getState().positions, useCashBalanceStore.getState().balances, useLedgerStore.getState().accounts, input, Date.now());
    const ls = storage();
    if (!ls) throw new Error('本地存储不可用，交易未保存');
    // Save the complete intended update before changing any store. If a write
    // is interrupted, retry or reload completes this same transaction once.
    ls.setItem(PENDING_KEY, JSON.stringify(plan));
    finish(plan);
    return { recorded: true, plan };
  } finally { saving = false; }
}
