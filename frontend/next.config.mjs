/** @type {import('next').NextConfig} */

const PROD_BACKEND_URL =
  "https://p01--fc26-backend--xxwmmwbgfpdk.code.run";

function normalizeUrl(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.replace(/\/+$/, "");
}

const apiUrl =
  normalizeUrl(process.env.NEXT_PUBLIC_API_URL) || PROD_BACKEND_URL;
const socketUrl =
  normalizeUrl(process.env.NEXT_PUBLIC_SOCKET_URL) || apiUrl;

const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // Explicitly inject into the client bundle at build time (Docker-friendly).
  env: {
    NEXT_PUBLIC_API_URL: apiUrl,
    NEXT_PUBLIC_SOCKET_URL: socketUrl,
  },
};

export default nextConfig;
