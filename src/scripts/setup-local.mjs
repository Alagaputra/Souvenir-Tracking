import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes } from "node:crypto";
import { hashPassword } from "../lib/local-security.mjs";
import { adminEnvPath } from "./admin-env.mjs";
import { migrateDatabase, provisionRuntime } from "./database-admin.mjs";
import { executeSQL, query, databaseOptions, closeDatabase } from "../lib/local-db.mjs";
const exec = promisify(execFile);
const root = resolve(import.meta.dirname, ".."),
  runtimeRoot = resolve(root, "../.local"),
  envPath = join(root, ".env.local");
if (existsSync(envPath)) process.loadEnvFile(envPath);
async function save(values) {
  let text = existsSync(envPath) ? await readFile(envPath, "utf8") : "";
  for (const [key, value] of Object.entries(values)) {
    process.env[key] = value;
    const line = `${key}=${value}`;
    text = new RegExp(`^${key}=.*$`, "m").test(text)
      ? text.replace(new RegExp(`^${key}=.*$`, "m"), () => line)
      : text.trimEnd() + "\n" + line + "\n";
  }
  await writeFile(envPath, text, { mode: 0o600 });
}
async function setup() {
  const originalRuntime = process.env.DATABASE_URL;
  if (existsSync(adminEnvPath)) process.loadEnvFile(adminEnvPath);
  if (process.env.DATABASE_ADMIN_URL) process.env.DATABASE_URL = process.env.DATABASE_ADMIN_URL;
  if (process.env.DATABASE_URL && new URL(process.env.DATABASE_URL).username.startsWith("souv_app_"))
    throw new Error("Kredensial admin tidak ditemukan. Pulihkan .local/database-admin.env; akun aplikasi tidak dapat menjalankan migrasi.");
  const owned = join(runtimeRoot, "postgres"),
    binaryDir =
      process.env.POSTGRES_BIN || "C:/Program Files/PostgreSQL/18/bin";
  const bin = (name) =>
    join(binaryDir, process.platform === "win32" ? name + ".exe" : name);
  if (!process.env.DATABASE_URL) {
    if (!existsSync(bin("initdb")))
      throw new Error(
        "initdb belum tersedia. Isi POSTGRES_BIN dengan folder bin PostgreSQL lokal.",
      );
    if (existsSync(join(owned, "PG_VERSION")))
      throw new Error(
        "Cluster lokal sudah ada. Pulihkan DATABASE_URL dari .env.local sebelum melanjutkan; database tidak diinisialisasi ulang.",
      );
    const password = randomBytes(24).toString("base64url");
    await save({
      DATABASE_URL: `postgresql://souv_owner:${password}@127.0.0.1:55432/souvenir_tracking`,
      POSTGRES_BIN: binaryDir.replaceAll("\\", "/"),
    });
  }
  await mkdir(runtimeRoot, { recursive: true });
  // Store owner credentials outside Next.js environment files.
  await writeFile(adminEnvPath, 'DATABASE_ADMIN_URL=' + process.env.DATABASE_URL + '\n', { mode: 0o600 });
  const options = databaseOptions();
  const url = new URL(process.env.DATABASE_URL);
  const ownCluster =
    ["127.0.0.1", "localhost"].includes(url.hostname) && url.port === "55432" &&
    url.username === "souv_owner" &&
    url.pathname === "/souvenir_tracking";
  if (ownCluster) {
    await mkdir(runtimeRoot, { recursive: true });
    if (!existsSync(join(owned, "PG_VERSION"))) {
      const pwFile = join(runtimeRoot, "init-password.tmp");
      await writeFile(pwFile, decodeURIComponent(url.password), {
        mode: 0o600,
      });
      try {
        await exec(
          bin("initdb"),
          [
            "-D",
            owned,
            "-U",
            "souv_owner",
            "--pwfile",
            pwFile,
            "--auth-host=scram-sha-256",
            "--auth-local=scram-sha-256",
            "--encoding=UTF8",
            "--locale=C",
          ],
          { windowsHide: true, timeout: 60000 },
        );
      } finally {
        await unlink(pwFile).catch(() => {});
      }
      console.log("OK: cluster PostgreSQL khusus proyek dibuat.");
    }
    let running = false;
    try {
      await exec(
        options.executable,
        ["-X", "-w", "-A", "-t", "-c", "SELECT 1"],
        {
          env: { ...options.env, PGDATABASE: "postgres" },
          windowsHide: true,
          timeout: 7000,
        },
      );
      running = true;
    } catch {}
    if (!running)
      await exec(
        bin("pg_ctl"),
        [
          "-D",
          owned,
          "-l",
          join(runtimeRoot, "postgres.log"),
          "-o",
          "-p 55432 -h 127.0.0.1",
          "-w",
          "-t",
          "20",
          "start",
        ],
        { windowsHide: true, timeout: 30000 },
      );
    const dbEnv = { ...options.env, PGDATABASE: "postgres" };
    const { stdout } = await exec(
      options.executable,
      [
        "-X",
        "-w",
        "-A",
        "-t",
        "-c",
        "SELECT 1 FROM pg_database WHERE datname='souvenir_tracking'",
      ],
      { env: dbEnv, windowsHide: true },
    );
    if (stdout.trim() !== "1")
      await exec(bin("createdb"), ["souvenir_tracking"], {
        env: dbEnv,
        windowsHide: true,
      });
    console.log("OK: PostgreSQL proyek berjalan di 127.0.0.1:55432.");
  }
  await migrateDatabase(process.env.DATABASE_URL);
  const adminPassword =
    process.env.LOCAL_ADMIN_PASSWORD || randomBytes(18).toString("base64url");
  const memberPassword =
    process.env.LOCAL_MEMBER_PASSWORD || randomBytes(18).toString("base64url");
  await save({
    LOCAL_ADMIN_EMAIL: "admin@funding.local",
    LOCAL_ADMIN_PASSWORD: adminPassword,
    LOCAL_MEMBER_EMAIL: "anggota@funding.local",
    LOCAL_MEMBER_PASSWORD: memberPassword,
  });
  for (const [id, email, name, role, password] of [
    [
      "30000000-0000-4000-8000-000000000001",
      "admin@funding.local",
      "Admin Funding",
      "admin",
      adminPassword,
    ],
    [
      "30000000-0000-4000-8000-000000000002",
      "anggota@funding.local",
      "Nadia Putri",
      "member",
      memberPassword,
    ],
  ]) {
    if (role === "member" && process.env.SEED_DEMO_DATA !== "1") continue;
    await query(
      "WITH added AS (INSERT INTO souv.users(id,email,name,role,password_hash) VALUES($1::uuid,$2,$3,$4,$5) ON CONFLICT(email)DO NOTHING RETURNING id) SELECT count(*) AS added FROM added",
      [id, email, name, role, await hashPassword(password)],
    );
  }
  const rows = [
    ["TMB-001", "Tumbler Stainless", "Drinkware", 20, 124],
    ["TOT-001", "Tote Bag Canvas", "Tas & Aksesori", 15, 86],
    ["NTB-001", "Notebook A5", "Alat Tulis", 20, 12],
    ["UMB-001", "Payung Lipat", "Tas & Aksesori", 10, 48],
    ["PEN-001", "Pulpen Metal", "Alat Tulis", 30, 185],
    ["MUG-001", "Mug Keramik", "Drinkware", 15, 8],
    ["KEY-001", "Gantungan Kunci", "Tas & Aksesori", 20, 72],
    ["PCH-001", "Pouch Travel", "Tas & Aksesori", 10, 0],
  ];
  const admin = (
    await query("SELECT id FROM souv.users WHERE email=$1", [
      "admin@funding.local",
    ])
  )[0];
  // Remember completed bootstrap so deleted starter products stay deleted.
  for (let i = 0; process.env.SEED_DEMO_DATA === "1" && process.env.LOCAL_PRODUCTS_SEEDED !== "1" && i < rows.length; i++) {
    const [sku, name, category, minimum, quantity] = rows[i],
      suffix = String(i + 1).padStart(12, "0"),
      id = `10000000-0000-4000-8000-${suffix}`;
    await query(
      "WITH added AS (INSERT INTO souv.products(id,sku,name,category,unit,minimum) VALUES($1::uuid,$2,$3,$4,'pcs',$5) ON CONFLICT(id)DO NOTHING RETURNING id) SELECT count(*) AS added FROM added",
      [id, sku, name, category, minimum],
    );
    if (quantity)
      await query("SELECT souv.write_action($1::uuid,$2::jsonb) AS result", [
        admin.id,
        JSON.stringify({
          action: "movement",
          kind: "in",
          request_id: `20000000-0000-4000-8000-${suffix}`,
          product_id: id,
          quantity,
          recipient: "",
          note: "Stok awal contoh lokal",
          reversal_of: null,
        }),
      ]);
  }
  if (process.env.SEED_DEMO_DATA === "1" && process.env.LOCAL_PRODUCTS_SEEDED !== "1")
    await save({ LOCAL_PRODUCTS_SEEDED: "1" });
  const runtimeURL = await provisionRuntime(process.env.DATABASE_URL, originalRuntime);
  await save({ DATABASE_URL: runtimeURL });
  await closeDatabase();
  console.log("OK: migrasi, akun, dan stok siap. Aplikasi memakai akun database terbatas; kredensial admin tersimpan di .local/database-admin.env.");
}
setup().catch(async (error) => {
  await closeDatabase();
  console.error(error.message?.startsWith("SOUV:") || /Migrasi|Kredensial admin|Cluster lokal|initdb belum|Perintah administrasi/.test(error.message || "") ? error.message : "Setup gagal. Periksa koneksi admin dan instalasi PostgreSQL.");
  process.exitCode = 1;
});
