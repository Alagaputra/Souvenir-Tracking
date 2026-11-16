import pg from "pg";
import { randomBytes, randomUUID } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { root, loadAdminEnvironment } from "./admin-env.mjs";
import { hashPassword } from "../lib/local-security.mjs";
try {
  loadAdminEnvironment();
  const i = process.argv.indexOf("--email"), email = i < 0 ? "" : (process.argv[i + 1] || "").trim().toLowerCase();
  if (!email || email.length > 254) throw new Error("Gunakan --email <email-akun>.");
  const client = new pg.Client({ connectionString: process.env.DATABASE_ADMIN_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query("SELECT id FROM souv.users WHERE email=$1 AND active FOR UPDATE", [email]);
    if (!result.rows[0]) throw new Error("Akun aktif tidak ditemukan.");
    const password = randomBytes(18).toString("base64url");
    const folder = resolve(root, "../.local/account-recovery");
    await mkdir(folder, { recursive: true, mode: 0o700 });
    const file = resolve(folder, `reset-${randomUUID()}.txt`);
    await writeFile(file, `Email: ${email}\nPassword sementara: ${password}\nGanti melalui menu Ubah password setelah login, lalu hapus berkas ini.\n`, { mode: 0o600, flag: "wx" });
    await client.query("UPDATE souv.users SET password_hash=$1 WHERE id=$2", [await hashPassword(password),result.rows[0].id]);
    await client.query("DELETE FROM souv.sessions WHERE user_id=$1", [result.rows[0].id]);
    await client.query("COMMIT");
    console.log(`OK: password direset dan sesi dicabut. Buka kredensial sementara di ${file}`);
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { await client.end(); }
} catch (error) {
  console.error(["Gunakan --email <email-akun>.", "Akun aktif tidak ditemukan."].includes(error.message) ? error.message : "Reset password gagal. Periksa koneksi dan izin admin database.");
  process.exitCode = 1;
}
