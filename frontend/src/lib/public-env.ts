const DEV_BACKEND = "http://localhost:3001";

const devWarningsShown = new Set<string>();

function resolvePublicEnv(
  name: "NEXT_PUBLIC_API_URL" | "NEXT_PUBLIC_SOCKET_URL",
  devFallback: string,
): string {
  const raw = process.env[name];
  const value = typeof raw === "string" ? raw.trim() : "";
  if (value) {
    return value.replace(/\/+$/, "");
  }

  if (process.env.NODE_ENV !== "production") {
    if (!devWarningsShown.has(name)) {
      devWarningsShown.add(name);
      console.warn(
        `[fc26] ${name} is unset — using dev fallback "${devFallback}". ` +
          "Set it in frontend/.env.local for local development.",
      );
    }
    return devFallback;
  }

  const message =
    `[fc26] ${name} is unset in the production bundle. ` +
    "Pass it as a Docker build arg before `npm run build`; " +
    "runtime-only env vars do not update NEXT_PUBLIC_* in the client.";

  console.error(message);
  throw new Error(message);
}

/** Backend API base URL (inlined at build time via NEXT_PUBLIC_API_URL). */
export function getPublicApiUrl(): string {
  return resolvePublicEnv("NEXT_PUBLIC_API_URL", DEV_BACKEND);
}

/** Socket.io server URL (inlined at build time via NEXT_PUBLIC_SOCKET_URL). */
export function getPublicSocketUrl(): string {
  return resolvePublicEnv("NEXT_PUBLIC_SOCKET_URL", DEV_BACKEND);
}
