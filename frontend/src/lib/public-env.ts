const DEV_BACKEND = "http://localhost:3001";

let devApiWarningShown = false;
let devSocketWarningShown = false;

function normalizeUrl(value: string | undefined): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.replace(/\/+$/, "");
}

function resolveApiUrl(): string {
  // Must use static process.env.NEXT_PUBLIC_* access so Next.js inlines at build time.
  const value = normalizeUrl(process.env.NEXT_PUBLIC_API_URL);
  if (value) return value;

  if (process.env.NODE_ENV !== "production") {
    if (!devApiWarningShown) {
      devApiWarningShown = true;
      console.warn(
        `[fc26] NEXT_PUBLIC_API_URL is unset — using dev fallback "${DEV_BACKEND}". ` +
          "Set it in frontend/.env.local for local development.",
      );
    }
    return DEV_BACKEND;
  }

  const message =
    "[fc26] NEXT_PUBLIC_API_URL is unset in the production bundle. " +
    "Pass it as a Docker build arg before `npm run build`; " +
    "runtime-only env vars do not update NEXT_PUBLIC_* in the client.";

  console.error(message);
  throw new Error(message);
}

function resolveSocketUrl(): string {
  // Must use static process.env.NEXT_PUBLIC_* access so Next.js inlines at build time.
  const value = normalizeUrl(process.env.NEXT_PUBLIC_SOCKET_URL);
  if (value) return value;

  if (process.env.NODE_ENV !== "production") {
    if (!devSocketWarningShown) {
      devSocketWarningShown = true;
      console.warn(
        `[fc26] NEXT_PUBLIC_SOCKET_URL is unset — using dev fallback "${DEV_BACKEND}". ` +
          "Set it in frontend/.env.local for local development.",
      );
    }
    return DEV_BACKEND;
  }

  const message =
    "[fc26] NEXT_PUBLIC_SOCKET_URL is unset in the production bundle. " +
    "Pass it as a Docker build arg before `npm run build`; " +
    "runtime-only env vars do not update NEXT_PUBLIC_* in the client.";

  console.error(message);
  throw new Error(message);
}

/** Backend API base URL (inlined at build time via NEXT_PUBLIC_API_URL). */
export function getPublicApiUrl(): string {
  return resolveApiUrl();
}

/** Socket.io server URL (inlined at build time via NEXT_PUBLIC_SOCKET_URL). */
export function getPublicSocketUrl(): string {
  return resolveSocketUrl();
}
