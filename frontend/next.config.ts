import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  compress: false, // nginx handles gzip — no need for Node.js to double-compress
  experimental: {
    optimizePackageImports: ["lucide-react", "date-fns", "@tiptap/react"],
  },
};

export default withNextIntl(nextConfig);
