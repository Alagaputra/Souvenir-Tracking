"use client";
import { useEffect, useState } from "react";
import type { Movement, Snapshot } from "./types";
import { inDateRange } from "./domain.mjs";

const emptyFilters = { search: "", from: "", to: "", kind: "", product: "", actor: "" };
type Filters = typeof emptyFilters;
type Result = { key: string; snapshot: Snapshot; movements: Movement[]; total: number; error: string };
const pageSize = 25;

export function useHistory(snapshot: Snapshot | null, active: boolean) {
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Result | null>(null);
  const [attempt, setAttempt] = useState(0);
  const params = new URLSearchParams({ ...filters, page: String(page), pageSize: String(pageSize) });
  const key = params.toString();
  const current = result?.key === key && result.snapshot === snapshot;
  const demoRows = snapshot?.demo ? snapshot.movements.filter(m =>
    (snapshot.user.role === "admin" || m.actor_id === snapshot.user.id) &&
    inDateRange(m.created_at, filters.from, filters.to) &&
    (!filters.kind || m.kind === filters.kind) && (!filters.product || m.product_id === filters.product) &&
    (!filters.actor || m.actor_id === filters.actor) &&
    `${m.product_name} ${m.recipient} ${m.actor_name}`.toLowerCase().includes(filters.search.trim().toLowerCase())) : [];

  useEffect(() => {
    if (!active || !snapshot || snapshot.demo) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/history?${key}`, { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Riwayat tidak dapat dimuat.");
        if (!controller.signal.aborted) setResult({ key, snapshot, movements: data.movements, total: data.total, error: "" });
      } catch (error) {
        if (!controller.signal.aborted) setResult({ key, snapshot, movements: [], total: 0,
          error: error instanceof Error ? error.message : "Riwayat tidak dapat dimuat." });
      }
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [active, snapshot, key, attempt]);

  function setFilter(name: keyof Filters, value: string) {
    setFilters(previous => ({ ...previous, [name]: value })); setPage(1);
  }
  function reset() { setFilters(emptyFilters); setPage(1); }
  async function exportAll(): Promise<Movement[]> {
    if (snapshot?.demo) return demoRows;
    const response = await fetch(`/api/history?${new URLSearchParams({ ...filters, export: "1" })}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Riwayat tidak dapat diekspor.");
    return data.movements;
  }
  return { filters, setFilter, reset, page, setPage, pageSize, exportAll,
    rows: snapshot?.demo ? demoRows.slice((page - 1) * pageSize, page * pageSize) : current ? result.movements : [],
    total: snapshot?.demo ? demoRows.length : current ? result.total : 0,
    loading: active && !!snapshot && !snapshot.demo && !current,
    error: current ? result.error : "",
    retry: () => { setResult(null); setAttempt(previous => previous + 1); },
  };
}
