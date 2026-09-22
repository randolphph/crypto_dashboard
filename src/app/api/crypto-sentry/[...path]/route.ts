import { fetchWithTimeout } from '@/lib/http/fetch';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const ALLOWED_METHODS = new Set(['GET', 'POST', 'PATCH', 'DELETE']);

async function proxy(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  if (!ALLOWED_METHODS.has(request.method)) {
    return Response.json(
      { error: { code: 'METHOD_NOT_ALLOWED', message: '不支持该请求方法' } },
      { status: 405, headers: { Allow: [...ALLOWED_METHODS].join(', ') } }
    );
  }

  const baseUrl = process.env.CRYPTOSENTRY_API_URL?.trim();
  const apiToken = process.env.CRYPTOSENTRY_API_TOKEN?.trim();
  if (!baseUrl || !apiToken) {
    return Response.json(
      {
        error: {
          code: 'CRYPTOSENTRY_NOT_CONFIGURED',
          message: '服务端尚未配置 CryptoSentry API 地址或令牌',
        },
      },
      { status: 503 }
    );
  }

  const { path } = await params;
  if (
    path.length === 0 ||
    path.some((segment) => segment === '.' || segment === '..' || segment.includes('/'))
  ) {
    return Response.json(
      { error: { code: 'INVALID_PATH', message: '无效的 CryptoSentry API 路径' } },
      { status: 400 }
    );
  }

  let upstream: URL;
  try {
    const normalizedBase = baseUrl.replace(/\/+$/, '');
    upstream = new URL(`${normalizedBase}/api/v1/${path.map(encodeURIComponent).join('/')}`);
    upstream.search = new URL(request.url).search;
  } catch {
    return Response.json(
      {
        error: {
          code: 'INVALID_CONFIGURATION',
          message: 'CRYPTOSENTRY_API_URL 配置无效',
        },
      },
      { status: 500 }
    );
  }

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const contentType = request.headers.get('content-type');

  try {
    const response = await fetchWithTimeout(upstream, {
      method: request.method,
      headers: {
        Authorization: `Bearer ${apiToken}`,
        ...(contentType ? { 'Content-Type': contentType } : {}),
        Accept: 'application/json',
      },
      body: hasBody ? await request.arrayBuffer() : undefined,
      cache: 'no-store',
    });

    if (response.status === 204) {
      return new Response(null, { status: 204 });
    }

    return new Response(await response.arrayBuffer(), {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') ?? 'application/json',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    return Response.json(
      {
        error: {
          code: 'CRYPTOSENTRY_UNAVAILABLE',
          message:
            error instanceof Error
              ? `无法连接监控服务：${error.message}`
              : '无法连接监控服务',
        },
      },
      { status: 502 }
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
