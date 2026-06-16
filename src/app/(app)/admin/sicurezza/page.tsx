"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { useRole } from "@/lib/useRole";

interface LoginRow { id: string; user_name: string; created_at: string; action: string; details: Record<string, unknown> | null }
interface AnomalyRow { id: string; user_name: string; created_at: string; module: string; description: string; type: string }

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

export default function SicurezzaPage() {
  const supabase = createClient();
  const router = useRouter();
  const { isAdmin, loading: roleLoading } = useRole();

  useEffect(() => {
    if (!roleLoading && !isAdmin) {
      router.replace("/");
    }
  }, [roleLoading, isAdmin, router]);
  const [loading, setLoading] = useState(true);

  const [logins, setLogins] = useState<LoginRow[]>([]);
  const [roleChanges, setRoleChanges] = useState<LoginRow[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyRow[]>([]);

  useEffect(() => {
    if (!isAdmin || roleLoading) return;
    loadData();
  }, [isAdmin, roleLoading]); // eslint-disable-line

  async function loadData() {
    const [
      { data: loginData },
      { data: roleChangeData },
      { data: deleteData },
      { data: offHoursCashData },
    ] = await Promise.all([
      supabase.from("activity_log").select("id, user_name, created_at, action, details")
        .in("action", ["login", "logout"])
        .order("created_at", { ascending: false }).limit(50),
      supabase.from("activity_log").select("id, user_name, created_at, action, details")
        .eq("module", "account").eq("action", "update")
        .order("created_at", { ascending: false }).limit(20),
      supabase.from("activity_log").select("id, user_name, created_at, module, description")
        .eq("action", "delete")
        .order("created_at", { ascending: false }).limit(20),
      supabase.from("activity_log").select("id, user_name, created_at, module, description")
        .eq("module", "cassa")
        .order("created_at", { ascending: false }).limit(50),
    ]);

    setLogins((loginData ?? []) as LoginRow[]);
    setRoleChanges((roleChangeData ?? []) as LoginRow[]);

    // Build anomalies
    const anoms: AnomalyRow[] = [];

    // Deletions
    for (const d of (deleteData ?? []) as { id: string; user_name: string; created_at: string; module: string; description: string }[]) {
      anoms.push({ ...d, type: "Eliminazione" });
    }

    // Cash operations at unusual hours (before 6am or after midnight)
    for (const c of (offHoursCashData ?? []) as { id: string; user_name: string; created_at: string; module: string; description: string }[]) {
      const hour = new Date(c.created_at).getHours();
      if (hour < 6 || hour >= 24) {
        anoms.push({ ...c, type: "Fuori orario" });
      }
    }

    anoms.sort((a, b) => b.created_at.localeCompare(a.created_at));
    setAnomalies(anoms);
    setLoading(false);
  }

  function fmtTs(ts: string) {
    const d = new Date(ts);
    return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  if (roleLoading || loading || !isAdmin) {
    return <div style={{ padding: 40, textAlign: "center", color: "#6C6B5D", fontFamily: "'Albert Sans', sans-serif" }}>Caricamento...</div>;
  }

  return (
    <>
      <h1 className="serif" style={{ fontSize: 24, fontWeight: 500, marginBottom: 24 }}>Sicurezza</h1>

      <div className="dash-grid">
        {/* Recent logins */}
        <div className="section">
          <div className="section-head"><h2>Ultimi accessi</h2></div>
          <div className="section-body" style={{ padding: 0 }}>
            <table className="tbl">
              <thead><tr><th>Data</th><th>Utente</th><th>Azione</th></tr></thead>
              <tbody>
                {logins.map(l => (
                  <tr key={l.id}>
                    <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>{fmtTs(l.created_at)}</td>
                    <td style={{ fontWeight: 600, fontSize: 13 }}>{l.user_name}</td>
                    <td>
                      <span style={{
                        padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                        background: l.action === "login" ? "rgba(79,123,140,.15)" : "rgba(108,107,93,.15)",
                        color: l.action === "login" ? "#4F7B8C" : "#6C6B5D",
                      }}>{l.action}</span>
                    </td>
                  </tr>
                ))}
                {logins.length === 0 && <tr><td colSpan={3} className="muted" style={{ textAlign: "center", padding: 30 }}>Nessun accesso registrato</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* Role matrix */}
        <div className="section">
          <div className="section-head"><h2>Matrice permessi</h2></div>
          <div className="section-body" style={{ padding: 0 }}>
            <table className="tbl">
              <thead><tr><th>Pagina</th><th style={{ textAlign: "center" }}>Admin</th><th style={{ textAlign: "center" }}>Manager</th><th style={{ textAlign: "center" }}>Staff</th></tr></thead>
              <tbody>
                {ROLE_MATRIX.map(r => (
                  <tr key={r.page}>
                    <td style={{ fontWeight: 600, fontSize: 13 }}>{r.page}</td>
                    <td style={{ textAlign: "center" }}>{renderPerm(r.admin)}</td>
                    <td style={{ textAlign: "center" }}>{renderPerm(r.manager)}</td>
                    <td style={{ textAlign: "center" }}>{renderPerm(r.staff)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Role changes */}
        <div className="section">
          <div className="section-head"><h2>Cambi di ruolo</h2></div>
          <div className="section-body" style={{ padding: 0 }}>
            <table className="tbl">
              <thead><tr><th>Data</th><th>Eseguito da</th><th>Descrizione</th></tr></thead>
              <tbody>
                {roleChanges.map(l => (
                  <tr key={l.id}>
                    <td style={{ fontSize: 12 }}>{fmtTs(l.created_at)}</td>
                    <td style={{ fontWeight: 600, fontSize: 13 }}>{l.user_name}</td>
                    <td style={{ fontSize: 13 }}>{l.details ? JSON.stringify(l.details) : "—"}</td>
                  </tr>
                ))}
                {roleChanges.length === 0 && <tr><td colSpan={3} className="muted" style={{ textAlign: "center", padding: 30 }}>Nessun cambio ruolo</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* Anomalies */}
        <div className="section">
          <div className="section-head"><h2>Anomalie</h2></div>
          <div className="section-body" style={{ padding: 0 }}>
            {anomalies.length === 0 ? (
              <div className="muted" style={{ textAlign: "center", padding: 40 }}>Nessuna anomalia rilevata</div>
            ) : (
              <table className="tbl">
                <thead><tr><th>Data</th><th>Utente</th><th>Tipo</th><th>Modulo</th><th>Descrizione</th></tr></thead>
                <tbody>
                  {anomalies.map(a => (
                    <tr key={a.id}>
                      <td style={{ fontSize: 12 }}>{fmtTs(a.created_at)}</td>
                      <td style={{ fontWeight: 600, fontSize: 13 }}>{a.user_name}</td>
                      <td>
                        <span style={{
                          padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                          background: "rgba(158,59,46,.12)", color: "#9E3B2E",
                        }}>{a.type}</span>
                      </td>
                      <td style={{ fontSize: 12 }}>{a.module}</td>
                      <td style={{ fontSize: 13 }}>{a.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function renderPerm(v: boolean | string) {
  if (v === true) return <span style={{ color: "#2D5A3D", fontWeight: 700 }}>&#10003;</span>;
  if (v === false) return <span style={{ color: "#9E3B2E" }}>&#10007;</span>;
  return <span style={{ fontSize: 11, color: "#BFA762", fontWeight: 600 }}>{v}</span>;
}
