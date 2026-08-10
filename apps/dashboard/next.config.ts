import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  experimental: {
    instrumentationHook: true,
  },
};

export default config;
