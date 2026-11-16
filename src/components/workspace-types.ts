import type { Product, Movement } from "@/lib/types";
export type Page =
  "dashboard" | "products" | "incoming" | "give" | "history" | "members";
// Dialog menyimpan jenis popup dan data produk/transaksi/anggota yang sedang dibuka.
export type Dialog = {
  type:
  | "product"
  | "qr"
  | "adjust"
  | "reversal"
  | "member"
  | "archive"
  | "delete-product"
  | "member-status"
    | "password"
  product?: Product;
  movement?: Movement;
  memberId?: string;
  active?: boolean;
} | null;
