import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { eur, fmtDate, monthKey, type Expense, type Category } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const isoWd = now.getDay() === 0 ? 7 : now.getDay();
  const curM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const curY = String(now.getFullYear());

  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevM = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

  const mon = new Date(now);
  mon.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1));
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const weekStart = mon.toISOString().slice(0, 10);
  const weekEnd = sun.toISOString().slice(0, 10);

  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const [
    { data: profileData },
    { data: expData },
    { data: catData },
    { data: shiftTypesData },
    { data: coverageData },
    { data: todayShiftsData },
    { data: staffData },
    { data: absData },
    { data: monthShiftsData },
    { data: stockLevelsData },
    { data: hkTasksData },
    { data: recData },
    { data: docsExpiringData },
    { data: utenzeMonthData },
  ] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).single(),
    supabase.from("expenses").select("*, categories(name,color), profiles(full_name)").order("expense_date", { ascending: false }),
    supabase.from("categories").select("*").order("sort"),
    supabase.from("shift_types").select("*").order("sort"),
    supabase.from("coverage_template").select("shift_type_id, count").eq("weekday", isoWd),
    supabase.from("shifts").select("shift_date, shift_type_id, staff_id").eq("shift_date", today),
    supabase.from("staff").select("*").eq("active", true).order("name"),
    supabase.from("absences").select("*"),
    supabase.from("shifts").select("shift_date, shift_type_id, staff_id").gte("shift_date", monthStart).lte("shift_date", monthEnd),
    supabase.from("stock_levels").select("product_id, name, current_stock, min_stock, unit").eq("active", true),
    supabase.from("housekeeping_tasks").select("id, status, notes").eq("task_date", today),
    supabase.from("recurring_expenses").select("id, name, frequency, last_generated, active").eq("active", true),
    supabase.from("documents").select("id, title, category, expiry_date").not("expiry_date", "is", null).gte("expiry_date", today).lte("expiry_date", new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30).toISOString().slice(0, 10)).eq("status", "attivo").order("expiry_date"),
    supabase.from("utility_bills").select("id, bill_type, amount, period_end").gte("period_end", monthStart).lte("period_end", monthEnd),
  ]);

  const profile = profileData as { full_name: string | null } | null;
  const firstName = profile?.full_name?.split(" ")[0] || "Utente";
  const rawDate = now.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const greetingDate = rawDate.charAt(0).toUpperCase() + rawDate.slice(1);
  const hour = now.getHours();
  const greeting = hour < 14 ? "Buongiorno" : hour < 18 ? "Buon pomeriggio" : "Buonasera";

  const expenses = (expData ?? []) as Expense[];
  const cats = (catData ?? []) as Category[];

  /* ── KPI ── */
  const sumMonth = expenses.filter(e => monthKey(e.expense_date) === curM).reduce((s, e) => s + Number(e.amount), 0);
  const sumPrevMonth = expenses.filter(e => monthKey(e.expense_date) === prevM).reduce((s, e) => s + Number(e.amount), 0);
  const deltaPct = sumPrevMonth > 0 ? Math.round(((sumMonth - sumPrevMonth) / sumPrevMonth) * 100) : null;

  const yearExp = expenses.filter(e => new Date(e.expense_date).getFullYear().toString() === curY);
  const sumYear = yearExp.reduce((s, e) => s + Number(e.amount), 0);

  const toPay = expenses.filter(e => e.payment_status === "da_pagare");
  const sumToPay = toPay.reduce((s, e) => s + Number(e.amount), 0);
  const overdue = toPay.filter(e => e.due_date && e.due_date < today);

  /* ── Shift types & staff maps ── */
  type STRow = { id: string; name: string; start_time: string; end_time: string; color: string; sort: number };
  type StaffR = { id: string; name: string; type: "dipendente" | "a_chiamata"; hours_per_week: number; active: boolean };

  const shiftTypes = (shiftTypesData ?? []) as STRow[];
  const stMap = new Map(shiftTypes.map(st => [st.id, st]));
  const staffList = (staffData ?? []) as StaffR[];
  const staffMap = new Map(staffList.map(s => [s.id, s]));

  /* ── Today's shifts ── */
  type CovRow = { shift_type_id: string; count: number };
  type ShiftR = { shift_date: string; shift_type_id: string; staff_id: string | null };

  const covRows = (coverageData ?? []) as CovRow[];
  const todayShifts = (todayShiftsData ?? []) as ShiftR[];

  type AbsRow = { id: string; staff_id: string; absent_date: string; end_date: string | null; type: string; notes: string | null };
  const absRows = (absData ?? []) as AbsRow[];
  const todayAbsentIds = new Set(
    absRows.filter(a => { const end = a.end_date || a.absent_date; return a.absent_date <= today && end >= today; }).map(a => a.staff_id),
  );

  type TodaySlot = { shiftName: string; startTime: string; endTime: string; color: string; staffName: string | null; isAbsent: boolean };
  const todaySchedule: TodaySlot[] = [];
  for (const cov of covRows) {
    const st = stMap.get(cov.shift_type_id);
    if (!st || cov.count <= 0) continue;
    const assigned = todayShifts.filter(s => s.shift_type_id === cov.shift_type_id && s.staff_id);
    for (let i = 0; i < cov.count; i++) {
      const shift = assigned[i];
      const staffId = shift?.staff_id;
      const member = staffId ? staffMap.get(staffId) : null;
      todaySchedule.push({
        shiftName: st.name,
        startTime: st.start_time.slice(0, 5),
        endTime: st.end_time.slice(0, 5),
        color: st.color,
        staffName: member?.name ?? null,
        isAbsent: staffId ? todayAbsentIds.has(staffId) : false,
      });
    }
  }

  /* ── Week absences ── */
  const weekAbsences = absRows
    .filter(a => { const end = a.end_date || a.absent_date; return a.absent_date <= weekEnd && end >= weekStart; })
    .map(a => ({ ...a, staffName: staffMap.get(a.staff_id)?.name ?? "?" }));

  /* ── Unpaid expenses ── */
  const unpaid = [...toPay].sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999")).slice(0, 10);

  /* ── 6-month trend ── */
  const months6: { key: string; label: string; total: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const lbl = d.toLocaleDateString("it-IT", { month: "short" });
    const total = expenses.filter(e => monthKey(e.expense_date) === key).reduce((s, e) => s + Number(e.amount), 0);
    months6.push({ key, label: lbl.charAt(0).toUpperCase() + lbl.slice(1), total });
  }
  const maxTrend = Math.max(1, ...months6.map(m => m.total));

  /* ── Top 5 suppliers ── */
  const monthExpenses = expenses.filter(e => monthKey(e.expense_date) === curM);
  const bySup: Record<string, number> = {};
  for (const e of monthExpenses) {
    const name = e.supplier_name || "Senza fornitore";
    bySup[name] = (bySup[name] ?? 0) + Number(e.amount);
  }
  const topSuppliers = Object.entries(bySup).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total).slice(0, 5);

  /* ── Staff monthly summary ── */
  const mShifts = (monthShiftsData ?? []) as ShiftR[];
  function calcHours(start: string, end: string): number {
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    let diff = (eh * 60 + em) - (sh * 60 + sm);
    if (diff <= 0) diff += 24 * 60;
    return diff / 60;
  }
  const staffHours: Record<string, number> = {};
  for (const s of mShifts) {
    if (!s.staff_id) continue;
    const st = stMap.get(s.shift_type_id);
    if (!st) continue;
    staffHours[s.staff_id] = (staffHours[s.staff_id] ?? 0) + calcHours(st.start_time, st.end_time);
  }
  const HOURLY_RATE = 8;
  const staffSummary = staffList
    .map(s => ({ name: s.name, type: s.type, hours: staffHours[s.id] ?? 0, cost: s.type === "a_chiamata" ? (staffHours[s.id] ?? 0) * HOURLY_RATE : null }))
    .filter(s => s.hours > 0);
  const totalOnCallCost = staffSummary.reduce((sum, s) => sum + (s.cost ?? 0), 0);

  /* ── Category breakdown ── */
  const byCat: Record<string, { name: string; color: string; val: number }> = {};
  for (const e of yearExp) {
    const key = e.category_id ?? "none";
    const name = e.categories?.name ?? "Altro";
    const color = e.categories?.color ?? "#9C8E78";
    byCat[key] = byCat[key] || { name, color, val: 0 };
    byCat[key].val += Number(e.amount);
  }
  const bars = Object.values(byCat).sort((a, b) => b.val - a.val);
  const maxBar = Math.max(1, ...bars.map(b => b.val));

  /* ── Low stock ── */
  type StockItem = { product_id: string; name: string; current_stock: number; min_stock: number; unit: string };
  const lowStock = ((stockLevelsData ?? []) as StockItem[]).filter(p => p.min_stock > 0 && p.current_stock < p.min_stock);

  /* ── Housekeeping today ── */
  const hkTasks = (hkTasksData ?? []) as { id: string; status: string; notes: string | null }[];
  const hkTotal = hkTasks.length;
  const hkDone = hkTasks.filter(t => t.status === "pulita" || t.status === "ispezionata").length;
  const hkIssues = hkTasks.filter(t => t.notes && t.notes.trim().length > 0).length;

  /* ── Recurring expenses pending ── */
  type RecRow = { id: string; name: string; frequency: string; last_generated: string | null; active: boolean };
  const recRows = (recData ?? []) as RecRow[];
  function shouldGenerateRec(freq: string, m: number): boolean {
    switch (freq) {
      case "mensile": return true;
      case "bimestrale": return m % 2 === 0;
      case "trimestrale": return [3, 6, 9, 12].includes(m);
      case "semestrale": return [6, 12].includes(m);
      case "annuale": return m === 12;
      default: return false;
    }
  }
  const pendingRec = recRows.filter(r =>
    r.active && shouldGenerateRec(r.frequency, now.getMonth() + 1) && (!r.last_generated || r.last_generated < monthStart)
  );

  /* ── Documents expiring soon ── */
  type DocExpRow = { id: string; title: string; category: string; expiry_date: string };
  const docsExpiring = (docsExpiringData ?? []) as DocExpRow[];

  /* ── Utenze this month ── */
  type UtMonthRow = { id: string; bill_type: string; amount: number; period_end: string };
  const utenzeMonth = (utenzeMonthData ?? []) as UtMonthRow[];
  const utenzeTotalMonth = utenzeMonth.reduce((s, b) => s + Number(b.amount), 0);
  const utenzeByType: Record<string, number> = {};
  for (const b of utenzeMonth) utenzeByType[b.bill_type] = (utenzeByType[b.bill_type] ?? 0) + Number(b.amount);

  const recent = expenses.slice(0, 8);

  return (
    <>
      {/* ── Greeting ── */}
      <div className="dash-greeting">
        <h1 className="serif">{greeting}, {firstName}</h1>
        <div className="date">{greetingDate}</div>
      </div>
      <div className="dash-actions">
        <Link href="/nuova">+ Nuova spesa</Link>
        <Link href="/turni">Vai ai turni</Link>
        <Link href="/personale">Aggiungi personale</Link>
        <Link href="/inventario">Magazzino</Link>
        <Link href="/housekeeping">Housekeeping</Link>
      </div>

      {/* ── KPI Cards ── */}
      <div className="cards">
        <div className="card accent">
          <div className="label">Spese mese corrente</div>
          <div className="value tabular">{eur(sumMonth)}</div>
          <div className="meta">
            {now.toLocaleDateString("it-IT", { month: "long", year: "numeric" })}
            {deltaPct !== null && (
              <span className={`kpi-delta ${deltaPct > 0 ? "up" : "down"}`}>
                {deltaPct > 0 ? "+" : ""}{deltaPct}%
              </span>
            )}
          </div>
        </div>
        <div className="card">
          <div className="label">Totale anno {curY}</div>
          <div className="value tabular">{eur(sumYear)}</div>
          <div className="meta">{yearExp.length} registrazioni</div>
        </div>
        <div className="card">
          <div className="label">Da pagare</div>
          <div className="value tabular" style={{ color: overdue.length > 0 ? "var(--danger)" : sumToPay > 0 ? "var(--danger)" : undefined }}>
            {eur(sumToPay)}
          </div>
          <div className="meta">
            {toPay.length} in sospeso
            {overdue.length > 0 && <span style={{ color: "var(--danger)", fontWeight: 700 }}> · {overdue.length} scadute</span>}
          </div>
        </div>
        <div className="card">
          <div className="label">Costo personale</div>
          <div className="value tabular">{eur(totalOnCallCost)}</div>
          <div className="meta">a chiamata · {now.toLocaleDateString("it-IT", { month: "long" })}</div>
        </div>
        <div className="card">
          <div className="label">Totale registrato</div>
          <div className="value tabular">{expenses.length}</div>
          <div className="meta">spese in archivio</div>
        </div>
      </div>

      {/* ── Recurring expenses alert ── */}
      {pendingRec.length > 0 && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
          padding: "14px 20px", borderRadius: 12, marginBottom: 20,
          background: "#F5EEDB", border: "1px solid #D8CCB8",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B68A3E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>
              {pendingRec.length} {pendingRec.length === 1 ? "spesa ricorrente" : "spese ricorrenti"} da generare per {now.toLocaleDateString("it-IT", { month: "long" })}
            </span>
          </div>
          <Link href="/spese" style={{ fontSize: 13, fontWeight: 700, color: "#B68A3E" }}>Vai alle spese &rarr;</Link>
        </div>
      )}

      {/* ── 2-column grid ── */}
      <div className="dash-grid">

        {/* Turni di oggi */}
        <div className="section">
          <div className="section-head">
            <h2>Turni di oggi</h2>
            <span className="muted">{fmtDate(today)}</span>
          </div>
          <div className="section-body">
            {todaySchedule.length === 0 ? (
              <p className="muted">Nessuna copertura prevista per oggi.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {todaySchedule.map((s, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "10px 14px", borderRadius: 10,
                    background: s.staffName ? "var(--surface)" : "rgba(158,59,46,.06)",
                    border: `1px solid ${s.staffName ? "var(--line)" : "var(--danger)"}`,
                  }}>
                    <span className="dot" style={{ background: s.color }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{s.shiftName}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{s.startTime}–{s.endTime}</div>
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: s.staffName ? "var(--ink)" : "var(--danger)" }}>
                      {s.staffName ? (
                        <>
                          {s.staffName}
                          {s.isAbsent && <span className="badge warn" style={{ marginLeft: 8 }}>assente</span>}
                        </>
                      ) : (
                        "— Scoperto —"
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Housekeeping oggi */}
        <div className="section">
          <div className="section-head">
            <h2>Housekeeping oggi</h2>
            <Link href="/housekeeping" className="muted" style={{ fontWeight: 600 }}>Vedi dettagli →</Link>
          </div>
          <div className="section-body">
            {hkTotal === 0 ? (
              <p className="muted">Nessuna task generata per oggi.</p>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{hkDone}/{hkTotal} camere pronte</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: hkDone === hkTotal ? "#1F3326" : "#B68A3E" }}>
                    {Math.round(hkTotal > 0 ? (hkDone / hkTotal) * 100 : 0)}%
                  </span>
                </div>
                <div style={{ height: 10, borderRadius: 5, background: "#E8E0D0", overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    width: `${hkTotal > 0 ? (hkDone / hkTotal) * 100 : 0}%`,
                    background: hkDone === hkTotal ? "#1F3326" : "#2D5A3D",
                    borderRadius: 5,
                  }} />
                </div>
                {hkIssues > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <span className="badge warn">{hkIssues} segnalazioni</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Spese da pagare */}
        <div className="section">
          <div className="section-head">
            <h2>Spese da pagare</h2>
            <span className="muted">{toPay.length} in sospeso</span>
          </div>
          <div className="section-body">
            {unpaid.length === 0 ? (
              <p style={{ color: "var(--ok)", fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>Nessuna spesa in sospeso <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg></p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {unpaid.map(e => {
                  const isOverdue = !!(e.due_date && e.due_date < today);
                  return (
                    <div key={e.id} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "10px 14px", borderRadius: 10,
                      border: `1px solid ${isOverdue ? "var(--danger)" : "var(--line)"}`,
                      background: isOverdue ? "rgba(158,59,46,.04)" : "var(--surface)",
                    }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{e.supplier_name || "—"}</div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          Scad. {e.due_date ? fmtDate(e.due_date) : "—"}
                          {isOverdue && <span style={{ color: "var(--danger)", fontWeight: 700 }}> · SCADUTA</span>}
                        </div>
                      </div>
                      <div className="tabular" style={{ fontWeight: 700, fontSize: 15, color: isOverdue ? "var(--danger)" : "var(--ink)" }}>
                        {eur(Number(e.amount))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Assenze questa settimana */}
        <div className="section">
          <div className="section-head">
            <h2>Assenze questa settimana</h2>
          </div>
          <div className="section-body">
            {weekAbsences.length === 0 ? (
              <p className="muted">Nessuna assenza questa settimana.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {weekAbsences.map((a, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "10px 14px", borderRadius: 10, border: "1px solid var(--line)",
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{a.staffName}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {fmtDate(a.absent_date)}{a.end_date ? ` – ${fmtDate(a.end_date)}` : ""}
                      </div>
                    </div>
                    <span className="badge warn">{a.type}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Scadenze imminenti */}
        {docsExpiring.length > 0 && (
          <div className="section">
            <div className="section-head">
              <h2 style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B68A3E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                Scadenze imminenti
              </h2>
              <Link href="/documenti" className="muted" style={{ fontWeight: 600 }}>Documenti →</Link>
            </div>
            <div className="section-body">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {docsExpiring.slice(0, 6).map(d => {
                  const daysLeft = Math.round((new Date(d.expiry_date).getTime() - now.getTime()) / 86400000);
                  return (
                    <div key={d.id} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "10px 14px", borderRadius: 10,
                      border: `1px solid ${daysLeft <= 7 ? "rgba(158,59,46,.3)" : "var(--line)"}`,
                      background: daysLeft <= 7 ? "rgba(158,59,46,.04)" : "var(--surface)",
                    }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{d.title}</div>
                        <div className="muted" style={{ fontSize: 12 }}>{d.category}</div>
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: daysLeft <= 7 ? "var(--danger)" : "#B68A3E", whiteSpace: "nowrap" }}>
                        {daysLeft} {daysLeft === 1 ? "giorno" : "giorni"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Utenze mese */}
        <div className="section">
          <div className="section-head">
            <h2 style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F5C542" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
              Utenze mese
            </h2>
            <Link href="/utenze" className="muted" style={{ fontWeight: 600 }}>Dettagli →</Link>
          </div>
          <div className="section-body">
            {utenzeMonth.length === 0 ? (
              <p className="muted">Nessuna bolletta registrata questo mese.</p>
            ) : (
              <>
                <div style={{ fontSize: 24, fontWeight: 800, fontFamily: "'Bebas Neue', sans-serif", marginBottom: 12 }}>{eur(utenzeTotalMonth)}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {Object.entries(utenzeByType).sort((a, b) => b[1] - a[1]).map(([type, total]) => {
                    const colors: Record<string, string> = { Luce: "#F5C542", Gas: "#E07B3A", Acqua: "#4A9BD9", Immondizia: "#5C7363", Internet: "#7A6A8C" };
                    return (
                      <div key={type} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ width: 10, height: 10, borderRadius: 3, background: colors[type] ?? "var(--ink-soft)", display: "inline-block" }} />
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{type}</span>
                        </div>
                        <span className="tabular" style={{ fontWeight: 700, fontSize: 14 }}>{eur(total)}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Scorte basse */}
        {lowStock.length > 0 && (
          <div className="section">
            <div className="section-head">
              <h2 style={{ display: "flex", alignItems: "center", gap: 6 }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><path d="M12 9v4M12 17h.01" /></svg> Scorte basse</h2>
              <Link href="/inventario" className="muted" style={{ fontWeight: 600 }}>Magazzino →</Link>
            </div>
            <div className="section-body">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {lowStock.slice(0, 8).map(p => (
                  <div key={p.product_id} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 14px", borderRadius: 10,
                    border: "1px solid rgba(158,59,46,.2)", background: "rgba(158,59,46,.04)",
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        Giacenza: <strong style={{ color: "var(--danger)" }}>{p.current_stock} {p.unit}</strong> · Min: {p.min_stock}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Top 5 fornitori */}
        <div className="section">
          <div className="section-head">
            <h2>Top fornitori del mese</h2>
          </div>
          <div className="section-body">
            {topSuppliers.length === 0 ? (
              <p className="muted">Nessuna spesa nel mese corrente.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {topSuppliers.map((s, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{
                        width: 22, height: 22, borderRadius: 6, background: "var(--surface-2)",
                        display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700, color: "var(--ink-soft)",
                      }}>{i + 1}</span>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{s.name}</span>
                    </div>
                    <span className="tabular" style={{ fontWeight: 700 }}>{eur(s.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Trend spese 6 mesi */}
        <div className="section">
          <div className="section-head">
            <h2>Trend spese</h2>
            <span className="muted">Ultimi 6 mesi</span>
          </div>
          <div className="section-body">
            <div className="chart">
              {months6.map(m => (
                <div className="bar-row" key={m.key}>
                  <div className="cat"><span style={{ fontWeight: 600 }}>{m.label}</span></div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${(m.total / maxTrend) * 100}%`, background: "var(--accent)" }} />
                  </div>
                  <div className="amt tabular">{eur(m.total)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Riepilogo personale mese */}
        <div className="section">
          <div className="section-head">
            <h2>Riepilogo personale</h2>
            <span className="muted">{now.toLocaleDateString("it-IT", { month: "long", year: "numeric" })}</span>
          </div>
          <div className="section-body" style={{ padding: 0 }}>
            {staffSummary.length === 0 ? (
              <div style={{ padding: "32px 22px", textAlign: "center" }}>
                <p className="muted">Nessun turno registrato questo mese.</p>
              </div>
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Tipo</th>
                    <th style={{ textAlign: "right" }}>Ore</th>
                    <th style={{ textAlign: "right" }}>Costo</th>
                  </tr>
                </thead>
                <tbody>
                  {staffSummary.map(s => (
                    <tr key={s.name}>
                      <td><strong>{s.name}</strong></td>
                      <td><span className="tag">{s.type === "a_chiamata" ? "A chiamata" : "Dipendente"}</span></td>
                      <td className="tabular" style={{ textAlign: "right", fontWeight: 600 }}>{s.hours}h</td>
                      <td className="tabular" style={{ textAlign: "right", fontWeight: 600 }}>{s.cost != null ? eur(s.cost) : "—"}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: "2px solid var(--line)" }}>
                    <td colSpan={3} style={{ textAlign: "right", fontWeight: 700 }}>Totale a chiamata</td>
                    <td className="tabular" style={{ textAlign: "right", fontWeight: 700 }}>{eur(totalOnCallCost)}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* ── Full-width sections ── */}
      <div className="section">
        <div className="section-head">
          <h2>Spese per categoria · {curY}</h2>
          <span className="muted">{eur(sumYear)}</span>
        </div>
        <div className="section-body">
          {bars.length === 0 ? (
            <p className="muted">Nessuna spesa registrata quest&apos;anno.</p>
          ) : (
            <div className="chart">
              {bars.map(b => (
                <div className="bar-row" key={b.name}>
                  <div className="cat"><span className="dot" style={{ background: b.color }} /><span className="hide-sm">{b.name}</span></div>
                  <div className="bar-track"><div className="bar-fill" style={{ width: `${(b.val / maxBar) * 100}%`, background: b.color }} /></div>
                  <div className="amt tabular">{eur(b.val)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h2>Ultime spese</h2>
          <Link href="/spese" className="muted" style={{ fontWeight: 600 }}>Vedi tutte →</Link>
        </div>
        <div className="section-body" style={{ padding: 0 }}>
          {recent.length === 0 ? (
            <div className="empty">
              <div className="serif">Ancora nessuna spesa</div>
              <div>Premi &quot;Nuova&quot; per registrare la prima.</div>
            </div>
          ) : (
            <table className="tbl">
              <thead>
                <tr><th>Data</th><th>Fornitore</th><th className="hide-sm">Categoria</th><th style={{ textAlign: "right" }}>Importo</th></tr>
              </thead>
              <tbody>
                {recent.map(e => (
                  <tr key={e.id}>
                    <td>{fmtDate(e.expense_date)}</td>
                    <td>
                      <strong>{e.supplier_name || "—"}</strong>
                      {e.payment_status === "da_pagare" && <span className="badge warn" style={{ marginLeft: 8 }}>da pagare</span>}
                    </td>
                    <td className="hide-sm"><span className="tag"><span className="dot" style={{ background: e.categories?.color ?? "#9C8E78" }} />{e.categories?.name ?? "Altro"}</span></td>
                    <td className="amt-cell tabular" style={{ textAlign: "right" }}>{eur(Number(e.amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
