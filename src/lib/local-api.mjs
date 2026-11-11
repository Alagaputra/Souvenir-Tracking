import { query, databaseConfigured } from "./local-db.mjs";
import {
  hashPassword,
  verifyPassword,
  newSession,
  tokenHash,
  readSession,
  sessionCookie,
  SESSION_SECONDS,
} from "./local-security.mjs";
import { positiveInteger, requiredText } from "./domain.mjs";

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}
function json(body, status = 200, headers = {}) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}
function sameOrigin(request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    fail("Akses tidak diizinkan.", 403);
}
function uuid(value, label = "Identitas") {
  if (
    typeof value !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      value,
    )
  )
    fail(`${label} tidak valid.`);
  return value.toLowerCase();
}
function profileFields(alias = "u") {
  return `${alias}.id,${alias}.name,${alias}.email,${alias}.role,${alias}.active`;
}
export async function authenticated(request) {
  const token = readSession(request);
  if (!token) fail("Silakan masuk kembali.", 401);
  const users = await query(
    `SELECT ${profileFields()} FROM souv.sessions s JOIN souv.users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active`,
    [tokenHash(token)],
  );
  if (!users[0]) fail("Silakan masuk kembali.", 401);
  return users[0];
}
async function login(request) {
  sameOrigin(request);
  const body = await request.json();
  if (
    typeof body.email !== "string" ||
    typeof body.password !== "string" ||
    body.email.length > 254 ||
    body.password.length > 256
  )
    fail("Email atau password tidak valid.");
  const email = body.email.trim().toLowerCase();
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
  const sessions = await query(
    `WITH live AS (SELECT id FROM souv.users WHERE id=$1::uuid AND active FOR SHARE), inserted AS (INSERT INTO souv.sessions(token_hash,user_id,expires_at) SELECT $2,id,now()+($3::integer*interval '1 second') FROM live RETURNING user_id) SELECT user_id FROM inserted`,
    [user.id, tokenHash(token), SESSION_SECONDS],
  );
  if (!sessions[0]) fail("Akun tidak aktif.", 401);
  await query(
    "WITH cleaned AS (DELETE FROM souv.login_attempts WHERE key=$1) SELECT 1 AS ok",
    [tokenHash(email)],
  );
  return json({ ok: true }, 200, {
    "Set-Cookie": sessionCookie(request, token),
  });
}
async function logout(request) {
  sameOrigin(request);
  const token = readSession(request);
  if (token)
    await query(
      "WITH deleted AS (DELETE FROM souv.sessions WHERE token_hash=$1) SELECT 1 AS ok",
      [tokenHash(token)],
    );
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(request) });
}
async function workspace(request) {
  if (!databaseConfigured()) return json({ setup: true });
  const user = await authenticated(request);
  const products = await query("SELECT * FROM souv.products ORDER BY name");
  const movements = await query(
    `SELECT id,product_id,actor_id,kind,quantity,recipient,note,created_at,reversal_of,cancelled,product_name,product_sku,actor_name FROM souv.movements WHERE ($1::boolean OR actor_id=$2::uuid) ORDER BY created_at DESC,id DESC LIMIT 5000`,
    [user.role === "admin", user.id],
  );
  const members =
    user.role === "admin"
      ? await query(`SELECT ${profileFields()} FROM souv.users u ORDER BY name`)
      : [user];
  return json({ user, products, movements, members, demo: false });
}
async function stockRegister(request) {
  const user = await authenticated(request);
  if (user.role !== "admin") fail("Akses tidak diizinkan.", 403);
  // One statement provides a consistent stock/history snapshot without pagination.
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
function movement(body) {
  const kind = body.kind;
  if (!["in", "out", "adjust", "reversal"].includes(kind))
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
async function writeWorkspace(request) {
  sameOrigin(request);
  const user = await authenticated(request);
  const body = await request.json();
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
          uuid(photo.split("/").pop()),
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
  return json({ ok: true });
}
async function members(request) {
  sameOrigin(request);
  const user = await authenticated(request);
  if (user.role !== "admin") fail("Akses tidak diizinkan.", 403);
  const body = await request.json();
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
    if (!["admin", "member"].includes(body.role)) fail("Peran tidak valid.");
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
async function upload(request) {
  sameOrigin(request);
  const user = await authenticated(request);
  if (user.role !== "admin") fail("Akses tidak diizinkan.", 403);
  const file = (await request.formData()).get("file");
  if (
    !(file instanceof File) ||
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    !file.size ||
    file.size > 2097152
  )
    fail("Gunakan foto JPG, PNG, atau WebP maksimal 2 MB.");
  const data = Buffer.from(await file.arrayBuffer());
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

export async function handleAPI(request) {
  try {
    const path = new URL(request.url).pathname,
      method = request.method;
    if (path === "/api/workspace" && method === "GET")
      return await workspace(request);
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
    const status = error.status || 400;
    return json(
      {
        error:
          error instanceof SyntaxError
            ? "Format permintaan tidak valid."
            : error.message === "LOCAL_DB_NOT_CONFIGURED"
              ? "PostgreSQL belum disiapkan. Jalankan npm run db:setup."
              : error.message || "Permintaan tidak dapat diproses.",
      },
      status,
    );
  }
}
