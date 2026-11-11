import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import JSZip from "jszip";
test.beforeEach(async ({ page }) => {
  await page.route("**/api/workspace", (route) =>
    route.fulfill({ json: { setup: true } }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name:
        (page.viewportSize()?.width || 1440) <= 720
          ? "Souvenir tim kamu"
          : "Ringkasan",
      exact: true,
    }),
  ).toBeVisible();
});
test("responsive stock search and real QR generation", async ({ page }) => {
  await page
    .getByRole("textbox", { name: "Cari souvenir", exact: true })
    .fill("Tumbler");
  await expect(page.locator(".product-table tbody tr")).toHaveCount(1);
  await page
    .getByRole("button", { name: "QR Tumbler Stainless", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("img", { name: "QR Tumbler Stainless", exact: true }),
  ).toHaveAttribute("src", /^data:image\/png/);
  await expect(page.getByLabel("Tautan produk", { exact: true })).toHaveValue(
    /\?product=10000000-0000-4000-8000-000000000001&mode=out$/,
  );
  await page.getByRole("button", { name: "Tutup", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("history uses mobile activity rows and keeps filters and export consistent", async ({
  page,
}) => {
  const mobile = (page.viewportSize()?.width || 1440) <= 720;
  if (mobile)
    await page.getByRole("button", { name: "Riwayat", exact: true }).click();
  else
    await page
      .locator(".sidebar")
      .getByRole("button", { name: "Riwayat aktivitas", exact: true })
      .click();
  const list = page.getByRole("list", { name: "Daftar riwayat", exact: true });
  if (mobile) {
    await expect(list).toBeVisible();
    await expect(page.getByLabel("Dari tanggal")).not.toBeVisible();
    await page.getByRole("button", { name: "Filter", exact: true }).click();
  } else await expect(page.locator(".desktop-history")).toBeVisible();
  await page.getByLabel("Jenis aktivitas", { exact: true }).selectOption("in");
  await expect(
    mobile ? list.locator("li") : page.locator(".desktop-history tbody tr"),
  ).toHaveCount(2);
  if (mobile) {
    await page.getByRole("button", { name: "Filter", exact: true }).click();
    await expect(
      page.getByLabel("Jenis aktivitas", { exact: true }),
    ).not.toBeVisible();
    await page.getByRole("button", { name: "Filter", exact: true }).click();
    await expect(
      page.getByLabel("Jenis aktivitas", { exact: true }),
    ).toHaveValue("in");
  }
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Ekspor riwayat", exact: true }).click();
  const exported = await download;
  expect(exported.suggestedFilename()).toBe("riwayat-souvenir.xlsx");
  const zip = await JSZip.loadAsync(await readFile((await exported.path())!));
  const sheet = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
  const table = await zip.file("xl/tables/table1.xml")!.async("string");
  expect(table).toContain('<autoFilter ref="A1:I3"/>');
  expect(sheet.match(/<row /g)).toHaveLength(3);
  expect(sheet).toContain("Barang masuk");
  expect(sheet).not.toContain(">Pemberian<");
  await page.getByRole("button", { name: "Reset filter", exact: true }).click();
  await expect(
    mobile ? list.locator("li") : page.locator(".desktop-history tbody tr"),
  ).toHaveCount(12);
  await page.getByLabel("Cari riwayat").fill("tidak-ada-hasil");
  await expect(page.getByRole("button", { name: "Ekspor riwayat", exact: true })).toBeDisabled();
  await expect(
    page.getByRole("heading", { name: "Belum ada aktivitas", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("Excel export reports failures and allows retry", async ({ page }) => {
  const mobile = (page.viewportSize()?.width || 1440) <= 720;
  if (mobile) await page.getByRole("button", { name: "Riwayat", exact: true }).click();
  else await page.locator(".sidebar").getByRole("button", { name: "Riwayat aktivitas", exact: true }).click();
  await page.evaluate(() => {
    const original = URL.createObjectURL;
    URL.createObjectURL = () => {
      URL.createObjectURL = original;
      throw new Error("Simulated download failure");
    };
  });
  const button = page.getByRole("button", { name: "Ekspor riwayat", exact: true });
  await button.click();
  await expect(page.getByText("Ekspor Excel gagal. Silakan coba lagi.", { exact: true })).toBeVisible();
  await expect(button).toBeEnabled();
  const downloaded = page.waitForEvent("download");
  await button.click();
  expect((await downloaded).suggestedFilename()).toBe("riwayat-souvenir.xlsx");
  await expect(page.getByText("Ekspor Excel gagal. Silakan coba lagi.", { exact: true })).not.toBeVisible();
});

test("QR link opens the selected product and supports both stock actions", async ({
  page,
}) => {
  await page.goto("/?product=10000000-0000-4000-8000-000000000001&mode=out");
  await expect(
    page.getByRole("heading", { name: "Detail pemberian", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".chosen-product")).toContainText(
    "Tumbler Stainless",
  );
  await expect(
    page.getByLabel("Atau pilih barang secara manual"),
  ).not.toBeVisible();
  await page
    .getByRole("group", { name: "Pilih tindakan stok", exact: true })
    .getByRole("button", { name: "Tambah stok", exact: true })
    .click();
  await expect(page.getByLabel("Jumlah masuk", { exact: true })).toHaveValue(
    "1",
  );
  await page.reload();
  await expect(page.getByLabel("Jumlah masuk", { exact: true })).toBeVisible();
  await expect(
    page.getByLabel("Nama barang", { exact: true }),
  ).not.toBeVisible();
});
test("camera is mobile only and desktop opens the product form", async ({
  page,
}) => {
  await page.evaluate(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: async () => {
        document.documentElement.dataset.cameraRequests = String(
          Number(document.documentElement.dataset.cameraRequests || "0") + 1,
        );
        throw new DOMException("Test denied", "NotAllowedError");
      },
    });
  });
  if ((page.viewportSize()?.width || 1440) > 720) {
    await expect(page.getByRole("button", { name: /scan/i })).not.toBeVisible();
    await page.getByRole("button", { name: "Beri souvenir", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Detail pemberian", exact: true })).toBeVisible();
    await expect(page.locator(".scanner")).toHaveCount(0);
    await page.getByLabel("Nama barang", { exact: true }).selectOption("10000000-0000-4000-8000-000000000001");
    await expect(page.getByLabel("Nama nasabah", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Jumlah diberikan", { exact: true })).toHaveValue("1");
    await page.getByRole("button", { name: "Pilih barang lain", exact: true }).click();
    await expect(page.getByLabel("Nama barang", { exact: true })).toBeVisible();
    await expect(page.locator("html")).not.toHaveAttribute("data-camera-requests");
    await expect(page.locator(".scanner")).toHaveCount(0);
    return;
  }
  await page.getByRole("button", { name: "Scan QR", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Scan QR", exact: true }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute(
    "data-camera-requests",
    "1",
  );
  await expect(page.locator(".main-shell")).toHaveClass(
    "main-shell page-dashboard",
  );
  await expect(page.getByRole("alert")).toContainText("izin ditolak");
  await page.getByRole("button", { name: "Tutup", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
});
test("switching to desktop closes the scanner and uses the form at 721px", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 900 });
  await page.getByRole("button", { name: "Scan QR", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Scan QR", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 721, height: 900 });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".scanner")).toHaveCount(0);
  await page.getByRole("button", { name: "Beri souvenir", exact: true }).click();
  await expect(page.getByLabel("Nama barang", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 720, height: 900 });
  await expect(page.getByRole("button", { name: "Aktifkan kamera", exact: true })).toBeVisible();
  await expect(page.getByLabel("Atau pilih barang secara manual", { exact: true })).not.toBeVisible();
});

test("demo never pretends to save a stock withdrawal", async ({ page }) => {
  const mobile =
    await page
      .getByRole("navigation", { name: "Navigasi utama mobile" })
      .isVisible();
  if (mobile) {
    await page.getByRole("button", { name: "Scan QR", exact: true }).click();
  } else
    await page
      .getByRole("button", { name: "Beri souvenir", exact: true })
      .click();
  await expect(
    page.getByLabel("Nama nasabah", { exact: true }),
  ).not.toBeVisible();
  await expect(
    page.getByLabel("Atau pilih barang secara manual"),
  ).not.toBeVisible();
  if (mobile) await page
    .getByText("QR tidak bisa dipindai? Pilih barang manual", { exact: true })
    .click();
  await page
    .getByLabel(mobile ? "Atau pilih barang secara manual" : "Nama barang")
    .selectOption("10000000-0000-4000-8000-000000000001");
  await expect(
    page.getByLabel("Atau pilih barang secara manual"),
  ).not.toBeVisible();
  await expect(
    page.getByLabel("Jumlah diberikan", { exact: true }),
  ).toHaveValue("1");
  await expect(page.locator(".automatic-giver")).toContainText("Admin Funding");
  await page
    .getByLabel("Nama nasabah", { exact: true })
    .fill("Nasabah pengujian");
  await expect(
    page.getByRole("button", { name: "Kurangi jumlah", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Tambah jumlah", exact: true })
    .click();
  await expect(
    page.getByLabel("Jumlah diberikan", { exact: true }),
  ).toHaveValue("2");
  await page
    .getByRole("button", { name: "Konfirmasi pemberian", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("pratinjau data contoh");
});
