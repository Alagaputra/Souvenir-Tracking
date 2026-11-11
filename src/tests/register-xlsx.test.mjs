import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { registerData, registerSheetNames, registerXlsx } from "../lib/register-xlsx.mjs";

const product = {id:"p1",sku:"00123",name:"Mug & café <biru>",unit:"pcs",stock:14,active:true};
const entry = (id,kind,quantity,created_at,extra={}) => ({id,product_id:"p1",product_name:product.name,product_sku:product.sku,kind,quantity,created_at,actor_name:"Admin",recipient:kind==="out"?"Nasabah":"",note:"",reversal_of:null,...extra});
const movements = [
  entry("one","in",10,"2026-10-01T02:00:00Z"),
  entry("two","in",5,"2026-10-01T04:00:00Z"),
  entry("three","in",3,"2026-10-02T02:00:00Z"),
  entry("four","out",-4,"2026-10-03T02:00:00Z",{cancelled:true}),
  entry("five","reversal",4,"2026-10-04T02:00:00Z",{reversal_of:"four"}),
  entry("six","adjust",-4,"2026-10-05T02:00:00Z",{note:'=HYPERLINK("x")\nKoreksi <stok>'}),
];
const snapshot = {products:[product],movements,exported_at:"2026-11-06T02:00:00Z"};

test("register groups all movements by product and reconciles initial, additional and reversed stock", () => {
  const [ledger] = registerData([product],[...movements].reverse());
  assert.equal(ledger.initial,15);
  assert.equal(ledger.additional,3);
  assert.equal(ledger.outgoing,4);
  assert.equal(ledger.corrections,0);
  assert.equal(ledger.closing,14);
  assert.deepEqual(ledger.balances,[10,15,18,14,18,14]);
  assert.equal(ledger.entries[0].id,"one");
});

test("register XLSX has linked recap, plain product ranges, formulas, filters and frozen headings", async () => {
  const zip=await JSZip.loadAsync(await registerXlsx({...snapshot,products:[product,{...product,id:"empty",name:"Kosong",sku:"ZERO",stock:0,active:false}]}),{checkCRC32:true});
  const workbook=await zip.file("xl/workbook.xml").async("string");
  const recap=await zip.file("xl/worksheets/sheet1.xml").async("string");
  assert.equal((workbook.match(/<sheet /g)||[]).length,3);
  assert.match(workbook,/name="Rekap"/);
  assert.match(workbook,/fullCalcOnLoad="1"/);
  assert.match(recap,/<hyperlink ref="B[23]"/);
  assert.match(recap,/Mug &amp; café &lt;biru&gt;/);
  assert.match(recap,/>00123<\/t>/);
  const sheet=await zip.file("xl/worksheets/sheet3.xml").async("string");
  assert.equal(zip.file("xl/tables/table3.xml"),null);
  assert.doesNotMatch(sheet,/<tableParts/);
  assert.match(sheet,/<autoFilter ref="A1:J7"/);
  assert.match(sheet,/ySplit="1"/);
  assert.match(recap,/<c r="C3"[^>]*><f>SUMIF\(/);
  assert.match(recap,/<c r="G3"[^>]*><f>C3\+D3-E3\+F3<\/f><v>14<\/v>/);
  assert.match(sheet,/Pemberian \(dibatalkan\)/);
  assert.match(sheet,/Membalik transaksi four/);
  assert.match(sheet,/t="inlineStr".*?=HYPERLINK\(&quot;x&quot;\)/s);
  assert.doesNotMatch(sheet,/<f>HYPERLINK/);
  const empty=await zip.file("xl/worksheets/sheet2.xml").async("string");
  assert.match(empty,/Belum ada transaksi/);
  assert.match(recap,/Diarsipkan/);
  assert.match(empty,/<c r="G2"[^>]*><f>[^<]+<\/f><v>0<\/v>/);
});

test("sheet names obey Excel limits and stay unique after sanitizing and truncating", () => {
  const names=registerSheetNames([
    {name:"Rekap"},{name:"rekap"},{name:"x[]:*?/\\y"},
    {name:"A".repeat(60)},{name:"A".repeat(59)+"B"},{name:"''"},
  ]);
  assert.equal(new Set(names.map(n=>n.toLowerCase())).size,6);
  assert.ok(names.every(n=>n.length<=31&&!/[\[\]:*?/\\]/.test(n)&&!n.startsWith("'")&&!n.endsWith("'")));
  assert.equal(names[0],"Rekap (2)");
  assert.equal(names[1],"rekap (3)");
});

test("register includes over 5000 entries and preserves backdated negative balances for review", async () => {
  const many=Array.from({length:5001},(_,i)=>entry(`in-${i}`,"in",1,"2026-10-01T00:00:00Z"));
  const [ledger]=registerData([{...product,stock:5001}],many);
  assert.equal(ledger.entries.length,5001);
  assert.equal(ledger.initial,5001);
  const backdated=[entry("out","out",-1,"2026-10-01"),entry("in","in",10,"2026-10-02")];
  const bytes=await registerXlsx({...snapshot,products:[{...product,stock:9}],movements:backdated});
  const zip=await JSZip.loadAsync(bytes);
  const sheet=await zip.file("xl/worksheets/sheet2.xml").async("string");
  assert.match(sheet,/<c r="G2"[^>]*><f>[^<]+<\/f><v>-1<\/v>/);
  assert.match(sheet,/operator="lessThan"/);
});

test("register refuses incomplete, inconsistent and duplicate data", async () => {
  await assert.rejects(registerXlsx({...snapshot,products:[]}),/Tidak ada barang/);
  await assert.rejects(registerXlsx({...snapshot,movements:[]}),/tidak lengkap/);
  assert.throws(()=>registerData([product],[...movements,movements[0]]),/tidak valid/);
  assert.throws(()=>registerData([product],[{...movements[0],quantity:Infinity}]),/tidak valid/);
  assert.throws(()=>registerData([product],[{...movements[0],created_at:"bad"}]),/Tanggal/);
  assert.throws(()=>registerData([product],[{...movements[0],product_id:"missing"}]),/tidak valid/);
});
