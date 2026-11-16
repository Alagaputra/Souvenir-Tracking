// @ts-check
import {
  randomBytes,
  scrypt as derive,
  timingSafeEqual,
  createHash,
} from "node:crypto";
/** @param {string} password @param {string} salt @param {number} length @param {import('node:crypto').ScryptOptions} settings @returns {Promise<Buffer>} */
function scrypt(password, salt, length, settings) {
  return new Promise((resolve, reject) => derive(password, salt, length, settings, (error, key) => error ? reject(error) : resolve(key)));
}
export const SESSION_COOKIE = "souv_session";
export const SESSION_SECONDS = 7 * 24 * 60 * 60;
const options = { N: 65536, r: 8, p: 1, maxmem: 96 * 1024 * 1024 };
// Salt acak membuat hash berbeda meskipun dua akun memakai password yang sama.
/** @param {string} password */
export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 64, options);
  return `scrypt$${salt}$${key.toString("hex")}`;
}
/** @param {unknown} password @param {unknown} stored */
export async function verifyPassword(password, stored) {
  if (typeof password !== "string" || password.length > 256) return false;
  const parts = typeof stored === "string" ? stored.split("$") : [];
  const valid =
    parts.length === 3 &&
    parts[0] === "scrypt" &&
    /^[a-f0-9]{32}$/.test(parts[1]) &&
    /^[a-f0-9]{128}$/.test(parts[2]);
  const key = await scrypt(
    password,
    valid ? parts[1] : "00000000000000000000000000000000",
    64,
    options,
  );
  // Hash tidak valid tetap melewati scrypt; hasil yang valid dibandingkan dengan
  // timingSafeEqual untuk menghindari perbandingan byte yang berhenti terlalu awal.
  return valid && timingSafeEqual(key, Buffer.from(parts[2], "hex"));
}
export function newSession() {
  return randomBytes(32).toString("hex");
}
/** @param {string} token */
export function tokenHash(token) {
  // Token sesi bersifat acak; simpan sidiknya agar token asli tidak ada di tabel sesi.
  return createHash("sha256").update(token).digest("hex");
}
/** @param {Request} request */
export function readSession(request) {
  const part = request.headers
    .get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(SESSION_COOKIE + "="));
  const token = part?.slice(SESSION_COOKIE.length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}
/** @param {Request} request @param {string} [token] */
export function sessionCookie(request, token = "") {
  // Token kosong menghapus cookie. HttpOnly membatasi akses JavaScript browser;
  // atribut Secure ditambahkan bila permintaan masuk melalui HTTPS.
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${token ? SESSION_SECONDS : 0}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}
