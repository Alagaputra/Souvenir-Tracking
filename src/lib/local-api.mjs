// @ts-check
import { query, databaseConfigured } from "./local-db.mjs";
import { hashPassword } from "./local-security.mjs";
import { positiveInteger, requiredText } from "./domain.mjs";
import { fail, json, sameOrigin, uuid, readBody, readUpload, HttpError } from "./http.mjs";
import { authenticated, login, logout, profileFields } from "./auth-api.mjs";
import { history, monthlySummary } from "./history-api.mjs";
import { changePassword } from "./account-api.mjs";

/** @param {Request} request */
async function workspace(request) {
  // Tanpa konfigurasi database, frontend menerima penanda untuk membuka mode demo.
  if (!databaseConfigured()) return json({ setup: true });
  const user = await authenticated(request);
  const products = await query("SELECT * FROM souv.products ORDER BY name");
  const movements = await query(
    // Admin melihat seluruh tim; anggota hanya menerima transaksi miliknya.
    `SELECT id,product_id,actor_id,kind,quantity,recipient,note,created_at,reversal_of,cancelled,product_name,product_sku,actor_name FROM souv.movements WHERE ($1::boolean OR actor_id=$2::uuid) ORDER BY created_at DESC,id DESC LIMIT 25`,
    [user.role === "admin", user.id],
  );
  const members =
    user.role === "admin"
      ? await query(`SELECT ${profileFields()} FROM souv.users u ORDER BY name`)
      : [user];
  const summary = await monthlySummary(user);
  return json({ user, products, movements, members, summary, demo: false });
}
/** @param {Request} request */
async function stockRegister(request) {
  const user = await authenticated(request);
  if (user.role !== "admin") fail("Akses tidak diizinkan.", 403);
  // Satu query mengambil stok dan seluruh riwayat dari snapshot database yang sama.
  // Register mengambil seluruh riwayat dari snapshot yang sama.
  const [row] = await query(`SELECT jsonb_build_object(
    'products',COALESCE((SELECT jsonb_agg(p ORDER BY p.name,p.id) FROM souv.products p),'[]'::jsonb),
    'movements',COALESCE((SELECT jsonb_agg(m ORDER BY m.created_at,m.id) FROM (
      SELECT id,product_id,actor_id,kind,quantity,recipient,note,created_at,reversal_of,cancelled,product_name,product_sku,actor_name
      FROM souv.movements
    ) m),'[]'::jsonb),
    'exported_at',now()
  ) AS register`);
  return json(row.register);
}
/** @param {Record<string, unknown>} body */
function movement(body) {
  // in/out menerima jumlah positif; adjust menerima stok fisik tujuan (boleh nol).
  // Untuk reversal, database mencari transaksi asal dan menghitung nilai pembaliknya.
  const kind = body.kind;
  if (typeof kind !== "string" || !["in", "out", "adjust", "reversal"].includes(kind))
    fail("Jenis pencatatan tidak valid.");
  const quantity =
    kind === "reversal"
      ? 0
      : kind === "adjust"
        ? Number(body.quantity)
        : positiveInteger(body.quantity);
  if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 1000000)
    fail("Jumlah tidak valid.");
  return {
    action: "movement",
    kind,
    quantity,
    request_id: uuid(body.request_id, "Permintaan"),
    product_id: kind === "reversal" ? null : uuid(body.product_id, "Produk"),
    reversal_of: kind === "reversal" ? uuid(body.reversal_of, "Catatan") : null,
    recipient:
      kind === "out" ? requiredText(body.recipient, "Nama nasabah") : "",
    note: ["adjust", "reversal"].includes(kind)
      ? requiredText(body.note, "Alasan", 500)
      : String(body.note || "")
          .trim()
          .slice(0, 500),
  };
}
/** @param {Request} request */
async function writeWorkspace(request) {
  // Urutan simpan: cek origin -> cek sesi/peran -> validasi payload -> fungsi SQL.
  sameOrigin(request);
  const user = await authenticated(request);
  const body = await readBody(request);
  let action;
  if (body.action === "movement") {
    action = movement(body);
    if (["adjust", "reversal"].includes(action.kind) && user.role !== "admin")
      fail("Akses tidak diizinkan.", 403);
  } else if (body.action === "product") {
    if (user.role !== "admin") fail("Akses tidak diizinkan.", 403);
    const minimum = Number(body.minimum);
    if (!Number.isSafeInteger(minimum) || minimum < 0 || minimum > 1000000)
      fail("Batas minimum tidak valid.");
    const sku = requiredText(body.sku, "Kode produk", 40).toUpperCase();
    if (!/^[A-Z0-9_-]+$/.test(sku))
      fail(
        "Kode produk hanya boleh berisi huruf, angka, garis bawah, atau tanda hubung.",
      );
    const photo = body.photo || null;
    if (
      photo &&
      (typeof photo !== "string" ||
        !/^\/api\/photos\/[a-f0-9-]{36}$/.test(photo))
    )
      fail("Foto tidak valid.");
    if (
      photo &&
      !(
        await query("SELECT id FROM souv.photos WHERE id=$1::uuid", [
          uuid(String(photo).split("/").pop()),
        ])
      )[0]
    )
      fail("Foto tidak ditemukan.");
    action = {
      action: "product",
      id: body.id ? uuid(body.id) : null,
      sku,
      name: requiredText(body.name, "Nama barang"),
      category: requiredText(body.category, "Kategori", 60),
      unit: requiredText(body.unit, "Satuan", 30),
      minimum,
      photo,
    };
  } else if (body.action === "archive") {
    if (user.role !== "admin") fail("Akses tidak diizinkan.", 403);
    if (typeof body.active !== "boolean") fail("Status tidak valid.");
    action = { action: "archive", id: uuid(body.id), active: body.active };
  } else if (body.action === "delete-product") {
    if (user.role !== "admin") fail("Akses tidak diizinkan.", 403);
    await query("SELECT souv.delete_product($1::uuid,$2::uuid) AS id", [
      user.id,
      uuid(body.id),
    ]);
    return json({ ok: true });
  } else fail("Tindakan tidak dikenali.");
  await query("SELECT souv.write_action($1::uuid,$2::jsonb) AS result", [
    user.id,
    JSON.stringify(action),
  ]);
  // Fungsi SQL mengunci produk, memeriksa request_id, lalu mengubah stok dan
  // mencatat riwayat secara atomik. Pengulangan payload yang sama tidak menambah stok lagi.
  return json({ ok: true });
}
/** @param {Request} request */
async function members(request) {
  // ID terisi berarti mengubah status akun; tanpa ID berarti membuat akun baru.
  // Password akun baru di-hash di server sebelum diteruskan ke database.
  sameOrigin(request);
  const user = await authenticated(request);
  if (user.role !== "admin") fail("Akses tidak diizinkan.", 403);
  const body = await readBody(request);
  let action;
  if (body.id) {
    if (typeof body.active !== "boolean") fail("Status tidak valid.");
    action = { action: "member", id: uuid(body.id), active: body.active };
  } else {
    const email = requiredText(body.email, "Email", 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      fail("Format email tidak valid.");
    if (
      typeof body.password !== "string" ||
      body.password.length < 12 ||
      body.password.length > 128
    )
      fail("Password harus 12–128 karakter.");
    if (typeof body.role !== "string" || !["admin", "member"].includes(body.role)) fail("Peran tidak valid.");
    action = {
      action: "member",
      name: requiredText(body.name, "Nama anggota"),
      email,
      role: body.role,
      password_hash: await hashPassword(body.password),
    };
  }
  await query("SELECT souv.write_action($1::uuid,$2::jsonb) AS result", [
    user.id,
    JSON.stringify(action),
  ]);
  return json({ ok: true });
}
/** @param {Request} request */
async function upload(request) {
  sameOrigin(request);
  const user = await authenticated(request);
  if (user.role !== "admin") fail("Akses tidak diizinkan.", 403);
  const file = (await readUpload(request)).get("file");
  if (
    !(file instanceof File) ||
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    !file.size ||
    file.size > 2097152
  )
    fail("Gunakan foto JPG, PNG, atau WebP maksimal 2 MB.");
  const data = Buffer.from(await file.arrayBuffer());
  // Selain MIME/ukuran, periksa penanda byte agar isi file sesuai format gambar.
  const signature =
    file.type === "image/png"
      ? data
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : file.type === "image/jpeg"
        ? data[0] === 255 && data[1] === 216 && data[2] === 255
        : data.subarray(0, 4).toString() === "RIFF" &&
          data.subarray(8, 12).toString() === "WEBP";
  if (!signature) fail("Isi foto tidak sesuai format gambar.");
  const result = (
    await query(
      "WITH photo AS (INSERT INTO souv.photos(mime,data) VALUES($1,decode($2,'base64')) RETURNING id) SELECT id FROM photo",
      [file.type, data.toString("base64")],
    )
  )[0];
  return json({ url: `/api/photos/${result.id}` });
}
/** @param {Request} request @param {string} id */
async function photo(request, id) {
  await authenticated(request);
  const row = (
    await query(
      "SELECT mime,encode(data,'base64') AS bytes FROM souv.photos WHERE id=$1::uuid",
      [uuid(id)],
    )
  )[0];
  if (!row) fail("Foto tidak ditemukan.", 404);
  return new Response(Buffer.from(row.bytes, "base64"), {
    headers: {
      "Content-Type": row.mime,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** @param {Request} request */
export async function handleAPI(request) {
  // Semua route API memakai dispatcher ini agar format respons dan error konsisten.
  try {
    const path = new URL(request.url).pathname,
      method = request.method;
    if (path === "/api/workspace" && method === "GET")
      return await workspace(request);
    if (path === "/api/history" && method === "GET") return await history(request);
    if (path === "/api/account" && method === "POST") return await changePassword(request);
    if (path === "/api/register" && method === "GET")
      return await stockRegister(request);
    if (path === "/api/workspace" && method === "POST")
      return await writeWorkspace(request);
    if (path === "/api/auth" && method === "POST") return await login(request);
    if (path === "/api/auth" && method === "DELETE")
      return await logout(request);
    if (path === "/api/members" && method === "POST")
      return await members(request);
    if (path === "/api/upload" && method === "POST")
      return await upload(request);
    if (path.startsWith("/api/photos/") && method === "GET")
      return await photo(request, path.slice("/api/photos/".length));
    return json({ error: "Endpoint tidak ditemukan." }, 404);
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    if (error instanceof SyntaxError) return json({ error: "Format permintaan tidak valid." }, 400);
    console.error(JSON.stringify({ event: "api_error", path: new URL(request.url).pathname, type: error instanceof Error ? error.name : "unknown" }));
    return json({ error: "Terjadi kesalahan pada server. Silakan coba lagi." }, 500);
  }
}
