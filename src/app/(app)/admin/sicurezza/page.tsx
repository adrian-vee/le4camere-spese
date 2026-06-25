"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { useRole } from "@/lib/useRole";

/* ── Types ── */
interface LoginRow { id: string; user_name: string; created_at: string; action: string; details: Record<string, unknown> | null }
interface AnomalyRow { id: string; user_name: string; created_at: string; module: string; description: string; type: string }
interface ProfileRow { id: string; full_name: string }

/* ── Constants ── */
const PAGE_SIZE = 10;

const ROLE_MATRIX = [
  { page: "Dashboard", admin: true, manager: true, staff: true },
  { page: "Cassa", admin: true, manager: true, staff: true },
  { page: "Turni", admin: true, manager: true, staff: "Propri" },
  { page: "Magazzino", admin: true, manager: true, staff: "Solo scarico" },
  { page: "Spese", admin: true, manager: true, staff: false },
  { page: "Nuova spesa", admin: true, manager: true, staff: false },
  { page: "Inventario", admin: true, manager: true, staff: false },
  { page: "Utenze", admin: true, manager: true, staff: false },
  { page: "Documenti", admin: true, manager: true, staff: false },
  { page: "Personale", admin: true, manager: true, staff: false },
  { page: "Gestione account", admin: true, manager: false, staff: false },
  { page: "Admin Panel", admin: true, manager: false, staff: false },
];

/* ── SVG icons ── */
const iconLogin = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4F7B8C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
  </svg>
);
const iconUsers = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2D5A3D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
  </svg>
);
const iconAlert = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9E3B2E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);
const iconRole = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#BFA762" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);

/* ── Helpers ── */
function fmtTs(ts: string) {
  const d = new Date(ts);
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function renderPerm(v: boolean | string) {
  if (v === true) return <span style={{ color: "#2d6a4f", fontWeight: 700, fontSize: 15 }}>&#10003;</span>;
  if (v === false) return <span style={{ color: "#C4453C", fontWeight: 700, fontSize: 14 }}>&#10007;</span>;
  return <span style={{ fontSize: 11, color: "#BFA762", fontWeight: 600 }}>{v}</span>;
}

function formatRoleChangeDetails(details: Record<string, unknown> | null, profileMap: Map<string, string>): string {
  if (!details) return "---";
  const targetId = details.targetId as string | undefined;
  const targetName = targetId ? (profileMap.get(targetId) ?? targetId.slice(0, 8) + "...") : "---";
  const oldRole = details.oldRole as string | undefined;
  const newRole = details.newRole as string | undefined;
  if (oldRole && newRole) {
    return `Ruolo modificato per ${targetName}: ${oldRole} -> ${newRole}`;
  }
  // Fallback: try to build something readable
  const desc = details.description as string | undefined;
  if (desc) return desc;
  return `Modifica account: ${targetName}`;
}

/* ── Pagination component ── */
function Pagination({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="sec-pagination">
      <button disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="sec-pag-btn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        Precedente
      </button>
      <span className="sec-pag-info">Pagina {page} di {totalPages}</span>
      <button disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} className="sec-pag-btn">
        Successivo
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </div>
  );
}

/* ── Main page ── */
export default function SicurezzaPage() {
  const supabase = createClient();
  const router = useRouter();
  const { isAdmin, loading: roleLoading } = useRole();

  const [loading, setLoading] = useState(true);
  const [logins, setLogins] = useState<LoginRow[]>([]);
  const [roleChanges, setRoleChanges] = useState<LoginRow[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyRow[]>([]);
  const [profileMap, setProfileMap] = useState<Map<string, string>>(new Map());

  // KPI
  const [loginsToday, setLoginsToday] = useState(0);
  const [activeUsers7d, setActiveUsers7d] = useState(0);

  // Filters & pagination
  const [loginPage, setLoginPage] = useState(1);
  const [loginFilterUser, setLoginFilterUser] = useState("");
  const [loginFilterAction, setLoginFilterAction] = useState("");

  const [anomalyPage, setAnomalyPage] = useState(1);
  const [anomalyFilterType, setAnomalyFilterType] = useState("");
  const [anomalyFilterModule, setAnomalyFilterModule] = useState("");

  useEffect(() => {
    if (!roleLoading && !isAdmin) router.replace("/");
  }, [roleLoading, isAdmin, router]);

  const loadData = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

    const [
      { data: loginData },
      { data: roleChangeData },
      { data: deleteData },
      { data: offHoursCashData },
      { data: profileData },
      { data: todayLogins },
      { data: recentLogins },
    ] = await Promise.all([
      supabase.from("activity_log").select("id, user_name, created_at, action, details")
        .in("action", ["login", "logout"])
        .order("created_at", { ascending: false }).limit(200),
      supabase.from("activity_log").select("id, user_name, created_at, action, details")
        .eq("module", "account").eq("action", "update")
        .order("created_at", { ascending: false }).limit(50),
      supabase.from("activity_log").select("id, user_name, created_at, module, description")
        .eq("action", "delete")
        .order("created_at", { ascending: false }).limit(50),
      supabase.from("activity_log").select("id, user_name, created_at, module, description")
        .eq("module", "cassa")
        .order("created_at", { ascending: false }).limit(100),
      supabase.from("profiles").select("id, full_name"),
      supabase.from("activity_log").select("id", { count: "exact", head: true })
        .eq("action", "login").gte("created_at", `${today}T00:00:00`),
      supabase.from("activity_log").select("user_name")
        .eq("action", "login").gte("created_at", weekAgo),
    ]);

    setLogins((loginData ?? []) as LoginRow[]);
    setRoleChanges((roleChangeData ?? []) as LoginRow[]);

    // Profiles map for resolving IDs
    const pMap = new Map<string, string>();
    for (const p of (profileData ?? []) as ProfileRow[]) {
      pMap.set(p.id, p.full_name);
    }
    setProfileMap(pMap);

    // KPI
    setLoginsToday(todayLogins?.length ?? 0);
    const uniqueUsers = new Set((recentLogins ?? []).map((r: { user_name: string }) => r.user_name));
    setActiveUsers7d(uniqueUsers.size);

    // Anomalies
    const anoms: AnomalyRow[] = [];
    for (const d of (deleteData ?? []) as { id: string; user_name: string; created_at: string; module: string; description: string }[]) {
      anoms.push({ ...d, type: "Eliminazione" });
    }
    for (const c of (offHoursCashData ?? []) as { id: string; user_name: string; created_at: string; module: string; description: string }[]) {
      const hour = new Date(c.created_at).getHours();
      if (hour < 6) anoms.push({ ...c, type: "Fuori orario" });
    }
    anoms.sort((a, b) => b.created_at.localeCompare(a.created_at));
    setAnomalies(anoms);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    if (!isAdmin || roleLoading) return;
    loadData();
  }, [isAdmin, roleLoading, loadData]);

  /* ── Filtered + paginated logins ── */
  const filteredLogins = useMemo(() => {
    let list = logins;
    if (loginFilterUser) list = list.filter(l => l.user_name === loginFilterUser);
    if (loginFilterAction) list = list.filter(l => l.action === loginFilterAction);
    return list;
  }, [logins, loginFilterUser, loginFilterAction]);

  const loginTotalPages = Math.max(1, Math.ceil(filteredLogins.length / PAGE_SIZE));
  const loginPageData = filteredLogins.slice((loginPage - 1) * PAGE_SIZE, loginPage * PAGE_SIZE);
  const loginUsers = useMemo(() => [...new Set(logins.map(l => l.user_name))].sort(), [logins]);

  /* ── Filtered + paginated anomalies ── */
  const filteredAnomalies = useMemo(() => {
    let list = anomalies;
    if (anomalyFilterType) list = list.filter(a => a.type === anomalyFilterType);
    if (anomalyFilterModule) list = list.filter(a => a.module === anomalyFilterModule);
    return list;
  }, [anomalies, anomalyFilterType, anomalyFilterModule]);

  const anomalyTotalPages = Math.max(1, Math.ceil(filteredAnomalies.length / PAGE_SIZE));
  const anomalyPageData = filteredAnomalies.slice((anomalyPage - 1) * PAGE_SIZE, anomalyPage * PAGE_SIZE);
  const anomalyTypes = useMemo(() => [...new Set(anomalies.map(a => a.type))].sort(), [anomalies]);
  const anomalyModules = useMemo(() => [...new Set(anomalies.map(a => a.module))].sort(), [anomalies]);

  // Reset page on filter change
  useEffect(() => { setLoginPage(1); }, [loginFilterUser, loginFilterAction]);
  useEffect(() => { setAnomalyPage(1); }, [anomalyFilterType, anomalyFilterModule]);

  if (roleLoading || loading || !isAdmin) {
    return <div style={{ padding: 40, textAlign: "center", color: "#6C6B5D", fontFamily: "'Albert Sans', sans-serif" }}>Caricamento...</div>;
  }

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const anomaliesThisMonth = anomalies.filter(a => a.created_at >= monthStart).length;

  return (
    <>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 500, color: "#1F3326", margin: 0 }}>Sicurezza e Accessi</h1>
        <p style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 14, color: "#888", margin: "4px 0 0" }}>Monitora accessi, permessi e attivita del sistema</p>
      </div>

      {/* KPI Cards */}
      <div className="sec-kpi-row">
        <div className="sec-kpi-card">
          <div className="sec-kpi-icon" style={{ background: "rgba(79,123,140,.12)" }}>{iconLogin}</div>
          <div>
            <div className="sec-kpi-value">{loginsToday}</div>
            <div className="sec-kpi-label">Accessi oggi</div>
          </div>
        </div>
        <div className="sec-kpi-card">
          <div className="sec-kpi-icon" style={{ background: "rgba(45,90,61,.10)" }}>{iconUsers}</div>
          <div>
            <div className="sec-kpi-value">{activeUsers7d}</div>
            <div className="sec-kpi-label">Utenti attivi (7gg)</div>
          </div>
        </div>
        <div className="sec-kpi-card">
          <div className="sec-kpi-icon" style={{ background: "rgba(158,59,46,.10)" }}>{iconAlert}</div>
          <div>
            <div className="sec-kpi-value">{anomaliesThisMonth}</div>
            <div className="sec-kpi-label">Anomalie mese</div>
          </div>
        </div>
        <div className="sec-kpi-card">
          <div className="sec-kpi-icon" style={{ background: "rgba(191,167,98,.12)" }}>{iconRole}</div>
          <div>
            <div className="sec-kpi-value">{roleChanges.length}</div>
            <div className="sec-kpi-label">Cambi di ruolo</div>
          </div>
        </div>
      </div>

      {/* Row 1: Accessi + Matrice */}
      <div className="sec-grid-2">
        {/* Ultimi accessi */}
        <div className="sec-card">
          <div className="sec-card-head">
            <h2 className="sec-card-title">Ultimi accessi</h2>
            <div className="sec-filters-inline">
              <select value={loginFilterUser} onChange={e => setLoginFilterUser(e.target.value)}>
                <option value="">Tutti gli utenti</option>
                {loginUsers.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
              <select value={loginFilterAction} onChange={e => setLoginFilterAction(e.target.value)}>
                <option value="">Tutte le azioni</option>
                <option value="login">Login</option>
                <option value="logout">Logout</option>
              </select>
            </div>
          </div>
          <div className="sec-card-body sec-card-body-table">
            <table className="sec-tbl">
              <thead><tr><th>Data/ora</th><th>Utente</th><th>Azione</th></tr></thead>
              <tbody>
                {loginPageData.map(l => (
                  <tr key={l.id}>
                    <td className="sec-td-date">{fmtTs(l.created_at)}</td>
                    <td className="sec-td-name">{l.user_name}</td>
                    <td>
                      <span className={`sec-badge ${l.action === "login" ? "sec-badge-green" : "sec-badge-gray"}`}>
                        {l.action}
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredLogins.length === 0 && (
                  <tr><td colSpan={3} className="sec-empty">Nessun accesso registrato</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={loginPage} totalPages={loginTotalPages} onPageChange={setLoginPage} />
        </div>

        {/* Matrice permessi */}
        <div className="sec-card">
          <div className="sec-card-head">
            <h2 className="sec-card-title">Matrice permessi</h2>
          </div>
          <div className="sec-card-body sec-card-body-table">
            <table className="sec-tbl sec-tbl-matrix">
              <thead>
                <tr>
                  <th>Pagina</th>
                  <th style={{ textAlign: "center" }}><span className="sec-role-badge sec-role-admin">Admin</span></th>
                  <th style={{ textAlign: "center" }}><span className="sec-role-badge sec-role-manager">Manager</span></th>
                  <th style={{ textAlign: "center" }}><span className="sec-role-badge sec-role-staff">Staff</span></th>
                </tr>
              </thead>
              <tbody>
                {ROLE_MATRIX.map(r => (
                  <tr key={r.page}>
                    <td className="sec-td-name">{r.page}</td>
                    <td style={{ textAlign: "center" }}>{renderPerm(r.admin)}</td>
                    <td style={{ textAlign: "center" }}>{renderPerm(r.manager)}</td>
                    <td style={{ textAlign: "center" }}>{renderPerm(r.staff)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Row 2: Cambi di ruolo + Anomalie */}
      <div className="sec-grid-2">
        {/* Cambi di ruolo */}
        <div className="sec-card">
          <div className="sec-card-head">
            <h2 className="sec-card-title">Cambi di ruolo</h2>
          </div>
          <div className="sec-card-body sec-card-body-table">
            {roleChanges.length === 0 ? (
              <div className="sec-empty-block">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#D8CCB8" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
                <span>Nessun cambio di ruolo registrato</span>
              </div>
            ) : (
              <table className="sec-tbl">
                <thead><tr><th>Data</th><th>Eseguito da</th><th>Descrizione</th></tr></thead>
                <tbody>
                  {roleChanges.map(l => (
                    <tr key={l.id}>
                      <td className="sec-td-date">{fmtTs(l.created_at)}</td>
                      <td className="sec-td-name">{l.user_name}</td>
                      <td style={{ fontSize: 13 }}>{formatRoleChangeDetails(l.details, profileMap)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Anomalie */}
        <div className="sec-card">
          <div className="sec-card-head">
            <h2 className="sec-card-title">Anomalie e azioni critiche</h2>
            <div className="sec-filters-inline">
              <select value={anomalyFilterType} onChange={e => setAnomalyFilterType(e.target.value)}>
                <option value="">Tutti i tipi</option>
                {anomalyTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={anomalyFilterModule} onChange={e => setAnomalyFilterModule(e.target.value)}>
                <option value="">Tutti i moduli</option>
                {anomalyModules.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div className="sec-card-body sec-card-body-table">
            {filteredAnomalies.length === 0 ? (
              <div className="sec-empty-block">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#D8CCB8" strokeWidth="1.5" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/>
                </svg>
                <span>Nessuna anomalia rilevata</span>
              </div>
            ) : (
              <table className="sec-tbl">
                <thead><tr><th>Data</th><th>Utente</th><th>Tipo</th><th>Modulo</th><th>Descrizione</th></tr></thead>
                <tbody>
                  {anomalyPageData.map(a => (
                    <tr key={a.id}>
                      <td className="sec-td-date">{fmtTs(a.created_at)}</td>
                      <td className="sec-td-name">{a.user_name}</td>
                      <td>
                        <span className={`sec-badge ${a.type === "Eliminazione" ? "sec-badge-red" : "sec-badge-orange"}`}>
                          {a.type}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: "#6C6B5D" }}>{a.module}</td>
                      <td style={{ fontSize: 13 }}>{a.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <Pagination page={anomalyPage} totalPages={anomalyTotalPages} onPageChange={setAnomalyPage} />
        </div>
      </div>
    </>
  );
}
