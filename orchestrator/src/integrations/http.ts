/**
 * Thin fetch wrapper with JSON handling and clear error messages.
 * Uses the global fetch available in Node 20+.
 */
export interface HttpOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export async function httpJson<T>(url: string, opts: HttpOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json",
    ...(opts.headers ?? {}),
  };

  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  const text = await res.text();
  let parsed: unknown = undefined;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!res.ok) {
    const detail = typeof parsed === "string" ? parsed : JSON.stringify(parsed);
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${opts.method ?? "GET"} ${url}: ${detail}`);
  }

  return parsed as T;
}

export function basicAuthHeader(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}
