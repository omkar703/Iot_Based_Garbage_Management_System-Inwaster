const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3'],
    outputFileTracingIncludes: {
      '/**': ['./QRBase.db', './messages.json'],
    },
  },
  webpack: (config) => {
    config.resolve.alias['@'] = path.resolve(__dirname, 'src');
    return config;
  },
  async rewrites() {
    return [
      {
        source: '/static/:path*',
        destination: '/:path*',
      },
      {
        source: '/health/live',
        destination: '/api/health/live',
      },
      {
        source: '/health/ready',
        destination: '/api/health/ready',
      },
    ];
  },
};

module.exports = nextConfig;
