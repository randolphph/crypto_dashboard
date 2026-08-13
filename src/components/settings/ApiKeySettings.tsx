'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useApiKeyStore } from '@/stores/apiKeyStore';

function SecretInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm text-muted-foreground">{label}</label>
      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-md border bg-background px-3 py-1.5 text-sm pr-9"
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function CheckboxInput({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded"
      />
      {label}
    </label>
  );
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
  configured: boolean;
}

function Section({ title, children, configured }: SectionProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-secondary/50 transition-colors"
      >
        <span>{title}</span>
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              configured ? 'bg-green-500' : 'bg-muted-foreground/30'
            }`}
          />
          <span className="text-xs text-muted-foreground">
            {configured ? '已配置' : '未配置'}
          </span>
        </div>
      </button>
      {open && <div className="border-t px-4 py-3 space-y-3">{children}</div>}
    </div>
  );
}

export function ApiKeySettings() {
  const store = useApiKeyStore();

  const binanceConfigured = !!(store.binanceApiKey && store.binanceApiSecret);
  const okxConfigured = !!(store.okxApiKey && store.okxApiSecret && store.okxPassphrase);
  const deribitConfigured = !!(store.deribitClientId && store.deribitClientSecret);
  const okxWeb3Configured = !!(
    store.okxWeb3ApiKey &&
    store.okxWeb3ApiSecret &&
    store.okxWeb3Passphrase &&
    store.okxWeb3ProjectId
  );
  const longportConfigured = !!(
    store.longportAppKey &&
    store.longportAppSecret &&
    store.longportAccessToken
  );
  const ibkrConfigured = !!(store.ibkrFlexToken && store.ibkrFlexQueryId);
  const deepseekConfigured = !!store.deepseekApiKey;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">API 密钥</h2>
        <p className="text-sm text-muted-foreground">
          密钥保存在浏览器本地，优先于服务器环境变量使用
        </p>
      </div>

      <div className="space-y-2">
        <Section title="Binance" configured={binanceConfigured}>
          <SecretInput
            label="API Key"
            value={store.binanceApiKey}
            onChange={(v) => store.setKeys({ binanceApiKey: v })}
          />
          <SecretInput
            label="API Secret"
            value={store.binanceApiSecret}
            onChange={(v) => store.setKeys({ binanceApiSecret: v })}
          />
          <CheckboxInput
            label="启用合约网格"
            checked={store.binanceEnableGridBot}
            onChange={(v) => store.setKeys({ binanceEnableGridBot: v })}
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">账本成交交易对</label>
            <input
              type="text"
              value={store.binanceTradeSymbols}
              onChange={(e) => store.setKeys({ binanceTradeSymbols: e.target.value })}
              placeholder="BTCUSDT, ETHUSDT, BTCUSD_PERP"
              className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
            />
            <p className="text-xs text-muted-foreground">
              逗号或换行分隔；用于自动增量同步成交。USDT 交易对会查询现货和 U 本位，BTCUSD_PERP 等查询币本位。
            </p>
          </div>
        </Section>

        <Section title="OKX" configured={okxConfigured}>
          <SecretInput
            label="API Key"
            value={store.okxApiKey}
            onChange={(v) => store.setKeys({ okxApiKey: v })}
          />
          <SecretInput
            label="API Secret"
            value={store.okxApiSecret}
            onChange={(v) => store.setKeys({ okxApiSecret: v })}
          />
          <SecretInput
            label="Passphrase"
            value={store.okxPassphrase}
            onChange={(v) => store.setKeys({ okxPassphrase: v })}
          />
        </Section>

        <Section title="Deribit" configured={deribitConfigured}>
          <SecretInput
            label="Client ID"
            value={store.deribitClientId}
            onChange={(v) => store.setKeys({ deribitClientId: v })}
          />
          <SecretInput
            label="Client Secret"
            value={store.deribitClientSecret}
            onChange={(v) => store.setKeys({ deribitClientSecret: v })}
          />
        </Section>

        <Section title="长桥 (LongPort)" configured={longportConfigured}>
          <SecretInput
            label="App Key"
            value={store.longportAppKey}
            onChange={(v) => store.setKeys({ longportAppKey: v })}
          />
          <SecretInput
            label="App Secret"
            value={store.longportAppSecret}
            onChange={(v) => store.setKeys({ longportAppSecret: v })}
          />
          <SecretInput
            label="Access Token"
            value={store.longportAccessToken}
            onChange={(v) => store.setKeys({ longportAccessToken: v })}
          />
        </Section>

        <Section title="IBKR (Flex Query)" configured={ibkrConfigured}>
          <SecretInput
            label="Flex Token"
            value={store.ibkrFlexToken}
            onChange={(v) => store.setKeys({ ibkrFlexToken: v })}
            placeholder="16 位 token，Configure Flex Web Service 处获取"
          />
          <SecretInput
            label="Query ID"
            value={store.ibkrFlexQueryId}
            onChange={(v) => store.setKeys({ ibkrFlexQueryId: v })}
            placeholder="Custom Flex Query 列表里的数字 ID"
          />
        </Section>

        <Section title="DeepSeek (AI 助手)" configured={deepseekConfigured}>
          <SecretInput
            label="API Key"
            value={store.deepseekApiKey}
            onChange={(v) => store.setKeys({ deepseekApiKey: v })}
            placeholder="sk-… ， platform.deepseek.com/api_keys"
          />
          <p className="text-xs text-muted-foreground">
            前端直接调用 DeepSeek。Key 仅保存在浏览器内存，刷新需重新输入。
          </p>
        </Section>

        <Section title="OKX Web3 (链上查询)" configured={okxWeb3Configured}>
          <SecretInput
            label="API Key"
            value={store.okxWeb3ApiKey}
            onChange={(v) => store.setKeys({ okxWeb3ApiKey: v })}
          />
          <SecretInput
            label="API Secret"
            value={store.okxWeb3ApiSecret}
            onChange={(v) => store.setKeys({ okxWeb3ApiSecret: v })}
          />
          <SecretInput
            label="Passphrase"
            value={store.okxWeb3Passphrase}
            onChange={(v) => store.setKeys({ okxWeb3Passphrase: v })}
          />
          <SecretInput
            label="Project ID"
            value={store.okxWeb3ProjectId}
            onChange={(v) => store.setKeys({ okxWeb3ProjectId: v })}
          />
        </Section>
      </div>
    </div>
  );
}
