/** @type {import('next').NextConfig} */

const PROD_BACKEND_URL =
  "https://p01--fc26-backend--xxwmmwbgfpdk.code.run";

function normalizeUrl(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.replace(/\/+$/, "");
}

function resolveBackendUrl(value) {
  const normalized = normalizeUrl(value);
  if (!normalized) return PROD_BACKEND_URL;
  if (/fc26-frontend/i.test(normalized)) return PROD_BACKEND_URL;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(normalized)) {
    return PROD_BACKEND_URL;
  }
  return normalized;
}

// Backend URL for server-side API proxy rewrites (not exposed to browser).
const backendProxyUrl = resolveBackendUrl(
  process.env.BACKEND_PROXY_URL || process.env.NEXT_PUBLIC_API_URL
);

const socketUrl = resolveBackendUrl(
  process.env.NEXT_PUBLIC_SOCKET_URL || backendProxyUrl
);

const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // Browser talks to the backend URL directly (CORS + credentials).
  // Rewrites remain as a fallback for relative /api calls.
  env: {
    NEXT_PUBLIC_API_URL: backendProxyUrl,
    NEXT_PUBLIC_SOCKET_URL: socketUrl,
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendProxyUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
