import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['node:sqlite'],
  outputFileTracingIncludes: { '/*': ['./drizzle/*.sql'] },
};

export default nextConfig;
