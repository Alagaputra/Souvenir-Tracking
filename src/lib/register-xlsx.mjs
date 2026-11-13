import JSZip from "jszip";
import { excelDateWIB } from "./history-xlsx.mjs";

const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const xml = (body) => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + body;
const escape = (value) => String(value ?? "")
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&apos;");
const text = (ref, value, style = 0) => `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escape(value)}</t></is></c>`;
const number = (ref, value, style = 3) => `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
const formula = (ref, expression, value, style = 3) => `<c r="${ref}" s="${style}"><f>${escape(expression)}</f><v>${value}</v></c>`;
const row = (r, cells, height = 23) => `<row r="${r}" ht="${height}" customHeight="1">${cells.join("")}</row>`;
const sheetRef = (name) => `'${name.replaceAll("'", "''")}'`;
const relationships = (items) => xml(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items.map(([id, type, target]) => `<Relationship Id="${id}" Type="${rel}/${type}" Target="${target}"/>`).join("")}</Relationships>`);
const short = (value, length) => value.slice(0, length).replace(/[\uD800-\uDBFF]$/, "");
const lines = (value,width) => String(value || "").split("\n").reduce((sum,line)=>sum+Math.max(1,Math.ceil(line.length/width)),0);

export function registerSheetNames(products) {
  // Nama sheet Excel maksimal 31 karakter; bersihkan karakter terlarang dan duplikasi.
  const used = new Set(["rekap"]);
  return products.map((p) => {
    const base = String(p.name || p.sku || "Barang").replace(/[\\/\[\]:*?\u0000-\u001F]/g, " ").trim().replace(/^'+|'+$/g, "") || "Barang";
    let name = short(base, 31), i = 2;
    while (used.has(name.toLowerCase())) {
      const suffix = ` (${i++})`;
      name = short(base, 31 - suffix.length) + suffix;
    }
    used.add(name.toLowerCase());
    return name;
  });
}

/** Susun buku stok kronologis; transaksi asal dan pembatalannya tetap ditampilkan. */
export function registerData(products, movements) {
  if (!products.length) throw new Error("Tidak ada barang untuk diekspor.");
  const ids = new Set();
  const grouped = new Map();
  for (const p of products) {
    if (!p.id || ids.has(p.id) || !Number.isSafeInteger(p.stock) || p.stock < 0)
      throw new Error("Data barang tidak valid.");
    ids.add(p.id);
    grouped.set(p.id, []);
  }
  const movementIds = new Set();
  for (const m of movements) {
    if (!grouped.has(m.product_id) || !m.id || movementIds.has(m.id)
      || !["in", "out", "adjust", "reversal"].includes(m.kind)
      || !Number.isSafeInteger(m.quantity)
      || (m.kind === "in" && m.quantity <= 0) || (m.kind === "out" && m.quantity >= 0))
      throw new Error("Data transaksi tidak valid atau tidak lengkap.");
    excelDateWIB(m.created_at);
    movementIds.add(m.id);
    grouped.get(m.product_id).push(m);
  }
  const ordered = [...products].sort((a,b) => a.name.localeCompare(b.name,"id") || a.id.localeCompare(b.id));
  const names = registerSheetNames(ordered);
  return ordered.map((p, index) => {
    const entries = grouped.get(p.id).sort((a,b) => new Date(a.created_at) - new Date(b.created_at)
      || (a.kind === b.kind ? 0 : a.kind === "in" ? -1 : b.kind === "in" ? 1 : 0)
      || a.id.localeCompare(b.id));
    const incoming = entries.filter(m => m.kind === "in");
    // Stok awal berasal dari seluruh barang masuk pada hari penerimaan pertama (WIB).
    // Penerimaan pada hari berikutnya masuk sebagai tambahan stok.
    const firstDay = incoming.length ? Math.floor(excelDateWIB(incoming[0].created_at)) : null;
    const initial = incoming.filter(m => Math.floor(excelDateWIB(m.created_at)) === firstDay).reduce((n,m)=>n+m.quantity,0);
    const totalIn = incoming.reduce((n,m)=>n+m.quantity,0);
    const outgoing = entries.filter(m => m.kind === "out").reduce((n,m)=>n-m.quantity,0);
    const corrections = entries.filter(m => ["adjust","reversal"].includes(m.kind)).reduce((n,m)=>n+m.quantity,0);
    const closing = totalIn - outgoing + corrections;
    // Cocokkan saldo hasil seluruh riwayat dengan stok produk. Riwayat terpotong
    // harus ditolak agar ekspor tidak menghasilkan saldo yang menyesatkan.
    if (![initial,totalIn,outgoing,corrections,closing].every(Number.isSafeInteger)) throw new Error("Jumlah stok tidak valid.");
    if (closing !== p.stock) throw new Error(`Riwayat ${p.name} tidak lengkap atau stok belum sesuai. Muat ulang lalu coba lagi.`);
    let balance = 0;
    const balances = entries.map(m => (balance += m.quantity));
    return { product:p, sheetName:names[index], entries, balances, firstDay, initial, additional:totalIn-initial, outgoing, corrections, closing };
  });
}

const ledgerHeaders = ["No.", "Tanggal (WIB)", "Jenis pencatatan", "Masuk", "Keluar", "Koreksi (+/-)", "Saldo", "Penerima / keterangan", "Petugas", "Catatan / referensi"];
const recapHeaders = ["Kode barang", "Nama barang", "Stok awal", "Masuk tambahan", "Keluar", "Koreksi (+/-)", "Stok akhir", "Satuan", "Status"];
const kinds = { in:"Barang masuk", out:"Pemberian", adjust:"Penyesuaian", reversal:"Pembatalan" };

function ledgerSheet(data) {
  // Tetapkan style eksplisit karena sebagian penampil Excel mengabaikan style 0.
  const ledgerText = (ref,value,style=9) => text(ref,value,style);
  const { entries, balances, firstDay, initial, additional, outgoing, corrections, closing } = data;
  const end = 1 + Math.max(1, entries.length), total = end + 1;
  const rows = [row(1,ledgerHeaders.map((h,i)=>ledgerText(`${String.fromCharCode(65+i)}1`,h,1)),28)];
  entries.forEach((m,i) => {
    const r=i+2;
    const opening = m.kind === "in" && Math.floor(excelDateWIB(m.created_at)) === firstDay;
    const label = (opening ? "Stok awal" : kinds[m.kind]) + (m.cancelled ? " (dibatalkan)" : "");
    const note = [m.note,m.reversal_of ? `Membalik transaksi ${m.reversal_of}` : ""].filter(Boolean).join(" | ");
    const quantity = { in:m.kind==="in"?m.quantity:0, out:m.kind==="out"?-m.quantity:0, correction:["adjust","reversal"].includes(m.kind)?m.quantity:0 };
    // Catatan panjang tetap utuh dan bisa dibaca pada formula bar;
    // tinggi baris dibatasi agar buku stok tetap ringkas.
    const height=Math.min(240,Math.max(20,Math.max(lines(m.recipient,15),lines(m.actor_name,9),lines(label,12))*13+4));
    rows.push(row(r,[number(`A${r}`,i+1),number(`B${r}`,excelDateWIB(m.created_at),2),ledgerText(`C${r}`,label),number(`D${r}`,quantity.in),number(`E${r}`,quantity.out),number(`F${r}`,quantity.correction),formula(`G${r}`,`SUM($D$2:D${r})-SUM($E$2:E${r})+SUM($F$2:F${r})`,balances[i]),ledgerText(`H${r}`,m.recipient),ledgerText(`I${r}`,m.actor_name),ledgerText(`J${r}`,note)],height));
  });
  if (!entries.length) rows.push(row(2,[ledgerText("A2",""),ledgerText("B2",""),ledgerText("C2","Belum ada transaksi"),number("D2",0),number("E2",0),number("F2",0),formula("G2","D2-E2+F2",0),ledgerText("H2",""),ledgerText("I2",""),ledgerText("J2","")],20));
  rows.push(row(total,[ledgerText(`A${total}`,""),ledgerText(`B${total}`,""),ledgerText(`C${total}`,"TOTAL",1),formula(`D${total}`,`SUM(D2:D${end})`,initial+additional,5),formula(`E${total}`,`SUM(E2:E${end})`,outgoing,5),formula(`F${total}`,`SUM(F2:F${end})`,corrections,5),formula(`G${total}`,`D${total}-E${total}+F${total}`,closing,6),ledgerText(`H${total}`,""),ledgerText(`I${total}`,""),ledgerText(`J${total}`,"")],23));
  // Format rentang secara langsung agar tema tabel tidak mengubah garis pembatas.
  const ledgerStyles = { 0:9, 1:12, 2:11, 3:10, 5:13, 6:14, 9:9 };
  const borderedRows = rows.map(value => value.replace(/ s="(\d+)"/g, (match,index) => ` s="${ledgerStyles[index] ?? index}"`));
  return { rows:borderedRows, plain:true, range:`A1:J${end}`, bottom:total, freeze:1, widths:[4,18,14,8,8,9,8,17,11,14], merges:[], headers:ledgerHeaders, conditional:`<conditionalFormatting sqref="G2:G${end}"><cfRule type="cellIs" dxfId="0" priority="1" operator="lessThan"><formula>0</formula></cfRule></conditionalFormatting>`, printTitle:"$1:$1" };
}

function recapSheet(data) {
  // Rekap memakai rumus yang menunjuk sheet barang; nama barang menjadi tautan detail.
  const end=1+data.length,total=end+1;
  const rows=[row(1,recapHeaders.map((h,i)=>text(`${String.fromCharCode(65+i)}1`,h,1)),28)];
  const links=[];
  data.forEach((d,i)=>{
    const r=i+2,ref=sheetRef(d.sheetName),last=1+Math.max(1,d.entries.length);
    const height=Math.min(110,Math.max(20,Math.max(lines(d.product.name,24),lines(d.product.sku,10),lines(d.product.unit,6))*13+4));
    rows.push(row(r,[text(`A${r}`,d.product.sku),text(`B${r}`,d.product.name,8),formula(`C${r}`,`SUMIF(${ref}!C2:C${last},"Stok awal*",${ref}!D2:D${last})`,d.initial),formula(`D${r}`,`SUM(${ref}!D2:D${last})-C${r}`,d.additional),formula(`E${r}`,`SUM(${ref}!E2:E${last})`,d.outgoing),formula(`F${r}`,`SUM(${ref}!F2:F${last})`,d.corrections),formula(`G${r}`,`C${r}+D${r}-E${r}+F${r}`,d.closing),text(`H${r}`,d.product.unit),text(`I${r}`,d.product.active?"Aktif":"Diarsipkan")],height));
    links.push(`<hyperlink ref="B${r}" location="${escape(ref+"!A1")}" display="${escape(d.product.name)}"/>`);
  });
  const totals=["initial","additional","outgoing","corrections","closing"];
  rows.push(row(total,[text(`A${total}`,""),text(`B${total}`,"TOTAL",1),...totals.map((key,i)=>formula(`${String.fromCharCode(67+i)}${total}`,`SUM(${String.fromCharCode(67+i)}2:${String.fromCharCode(67+i)}${end})`,data.reduce((n,d)=>n+d[key],0),i===4?6:5)),text(`H${total}`,""),text(`I${total}`,"")],23));
  return {rows,range:`A1:I${end}`,bottom:total,freeze:1,widths:[12,26,10,12,9,12,10,8,12],merges:[],headers:recapHeaders,hyperlinks:`<hyperlinks>${links.join("")}</hyperlinks>`,printTitle:"$1:$1"};
}

function worksheet(sheet) {
  const last=String.fromCharCode(64+sheet.widths.length);
  return xml(`<worksheet xmlns="${ns}" xmlns:r="${rel}"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${last}${sheet.bottom}"/><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="${sheet.freeze}" topLeftCell="A${sheet.freeze+1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${sheet.freeze+1}" sqref="A${sheet.freeze+1}"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="20"/><cols>${sheet.widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join("")}</cols><sheetData>${sheet.rows.join("")}</sheetData>${sheet.plain ? `<autoFilter ref="${sheet.range}"/>` : ""}${sheet.conditional||""}${sheet.hyperlinks||""}<printOptions horizontalCentered="1"/><pageMargins left="0.25" right="0.25" top="0.4" bottom="0.4" header="0.15" footer="0.15"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/><headerFooter><oddFooter>&amp;CPage &amp;P / &amp;N</oddFooter></headerFooter>${sheet.plain ? "" : '<tableParts count="1"><tablePart r:id="rId1"/></tableParts>'}</worksheet>`);
}

const styles = () => xml(`<styleSheet xmlns="${ns}"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd mmm yyyy hh:mm"/></numFmts><fonts count="5"><font><sz val="11"/><name val="Calibri"/><color rgb="FF24364B"/></font><font><b/><sz val="11"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font><font><b/><sz val="11"/><name val="Calibri"/><color rgb="FF203B57"/></font><font><sz val="10"/><name val="Calibri"/><color rgb="FF5F7080"/></font><font><u/><sz val="11"/><name val="Calibri"/><color rgb="FF245FC1"/></font></fonts><fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF234E70"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEDF3F8"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE9F4ED"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="3"><border/><border><left style="thin"><color rgb="FF808080"/></left><right style="thin"><color rgb="FF808080"/></right><top style="thin"><color rgb="FF808080"/></top><bottom style="thin"><color rgb="FF808080"/></bottom><diagonal/></border><border><left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right><top style="thin"><color rgb="FF000000"/></top><bottom style="thin"><color rgb="FF000000"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="15"><xf numFmtId="0" fontId="0" fillId="0" borderId="1" applyBorder="1" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="1" applyBorder="1" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" applyBorder="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="1" fontId="0" fillId="0" borderId="1" applyBorder="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="1" applyBorder="1" xfId="0" applyFont="1"/><xf numFmtId="1" fontId="2" fillId="3" borderId="1" applyBorder="1" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="1" fontId="2" fillId="4" borderId="1" applyBorder="1" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="3" fillId="0" borderId="1" applyBorder="1" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="4" fillId="0" borderId="1" applyBorder="1" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="49" fontId="0" fillId="0" borderId="2" applyBorder="1" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="1" fontId="0" fillId="0" borderId="2" applyBorder="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="2" applyBorder="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="2" applyBorder="1" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="1" fontId="2" fillId="3" borderId="2" applyBorder="1" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="1" fontId="2" fillId="4" borderId="2" applyBorder="1" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="1"><dxf><font><color rgb="FF9C0006"/></font><fill><patternFill patternType="solid"><fgColor rgb="FFFFC7CE"/></patternFill></fill></dxf></dxfs><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/></styleSheet>`);

export async function registerXlsx({products,movements,exported_at=new Date().toISOString()}) {
  // Validasi saldo -> buat Rekap dan satu sheet per barang -> kemas OOXML menjadi XLSX.
  const data=registerData(products,movements);
  excelDateWIB(exported_at);
  const sheets=[{name:"Rekap",...recapSheet(data)},...data.map(d=>({name:d.sheetName,...ledgerSheet(d)}))];
  const zip=new JSZip();
  const contentTypes=[["/xl/workbook.xml","sheet.main"],["/xl/styles.xml","styles"],...sheets.flatMap((s,i)=>[[`/xl/worksheets/sheet${i+1}.xml`,"worksheet"],...s.plain?[]:[[`/xl/tables/table${i+1}.xml`,"table"]]])];
  zip.file("[Content_Types].xml",xml(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${contentTypes.map(([part,type])=>`<Override PartName="${part}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.${type}+xml"/>`).join("")}</Types>`));
  zip.file("_rels/.rels",relationships([["rId1","officeDocument","xl/workbook.xml"]]));
  zip.file("xl/workbook.xml",xml(`<workbook xmlns="${ns}" xmlns:r="${rel}"><bookViews><workbookView/></bookViews><sheets>${sheets.map((s,i)=>`<sheet name="${escape(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join("")}</sheets><definedNames>${sheets.map((s,i)=>`<definedName name="_xlnm.Print_Titles" localSheetId="${i}">${escape(sheetRef(s.name)+"!"+s.printTitle)}</definedName>`).join("")}</definedNames><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`));
  zip.file("xl/_rels/workbook.xml.rels",relationships([...sheets.map((s,i)=>[`rId${i+1}`,"worksheet",`worksheets/sheet${i+1}.xml`]),[`rId${sheets.length+1}`,"styles","styles.xml"]]));
  sheets.forEach((s,i)=>{
    zip.file(`xl/worksheets/sheet${i+1}.xml`,worksheet(s));
    if (s.plain) return;
    zip.file(`xl/worksheets/_rels/sheet${i+1}.xml.rels`,relationships([["rId1","table",`../tables/table${i+1}.xml`]]));
    zip.file(`xl/tables/table${i+1}.xml`,xml(`<table xmlns="${ns}" id="${i+1}" name="Register${i+1}" displayName="Register${i+1}" ref="${s.range}" totalsRowShown="0"><autoFilter ref="${s.range}"/><tableColumns count="${s.headers.length}">${s.headers.map((h,c)=>`<tableColumn id="${c+1}" name="${escape(h)}"/>`).join("")}</tableColumns><tableStyleInfo name="TableStyleMedium2" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/></table>`));
  });
  zip.file("xl/styles.xml",styles());
  return zip.generateAsync({type:"uint8array",compression:"DEFLATE"});
}
