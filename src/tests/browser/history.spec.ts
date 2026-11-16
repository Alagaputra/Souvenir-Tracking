import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import { demoSnapshot } from "../../lib/demo";

async function openHistory(page: Page) {
  await page.goto("/");
  if ((page.viewportSize()?.width || 1440) <= 720) await page.getByRole("button", { name: "Riwayat", exact: true }).click();
  else await page.locator(".sidebar").getByRole("button", { name: "Riwayat aktivitas", exact: true }).click();
}

test("server history paginates, retries a failed page and exports every match", async ({ page }) => {
  const snapshot = { ...demoSnapshot(), demo: false };
  const rows = Array.from({ length: 51 }, (_, i) => ({ ...snapshot.movements[0], id: `server-${i}`, product_name: `Server souvenir ${i + 1}` }));
  let failSecondPage = true;
  let exports = 0;
  await page.route("**/api/workspace", route => route.fulfill({ json: snapshot }));
  await page.route("**/api/history?*", route => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get("export") === "1") { exports++; return route.fulfill({ json: { total: 51, movements: rows } }); }
    const current = Number(params.get("page"));
    if (current === 2 && failSecondPage) { failSecondPage = false; return route.fulfill({ status: 503, json: { error: "Gangguan riwayat sementara." } }); }
    return route.fulfill({ json: { total: 51, movements: rows.slice((current - 1) * 25, current * 25) } });
  });
  await openHistory(page);
  await expect(page.getByText("51 catatan cocok · halaman 1 dari 3", { exact: true })).toBeVisible();
  const mobile = (page.viewportSize()?.width || 1440) <= 720;
  await expect(mobile ? page.getByRole("list", { name: "Daftar riwayat" }).locator("li") : page.locator(".desktop-history tbody tr")).toHaveCount(25);
  await page.getByRole("button", { name: "Berikutnya", exact: true }).click();
  await expect(page.locator(".app-shell").getByRole("alert")).toContainText("Gangguan riwayat sementara.");
  await page.getByRole("button", { name: "Coba lagi", exact: true }).click();
  await expect(page.getByText("51 catatan cocok · halaman 2 dari 3", { exact: true })).toBeVisible();
  await expect(page.getByText("Server souvenir 26", { exact: true }).filter({ visible: true })).toBeVisible();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Ekspor riwayat", exact: true }).click();
  const file = await downloaded;
  const zip = await JSZip.loadAsync(await readFile((await file.path())!));
  expect(await zip.file("xl/tables/table1.xml")!.async("string")).toContain('ref="A1:I52"');
  expect(exports).toBe(1);
  await page.getByRole("button", { name: "Berikutnya", exact: true }).click();
  await expect(page.getByText("51 catatan cocok · halaman 3 dari 3", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Berikutnya", exact: true })).toBeDisabled();
});

test("stale search responses cannot replace the latest history filters", async ({ page }) => {
  await page.route("**/api/workspace", route => route.fulfill({ json: { ...demoSnapshot(), demo: false } }));
  let finishOld!: () => void;
  const gate = new Promise<void>(resolve => { finishOld = resolve; });
  await page.route("**/api/history?*", async route => {
    const search = new URL(route.request().url()).searchParams.get("search");
    if (search === "lama") await gate;
    return route.fulfill({ json: { total: search === "lama" ? 9 : 0, movements: [] } }).catch(() => {});
  });
  await openHistory(page);
  const oldRequest = page.waitForRequest(request => request.url().includes("search=lama"));
  await page.getByLabel("Cari riwayat", { exact: true }).fill("lama");
  await oldRequest;
  await page.getByLabel("Cari riwayat", { exact: true }).fill("baru");
  await expect(page.getByText("0 catatan cocok · halaman 1 dari 1", { exact: true })).toBeVisible();
  finishOld();
  await expect(page.getByLabel("Cari riwayat", { exact: true })).toHaveValue("baru");
  await expect(page.getByRole("button", { name: "Ekspor riwayat", exact: true })).toBeDisabled();
});

test("password form validates confirmation and sends only the password change fields", async ({ page }) => {
  await page.route("**/api/workspace", route => route.fulfill({ json: { ...demoSnapshot(), demo: false } }));
  let changes = 0;
  await page.route("**/api/account", route => {
    expect(route.request().postDataJSON()).toEqual({ current_password: "Current-password-123", new_password: "New-password-12345" });
    changes++; return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Ubah password", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Ubah password", exact: true });
  await dialog.getByLabel("Password saat ini", { exact: true }).fill("Current-password-123");
  await dialog.getByLabel("Password baru", { exact: true }).fill("New-password-12345");
  await dialog.getByLabel("Konfirmasi password baru", { exact: true }).fill("Different-password-123");
  await dialog.getByRole("button", { name: "Konfirmasi & simpan", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Konfirmasi password tidak cocok.");
  expect(changes).toBe(0);
  await dialog.getByLabel("Konfirmasi password baru", { exact: true }).fill("New-password-12345");
  await dialog.getByRole("button", { name: "Konfirmasi & simpan", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(changes).toBe(1);
});
