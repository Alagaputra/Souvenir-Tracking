"use client";
import { ArrowDownLeft, ArrowUpRight, RefreshCw, FileClock } from "lucide-react";
import type { Movement } from "@/lib/types";
import { Button } from "./ui/button";
const dateTime = (value: string) =>
  new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
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

export default function HistoryTable({ rows, compact = false, admin, reversed, onCancel }: { rows: Movement[]; compact?: boolean; admin: boolean; reversed: ReadonlySet<string | null>; onCancel: (movement: Movement) => void }) { return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Aktivitas / barang</th>
            <th>{compact ? "Petugas" : "Pemberi / petugas"}</th>
            {!compact && <th>Nasabah / catatan</th>}
            <th>Jumlah</th>
            <th>Waktu (WIB)</th>
            {!compact && admin && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6}>
                <div className="empty-state">
                  <FileClock size={28} />
                  <h3>Belum ada aktivitas</h3>
                  <p>Pencatatan yang sesuai akan muncul di sini.</p>
                </div>
              </td>
            </tr>
          ) : (
            rows.map((m) => (
              <tr key={m.id}>
                <td>
                  <div className="activity-cell">
                    <span className={`activity-icon ${m.kind}`}>
                      {m.kind === "in" ? (
                        <ArrowDownLeft size={17} />
                      ) : m.kind === "out" ? (
                        <ArrowUpRight size={17} />
                      ) : (
                        <RefreshCw size={16} />
                      )}
                    </span>
                    <div>
                      <strong>{m.product_name}</strong>
                      <small>
                        {kinds[m.kind]}
                        {reversed.has(m.id) ? " · Dibatalkan" : ""}
                      </small>
                    </div>
                  </div>
                </td>
                <td>
                  <div className="person-cell">
                    <span className="mini-avatar">
                      {initials(m.actor_name)}
                    </span>
                    {m.actor_name}
                  </div>
                </td>
                {!compact && (
                  <td>
                    <span>{m.recipient || "—"}</span>
                    {m.note && <small className="cell-note">{m.note}</small>}
                  </td>
                )}
                <td>
                  <strong className={m.quantity > 0 ? "positive" : "negative"}>
                    {m.quantity > 0 ? "+" : ""}
                    {m.quantity}
                  </strong>
                </td>
                <td className="time-cell">{dateTime(m.created_at)}</td>
                {!compact && admin && (
                  <td>
                    {m.kind !== "reversal" && !reversed.has(m.id) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          onCancel(m)
                        }
                      >
                        Batalkan
                      </Button>
                    )}
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
