import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { query, databaseConfigured } from "../lib/local-db.mjs";
const envPath = resolve(import.meta.dirname, "../.env.local");
if (existsSync(envPath)) process.loadEnvFile(envPath);
try {
  if (!databaseConfigured())
    throw new Error("DATABASE_URL belum diisi. Jalankan npm run db:setup.");
  const health = (
    await query(
      "SELECT current_database() AS name, to_regclass('souv.users') IS NOT NULL AS ready",
    )
  )[0];
  if (!health.ready)
    throw new Error(
      "Database terhubung tetapi schema belum siap. Jalankan npm run db:setup.",
    );
  console.log("OK: PostgreSQL lokal terhubung dan schema aplikasi tersedia.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
