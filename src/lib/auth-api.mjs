// @ts-check
import { query } from "./local-db.mjs";
import {
  verifyPassword,
  newSession,
  tokenHash,
  readSession,
  sessionCookie,
} from "./local-security.mjs";

import { fail, json, sameOrigin, readBody } from "./http.mjs";
export function profileFields(alias = "u") { return `${alias}.id,${alias}.name,${alias}.email,${alias}.role,${alias}.active`; }
/** @param {Request} request @returns {Promise<import("./types").Profile>} */
export async function authenticated(request) {
  // Cookie membawa token asli; database hanya menyimpan hash dan masa berlaku sesi.
  // Status akun diperiksa setiap kali API diakses agar akun nonaktif langsung ditolak.
  const token = readSession(request);
  if (!token) fail("Silakan masuk kembali.", 401);
  /** @type {import('./types').Profile[]} */
  const users = await query(
    `SELECT ${profileFields()} FROM souv.sessions s JOIN souv.users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active`,
    [tokenHash(token)],
  );
  if (!users[0]) fail("Silakan masuk kembali.", 401);
  return users[0];
}
/** @param {Request} request */
export async function login(request) {
  sameOrigin(request);
  const body = await readBody(request);
  if (
    typeof body.email !== "string" ||
    typeof body.password !== "string" ||
    body.email.length > 254 ||
    body.password.length > 256
  )
    fail("Email atau password tidak valid.");
  const email = body.email.trim().toLowerCase();
  // Hitung percobaan sebelum memeriksa password; pembatasan berlaku per hash email.
  const attempt = (
    await query("SELECT souv.claim_login_attempt($1) AS allowed", [
      tokenHash(email),
    ])
  )[0];
  if (!attempt.allowed)
    fail("Terlalu banyak percobaan. Coba lagi dalam 15 menit.", 429);
  const user = (
    await query(
      "SELECT id,password_hash,active FROM souv.users WHERE email=$1",
      [email],
    )
  )[0];
  if (
    !(await verifyPassword(body.password, user?.password_hash)) ||
    !user?.active
  )
    fail("Email atau password salah, atau akun tidak aktif.", 401);
  const token = newSession();
  // Periksa ulang akun sambil mengunci baca agar sesi tidak dibuat untuk akun
  // yang dinonaktifkan bersamaan. Token asli hanya dikirim melalui cookie HttpOnly.
  const sessions = await query(
    "SELECT souv.create_session($1::uuid,$2,$3) AS user_id",
    [user.id, user.password_hash, tokenHash(token)],
  );
  if (!sessions[0]?.user_id) fail("Akun tidak aktif.", 401);
  await query(
    "SELECT souv.clear_login_attempt($1)",
    [tokenHash(email)],
  );
  return json({ ok: true }, 200, {
    "Set-Cookie": sessionCookie(request, token),
  });
}
/** @param {Request} request */
export async function logout(request) {
  sameOrigin(request);
  const token = readSession(request);
  if (token)
    await query(
      "WITH deleted AS (DELETE FROM souv.sessions WHERE token_hash=$1) SELECT 1 AS ok",
      [tokenHash(token)],
    );
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(request) });
}
