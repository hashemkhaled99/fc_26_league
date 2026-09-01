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

function resolveApiUrl(): string {
  const value = normalizeUrl(process.env.NEXT_PUBLIC_API_URL);
  if (value && !isLocalhostUrl(value)) return value;

  if (process.env.NODE_ENV !== "production") {
    if (!devApiWarningShown) {
      devApiWarningShown = true;
      console.warn(
        `[fc26] NEXT_PUBLIC_API_URL is unset — using dev fallback "${DEV_BACKEND}".`,
      );
    }
    return DEV_BACKEND;
  }

  // Production: same-origin /api/* proxied to backend via next.config rewrites.
  return "";
}

function resolveSocketUrl(): string {
  const value = normalizeUrl(process.env.NEXT_PUBLIC_SOCKET_URL);
  if (value && !isLocalhostUrl(value)) return value;

  if (process.env.NODE_ENV !== "production") {
    if (!devSocketWarningShown) {
      devSocketWarningShown = true;
      console.warn(
        `[fc26] NEXT_PUBLIC_SOCKET_URL is unset — using dev fallback "${DEV_BACKEND}".`,
      );
    }
    return DEV_BACKEND;
  }

  if (value && isLocalhostUrl(value)) {
    console.warn(
      "[fc26] NEXT_PUBLIC_SOCKET_URL points at localhost in production; using deployed backend URL instead.",
    );
  }

  return PROD_BACKEND;
}

/** Backend API base URL (empty in prod = same-origin via Next.js rewrite proxy). */
export function getPublicApiUrl(): string {
  return resolveApiUrl();
}

/** Socket.io server URL (inlined at build time via NEXT_PUBLIC_SOCKET_URL). */
export function getPublicSocketUrl(): string {
  return resolveSocketUrl();
}
