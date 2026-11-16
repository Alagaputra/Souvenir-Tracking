// @ts-check
export class HttpError extends Error {
  /** @param {string} message @param {number} [status] */
  constructor(message, status = 400) { super(message); this.status = status; }
}
/** @param {string} message @param {number} [status] @returns {never} */
export function fail(message, status = 400) { throw new HttpError(message, status); }
/** @param {unknown} body @param {number} [status] @param {HeadersInit} [headers] */
export function json(body, status = 200, headers = {}) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}
/** @param {Request} request */
export function sameOrigin(request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) fail("Akses tidak diizinkan.", 403);
}
/** @param {unknown} value @param {string} [label] */
export function uuid(value, label = "Identitas") {
  if (typeof value !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) fail(`${label} tidak valid.`);
  return value.toLowerCase();
}
/** @param {Request} request @returns {Promise<Record<string, unknown>>} */
export async function readBody(request) {
  const body = JSON.parse(new TextDecoder().decode(await readBytes(request, 16384)));
  if (!body || typeof body !== "object" || Array.isArray(body)) fail("Format permintaan tidak valid.");
  return body;
}
/** @param {Request} request @param {number} maximum @returns {Promise<Uint8Array<ArrayBuffer>>} */
export async function readBytes(request, maximum) {
  if (Number(request.headers.get("content-length")) > maximum) fail("Ukuran permintaan terlalu besar.", 413);
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) { await reader.cancel(); fail("Ukuran permintaan terlalu besar.", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
/** @param {Request} request */
export async function readUpload(request) {
  const bytes = await readBytes(request, 2 * 1024 * 1024 + 65536);
  try { return await new Response(bytes, { headers: request.headers }).formData(); }
  catch { fail("Format unggahan tidak valid."); }
}
