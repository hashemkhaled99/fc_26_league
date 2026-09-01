/** @type {import('next').NextConfig} */

const PROD_BACKEND_URL =
  "https://p01--fc26-backend--xxwmmwbgfpdk.code.run";

function normalizeUrl(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.replace(/\/+$/, "");
}

// Backend URL for server-side API proxy rewrites (not exposed to browser).
const backendProxyUrl =
  normalizeUrl(process.env.BACKEND_PROXY_URL) ||
  normalizeUrl(process.env.NEXT_PUBLIC_API_URL) ||
  PROD_BACKEND_URL;

const socketUrl =
  normalizeUrl(process.env.NEXT_PUBLIC_SOCKET_URL) || backendProxyUrl;

const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // API calls use same-origin relative URLs; Next proxies /api/* to the backend.
  env: {
    NEXT_PUBLIC_API_URL: "",
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
