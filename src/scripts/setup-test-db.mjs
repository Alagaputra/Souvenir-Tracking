import pg from "pg";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { root, loadAdminEnvironment } from "./admin-env.mjs";
import { migrateDatabase, provisionRuntime } from "./database-admin.mjs";

try {
  loadAdminEnvironment();
  const name = process.env.TEST_DATABASE_NAME || "souvenir_tracking_test";
  if (!/^[a-z][a-z0-9_]*_test$/.test(name)) throw new Error("Nama database pengujian harus berakhir _test.");
  const source = new URL(process.env.DATABASE_ADMIN_URL);
  if (decodeURIComponent(source.pathname.slice(1)) === name) throw new Error("Koneksi admin harus menunjuk database pemeliharaan, bukan database target pengujian.");
  const client = new pg.Client({ connectionString: source.href });
  await client.connect();
  try {
    const existing = await client.query("SELECT 1 FROM pg_database WHERE datname=$1", [name]);
    if (!existing.rowCount) {
      const [{ ddl }] = (await client.query("SELECT format('CREATE DATABASE %I', $1::text) AS ddl", [name])).rows;
      await client.query(ddl);
    }
  } finally { await client.end(); }
  const target = new URL(source); target.pathname = "/" + name;
  await migrateDatabase(target.href);
  const testEnv = join(root, ".env.test.local");
  if (existsSync(testEnv)) process.loadEnvFile(testEnv);
  const runtime = await provisionRuntime(target.href, process.env.TEST_DATABASE_URL);
  await writeFile(testEnv, `TEST_DATABASE_URL=${runtime}\nTEST_DATABASE_ADMIN_URL=${target.href}\n`, { mode: 0o600 });
  console.log("OK: database pengujian terpisah siap. Konfigurasi tersimpan di src/.env.test.local.");
} catch { console.error("Setup database pengujian gagal. Periksa koneksi admin, nama berakhiran _test, dan executable PostgreSQL."); process.exitCode = 1; }
