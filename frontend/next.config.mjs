const defaultBackendPort = process.env.PORT === '3600' ? '3601' : '3001';
const API_TARGET = process.env.API_INTERNAL_URL || `http://127.0.0.1:${process.env.BACKEND_PORT || defaultBackendPort}`;

const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
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
