"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { isoToday } from "@/lib/format";
import { useRole } from "@/lib/useRole";
import DatePickerIT from "@/components/ui/DatePickerIT";

interface LogRow {
  id: string;
  user_id: string;
  user_name: string;
  action: string;
  module: string;
  description: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

const ACTION_COLORS: Record<string, string> = {
  login: "#4F7B8C", logout: "#6C6B5D", create: "#2D5A3D", update: "#BFA762",
  delete: "#9E3B2E", view: "#6C6B5D", export: "#7A5FA0", print: "#7A5FA0",
};
const MODULE_COLORS: Record<string, string> = {
  cassa: "#BFA762", magazzino: "#8B6914", inventario: "#6B8E6B", housekeeping: "#2D5A3D",
  turni: "#4F7B8C", spese: "#9E3B2E", documenti: "#6C6B5D", utenze: "#C77B4A",
  staff: "#4F7B8C", account: "#7A5FA0", auth: "#1F3326",
};

export default function AttivitaPage() {
  const supabase = createClient();
  const { isAdmin, loading: roleLoading } = useRole();

  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 20;

  // Filters
  const [search, setSearch] = useState("");
  const [filterUser, setFilterUser] = useState("");
  const [filterModule, setFilterModule] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);

  const loadLogs = useCallback(async () => {
    let q = supabase
      .from("activity_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (filterUser) q = q.eq("user_id", filterUser);
    if (filterModule) q = q.eq("module", filterModule);
    if (filterAction) q = q.eq("action", filterAction);
    if (filterFrom) q = q.gte("created_at", filterFrom + "T00:00:00");
    if (filterTo) q = q.lte("created_at", filterTo + "T23:59:59");

    const { data } = await q;
    let rows = (data ?? []) as LogRow[];
    if (search) {
      const s = search.toLowerCase();
      rows = rows.filter(r => r.description.toLowerCase().includes(s) || r.user_name.toLowerCase().includes(s));
    }
    setLogs(rows);
    setPage(1);
    setLoading(false);
  }, [filterUser, filterModule, filterAction, filterFrom, filterTo, search]); // eslint-disable-line

  useEffect(() => {
    if (!isAdmin && !roleLoading) return;
    loadLogs();
    supabase.from("profiles").select("id, full_name").order("full_name").then(({ data }) => {
      setUsers((data ?? []).map((p: { id: string; full_name: string | null }) => ({ id: p.id, name: p.full_name || "?" })));
    });
  }, [isAdmin, roleLoading]); // eslint-disable-line

  // Auto-refresh every 30s
  useEffect(() => {
    if (!isAdmin) return;
    const iv = setInterval(loadLogs, 30000);
    return () => clearInterval(iv);
  }, [isAdmin, loadLogs]);

  // Re-fetch when filters change
  useEffect(() => { if (isAdmin) loadLogs(); }, [filterUser, filterModule, filterAction, filterFrom, filterTo, search]); // eslint-disable-line

  function exportCSV() {
    const header = "Data,Utente,Azione,Modulo,Descrizione\n";
    const rows = logs.map(l =>
      `"${fmtTs(l.created_at)}","${l.user_name}","${l.action}","${l.module}","${l.description.replace(/"/g, '""')}"`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `attivita_${isoToday()}.csv`;
    a.click();
  }

  function fmtTs(ts: string) {
    const d = new Date(ts);
    return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  if (roleLoading || loading) return <div className="empty">Caricamento...</div>;
  if (!isAdmin) return <div className="empty"><div className="serif" style={{ fontSize: 22 }}>Accesso negato</div></div>;

  const MODULES = ["cassa", "magazzino", "inventario", "housekeeping", "turni", "spese", "documenti", "utenze", "staff", "account", "auth"];
  const ACTIONS = ["login", "logout", "create", "update", "delete", "view", "export", "print"];

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h1 className="serif" style={{ fontSize: 24, fontWeight: 500 }}>Registro attivit&agrave;</h1>
        <button className="btn btn-primary" onClick={exportCSV} style={{ fontSize: 13 }}>Esporta CSV</button>
      </div>

      {/* Filters */}
      <div className="attivita-filters" style={{
        display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20, padding: "14px 18px",
        background: "#FFFFFF", borderRadius: 12, border: "1px solid #D8CCB8",
      }}>
        <input placeholder="Cerca..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: "1 1 180px", minWidth: 140, padding: "8px 12px", borderRadius: 8, border: "1px solid #D8CCB8", fontSize: 14 }} />
        <div className="attivita-selects" style={{ display: "contents" }}>
          <select value={filterUser} onChange={e => setFilterUser(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #D8CCB8", fontSize: 13 }}>
            <option value="">Tutti gli utenti</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <select value={filterModule} onChange={e => setFilterModule(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #D8CCB8", fontSize: 13 }}>
            <option value="">Tutti i moduli</option>
            {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={filterAction} onChange={e => setFilterAction(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #D8CCB8", fontSize: 13 }}>
            <option value="">Tutte le azioni</option>
            {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="attivita-date-row">
          <span className="date-label">Da</span>
          <DatePickerIT value={filterFrom} onChange={v => setFilterFrom(v)} />
        </div>
        <div className="attivita-date-row">
          <span className="date-label">A</span>
          <DatePickerIT value={filterTo} onChange={v => setFilterTo(v)} />
        </div>
        {(search || filterUser || filterModule || filterAction || filterFrom || filterTo) && (
          <button className="btn-ghost" style={{ fontSize: 12, padding: "8px 12px", borderRadius: 8 }}
            onClick={() => { setSearch(""); setFilterUser(""); setFilterModule(""); setFilterAction(""); setFilterFrom(""); setFilterTo(""); }}>
            Azzera filtri
          </button>
        )}
      </div>

      {/* Activity stream */}
      {(() => {
        const totalPages = Math.max(1, Math.ceil(logs.length / ITEMS_PER_PAGE));
        const safePage = Math.min(page, totalPages);
        const paginatedLogs = logs.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);
        return (
          <div className="section">
            <div className="section-head">
              <h2>{logs.length} attivit&agrave;</h2>
              <span className="muted" style={{ fontSize: 12 }}>Auto-refresh ogni 30s</span>
            </div>
            <div className="section-body" style={{ padding: 0 }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: 130 }}>Data</th>
                    <th>Utente</th>
                    <th style={{ width: 90 }}>Azione</th>
                    <th style={{ width: 110 }}>Modulo</th>
                    <th>Descrizione</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedLogs.map(l => (
                    <tr key={l.id} onClick={() => setExpanded(expanded === l.id ? null : l.id)} style={{ cursor: l.details ? "pointer" : undefined }}>
                      <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>{fmtTs(l.created_at)}</td>
                      <td style={{ fontWeight: 600, fontSize: 13 }}>{l.user_name}</td>
                      <td>
                        <span style={{
                          display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                          background: (ACTION_COLORS[l.action] ?? "#6C6B5D") + "18", color: ACTION_COLORS[l.action] ?? "#6C6B5D",
                        }}>{l.action}</span>
                      </td>
                      <td>
                        <span style={{
                          display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                          background: (MODULE_COLORS[l.module] ?? "#6C6B5D") + "18", color: MODULE_COLORS[l.module] ?? "#6C6B5D",
                        }}>{l.module}</span>
                      </td>
                      <td>
                        <div style={{ fontSize: 13 }}>{l.description}</div>
                        {expanded === l.id && l.details && (
                          <pre style={{ fontSize: 11, color: "#6C6B5D", marginTop: 6, background: "#F3EBDD", padding: 10, borderRadius: 6, whiteSpace: "pre-wrap" }}>
                            {JSON.stringify(l.details, null, 2)}
                          </pre>
                        )}
                      </td>
                    </tr>
                  ))}
                  {logs.length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign: "center", padding: 40 }} className="muted">Nessuna attivit&agrave; registrata</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="pagination">
                <button disabled={safePage <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>← Precedente</button>
                <span className="page-info">Pagina {safePage} di {totalPages}</span>
                <button disabled={safePage >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Successiva →</button>
              </div>
            )}
          </div>
        );
      })()}
    </>
  );
}
