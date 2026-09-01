/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // API-only backend: lib names like useCard/useRedis trigger false-positive hook lint
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
