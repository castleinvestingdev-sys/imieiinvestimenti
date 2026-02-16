import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Increase server-side timeout for Gemini API calls (5 minutes)
  serverExternalPackages: ['@google/generative-ai', 'pdf-parse', 'pdfjs-dist'],
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
