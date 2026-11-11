import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export function databaseConfigured() {
  return !!process.env.DATABASE_URL?.trim();
}
export function databaseOptions() {
  if (!databaseConfigured()) throw new Error("LOCAL_DB_NOT_CONFIGURED");
  let url;
  try {
    url = new URL(process.env.DATABASE_URL);
  } catch {
    throw new Error("DATABASE_URL tidak valid.");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  )
    throw new Error(
      "Proyek ini menggunakan PostgreSQL lokal. Gunakan host localhost atau 127.0.0.1.",
    );
  const binaryDir =
    process.env.POSTGRES_BIN || "C:/Program Files/PostgreSQL/18/bin";
  const executable = join(
    binaryDir,
    process.platform === "win32" ? "psql.exe" : "psql",
  );
  return {
    executable: existsSync(executable) ? executable : "psql",
    env: {
      ...process.env,
      PGHOST: url.hostname,
      PGPORT: url.port || "5432",
      PGUSER: decodeURIComponent(url.username),
      PGPASSWORD: decodeURIComponent(url.password),
      PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
      PGCONNECT_TIMEOUT: "5",
      PGCLIENTENCODING: "UTF8",
    },
  };
}

// Values are passed on stdin, never a shell command or process argument. Base64
// encodes text as a SQL expression; only this module constructs these literals.
function literal(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value))
      throw new Error("Angka database tidak valid.");
    return String(value);
  }
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return `convert_from(decode('${Buffer.from(text, "utf8").toString("base64")}','base64'),'UTF8')`;
}
export async function executeSQL(sql) {
  const { executable, env } = databaseOptions();
  try {
    const child = execFile(
      executable,
      [
        "-X",
        "-w",
        "-A",
        "-t",
        "-q",
        "-P",
        "pager=off",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      { env, windowsHide: true, timeout: 20000, maxBuffer: 32 * 1024 * 1024 },
    );
    const result = new Promise((resolve, reject) => {
      let stdout = "",
        stderr = "";
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
        if (stdout.length > 32 * 1024 * 1024) child.kill();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve(stdout);
        else {
          const domain = /SOUV:([^\r\n]+)/.exec(stderr);
          const error = new Error(
            domain
              ? domain[1].trim()
              : /duplicate key/i.test(stderr)
                ? "Kode barang atau email sudah digunakan."
                : /does not exist|undefined/i.test(stderr)
                  ? "Database belum disiapkan. Jalankan npm run db:setup."
                  : "PostgreSQL lokal tidak dapat diakses atau permintaan database gagal.",
          );
          error.status = domain || /duplicate key/i.test(stderr) ? 400 : 503;
          reject(error);
        }
      });
    });
    child.stdin.on("error", () => {});
    child.stdin.end(sql + "\n");
    return await result;
  } catch (error) {
    if (error.status) throw error;
    const failure = new Error(
      "PostgreSQL lokal tidak dapat dihubungi. Periksa database dan lokasi psql.",
    );
    failure.status = 503;
    throw failure;
  }
}
export async function query(sql, values = []) {
  const bound = sql.replace(/\$(\d+)\b/g, (_, index) => {
    if (Number(index) > values.length)
      throw new Error("Parameter database tidak lengkap.");
    return literal(values[Number(index) - 1]);
  });
  // PostgreSQL requires data-modifying CTEs at the top level. Hoist the
  // caller's WITH clause while wrapping only its final SELECT in JSON.
  let prefix = "",
    select = bound;
  if (/^WITH\b/i.test(bound)) {
    let depth = 0,
      quoted = false;
    for (let i = 0; i < bound.length; i++) {
      if (bound[i] === "'") {
        if (quoted && bound[i + 1] === "'") {
          i++;
          continue;
        }
        quoted = !quoted;
        continue;
      }
      if (quoted) continue;
      if (bound[i] === "(") depth++;
      else if (bound[i] === ")") depth--;
      else if (depth === 0 && /^SELECT\b/i.test(bound.slice(i))) {
        prefix = bound.slice(0, i);
        select = bound.slice(i);
        break;
      }
    }
    if (!prefix) throw new Error("Query WITH harus diakhiri SELECT.");
  }
  const result = await executeSQL(
    `${prefix} SELECT COALESCE(json_agg(__souv_result),'[]'::json) FROM (${select}) AS __souv_result;`,
  );
  return JSON.parse(result.trim());
}
