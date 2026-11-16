import pg from "pg";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { root, loadAdminEnvironment } from "./admin-env.mjs";
import { databaseOptions } from "../lib/local-db.mjs";
const exec = promisify(execFile);
try {
  loadAdminEnvironment();
  const arg = key => { const i = process.argv.indexOf(key); return i < 0 ? "" : process.argv[i + 1] || ""; };
  const file = arg("--file"), name = arg("--database");
  const backup = resolve(root, "..", file);
  if (!file || !existsSync(backup) || !/^[a-z][a-z0-9_]*_restore(?:_[a-z0-9]+)?$/.test(name))
    throw new Error("Gunakan --file <backup.dump> --database <nama_restore>. Restore hanya membuat database baru.");
  const source = new URL(process.env.DATABASE_ADMIN_URL);
  const client = new pg.Client({ connectionString: source.href });
  await client.connect();
  try {
    const existing = await client.query("SELECT 1 FROM pg_database WHERE datname=$1", [name]);
    if (existing.rowCount) throw new Error("Database tujuan sudah ada; restore tidak menimpa database.");
    const [{ ddl }] = (await client.query("SELECT format('CREATE DATABASE %I', $1::text) AS ddl", [name])).rows;
    await client.query(ddl);
  } finally { await client.end(); }
  const target = new URL(source); target.pathname = "/" + name;
  const options = databaseOptions(target.href);
  const executable = options.executable === "psql" ? "pg_restore" : join(dirname(options.executable), process.platform === "win32" ? "pg_restore.exe" : "pg_restore");
  await exec(executable, ["--no-password", "--exit-on-error", "--single-transaction", "--no-owner", "--no-acl", "--dbname", name, backup],
    { env: options.env, windowsHide: true, timeout: 300000 });
  console.log(`OK: backup dipulihkan ke database baru ${name}. Verifikasi data sebelum memindahkan aplikasi; akun runtime belum diberikan akses.`);
} catch (error) {
  const safe = /^(Gunakan --file|Database tujuan sudah ada)/.test(error.message);
  console.error(safe ? error.message : "Restore gagal. Periksa koneksi admin, backup, dan pg_restore. Database sumber tidak diubah.");
  process.exitCode = 1;
}
