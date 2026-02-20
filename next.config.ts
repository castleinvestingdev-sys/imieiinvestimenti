import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Increase server-side timeout for Gemini API calls (10 minutes)
  serverExternalPackages: ['@google/generative-ai', 'pdf-parse', 'pdfjs-dist'],
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
    proxyTimeout: 600000, // 10 minutes for long-running Gemini API calls
  },
};

export default nextConfig;
