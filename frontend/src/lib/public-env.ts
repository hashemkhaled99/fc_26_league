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

function isFrontendUrl(value: string): boolean {
  return /fc26-frontend/i.test(value);
}

/**
 * Browser API base.
 * Empty string = same-origin `/api/*` (Next rewrite → backend). That keeps the
 * session cookie on the frontend host so auth works. Absolute backend URLs are
 * cross-site and break login unless FRONTEND_URL + SameSite=None are perfect.
 */
function resolveApiUrl(): string {
  const raw = normalizeUrl(process.env.NEXT_PUBLIC_API_URL);

  // Explicit same-origin
  if (raw === "" || process.env.NEXT_PUBLIC_API_SAME_ORIGIN === "1") {
    return "";
  }

  // Misconfigured: frontend URL or blank → same-origin
  if (!raw || isFrontendUrl(raw)) {
    return process.env.NODE_ENV === "production" ? "" : DEV_BACKEND;
  }

  if (isLocalhostUrl(raw)) {
    if (process.env.NODE_ENV !== "production") {
      if (!devApiWarningShown) {
        devApiWarningShown = true;
        console.warn(
          `[fc26] NEXT_PUBLIC_API_URL is localhost — using "${DEV_BACKEND}".`,
        );
      }
      return DEV_BACKEND;
    }
    // Prod build with localhost leftover → same-origin rewrite
    return "";
  }

  // Absolute backend URL (legacy / explicit). Prefer same-origin in production
  // unless NEXT_PUBLIC_API_CROSS_ORIGIN=1.
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_API_CROSS_ORIGIN !== "1") {
    return "";
  }

  return raw;
}

function resolveSocketUrl(): string {
  const value = normalizeUrl(process.env.NEXT_PUBLIC_SOCKET_URL);
  if (value && !isLocalhostUrl(value) && !isFrontendUrl(value)) return value;

  if (process.env.NODE_ENV !== "production") {
    if (!devSocketWarningShown) {
      devSocketWarningShown = true;
      console.warn(
        `[fc26] NEXT_PUBLIC_SOCKET_URL unset — using "${DEV_BACKEND}".`,
      );
    }
    return DEV_BACKEND;
  }

  return PROD_BACKEND;
}

/** Backend API base URL. Empty = same-origin `/api` via Next rewrite. */
export function getPublicApiUrl(): string {
  return resolveApiUrl();
}

/** Socket.io server URL (always absolute backend in production). */
export function getPublicSocketUrl(): string {
  return resolveSocketUrl();
}
