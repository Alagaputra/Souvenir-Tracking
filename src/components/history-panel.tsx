"use client";
import { Search, SlidersHorizontal } from "lucide-react";
import { useRef, useState } from "react";
import type { Movement, Snapshot } from "@/lib/types";
import type { useHistory } from "@/lib/use-history";
import { Button } from "./ui/button";
import HistoryTable from "./history-table";
import MobileHistory from "./mobile-history";

const kinds = { in: "Barang masuk", out: "Pemberian", adjust: "Penyesuaian", reversal: "Pembatalan" };
export default function HistoryPanel({ snapshot, history, onCancel }: {
  snapshot: Snapshot; history: ReturnType<typeof useHistory>; onCancel: (movement: Movement) => void;
}) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const admin = snapshot.user.role === "admin";
  const { filters, setFilter, rows, total, page, pageSize, loading, error } = history;
  const reversed = new Set(rows.filter(m => m.cancelled).map(m => m.id));
  function turnPage(next: number) {
    history.setPage(next);
    panel.current?.scrollIntoView({ block: "start" });
  }
  return <section ref={panel} className="panel history-panel" aria-busy={loading}>
    <div className="history-controls">
      <div className="history-search-bar">
        <div className="search-field"><Search size={17} /><input aria-label="Cari riwayat" placeholder="Cari barang, nasabah, atau petugas…"
          maxLength={160} value={filters.search} onChange={e => setFilter("search", e.target.value)} /></div>
        <Button className="history-filter-toggle" variant="outline" aria-expanded={open} aria-controls="history-filter-panel" onClick={() => setOpen(!open)}>
          <SlidersHorizontal size={16} />Filter</Button>
      </div>
      <div id="history-filter-panel" className={`history-filter-panel ${open ? "filters-open" : ""}`}>
        <div className="history-date-filters">
          <label className="date-filter">Dari<input aria-label="Dari tanggal" type="date" value={filters.from} onChange={e => setFilter("from", e.target.value)} /></label>
          <label className="date-filter">Sampai<input aria-label="Sampai tanggal" type="date" min={filters.from} value={filters.to} onChange={e => setFilter("to", e.target.value)} /></label>
        </div>
        <div className="history-selects">
          <select aria-label="Jenis aktivitas" value={filters.kind} onChange={e => setFilter("kind", e.target.value)}>
            <option value="">Semua aktivitas</option>{Object.entries(kinds).map(([key, name]) => <option value={key} key={key}>{name}</option>)}
          </select>
          <select aria-label="Filter barang" value={filters.product} onChange={e => setFilter("product", e.target.value)}>
            <option value="">Semua barang</option>{snapshot.products.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}
          </select>
          {admin && <select aria-label="Filter petugas" value={filters.actor} onChange={e => setFilter("actor", e.target.value)}>
            <option value="">Semua petugas</option>{snapshot.members.map(m => <option value={m.id} key={m.id}>{m.name}</option>)}
          </select>}
          <Button variant="ghost" size="sm" onClick={history.reset}>Reset filter</Button>
        </div>
      </div>
    </div>
    {loading ? <p role="status" className="empty-state">Memuat riwayat…</p> : error ?
      <div className="empty-state"><p role="alert">{error}</p><Button onClick={history.retry}>Coba lagi</Button></div> : <>
        <div className="desktop-history"><HistoryTable rows={rows} admin={admin} reversed={reversed} onCancel={onCancel} /></div>
        <MobileHistory rows={rows} admin={admin} reversed={reversed} onCancel={onCancel} />
      </>}
    <div className="table-footer">
      <span aria-live="polite">{total.toLocaleString("id-ID")} catatan cocok · halaman {page} dari {Math.max(1, Math.ceil(total / pageSize))}</span>
      <nav className="history-pagination" aria-label="Halaman riwayat">
        <Button variant="ghost" size="sm" disabled={loading || page <= 1} onClick={() => turnPage(page - 1)}>Sebelumnya</Button>
        <Button variant="ghost" size="sm" disabled={loading || page * pageSize >= total} onClick={() => turnPage(page + 1)}>Berikutnya</Button>
      </nav>
    </div>
  </section>;
}
