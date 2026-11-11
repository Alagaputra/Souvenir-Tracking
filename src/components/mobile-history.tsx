"use client";

import {
  ArrowDownLeft,
  ArrowUpRight,
  FileClock,
  RefreshCw,
} from "lucide-react";
import type { Movement } from "@/lib/types";
import { Button } from "./ui/button";

const kinds = {
  in: "Barang masuk",
  out: "Pemberian",
  adjust: "Penyesuaian",
  reversal: "Pembatalan",
};
const time = (value: string) =>
  new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));

export default function MobileHistory({
  rows,
  admin,
  reversed,
  onCancel,
}: {
  rows: Movement[];
  admin: boolean;
  reversed: ReadonlySet<string | null>;
  onCancel: (movement: Movement) => void;
}) {
  if (!rows.length)
    return (
      <div className="mobile-history">
        <div className="empty-state">
          <FileClock size={28} />
          <h3>Belum ada aktivitas</h3>
          <p>Pencatatan yang sesuai akan muncul di sini.</p>
        </div>
      </div>
    );

  return (
    <ol className="mobile-history" aria-label="Daftar riwayat">
      {rows.map((m) => (
        <li key={m.id}>
          <article className="history-item">
            <header className="history-item-heading">
              <span className={`activity-icon ${m.kind}`} aria-hidden="true">
                {m.kind === "in" ? (
                  <ArrowDownLeft size={18} />
                ) : m.kind === "out" ? (
                  <ArrowUpRight size={18} />
                ) : (
                  <RefreshCw size={17} />
                )}
              </span>
              <div className="history-item-title">
                <h3>{m.product_name}</h3>
                <p>
                  {kinds[m.kind]}
                  {reversed.has(m.id) && (
                    <span className="history-cancelled"> · Dibatalkan</span>
                  )}
                </p>
              </div>
              <div className="history-item-quantity">
                <strong className={m.quantity > 0 ? "positive" : "negative"}>
                  {m.quantity > 0 ? "+" : ""}
                  {m.quantity.toLocaleString("id-ID")}
                </strong>
                <small>unit</small>
              </div>
            </header>
            <dl className="history-item-details">
              {(m.recipient || m.kind === "out") && (
                <div>
                  <dt>Nasabah</dt>
                  <dd>{m.recipient || "—"}</dd>
                </div>
              )}
              <div>
                <dt>Petugas</dt>
                <dd>{m.actor_name}</dd>
              </div>
              {m.note && (
                <div className="history-item-note">
                  <dt>Catatan</dt>
                  <dd>{m.note}</dd>
                </div>
              )}
            </dl>
            <footer className="history-item-footer">
              <time dateTime={m.created_at}>{time(m.created_at)} WIB</time>
              {admin && m.kind !== "reversal" && !reversed.has(m.id) && (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Batalkan ${m.product_name}`}
                  onClick={() => onCancel(m)}
                >
                  Batalkan
                </Button>
              )}
            </footer>
          </article>
        </li>
      ))}
    </ol>
  );
}
