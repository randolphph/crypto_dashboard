'use client';

import { WalletManager } from '@/components/settings/WalletManager';
import { RefreshSettings } from '@/components/settings/RefreshSettings';
import { ApiKeySettings } from '@/components/settings/ApiKeySettings';

export default function SettingsPage() {
  return (
    <div className="max-w-4xl space-y-8">
      <h1 className="text-2xl font-bold">设置</h1>
      <ApiKeySettings />
      <RefreshSettings />
      <WalletManager />
    </div>
  );
}
