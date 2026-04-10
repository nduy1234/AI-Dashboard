type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue };

export class HttpError extends Error {
  status: number;
  body: string;

  constructor(status: number, body: string) {
    let extractedMessage = body;
    try {
      const parsed = JSON.parse(body);
      if (parsed.error) extractedMessage = typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error);
      else if (parsed.message) extractedMessage = parsed.message;
    } catch {}

    super(`Provider HTTP ${status}: ${extractedMessage}`);
    this.status = status;
    this.body = body;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function requestJsonWithRetry<T>(
  url: string,
  init: RequestInit,
  options?: {
    retries?: number;
    timeoutMs?: number;
    retryBaseMs?: number;
  },
): Promise<T> {
  const retries = options?.retries ?? 3;
  const timeoutMs = options?.timeoutMs ?? 12000;
  const retryBaseMs = options?.retryBaseMs ?? 400;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timeout);

      const bodyText = await response.text();
      if (!response.ok) {
        if (response.status >= 500 && attempt < retries) {
          await sleep(retryBaseMs * (attempt + 1));
          continue;
        }
        throw new HttpError(response.status, bodyText);
      }

      if (!bodyText) return {} as T;
      try {
        return JSON.parse(bodyText) as T;
      } catch {
        // Some providers (e.g. Slack Incoming Webhooks) return plain-text "ok"
        // on success rather than JSON.  Treat any non-JSON 2xx body as success.
        return {} as T;
      }
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (attempt >= retries) break;
      await sleep(retryBaseMs * (attempt + 1));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("HTTP request failed");
}

export function toJsonBody(value: JsonObject): string {
  return JSON.stringify(value);
}
