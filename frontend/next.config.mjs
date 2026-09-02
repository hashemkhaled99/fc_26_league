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

// Server-side rewrite target (browser never sees this for /api when using same-origin).
const backendProxyUrl = resolveBackendUrl(
  process.env.BACKEND_PROXY_URL || process.env.NEXT_PUBLIC_API_URL
);

const socketUrl = resolveBackendUrl(
  process.env.NEXT_PUBLIC_SOCKET_URL || backendProxyUrl
);

const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // Same-origin API in the browser so fc26_session cookie stays on the frontend host.
  // Socket still points at the backend service.
  env: {
    NEXT_PUBLIC_API_URL: "",
    NEXT_PUBLIC_API_SAME_ORIGIN: "1",
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
