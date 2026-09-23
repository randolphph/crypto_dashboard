'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { BellPlus, CircleOff, Clock3, LoaderCircle, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateRule, useDeleteRule, useRules, useTelegramIntegrations, useUpdateRule } from '@/hooks/useCryptoSentry';
import type {
  CryptoSentryMonitor, IntegrationCatalog, RuleCondition, RuleCreateInput, RuleGroup, RuleMetricDefinition, RuleOperator,
} from '@/types/cryptoSentry';

const OPERATOR_LABEL: Record<RuleOperator, string> = {
  gt: '超过（>）', gte: '达到或超过（≥）', lt: '低于（<）', lte: '达到或低于（≤）', eq: '等于（=）', neq: '不等于（≠）',
};
const SEVERITY_LABEL: Record<RuleCreateInput['severity'], string> = {
  info: '提示', warning: '警告', critical: '严重', emergency: '紧急',
};
const UNIT_LABEL: Record<string, string> = {
  quote_asset: '报价币', base_asset: '基础币', percent: '%', unix_milliseconds: '毫秒时间戳',
  contracts: '合约', seconds: '秒', ratio: '倍', boolean: '', base_currency: '基础计价单位',
  token: '代币', token0: 'Token0', token1: 'Token1', tick: 'Tick', liquidity: '流动性单位',
  positions: '个', USD: 'USD',
};
type DraftCondition = RuleCondition & { labelsText: string };

function unitLabel(metric?: RuleMetricDefinition, monitor?: CryptoSentryMonitor): string {
  const unit = metric?.units[0];
  const canonicalSymbol = typeof monitor?.config.canonicalSymbol === 'string' ? monitor.config.canonicalSymbol : '';
  const [baseAsset, quoteAsset] = canonicalSymbol.split('/');
  if (unit === 'base_asset' && baseAsset) return baseAsset;
  if (unit === 'quote_asset' && quoteAsset) return quoteAsset;
  return unit ? UNIT_LABEL[unit] ?? unit : '';
}

function formatSeconds(seconds: number): string {
  if (seconds === 0) return '0 秒';
  if (seconds % 86_400 === 0) return `${seconds / 86_400} 天`;
  if (seconds % 3_600 === 0) return `${seconds / 3_600} 小时`;
  if (seconds % 60 === 0) return `${seconds / 60} 分钟`;
  return `${seconds} 秒`;
}

function metricHelp(metric?: RuleMetricDefinition): string {
  if (!metric) return '请选择要观察的数据。';
  const help: Record<string, string> = {
    price: '监控最新成交价是否到达目标价格。',
    price_change_percent: '监控所选时间内的价格涨跌幅；上涨为正数，下跌为负数。',
    funding_rate_percent: '监控永续合约资金费率；正数表示多头支付空头。',
    open_interest: '监控市场当前未平仓合约数量。',
    open_interest_change_percent: '监控所选时间内未平仓量的增减幅度。',
    data_age_seconds: '监控行情多久没有更新，适合发现数据源中断。',
    health_factor: '监控 Aave 健康因子；数值越低，清算风险越高。',
    in_range: '监控 LP 仓位是否仍在价格区间内。',
    distance_to_nearest_boundary_percent: '监控当前价格距离 LP 区间边界还有多远。',
    position_closed: '监控 LP 仓位是否已经关闭。',
  };
  if (help[metric.id]) return help[metric.id];
  if (metric.kind === 'event') return `监控是否出现“${metric.name}”。`;
  if (metric.valueType === 'boolean') return `监控“${metric.name}”是否为指定状态。`;
  return `监控“${metric.name}”是否达到设定值。`;
}

function conditionSummary(condition: RuleCondition, metric?: RuleMetricDefinition, monitor?: CryptoSentryMonitor): string {
  if (!metric) return '请选择指标';
  const unit = unitLabel(metric, monitor);
  const formattedUnit = unit === '%' ? '%' : unit ? ` ${unit}` : '';
  const value = metric.valueType === 'boolean'
    ? condition.threshold === 'true' ? '是' : '否'
    : `${condition.threshold || '…'}${formattedUnit}`;
  const window = metric.requiresWindow && condition.windowSeconds
    ? `，统计 ${formatSeconds(condition.windowSeconds)}`
    : '';
  return `${metric.name} ${OPERATOR_LABEL[condition.operator]} ${value}${window}`;
}

function emptyCondition(metric?: RuleMetricDefinition): DraftCondition {
  return {
    metric: metric?.id ?? '', labels: {}, labelsText: '', operator: metric?.operators[0] ?? 'gte',
    threshold: metric?.valueType === 'boolean' ? 'true' : '', hysteresis: '0',
    ...(metric?.requiresWindow ? { windowSeconds: metric.windowSecondsMin ?? 20 } : {}),
  };
}

function parseLabels(text: string): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const segment of text.split(/[\n,]/)) {
    if (!segment.trim()) continue;
    const index = segment.indexOf('=');
    if (index < 1 || !segment.slice(index + 1).trim()) throw new Error(`筛选条件格式错误：${segment.trim()}`);
    labels[segment.slice(0, index).trim()] = segment.slice(index + 1).trim();
  }
  return labels;
}

function metricOptions(catalog: IntegrationCatalog, monitor: CryptoSentryMonitor) {
  const normalizedType = monitor.type === 'aave_position'
    ? 'aave_account'
    : monitor.type === 'lp_position'
      ? monitor.config.walletAddress ? 'uniswap_wallet' : 'uniswap_position'
      : monitor.type;
  const metrics = catalog.ruleMetrics[normalizedType] ?? [];
  return metrics.filter((metric) => {
    const marketType = monitor.config.marketType;
    if (marketType && metric.marketTypes && !metric.marketTypes.includes(marketType)) return false;
    const chainId = monitor.config.chainId;
    if (chainId && metric.chainIds && !metric.chainIds.includes(chainId)) return false;
    const version = monitor.config.version;
    if (version && metric.versions && !metric.versions.includes(version)) return false;
    return true;
  });
}

interface RuleDialogProps {
  open: boolean; onOpenChange: (open: boolean) => void; monitor: CryptoSentryMonitor;
  catalog: IntegrationCatalog; rule?: RuleGroup;
  onSave: (input: RuleCreateInput) => Promise<unknown>;
}

function RuleDialog({ open, onOpenChange, monitor, catalog, rule, onSave }: RuleDialogProps) {
  const metrics = useMemo(() => metricOptions(catalog, monitor), [catalog, monitor]);
  const telegramQuery = useTelegramIntegrations();
  const [name, setName] = useState(rule?.name ?? '');
  const [combinator, setCombinator] = useState<'and' | 'or'>(rule?.combinator ?? 'and');
  const [conditions, setConditions] = useState<DraftCondition[]>(rule?.conditions.map((condition) => ({
    ...condition, labelsText: Object.entries(condition.labels).map(([key, value]) => `${key}=${value}`).join(', '),
  })) ?? [emptyCondition(metrics[0])]);
  const [duration, setDuration] = useState(String(rule?.durationSeconds ?? 0));
  const [cooldown, setCooldown] = useState(String(rule?.cooldownSeconds ?? 1800));
  const [severity, setSeverity] = useState<RuleCreateInput['severity']>(rule?.severity ?? 'warning');
  const [notificationIds, setNotificationIds] = useState<string[]>(rule?.notificationIntegrationIds ?? []);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const updateCondition = (index: number, patch: Partial<DraftCondition>) => {
    setConditions((current) => current.map((condition, conditionIndex) => conditionIndex === index ? { ...condition, ...patch } : condition));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return setError('请输入规则名称');
    const durationSeconds = Number(duration);
    const cooldownSeconds = Number(cooldown);
    if (!Number.isInteger(durationSeconds) || durationSeconds < 0) return setError('持续时间必须是非负整数');
    if (!Number.isInteger(cooldownSeconds) || cooldownSeconds < 0) return setError('冷却时间必须是非负整数');
    try {
      const normalized = conditions.map(({ labelsText, ...condition }) => {
        if (!condition.metric || !condition.threshold.trim()) throw new Error('每个条件都要选择指标并填写阈值');
        return { ...condition, labels: parseLabels(labelsText) };
      });
      const hasEvent = normalized.some((condition) => metrics.find((metric) => metric.id === condition.metric)?.kind === 'event');
      if (hasEvent && durationSeconds > 0) throw new Error('事件类指标只能选择“满足后立即告警”（0 秒）');
      setSubmitting(true); setError(null);
      await onSave({ monitorId: monitor.id, name: name.trim(), combinator, conditions: normalized, durationSeconds, cooldownSeconds, severity, notificationIntegrationIds: notificationIds, enabled: rule?.enabled ?? true });
      onOpenChange(false);
    } catch (submissionError) { setError(submissionError instanceof Error ? submissionError.message : '规则保存失败'); }
    finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-3xl">
        <form onSubmit={submit} className="contents">
          <DialogHeader><DialogTitle>{rule ? '编辑告警规则' : '添加告警规则'}</DialogTitle><DialogDescription>选择要监控的指标和触发条件。满足条件后会生成告警，并通知你选择的 Telegram 目标。</DialogDescription></DialogHeader>
          <div className="space-y-5 py-1">
            <div className="grid gap-4 sm:grid-cols-[1fr_150px_150px]">
              <div className="space-y-2"><Label htmlFor="rule-name">规则名称</Label><Input id="rule-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：BTC 5 分钟上涨 3%" /></div>
              <div className="space-y-2"><Label htmlFor="rule-combinator">多个条件</Label><select id="rule-combinator" value={combinator} onChange={(event) => setCombinator(event.target.value as 'and' | 'or')} className="h-8 w-full rounded-lg border bg-background px-2 text-sm"><option value="and">必须全部满足</option><option value="or">满足任意一个</option></select></div>
              <div className="space-y-2"><Label htmlFor="rule-severity">告警级别</Label><select id="rule-severity" value={severity} onChange={(event) => setSeverity(event.target.value as RuleCreateInput['severity'])} className="h-8 w-full rounded-lg border bg-background px-2 text-sm"><option value="info">提示</option><option value="warning">警告</option><option value="critical">严重</option><option value="emergency">紧急</option></select></div>
            </div>

            <div className="space-y-3">
              {conditions.map((condition, index) => {
                const definition = metrics.find((metric) => metric.id === condition.metric) ?? metrics[0];
                const metricId = `rule-metric-${index}`;
                const operatorId = `rule-operator-${index}`;
                const thresholdId = `rule-threshold-${index}`;
                const windowId = `rule-window-${index}`;
                const hysteresisId = `rule-hysteresis-${index}`;
                const labelsId = `rule-labels-${index}`;
                return <div key={index} className="rounded-xl border p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">条件 {index + 1}</Badge>{index > 0 ? <Badge variant="secondary">{combinator === 'and' ? '并且' : '或者'}</Badge> : null}</div><p className="mt-2 text-sm font-medium">{conditionSummary(condition, definition, monitor)}</p></div>
                    {conditions.length > 1 ? <Button type="button" variant="ghost" size="icon-sm" aria-label={`删除条件 ${index + 1}`} onClick={() => setConditions((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 /></Button> : null}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-2 sm:col-span-2"><Label htmlFor={metricId}>监控指标</Label><select id={metricId} value={condition.metric} onChange={(event) => { const next = metrics.find((metric) => metric.id === event.target.value); updateCondition(index, emptyCondition(next)); }} className="h-8 w-full rounded-lg border bg-background px-2 text-sm">{metrics.map((metric) => <option key={metric.id} value={metric.id}>{metric.name}{metric.kind === 'event' ? '（事件）' : unitLabel(metric, monitor) ? `（${unitLabel(metric, monitor)}）` : ''}</option>)}</select><p className="text-xs text-muted-foreground">{metricHelp(definition)}</p></div>
                    <div className="space-y-2"><Label htmlFor={operatorId}>触发条件</Label><select id={operatorId} value={condition.operator} onChange={(event) => updateCondition(index, { operator: event.target.value as RuleOperator })} className="h-8 w-full rounded-lg border bg-background px-2 text-sm">{definition?.operators.map((operator) => <option key={operator} value={operator}>{OPERATOR_LABEL[operator]}</option>)}</select></div>
                    <div className="space-y-2"><Label htmlFor={thresholdId}>{definition?.valueType === 'boolean' ? '目标状态' : '目标值'}</Label>{definition?.valueType === 'boolean' ? <select id={thresholdId} value={condition.threshold} onChange={(event) => updateCondition(index, { threshold: event.target.value })} className="h-8 w-full rounded-lg border bg-background px-2 text-sm"><option value="true">是</option><option value="false">否</option></select> : <div className="relative"><Input id={thresholdId} inputMode="decimal" value={condition.threshold} onChange={(event) => updateCondition(index, { threshold: event.target.value })} placeholder="输入数值" className={unitLabel(definition, monitor) ? 'pr-20' : undefined} />{unitLabel(definition, monitor) ? <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">{unitLabel(definition, monitor)}</span> : null}</div>}</div>
                  </div>
                  {definition?.requiresWindow ? <div className="mt-3 max-w-xs space-y-2"><Label htmlFor={windowId}>统计周期（秒）</Label><Input id={windowId} type="number" min={definition.windowSecondsMin} max={definition.windowSecondsMax} value={condition.windowSeconds ?? definition.windowSecondsMin} onChange={(event) => updateCondition(index, { windowSeconds: Number(event.target.value) })} /><p className="text-xs text-muted-foreground">当前统计 {formatSeconds(condition.windowSeconds ?? definition.windowSecondsMin ?? 0)}，可填写 {definition.windowSecondsMin}–{definition.windowSecondsMax} 秒。</p></div> : null}
                  <details className="mt-3 rounded-lg bg-muted/45 px-3 py-2 text-sm"><summary className="cursor-pointer font-medium">高级选项</summary><div className="mt-3 grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor={hysteresisId}>恢复缓冲</Label><Input id={hysteresisId} inputMode="decimal" value={condition.hysteresis} onChange={(event) => updateCondition(index, { hysteresis: event.target.value })} /><p className="text-xs text-muted-foreground">避免指标在阈值附近波动时反复告警；不需要时保持 0。</p></div><div className="space-y-2"><Label htmlFor={labelsId}>限定特定资产或仓位</Label><Input id={labelsId} value={condition.labelsText} onChange={(event) => updateCondition(index, { labelsText: event.target.value })} placeholder={definition?.labels.filter((label) => label !== 'windowSeconds').slice(0, 3).map((label) => `${label}=…`).join(', ') || '通常留空'} /><p className="text-xs text-muted-foreground">通常留空。只有同一监控包含多个资产或仓位时才需要填写。</p></div></div></details>
                </div>;
              })}
              <Button type="button" variant="outline" onClick={() => setConditions((current) => [...current, emptyCondition(metrics[0])])} disabled={conditions.length >= 20}><Plus />添加条件</Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="rule-duration">条件持续多久后告警（秒）</Label><Input id="rule-duration" type="number" min={0} max={86400} value={duration} onChange={(event) => setDuration(event.target.value)} /><p className="text-xs text-muted-foreground">{Number(duration) === 0 ? '满足后立即告警。' : `持续满足 ${formatSeconds(Number(duration) || 0)}后才告警，可减少短暂波动。`}</p></div><div className="space-y-2"><Label htmlFor="rule-cooldown">两次提醒至少间隔（秒）</Label><Input id="rule-cooldown" type="number" min={0} max={604800} value={cooldown} onChange={(event) => setCooldown(event.target.value)} /><p className="text-xs text-muted-foreground">{Number(cooldown) === 0 ? '不限制重复提醒间隔。' : `同一告警 ${formatSeconds(Number(cooldown) || 0)}内不会重复提醒。`}</p></div></div>
            <div className="space-y-2 rounded-xl border p-4">
              <p className="text-sm font-medium">Telegram 通知目标</p>
              <p className="text-xs text-muted-foreground">只在规则触发时向选中的目标发送；不选择则仅记录站内告警。</p>
              {telegramQuery.error ? <p role="alert" className="text-xs text-destructive">无法读取通知目标：{telegramQuery.error.message}</p> : null}
              {telegramQuery.isLoading ? <p className="text-xs text-muted-foreground">正在读取通知目标…</p> : null}
              {telegramQuery.data?.length === 0 ? <p className="text-xs text-muted-foreground">请先在「数据源与通知」中添加 Telegram 目标。</p> : null}
              <div className="grid gap-2 sm:grid-cols-2">{telegramQuery.data?.map((integration) => <label key={integration.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><input type="checkbox" checked={notificationIds.includes(integration.id)} disabled={!integration.enabled && !notificationIds.includes(integration.id)} onChange={() => setNotificationIds((current) => current.includes(integration.id) ? current.filter((id) => id !== integration.id) : [...current, integration.id])} /><span className="min-w-0 truncate">{integration.name}</span>{!integration.enabled ? <Badge variant="secondary">已停用</Badge> : null}</label>)}</div>
              {notificationIds.some((id) => !telegramQuery.data?.some((integration) => integration.id === id)) ? <p className="text-xs text-amber-600">部分原通知目标未能读取，保存时会保留其关联。</p> : null}
            </div>
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button><Button type="submit" disabled={submitting}>{submitting ? <LoaderCircle className="animate-spin" /> : null}{submitting ? '正在保存' : '保存规则'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RuleManager({ monitor, catalog }: { monitor: CryptoSentryMonitor; catalog: IntegrationCatalog }) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<RuleGroup | null>(null);
  const rulesQuery = useRules();
  const telegramQuery = useTelegramIntegrations();
  const createRule = useCreateRule();
  const updateRule = useUpdateRule();
  const deleteRule = useDeleteRule();
  const rules = (rulesQuery.data ?? []).filter((rule) => rule.monitorId === monitor.id);
  const availableMetrics = useMemo(() => metricOptions(catalog, monitor), [catalog, monitor]);

  return (
    <Card>
      <CardHeader><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="flex size-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600"><BellPlus className="size-4" /></span><div><CardTitle>告警规则</CardTitle><p className="text-xs text-muted-foreground">{rules.length ? `${rules.filter((rule) => rule.enabled).length} 条启用` : '尚未设置'}</p></div></div><Button size="sm" onClick={() => setCreating(true)}><Plus />添加规则</Button></div></CardHeader>
      <CardContent className="space-y-2">
        {rulesQuery.isLoading ? <div className="h-16 animate-pulse rounded-lg bg-muted" /> : null}
        {rules.length === 0 && !rulesQuery.isLoading ? <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">尚未创建规则；此 Monitor 仍会持续采集快照。</p> : null}
        {rules.map((rule) => <div key={rule.id} className="overflow-hidden rounded-xl border"><div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"><div className="flex min-w-0 flex-wrap items-center gap-2"><span className={rule.enabled ? 'size-2 rounded-full bg-emerald-500' : 'size-2 rounded-full bg-muted-foreground/40'} /><p className="font-semibold">{rule.name}</p><Badge variant="secondary" className="rounded-full">{SEVERITY_LABEL[rule.severity]}</Badge><span className="text-xs text-muted-foreground">{rule.conditions.length} 条 · {rule.combinator === 'and' ? '全部满足' : '任一满足'}</span></div><div className="flex gap-0.5"><Button size="icon-sm" variant="ghost" aria-label={`编辑规则 ${rule.name}`} title="编辑" onClick={() => setEditing(rule)}><Pencil /></Button><Button size="icon-sm" variant="ghost" aria-label={`${rule.enabled ? '停用' : '启用'}规则 ${rule.name}`} title={rule.enabled ? '停用' : '启用'} onClick={() => updateRule.mutate({ id: rule.id, patch: { enabled: !rule.enabled } })}><CircleOff /></Button><Button size="icon-sm" variant="ghost" className="text-destructive" aria-label={`删除规则 ${rule.name}`} title="删除" onClick={() => { if (window.confirm(`删除规则“${rule.name}”？`)) deleteRule.mutate(rule.id); }}><Trash2 /></Button></div></div><div className="space-y-1 border-y bg-muted/30 px-4 py-2.5">{rule.conditions.map((condition, index) => <p key={`${condition.metric}-${index}`} className="text-xs text-foreground/80"><span className="mr-1.5 inline-flex size-4 items-center justify-center rounded-full bg-background font-mono text-[9px] text-muted-foreground ring-1 ring-foreground/10">{index + 1}</span>{conditionSummary(condition, availableMetrics.find((metric) => metric.id === condition.metric), monitor)}</p>)}</div><div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-[11px] text-muted-foreground"><span className="flex items-center gap-1"><Clock3 className="size-3" />{rule.durationSeconds === 0 ? '立即触发' : `持续 ${formatSeconds(rule.durationSeconds)}`} · {rule.cooldownSeconds === 0 ? '无冷却' : `冷却 ${formatSeconds(rule.cooldownSeconds)}`}</span><span className="flex items-center gap-1"><Send className="size-3" />{rule.notificationIntegrationIds?.length ? rule.notificationIntegrationIds.map((id) => telegramQuery.data?.find((integration) => integration.id === id)?.name ?? id).join('、') : '仅站内'}</span></div></div>)}
      </CardContent>
      {creating ? <RuleDialog open onOpenChange={setCreating} monitor={monitor} catalog={catalog} onSave={(input) => createRule.mutateAsync(input)} /> : null}
      {editing ? <RuleDialog key={editing.id} open onOpenChange={(open) => !open && setEditing(null)} monitor={monitor} catalog={catalog} rule={editing} onSave={(input) => updateRule.mutateAsync({ id: editing.id, patch: input })} /> : null}
    </Card>
  );
}
