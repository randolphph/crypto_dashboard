import {
  fetchIbkrSnapshot,
  parseFlexStatement,
  type IbkrCreds,
} from '@/lib/ibkr/flex';
import { enforceRateLimit } from '@/lib/http/guards';

export const maxDuration = 35;

function readIbkrCreds(request: Request): IbkrCreds | null {
  const flexToken =
    request.headers.get('x-ibkr-flex-token') || process.env.IBKR_FLEX_TOKEN;
  const flexQueryId =
    request.headers.get('x-ibkr-flex-query-id') || process.env.IBKR_FLEX_QUERY_ID;
  return flexToken && flexQueryId ? { flexToken, flexQueryId } : null;
}

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, 'ibkr-trades', 12, 60);
  if (limited) return limited;

  const creds = readIbkrCreds(request);
  if (!creds) {
    return Response.json(
      { error: 'IBKR Flex Query 尚未配置' },
      { status: 400, headers: { 'Cache-Control': 'private, no-store' } }
    );
  }

  try {
    const snapshot = await fetchIbkrSnapshot(creds);
    return Response.json(
      { trades: snapshot.trades ?? [] },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'IBKR 成交查询失败' },
      { status: 502, headers: { 'Cache-Control': 'private, no-store' } }
    );
  }
}

/** Parse a user-exported Flex XML file for one-time history imports. */
export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'ibkr-trades-import', 12, 60);
  if (limited) return limited;

  const maxBytes = 2 * 1024 * 1024;
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return Response.json(
      { error: 'Flex XML 文件不能超过 2 MB' },
      { status: 413, headers: { 'Cache-Control': 'private, no-store' } }
    );
  }

  const xml = await request.text();
  if (new TextEncoder().encode(xml).byteLength > maxBytes) {
    return Response.json(
      { error: 'Flex XML 文件不能超过 2 MB' },
      { status: 413, headers: { 'Cache-Control': 'private, no-store' } }
    );
  }
  if (!xml.includes('<FlexQueryResponse')) {
    return Response.json(
      { error: '请选择 IBKR Flex 导出的 XML 文件' },
      { status: 400, headers: { 'Cache-Control': 'private, no-store' } }
    );
  }

  return Response.json(
    { trades: parseFlexStatement(xml).trades },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
