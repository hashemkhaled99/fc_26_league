const DEV_BACKEND = "http://localhost:3001";
const PROD_BACKEND = "https://p01--fc26-backend--xxwmmwbgfpdk.code.run";

let devApiWarningShown = false;
let devSocketWarningShown = false;

function normalizeUrl(value: string | undefined): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.replace(/\/+$/, "");
}

function isLocalhostUrl(value: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(value);
}

/** Frontend/same-origin URLs must not be used for API — Next rewrites return plain-text 500s. */
function isUsableBackendUrl(value: string): boolean {
  if (!value || isLocalhostUrl(value)) return false;
  if (/fc26-frontend/i.test(value)) return false;
  return true;
}

function resolveApiUrl(): string {
  const value = normalizeUrl(process.env.NEXT_PUBLIC_API_URL);
  if (isUsableBackendUrl(value)) return value;

  if (process.env.NODE_ENV !== "production") {
    if (!devApiWarningShown) {
      devApiWarningShown = true;
      console.warn(
        `[fc26] NEXT_PUBLIC_API_URL is unset — using dev fallback "${DEV_BACKEND}".`,
      );
    }
    return DEV_BACKEND;
  }

  // Never return "" (same-origin). Rewrites yield non-JSON 500/503 bodies.
  return PROD_BACKEND;
}

function resolveSocketUrl(): string {
  const value = normalizeUrl(process.env.NEXT_PUBLIC_SOCKET_URL);
  if (isUsableBackendUrl(value)) return value;

  if (process.env.NODE_ENV !== "production") {
    if (!devSocketWarningShown) {
      devSocketWarningShown = true;
      console.warn(
        `[fc26] NEXT_PUBLIC_SOCKET_URL is unset — using dev fallback "${DEV_BACKEND}".`,
      );
    }
    return DEV_BACKEND;
  }

  if (value && (isLocalhostUrl(value) || /fc26-frontend/i.test(value))) {
    console.warn(
      "[fc26] NEXT_PUBLIC_SOCKET_URL is invalid in production; using deployed backend URL instead.",
    );
  }

  return PROD_BACKEND;
}

/** Backend API base URL for browser fetch (credentials + CORS). */
export function getPublicApiUrl(): string {
  return resolveApiUrl();
}

/** Socket.io server URL (inlined at build time via NEXT_PUBLIC_SOCKET_URL). */
export function getPublicSocketUrl(): string {
  return resolveSocketUrl();
}
