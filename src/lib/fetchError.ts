// Read a failed Response body and produce a labeled Error.
//
// Accepts common error shapes:
//   { error: "msg" }
//   { error: { message: "msg" } }
//   { message: "msg" }
// Falls back to truncated plain text, then to `HTTP <status>`.
export class ApiResponseError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

export async function readApiError(res: Response, label: string): Promise<Error> {
  const text = await res.text().catch(() => '');
  let detail: string | undefined;
  if (text) {
    try {
      const body = JSON.parse(text) as unknown;
      if (typeof body === 'object' && body !== null) {
        const b = body as Record<string, unknown>;
        if (typeof b.error === 'string') detail = b.error;
        else if (
          typeof b.error === 'object' &&
          b.error !== null &&
          typeof (b.error as Record<string, unknown>).message === 'string'
        ) {
          detail = (b.error as Record<string, string>).message;
        } else if (typeof b.message === 'string') detail = b.message;
      }
    } catch {
      detail = text.slice(0, 200);
    }
  }
  return new ApiResponseError(
    `${label}: ${detail ?? `HTTP ${res.status}`}`,
    res.status
  );
}
