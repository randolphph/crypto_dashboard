import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { activityFingerprint } from '@/lib/ledger/identity';
import { mergeDailyActivities } from '@/lib/ledger/aggregate';
import type {
  LedgerAccount,
  LedgerActivity,
  LedgerImportBatch,
} from '@/types/ledger';

const createdAt = Date.now();
const DEFAULT_ACCOUNTS: LedgerAccount[] = [
  {
    id: 'account-binance-main',
    name: 'Binance',
    platform: 'binance',
    baseCurrency: 'USDT',
    syncMode: 'api',
    enabled: true,
    createdAt,
  },
  {
    id: 'account-okx-main',
    name: 'OKX',
    platform: 'okx',
    baseCurrency: 'USDT',
    syncMode: 'api',
    enabled: true,
    createdAt,
  },
  {
    id: 'account-deribit-main',
    name: 'Deribit',
    platform: 'deribit',
    baseCurrency: 'USD',
    syncMode: 'api',
    enabled: true,
    createdAt,
  },
  {
    id: 'account-ibkr-main',
    name: 'IBKR',
    platform: 'ibkr',
    baseCurrency: 'USD',
    syncMode: 'api',
    enabled: true,
    createdAt,
  },
  {
    id: 'account-longport-main',
    name: '长桥',
    platform: 'longport',
    baseCurrency: 'HKD',
    syncMode: 'api',
    enabled: true,
    createdAt,
  },
  {
    id: 'account-a-share-manual',
    name: 'A 股手工账户',
    platform: 'ths',
    baseCurrency: 'CNY',
    syncMode: 'manual',
    enabled: true,
    createdAt,
  },
];

type NewActivity = Omit<LedgerActivity, 'id' | 'recordedAt'>;
type NewAccount = Omit<LedgerAccount, 'id' | 'createdAt'>;

interface LedgerState {
  accounts: LedgerAccount[];
  activities: LedgerActivity[];
  importBatches: LedgerImportBatch[];
  addAccount: (account: NewAccount) => void;
  addActivity: (activity: NewActivity) => void;
  importActivities: (
    activities: LedgerActivity[],
    meta: { fileName: string; errorCount: number }
  ) => { inserted: number; skipped: number };
  removeActivity: (id: string) => void;
  removeImportBatch: (batchId: string) => number;
  setActivityStatus: (id: string, status: LedgerActivity['status']) => void;
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const useLedgerStore = create<LedgerState>()(
  persist(
    (set) => ({
      accounts: DEFAULT_ACCOUNTS,
      activities: [],
      importBatches: [],
      addAccount: (account) =>
        set((state) => ({
          accounts: [
            ...state.accounts,
            { ...account, id: makeId('account'), createdAt: Date.now() },
          ],
        })),
      addActivity: (activity) =>
        set((state) => ({
          activities: mergeDailyActivities([
            ...state.activities,
            { ...activity, id: makeId('activity'), recordedAt: Date.now() },
          ]),
        })),
      importActivities: (incoming, meta) => {
        let result = { inserted: 0, skipped: 0 };
        set((state) => {
          const externalIds = new Set(
            state.activities
              .flatMap((activity) =>
                [activity.externalId, ...(activity.sourceExternalIds ?? [])]
                  .filter((externalId): externalId is string => !!externalId)
                  .map((externalId) => `${activity.accountId}|${externalId}`)
              )
          );
          const fingerprints = new Set(state.activities.map(activityFingerprint));
          const batchId = makeId('batch');
          const accepted: LedgerActivity[] = [];
          for (const activity of incoming) {
            const externalKey = activity.externalId
              ? `${activity.accountId}|${activity.externalId}`
              : null;
            const fingerprint = activityFingerprint(activity);
            if (
              (externalKey && externalIds.has(externalKey)) ||
              fingerprints.has(fingerprint)
            ) {
              result.skipped++;
              continue;
            }
            if (externalKey) externalIds.add(externalKey);
            fingerprints.add(fingerprint);
            accepted.push({ ...activity, importBatchId: batchId });
            result.inserted++;
          }
          const batch: LedgerImportBatch = {
            id: batchId,
            fileName: meta.fileName,
            importedAt: Date.now(),
            inserted: result.inserted,
            skipped: result.skipped,
            errorCount: meta.errorCount,
          };
          return {
            activities: mergeDailyActivities([...state.activities, ...accepted]),
            // Automatic API polling can see the same Last Business Day report
            // repeatedly. Keep its idempotent no-op runs out of import history.
            importBatches:
              accepted.length > 0 || meta.errorCount > 0
                ? [batch, ...state.importBatches]
                : state.importBatches,
          };
        });
        return result;
      },
      removeActivity: (id) =>
        set((state) => ({
          activities: state.activities.filter((activity) => activity.id !== id),
        })),
      removeImportBatch: (batchId) => {
        let removed = 0;
        set((state) => {
          removed = state.activities.filter(
            (activity) => activity.importBatchId === batchId
          ).length;
          return {
            activities: state.activities.filter(
              (activity) => activity.importBatchId !== batchId
            ),
            importBatches: state.importBatches.filter(
              (batch) => batch.id !== batchId
            ),
          };
        });
        return removed;
      },
      setActivityStatus: (id, status) =>
        set((state) => ({
          activities: state.activities.map((activity) =>
            activity.id === id
              ? {
                  ...activity,
                  status,
                  confirmedAt: status === 'confirmed' ? Date.now() : activity.confirmedAt,
                }
              : activity
          ),
        })),
    }),
    {
      name: 'crypto-dashboard-ledger',
      version: 3,
      migrate: (persisted) => {
        const state = persisted as LedgerState;
        const accounts = state?.accounts ?? [];
        const existingPlatforms = new Set(accounts.map((account) => account.platform));
        return {
          ...state,
          accounts: [
            ...accounts,
            ...DEFAULT_ACCOUNTS.filter((account) => !existingPlatforms.has(account.platform)),
          ],
          activities: mergeDailyActivities(
            (state?.activities ?? []).map((activity) => ({
              ...activity,
              instrumentType:
                (activity.instrumentType as string) === 'crypto'
                  ? 'crypto_spot'
                  : activity.instrumentType,
              operation: activity.operation ?? 'trade',
            }))
          ),
          importBatches: state?.importBatches ?? [],
        } as LedgerState;
      },
    }
  )
);
