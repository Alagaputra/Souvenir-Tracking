// @ts-check
import { query } from "./local-db.mjs";
import { authenticated } from "./auth-api.mjs";
import { fail, json, uuid } from "./http.mjs";

export const movementFields = "id,product_id,actor_id,kind,quantity,recipient,note,created_at,reversal_of,cancelled,product_name,product_sku,actor_name";
/** @param {string} value */
function calendarDate(value) {
  if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value + "T00:00:00Z")) || new Date(value + "T00:00:00Z").toISOString().slice(0, 10) !== value))
    fail("Tanggal tidak valid.");
  return value || null;
}
/** @param {URLSearchParams} params */
export function historyFilters(params) {
  const from = calendarDate(params.get("from") || "");
  const to = calendarDate(params.get("to") || "");
  if (from && to && from > to) fail("Tanggal awal harus sebelum atau sama dengan tanggal akhir.");
  const kind = params.get("kind") || "";
  if (kind && !["in", "out", "adjust", "reversal"].includes(kind)) fail("Jenis aktivitas tidak valid.");
  const product = params.get("product") || "", actor = params.get("actor") || "";
  const search = (params.get("search") || "").trim();
  if (search.length > 160) fail("Pencarian maksimal 160 karakter.");
  const page = Number(params.get("page") || "1"), pageSize = Number(params.get("pageSize") || "25");
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000000 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100)
    fail("Halaman tidak valid.");
  const exporting = params.get("export") === "1";
  return { from, to, kind: kind || null, product: product ? uuid(product, "Produk") : null,
    actor: actor ? uuid(actor, "Petugas") : null, search, page, pageSize, exporting };
}
/** @param {Request} request */
export async function history(request) {
  const user = await authenticated(request);
  const f = historyFilters(new URL(request.url).searchParams);
  // Filtering, count and rows are evaluated in one database snapshot. Members
  // remain scoped to their own actor_id even when they supply an actor filter.
  const [row] = await query(`WITH filtered AS MATERIALIZED (
    SELECT ${movementFields} FROM souv.movements
    WHERE ($1::boolean OR actor_id=$2::uuid)
      AND ($3::date IS NULL OR created_at >= ($3::date::timestamp AT TIME ZONE 'Asia/Jakarta'))
      AND ($4::date IS NULL OR created_at < (($4::date + 1)::timestamp AT TIME ZONE 'Asia/Jakarta'))
      AND ($5::text IS NULL OR kind=$5)
      AND ($6::uuid IS NULL OR product_id=$6)
      AND ($7::uuid IS NULL OR actor_id=$7)
      AND ($8::text='' OR strpos(lower(product_name || ' ' || recipient || ' ' || actor_name),lower($8))>0)
  ) SELECT jsonb_build_object(
    'total',(SELECT count(*) FROM filtered),
    'movements',COALESCE((SELECT jsonb_agg(p ORDER BY p.created_at DESC,p.id DESC)
      FROM (SELECT * FROM filtered ORDER BY created_at DESC,id DESC LIMIT $9::integer OFFSET $10::integer) p),'[]'::jsonb)
  ) AS history`, [user.role === "admin", user.id, f.from, f.to, f.kind, f.product, f.actor,
    f.search, f.exporting ? null : f.pageSize, f.exporting ? 0 : (f.page - 1) * f.pageSize]);
  return json({ ...row.history, page: f.page, pageSize: f.pageSize });
}

/** @param {import('./types').Profile} user */
export async function monthlySummary(user) {
  const [row] = await query(`SELECT
    COALESCE(sum(quantity) FILTER (WHERE kind='in' AND NOT cancelled),0)::double precision AS incoming,
    COALESCE(-sum(quantity) FILTER (WHERE kind='out' AND NOT cancelled),0)::double precision AS given
    FROM souv.movements WHERE ($1::boolean OR actor_id=$2::uuid)
      AND created_at >= (date_trunc('month',now() AT TIME ZONE 'Asia/Jakarta') AT TIME ZONE 'Asia/Jakarta')
      AND created_at < ((date_trunc('month',now() AT TIME ZONE 'Asia/Jakarta') + interval '1 month') AT TIME ZONE 'Asia/Jakarta')`,
    [user.role === "admin", user.id]);
  return row;
}
