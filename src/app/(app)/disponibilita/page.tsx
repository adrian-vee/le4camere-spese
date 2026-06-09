"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRole } from "@/lib/useRole";
import { WEEKDAYS, type ShiftTypeRow } from "@/lib/turni";

type AvailStatus = "available" | "preferred" | "unavailable";
type ViewMode = "month" | "week";
type WeekSlot = { date: string; weekday: number; label: string };

const STATUS_STYLE: Record<AvailStatus, { bg: string; color: string; label: string; icon: string }> = {
  available:   { bg: "#E3EEE4", color: "#2D5A3D", label: "Disponibile",       icon: "\u2713" },
  preferred:   { bg: "#F5EEDB", color: "#BFA762", label: "Preferito",         icon: "\u2605" },
  unavailable: { bg: "#F3D9D5", color: "#9E3B2E", label: "Non disponibile",   icon: "\u2717" },
};

function mondayOf(d: Date): Date {
  const day = d.getDay();
  const m = new Date(d);
  m.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  m.setHours(0, 0, 0, 0);
  return m;
}

function buildWeek(monday: Date): WeekSlot[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return { date: d.toISOString().slice(0, 10), weekday: i + 1, label: d.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" }) };
  });
}

function fmtWeekRange(monday: Date) {
  const sun = new Date(monday); sun.setDate(monday.getDate() + 6);
  const f = (d: Date) => d.toLocaleDateString("it-IT", { day: "numeric", month: "long" });
  return `${f(monday)} \u2014 ${f(sun)}`;
}

function buildMonthDates(year: number, month: number): string[] {
  const last = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, "0");
  return Array.from({ length: last }, (_, i) => `${year}-${mm}-${String(i + 1).padStart(2, "0")}`);
}

function buildCalendarWeeks(year: number, month: number): (string | null)[][] {
  const dates = buildMonthDates(year, month);
  const firstDow = new Date(year, month - 1, 1).getDay();
  const pad = firstDow === 0 ? 6 : firstDow - 1;
  const weeks: (string | null)[][] = [];
  let row: (string | null)[] = new Array(pad).fill(null);
  for (const d of dates) {
    row.push(d);
    if (row.length === 7) { weeks.push(row); row = []; }
  }
  if (row.length) { while (row.length < 7) row.push(null); weeks.push(row); }
  return weeks;
}

function cycleStatus(s: AvailStatus): AvailStatus {
  return s === "available" ? "preferred" : s === "preferred" ? "unavailable" : "available";
}

function fmtMonth(y: number, m: number) {
  const s = new Date(y, m - 1, 1).toLocaleDateString("it-IT", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function DisponibilitaPage() {
  const supabase = createClient();
  const { role, userId, loading: roleLoading } = useRole();

  const [myStaffId, setMyStaffId] = useState<string | null>(null);
  const [myStaffType, setMyStaffType] = useState<string | null>(null);
  const [shiftTypes, setShiftTypes] = useState<ShiftTypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("month");

  /* ── Month state ── */
  const [monthYear, setMonthYear] = useState(() => {
    const n = new Date();
    const next = new Date(n.getFullYear(), n.getMonth() + 1, 1);
    return { year: next.getFullYear(), month: next.getMonth() + 1 };
  });
  const monthDates = useMemo(() => buildMonthDates(monthYear.year, monthYear.month), [monthYear]);
  const calWeeks = useMemo(() => buildCalendarWeeks(monthYear.year, monthYear.month), [monthYear]);
  const mLabel = useMemo(() => fmtMonth(monthYear.year, monthYear.month), [monthYear]);
  const monthStartIso = `${monthYear.year}-${String(monthYear.month).padStart(2, "0")}-01`;
  const monthEndIso = monthDates[monthDates.length - 1];

  /* ── Week state ── */
  const [weekOffset, setWeekOffset] = useState(1);
  const monday = useMemo(() => { const m = mondayOf(new Date()); m.setDate(m.getDate() + weekOffset * 7); return m; }, [weekOffset]);
  const week = useMemo(() => buildWeek(monday), [monday]);
  const weekStart = week[0].date;

  /* ── Grid (shared) ── */
  const [grid, setGrid] = useState<Map<string, AvailStatus>>(new Map());
  const [submitted, setSubmitted] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);

  /* ── Admin ── */
  const isManager = role === "admin" || role === "manager";
  const [aChiamataStaff, setAChiamataStaff] = useState<{ id: string; name: string }[]>([]);
  const [allSubmissions, setAllSubmissions] = useState<{
    staff_id: string; staff_name: string; submitted_at: string;
    slots: { avail_date: string; shift_type_id: string; status: AvailStatus }[];
  }[]>([]);

  const canSubmit = myStaffType === "a_chiamata";

  /* ============ DATA LOADING ============ */

  useEffect(() => {
    if (roleLoading) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleLoading, viewMode, monthYear.year, monthYear.month, weekStart]);

  async function loadData() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const [{ data: profileData }, { data: staffAllData }, { data: stData }] = await Promise.all([
      supabase.from("profiles").select("full_name").eq("id", user.id).single(),
      supabase.from("staff").select("id, name, type, profile_id, active").eq("active", true),
      supabase.from("shift_types").select("*").order("sort"),
    ]);

    const sts = (stData ?? []) as ShiftTypeRow[];
    setShiftTypes(sts);
    const staffAll = (staffAllData ?? []) as { id: string; name: string; type: string; profile_id: string | null }[];
    const fullName = (profileData as { full_name: string | null } | null)?.full_name ?? "";
    const myStaff = staffAll.find(s => s.profile_id === user.id) ?? staffAll.find(s => s.name === fullName) ?? null;
    setMyStaffId(myStaff?.id ?? null);
    setMyStaffType(myStaff?.type ?? null);

    const aChiamata = staffAll.filter(s => s.type === "a_chiamata");
    setAChiamataStaff(aChiamata.map(s => ({ id: s.id, name: s.name })));

    if (viewMode === "month") await loadMonth(myStaff, sts, aChiamata);
    else await loadWeekData(myStaff, sts, aChiamata);
    setLoading(false);
  }

  type StaffRef = { id: string; type: string } | null;

  async function loadMonth(myStaff: StaffRef, sts: ShiftTypeRow[], aChiamata: { id: string; name: string }[]) {
    if (myStaff && myStaff.type === "a_chiamata") {
      const [{ data: availData }, { data: subData }] = await Promise.all([
        supabase.from("staff_week_availability").select("avail_date, shift_type_id, available, status")
          .eq("staff_id", myStaff.id).gte("avail_date", monthStartIso).lte("avail_date", monthEndIso),
        supabase.from("staff_availability_submissions").select("submitted_at")
          .eq("staff_id", myStaff.id).eq("month_start", monthStartIso).maybeSingle(),
      ]);
      const g = new Map<string, AvailStatus>();
      for (const d of monthDates) for (const st of sts) g.set(`${d}|${st.id}`, "available");
      for (const r of (availData ?? []) as { avail_date: string; shift_type_id: string; available: boolean; status?: string }[]) {
        g.set(`${r.avail_date}|${r.shift_type_id}`, (r.status as AvailStatus) || (r.available ? "available" : "unavailable"));
      }
      setGrid(g);
      setSubmitted(!!subData);
      setSubmittedAt((subData as { submitted_at: string } | null)?.submitted_at ?? null);
    }
    if (isManager) {
      const ids = aChiamata.map(s => s.id);
      if (ids.length === 0) { setAllSubmissions([]); return; }
      const [{ data: subsData }, { data: allAvailData }] = await Promise.all([
        supabase.from("staff_availability_submissions").select("staff_id, submitted_at").eq("month_start", monthStartIso),
        supabase.from("staff_week_availability").select("staff_id, avail_date, shift_type_id, available, status")
          .gte("avail_date", monthStartIso).lte("avail_date", monthEndIso).in("staff_id", ids),
      ]);
      const subs = (subsData ?? []) as { staff_id: string; submitted_at: string }[];
      const allA = (allAvailData ?? []) as { staff_id: string; avail_date: string; shift_type_id: string; available: boolean; status?: string }[];
      setAllSubmissions(aChiamata.filter(s => subs.some(x => x.staff_id === s.id)).map(s => ({
        staff_id: s.id, staff_name: s.name,
        submitted_at: subs.find(x => x.staff_id === s.id)!.submitted_at,
        slots: allA.filter(a => a.staff_id === s.id).map(a => ({
          avail_date: a.avail_date, shift_type_id: a.shift_type_id,
          status: (a.status as AvailStatus) || (a.available ? "available" : "unavailable"),
        })),
      })));
    }
  }

  async function loadWeekData(myStaff: StaffRef, sts: ShiftTypeRow[], aChiamata: { id: string; name: string }[]) {
    if (myStaff && myStaff.type === "a_chiamata") {
      const weekEnd = week[6].date;
      const [{ data: availData }, { data: subData }] = await Promise.all([
        supabase.from("staff_week_availability").select("avail_date, shift_type_id, available, status")
          .eq("staff_id", myStaff.id).gte("avail_date", weekStart).lte("avail_date", weekEnd),
        supabase.from("staff_availability_submissions").select("submitted_at")
          .eq("staff_id", myStaff.id).eq("week_start", weekStart).maybeSingle(),
      ]);
      const g = new Map<string, AvailStatus>();
      for (const slot of week) for (const st of sts) g.set(`${slot.date}|${st.id}`, "available");
      for (const r of (availData ?? []) as { avail_date: string; shift_type_id: string; available: boolean; status?: string }[]) {
        g.set(`${r.avail_date}|${r.shift_type_id}`, (r.status as AvailStatus) || (r.available ? "available" : "unavailable"));
      }
      setGrid(g);
      setSubmitted(!!subData);
      setSubmittedAt((subData as { submitted_at: string } | null)?.submitted_at ?? null);
    }
    if (isManager) {
      const weekEnd = week[6].date;
      const ids = aChiamata.map(s => s.id);
      if (ids.length === 0) { setAllSubmissions([]); return; }
      const [{ data: subsData }, { data: allAvailData }] = await Promise.all([
        supabase.from("staff_availability_submissions").select("staff_id, submitted_at").eq("week_start", weekStart),
        supabase.from("staff_week_availability").select("staff_id, avail_date, shift_type_id, available, status")
          .gte("avail_date", weekStart).lte("avail_date", weekEnd).in("staff_id", ids),
      ]);
      const subs = (subsData ?? []) as { staff_id: string; submitted_at: string }[];
      const allA = (allAvailData ?? []) as { staff_id: string; avail_date: string; shift_type_id: string; available: boolean; status?: string }[];
      setAllSubmissions(aChiamata.filter(s => subs.some(x => x.staff_id === s.id)).map(s => ({
        staff_id: s.id, staff_name: s.name,
        submitted_at: subs.find(x => x.staff_id === s.id)!.submitted_at,
        slots: allA.filter(a => a.staff_id === s.id).map(a => ({
          avail_date: a.avail_date, shift_type_id: a.shift_type_id,
          status: (a.status as AvailStatus) || (a.available ? "available" : "unavailable"),
        })),
      })));
    }
  }

  /* ============ GRID MANIPULATION ============ */

  function toggleMonthSlot(date: string, stId: string) {
    setGrid(p => { const n = new Map(p); n.set(`${date}|${stId}`, cycleStatus(p.get(`${date}|${stId}`) ?? "available")); return n; });
  }
  function toggleWeekSlot(date: string, stId: string) {
    setGrid(p => { const n = new Map(p); const k = `${date}|${stId}`; n.set(k, p.get(k) === "unavailable" ? "available" : "unavailable"); return n; });
  }
  function toggleDay(date: string) {
    const allAvail = shiftTypes.every(st => (grid.get(`${date}|${st.id}`) ?? "available") !== "unavailable");
    setGrid(p => { const n = new Map(p); for (const st of shiftTypes) n.set(`${date}|${st.id}`, allAvail ? "unavailable" : "available"); return n; });
  }
  function monthQuick(mode: "all" | "weekdays" | "weekends" | "none") {
    setGrid(p => {
      const n = new Map(p);
      for (const d of monthDates) {
        const dow = new Date(d + "T00:00:00").getDay();
        const isWe = dow === 0 || dow === 6;
        const s: AvailStatus = mode === "all" ? "available" : mode === "none" ? "unavailable" : mode === "weekdays" ? (isWe ? "unavailable" : "available") : (isWe ? "available" : "unavailable");
        for (const st of shiftTypes) n.set(`${d}|${st.id}`, s);
      }
      return n;
    });
  }
  function weekSelectAll(val: boolean) {
    setGrid(p => { const n = new Map(p); for (const slot of week) for (const st of shiftTypes) n.set(`${slot.date}|${st.id}`, val ? "available" : "unavailable"); return n; });
  }

  /* ============ SAVE ============ */

  async function saveMonth() {
    if (!myStaffId) return;
    setSaving(true);
    await supabase.from("staff_week_availability").delete().eq("staff_id", myStaffId).gte("avail_date", monthStartIso).lte("avail_date", monthEndIso);
    const rows = monthDates.flatMap(d => shiftTypes.map(st => {
      const status = grid.get(`${d}|${st.id}`) ?? "available";
      return { staff_id: myStaffId, avail_date: d, shift_type_id: st.id, available: status !== "unavailable", status };
    }));
    await supabase.from("staff_week_availability").insert(rows);
    await supabase.from("staff_availability_submissions").delete().eq("staff_id", myStaffId).eq("month_start", monthStartIso);
    await supabase.from("staff_availability_submissions").insert({ staff_id: myStaffId, month_start: monthStartIso, submitted_at: new Date().toISOString() });
    setSubmitted(true); setSubmittedAt(new Date().toISOString()); setSaving(false);
    setToast("Disponibilit\u00e0 mensile salvata!"); setTimeout(() => setToast(""), 3000);
  }

  async function saveWeek() {
    if (!myStaffId) return;
    setSaving(true);
    const weekEnd = week[6].date;
    await supabase.from("staff_week_availability").delete().eq("staff_id", myStaffId).gte("avail_date", weekStart).lte("avail_date", weekEnd);
    const rows = week.flatMap(slot => shiftTypes.map(st => {
      const status = grid.get(`${slot.date}|${st.id}`) ?? "available";
      return { staff_id: myStaffId, avail_date: slot.date, shift_type_id: st.id, available: status !== "unavailable", status };
    }));
    await supabase.from("staff_week_availability").insert(rows);
    await supabase.from("staff_availability_submissions").upsert(
      { staff_id: myStaffId, week_start: weekStart, submitted_at: new Date().toISOString() },
      { onConflict: "staff_id,week_start" },
    );
    setSubmitted(true); setSubmittedAt(new Date().toISOString()); setSaving(false);
    setToast("Disponibilit\u00e0 settimanale salvata!"); setTimeout(() => setToast(""), 3000);
  }

  /* ============ STATS ============ */

  const monthStats = useMemo(() => {
    if (viewMode !== "month") return null;
    const perST: Record<string, number> = {};
    let daysAvail = 0;
    for (const d of monthDates) {
      let has = false;
      for (const st of shiftTypes) {
        if ((grid.get(`${d}|${st.id}`) ?? "available") !== "unavailable") { perST[st.id] = (perST[st.id] ?? 0) + 1; has = true; }
      }
      if (has) daysAvail++;
    }
    return { daysAvail, total: monthDates.length, perST };
  }, [viewMode, grid, monthDates, shiftTypes]);

  const weekAvailCount = useMemo(() => {
    if (viewMode !== "week") return 0;
    let c = 0; for (const [, v] of grid) if (v !== "unavailable") c++; return c;
  }, [viewMode, grid]);

  /* ============ NAV ============ */
  const prevMonth = () => setMonthYear(p => { const d = new Date(p.year, p.month - 2, 1); return { year: d.getFullYear(), month: d.getMonth() + 1 }; });
  const nextMonth = () => setMonthYear(p => { const d = new Date(p.year, p.month, 1); return { year: d.getFullYear(), month: d.getMonth() + 1 }; });

  const todayIso = new Date().toISOString().slice(0, 10);

  /* ============ RENDER ============ */

  if (roleLoading || loading) return (
    <>
      <div style={{ marginBottom: 24 }}><h1 className="serif" style={{ fontSize: 24, fontWeight: 500 }}>Disponibilit\u00e0</h1></div>
      <div className="section"><div className="section-body"><div className="empty">Caricamento\u2026</div></div></div>
    </>
  );

  return (
    <>
      {/* Header + toggle */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 className="serif" style={{ fontSize: 24, fontWeight: 500 }}>Disponibilit\u00e0</h1>
          <p className="muted" style={{ fontSize: 14, marginTop: 4 }}>
            {canSubmit ? "Indica quando sei disponibile." : isManager ? "Panoramica disponibilit\u00e0 staff a chiamata." : "Solo lo staff a chiamata pu\u00f2 inserire disponibilit\u00e0."}
          </p>
        </div>
        <div className="view-toggle">
          <button className={viewMode === "month" ? "active" : ""} onClick={() => setViewMode("month")}>Mese</button>
          <button className={viewMode === "week" ? "active" : ""} onClick={() => setViewMode("week")}>Settimana</button>
        </div>
      </div>

      {/* Navigation */}
      {viewMode === "month" ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button className="btn-ghost" style={{ padding: "8px 14px", borderRadius: 8 }} onClick={prevMonth}>\u2190</button>
          <span className="serif" style={{ fontWeight: 500, fontSize: 16, minWidth: 180, textAlign: "center" }}>{mLabel}</span>
          <button className="btn-ghost" style={{ padding: "8px 14px", borderRadius: 8 }} onClick={nextMonth}>\u2192</button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          <button className="btn-ghost" style={{ padding: "8px 14px", borderRadius: 8, fontSize: 13 }} onClick={() => setWeekOffset(w => w - 1)}>\u2190 Sett. prec.</button>
          <div style={{ fontWeight: 700, fontSize: 15, flex: 1, textAlign: "center", minWidth: 200 }}>
            {fmtWeekRange(monday)}
            {weekOffset === 0 && <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>(questa settimana)</span>}
            {weekOffset === 1 && <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>(prossima settimana)</span>}
          </div>
          <button className="btn-ghost" style={{ padding: "8px 14px", borderRadius: 8, fontSize: 13 }} onClick={() => setWeekOffset(w => w + 1)}>Sett. succ. \u2192</button>
        </div>
      )}

      {/* ══════ MONTH VIEW ══════ */}
      {viewMode === "month" && canSubmit && (
        <div className="section" style={{ borderLeft: submitted ? "3px solid #2D5A3D" : "3px solid #BFA762" }}>
          <div className="section-head">
            <h2>La mia disponibilit\u00e0 \u2014 {mLabel}</h2>
            {submitted && (
              <span style={{ fontSize: 12, fontWeight: 700, color: "#2D5A3D", background: "rgba(45,90,61,0.1)", padding: "4px 12px", borderRadius: 20 }}>
                Inviata {submittedAt ? new Date(submittedAt).toLocaleDateString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}
              </span>
            )}
          </div>
          <div className="section-body">
            {/* Legend */}
            <div style={{ display: "flex", gap: 16, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
              {(["available", "preferred", "unavailable"] as AvailStatus[]).map(k => {
                const { bg, color, label, icon } = STATUS_STYLE[k];
                return (
                  <div key={k} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                    <span style={{ width: 18, height: 18, borderRadius: 5, background: bg, border: `1.5px solid ${color}`, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, color, fontWeight: 700 }}>{icon}</span>
                    <span style={{ fontWeight: 600, color }}>{label}</span>
                  </div>
                );
              })}
              <span className="muted" style={{ fontSize: 11 }}>Clicca per cambiare stato</span>
            </div>

            {/* Quick actions */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              {([["all", "Seleziona tutti"], ["weekdays", "Solo feriali"], ["weekends", "Solo weekend"], ["none", "Deseleziona tutto"]] as [string, string][]).map(([m, l]) => (
                <button key={m} className="btn-ghost" style={{ padding: "6px 14px", borderRadius: 8, fontSize: 12 }} onClick={() => monthQuick(m as "all")}>{l}</button>
              ))}
            </div>

            {/* Calendar grid */}
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 3, tableLayout: "fixed", minWidth: 420 }}>
                <thead>
                  <tr>
                    {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map(d => (
                      <th key={d} style={{ padding: "4px 2px", fontSize: 11, fontWeight: 700, textAlign: "center", color: "var(--ink-soft)" }}>{d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {calWeeks.map((wr, wi) => (
                    <tr key={wi}>
                      {wr.map((date, di) => {
                        if (!date) return <td key={di} />;
                        const dayNum = parseInt(date.slice(8));
                        const isToday = date === todayIso;
                        const dow = new Date(date + "T00:00:00").getDay();
                        const isWe = dow === 0 || dow === 6;
                        return (
                          <td key={di} style={{ padding: 4, verticalAlign: "top", background: isToday ? "#EEFBF1" : isWe ? "var(--surface-2)" : undefined, borderRadius: 8 }}>
                            <div style={{ fontSize: 11, fontWeight: isToday ? 800 : 600, marginBottom: 3, textAlign: "center", color: isToday ? "var(--accent-dark)" : undefined }}>{dayNum}</div>
                            <div style={{ display: "flex", gap: 2, justifyContent: "center" }}>
                              {shiftTypes.map(st => {
                                const status = grid.get(`${date}|${st.id}`) ?? "available";
                                const { bg, color, icon } = STATUS_STYLE[status];
                                return (
                                  <button key={st.id} type="button" onClick={() => toggleMonthSlot(date, st.id)}
                                    title={`${st.name}: ${STATUS_STYLE[status].label}`}
                                    style={{ width: 26, height: 26, borderRadius: 5, border: `1.5px solid ${color}`, background: bg, cursor: "pointer", fontSize: 11, fontWeight: 700, color, display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit", transition: "all .12s" }}>
                                    {icon}
                                  </button>
                                );
                              })}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Shift legend */}
            <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
              {shiftTypes.map(st => (
                <div key={st.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: st.color }} />
                  <span style={{ fontWeight: 600 }}>{st.name.charAt(0).toUpperCase()}</span>
                  <span className="muted">{st.name}</span>
                </div>
              ))}
            </div>

            {/* Summary */}
            {monthStats && (
              <div style={{ marginTop: 16, padding: "12px 16px", background: "var(--surface-2)", borderRadius: 10, fontSize: 13 }}>
                <strong>{monthStats.daysAvail}</strong> giorni disponibili su <strong>{monthStats.total}</strong>
                {shiftTypes.map(st => (<span key={st.id}>, <strong>{monthStats.perST[st.id] ?? 0}</strong> {st.name.toLowerCase()}</span>))}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button className="btn btn-primary" style={{ padding: "12px 28px", fontSize: 14 }} onClick={saveMonth} disabled={saving}>
                {saving ? "Salvataggio\u2026" : submitted ? "Aggiorna disponibilit\u00e0" : "Invia disponibilit\u00e0 mese"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════ WEEK VIEW ══════ */}
      {viewMode === "week" && canSubmit && (
        <div className="section" style={{ borderLeft: submitted ? "3px solid #2D5A3D" : "3px solid #BFA762" }}>
          <div className="section-head">
            <h2>La mia disponibilit\u00e0</h2>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {submitted && (
                <span style={{ fontSize: 12, fontWeight: 700, color: "#2D5A3D", background: "rgba(45,90,61,0.1)", padding: "4px 12px", borderRadius: 20 }}>
                  Inviata {submittedAt ? new Date(submittedAt).toLocaleDateString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}
                </span>
              )}
              <span className="muted" style={{ fontSize: 12 }}>{weekAvailCount}/{week.length * shiftTypes.length} slot disponibili</span>
            </div>
          </div>
          <div className="section-body">
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <button className="btn-ghost" style={{ padding: "6px 14px", borderRadius: 8, fontSize: 12 }} onClick={() => weekSelectAll(true)}>Seleziona tutto</button>
              <button className="btn-ghost" style={{ padding: "6px 14px", borderRadius: 8, fontSize: 12 }} onClick={() => weekSelectAll(false)}>Deseleziona tutto</button>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="tbl" style={{ fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ padding: "10px 12px", minWidth: 120 }}>Fascia</th>
                    {week.map(slot => (
                      <th key={slot.date} style={{ textAlign: "center", padding: "10px 6px", minWidth: 70 }}>
                        <div style={{ fontSize: 12, fontWeight: 700 }}>{WEEKDAYS[slot.weekday - 1]}</div>
                        <div style={{ fontSize: 11, color: "var(--ink-soft)", fontWeight: 400 }}>{new Date(slot.date + "T00:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shiftTypes.map(st => (
                    <tr key={st.id}>
                      <td style={{ fontWeight: 600, fontSize: 12.5, whiteSpace: "nowrap" }}>
                        <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: st.color, marginRight: 6, verticalAlign: "middle" }} />
                        {st.name}
                        <div className="muted" style={{ fontSize: 11, fontWeight: 400 }}>{st.start_time.slice(0, 5)}\u2013{st.end_time.slice(0, 5)}</div>
                      </td>
                      {week.map(slot => {
                        const avail = (grid.get(`${slot.date}|${st.id}`) ?? "available") !== "unavailable";
                        return (
                          <td key={slot.date} style={{ textAlign: "center", padding: 6 }}>
                            <button type="button" className={`avail-cell${avail ? " on" : ""}`}
                              onClick={() => toggleWeekSlot(slot.date, st.id)} style={{ width: 36, height: 36 }}>
                              {avail && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr>
                    <td style={{ fontSize: 11, color: "var(--ink-soft)", fontWeight: 600 }}>Tutto il giorno</td>
                    {week.map(slot => {
                      const allOn = shiftTypes.every(st => (grid.get(`${slot.date}|${st.id}`) ?? "available") !== "unavailable");
                      return (
                        <td key={slot.date} style={{ textAlign: "center", padding: 6 }}>
                          <button type="button" className={`avail-cell${allOn ? " on" : ""}`} style={{ width: 36, height: 36, opacity: 0.7 }} onClick={() => toggleDay(slot.date)}>
                            {allOn && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button className="btn btn-primary" style={{ padding: "12px 28px", fontSize: 14 }} onClick={saveWeek} disabled={saving}>
                {saving ? "Salvataggio\u2026" : submitted ? "Aggiorna disponibilit\u00e0" : "Invia disponibilit\u00e0"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════ ADMIN: Submission status ══════ */}
      {isManager && (
        <div className="section" style={{ marginTop: canSubmit ? 20 : 0 }}>
          <div className="section-head">
            <h2>Stato invio \u2014 Staff a chiamata</h2>
            <span className="muted" style={{ fontSize: 13 }}>
              {allSubmissions.length}/{aChiamataStaff.length} hanno inviato per {viewMode === "month" ? mLabel : fmtWeekRange(monday)}
            </span>
          </div>
          <div className="section-body">
            {aChiamataStaff.length === 0 ? (
              <div className="empty">Nessuno staff a chiamata configurato.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {aChiamataStaff.map(s => {
                  const sub = allSubmissions.find(x => x.staff_id === s.id);
                  return (
                    <div key={s.id} style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 10,
                      background: "var(--surface)", border: "1px solid var(--line)",
                      borderLeft: `3px solid ${sub ? "#2D5A3D" : "#C77B4A"}`,
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{s.name}</div>
                        {sub ? (
                          <div className="muted" style={{ fontSize: 12 }}>
                            Inviata il {new Date(sub.submitted_at).toLocaleDateString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                            {" \u00b7 "}{sub.slots.filter(x => x.status !== "unavailable").length} slot disponibili
                          </div>
                        ) : (
                          <div style={{ fontSize: 12, color: "#C77B4A", fontWeight: 600 }}>Non ancora inviata</div>
                        )}
                      </div>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 20,
                        background: sub ? "rgba(45,90,61,0.1)" : "rgba(199,123,74,0.1)",
                        color: sub ? "#2D5A3D" : "#C77B4A",
                      }}>{sub ? "Inviata" : "In attesa"}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════ ADMIN: Detailed availability ══════ */}
      {isManager && allSubmissions.length > 0 && (
        <div className="section" style={{ marginTop: 20 }}>
          <div className="section-head"><h2>Dettaglio disponibilit\u00e0</h2></div>
          <div className="section-body">
            {viewMode === "month" ? allSubmissions.map(sub => (
              <div key={sub.staff_id} style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{sub.staff_name}</h3>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 2, tableLayout: "fixed", minWidth: 420 }}>
                    <thead>
                      <tr>
                        {["L", "M", "M", "G", "V", "S", "D"].map((d, i) => (
                          <th key={i} style={{ padding: "3px 2px", fontSize: 10, fontWeight: 700, textAlign: "center", color: "var(--ink-soft)" }}>{d}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {calWeeks.map((wr, wi) => (
                        <tr key={wi}>
                          {wr.map((date, di) => {
                            if (!date) return <td key={di} />;
                            return (
                              <td key={di} style={{ padding: 2, verticalAlign: "top", textAlign: "center" }}>
                                <div style={{ fontSize: 9, fontWeight: 600, color: "var(--ink-soft)", marginBottom: 1 }}>{parseInt(date.slice(8))}</div>
                                <div style={{ display: "flex", gap: 1, justifyContent: "center" }}>
                                  {shiftTypes.map(st => {
                                    const e = sub.slots.find(s => s.avail_date === date && s.shift_type_id === st.id);
                                    const status = e?.status ?? "unavailable";
                                    const { bg, color, icon } = STATUS_STYLE[status];
                                    return (
                                      <span key={st.id} style={{
                                        width: 16, height: 16, borderRadius: 3,
                                        background: e ? bg : "#F0EDE8", border: `1px solid ${e ? color : "#D8CCB8"}`,
                                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                                        fontSize: 7, fontWeight: 700, color: e ? color : "#AAA",
                                      }}>{e ? icon : "\u00b7"}</span>
                                    );
                                  })}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )) : allSubmissions.map(sub => (
              <div key={sub.staff_id} style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{sub.staff_name}</h3>
                <div style={{ overflowX: "auto" }}>
                  <table className="tbl" style={{ fontSize: 12.5 }}>
                    <thead>
                      <tr>
                        <th style={{ padding: "8px 10px" }}>Fascia</th>
                        {week.map(slot => (
                          <th key={slot.date} style={{ textAlign: "center", padding: "8px 6px", minWidth: 56 }}>
                            <div style={{ fontSize: 11, fontWeight: 700 }}>{WEEKDAYS[slot.weekday - 1]}</div>
                            <div style={{ fontSize: 10, color: "var(--ink-soft)" }}>{new Date(slot.date + "T00:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {shiftTypes.map(st => (
                        <tr key={st.id}>
                          <td style={{ fontWeight: 600, fontSize: 12, whiteSpace: "nowrap" }}>
                            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: st.color, marginRight: 6, verticalAlign: "middle" }} />
                            {st.name}
                          </td>
                          {week.map(slot => {
                            const e = sub.slots.find(s => s.avail_date === slot.date && s.shift_type_id === st.id);
                            const status = e?.status ?? "unavailable";
                            const { bg, color, icon } = STATUS_STYLE[status];
                            return (
                              <td key={slot.date} style={{ textAlign: "center", padding: 6 }}>
                                <span style={{
                                  display: "inline-flex", width: 28, height: 28, alignItems: "center", justifyContent: "center",
                                  borderRadius: 6, fontSize: 14, background: e ? bg : "#F0EDE8", color: e ? color : "#AAA",
                                }}>{e ? icon : "\u00b7"}</span>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Not applicable */}
      {!canSubmit && !isManager && (
        <div className="section"><div className="section-body"><div className="empty">
          <div className="serif" style={{ fontSize: 18, marginBottom: 6 }}>Non applicabile</div>
          <div>Solo lo staff con contratto \u201ca chiamata\u201d pu\u00f2 inserire la propria disponibilit\u00e0.</div>
        </div></div></div>
      )}

      {toast && <div className="toast show">{toast}</div>}
    </>
  );
}
