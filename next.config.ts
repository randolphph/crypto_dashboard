import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  allowedDevOrigins: ['localhost', '127.0.0.1'],
  async headers() {
    return ['/token-icons/:path*', '/stock-icons/:path*'].map(source => ({
      source,
      headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
    }));
  },
};

export default nextConfig;
