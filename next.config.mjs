import path from 'path';

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingExcludes: {
    "/*": ["./content/catalogs/**/*.pdf"],
  },
  turbopack: {
    root: process.cwd(),
    resolveAlias: {
      canvas: "./src/lib/canvas-mock.js",
    },
  },
  webpack: (config) => {
    config.resolve.alias.canvas = path.resolve(process.cwd(), "src/lib/canvas-mock.js");
    return config;
  },
};

export default nextConfig;
