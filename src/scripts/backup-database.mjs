import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, chmod } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { root, loadAdminEnvironment } from "./admin-env.mjs";
import { databaseOptions } from "../lib/local-db.mjs";
const exec = promisify(execFile);
try {
  loadAdminEnvironment();
  const outputFlag = process.argv.indexOf("--output");
  if (outputFlag >= 0 && !process.argv[outputFlag + 1]) throw new Error("Tujuan backup belum diisi.");
  const output = outputFlag < 0 ? join(root, "../.local/backups", `${new Date().toISOString().replace(/[:.]/g, "-")}.dump`) : resolve(root, "..", process.argv[outputFlag + 1]);
  if (existsSync(output)) throw new Error("Berkas tujuan sudah ada; backup tidak ditimpa.");
  await mkdir(dirname(output), { recursive: true, mode: 0o700 });
  const options = databaseOptions();
  const executable = options.executable === "psql" ? "pg_dump" : join(dirname(options.executable), process.platform === "win32" ? "pg_dump.exe" : "pg_dump");
  await exec(executable, ["--no-password", "--format=custom", "--no-owner", "--no-acl", "--file", output], { env: options.env, windowsHide: true, timeout: 300000 });
  await chmod(output, 0o600);
  console.log(`OK: backup database tersimpan di ${output}`);
} catch (error) { console.error(error.message === "Berkas tujuan sudah ada; backup tidak ditimpa." ? error.message : "Backup gagal. Periksa koneksi admin, direktori tujuan, dan pg_dump."); process.exitCode = 1; }
