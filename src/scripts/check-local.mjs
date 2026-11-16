import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { query, databaseConfigured, closeDatabase } from "../lib/local-db.mjs";
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
  const [privileges] = await query(`SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls AS elevated,
    has_schema_privilege(current_user,'souv','CREATE') AS ddl,
    has_table_privilege(current_user,'souv.products','UPDATE') AS direct_stock_write,
    has_function_privilege(current_user,'souv.create_session(uuid,text,text)','EXECUTE') AS ready
    FROM pg_roles WHERE rolname=current_user`);
  if (privileges.elevated || privileges.ddl || privileges.direct_stock_write || !privileges.ready)
    throw new Error("Akun database belum dibatasi atau migrasi belum lengkap. Jalankan npm run db:setup.");
  console.log("OK: database terhubung, schema siap, dan akun runtime memiliki izin terbatas.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally { await closeDatabase(); }
