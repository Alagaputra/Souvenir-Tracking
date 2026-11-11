import JSZip from "jszip";

export const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const historyHeaders = [
  "Tanggal (WIB)", "Jenis", "Kode barang", "Nama barang", "Jumlah (+/-)",
  "Pemberi / petugas", "Nasabah", "Catatan", "Referensi pembatalan",
];
const kinds = { in: "Barang masuk", out: "Pemberian", adjust: "Penyesuaian", reversal: "Pembatalan" };
const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const xml = (body) => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + body;
const escape = (value) => String(value ?? "")
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&apos;");
const textCell = (ref, value, style = 0) =>
  `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escape(value)}</t></is></c>`;

// Excel dates have no timezone. Store Jakarta wall time as a serial date,
// independent of the timezone on the computer generating or opening the file.
export function excelDateWIB(timestamp) {
  const ms = new Date(timestamp).getTime();
  if (!Number.isFinite(ms)) throw new Error("Tanggal riwayat tidak valid.");
  return (ms + 7 * 60 * 60 * 1000) / 86400000 + 25569;
}

/** Build a single-sheet OOXML workbook with a native Excel table. */
export async function historyXlsx(movements) {
  if (!movements.length) throw new Error("Tidak ada riwayat untuk diekspor.");
  const zip = new JSZip();
  const end = movements.length + 1;
  const range = `A1:I${end}`;
  const rows = [`<row r="1" ht="28" customHeight="1">${historyHeaders.map((h, i) => textCell(`${String.fromCharCode(65 + i)}1`, h, 1)).join("")}</row>`];
  movements.forEach((m, i) => {
    const r = i + 2;
    if (!Number.isFinite(m.quantity)) throw new Error("Jumlah riwayat tidak valid.");
    const values = [kinds[m.kind], m.product_sku, m.product_name, m.quantity,
      m.actor_name, m.recipient, m.note, m.reversal_of];
    rows.push(`<row r="${r}"><c r="A${r}" s="2"><v>${excelDateWIB(m.created_at)}</v></c>${values.map((v, c) => c === 3
      ? `<c r="E${r}" s="3"><v>${v}</v></c>`
      : textCell(`${String.fromCharCode(66 + c)}${r}`, v)).join("")}</row>`);
  });
  zip.file("[Content_Types].xml", xml(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/tables/table1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/></Types>`));
  const relationships = (items) => xml(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items.map(([id, type, target]) => `<Relationship Id="${id}" Type="${rel}/${type}" Target="${target}"/>`).join("")}</Relationships>`);
  zip.file("_rels/.rels", relationships([["rId1", "officeDocument", "xl/workbook.xml"]]));
  zip.file("xl/workbook.xml", xml(`<workbook xmlns="${ns}" xmlns:r="${rel}"><bookViews><workbookView/></bookViews><sheets><sheet name="Riwayat" sheetId="1" r:id="rId1"/></sheets></workbook>`));
  zip.file("xl/_rels/workbook.xml.rels", relationships([["rId1", "worksheet", "worksheets/sheet1.xml"], ["rId2", "styles", "styles.xml"]]));
  zip.file("xl/worksheets/_rels/sheet1.xml.rels", relationships([["rId1", "table", "../tables/table1.xml"]]));
  const widths = [23, 19, 18, 30, 17, 26, 26, 45, 38];
  zip.file("xl/worksheets/sheet1.xml", xml(`<worksheet xmlns="${ns}" xmlns:r="${rel}"><dimension ref="${range}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="20"/><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols><sheetData>${rows.join("")}</sheetData><tableParts count="1"><tablePart r:id="rId1"/></tableParts></worksheet>`));
  zip.file("xl/tables/table1.xml", xml(`<table xmlns="${ns}" id="1" name="RiwayatSouvenir" displayName="RiwayatSouvenir" ref="${range}" totalsRowShown="0"><autoFilter ref="${range}"/><tableColumns count="9">${historyHeaders.map((h, i) => `<tableColumn id="${i + 1}" name="${escape(h)}"/>`).join("")}</tableColumns><tableStyleInfo name="TableStyleMedium2" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/></table>`));
  zip.file("xl/styles.xml", xml(`<styleSheet xmlns="${ns}"><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm:ss"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF234E70"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/></styleSheet>`));
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
