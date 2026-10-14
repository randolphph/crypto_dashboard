import { LedgerPage } from '@/components/ledger/LedgerPage';
import { Suspense } from 'react';

export default function TransactionsPage() {
  return <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-muted" />}><LedgerPage /></Suspense>;
}

