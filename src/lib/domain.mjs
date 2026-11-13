// Aturan murni yang dipakai UI dan backend: validasi jumlah/teks, QR, dan tanggal.
export function positiveInteger(value) {
  if (typeof value !== "number" && typeof value !== "string")
    throw new Error("Jumlah harus berupa angka.");
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1 || n > 1000000)
    throw new Error("Jumlah harus bilangan bulat antara 1 dan 1.000.000.");
  return n;
}
export function requiredText(value, label, max = 160) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    throw new Error(`${label} wajib diisi, maksimal ${max} karakter.`);
  return value.trim();
}
export function parseProductQR(value) {
  // Tetap menerima label lama SOUVENIR:UUID, lalu mencoba format tautan produk.
  const match =
    /^SOUVENIR:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(
      value.trim(),
    );
  if (match) return match[1].toLowerCase();
  return parseProductLink(value).productId;
}
export function parseProductLink(value) {
  // Ambil identitas produk dan mode dari URL yang valid; fungsi ini tidak menulis stok.
  try {
    const url = new URL(value);
    const productId = url.searchParams.get("product"),
      mode = url.searchParams.get("mode") || "out";
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.searchParams.getAll("product").length !== 1 ||
      !productId ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        productId,
      ) ||
      !["in", "out"].includes(mode)
    )
      throw new Error();
    return { productId: productId.toLowerCase(), mode };
  } catch {
    throw new Error(
      "QR tidak dikenali. Gunakan tautan produk atau label souvenir dari aplikasi ini.",
    );
  }
}
export function productLink(origin, productId, mode = "out") {
  const url = new URL("/", origin);
  url.searchParams.set("product", productId);
  url.searchParams.set("mode", mode);
  parseProductLink(url.href);
  return url.href;
}
export function inDateRange(timestamp, from, to) {
  // Bandingkan tanggal kalender WIB supaya filter tidak bergeser karena zona waktu perangkat.
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));
  return (!from || date >= from) && (!to || date <= to);
}
