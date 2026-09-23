'use client';

import { useState, type FormEvent } from 'react';
import { Bot, CheckCircle2, CircleOff, LoaderCircle, Pencil, Plus, RadioTower, RefreshCw, Send, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  useCreateTelegramIntegration, useDeleteIntegration, useDiscoverTelegramChats, useSetIntegrationEnabled,
  useTelegramIntegrations, useTestTelegramIntegration, useUpdateTelegramIntegration,
} from '@/hooks/useCryptoSentry';
import { ApiResponseError } from '@/lib/fetchError';
import type { TelegramIntegration } from '@/types/cryptoSentry';

const CHAT_TYPE_LABEL = {
  private: '私聊', group: '群组', supergroup: '超级群组', channel: '频道',
};

function discoveryErrorText(error: unknown): string {
  if (error instanceof ApiResponseError) {
    if (error.code === 'TELEGRAM_WEBHOOK_ACTIVE') return '此 Bot 已启用 Webhook，无法自动发现。请使用专用 Bot，或改为手动填写 Chat ID。';
    if (error.code === 'TELEGRAM_UNAUTHORIZED') return 'Bot Token 无效或已被撤销，请重新从 BotFather 获取。';
    if (error.code === 'TELEGRAM_DISCOVERY_RATE_LIMITED') return '发现请求过于频繁，请稍后再试。';
  }
  return error instanceof Error ? error.message : '无法发现 Telegram 会话';
}

function TelegramDialog({
  integration, onClose,
}: {
  integration?: TelegramIntegration;
  onClose: () => void;
}) {
  const [name, setName] = useState(integration?.name ?? 'Telegram 通知');
  const [chatId, setChatId] = useState(integration?.config.chatId ?? '');
  const [botToken, setBotToken] = useState('');
  const [manualChatId, setManualChatId] = useState(Boolean(integration));
  const [error, setError] = useState<string | null>(null);
  const create = useCreateTelegramIntegration();
  const update = useUpdateTelegramIntegration();
  const discovery = useDiscoverTelegramChats();
  const saving = create.isPending || update.isPending;

  const discover = async () => {
    if (botToken.trim().length < 10) return setError('请先输入有效的 Bot Token');
    setError(null);
    try {
      const result = await discovery.mutateAsync(botToken.trim());
      setManualChatId(false);
      if (result.chats.length === 1) setChatId(result.chats[0]?.id ?? '');
      else if (!result.chats.some((chat) => chat.id === chatId)) setChatId('');
    } catch (discoverError) {
      setError(discoveryErrorText(discoverError));
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return setError('请输入配置名称');
    if (!chatId.trim()) return setError('请输入 Chat ID');
    if (!integration && botToken.trim().length < 10) return setError('请输入有效的 Bot Token');
    if (botToken && botToken.trim().length < 10) return setError('Bot Token 长度不足');
    setError(null);
    try {
      if (integration) {
        await update.mutateAsync({
          id: integration.id, name: name.trim(), chatId: chatId.trim(),
          ...(botToken.trim() ? { botToken: botToken.trim() } : {}),
        });
      } else {
        await create.mutateAsync({ name: name.trim(), chatId: chatId.trim(), botToken: botToken.trim() });
      }
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存 Telegram 配置失败');
    }
  };

  return <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
    <DialogContent className="sm:max-w-md">
      <form onSubmit={submit} className="contents">
        <DialogHeader>
          <DialogTitle>{integration ? '编辑 Telegram 通知' : '添加 Telegram 通知'}</DialogTitle>
          <DialogDescription>{integration ? '编辑时 Token 留空表示保持原值；输入新 Token 可重新发现会话。' : '输入 BotFather 提供的 Token，再自动发现向 Bot 发过消息的用户、群组或频道。'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2"><Label htmlFor="telegram-name">配置名称</Label><Input id="telegram-name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="off" /></div>
          <div className="space-y-2">
            <Label htmlFor="telegram-token">Bot Token</Label>
            <Input id="telegram-token" type="password" value={botToken} onChange={(event) => { setBotToken(event.target.value); discovery.reset(); if (event.target.value) setChatId(''); }} placeholder={integration ? '留空保持现有 Token' : '从 BotFather 获取'} autoComplete="new-password" />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="outline" disabled={botToken.trim().length < 10 || discovery.isPending} onClick={() => void discover()}>{discovery.isPending ? <LoaderCircle className="animate-spin" /> : discovery.data ? <RefreshCw /> : <RadioTower />}{discovery.isPending ? '正在发现' : discovery.data ? '重新发现' : '发现会话'}</Button>
              <p className="text-xs text-muted-foreground">先向 Bot 私聊发送 `/start`，或把 Bot 加入目标群组后发送 `/start`。</p>
            </div>
          </div>
          {discovery.data ? <div className="space-y-3 rounded-xl border p-3">
            <div className="flex items-start gap-2"><div className="rounded-lg bg-blue-500/10 p-2 text-blue-600"><Bot className="size-4" /></div><div className="min-w-0"><p className="flex items-center gap-1.5 text-sm font-medium"><CheckCircle2 className="size-3.5 text-emerald-600" />已验证 {discovery.data.bot.displayName}</p><p className="truncate text-xs text-muted-foreground">{discovery.data.bot.username ? `@${discovery.data.bot.username}` : `Bot ID ${discovery.data.bot.id}`}</p></div></div>
            {discovery.data.chats.length ? <div className="grid max-h-56 gap-2 overflow-y-auto">{discovery.data.chats.map((chat) => <label key={chat.id} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${chatId === chat.id ? 'border-foreground/30 bg-accent' : ''}`}><input className="mt-1" type="radio" name="telegram-chat" checked={chatId === chat.id} onChange={() => { setChatId(chat.id); setManualChatId(false); }} aria-label={`选择 ${chat.title}`} /><span className="min-w-0"><span className="block truncate font-medium">{chat.title}</span><span className="block break-all text-xs text-muted-foreground">{CHAT_TYPE_LABEL[chat.type]} · {chat.id}{chat.username ? ` · @${chat.username}` : ''}</span></span></label>)}</div> : <p className="rounded-lg bg-muted/55 px-3 py-3 text-sm text-muted-foreground">暂未发现会话。完成上面的 `/start` 操作后点击“重新发现”。</p>}
          </div> : null}
          <div className="space-y-2">
            {!manualChatId ? <button type="button" className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" onClick={() => setManualChatId(true)}>无法自动发现？手动填写 Chat ID</button> : null}
            {manualChatId ? <><Label htmlFor="telegram-chat-id">Chat ID</Label><Input id="telegram-chat-id" value={chatId} onChange={(event) => setChatId(event.target.value)} placeholder="用户 ID 或群组 ID（群组通常为负数）" autoComplete="off" /><p className="text-xs text-muted-foreground">Webhook 已启用或会话不在最近 Updates 中时可手动填写。</p></> : null}
          </div>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter><Button type="button" variant="outline" onClick={onClose} disabled={saving}>取消</Button><Button type="submit" disabled={saving}>{saving ? <LoaderCircle className="animate-spin" /> : null}{saving ? '保存中' : '保存配置'}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

export function TelegramIntegrationManager() {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TelegramIntegration | null>(null);
  const [deleting, setDeleting] = useState<TelegramIntegration | null>(null);
  const [notice, setNotice] = useState<{ message: string; error: boolean } | null>(null);
  const integrations = useTelegramIntegrations();
  const test = useTestTelegramIntegration();
  const toggle = useSetIntegrationEnabled();
  const remove = useDeleteIntegration();

  const sendTest = async (integration: TelegramIntegration) => {
    setNotice(null);
    try {
      const result = await test.mutateAsync(integration.id);
      setNotice({
        message: result.ok
          ? `“${integration.name}”测试消息已发送`
          : result.error?.message ?? 'Telegram 测试未通过',
        error: !result.ok,
      });
    } catch (error) {
      setNotice({ message: error instanceof Error ? error.message : 'Telegram 测试失败', error: true });
    }
  };

  const setEnabled = async (integration: TelegramIntegration) => {
    setNotice(null);
    try {
      await toggle.mutateAsync({ id: integration.id, enabled: !integration.enabled });
    } catch (error) {
      setNotice({ message: error instanceof Error ? error.message : '更新状态失败', error: true });
    }
  };

  const deleteIntegration = async () => {
    if (!deleting) return;
    setNotice(null);
    try {
      await remove.mutateAsync(deleting.id);
      setDeleting(null);
    } catch (error) {
      setNotice({ message: error instanceof Error ? error.message : '删除失败', error: true });
      setDeleting(null);
    }
  };

  return <div className="min-w-0 rounded-xl border p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="flex items-center gap-2"><Send className="size-4" /><p className="font-semibold">Telegram 通知</p></div><p className="mt-1 text-xs text-muted-foreground">创建 Bot 目标后，在每条告警规则中选择要发送到的目标。</p></div>
      <Button size="sm" onClick={() => setCreating(true)}><Plus />添加目标</Button>
    </div>
    {notice ? <p role={notice.error ? 'alert' : 'status'} className={`mt-3 rounded-lg border px-3 py-2 text-sm ${notice.error ? 'border-destructive/30 text-destructive' : 'border-emerald-500/30 text-emerald-700 dark:text-emerald-300'}`}>{notice.message}</p> : null}
    {integrations.error ? <p role="alert" className="mt-3 rounded-lg border border-destructive/30 px-3 py-2 text-sm text-destructive">{integrations.error.message}</p> : null}
    <div className="mt-4 space-y-2">
      {integrations.isLoading ? <div className="h-20 animate-pulse rounded-lg bg-muted" /> : null}
      {integrations.data?.length === 0 ? <p className="rounded-lg border border-dashed px-4 py-7 text-center text-sm text-muted-foreground">尚未配置 Telegram 通知目标</p> : null}
      {integrations.data?.map((integration) => <div key={integration.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background p-3">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{integration.name}</p><Badge variant={integration.enabled ? 'outline' : 'secondary'}>{integration.enabled ? '已启用' : '已停用'}</Badge></div><p className="mt-1 break-all text-xs text-muted-foreground">Chat ID：{integration.config.chatId} · Token 已加密保存</p></div>
        <div className="grid w-full grid-cols-2 gap-1 sm:flex sm:w-auto sm:flex-wrap">
          <Button size="sm" variant="ghost" disabled={!integration.enabled || test.isPending} onClick={() => void sendTest(integration)}>{test.isPending && test.variables === integration.id ? <LoaderCircle className="animate-spin" /> : <RadioTower />}测试发送</Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(integration)}><Pencil />编辑</Button>
          <Button size="sm" variant="ghost" disabled={toggle.isPending} onClick={() => void setEnabled(integration)}><CircleOff />{integration.enabled ? '停用' : '启用'}</Button>
          <Button size="sm" variant="ghost" className="text-destructive" aria-label={`删除 ${integration.name}`} onClick={() => setDeleting(integration)}><Trash2 />删除</Button>
        </div>
      </div>)}
    </div>
    {creating ? <TelegramDialog onClose={() => setCreating(false)} /> : null}
    {editing ? <TelegramDialog key={editing.id} integration={editing} onClose={() => setEditing(null)} /> : null}
    <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
      <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>删除 Telegram 通知目标？</DialogTitle><DialogDescription>若仍有告警规则引用“{deleting?.name}”，后端会拒绝删除。请先从规则中移除它。</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleting(null)}>取消</Button><Button variant="destructive" disabled={remove.isPending} onClick={() => void deleteIntegration()}><Trash2 />确认删除</Button></DialogFooter></DialogContent>
    </Dialog>
  </div>;
}
