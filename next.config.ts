import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This app is entirely authenticated/dynamic (every page reads cookies()),
  // so static prerendering/PPR has no upside here — disable Cache Components
  // to use standard per-request dynamic rendering instead of requiring
  // Suspense boundaries or "use cache" on every page.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
