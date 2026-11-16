// @ts-check
import { authenticated } from "./auth-api.mjs";
import { query } from "./local-db.mjs";
import { hashPassword, verifyPassword, newSession, tokenHash, sessionCookie } from "./local-security.mjs";
import { fail, json, readBody, sameOrigin } from "./http.mjs";

/** @param {Request} request */
export async function changePassword(request) {
  sameOrigin(request);
  const user = await authenticated(request);
  const body = await readBody(request);
  if (typeof body.new_password !== "string" || body.new_password.length < 12 || body.new_password.length > 128)
    fail("Password baru harus 12–128 karakter.");
  if (body.new_password === body.current_password) fail("Gunakan password yang berbeda dari password saat ini.");
  const [stored] = await query("SELECT password_hash FROM souv.users WHERE id=$1::uuid", [user.id]);
  if (!await verifyPassword(body.current_password, stored?.password_hash)) fail("Password saat ini salah.", 403);
  const token = newSession();
  const [changed] = await query("SELECT souv.change_password($1::uuid,$2,$3,$4) AS ok",
    [user.id, stored.password_hash, await hashPassword(body.new_password), tokenHash(token)]);
  if (!changed.ok) fail("Akun berubah. Silakan masuk kembali.", 409);
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(request, token) });
}
