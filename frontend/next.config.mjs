/** @type {import('next').NextConfig} */
const API_TARGET = process.env.API_INTERNAL_URL || 'http://127.0.0.1:3001';

const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Todo el tráfico entra por el puerto 3300; /api/* se redirige internamente al backend.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_TARGET}/api/:path*` }];
  },
  poweredByHeader: false,
};

export default nextConfig;
