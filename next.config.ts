import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "geoip-lite", "nodemailer"],
  poweredByHeader: false,
  eslint: { dirs: ["src", "scripts", "tests", "e2e"] },
};

export default nextConfig;
