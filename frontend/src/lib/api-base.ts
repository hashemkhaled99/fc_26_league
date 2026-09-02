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
