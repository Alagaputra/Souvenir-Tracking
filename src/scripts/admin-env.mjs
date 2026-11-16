import { existsSync } from "node:fs";
import { resolve } from "node:path";
export const root = resolve(import.meta.dirname, "..");
export const adminEnvPath = resolve(root, "../.local/database-admin.env");
export function loadAdminEnvironment() {
  const envPath = resolve(root, ".env.local");
  if (existsSync(envPath)) process.loadEnvFile(envPath);
  if (existsSync(adminEnvPath)) process.loadEnvFile(adminEnvPath);
  // Compatibility for the first upgrade from the old owner-only setup.
  if (!process.env.DATABASE_ADMIN_URL && process.env.DATABASE_URL && !new URL(process.env.DATABASE_URL).username.startsWith("souv_app_"))
    process.env.DATABASE_ADMIN_URL = process.env.DATABASE_URL;
  if (!process.env.DATABASE_ADMIN_URL) throw new Error("Koneksi admin belum tersedia. Jalankan npm run db:setup atau tetapkan DATABASE_ADMIN_URL untuk perintah administrasi.");
  process.env.DATABASE_URL = process.env.DATABASE_ADMIN_URL;
}
