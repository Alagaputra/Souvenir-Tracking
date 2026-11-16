import pg from "pg";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { executeSQL } from "../lib/local-db.mjs";
import { root } from "./admin-env.mjs";

export async function migrateDatabase(connectionString) {
  const migrationDir = join(root, "db/migrations");
  const files = (await readdir(migrationDir)).filter(file => /^\d{3}_[a-z0-9_]+\.sql$/.test(file)).sort();
  const migrations = [];
  for (const file of files) {
    const version = file.slice(0, 3), sql = (await readFile(join(migrationDir, file), "utf8")).replace(/\r\n/g, "\n");
    const digest = createHash("sha256").update(sql).digest("hex");
    const legacy = createHash("sha256").update(sql.replace(/\n/g, "\r\n")).digest("hex");
    migrations.push(`DO $souv_migration$ BEGIN
IF EXISTS(SELECT 1 FROM souv.schema_migrations WHERE version='${version}' AND checksum NOT IN ('${digest}','${legacy}')) THEN
RAISE EXCEPTION 'SOUV:Migrasi ${version} sudah pernah diterapkan dengan isi berbeda. Tambahkan migrasi baru; database tidak ditimpa.';
END IF;
IF NOT EXISTS(SELECT 1 FROM souv.schema_migrations WHERE version='${version}') THEN
EXECUTE $souv_ddl$${sql}$souv_ddl$;
INSERT INTO souv.schema_migrations(version,checksum)VALUES('${version}','${digest}');
END IF;
UPDATE souv.schema_migrations SET checksum='${digest}' WHERE version='${version}' AND checksum='${legacy}';
END $souv_migration$;`);
  }
  await executeSQL(`BEGIN; SELECT pg_advisory_xact_lock(55432001); CREATE SCHEMA IF NOT EXISTS souv;
CREATE TABLE IF NOT EXISTS souv.schema_migrations(version text PRIMARY KEY,checksum text NOT NULL);
${migrations.join("\n")} COMMIT;`, connectionString);
}

export async function provisionRuntime(connectionString, existingRuntime) {
  const url = new URL(connectionString);
  const role = "souv_app_" + createHash("sha256").update(decodeURIComponent(url.pathname.slice(1))).digest("hex").slice(0, 12);
  const previous = existingRuntime ? new URL(existingRuntime) : null;
  const sameDatabase = previous?.host === url.host && previous.pathname === url.pathname && previous.username === role;
  const password = sameDatabase ? decodeURIComponent(previous.password) : randomBytes(24).toString("base64url");
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query("BEGIN");
    const exists = await client.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [role]);
    const [{ ddl }] = (await client.query(`SELECT format('${exists.rowCount ? "ALTER" : "CREATE"} ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD %L', $1::text,$2::text) AS ddl`, [role,password])).rows;
    await client.query(ddl);
    const [{ grants }] = (await client.query(`SELECT format('GRANT CONNECT ON DATABASE %I TO %I;
GRANT USAGE ON SCHEMA souv TO %I;
GRANT SELECT ON souv.users,souv.products,souv.movements TO %I;
GRANT SELECT,INSERT,DELETE ON souv.sessions TO %I;
GRANT SELECT,INSERT ON souv.photos TO %I;
GRANT EXECUTE ON FUNCTION souv.claim_login_attempt(text),souv.clear_login_attempt(text),souv.create_session(uuid,text,text),souv.write_action(uuid,jsonb),souv.delete_product(uuid,uuid),souv.change_password(uuid,text,text,text) TO %I;',
current_database(),$1::text,$1::text,$1::text,$1::text,$1::text,$1::text) AS grants`, [role])).rows;
    await client.query(grants);
    await client.query("COMMIT");
    const runtime = new URL(url); runtime.username = role; runtime.password = password;
    return runtime.href;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { await client.end(); }
}
