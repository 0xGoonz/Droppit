/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          }
        ],
      },
    ];
  },
  serverExternalPackages: ["@coinbase/agentkit", "@coinbase/cdp-sdk", "@langchain/google-genai", "@coinbase/agentkit-langchain"],
  webpack: (config: any, { isServer }: any) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
      };
    }
    config.resolve.alias = {
      ...config.resolve.alias,
      "@solana/kit": false,
      "@solana-program/token": false,
      "@solana/web3.js": false,
      "@react-native-async-storage/async-storage": false,
    };
    return config;
  },
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
