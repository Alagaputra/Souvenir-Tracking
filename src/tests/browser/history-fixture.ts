import type { Page } from "@playwright/test";
import type { Snapshot } from "../../lib/types";
import { inDateRange } from "../../lib/domain.mjs";
export async function mockHistory(page: Page, snapshot: Snapshot) {
  await page.route("**/api/history?*", route => {
    const params = new URL(route.request().url()).searchParams;
    const search = (params.get("search") || "").toLowerCase();
    const rows = snapshot.movements.filter(m =>
      (snapshot.user.role === "admin" || m.actor_id === snapshot.user.id) &&
      (!params.get("kind") || m.kind === params.get("kind")) &&
      (!params.get("product") || m.product_id === params.get("product")) &&
      (!params.get("actor") || m.actor_id === params.get("actor")) &&
      inDateRange(m.created_at, params.get("from") || "", params.get("to") || "") &&
      `${m.product_name} ${m.recipient} ${m.actor_name}`.toLowerCase().includes(search));
    const currentPage = Number(params.get("page") || 1), pageSize = Number(params.get("pageSize") || 25);
    return route.fulfill({ json: { total: rows.length, page: currentPage, pageSize,
      movements: params.get("export") === "1" ? rows : rows.slice((currentPage - 1) * pageSize, currentPage * pageSize) } });
  });
}
