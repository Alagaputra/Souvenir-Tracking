import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
const env = resolve(import.meta.dirname, "../.env.test.local");
if (existsSync(env)) process.loadEnvFile(env);
if (!process.env.TEST_DATABASE_URL || !process.env.TEST_DATABASE_ADMIN_URL) {
  console.error("Database tes belum disiapkan. Jalankan npm run db:test:setup. Tes tidak menggunakan .env.local.");
  process.exitCode = 1;
} else {
  for (const key of ["TEST_DATABASE_URL", "TEST_DATABASE_ADMIN_URL"]) {
    const url = new URL(process.env[key]);
    if (!decodeURIComponent(url.pathname).endsWith("_test")) throw new Error("Tes hanya boleh memakai database berakhiran _test.");
  }
  const child = spawn(process.execPath, ["--test", "tests/local-database.integration.mjs"], {
    cwd: resolve(import.meta.dirname, ".."), env: process.env, stdio: "inherit", windowsHide: true,
  });
  child.on("exit", code => { process.exitCode = code ?? 1; });
  child.on("error", () => { console.error("Tes database tidak dapat dijalankan."); process.exitCode = 1; });
}
