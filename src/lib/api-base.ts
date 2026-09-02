import { getPublicApiUrl } from "./public-env";

/** Base URL for the backend API service (Northflank backend public URL). */
export function apiPath(path: string): string {
  const base = getPublicApiUrl();
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export const apiFetchInit: RequestInit = {
  credentials: "include",
};

const DEFAULT_TIMEOUT_MS = 15_000;

/** Parse JSON safely when gateways return plain-text 500/503 bodies. */
export async function readApiJson<T = Record<string, unknown>>(
  res: Response
): Promise<T & { error?: string }> {
  const text = await res.text();
  if (!text) return {} as T & { error?: string };
  try {
    return JSON.parse(text) as T & { error?: string };
  } catch {
    if (res.status >= 500) {
      throw new Error(
        "Server error — the backend may be restarting. Wait a few seconds and try again."
      );
    }
    throw new Error(`Unexpected response from server (${res.status}).`);
  }
}

/** Fetch with credentials + timeout so pages don't spin forever when the API is down. */
export async function apiFetch(
  path: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(apiPath(path), {
      ...apiFetchInit,
      ...init,
      signal: controller.signal,
      headers: {
        ...(init.headers ?? {}),
      },
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Server is taking too long. The backend may be restarting — try again in a moment.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
