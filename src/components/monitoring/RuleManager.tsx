'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { BellPlus, CircleOff, LoaderCircle, Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateRule, useDeleteRule, useRules, useUpdateRule } from '@/hooks/useCryptoSentry';
import type {
  CryptoSentryMonitor, IntegrationCatalog, RuleCondition, RuleCreateInput, RuleGroup, RuleMetricDefinition, RuleOperator,
} from '@/types/cryptoSentry';

const OPERATOR_LABEL: Record<RuleOperator, string> = { gt: '>', gte: '≥', lt: '<', lte: '≤', eq: '=', neq: '≠' };
type DraftCondition = RuleCondition & { labelsText: string };

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
    if (index < 1 || !segment.slice(index + 1).trim()) throw new Error(`Label 格式错误：${segment.trim()}`);
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
  const [name, setName] = useState(rule?.name ?? '');
  const [combinator, setCombinator] = useState<'and' | 'or'>(rule?.combinator ?? 'and');
  const [conditions, setConditions] = useState<DraftCondition[]>(rule?.conditions.map((condition) => ({
    ...condition, labelsText: Object.entries(condition.labels).map(([key, value]) => `${key}=${value}`).join(', '),
  })) ?? [emptyCondition(metrics[0])]);
  const [duration, setDuration] = useState(String(rule?.durationSeconds ?? 0));
  const [cooldown, setCooldown] = useState(String(rule?.cooldownSeconds ?? 1800));
  const [severity, setSeverity] = useState<RuleCreateInput['severity']>(rule?.severity ?? 'warning');
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
      if (hasEvent && durationSeconds > 0) throw new Error('事件指标不能设置非零持续时间');
      setSubmitting(true); setError(null);
      await onSave({ monitorId: monitor.id, name: name.trim(), combinator, conditions: normalized, durationSeconds, cooldownSeconds, severity, notificationIntegrationIds: [], enabled: rule?.enabled ?? true });
      onOpenChange(false);
    } catch (submissionError) { setError(submissionError instanceof Error ? submissionError.message : '规则保存失败'); }
    finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-3xl">
        <form onSubmit={submit} className="contents">
          <DialogHeader><DialogTitle>{rule ? '编辑规则组' : '添加规则组'}</DialogTitle><DialogDescription>条件采用一层 AND / OR 简单组合；指标、operator、窗口和可用版本均来自后端 Catalog。</DialogDescription></DialogHeader>
          <div className="space-y-5 py-1">
            <div className="grid gap-4 sm:grid-cols-[1fr_150px_150px]">
              <div className="space-y-2"><Label htmlFor="rule-name">名称</Label><Input id="rule-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：BTC 放量上涨" /></div>
              <div className="space-y-2"><Label>组合关系</Label><select value={combinator} onChange={(event) => setCombinator(event.target.value as 'and' | 'or')} className="h-8 w-full rounded-lg border bg-background px-2 text-sm"><option value="and">全部满足（AND）</option><option value="or">任一满足（OR）</option></select></div>
              <div className="space-y-2"><Label>严重级别</Label><select value={severity} onChange={(event) => setSeverity(event.target.value as RuleCreateInput['severity'])} className="h-8 w-full rounded-lg border bg-background px-2 text-sm"><option value="info">提示</option><option value="warning">警告</option><option value="critical">严重</option><option value="emergency">紧急</option></select></div>
            </div>

            <div className="space-y-3">
              {conditions.map((condition, index) => {
                const definition = metrics.find((metric) => metric.id === condition.metric) ?? metrics[0];
                return <div key={index} className="rounded-xl border p-4"><div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><Badge variant="outline">条件 {index + 1}</Badge>{index > 0 ? <Badge variant="secondary">{combinator.toUpperCase()}</Badge> : null}</div>{conditions.length > 1 ? <Button type="button" variant="ghost" size="icon-sm" onClick={() => setConditions((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 /></Button> : null}</div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="space-y-2 sm:col-span-2"><Label>指标</Label><select value={condition.metric} onChange={(event) => { const next = metrics.find((metric) => metric.id === event.target.value); updateCondition(index, emptyCondition(next)); }} className="h-8 w-full rounded-lg border bg-background px-2 text-sm">{metrics.map((metric) => <option key={metric.id} value={metric.id}>{metric.name} · {metric.kind === 'event' ? '事件' : metric.units[0]}</option>)}</select></div><div className="space-y-2"><Label>Operator</Label><select value={condition.operator} onChange={(event) => updateCondition(index, { operator: event.target.value as RuleOperator })} className="h-8 w-full rounded-lg border bg-background px-2 text-sm">{definition?.operators.map((operator) => <option key={operator} value={operator}>{OPERATOR_LABEL[operator]} ({operator})</option>)}</select></div><div className="space-y-2"><Label>阈值</Label>{definition?.valueType === 'boolean' ? <select value={condition.threshold} onChange={(event) => updateCondition(index, { threshold: event.target.value })} className="h-8 w-full rounded-lg border bg-background px-2 text-sm"><option value="true">True</option><option value="false">False</option></select> : <Input value={condition.threshold} onChange={(event) => updateCondition(index, { threshold: event.target.value })} placeholder="decimal string" />}</div></div><div className="mt-3 grid gap-3 sm:grid-cols-3">{definition?.requiresWindow ? <div className="space-y-2"><Label>窗口（秒）</Label><Input type="number" min={definition.windowSecondsMin} max={definition.windowSecondsMax} value={condition.windowSeconds ?? definition.windowSecondsMin} onChange={(event) => updateCondition(index, { windowSeconds: Number(event.target.value) })} /></div> : null}<div className="space-y-2"><Label>Hysteresis</Label><Input value={condition.hysteresis} onChange={(event) => updateCondition(index, { hysteresis: event.target.value })} /></div><div className="space-y-2 sm:col-span-2"><Label>精确标签（可选）</Label><Input value={condition.labelsText} onChange={(event) => updateCondition(index, { labelsText: event.target.value })} placeholder={definition?.labels.filter((label) => label !== 'windowSeconds').slice(0, 3).map((label) => `${label}=…`).join(', ') || 'key=value'} /></div></div></div>;
              })}
              <Button type="button" variant="outline" onClick={() => setConditions((current) => [...current, emptyCondition(metrics[0])])} disabled={conditions.length >= 20}><Plus />添加条件</Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="rule-duration">持续满足（秒）</Label><Input id="rule-duration" type="number" min={0} max={86400} value={duration} onChange={(event) => setDuration(event.target.value)} /><p className="text-xs text-muted-foreground">事件条件必须为 0；unknown 不累计时长。</p></div><div className="space-y-2"><Label htmlFor="rule-cooldown">重复提醒冷却（秒）</Label><Input id="rule-cooldown" type="number" min={0} max={604800} value={cooldown} onChange={(event) => setCooldown(event.target.value)} /></div></div>
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button><Button type="submit" disabled={submitting}>{submitting ? <LoaderCircle className="animate-spin" /> : null}{submitting ? '正在保存' : '保存规则组'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RuleManager({ monitor, catalog }: { monitor: CryptoSentryMonitor; catalog: IntegrationCatalog }) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<RuleGroup | null>(null);
  const rulesQuery = useRules();
  const createRule = useCreateRule();
  const updateRule = useUpdateRule();
  const deleteRule = useDeleteRule();
  const rules = (rulesQuery.data ?? []).filter((rule) => rule.monitorId === monitor.id);

  return (
    <Card>
      <CardHeader><div className="flex items-center justify-between gap-3"><div><CardTitle className="flex items-center gap-2"><BellPlus className="size-4" />告警规则</CardTitle><p className="mt-1 text-xs text-muted-foreground">Monitor 负责采集；Rule Group 独立启停和组合条件。</p></div><Button size="sm" onClick={() => setCreating(true)}><Plus />添加规则</Button></div></CardHeader>
      <CardContent className="space-y-2">
        {rulesQuery.isLoading ? <div className="h-16 animate-pulse rounded-lg bg-muted" /> : null}
        {rules.length === 0 && !rulesQuery.isLoading ? <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">尚未创建规则；此 Monitor 仍会持续采集快照。</p> : null}
        {rules.map((rule) => <div key={rule.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><div><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{rule.name}</p><Badge variant={rule.enabled ? 'outline' : 'secondary'}>{rule.enabled ? '已启用' : '已停用'}</Badge><Badge variant="secondary">{rule.conditions.length} 条 · {rule.combinator.toUpperCase()}</Badge><Badge variant="outline">{rule.severity}</Badge></div><p className="mt-1 text-xs text-muted-foreground">持续 {rule.durationSeconds}s · 冷却 {rule.cooldownSeconds}s</p></div><div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => setEditing(rule)}><Pencil />编辑</Button><Button size="sm" variant="ghost" onClick={() => updateRule.mutate({ id: rule.id, patch: { enabled: !rule.enabled } })}><CircleOff />{rule.enabled ? '停用' : '启用'}</Button><Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => { if (window.confirm(`删除规则“${rule.name}”？`)) deleteRule.mutate(rule.id); }}><Trash2 /></Button></div></div>)}
      </CardContent>
      {creating ? <RuleDialog open onOpenChange={setCreating} monitor={monitor} catalog={catalog} onSave={(input) => createRule.mutateAsync(input)} /> : null}
      {editing ? <RuleDialog key={editing.id} open onOpenChange={(open) => !open && setEditing(null)} monitor={monitor} catalog={catalog} rule={editing} onSave={(input) => updateRule.mutateAsync({ id: editing.id, patch: input })} /> : null}
    </Card>
  );
}
