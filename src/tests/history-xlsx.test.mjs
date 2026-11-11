import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { excelDateWIB, historyHeaders, historyXlsx } from "../lib/history-xlsx.mjs";

const movement = {
  created_at: "2026-10-28T18:04:05Z", kind: "out", product_sku: "00123",
  product_name: "Mug & café <biru>", quantity: -12, actor_name: "Petugas",
  recipient: "+628123", note: '=HYPERLINK("x")\nBaris kedua', reversal_of: null,
};
test("XLSX contains a native filterable table, frozen header and typed data", async () => {
  const bytes = await historyXlsx([movement]);
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  const sheet = await zip.file("xl/worksheets/sheet1.xml").async("string");
  const table = await zip.file("xl/tables/table1.xml").async("string");
  const styles = await zip.file("xl/styles.xml").async("string");
  assert.match(table, /ref="A1:I2"/);
  assert.match(table, /<autoFilter ref="A1:I2"\/>/);
  assert.equal((table.match(/<tableColumn /g) || []).length, 9);
  assert.match(table, /showRowStripes="1"/);
  assert.match(sheet, /state="frozen"/);
  assert.match(sheet, /<c r="E2" s="3"><v>-12<\/v><\/c>/);
  assert.match(sheet, /<c r="C2"[^>]*t="inlineStr".*?00123/);
  assert.match(sheet, /Mug &amp; café &lt;biru&gt;/);
  assert.match(sheet, /=HYPERLINK\(&quot;x&quot;\)/);
  assert.match(sheet, /\+628123/);
  assert.doesNotMatch(sheet, /<f[ >]/);
  assert.match(styles, /formatCode="yyyy-mm-dd hh:mm:ss"/);
  assert.equal(historyHeaders.length, 9);
});
test("Excel date serial represents WIB wall time across midnight", () => {
  const serial = excelDateWIB(movement.created_at);
  assert.equal(new Date(Math.round((serial - 25569) * 86400000)).toISOString(), "2026-10-29T01:04:05.000Z");
  assert.equal(excelDateWIB("2026-10-29T01:04:05+07:00"), serial);
  assert.throws(() => excelDateWIB("bad"));
});
test("XLSX rejects empty exports and invalid numeric values", async () => {
  await assert.rejects(historyXlsx([]), /Tidak ada riwayat/);
  await assert.rejects(historyXlsx([{ ...movement, quantity: NaN }]), /Jumlah/);
});
