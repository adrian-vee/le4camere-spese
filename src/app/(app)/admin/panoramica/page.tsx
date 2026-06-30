"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { useRole } from "@/lib/useRole";
import { canAccess } from "@/lib/permissions";
import { eur } from "@/lib/format";

export default function PanoramicaAdminPage() {
  const supabase = createClient();
  const router = useRouter();
  const { role, loading: roleLoading } = useRole();
  const isAdmin = canAccess(role, "/admin/panoramica");

  useEffect(() => {
    if (!roleLoading && !isAdmin) {
      router.replace("/");
    }
  }, [roleLoading, isAdmin, router]);
  const [loading, setLoading] = useState(true);

  // KPI
  const [activeUsersToday, setActiveUsersToday] = useState(0);
  const [cashMovToday, setCashMovToday] = useState({ count: 0, total: 0 });
  const [stockMovToday, setStockMovToday] = useState(0);
  const [expensesMonth, setExpensesMonth] = useState(0);
  const [uncoveredShifts, setUncoveredShifts] = useState(0);

  // Cassa
  const [cashSummary, setCashSummary] = useState<{ entrate: number; uscite: number }>({ entrate: 0, uscite: 0 });
  const [cashShortages, setCashShortages] = useState<{ id: string; shift_date: string | null; shift_type: string | null; difference: number; closed_by: string | null }[]>([]);
  const [openSessions, setOpenSessions] = useState<{ id: string; opened_at: string; opened_by: string; shift_type: string | null }[]>([]);

  // Staff
  const [staffRows, setStaffRows] = useState<{ id: string; name: string; role: string; lastLogin: string | null; actionsToday: number }[]>([]);

  // Magazzino
  const [lowStock, setLowStock] = useState<{ name: string; current_stock: number; min_stock: number; unit: string }[]>([]);
  const [recentMov, setRecentMov] = useState<{ id: string; created_at: string; product_name: string; type: string; quantity: number; note: string | null }[]>([]);

  // Finance
  const [finance, setFinance] = useState({ speseMonth: 0, utenzeMonth: 0, cashIn: 0, cashOut: 0 });

  useEffect(() => {
    if (!isAdmin || roleLoading) return;
    loadAll();
  }, [isAdmin, roleLoading]); // eslint-disable-line

  async function loadAll() {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const monthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    // Week dates for uncovered shifts
    const mon = new Date(now);
    mon.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1));
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    const weekStart = mon.toISOString().slice(0, 10);
    const weekEnd = sun.toISOString().slice(0, 10);

    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);

    const [
      { data: loginsToday },
      { data: cashMovData },
      { data: stockMovData },
      { data: expData },
      { data: shiftTypesData },
      { data: covData },
      { data: weekShiftsData },
      { data: cashMonth },
      { data: shortageData },
      { data: openCashData },
      { data: profilesData },
      { data: todayLogsData },
      { data: stockLevelsData },
      { data: recentStockMovData },
      { data: utenzeData },
    ] = await Promise.all([
      supabase.from("activity_log").select("user_id").eq("action", "login").gte("created_at", today + "T00:00:00"),
      supabase.from("cash_movements").select("type, amount").gte("created_at", today + "T00:00:00"),
      supabase.from("stock_movements").select("id").gte("created_at", today + "T00:00:00"),
      supabase.from("expenses").select("amount").gte("expense_date", monthStart).lte("expense_date", monthEnd),
      supabase.from("shift_types").select("id, name"),
      supabase.from("coverage_template").select("shift_type_id, weekday, count"),
      supabase.from("shifts").select("shift_date, shift_type_id, staff_id").gte("shift_date", weekStart).lte("shift_date", weekEnd),
      supabase.from("cash_movements").select("type, amount").gte("created_at", monthStart + "T00:00:00"),
      supabase.from("cash_sessions").select("id, shift_date, shift_type, difference, closed_by").not("closed_at", "is", null).neq("difference", 0).gte("shift_date", thirtyDaysAgo),
      supabase.from("cash_sessions").select("id, opened_at, opened_by, shift_type").is("closed_at", null),
      supabase.from("profiles").select("id, full_name, role"),
      supabase.from("activity_log").select("user_id, action").gte("created_at", today + "T00:00:00"),
      supabase.from("stock_levels").select("name, current_stock, min_stock, unit").eq("active", true),
      supabase.from("stock_movements").select("id, created_at, product_name, type, quantity, note").order("created_at", { ascending: false }).limit(10),
      supabase.from("utility_bills").select("amount").gte("period_end", monthStart).lte("period_end", monthEnd),
    ]);

    // KPI
    const uniqueLogins = new Set((loginsToday ?? []).map((r: { user_id: string }) => r.user_id));
    setActiveUsersToday(uniqueLogins.size);

    const movs = (cashMovData ?? []) as { type: string; amount: number }[];
    setCashMovToday({ count: movs.length, total: movs.reduce((s, m) => s + Number(m.amount), 0) });

    setStockMovToday((stockMovData ?? []).length);
    setExpensesMonth((expData ?? []).reduce((s, e: { amount: number }) => s + Number(e.amount), 0));

    // Uncovered shifts this week
    const isoWd = now.getDay() === 0 ? 7 : now.getDay();
    const cov = (covData ?? []) as { shift_type_id: string; weekday: number; count: number }[];
    const wShifts = (weekShiftsData ?? []) as { shift_date: string; shift_type_id: string; staff_id: string | null }[];
    let uncov = 0;
    for (let d = 0; d < 7; d++) {
      const wd = ((mon.getDay() === 0 ? 7 : mon.getDay()) + d - 1) % 7 + 1;
      const dateStr = new Date(mon.getTime() + d * 86400000).toISOString().slice(0, 10);
      if (dateStr > today) continue;
      const dayCov = cov.filter(c => c.weekday === wd);
      for (const c of dayCov) {
        const assigned = wShifts.filter(s => s.shift_date === dateStr && s.shift_type_id === c.shift_type_id && s.staff_id).length;
        if (assigned < c.count) uncov += c.count - assigned;
      }
    }
    setUncoveredShifts(uncov);

    // Cassa section
    const cm = (cashMonth ?? []) as { type: string; amount: number }[];
    setCashSummary({
      entrate: cm.filter(m => m.type === "entrata").reduce((s, m) => s + Number(m.amount), 0),
      uscite: cm.filter(m => m.type === "uscita").reduce((s, m) => s + Number(m.amount), 0),
    });
    setCashShortages((shortageData ?? []) as typeof cashShortages);
    setOpenSessions((openCashData ?? []) as typeof openSessions);

    // Staff section
    const profiles = (profilesData ?? []) as { id: string; full_name: string | null; role: string }[];
    const todayLogs = (todayLogsData ?? []) as { user_id: string; action: string }[];
    const loginLogs = (loginsToday ?? []) as { user_id: string }[];
    const lastLoginMap = new Map<string, string>();
    for (const l of loginLogs) lastLoginMap.set(l.user_id, today);
    const actionCount = new Map<string, number>();
    for (const l of todayLogs) actionCount.set(l.user_id, (actionCount.get(l.user_id) ?? 0) + 1);

    setStaffRows(profiles.map(p => ({
      id: p.id,
      name: p.full_name || "?",
      role: p.role,
      lastLogin: lastLoginMap.get(p.id) ?? null,
      actionsToday: actionCount.get(p.id) ?? 0,
    })));

    // Magazzino section
    const sl = (stockLevelsData ?? []) as { name: string; current_stock: number; min_stock: number; unit: string }[];
    setLowStock(sl.filter(p => p.min_stock > 0 && p.current_stock < p.min_stock));
    setRecentMov((recentStockMovData ?? []) as typeof recentMov);

    // Finance
    const speseM = (expData ?? []).reduce((s, e: { amount: number }) => s + Number(e.amount), 0);
    const utenzeM = (utenzeData ?? []).reduce((s, b: { amount: number }) => s + Number(b.amount), 0);
    setFinance({ speseMonth: speseM, utenzeMonth: utenzeM, cashIn: cashSummary.entrate || cm.filter(m => m.type === "entrata").reduce((s, m) => s + Number(m.amount), 0), cashOut: cm.filter(m => m.type === "uscita").reduce((s, m) => s + Number(m.amount), 0) });

    setLoading(false);
  }

  if (roleLoading || loading || !isAdmin) {
    return <div style={{ padding: 40, textAlign: "center", color: "#6C6B5D", fontFamily: "'Albert Sans', sans-serif" }}>Caricamento...</div>;
  }

  const saldo = finance.cashIn - (finance.speseMonth + finance.utenzeMonth + finance.cashOut);

  return (
    <>
      <h1 className="serif" style={{ fontSize: 24, fontWeight: 500, marginBottom: 24 }}>Panoramica admin</h1>

      {/* KPI Cards */}
      <div className="cards" style={{ marginBottom: 28 }}>
        <div className="card"><div className="label">Utenti attivi oggi</div><div className="value tabular">{activeUsersToday}</div></div>
        <div className="card"><div className="label">Movimenti cassa oggi</div><div className="value tabular">{cashMovToday.count}</div><div className="meta">{eur(cashMovToday.total)}</div></div>
        <div className="card"><div className="label">Mov. magazzino oggi</div><div className="value tabular">{stockMovToday}</div></div>
        <div className="card"><div className="label">Spese del mese</div><div className="value tabular">{eur(expensesMonth)}</div></div>
        <div className="card"><div className="label">Turni scoperti sett.</div><div className="value tabular" style={{ color: uncoveredShifts > 0 ? "#9E3B2E" : undefined }}>{uncoveredShifts}</div></div>
      </div>

      <div className="dash-grid">
        {/* CASSA */}
        <div className="section">
          <div className="section-head"><h2>Cassa — mese corrente</h2></div>
          <div className="section-body">
            <div style={{ display: "flex", gap: 20, marginBottom: 16 }}>
              <div><div className="muted" style={{ fontSize: 12 }}>Entrate</div><div style={{ fontSize: 20, fontWeight: 700, color: "#2D5A3D" }}>{eur(cashSummary.entrate)}</div></div>
              <div><div className="muted" style={{ fontSize: 12 }}>Uscite</div><div style={{ fontSize: 20, fontWeight: 700, color: "#9E3B2E" }}>{eur(cashSummary.uscite)}</div></div>
              <div><div className="muted" style={{ fontSize: 12 }}>Saldo</div><div style={{ fontSize: 20, fontWeight: 700 }}>{eur(cashSummary.entrate - cashSummary.uscite)}</div></div>
            </div>
            {openSessions.length > 0 && (
              <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, background: "rgba(191,167,98,.1)", border: "1px solid rgba(191,167,98,.3)" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#BFA762" }}>Sessioni aperte: {openSessions.length}</div>
                {openSessions.map(s => {
                  const opName = staffRows.find(p => p.id === s.opened_by)?.name || s.opened_by;
                  return (
                    <div key={s.id} style={{ fontSize: 12, color: "#6C6B5D", marginTop: 4 }}>
                      Aperta da {opName}{s.shift_type ? ` — turno ${s.shift_type}` : ""}
                    </div>
                  );
                })}
              </div>
            )}
            {cashShortages.length > 0 && (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Ammanchi ultimi 30gg</div>
                {cashShortages.slice(0, 5).map(s => (
                  <div key={s.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 0", borderBottom: "1px solid #F3EBDD" }}>
                    <span>{s.shift_date}{s.shift_type ? ` — ${s.shift_type}` : ""}</span>
                    <span style={{ fontWeight: 700, color: "#9E3B2E" }}>{eur(Math.abs(s.difference ?? 0))}</span>
                  </div>
                ))}
              </>
            )}
            {cashShortages.length === 0 && <div className="muted" style={{ fontSize: 13 }}>Nessun ammanco registrato</div>}
          </div>
        </div>

        {/* PERSONALE */}
        <div className="section">
          <div className="section-head"><h2>Personale</h2></div>
          <div className="section-body" style={{ padding: 0 }}>
            <table className="tbl">
              <thead><tr><th>Nome</th><th>Ruolo</th><th>Login oggi</th><th style={{ textAlign: "right" }}>Azioni</th></tr></thead>
              <tbody>
                {staffRows.map(s => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 600 }}>{s.name}</td>
                    <td><span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#6C6B5D" }}>{s.role}</span></td>
                    <td>{s.lastLogin ? <span style={{ color: "#2D5A3D", fontWeight: 600, fontSize: 12 }}>Attivo</span> : <span className="muted" style={{ fontSize: 12 }}>—</span>}</td>
                    <td className="tabular" style={{ textAlign: "right", fontWeight: 600 }}>{s.actionsToday}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* MAGAZZINO */}
        <div className="section">
          <div className="section-head"><h2>Magazzino</h2></div>
          <div className="section-body">
            {lowStock.length > 0 && (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: "#9E3B2E" }}>Sotto scorta ({lowStock.length})</div>
                {lowStock.slice(0, 6).map((p, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "5px 0", borderBottom: "1px solid #F3EBDD" }}>
                    <span>{p.name}</span>
                    <span style={{ fontWeight: 700, color: "#9E3B2E" }}>{p.current_stock}/{p.min_stock} {p.unit}</span>
                  </div>
                ))}
              </>
            )}
            {lowStock.length === 0 && <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>Scorte nella norma</div>}
            {recentMov.length > 0 && (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, marginTop: 16, marginBottom: 8 }}>Ultimi movimenti</div>
                {recentMov.slice(0, 6).map(m => (
                  <div key={m.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "4px 0", borderBottom: "1px solid #F3EBDD" }}>
                    <span>{m.product_name} — <span style={{ color: m.type === "carico" ? "#2D5A3D" : "#9E3B2E" }}>{m.type === "carico" ? "+" : "-"}{m.quantity}</span></span>
                    <span className="muted">{new Date(m.created_at).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        {/* FINANZIARIA */}
        <div className="section">
          <div className="section-head"><h2>Riepilogo finanziario — mese</h2></div>
          <div className="section-body">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                <span>Spese registrate</span><span className="tabular" style={{ fontWeight: 700, color: "#9E3B2E" }}>-{eur(finance.speseMonth)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                <span>Utenze</span><span className="tabular" style={{ fontWeight: 700, color: "#C77B4A" }}>-{eur(finance.utenzeMonth)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                <span>Uscite cassa</span><span className="tabular" style={{ fontWeight: 700, color: "#9E3B2E" }}>-{eur(finance.cashOut)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                <span>Entrate cassa</span><span className="tabular" style={{ fontWeight: 700, color: "#2D5A3D" }}>+{eur(finance.cashIn)}</span>
              </div>
              <div style={{ borderTop: "2px solid #D8CCB8", paddingTop: 10, display: "flex", justifyContent: "space-between", fontSize: 16 }}>
                <span style={{ fontWeight: 700 }}>Saldo netto</span>
                <span className="tabular" style={{ fontWeight: 800, color: saldo >= 0 ? "#2D5A3D" : "#9E3B2E" }}>{eur(saldo)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
