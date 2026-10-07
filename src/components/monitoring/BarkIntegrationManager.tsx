'use client';

import { useState, type FormEvent } from 'react';
import { BellRing, CircleOff, LoaderCircle, Pencil, Plus, RadioTower, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateBarkIntegration, useDeleteIntegration, useNotificationIntegrations, useSetIntegrationEnabled, useTestNotificationIntegration, useUpdateBarkIntegration } from '@/hooks/useCryptoSentry';
import type { BarkIntegration } from '@/types/cryptoSentry';

function BarkDialog({ integration, onClose }: { integration?: BarkIntegration; onClose: () => void }) {
  const [name, setName] = useState(integration?.name ?? 'Bark 通知');
  const [serverUrl, setServerUrl] = useState(integration?.config.serverUrl ?? 'https://api.day.app');
  const [deviceKey, setDeviceKey] = useState('');
  const [group, setGroup] = useState(integration?.config.group ?? 'CryptoSentry');
  const [error, setError] = useState<string | null>(null);
  const create = useCreateBarkIntegration();
  const update = useUpdateBarkIntegration();
  const saving = create.isPending || update.isPending;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return setError('请输入配置名称');
    setError(null);
    try {
      const input = { name: name.trim(), serverUrl, deviceKey, group };
      if (integration) await update.mutateAsync({ id: integration.id, ...input });
      else await create.mutateAsync(input);
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : '保存 Bark 配置失败');
    }
  };

  return <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
    <DialogContent className="sm:max-w-md">
      <form onSubmit={submit} className="contents">
        <DialogHeader><DialogTitle>{integration ? '编辑 Bark 通知' : '添加 Bark 通知'}</DialogTitle><DialogDescription>打开 iPhone 上的 Bark，复制推送地址或 Device Key。保存后可测试发送，并在告警规则中选择此目标。</DialogDescription></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2"><Label htmlFor="bark-name">配置名称</Label><Input id="bark-name" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} autoComplete="off" /></div>
          <div className="space-y-2"><Label htmlFor="bark-key">Device Key 或推送地址</Label><Input id="bark-key" type="password" value={deviceKey} onChange={(event) => setDeviceKey(event.target.value)} placeholder={integration ? '留空保持现有 Device Key' : 'https://api.day.app/你的DeviceKey'} autoComplete="new-password" /><p className="text-xs text-muted-foreground">{integration ? '现有 Key 不会回显。填写新的推送地址可更换接收设备。' : '支持粘贴 Bark 官方应用的完整示例地址。'}</p></div>
          <div className="space-y-2"><Label htmlFor="bark-server">Bark 服务器地址</Label><Input id="bark-server" value={serverUrl} onChange={(event) => setServerUrl(event.target.value)} placeholder="https://api.day.app" autoComplete="off" /><p className="text-xs text-muted-foreground">默认使用官方服务器。自建服务可填写服务器地址和 Device Key；粘贴推送地址时使用该地址中的服务器。</p></div>
          <div className="space-y-2"><Label htmlFor="bark-group">通知分组</Label><Input id="bark-group" value={group} maxLength={100} onChange={(event) => setGroup(event.target.value)} placeholder="CryptoSentry" autoComplete="off" /><p className="text-xs text-muted-foreground">相同分组的通知会在 Bark 中归到一起，可留空。</p></div>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={onClose}>取消</Button><Button type="submit" disabled={saving}>{saving ? <LoaderCircle className="animate-spin" /> : null}{saving ? '保存中' : '保存配置'}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

export function BarkIntegrationManager() {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<BarkIntegration | null>(null);
  const [deleting, setDeleting] = useState<BarkIntegration | null>(null);
  const [notice, setNotice] = useState<{ message: string; error: boolean } | null>(null);
  const integrations = useNotificationIntegrations();
  const bark = integrations.data?.filter((integration): integration is BarkIntegration => integration.provider === 'bark');
  const test = useTestNotificationIntegration();
  const toggle = useSetIntegrationEnabled();
  const remove = useDeleteIntegration();

  const sendTest = async (integration: BarkIntegration) => {
    setNotice(null);
    try {
      const result = await test.mutateAsync(integration.id);
      setNotice({ message: result.ok ? `“${integration.name}”测试消息已发送，请在 Bark 中查看` : result.error?.message ?? 'Bark 测试未通过', error: !result.ok });
    } catch (error) { setNotice({ message: error instanceof Error ? error.message : 'Bark 测试失败', error: true }); }
  };
  const setEnabled = async (integration: BarkIntegration) => {
    setNotice(null);
    try { await toggle.mutateAsync({ id: integration.id, enabled: !integration.enabled }); }
    catch (error) { setNotice({ message: error instanceof Error ? error.message : '更新状态失败', error: true }); }
  };
  const deleteIntegration = async () => {
    if (!deleting) return;
    setNotice(null);
    try { await remove.mutateAsync(deleting.id); setDeleting(null); }
    catch (error) { setNotice({ message: error instanceof Error ? error.message : '删除失败', error: true }); setDeleting(null); }
  };

  return <div className="min-w-0 rounded-xl border p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><BellRing className="size-4" /><p className="font-semibold">Bark 通知</p></div><p className="mt-1 text-xs text-muted-foreground">将监控告警推送到 iPhone；创建目标后，在告警规则中选择它。</p></div><Button size="sm" aria-label="添加 Bark 目标" onClick={() => setCreating(true)}><Plus />添加目标</Button></div>
    {notice ? <p role={notice.error ? 'alert' : 'status'} className={`mt-3 rounded-lg border px-3 py-2 text-sm ${notice.error ? 'border-destructive/30 text-destructive' : 'border-emerald-500/30 text-emerald-700 dark:text-emerald-300'}`}>{notice.message}</p> : null}
    {integrations.error ? <p role="alert" className="mt-3 text-sm text-destructive">{integrations.error.message}</p> : null}
    <div className="mt-4 space-y-2">
      {integrations.isLoading ? <div className="h-20 animate-pulse rounded-lg bg-muted" /> : null}
      {bark?.length === 0 ? <p className="rounded-lg border border-dashed px-4 py-7 text-center text-sm text-muted-foreground">尚未配置 Bark 通知目标</p> : null}
      {bark?.map((integration) => <div key={integration.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background p-3">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{integration.name}</p><Badge variant={integration.enabled ? 'outline' : 'secondary'}>{integration.enabled ? '已启用' : '已停用'}</Badge></div><p className="mt-1 break-all text-xs text-muted-foreground">{integration.config.serverUrl}{integration.config.group ? ` · ${integration.config.group}` : ''} · Key 已加密保存</p></div>
        <div className="grid w-full grid-cols-2 gap-1 sm:flex sm:w-auto sm:flex-wrap"><Button size="sm" variant="ghost" disabled={!integration.enabled || test.isPending} onClick={() => void sendTest(integration)}>{test.isPending && test.variables === integration.id ? <LoaderCircle className="animate-spin" /> : <RadioTower />}测试发送</Button><Button size="sm" variant="ghost" onClick={() => setEditing(integration)}><Pencil />编辑</Button><Button size="sm" variant="ghost" disabled={toggle.isPending} onClick={() => void setEnabled(integration)}><CircleOff />{integration.enabled ? '停用' : '启用'}</Button><Button size="sm" variant="ghost" className="text-destructive" aria-label={`删除 ${integration.name}`} onClick={() => setDeleting(integration)}><Trash2 />删除</Button></div>
      </div>)}
    </div>
    {creating ? <BarkDialog onClose={() => setCreating(false)} /> : null}
    {editing ? <BarkDialog key={editing.id} integration={editing} onClose={() => setEditing(null)} /> : null}
    <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>删除 Bark 通知目标？</DialogTitle><DialogDescription>若仍有告警规则引用“{deleting?.name}”，请先从规则中移除它。</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleting(null)}>取消</Button><Button variant="destructive" disabled={remove.isPending} onClick={() => void deleteIntegration()}><Trash2 />确认删除</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
