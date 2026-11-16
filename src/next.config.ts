import type { NextConfig } from "next";
import { resolve } from "node:path";

// npm scripts run Next.js from src/; dependencies can live at the repo root.
const workspaceRoot = resolve(process.cwd(), "..");
const config: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1"],
  outputFileTracingRoot: workspaceRoot,
  turbopack: { root: workspaceRoot },
};
export default config;
