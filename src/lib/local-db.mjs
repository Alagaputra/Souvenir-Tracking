// @ts-check
import pg from "pg";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { HttpError } from "./http.mjs";

export function databaseConfigured() { return !!process.env.DATABASE_URL?.trim(); }
/** @param {string | undefined} [connectionString] */
export function databaseURL(connectionString = process.env.DATABASE_URL) {
  if (!connectionString?.trim()) throw new HttpError("PostgreSQL belum disiapkan. Jalankan npm run db:setup.", 503);
  let url;
  try { url = new URL(connectionString); } catch { throw new HttpError("DATABASE_URL tidak valid.", 503); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || url.pathname.length < 2)
    throw new HttpError("DATABASE_URL tidak valid.", 503);
  return url;
}
// Only administration tools use psql; application queries use the pool below.
/** @param {string | undefined} [connectionString] */
export function databaseOptions(connectionString = process.env.DATABASE_URL) {
  const url = databaseURL(connectionString);
  const executable = join(process.env.POSTGRES_BIN || "C:/Program Files/PostgreSQL/18/bin", process.platform === "win32" ? "psql.exe" : "psql");
  return { executable: existsSync(executable) ? executable : "psql", env: {
    ...process.env, PGHOST: url.hostname.replace(/^\[|\]$/g, ""), PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)), PGCONNECT_TIMEOUT: "5", PGCLIENTENCODING: "UTF8",
    ...(url.searchParams.has("sslmode") ? { PGSSLMODE: url.searchParams.get("sslmode") || "verify-full" } : {}),
  } };
}
/** @param {unknown} error @returns {HttpError} */
function databaseError(error) {
  if (error instanceof HttpError) return error;
  const detail = error && typeof error === "object" ? error : {};
  const code = "code" in detail ? String(detail.code) : "unknown";
  const message = "message" in detail ? String(detail.message) : "";
  const domain = /^SOUV:(.+)$/.exec(message);
  if (domain) return new HttpError(domain[1].trim());
  if (code === "23505") return new HttpError("Kode barang atau email sudah digunakan.");
  if (code === "23503") return new HttpError("Data masih digunakan oleh catatan lain.");
  console.error(JSON.stringify({ event: "database_error", code }));
  return new HttpError("Database tidak dapat diakses atau permintaan database gagal.", 503);
}
/** @type {Map<string, import('pg').Pool>} */
const pools = globalThis.__souvPools ??= new Map();
function pool() {
  const connectionString = databaseURL().href;
  let instance = pools.get(connectionString);
  if (!instance) {
    instance = new pg.Pool({ connectionString, max: 10, connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000, statement_timeout: 20000, allowExitOnIdle: true });
    instance.on("error", error => { databaseError(error); });
    pools.set(connectionString, instance);
  }
  return instance;
}
/** Parameters are sent separately using the PostgreSQL protocol.
 * @template {import('pg').QueryResultRow} [T=import('pg').QueryResultRow]
 * @param {string} sql @param {unknown[]} [values] @returns {Promise<T[]>}
 */
export async function query(sql, values = []) {
  try { return (await pool().query(sql, values)).rows; }
  catch (error) { throw databaseError(error); }
}
export async function closeDatabase() {
  const active = [...pools.values()]; pools.clear();
  await Promise.all(active.map(instance => instance.end()));
}
/** @param {string} sql @param {string | undefined} [connectionString] @returns {Promise<string>} */
export async function executeSQL(sql, connectionString = process.env.DATABASE_URL) {
  const { executable, env } = databaseOptions(connectionString);
  return new Promise((resolve, reject) => {
    const child = execFile(executable, ["-X", "-w", "-A", "-t", "-q", "-P", "pager=off", "-v", "ON_ERROR_STOP=1"],
      { env, windowsHide: true, timeout: 60000, maxBuffer: 32 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (!error) { resolve(stdout); return; }
        const domain = /SOUV:([^\r\n]+)/.exec(stderr);
        reject(new HttpError(domain?.[1]?.trim() || "Perintah administrasi database gagal. Periksa koneksi dan lokasi psql.", domain ? 400 : 503));
      });
    child.stdin?.on("error", () => {}); child.stdin?.end(sql + "\n");
  });
}
