export function stockClientId(wallet: string | null): string {
  const key = `crypto-dashboard-stock-client:${wallet?.toLowerCase() ?? 'local'}`;
  const saved = localStorage.getItem(key);
  if (saved && /^[a-f0-9-]{36}$/i.test(saved)) return saved;
  const id = crypto.randomUUID();
  localStorage.setItem(key, id);
  return id;
}

export function stockRequestRevision(clientId: string): string {
  const key = `crypto-dashboard-stock-revision:${clientId}`;
  const previous = Number(localStorage.getItem(key));
  const revision = Math.max(Date.now(), Number.isSafeInteger(previous) ? previous + 1 : 0);
  localStorage.setItem(key, String(revision));
  return String(revision);
}
