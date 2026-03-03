import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@coinbase/agentkit", "@coinbase/cdp-sdk", "@langchain/google-genai", "@coinbase/agentkit-langchain"],
  webpack: (config, { isServer }) => {
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
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
