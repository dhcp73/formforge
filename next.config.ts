import type { NextConfig } from "next";

const browserMode = (process.env.STORAGE_MODE || "").toLowerCase() === "browser"
  || (process.env.STORAGE_MODE || "").toLowerCase() === "memory";

const nextConfig: NextConfig = {
  // Keep native addons external. In browser/memory mode better-sqlite3 is never required at runtime.
  serverExternalPackages: browserMode
    ? ["geoip-lite", "nodemailer", "googleapis", "@azure/msal-node"]
    : ["better-sqlite3", "geoip-lite", "nodemailer", "googleapis", "@azure/msal-node"],
  poweredByHeader: false,
  eslint: { dirs: ["src", "scripts", "tests", "e2e"] },
  env: {
    // Expose mode to the client for the demo banner/persistence flag
    NEXT_PUBLIC_STORAGE_MODE: process.env.STORAGE_MODE || "sqlite",
  },
};

export default nextConfig;
