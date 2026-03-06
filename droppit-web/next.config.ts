import type { NextConfig } from 'next';
import type { Configuration } from 'webpack';

const standardSecurityHeaders = [
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
];

const miniAppFrameAncestors = [
  "'self'",
  'https://warpcast.com',
  'https://*.warpcast.com',
  'https://farcaster.xyz',
  'https://*.farcaster.xyz',
  'https://base.app',
  'https://*.base.app',
  'https://base.org',
  'https://*.base.org',
  'https://base.dev',
  'https://*.base.dev',
].join(' ');

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        missing: [
          {
            type: 'query',
            key: 'miniApp',
            value: 'true',
          },
        ],
        headers: [
          ...standardSecurityHeaders,
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
        ],
      },
      {
        source: '/:path*',
        has: [
          {
            type: 'query',
            key: 'miniApp',
            value: 'true',
          },
        ],
        headers: [
          ...standardSecurityHeaders,
          {
            key: 'Content-Security-Policy',
            value: `frame-ancestors ${miniAppFrameAncestors};`,
          },
        ],
      },
    ];
  },
  serverExternalPackages: ["@coinbase/agentkit", "@coinbase/cdp-sdk", "@langchain/google-genai", "@coinbase/agentkit-langchain"],
  webpack: (config: Configuration, { isServer }: { isServer: boolean }) => {
    if (!isServer) {
      config.resolve = {
        ...config.resolve,
        fallback: {
          ...config.resolve?.fallback,
          fs: false,
          net: false,
          tls: false,
          crypto: false,
        },
        alias: {
          ...config.resolve?.alias,
          "@solana/kit": false,
          "@solana-program/token": false,
          "@solana/web3.js": false,
          "@react-native-async-storage/async-storage": false,
        },
      };
      return config;
    }

    config.resolve = {
      ...config.resolve,
      alias: {
        ...config.resolve?.alias,
        "@solana/kit": false,
        "@solana-program/token": false,
        "@solana/web3.js": false,
        "@react-native-async-storage/async-storage": false,
      },
    };

    return config;
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb',
    },
  },
};

export default nextConfig;
