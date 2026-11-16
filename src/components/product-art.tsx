import {Coffee,BookOpen,Umbrella,PenLine,KeyRound,ShoppingBag} from "lucide-react";
import type { Product } from "@/lib/types";
export function ProductArt({
  product,
  small = false,
}: {
  product: Product;
  small?: boolean;
}) {
  const Icon =
    product.sku.startsWith("TMB") || product.sku.startsWith("MUG")
      ? Coffee
      : product.sku.startsWith("NTB")
        ? BookOpen
        : product.sku.startsWith("UMB")
          ? Umbrella
          : product.sku.startsWith("PEN")
            ? PenLine
            : product.sku.startsWith("KEY")
              ? KeyRound
              : ShoppingBag;
  return (
    <span
      className={`product-art ${small ? "art-small" : ""} art-${product.category === "Drinkware" ? "blue" : product.category === "Alat Tulis" ? "sand" : "sage"}`}
    >
      {product.photo ? (
        <img src={product.photo} alt="" />
      ) : (
        <Icon size={small ? 21 : 27} strokeWidth={1.35} />
      )}
    </span>
  );
}
// Komponen lokal: label stok tersedia/menipis/habis atau produk diarsipkan.
export function StockBadge({ product }: { product: Product }) {
  const status = !product.active
    ? "archived"
    : product.stock === 0
      ? "empty"
      : product.stock <= product.minimum
        ? "low"
        : "good";
  return (
    <span className={`status status-${status}`}>
      <i />
      {status === "archived"
        ? "Diarsipkan"
        : status === "empty"
          ? "Stok habis"
          : status === "low"
            ? "Stok menipis"
            : "Tersedia"}
    </span>
  );
}
