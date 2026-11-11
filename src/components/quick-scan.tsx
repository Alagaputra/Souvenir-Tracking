"use client";
import { useRef, useState, type FormEvent } from "react";
import { Check, ScanLine, ShieldCheck, Gift, PackagePlus } from "lucide-react";
import type { Product, Profile } from "@/lib/types";
import { parseProductQR, parseProductLink } from "@/lib/domain.mjs";
import Scanner from "./scanner";
import { Modal } from "./ui/dialog";
import { Button } from "./ui/button";
import QuantityStepper from "./quantity-stepper";
export default function QuickScan({
  products,
  user,
  onClose,
  onRecord,
}: {
  products: Product[];
  user: Profile;
  onClose: () => void;
  onRecord: (data: {
    kind: "in" | "out";
    product_id: string;
    recipient: string;
    quantity: number;
    request_id: string;
  }) => Promise<void>;
}) {
  const [product, setProduct] = useState<Product | null>(null);
  const [mode, setMode] = useState<"in" | "out">("out");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const requestId = useRef("");
  function select(id: string, selectedMode: "in" | "out" = "out") {
    const match = products.find((p) => p.id === id && p.active);
    if (!match)
      throw new Error("Produk tidak ditemukan atau sudah diarsipkan.");
    setProduct(match);
    setMode(selectedMode);
    setError("");
    requestId.current = "";
  }
  function scan(text: string) {
    try {
      const id = parseProductQR(text);
      const mode = /^SOUVENIR:/i.test(text.trim())
        ? "out"
        : parseProductLink(text).mode;
      select(id, mode === "in" ? "in" : "out");
    } catch (err) {
      setError((err as Error).message);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!product || busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    requestId.current ||= crypto.randomUUID();
    try {
      await onRecord({
        kind: mode,
        product_id: product.id,
        recipient: String(form.get("recipient") || ""),
        quantity: Number(form.get("quantity")),
        request_id: requestId.current,
      });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onClose={() => {
        if (!busy) onClose();
      }}
      title={
        product
          ? mode === "in"
            ? "Tambah stok"
            : "Berikan souvenir"
          : "Scan QR"
      }
      description={
        product
          ? mode === "in"
            ? "Isi jumlah barang yang masuk."
            : "Isi jumlah dan nama penerima."
          : "Arahkan kamera ke label barang."
      }
    >
      {error && (
        <p className="inline-error dialog-error" role="alert">
          {error}
        </p>
      )}
      {!product ? (
        <>
          <Scanner autoStart onScan={scan} />
          <details className="quick-manual">
            <summary>QR tidak bisa dipindai? Pilih barang manual</summary>
            <label>
              Atau pilih barang secara manual
              <select
                defaultValue=""
                onChange={(e) => {
                  try {
                    select(e.target.value);
                  } catch (err) {
                    setError((err as Error).message);
                  }
                }}
              >
                <option value="" disabled>
                  Pilih barang…
                </option>
                {products
                  .filter((p) => p.active)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · stok {p.stock}
                    </option>
                  ))}
              </select>
            </label>
          </details>
        </>
      ) : (
        <form
          className="dialog-form quick-give-form"
          onSubmit={submit}
          onChange={() => {
            requestId.current = "";
          }}
        >
          <div className="quick-product">
            <div>
              <strong>{product.name}</strong>
              <small>{product.sku}</small>
            </div>
            <span>
              {product.stock} {product.unit} tersedia
            </span>
          </div>
          <div className="detected-product-note">
            <span>
              <Check size={14} />
              Barang sudah terpilih
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setProduct(null);
                setError("");
                requestId.current = "";
              }}
            >
              <ScanLine size={14} />
              Scan barang lain
            </Button>
          </div>
          <div
            className="product-flow-tabs qr-flow-tabs"
            role="group"
            aria-label="Pilih tindakan stok"
          >
            <button
              type="button"
              aria-pressed={mode === "out"}
              disabled={busy}
              onClick={() => {
                setMode("out");
                requestId.current = "";
                setError("");
              }}
            >
              <Gift size={15} />
              Berikan
            </button>
            <button
              type="button"
              aria-pressed={mode === "in"}
              disabled={busy}
              onClick={() => {
                setMode("in");
                requestId.current = "";
                setError("");
              }}
            >
              <PackagePlus size={15} />
              Tambah stok
            </button>
          </div>
          {mode === "out" && (
            <label>
              Nama nasabah
              <input
                name="recipient"
                autoFocus
                required
                maxLength={160}
                autoComplete="off"
                placeholder="Nama penerima souvenir"
              />
            </label>
          )}
          <div className="form-grid">
            <QuantityStepper
              key={mode}
              max={mode === "in" ? 1000000 : product.stock}
              label={mode === "in" ? "Jumlah masuk" : "Jumlah diberikan"}
              disabled={busy}
              onChange={() => {
                requestId.current = "";
              }}
            />
            <div className="automatic-giver">
              <span>
                {mode === "in" ? "Petugas" : "Pemberi"} · otomatis dari akun
              </span>
              <strong>
                <ShieldCheck size={16} />
                {user.name}
              </strong>
            </div>
          </div>
          {mode === "out" && product.stock === 0 && (
            <p className="inline-error">Stok barang ini habis.</p>
          )}
          <Button
            type="submit"
            disabled={busy || (mode === "out" && product.stock === 0)}
          >
            {busy
              ? "Menyimpan…"
              : mode === "in"
                ? "Simpan barang masuk"
                : "Konfirmasi pemberian"}
            <Check size={16} />
          </Button>
        </form>
      )}
    </Modal>
  );
}
