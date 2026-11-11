import { test, expect, type Page } from "@playwright/test";
import { demoSnapshot } from "../../lib/demo";

async function productsPage(page: Page) {
  await page.goto("/");
  if ((page.viewportSize()?.width || 1440) <= 720) {
    await page.getByRole("button", { name: "Stok", exact: true }).click();
  } else {
    await page.locator(".sidebar").getByRole("button", { name: /^Daftar souvenir/ }).click();
  }
}

test("product deletion confirms, cancels, handles failure, and refreshes the list", async ({ page }) => {
  const snapshot = { ...demoSnapshot(), demo: false };
  const empty = snapshot.products.find((p) => p.stock === 0)!;
  let deletes = 0;
  let fail = true;
  await page.route("**/api/workspace", async (route) => {
    if (route.request().method() === "POST") {
      expect(route.request().postDataJSON()).toEqual({ action: "delete-product", id: empty.id });
      deletes++;
      if (fail) return route.fulfill({ status: 400, json: { error: "Produk memiliki riwayat transaksi. Gunakan arsip." } });
      snapshot.products = snapshot.products.filter((p) => p.id !== empty.id);
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: snapshot });
  });
  await productsPage(page);
  await page.getByRole("button", { name: `Hapus ${empty.name}`, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Hapus produk", exact: true });
  await expect(dialog).toContainText(empty.name);
  await expect(dialog).toContainText(empty.sku);
  await expect(dialog).toContainText("tidak dapat dibatalkan");
  expect(deletes).toBe(0);
  await dialog.getByRole("button", { name: "Batal", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(deletes).toBe(0);
  await page.getByRole("button", { name: `Hapus ${empty.name}`, exact: true }).click();
  await dialog.getByRole("button", { name: "Hapus produk", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Gunakan arsip");
  await expect(dialog).toBeVisible();
  fail = false;
  await dialog.getByRole("button", { name: "Hapus produk", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: `Hapus ${empty.name}`, exact: true })).toHaveCount(0);
  await expect(page.getByText("Produk berhasil dihapus.", { exact: true })).toBeVisible();
  expect(deletes).toBe(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("products with stock explain why deletion is blocked", async ({ page }) => {
  await page.route("**/api/workspace", (route) => route.fulfill({ json: { setup: true } }));
  await productsPage(page);
  await page.getByRole("button", { name: "Hapus Tumbler Stainless", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Hapus produk", exact: true });
  await expect(dialog.getByRole("alert")).toContainText("Stok harus 0");
  await expect(dialog.getByRole("button", { name: "Hapus produk", exact: true })).toBeDisabled();
});

test("archived products also have a delete action", async ({ page }) => {
  const snapshot = { ...demoSnapshot(), demo: false };
  const empty = snapshot.products.find((p) => p.stock === 0)!;
  empty.active = false;
  await page.route("**/api/workspace", (route) => route.fulfill({ json: snapshot }));
  await productsPage(page);
  await page.getByRole("button", { name: /^Diarsipkan/ }).click();
  await page.getByRole("button", { name: `Hapus ${empty.name}`, exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Hapus produk", exact: true })).toBeEnabled();
});

test("members cannot see product deletion actions", async ({ page }) => {
  const snapshot = { ...demoSnapshot(), demo: false };
  snapshot.user = snapshot.members.find((m) => m.role === "member")!;
  await page.route("**/api/workspace", (route) => route.fulfill({ json: snapshot }));
  await productsPage(page);
  await expect(page.getByRole("button", { name: /^Hapus / })).toHaveCount(0);
});
