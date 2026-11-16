import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone', // self-contained server for the Docker image
  experimental: {
    agentUpgrade: 'security',
  },
};

export default nextConfig;
