import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import { demoRegister, demoSnapshot } from "../../lib/demo";

async function navigate(page: Page, target: "products" | "history") {
  if ((page.viewportSize()?.width || 1440) <= 720) {
    await page.getByRole("button", { name: target === "products" ? "Stok" : "Riwayat", exact: true }).click();
  } else {
    await page.locator(".sidebar").getByRole("button", { name: target === "products" ? /^Daftar souvenir/ : "Riwayat aktivitas" }).click();
  }
}

test("register download includes recap and every product despite empty history filters", async ({ page }) => {
  const snapshot = { ...demoSnapshot(), demo: false };
  const full = demoRegister();
  let requests = 0;
  await page.route("**/api/workspace", route => route.fulfill({ json: snapshot }));
  await page.route("**/api/register", route => { requests++; return route.fulfill({ json: full }); });
  await page.goto("/");
  await navigate(page,"history");
  await page.getByLabel("Cari riwayat",{exact:true}).fill("tidak ada data cocok");
  await expect(page.getByRole("button",{name:"Ekspor riwayat",exact:true})).toBeDisabled();
  const button=page.getByRole("button",{name:"Ekspor register",exact:true});
  await expect(button).toBeEnabled();
  const download=page.waitForEvent("download");
  await button.click();
  const file=await download;
  expect(file.suggestedFilename()).toMatch(/^register-souvenir-\d{8}-\d{6}\.xlsx$/);
  const zip=await JSZip.loadAsync(await readFile((await file.path())!));
  const workbook=await zip.file("xl/workbook.xml")!.async("string");
  expect(workbook.match(/<sheet /g)).toHaveLength(full.products.length+1);
  expect(workbook).toContain('name="Rekap"');
  expect(workbook).toContain('name="Pouch Travel"');
  const recap=await zip.file("xl/worksheets/sheet1.xml")!.async("string");
  expect(recap).toContain("Stok awal");
  expect(recap).toContain("Masuk tambahan");
  expect(recap).toContain("Stok akhir");
  expect(recap).toContain("&apos;Tumbler Stainless&apos;!D2:D");
  expect(requests).toBe(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test("product register export prevents double requests and allows retry after a failed fetch", async ({ page }) => {
  await page.route("**/api/workspace",route=>route.fulfill({json:{...demoSnapshot(),demo:false}}));
  let calls=0;
  let release!: () => void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  await page.route("**/api/register",async route=>{
    calls++;
    if(calls===1){await gate;return route.fulfill({status:503,json:{error:"Database sedang tidak tersedia."}});}
    return route.fulfill({json:demoRegister()});
  });
  await page.goto("/");
  await navigate(page,"products");
  await page.evaluate(()=>{
    const button=document.querySelector<HTMLButtonElement>('button[title^="Seluruh barang"]')!;
    button.click();button.click();
  });
  await expect.poll(()=>calls).toBe(1);
  await expect(page.getByRole("button",{name:"Menyiapkan Excel…",exact:true})).toBeDisabled();
  release();
  await expect(page.getByRole("alert")).toContainText("Database sedang tidak tersedia");
  const button=page.getByRole("button",{name:"Ekspor register",exact:true});
  await expect(button).toBeEnabled();
  const download=page.waitForEvent("download");
  await button.click();
  expect((await download).suggestedFilename()).toMatch(/^register-souvenir-\d{8}-\d{6}\.xlsx$/);
  expect(calls).toBe(2);
});

test("demo exports a reconciled register and members keep only their history export", async ({ page }) => {
  await page.route("**/api/workspace",route=>route.fulfill({json:{setup:true}}));
  await page.goto("/");
  await navigate(page,"products");
  const download=page.waitForEvent("download");
  await page.getByRole("button",{name:"Ekspor register",exact:true}).click();
  expect((await download).suggestedFilename()).toMatch(/^register-souvenir-\d{8}-\d{6}\.xlsx$/);
  const snapshot={...demoSnapshot(),demo:false};
  snapshot.user=snapshot.members.find(m=>m.role==="member")!;
  await page.route("**/api/workspace",route=>route.fulfill({json:snapshot}));
  await page.reload();
  await navigate(page,"history");
  await expect(page.getByRole("button",{name:"Ekspor register",exact:true})).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Ekspor riwayat",exact:true})).toBeVisible();
});
