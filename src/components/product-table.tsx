"use client";
import {Package,QrCode,Edit3,SlidersHorizontal,Archive,Trash2} from "lucide-react";
import type { Product } from "@/lib/types";
import type { Dialog } from "./workspace-types";
import { ProductArt, StockBadge } from "./product-art";
import { Button } from "./ui/button";
export default function ProductTable({rows,dashboard=false,admin,onOpen}: {rows:Product[];dashboard?:boolean;admin:boolean;onOpen:(dialog:Dialog)=>void}) { return (
    <div className="table-scroll">
      <table className="product-table">
        <thead>
          <tr>
            <th>Nama barang</th>
            <th>Kategori</th>
            <th>Stok tersedia</th>
            <th>Status</th>
            <th className="align-right">{dashboard ? "QR" : "Tindakan"}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5}>
                <div className="empty-state">
                  <Package size={30} />
                  <h3>Belum ada barang di sini</h3>
                  <p>Coba ubah pencarian atau tambahkan produk baru.</p>
                </div>
              </td>
            </tr>
          ) : (
            rows.map((p) => (
              <tr key={p.id}>
                <td>
                  <div className="product-name">
                    <ProductArt product={p} />
                    <div>
                      <strong>{p.name}</strong>
                      <small>{p.sku}</small>
                    </div>
                  </div>
                </td>
                <td className="muted">{p.category}</td>
                <td>
                  <strong className="stock-number">{p.stock.toLocaleString("id-ID")}</strong>
                  <span className="unit">{p.unit}</span>
                </td>
                <td>
                  <StockBadge product={p} />
                </td>
                <td>
                  <div className="row-actions">
                    <Button
                      size="icon"
                      variant="ghost"
                      title={`QR ${p.name}`}
                      aria-label={`QR ${p.name}`}
                      onClick={() => onOpen({ type: "qr", product: p })}
                    >
                      <QrCode size={18} />
                    </Button>
                    {!dashboard && admin && (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Edit ${p.name}`}
                          title="Edit produk"
                          onClick={() =>
                            onOpen({ type: "product", product: p })
                          }
                        >
                          <Edit3 size={16} />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Sesuaikan ${p.name}`}
                          title="Penyesuaian stok"
                          disabled={!p.active}
                          onClick={() =>
                            onOpen({ type: "adjust", product: p })
                          }
                        >
                          <SlidersHorizontal size={16} />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`${p.active ? "Arsipkan" : "Aktifkan"} ${p.name}`}
                          title={p.active ? "Arsipkan" : "Aktifkan"}
                          onClick={() =>
                            onOpen({ type: "archive", product: p })
                          }
                        >
                          <Archive size={16} />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="product-delete"
                          aria-label={`Hapus ${p.name}`}
                          title="Hapus produk"
                          onClick={() => onOpen({ type: "delete-product", product: p })}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
