"use client";

// PETA BERKAS: 1. Import -> 2. Tipe & bantuan -> 3. State -> 4. Effect/data
// -> 5. Aksi pengguna -> 6. Loading/login -> 7. Data tampilan -> 8. Tabel
// -> 9. Halaman utama -> 10. Dialog.
// Workspace berperan seperti view besar di Vue: menyatukan data, aksi, dan komponen.
// "use client" di atas menandai komponen interaktif pada Next.js.

// 1. IMPORT: mengambil fungsi, tipe, ikon, dan komponen dari berkas/package lain.
// Hook React mengatur state, efek samping, referensi, dan referensi fungsi.
// FormEvent adalah tipe TypeScript untuk event form, bukan komponen tampilan.
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
// Semua nama dari lucide-react di bawah adalah ikon yang dipakai pada JSX.
import {
  ArrowDownLeft,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Archive,
  Box,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Download,
  Edit3,
  FileClock,
  Gift,
  LayoutDashboard,
  LogOut,
  Menu,
  MoreHorizontal,
  Package,
  PackagePlus,
  Plus,
  QrCode,
  RefreshCw,
  ScanLine,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  TriangleAlert,
  Trash2,
  Users,
  X,
  KeyRound,
} from "lucide-react";
// Bentuk data aplikasi untuk pemeriksaan TypeScript; @/ menunjuk akar proyek.
import type { Product, Snapshot, Movement } from "@/lib/types";
// Data contoh untuk pratinjau aplikasi tanpa penyimpanan ke database.
import { demoSnapshot, demoRegister } from "@/lib/demo";
// Fungsi pengolahan tanggal serta pembacaan/pembuatan tautan produk QR.
import {
  parseProductQR,
  parseProductLink,
  productLink,
} from "@/lib/domain.mjs";
// Membuat berkas riwayat Excel di browser.
import { historyXlsx, XLSX_MIME } from "@/lib/history-xlsx.mjs";
import { registerXlsx } from "@/lib/register-xlsx.mjs";
// Komponen tampilan yang dapat digunakan ulang; ./ berarti folder saat ini.
import { Button } from "./ui/button";
import { Modal } from "./ui/dialog";
import Scanner from "./scanner";
import QuickScan from "./quick-scan";
import QuantityStepper from "./quantity-stepper";
import type { Page, Dialog } from "./workspace-types";
import { ProductArt } from "./product-art";
import ProductTable from "./product-table";
import HistoryPanel from "./history-panel";
import HistoryTable from "./history-table";
import { useHistory } from "@/lib/use-history";
// Hook buatan proyek: true untuk lebar viewport maksimal 720 px (tampilan HP).
import { useMobileLayout } from "@/lib/use-mobile-layout";

// 2. TIPE & BANTUAN: pilihan halaman/dialog, label, pemformatan, dan komponen kecil.
// Union type membatasi nilai page agar hanya memakai nama halaman yang tersedia.
// Nama internal halaman diterjemahkan menjadi judul yang terlihat oleh pengguna.
const pageNames: Record<Page, string> = {
  dashboard: "Ringkasan",
  products: "Daftar souvenir",
  incoming: "Barang masuk",
  give: "Pemberian souvenir",
  history: "Riwayat aktivitas",
  members: "Anggota tim",
};
// Pemformatan angka Indonesia, tanggal WIB, inisial avatar, dan label transaksi.
const number = (value: number) => value.toLocaleString("id-ID");
const initials = (name: string) =>
  name
    .split(" ")
    .slice(0, 2)
    .map((v) => v[0])
    .join("");
const kinds = {
  in: "Barang masuk",
  out: "Pemberian",
  adjust: "Penyesuaian",
  reversal: "Pembatalan",
};

// Komponen lokal: tampilkan foto produk; jika belum ada, gunakan ikon sesuai SKU.
// Pembungkus fetch untuk permintaan JSON. Respons gagal dijadikan Error agar
// pemanggil dapat menampilkan pesannya. Validasi dan penyimpanan dilakukan backend.
async function api(url: string, body?: unknown, method = "POST") {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Permintaan gagal. Coba lagi.");
  return data;
}
// Ubah isi berkas menjadi URL sementara, lalu picu unduhan browser.
function downloadFile(content: Uint8Array, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([new Uint8Array(content)], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Workspace() {
  // 3. STATE: data yang berubah saat pengguna berinteraksi.
  // useState mengembalikan [nilaiSaatIni, fungsiPengubah]; perubahan memicu render.
  // Snapshot berisi akun, produk, riwayat, dan anggota yang diterima dari API/demo.
  const mobile = useMobileLayout();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggedOut, setLoggedOut] = useState(false);
  // Navigasi disimpan di state; halaman-halaman di bawah masih berada dalam satu view.
  const [page, setPage] = useState<Page>("dashboard");
  // Pilihan manual dilipat dengan <details> pada pemberian HP, langsung tampil di PC.
  const ProductPicker = mobile && page === "give" ? "details" : "div";
  const [mobileNav, setMobileNav] = useState(false);
  // Pesan kesalahan/notifikasi dan penanda proses simpan atau ekspor berlangsung.
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  // Ref mempertahankan nilai antar-render tanpa memicu render; cegah ekspor ganda.
  const exportingRef = useRef(false);
  // Pencarian, filter stok, dan produk yang dipilih untuk form transaksi.
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [stockFilter, setStockFilter] = useState("active");
  const [selectedProduct, setSelectedProduct] = useState("");
  // Pengaturan popup umum, panel scan cepat, dan label QR yang sedang dibuat.
  const [dialog, setDialog] = useState<Dialog>(null);
  const [quickScan, setQuickScan] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const [qr, setQr] = useState("");
  const [qrMode, setQrMode] = useState<"out" | "in">("out");
  const [qrLink, setQrLink] = useState("");
  // Menandai pilihan dari tautan produk dan mencegah tautan diproses berulang
  // untuk pengguna yang sama saat data workspace dimuat ulang.
  const [linkedProduct, setLinkedProduct] = useState(false);
  const linkedUser = useRef("");
  const history = useHistory(snapshot, page === "history");
  // ID dipertahankan untuk retry transaksi yang sama; backend mencegah duplikasi.
  // formRef menunjuk elemen <form> agar dapat di-reset setelah berhasil.
  const requestId = useRef("");
  const formRef = useRef<HTMLFormElement>(null);

  // 4. EFFECT & DATA: pekerjaan setelah render, dijalankan ulang saat dependensi berubah.
  // Saat beralih ke PC, tutup panel scan agar komponen kamera dilepas.
  useEffect(() => {
    if (!mobile) setQuickScan(false);
  }, [mobile]);

  // Ambil data terbaru dari API. Status 401 membuka login; setup memakai data demo.
  // useCallback mempertahankan referensi load untuk dipakai effect dan aksi lain.
  const load = useCallback(async () => {
    const response = await fetch("/api/workspace", { cache: "no-store" });
    const data = await response.json();
    if (response.status === 401) {
      setSnapshot(null);
      setLoggedOut(true);
      return;
    }
    if (!response.ok) throw new Error(data.error || "Tidak dapat memuat data.");
    setSnapshot(data.setup ? demoSnapshot() : data);
    setLoggedOut(false);
  }, []);
  // Pemuatan awal: tangani kegagalan dan akhiri layar loading setelah selesai.
  useEffect(() => {
    load()
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [load]);
  // Jika URL berisi product/mode dari QR, pilih barang aktif dan buka form terkait.
  // Memilih produk hanya mengisi tampilan; stok berubah setelah konfirmasi transaksi.
  useEffect(() => {
    if (!snapshot) {
      linkedUser.current = "";
      return;
    }
    if (linkedUser.current === snapshot.user.id) return;
    linkedUser.current = snapshot.user.id;
    if (!new URL(window.location.href).searchParams.has("product")) return;
    try {
      const target = parseProductLink(window.location.href);
      const product = snapshot.products.find(
        (p) => p.id === target.productId && p.active,
      );
      if (!product)
        throw new Error(
          "Produk pada tautan tidak ditemukan atau sudah diarsipkan.",
        );
      setPage(target.mode === "in" ? "incoming" : "give");
      setSelectedProduct(product.id);
      setLinkedProduct(true);
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  }, [snapshot]);
  // Hilangkan notifikasi berhasil otomatis setelah 4,5 detik; bersihkan timer lama.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  // Saat dialog QR/mode berubah, buat gambar QR dari tautan produk di browser.
  // cancelled mencegah hasil proses lama mengisi dialog yang sudah ditutup/berganti.
  useEffect(() => {
    if (dialog?.type !== "qr" || !dialog.product) return;
    let cancelled = false;
    setQr("");
    const link = productLink(window.location.origin, dialog.product.id, qrMode);
    setQrLink(link);
    import("qrcode")
      .then((module) =>
        module.default.toDataURL(link, {
          width: 560,
          margin: 3,
          errorCorrectionLevel: "M",
          color: { dark: "#13243b", light: "#ffffff" },
        }),
      )
      .then((value) => {
        if (!cancelled) setQr(value);
      })
      .catch(() => setDialogError("QR gagal dibuat. Silakan buka kembali."));
    return () => {
      cancelled = true;
    };
  }, [dialog, qrMode]);

  // 5. AKSI PENGGUNA: dipanggil dari onClick, onSubmit, atau hasil pemindaian.
  // Bersihkan parameter produk/mode dari URL ketika meninggalkan alur produk.
  function clearProductLink() {
    setLinkedProduct(false);
    const url = new URL(window.location.href);
    if (url.searchParams.has("product")) {
      url.searchParams.delete("product");
      url.searchParams.delete("mode");
      window.history.replaceState(
        null,
        "",
        url.pathname + url.search + url.hash,
      );
    }
  }
  // Ganti Berikan/Tambah stok sambil mempertahankan produk; sinkronkan form dan URL.
  function productMode(mode: "out" | "in") {
    if (!selectedProduct) return;
    formRef.current?.reset();
    requestId.current = "";
    setError("");
    setPage(mode === "in" ? "incoming" : "give");
    setLinkedProduct(true);
    window.history.replaceState(
      null,
      "",
      productLink(window.location.origin, selectedProduct, mode),
    );
  }

  // Berpindah bagian tampilan dan membersihkan pencarian/pilihan yang perlu di-reset.
  function navigate(next: Page) {
    clearProductLink();
    if (next === "give") setSelectedProduct("");
    setPage(next);
    setMobileNav(false);
    setSearch("");
    setError("");
    if (next === "dashboard") {
      setCategory("");
      setStockFilter("active");
    }
    requestId.current = "";
  }
  // Buka popup yang dipilih, lalu bersihkan error dan ID permintaan sebelumnya.
  function openDialog(value: Dialog) {
    if (value?.type === "qr") setQrMode("out");
    setDialogError("");
    setDialog(value);
    requestId.current = "";
  }
  // Mode demo hanya untuk melihat tampilan; hentikan aksi yang mencoba menyimpan.
  function ensureLive() {
    if (snapshot?.demo)
      throw new Error(
        "Ini pratinjau data contoh. Jalankan aplikasi dengan PostgreSQL lokal untuk menyimpan perubahan.",
      );
  }
  // Jalur simpan bersama: kirim perubahan, lalu ambil ulang data supaya tampilan terkini.
  async function mutate(body: unknown, endpoint = "/api/workspace") {
    ensureLive();
    await api(endpoint, body);
    await load();
  }
  // Tombol Perbarui: muat ulang data dengan indikator proses dan pesan hasil.
  async function refresh() {
    setBusy(true);
    setError("");
    try {
      await load();
      setNotice("Data berhasil diperbarui.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  // Form login mengirim kredensial ke backend; backend mengatur cookie sesi.
  // preventDefault mencegah submit HTML memuat ulang seluruh halaman.
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await api("/api/auth", {
        email: form.get("email"),
        password: form.get("password"),
      });
      setPage("dashboard");
      setSelectedProduct("");
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  // Akhiri sesi lewat API (jika bukan demo), lalu tampilkan halaman login.
  async function logout() {
    setBusy(true);
    try {
      if (!snapshot?.demo) await api("/api/auth", undefined, "DELETE");
      setSnapshot(null);
      setLoggedOut(true);
      setError("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  // Simpan form utama: halaman incoming mengirim jenis in, halaman give mengirim out.
  // FormData membaca isian berdasarkan atribut name pada input/select/textarea.
  async function record(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    requestId.current ||= crypto.randomUUID();
    try {
      await mutate({
        action: "movement",
        kind: page === "incoming" ? "in" : "out",
        product_id: selectedProduct,
        quantity: Number(form.get("quantity")),
        recipient: form.get("recipient"),
        note: form.get("note"),
        request_id: requestId.current,
      });
      requestId.current = "";
      formRef.current?.reset();
      clearProductLink();
      setSelectedProduct("");
      setNotice(
        page === "incoming"
          ? "Barang masuk berhasil dicatat."
          : "Pemberian souvenir berhasil dicatat.",
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  // Satu handler untuk produk/foto, koreksi, pembatalan, arsip, hapus, dan akun anggota.
  // dialog.type menentukan payload dan endpoint yang digunakan.
  async function submitDialog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialog) return;
    setBusy(true);
    setDialogError("");
    const form = new FormData(event.currentTarget);
    requestId.current ||= crypto.randomUUID();
    try {
      ensureLive();
      if (dialog.type === "password") {
        if (form.get("new_password") !== form.get("confirm_password")) throw new Error("Konfirmasi password tidak cocok.");
        await mutate({ current_password: form.get("current_password"), new_password: form.get("new_password") }, "/api/account");
      } else if (dialog.type === "product") {
        let photo = dialog.product?.photo || null;
        const file = form.get("photo");
        if (file instanceof File && file.size) {
          const body = new FormData();
          body.set("file", file);
          const response = await fetch("/api/upload", { method: "POST", body });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error);
          photo = data.url;
        }
        await mutate({
          action: "product",
          id: dialog.product?.id,
          name: form.get("name"),
          sku: form.get("sku"),
          category: form.get("category"),
          unit: form.get("unit"),
          minimum: form.get("minimum"),
          photo,
        });
      } else if (dialog.type === "adjust" || dialog.type === "reversal") {
        await mutate({
          action: "movement",
          kind: dialog.type,
          product_id: dialog.product?.id,
          reversal_of: dialog.movement?.id,
          quantity: Number(form.get("quantity")),
          note: form.get("note"),
          request_id: requestId.current,
        });
      } else if (dialog.type === "member") {
        await mutate(
          {
            name: form.get("name"),
            email: form.get("email"),
            password: form.get("password"),
            role: form.get("role"),
          },
          "/api/members",
        );
      } else if (dialog.type === "member-status") {
        await mutate(
          { id: dialog.memberId, active: dialog.active },
          "/api/members",
        );
      } else if (dialog.type === "archive") {
        await mutate({
          action: "archive",
          id: dialog.product!.id,
          active: !dialog.product!.active,
        });
      } else if (dialog.type === "delete-product") {
        await mutate({ action: "delete-product", id: dialog.product!.id });
        if (selectedProduct === dialog.product!.id) {
          setSelectedProduct("");
          clearProductLink();
        }
        if (history.filters.product === dialog.product!.id) history.setFilter("product", "");
      }
      setDialog(null);
      requestId.current = "";
      setNotice(dialog.type === "delete-product" ? "Produk berhasil dihapus." : "Perubahan berhasil disimpan.");
    } catch (err) {
      setDialogError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  // Scanner pada halaman pemberian memilih produk dari hasil QR, tanpa menyimpan stok.
  function scan(text: string) {
    try {
      const id = parseProductQR(text);
      const product = snapshot?.products.find((p) => p.id === id && p.active);
      if (!product)
        throw new Error("Produk tidak ditemukan atau sudah diarsipkan.");
      setSelectedProduct(id);
      requestId.current = "";
      setError("");
      setNotice(`${product.name} berhasil dipilih.`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  // 6. TAMPILAN AWAL: early return menampilkan loading/login/error sebelum workspace.
  if (loading)
    return (
      <div className="boot">
        <div className="brand-mark">
          <Box size={26} />
        </div>
        <h1>
          SOUV<span>.</span>
        </h1>
        <p>Menyiapkan ruang kerja…</p>
        <div className="loading-line" />
      </div>
    );
  // Form login ditampilkan jika sesi belum tersedia atau pengguna sudah keluar.
  if (loggedOut)
    return (
      <div className="login-layout">
        <section className="login-story">
          <div className="brand">
            <div className="brand-mark">
              <Box size={24} />
            </div>
            <strong>
              SOUV<span>.</span>
            </strong>
          </div>
          <div>
            <span className="eyebrow">RUANG KERJA TIM FUNDING</span>
            <h1>
              Stok tertata.
              <br />
              Pemberian
              <br />
              <em>bermakna.</em>
            </h1>
            <p>
              Satu tempat untuk setiap souvenir dan setiap hubungan yang Anda
              bangun.
            </p>
          </div>
          <small>SOUV / SOUVENIR MANAGEMENT</small>
        </section>
        <section className="login-form">
          <div className="login-inner">
            <span className="eyebrow">SELAMAT DATANG KEMBALI</span>
            <h2>Masuk ke ruang kerja</h2>
            <p>Gunakan akun yang diberikan admin tim Anda.</p>
            <form onSubmit={login}>
              <label>
                Email
                <input
                  name="email"
                  type="email"
                  placeholder="nama@perusahaan.com"
                  autoComplete="username"
                  required
                />
              </label>
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </label>
              {error && (
                <p role="alert" className="inline-error">
                  {error}
                </p>
              )}
              <Button disabled={busy} type="submit">
                {busy ? "Memeriksa…" : "Masuk"}
                <ArrowRight size={16} />
              </Button>
            </form>
            <p className="login-help">
              <ShieldCheck size={15} />
              Akses khusus anggota tim funding
            </p>
            <Button
              variant="ghost"
              onClick={() => {
                setSnapshot(demoSnapshot());
                setLoggedOut(false);
                setError("");
              }}
            >
              Lihat pratinjau dengan data contoh <ArrowUpRight size={15} />
            </Button>
          </div>
        </section>
      </div>
    );

  // Jika pengambilan data gagal, sediakan Coba lagi atau pratinjau data contoh.
  if (!snapshot)
    return (
      <div className="boot">
        <TriangleAlert size={28} />
        <h2>Ruang kerja belum tersedia</h2>
        <p role="alert">{error}</p>
        <Button onClick={refresh} disabled={busy}>
          Coba lagi
        </Button>
        <Button variant="outline" onClick={() => setSnapshot(demoSnapshot())}>
          Lihat demo tampilan
        </Button>
      </div>
    );

  // 7. DATA TAMPILAN: dihitung dari snapshot dan filter setiap render.
  // admin mengatur tombol/menu di UI; otorisasi sebenarnya tetap diperiksa backend.
  const admin = snapshot.user.role === "admin";
  const active = snapshot.products.filter((p) => p.active);
  const low = active
    .filter((p) => p.stock <= p.minimum)
    .sort((a, b) => a.stock - b.stock);
  // Ringkasan bulan berjalan menggunakan WIB dan mengabaikan transaksi yang dibatalkan.
  // Ringkasan hanya mencakup riwayat sesuai akses yang sudah dimuat dari backend.
  const now = new Date();
  const monthKey = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(now);
  const monthMovements = snapshot.movements.filter(
    (m) =>
      new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
        timeZone: "Asia/Jakarta",
      }).format(new Date(m.created_at)) === monthKey,
  );
  const reversed = new Set([
    ...snapshot.movements
      .filter((m) => m.reversal_of)
      .map((m) => m.reversal_of),
    ...snapshot.movements.filter((m) => m.cancelled).map((m) => m.id),
  ]);
  const given = snapshot.summary?.given ?? monthMovements
    .filter((m) => m.kind === "out" && !reversed.has(m.id))
    .reduce((n, m) => n + Math.abs(m.quantity), 0);
  const incoming = snapshot.summary?.incoming ?? monthMovements
    .filter((m) => m.kind === "in" && !reversed.has(m.id))
    .reduce((n, m) => n + m.quantity, 0);
  // Filter dilakukan pada data di browser, bukan dengan query baru ke database.
  const filteredProducts = snapshot.products.filter(
    (p) =>
      (stockFilter === "archived" ? !p.active : p.active) &&
      (stockFilter !== "low" || p.stock <= p.minimum) &&
      (!category || p.category === category) &&
      `${p.name} ${p.sku}`.toLowerCase().includes(search.toLowerCase()),
  );
  // Objek barang terpilih dan daftar menu navigasi beserta ikon masing-masing.
  const chosen = active.find((p) => p.id === selectedProduct);
  const nav = [
    { page: "dashboard" as Page, icon: LayoutDashboard },
    { page: "products" as Page, icon: Package },
    { page: "incoming" as Page, icon: PackagePlus },
    { page: "give" as Page, icon: mobile ? ScanLine : Gift },
    { page: "history" as Page, icon: FileClock },
  ];
  // Unduh Excel mengikuti seluruh hasil filter riwayat, bukan hanya baris yang terlihat.
  const exportHistory = async () => {
    if (exportingRef.current || history.loading || !history.total) return;
    exportingRef.current = true;
    setExporting(true);
    setError("");
    try {
      const content = await historyXlsx(await history.exportAll());
      downloadFile(content, "riwayat-souvenir.xlsx", XLSX_MIME);
    } catch {
      setError("Ekspor Excel gagal. Silakan coba lagi.");
    } finally {
      exportingRef.current = false;
      setExporting(false);
    }
  };

  const exportRegister = async () => {
    if (exportingRef.current || !admin || !snapshot.products.length) return;
    exportingRef.current = true;
    setExporting(true);
    setError("");
    try {
      const data = snapshot.demo ? demoRegister() : await api("/api/register", undefined, "GET");
      const content = await registerXlsx(data);
      const stamp = new Date(Date.now() + 7 * 3600000).toISOString()
        .slice(0, 19).replace(/[-:]/g, "").replace("T", "-");
      downloadFile(content, `register-souvenir-${stamp}.xlsx`, XLSX_MIME);
    } catch (err) {
      setError(`Ekspor register gagal. ${(err as Error).message}`);
    } finally {
      exportingRef.current = false;
      setExporting(false);
    }
  };

  // 8. PEMBENTUK TABEL: fungsi lokal yang menghasilkan JSX dan dipakai ulang di halaman.
  // dashboard memilih versi ringkas tabel produk; tombol admin mengikuti hak akses UI.
  // Tabel riwayat PC atau aktivitas ringkas dashboard; daftar HP memakai MobileHistory.
  // 9. HALAMAN UTAMA (JSX): bagian ini membentuk tampilan seperti <template> di Vue.
  // Elemen HTML ditulis langsung bersama komponen React; className diatur CSS global/tema.
  // {kondisi && (...)} menampilkan blok saat kondisi benar, mirip v-if pada Vue.
  return (
    <div className="app-shell">
      {/* Lapisan di belakang sidebar HP: klik untuk menutup navigasi. */}
      {mobileNav && (
        <button
          className="nav-scrim"
          aria-label="Tutup navigasi"
          onClick={() => setMobileNav(false)}
        />
      )}
      {/* Sidebar: identitas aplikasi, menu halaman, menu admin, profil, dan logout. */}
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <a
          className="brand"
          href="#ringkasan"
          onClick={(e) => {
            e.preventDefault();
            navigate("dashboard");
          }}
        >
          <div className="brand-mark">
            <Box size={25} />
          </div>
          <strong>
            SOUV<span>.</span>
          </strong>
        </a>
        <div className="workspace-label">
          <span className="workspace-avatar">F</span>
          <div>
            <strong>Tim Funding</strong>
            <small>Souvenir workspace</small>
          </div>
          <ChevronDown size={15} />
        </div>
        <span className="nav-caption">WORKSPACE</span>
        <nav>
          {/* map menghasilkan satu tombol per item, seperti v-for; key adalah identitas item. */}
          {nav.map((item) => (
            <button
              key={item.page}
              className={page === item.page ? "nav-item active" : "nav-item"}
              aria-current={page === item.page ? "page" : undefined}
              onClick={() => navigate(item.page)}
            >
              <item.icon size={18} />
              <span>{pageNames[item.page]}</span>
              {item.page === "products" && <small>{active.length}</small>}
            </button>
          ))}
        </nav>
        {admin && (
          <>
            <span className="nav-caption management">PENGELOLAAN</span>
            <nav>
              <button
                className={`nav-item ${page === "members" ? "active" : ""}`}
                onClick={() => navigate("members")}
              >
                <Users size={18} />
                <span>Anggota tim</span>
              </button>
            </nav>
          </>
        )}
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <ShieldCheck size={20} />
            <strong>Setiap barang, tercatat.</strong>
            <p>Kelola stok dan pemberian dalam satu ruang kerja.</p>
          </div>
          <div className="sidebar-user">
            <span className="avatar">{initials(snapshot.user.name)}</span>
            <div>
              <strong>{snapshot.user.name}</strong>
              <small>{admin ? "Administrator" : "Anggota funding"}</small>
            </div>
            <button
              onClick={logout}
              disabled={busy}
              aria-label="Keluar"
              title="Keluar"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      {/* Kerangka konten: header tetap dan isi yang mengikuti state page. */}
      <div className={`main-shell page-${page}`}>
        <header className="topbar">
          <span className="mobile-brand">
            SOUV<span>.</span>
          </span>
          <div className="breadcrumb">
            <button
              className="mobile-menu"
              aria-label="Buka navigasi"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{pageNames[page]}</strong>
          </div>
          <div className="topbar-right">
            {!snapshot.demo && <Button size="icon" variant="ghost" aria-label="Ubah password" title="Ubah password" onClick={() => openDialog({ type: "password" })}><KeyRound size={18} /></Button>}
            <span className="team-indicator">
              <i />
              Tim Funding
            </span>
            <span className="top-divider" />
            <span className="avatar light">{initials(snapshot.user.name)}</span>
          </div>
        </header>
        <main className="main-content">
          {/* Banner hanya muncul saat memakai data contoh. */}
          {snapshot.demo && (
            <div className="demo-banner">
              <span className="demo-description">
                <span className="demo-tag">DEMO</span>Data contoh · perubahan
                belum disimpan. Jalankan backend PostgreSQL lokal sesuai README.
              </span>
              <span className="mobile-demo-description">
                Mode demo · data belum disimpan
              </span>
              <button
                onClick={() => {
                  setLoggedOut(true);
                  setSnapshot(null);
                }}
              >
                Ke halaman masuk <ArrowUpRight size={14} />
              </button>
            </div>
          )}
          {/* Judul, deskripsi, dan tombol aksi berbeda untuk setiap halaman. */}
          <div className="page-heading">
            <div>
              <div className="eyebrow">FUNDING / SOUVENIR MANAGEMENT</div>
              <h1>
                {pageNames[page]}
                <span className="title-dot">.</span>
              </h1>
              <p>
                {page === "dashboard"
                  ? "Pantau persediaan, catat pemberian, bangun hubungan."
                  : page === "products"
                    ? "Seluruh koleksi souvenir dan ketersediaannya dalam satu tempat."
                    : page === "give"
                      ? "Hadiah kecil, hubungan yang lebih dekat. Catat pemberiannya di sini."
                      : page === "incoming"
                        ? "Tambahkan persediaan dan simpan jejak barang yang diterima."
                        : page === "history"
                          ? "Jejak setiap souvenir, dari barang masuk hingga sampai ke nasabah."
                          : "Kelola akses dan orang-orang di balik setiap pemberian."}
              </p>
            </div>
            <div className="heading-actions">
              {admin && (page === "products" || page === "history") && (
                <Button
                  variant="outline"
                  onClick={exportRegister}
                  disabled={exporting || !snapshot.products.length}
                  title="Seluruh barang dan transaksi, satu sheet per barang. Filter riwayat tidak diterapkan."
                >
                  <Download size={16} />
                  {exporting ? "Menyiapkan Excel…" : "Ekspor register"}
                </Button>
              )}
              {page === "dashboard" && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => navigate("incoming")}
                  >
                    <Plus size={17} />
                    Barang masuk
                  </Button>
                  <Button
                    onClick={() => mobile ? setQuickScan(true) : navigate("give")}
                  >
                    {mobile ? <ScanLine size={17} /> : <Gift size={17} />}
                    {mobile ? "Scan & beri souvenir" : "Beri souvenir"}
                  </Button>
                </>
              )}
              {page === "products" && admin && (
                <Button onClick={() => openDialog({ type: "product" })}>
                  <Plus size={17} />
                  Tambah barang
                </Button>
              )}
              {page === "history" && (
                <Button variant="outline" onClick={exportHistory} disabled={exporting || !history.total || history.loading}>
                  <Download size={16} />
                  {exporting ? "Menyiapkan Excel…" : "Ekspor riwayat"}
                </Button>
              )}
              {page === "members" && admin && (
                <Button onClick={() => openDialog({ type: "member" })}>
                  <Plus size={17} />
                  Tambah anggota
                </Button>
              )}
            </div>
          </div>
          {/* Kesalahan aksi/API ditampilkan di atas isi halaman yang sedang aktif. */}
          {error && (
            <div role="alert" className="error-banner">
              <TriangleAlert size={17} />
              <span>{error}</span>
              <button aria-label="Tutup pesan" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}

          {/* HALAMAN RINGKASAN: statistik, stok, aktivitas terbaru, dan barang menipis. */}
          {page === "dashboard" && (
            <>
              <div className="mobile-welcome">
                <p>Halo, {snapshot.user.name.split(" ")[0]}</p>
                <h1>Souvenir tim kamu</h1>
              </div>
              {/* Kartu statistik dibuat dari array data yang dipetakan menjadi JSX. */}
              <div className="stats-grid">
                {[
                  {
                    label: "Total stok tersedia",
                    value: active.reduce((n, p) => n + p.stock, 0),
                    icon: Box,
                    foot: `Dari ${active.length} jenis souvenir`,
                    suffix: "unit",
                  },
                  {
                    label: admin
                      ? "Diberikan bulan ini"
                      : "Anda berikan bulan ini",
                    value: given,
                    icon: Gift,
                    foot: admin
                      ? "Pemberian tim bulan ini"
                      : "Pemberian Anda bulan ini",
                    suffix: "unit",
                  },
                  {
                    label: "Barang masuk",
                    value: incoming,
                    icon: ArrowDownToLine,
                    foot: admin
                      ? "Penerimaan tim bulan ini"
                      : "Pencatatan Anda bulan ini",
                    suffix: "unit",
                  },
                  {
                    label: "Perlu perhatian",
                    value: low.length,
                    icon: TriangleAlert,
                    foot: "Stok menipis atau habis",
                    suffix: "barang",
                    warning: true,
                  },
                ].map((stat) => (
                  <section
                    className={`stat ${stat.warning ? "stat-warning" : ""}`}
                    key={stat.label}
                  >
                    <div className="stat-label">
                      {stat.label}
                      <stat.icon size={19} strokeWidth={1.6} />
                    </div>
                    <div className="stat-value">
                      {number(stat.value)}
                      <span>{stat.suffix}</span>
                    </div>
                    <div className="stat-foot">
                      {stat.warning && <i />}
                      {stat.foot}
                    </div>
                  </section>
                ))}
              </div>
              {low.length > 0 && (
                <button
                  className="mobile-stock-alert"
                  onClick={() => {
                    navigate("products");
                    setStockFilter("low");
                  }}
                >
                  <TriangleAlert size={15} />
                  <span>{low.length} barang perlu diisi ulang</span>
                  <ChevronRight size={15} />
                </button>
              )}
              <div className="dashboard-columns">
                {/* Kolom utama dashboard berisi tabel stok dan aktivitas terbaru. */}
                <div className="dashboard-primary">
                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Persediaan souvenir</h2>
                        <p>Stok terkini untuk setiap kebutuhan tim.</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate("products")}
                      >
                        Lihat semua
                        <ArrowUpRight size={15} />
                      </Button>
                    </div>
                    <div className="table-tools">
                      <div className="search-field">
                        <Search size={17} />
                        <input
                          aria-label="Cari souvenir"
                          placeholder="Cari nama atau kode barang…"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                        />
                      </div>
                      <select
                        aria-label="Filter stok"
                        value={stockFilter}
                        onChange={(e) => setStockFilter(e.target.value)}
                      >
                        <option value="active">Semua stok</option>
                        <option value="low">Perlu perhatian</option>
                      </select>
                    </div>
                    <ProductTable rows={filteredProducts.slice(0, 5)} admin={admin} onOpen={openDialog} dashboard />
                    <div className="table-footer">
                      <span>
                        Menampilkan {Math.min(filteredProducts.length, 5)} dari{" "}
                        {filteredProducts.length} barang
                      </span>
                      <button onClick={refresh} disabled={busy}>
                        <RefreshCw size={13} className={busy ? "spin" : ""} />
                        Perbarui stok
                      </button>
                    </div>
                  </section>
                  <section className="panel recent-panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Aktivitas terbaru</h2>
                        <p>
                          {admin
                            ? "Pencatatan terakhir dari tim Anda."
                            : "Pencatatan terakhir Anda."}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate("history")}
                      >
                        Semua aktivitas
                        <ArrowUpRight size={15} />
                      </Button>
                    </div>
                    <HistoryTable rows={snapshot.movements.slice(0, 4)} compact admin={admin} reversed={reversed} onCancel={movement => openDialog({ type: "reversal", movement })} />
                  </section>
                </div>
                {/* Kolom pendamping: pintasan pemberian dan daftar stok yang perlu perhatian. */}
                <div className="dashboard-secondary">
                  <section className="scan-promo">
                    <div className="promo-top">
                      <span>PEMBERIAN SOUVENIR</span>
                      <ArrowUpRight size={19} />
                    </div>
                    <div className="promo-qr">
                      {mobile ? (
                        <ScanLine size={54} strokeWidth={1} />
                      ) : (
                        <Gift size={54} strokeWidth={1} />
                      )}
                      {mobile && <div className="scan-rule" />}
                    </div>
                    <h2>
                      {mobile ? "Scan. Catat." : "Pilih. Catat."}
                      <br />
                      Selesai.
                    </h2>
                    <p>
                      {mobile
                        ? "Catat souvenir untuk nasabah langsung dari kamera Anda."
                        : "Pilih barang, isi nama nasabah dan jumlah, lalu konfirmasi pemberian."}
                    </p>
                    <button
                      onClick={() => mobile ? setQuickScan(true) : navigate("give")}
                    >
                      {mobile ? "Mulai scan QR" : "Isi form pemberian"}
                      <ArrowRight size={17} />
                    </button>
                  </section>
                  <section className="panel attention">
                    <div className="panel-heading">
                      <h2>Perlu perhatian</h2>
                      <span className="count-label">{low.length}</span>
                    </div>
                    {low.length ? (
                      <div className="attention-list">
                        {low.slice(0, 4).map((p) => (
                          <button
                            key={p.id}
                            onClick={() => {
                              navigate("incoming");
                              setSelectedProduct(p.id);
                            }}
                          >
                            <ProductArt product={p} small />
                            <div>
                              <strong>{p.name}</strong>
                              <small>
                                Minimum {p.minimum} {p.unit}
                              </small>
                            </div>
                            <span
                              className={
                                p.stock === 0 ? "stock-zero" : "stock-low"
                              }
                            >
                              {p.stock}
                              <small>{p.unit}</small>
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="empty-state">
                        <Check size={24} />
                        <p>Semua stok mencukupi.</p>
                      </div>
                    )}
                    <div className="attention-footer">
                      <span className="tiny-dot" />
                      Periksa stok sebelum pemberian.
                    </div>
                  </section>
                  <div className="quiet-note">
                    <ShieldCheck size={18} />
                    <p>
                      Setiap perubahan stok tercatat bersama nama petugas dan
                      waktunya.
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* HALAMAN BARANG: filter status/kategori, pencarian, dan tabel pengelolaan produk. */}
          {page === "products" && (
            <section className="panel">
              <div className="section-tabs">
                <button
                  className={stockFilter !== "archived" ? "selected" : ""}
                  onClick={() => setStockFilter("active")}
                >
                  Barang aktif <span>{active.length}</span>
                </button>
                <button
                  className={stockFilter === "archived" ? "selected" : ""}
                  onClick={() => setStockFilter("archived")}
                >
                  Diarsipkan{" "}
                  <span>{snapshot.products.length - active.length}</span>
                </button>
              </div>
              <div className="table-tools">
                <div className="search-field">
                  <Search size={17} />
                  <input
                    aria-label="Cari produk"
                    placeholder="Cari nama atau kode barang…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <select
                  aria-label="Kategori"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="">Semua kategori</option>
                  {Array.from(
                    new Set(snapshot.products.map((p) => p.category)),
                  ).map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={refresh}
                  disabled={busy}
                >
                  <RefreshCw size={15} />
                  Perbarui
                </Button>
              </div>
              <ProductTable rows={filteredProducts} admin={admin} onOpen={openDialog} />
              <div className="table-footer">
                <span>{filteredProducts.length} barang ditemukan</span>
                <span>Stok diperbarui setelah pencatatan dikonfirmasi.</span>
              </div>
            </section>
          )}

          {/* HALAMAN TRANSAKSI: satu struktur form untuk pemberian (out) dan barang masuk (in). */}
          {(page === "give" || page === "incoming") && (
            <div className="entry-layout">
              <section className="panel entry-form">
                <div className="panel-heading">
                  <div>
                    <span className="step-label">
                      {page === "give"
                        ? chosen
                          ? "02 / JUMLAH & PENERIMA"
                          : mobile
                            ? "01 / SCAN QR BARANG"
                            : "01 / PILIH SOUVENIR"
                        : "PENERIMAAN PERSEDIAAN"}
                    </span>
                    <h2>
                      {page === "give"
                        ? "Detail pemberian"
                        : "Detail barang masuk"}
                    </h2>
                  </div>
                  <span className="form-heading-icon">
                    {page === "give" ? (
                      <Gift size={22} />
                    ) : (
                      <PackagePlus size={22} />
                    )}
                  </span>
                </div>
                {chosen && (
                  <div
                    className="product-flow-tabs"
                    role="group"
                    aria-label="Pilih tindakan stok"
                  >
                    <button
                      type="button"
                      aria-pressed={page === "give"}
                      onClick={() => productMode("out")}
                    >
                      <Gift size={16} />
                      Berikan
                    </button>
                    <button
                      type="button"
                      aria-pressed={page === "incoming"}
                      onClick={() => productMode("in")}
                    >
                      <PackagePlus size={16} />
                      Tambah stok
                    </button>
                  </div>
                )}
                {/* Scanner halaman hanya muncul pada HP sebelum barang dipilih. */}
                {mobile && page === "give" && !chosen && !quickScan && (
                  <Scanner onScan={scan} />
                )}
                {/* onSubmit memanggil record; mengubah isian menyiapkan ID transaksi baru. */}
                <form
                  ref={formRef}
                  onSubmit={record}
                  onChange={() => {
                    requestId.current = "";
                  }}
                  className="entry-fields"
                >
                  {/* Daftar barang langsung terlihat pada PC; pilihan manual HP dapat dilipat. */}
                  {((page === "incoming" && !linkedProduct) || !chosen) && (
                    <ProductPicker className="manual-product-picker">
                      {mobile && page === "give" && (
                        <summary>
                          QR tidak bisa dipindai? Pilih barang manual
                        </summary>
                      )}
                      <label>
                        {mobile && page === "give"
                          ? "Atau pilih barang secara manual"
                          : "Nama barang"}
                        <select
                          required
                          aria-label={
                            mobile && page === "give"
                              ? "Atau pilih barang secara manual"
                              : "Nama barang"
                          }
                          value={selectedProduct}
                          onChange={(e) => setSelectedProduct(e.target.value)}
                        >
                          <option value="">Pilih souvenir…</option>
                          {active.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} · {p.sku} · stok {p.stock}
                            </option>
                          ))}
                        </select>
                      </label>
                    </ProductPicker>
                  )}
                  {/* Ringkasan barang terpilih beserta stok dan tombol mengganti barang. */}
                  {chosen && (
                    <>
                      <div className="chosen-product">
                        <ProductArt product={chosen} />
                        <div>
                          <strong>{chosen.name}</strong>
                          <small>{chosen.sku}</small>
                        </div>
                        <span>
                          <strong>{number(chosen.stock)}</strong> {chosen.unit}{" "}
                          tersedia
                        </span>
                      </div>
                      {page === "give" && (
                        <div className="detected-product-note">
                          <span>
                            <Check size={14} />
                            Barang sudah terpilih
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedProduct("");
                              requestId.current = "";
                              setError("");
                            }}
                          >
                            {mobile ? (
                              <ScanLine size={14} />
                            ) : (
                              <Package size={14} />
                            )}
                            {mobile ? "Scan barang lain" : "Pilih barang lain"}
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                  {/* Detail transaksi: penerima untuk pemberian, jumlah, petugas, dan konfirmasi. */}
                  {(page === "incoming" || chosen) && (
                    <>
                      {page === "give" && (
                        <label>
                          Nama nasabah
                          <input
                            name="recipient"
                            placeholder="Nama penerima souvenir"
                            maxLength={160}
                            required
                            autoComplete="off"
                            autoFocus
                          />
                        </label>
                      )}
                      <div className="form-grid">
                        {page === "give" ? (
                          <QuantityStepper
                            key={chosen?.id}
                            max={chosen?.stock || 0}
                            disabled={busy}
                            onChange={() => {
                              requestId.current = "";
                            }}
                          />
                        ) : (
                          <label>
                            Jumlah masuk
                            <input
                              name="quantity"
                              type="number"
                              min={1}
                              step={1}
                              max={1000000}
                              placeholder="0"
                              defaultValue={linkedProduct ? 1 : undefined}
                              required
                            />
                          </label>
                        )}
                        {page === "give" ? (
                          <div className="automatic-giver">
                            <span>Pemberi · otomatis dari akun</span>
                            <strong>
                              <ShieldCheck size={16} />
                              {snapshot.user.name}
                            </strong>
                          </div>
                        ) : (
                          <label>
                            Petugas
                            <input
                              value={snapshot.user.name}
                              readOnly
                              className="readonly"
                            />
                          </label>
                        )}
                      </div>
                      {page === "incoming" && (
                        <label>
                          {page === "incoming"
                            ? "Sumber barang / catatan"
                            : "Catatan"}{" "}
                          <span className="optional">opsional</span>
                          <textarea
                            name="note"
                            rows={3}
                            maxLength={500}
                            placeholder={
                              page === "incoming"
                                ? "Contoh: pengiriman dari kantor pusat"
                                : "Contoh: kunjungan nasabah prioritas"
                            }
                          />
                        </label>
                      )}
                      <div className="form-info">
                        <ShieldCheck size={16} />
                        <p>
                          Stok {page === "give" ? "berkurang" : "bertambah"}{" "}
                          setelah Anda mengonfirmasi. Tanggal dan petugas
                          dicatat otomatis.
                        </p>
                      </div>
                      <Button
                        type="submit"
                        disabled={
                          busy ||
                          !chosen ||
                          (page === "give" && chosen.stock === 0)
                        }
                      >
                        {busy
                          ? "Menyimpan…"
                          : page === "give"
                            ? "Konfirmasi pemberian"
                            : "Simpan barang masuk"}
                        <ArrowRight size={17} />
                      </Button>
                    </>
                  )}
                </form>
              </section>
              {/* Panduan pengisian di samping form; tata letaknya mengikuti aturan CSS. */}
              <aside className="entry-aside">
                <span className="eyebrow">PENCATATAN YANG JELAS</span>
                <h2>
                  Setiap souvenir
                  <br />
                  punya cerita.
                </h2>
                <p>
                  Pastikan nama barang, jumlah, dan penerima sudah sesuai
                  sebelum menyimpan.
                </p>
                <ol>
                  <li>
                    <span>01</span>
                    <div>
                      <strong>Pilih souvenir</strong>
                      <p>
                        {page === "give" && mobile
                          ? "Scan label QR atau cari barang secara manual."
                          : page === "give"
                            ? "Pilih souvenir yang akan diberikan dari daftar barang."
                            : "Pilih barang yang diterima dari daftar produk."}
                      </p>
                    </div>
                  </li>
                  <li>
                    <span>02</span>
                    <div>
                      <strong>Lengkapi detail</strong>
                      <p>
                        {page === "give"
                          ? "Masukkan nama nasabah dan jumlah pemberian."
                          : "Isi jumlah dan sumber barang bila diperlukan."}
                      </p>
                    </div>
                  </li>
                  <li>
                    <span>03</span>
                    <div>
                      <strong>Konfirmasi pencatatan</strong>
                      <p>Stok dan riwayat diperbarui bersama-sama.</p>
                    </div>
                  </li>
                </ol>
                <div className="help-note">
                  <CircleHelp size={18} />
                  <p>
                    Salah mencatat? Hubungi admin untuk membatalkan pencatatan
                    dengan alasan.
                  </p>
                </div>
              </aside>
            </div>
          )}

          {page === "history" && <HistoryPanel snapshot={snapshot} history={history} onCancel={movement => openDialog({ type: "reversal", movement })} />}

          {/* HALAMAN ANGGOTA: hanya UI admin, untuk melihat akun dan mengubah statusnya. */}
          {page === "members" && admin && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Orang di ruang kerja Anda</h2>
                  <p>
                    {snapshot.members.filter((m) => m.active).length} anggota
                    aktif · akses melalui akun masing-masing
                  </p>
                </div>
                <Users size={22} />
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Anggota</th>
                      <th>Email</th>
                      <th>Peran</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.members.map((m) => (
                      <tr key={m.id}>
                        <td>
                          <div className="person-cell">
                            <span className="avatar light">
                              {initials(m.name)}
                            </span>
                            <strong>{m.name}</strong>
                            {m.id === snapshot.user.id && <small>(Anda)</small>}
                          </div>
                        </td>
                        <td>{m.email}</td>
                        <td>
                          {m.role === "admin" ? "Administrator" : "Anggota"}
                        </td>
                        <td>
                          <span
                            className={`status ${m.active ? "status-good" : "status-archived"}`}
                          >
                            <i />
                            {m.active ? "Aktif" : "Nonaktif"}
                          </span>
                        </td>
                        <td>
                          {m.id !== snapshot.user.id && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                openDialog({
                                  type: "member-status",
                                  memberId: m.id,
                                  active: !m.active,
                                })
                              }
                            >
                              {m.active ? "Nonaktifkan" : "Aktifkan"}
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {/* Footer umum yang digunakan pada seluruh halaman workspace. */}
          <footer className="page-footer">
            <span>
              SOUV<span className="title-dot">.</span>{" "}
              <span className="footer-separator">/</span> Tim Funding
            </span>
            <span>Stok tertata. Pemberian tercatat.</span>
          </footer>
        </main>
      </div>
      {/* Navigasi bawah khusus tampilan HP; tombol tengah membuka panel scan cepat. */}
      <nav className="mobile-bottom-nav" aria-label="Navigasi utama mobile">
        <button
          aria-current={page === "dashboard" ? "page" : undefined}
          onClick={() => navigate("dashboard")}
        >
          <LayoutDashboard size={21} />
          <span>Beranda</span>
        </button>
        <button
          aria-current={page === "products" ? "page" : undefined}
          onClick={() => navigate("products")}
        >
          <Package size={21} />
          <span>Stok</span>
        </button>
        <button
          className="mobile-scan-button"
          aria-label="Scan QR"
          aria-current={page === "give" ? "page" : undefined}
          onClick={() => setQuickScan(true)}
        >
          <span className="mobile-scan-icon">
            <ScanLine size={27} />
          </span>
          <span>Scan QR</span>
        </button>
        <button
          aria-current={page === "history" ? "page" : undefined}
          onClick={() => navigate("history")}
        >
          <FileClock size={21} />
          <span>Riwayat</span>
        </button>
        <button
          aria-label="Menu lainnya"
          aria-expanded={mobileNav}
          onClick={() => setMobileNav(!mobileNav)}
        >
          <Menu size={21} />
          <span>Menu</span>
        </button>
      </nav>
      {/* Toast: notifikasi hasil aksi, otomatis disembunyikan oleh effect notice. */}
      {notice && (
        <div className="toast" role="status">
          <span>
            <Check size={16} />
          </span>
          {notice}
          <button onClick={() => setNotice("")} aria-label="Tutup notifikasi">
            <X size={15} />
          </button>
        </div>
      )}
      {/* Panel scan HP terpisah. Callback onRecord memakai jalur simpan bersama mutate. */}
      {quickScan && mobile && (
        <QuickScan
          products={snapshot.products}
          user={snapshot.user}
          onClose={() => setQuickScan(false)}
          onRecord={async (data) => {
            await mutate({ action: "movement", ...data });
            setNotice(
              data.kind === "in"
                ? "Barang masuk berhasil dicatat."
                : "Pemberian souvenir berhasil dicatat.",
            );
          }}
        />
      )}
      {/* 10. DIALOG UMUM: satu Modal dengan judul dan isi berdasarkan dialog.type. */}
      <Modal
        open={!!dialog}
        onClose={() => {
          if (!busy) setDialog(null);
        }}
        title={
          dialog?.type === "password" ? "Ubah password" : dialog?.type === "product"
            ? dialog.product
              ? "Edit barang"
              : "Tambah barang"
            : dialog?.type === "qr"
              ? "Label QR produk"
              : dialog?.type === "adjust"
                ? "Penyesuaian stok"
                : dialog?.type === "reversal"
                  ? "Batalkan pencatatan"
                  : dialog?.type === "member"
                    ? "Tambah anggota"
                    : dialog?.type === "member-status"
                      ? "Ubah status anggota"
                      : dialog?.type === "delete-product"
                        ? "Hapus produk"
                        : dialog?.product?.active
                          ? "Arsipkan produk"
                          : "Aktifkan produk"
        }
        description={
          dialog?.type === "password" ? "Sesi di perangkat lain akan diakhiri setelah password berubah." : dialog?.type === "qr"
            ? "Satu identitas tetap untuk setiap jenis souvenir."
            : dialog?.type === "delete-product"
              ? "Penghapusan permanen tidak dapat dibatalkan."
              : "Pastikan detail sudah sesuai sebelum menyimpan."
        }
      >
        {dialogError && (
          <p role="alert" className="inline-error dialog-error">
            {dialogError}
          </p>
        )}
        {/* Ternary memilih tampilan QR atau form pengelolaan, mirip v-if/v-else. */}
        {dialog?.type === "qr" ? (
          <div className="qr-dialog">
            <div
              className="product-flow-tabs qr-flow-tabs"
              role="group"
              aria-label="Tujuan QR"
            >
              <button
                type="button"
                aria-pressed={qrMode === "out"}
                onClick={() => setQrMode("out")}
              >
                <Gift size={15} />
                Berikan
              </button>
              <button
                type="button"
                aria-pressed={qrMode === "in"}
                onClick={() => setQrMode("in")}
              >
                <PackagePlus size={15} />
                Tambah stok
              </button>
            </div>
            <div className="print-label">
              {qr ? (
                <img
                  src={qr}
                  width={240}
                  height={240}
                  alt={`QR ${dialog.product!.name}`}
                />
              ) : (
                <p>Membuat QR…</p>
              )}
              <h3>{dialog.product!.name}</h3>
              <p>{dialog.product!.sku}</p>
              <span className="qr-destination">
                {qrMode === "in" ? "Tambah stok" : "Berikan souvenir"}
              </span>
              <small>SOUV · TIM FUNDING</small>
            </div>
            <p>Scan dari kamera HP untuk membuka form produk ini di website.</p>
            <label className="qr-link-field">
              Tautan produk
              <input
                aria-label="Tautan produk"
                readOnly
                value={qrLink}
                onFocus={(event) => event.currentTarget.select()}
              />
            </label>
            <div className="form-actions">
              <Button
                variant="outline"
                disabled={!qr}
                onClick={() => window.print()}
              >
                Cetak label
              </Button>
              <Button
                disabled={!qr}
                onClick={() => {
                  const a = document.createElement("a");
                  a.href = qr;
                  a.download = `QR-${dialog.product!.sku}.png`;
                  a.click();
                }}
              >
                <Download size={16} />
                Unduh PNG
              </Button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={submitDialog}
            onChange={() => {
              requestId.current = "";
            }}
            className="dialog-form"
          >
            {dialog?.type === "password" && <>
              <label>Password saat ini<input name="current_password" type="password" autoComplete="current-password" required maxLength={256} /></label>
              <label>Password baru<input name="new_password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} /></label>
              <label>Konfirmasi password baru<input name="confirm_password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} /></label>
            </>}
            {/* Form tambah/edit produk: identitas barang, batas stok, dan foto opsional. */}
            {dialog?.type === "product" && (
              <>
                <label>
                  Nama barang
                  <input
                    name="name"
                    defaultValue={dialog.product?.name}
                    required
                    maxLength={160}
                    placeholder="Contoh: Tumbler Stainless"
                  />
                </label>
                <div className="form-grid">
                  <label>
                    Kode produk
                    <input
                      name="sku"
                      defaultValue={dialog.product?.sku}
                      required
                      maxLength={40}
                      pattern="[A-Za-z0-9_-]+"
                      placeholder="TMB-001"
                    />
                  </label>
                  <label>
                    Kategori
                    <input
                      name="category"
                      aria-label="Kategori"
                      defaultValue={dialog.product?.category}
                      required
                      maxLength={60}
                      list="categories"
                      placeholder="Drinkware"
                    />
                    <datalist id="categories">
                      <option>Drinkware</option>
                      <option>Alat Tulis</option>
                      <option>Tas & Aksesori</option>
                    </datalist>
                  </label>
                </div>
                <div className="form-grid">
                  <label>
                    Satuan
                    <input
                      name="unit"
                      defaultValue={dialog.product?.unit || "pcs"}
                      required
                      maxLength={30}
                    />
                  </label>
                  <label>
                    Batas minimum stok
                    <input
                      name="minimum"
                      type="number"
                      min={0}
                      max={1000000}
                      step={1}
                      defaultValue={dialog.product?.minimum ?? 10}
                      required
                    />
                  </label>
                </div>
                <label>
                  Foto produk <span className="optional">opsional</span>
                  <input
                    name="photo"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                  />
                  <small>
                    JPG, PNG, atau WebP · maksimal 2 MB. Kosongkan untuk
                    mempertahankan foto.
                  </small>
                </label>
                <p className="form-info">
                  Barang baru dimulai dengan stok 0. Gunakan menu Barang masuk
                  untuk menambah persediaan.
                </p>
              </>
            )}
            {/* Koreksi admin: masukkan stok fisik dan alasan, bukan jumlah selisih. */}
            {dialog?.type === "adjust" && (
              <>
                <div className="chosen-product">
                  <ProductArt product={dialog.product!} />
                  <div>
                    <strong>{dialog.product!.name}</strong>
                    <small>
                      Stok sistem: {dialog.product!.stock}{" "}
                      {dialog.product!.unit}
                    </small>
                  </div>
                </div>
                <label>
                  Jumlah stok fisik saat ini
                  <input
                    name="quantity"
                    type="number"
                    min={0}
                    max={1000000}
                    step={1}
                    required
                  />
                </label>
                <label>
                  Alasan penyesuaian
                  <textarea
                    name="note"
                    placeholder="Contoh: 2 barang rusak saat pemeriksaan"
                    required
                    maxLength={500}
                  />
                </label>
              </>
            )}
            {/* Pembatalan admin: alasan wajib; backend membuat catatan pembalik. */}
            {dialog?.type === "reversal" && (
              <>
                <div className="confirmation-summary">
                  <strong>{dialog.movement!.product_name}</strong>
                  <p>
                    {kinds[dialog.movement!.kind]} ·{" "}
                    {Math.abs(dialog.movement!.quantity)} unit ·{" "}
                    {dialog.movement!.actor_name}
                  </p>
                </div>
                <p>
                  Efek pencatatan pada stok akan dikembalikan. Catatan asli
                  tetap tersimpan.
                </p>
                <label>
                  Alasan pembatalan
                  <textarea
                    name="note"
                    required
                    maxLength={500}
                    placeholder="Jelaskan kesalahan pencatatan…"
                  />
                </label>
              </>
            )}
            {/* Form akun baru untuk admin: nama, email, password awal, dan peran. */}
            {dialog?.type === "member" && (
              <>
                <label>
                  Nama lengkap
                  <input name="name" required maxLength={160} />
                </label>
                <label>
                  Email
                  <input name="email" type="email" required maxLength={254} />
                </label>
                <label>
                  Password awal
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={12}
                    maxLength={128}
                    autoComplete="new-password"
                  />
                  <small>
                    Minimal 12 karakter. Sampaikan langsung kepada pemilik akun.
                  </small>
                </label>
                <label>
                  Peran
                  <select name="role" defaultValue="member">
                    <option value="member">
                      Anggota — mencatat masuk dan pemberian
                    </option>
                    <option value="admin">
                      Admin — mengelola seluruh ruang kerja
                    </option>
                  </select>
                </label>
              </>
            )}
            {dialog?.type === "archive" && (
              <p>
                {dialog.product?.active
                  ? "Produk akan disembunyikan dari pilihan pemberian. Stok harus 0 sebelum diarsipkan; seluruh riwayat tetap tersimpan."
                  : "Produk akan tersedia kembali dalam daftar barang dan pencatatan."}
              </p>
            )}
            {dialog?.type === "delete-product" && (
              <>
                <p>Hapus <strong>{dialog.product?.name}</strong> ({dialog.product?.sku}) dari daftar souvenir?</p>
                <p>Produk hanya dapat dihapus jika stoknya 0 dan belum memiliki riwayat transaksi. Gunakan arsip untuk produk yang sudah memiliki riwayat.</p>
                {dialog.product!.stock !== 0 && (
                  <p role="alert" className="inline-error">Stok produk masih {number(dialog.product!.stock)} {dialog.product!.unit}. Stok harus 0 sebelum produk dihapus.</p>
                )}
              </>
            )}
            {dialog?.type === "member-status" && (
              <p>
                {dialog.active
                  ? "Anggota dapat kembali mengakses ruang kerja."
                  : "Anggota tidak dapat mengakses data atau mencatat pemberian. Riwayatnya tetap tersimpan."}
              </p>
            )}
            <div className="form-actions">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setDialog(null)}
              >
                Batal
              </Button>
              <Button
                type="submit"
                variant={dialog?.type === "delete-product" ? "danger" : "default"}
                disabled={busy || (dialog?.type === "delete-product" && dialog.product!.stock !== 0)}
              >
                {dialog?.type === "delete-product"
                  ? busy ? "Menghapus…" : "Hapus produk"
                  : busy ? "Menyimpan…" : "Konfirmasi & simpan"}
                {dialog?.type === "delete-product" ? <Trash2 size={16} /> : <Check size={16} />}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
