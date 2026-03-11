export function cn(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

// Custom error class for limit-exceeded (HTTP 402) responses
export class LimitError extends Error {
  code: string;
  limit: number;
  used: number;
  constructor(message: string, code: string, limit: number, used: number) {
    super(message);
    this.name = "LimitError";
    this.code  = code;
    this.limit = limit;
    this.used  = used;
  }
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    // Try to parse JSON error body for structured 402 responses
    if (res.status === 402) {
      try {
        const body = JSON.parse(txt);
        const detail = body.detail ?? {};
        throw new LimitError(
          detail.message ?? "Limit reached",
          detail.code   ?? "LIMIT_REACHED",
          detail.limit  ?? 0,
          detail.used   ?? 0,
        );
      } catch (e) {
        if (e instanceof LimitError) throw e;
      }
    }
    throw new Error(`HTTP ${res.status}: ${txt || res.statusText}`);
  }
  return (await res.json()) as T;
}

