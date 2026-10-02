import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@xndrjs/addressable-resources",
    "@xndrjs/domain-zod",
    "@xndrjs/resource-graph-resolver",
  ],
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".jsx": [".tsx", ".jsx"],
    };
    return config;
  },
};

export default nextConfig;
