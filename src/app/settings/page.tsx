'use client';

import { RefreshSettings } from '@/components/settings/RefreshSettings';
import { ApiKeySettings } from '@/components/settings/ApiKeySettings';
import { ReceiptTokenSettings } from '@/components/settings/ReceiptTokenSettings';
import { CashFlowSettings } from '@/components/settings/CashFlowSettings';

export default function SettingsPage() {
  return (
    <div className="max-w-4xl space-y-8">
      <h1 className="text-2xl font-bold">设置</h1>
      <p className="text-sm text-muted-foreground">
        持仓、钱包、券商现金等数据录入已移至看板各分页头部的「添加」按钮。
        此页面仅保留数据源连接与图表行为配置。
      </p>
      <ApiKeySettings />
      <RefreshSettings />
      <CashFlowSettings />
      <ReceiptTokenSettings />
    </div>
  );
}
