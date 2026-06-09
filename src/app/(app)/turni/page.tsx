"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { eur } from "@/lib/format";
import { logClientActivity } from "@/lib/activityLog";
import { useRole } from "@/lib/useRole";
import { generateSchedule, shiftHours, type Staff, type ShiftType, type CoverageReq, type Assignment, type Unavailability, type DateUnavailability } from "@/lib/scheduler";
import {
  toStaff, toShiftType, toCoverage, weekDatesFrom, monthDatesFrom, fmtDayShort, WEEKDAYS, expandAbsences,
  type StaffRow, type ShiftTypeRow, type CoverageRow, type ShiftRow, type AbsenceRow, type AvailabilityRow,
} from "@/lib/turni";

type Slot = { key: string; date: string; shift_type_id: string; staff_id: string | null };
type View = "month" | "week";

const HOURLY_RATE_ON_CALL = 8;
const isoWd = (d: string) => { const x = new Date(`${d}T00:00:00`).getDay(); return x === 0 ? 7 : x; };
const toMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

export default function TurniPage() {
  const supabase = createClient();
  const { role, userId, loading: roleLoading } = useRole();
  const isStaff = role === "staff";
  const [view, setViewRaw] = useState<View>("month");
  const setView = (v: View) => setViewRaw(isStaff ? "month" : v);
  const [anchor, setAnchor] = useState(new Date());
  const [myStaffId, setMyStaffId] = useState<string | null>(null);

  const weekDates = useMemo(() => weekDatesFrom(anchor), [anchor]);
  const activeMonth = useMemo(() => {
    if (view === "month") return { year: anchor.getFullYear(), month: anchor.getMonth() + 1 };
    const thu = weekDates[3];
    return { year: parseInt(thu.slice(0, 4)), month: parseInt(thu.slice(5, 7)) };
  }, [view, anchor, weekDates]);
  const monthDates = useMemo(() => monthDatesFrom(activeMonth.year, activeMonth.month), [activeMonth.year, activeMonth.month]);

  const monthLabel = useMemo(() => {
    const d = new Date(activeMonth.year, activeMonth.month - 1, 1);
    const s = d.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }, [activeMonth.year, activeMonth.month]);

  const [staff, setStaff] = useState<Staff[]>([]);
  const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([]);
  const [stRows, setStRows] = useState<ShiftTypeRow[]>([]);
  const [coverage, setCoverage] = useState<CoverageReq[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [absenceRows, setAbsenceRows] = useState<AbsenceRow[]>([]);
  const [unavailable, setUnavailable] = useState<Unavailability[]>([]);
  const [weekUnavailable, setWeekUnavailable] = useState<{ staff_id: string; weekday: number; shift_type_id: string; date: string }[]>([]);
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [swapDate, setSwapDate] = useState("");
  const [swapShiftTypeId, setSwapShiftTypeId] = useState("");
  const [swapTargetId, setSwapTargetId] = useState("");
  const [swapNote, setSwapNote] = useState("");
  const [swapSending, setSwapSending] = useState(false);
  const [swapRequests, setSwapRequests] = useState<any[]>([]);

  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  const monthDatesRef = useRef(monthDates);
  monthDatesRef.current = monthDates;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stById = useMemo(() => new Map(shiftTypes.map(s => [s.id, s])), [shiftTypes]);
  const staffById = useMemo(() => new Map(staff.map(s => [s.id, s])), [staff]);
  const stColorMap = useMemo(() => new Map(stRows.map(r => [r.id, r.color])), [stRows]);

  const today = new Date().toISOString().slice(0, 10);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 2000); }

  async function loadSwapRequests() {
    if (!myStaffId) return;
    const { data } = await supabase.from("shift_swap_requests")
      .select("*, requester:profiles!shift_swap_requests_requester_id_fkey(full_name)")
      .eq("target_id", myStaffId)
      .eq("status", "pending");
    setSwapRequests(data ?? []);
  }

  async function submitSwapRequest() {
    if (!swapDate || !swapTargetId || !myStaffId) return;
    setSwapSending(true);
    const mySlot = slots.find(s => s.date === swapDate && s.staff_id === myStaffId);
    const shiftType = mySlot ? stById.get(mySlot.shift_type_id)?.name ?? "" : "";
    const { error } = await supabase.from("shift_swap_requests").insert({
      requester_id: userId,
      target_id: swapTargetId,
      request_date: swapDate,
      request_shift: shiftType,
      note: swapNote || null,
      status: "pending",
    });
    setSwapSending(false);
    if (error) { showToast("Errore: " + error.message); return; }
    showToast("Richiesta inviata");
    setShowSwapModal(false);
    setSwapDate(""); setSwapTargetId(""); setSwapNote("");
  }

  async function respondSwapRequest(id: string, accept: boolean) {
    const { error } = await supabase.from("shift_swap_requests")
      .update({ status: accept ? "approved" : "rejected", responded_at: new Date().toISOString() })
      .eq("id", id);
    if (error) { showToast("Errore: " + error.message); return; }
    showToast(accept ? "Richiesta accettata" : "Richiesta rifiutata");
    setSwapRequests(prev => prev.filter(r => r.id !== id));
  }

  function buildEmptySlots(dates: string[], cov: CoverageReq[], types: ShiftType[]): Slot[] {
    const typeMap = new Map(types.map(t => [t.id, t]));
    const out: Slot[] = [];
    for (const date of dates) {
      const wd = isoWd(date);
      const reqs = cov.filter(c => c.weekday === wd && c.count > 0)
        .sort((a, b) => (typeMap.get(a.shift_type_id)?.start ?? "").localeCompare(typeMap.get(b.shift_type_id)?.start ?? ""));
      for (const r of reqs) for (let i = 0; i < r.count; i++)
        out.push({ key: `${date}|${r.shift_type_id}|${i}`, date, shift_type_id: r.shift_type_id, staff_id: null });
    }
    return out;
  }

  function fill(base: Slot[], assignments: Assignment[]): Slot[] {
    const next = base.map(s => ({ ...s, staff_id: null as string | null }));
    for (const a of assignments) {
      if (!a.staff_id) continue;
      const slot = next.find(s => s.date === a.date && s.shift_type_id === a.shift_type_id && s.staff_id === null);
      if (slot) slot.staff_id = a.staff_id;
    }
    return next;
  }

  async function loadAll() {
    setLoading(true);
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const [{ data: st }, { data: ty }, { data: cov }, { data: sh }, { data: abs }, { data: avail }, { data: weekAvail }] = await Promise.all([
      supabase.from("staff").select("*").eq("active", true).order("name"),
      supabase.from("shift_types").select("*").order("sort"),
      supabase.from("coverage_template").select("*"),
      supabase.from("shifts").select("*").gte("shift_date", monthDates[0]).lte("shift_date", monthDates[monthDates.length - 1]),
      supabase.from("absences").select("*"),
      supabase.from("staff_availability").select("*").eq("available", false),
      // Week-specific availability (from staff submissions)
      supabase.from("staff_week_availability").select("staff_id, avail_date, shift_type_id, available")
        .gte("avail_date", monthDates[0]).lte("avail_date", monthDates[monthDates.length - 1]).eq("available", false),
    ]);
    const rawTypes = (ty ?? []) as ShiftTypeRow[];
    const staffArr = ((st ?? []) as StaffRow[]).map(toStaff);
    const typeArr = rawTypes.map(toShiftType);
    const covArr = ((cov ?? []) as CoverageRow[]).map(toCoverage);
    const absRows = (abs ?? []) as AbsenceRow[];
    const unavailRows = (avail ?? []) as AvailabilityRow[];

    // Merge generic weekly unavailability with week-specific unavailability
    const baseUnavail = unavailRows.map(r => ({ staff_id: r.staff_id, weekday: r.weekday, shift_type_id: r.shift_type_id }));

    // Week-specific: convert date-based entries to weekday-based entries for the scheduler
    // These are more specific, so they add to base unavailability
    const weekSpecific = ((weekAvail ?? []) as { staff_id: string; avail_date: string; shift_type_id: string; available: boolean }[])
      .map(r => ({ staff_id: r.staff_id, weekday: isoWd(r.avail_date), shift_type_id: r.shift_type_id, date: r.avail_date }));

    setStaff(staffArr);
    setShiftTypes(typeArr);
    setStRows(rawTypes);
    setCoverage(covArr);
    setAbsenceRows(absRows);
    setUnavailable(baseUnavail);
    setWeekUnavailable(weekSpecific);

    const base = buildEmptySlots(monthDates, covArr, typeArr);
    const shifts = (sh ?? []) as ShiftRow[];
    if (shifts.length > 0) {
      const asg: Assignment[] = shifts.map(s => ({ date: s.shift_date, shift_type_id: s.shift_type_id, staff_id: s.staff_id }));
      setSlots(fill(base, asg));
      setSaved(true);
    } else {
      setSlots(base);
    }
    setWarnings([]);
    setLoading(false);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadAll(); }, [monthDates.join(",")]);

  /* ── Resolve logged-in user → staff record (for staff highlight) ── */
  useEffect(() => {
    if (!userId || !isStaff || staff.length === 0) return;
    (async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", userId)
        .single();
      if (!profile?.full_name) return;
      const normalise = (s: string) => s.trim().toLowerCase();
      const match = staff.find(s => normalise(s.name) === normalise(profile.full_name!));
      if (match) {
        setMyStaffId(match.id);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, isStaff, staff.length]);

  // Load swap requests when myStaffId is set
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadSwapRequests(); }, [myStaffId]);

  function prevMonth() { setAnchor(new Date(activeMonth.year, activeMonth.month - 2, 15)); }
  function nextMonth() { setAnchor(new Date(activeMonth.year, activeMonth.month, 15)); }
  function prevWeek() { setAnchor(new Date(anchor.getTime() - 7 * 864e5)); }
  function nextWeek() { setAnchor(new Date(anchor.getTime() + 7 * 864e5)); }
  function goToday() { setAnchor(new Date()); }

  function genera() {
    const allAbsences = expandAbsences(absenceRows, monthDates[0], monthDates[monthDates.length - 1]);
    // Convert week-specific unavailability to DateUnavailability format
    const dateUnavail: DateUnavailability[] = weekUnavailable.map(u => ({ staff_id: u.staff_id, date: u.date, shift_type_id: u.shift_type_id }));
    const res = generateSchedule(monthDates, staff, shiftTypes, coverage, allAbsences, unavailable, dateUnavail);
    setSlots(fill(buildEmptySlots(monthDates, coverage, shiftTypes), res.assignments));
    setWarnings(res.warnings);
    setSaved(false);
  }

  /* ── Auto-save ── */
  async function doSave() {
    setSaving(true);
    const dates = monthDatesRef.current;
    const current = slotsRef.current;
    await supabase.from("shifts").delete().gte("shift_date", dates[0]).lte("shift_date", dates[dates.length - 1]);
    const rows = current.filter(s => s.staff_id).map(s => ({
      shift_date: s.date, shift_type_id: s.shift_type_id, staff_id: s.staff_id, status: "draft",
    }));
    if (rows.length) {
      const { error } = await supabase.from("shifts").insert(rows);
      if (error) { showToast("Errore salvataggio"); setSaving(false); return; }
    }
    logClientActivity("update", "turni", `Turni salvati per ${dates[0]} → ${dates[dates.length - 1]}`, { shifts: rows.length });
    setSaved(true);
    setSaving(false);
    showToast("Salvato");
  }

  function setSlotValue(key: string, staff_id: string | null) {
    setSlots(prev => prev.map(s => s.key === key ? { ...s, staff_id } : s));
    slotsRef.current = slotsRef.current.map(s => s.key === key ? { ...s, staff_id } : s);
    setFlashKey(key);
    setTimeout(() => setFlashKey(null), 600);
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(doSave, 1000);
  }

  async function salvaManuale() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await doSave();
  }

  /* ── Computed values ── */
  const currentWeekDates = useMemo(() => weekDatesFrom(new Date()), []);
  const summaryWeekDates = view === "week" ? weekDates : currentWeekDates;

  const { monthHoursMap, weekHoursMap } = useMemo(() => {
    const mh: Record<string, number> = {};
    const wh: Record<string, number> = {};
    const weekSet = new Set(summaryWeekDates);
    for (const s of slots) {
      if (!s.staff_id) continue;
      const t = stById.get(s.shift_type_id);
      if (!t) continue;
      const h = shiftHours(t);
      mh[s.staff_id] = (mh[s.staff_id] ?? 0) + h;
      if (weekSet.has(s.date)) wh[s.staff_id] = (wh[s.staff_id] ?? 0) + h;
    }
    return { monthHoursMap: mh, weekHoursMap: wh };
  }, [slots, stById, summaryWeekDates]);

  const { totalWeekCost, totalMonthCost } = useMemo(() => {
    let twc = 0, tmc = 0;
    for (const p of staff) {
      if (p.type !== "a_chiamata") continue;
      twc += (weekHoursMap[p.id] ?? 0) * HOURLY_RATE_ON_CALL;
      tmc += (monthHoursMap[p.id] ?? 0) * HOURLY_RATE_ON_CALL;
    }
    return { totalWeekCost: twc, totalMonthCost: tmc };
  }, [staff, weekHoursMap, monthHoursMap]);

  const gaps = slots.filter(s => !s.staff_id).length;
  const totalPlannedHours = useMemo(() => Object.values(monthHoursMap).reduce((s, h) => s + h, 0), [monthHoursMap]);

  const byDateAndType = useMemo(() => {
    const m: Record<string, Record<string, Slot[]>> = {};
    for (const s of slots) {
      if (!m[s.date]) m[s.date] = {};
      if (!m[s.date][s.shift_type_id]) m[s.date][s.shift_type_id] = [];
      m[s.date][s.shift_type_id].push(s);
    }
    return m;
  }, [slots]);

  const byDate = useMemo(() => {
    const m: Record<string, Slot[]> = {};
    for (const s of slots) {
      if (!weekDates.includes(s.date)) continue;
      (m[s.date] ||= []).push(s);
    }
    return m;
  }, [slots, weekDates]);

  const monthAbsences = useMemo(() => {
    return absenceRows.filter(r => {
      const end = r.end_date || r.absent_date;
      return r.absent_date <= monthDates[monthDates.length - 1] && end >= monthDates[0];
    });
  }, [absenceRows, monthDates]);

  /* ── Constraint warnings ── */
  const constraintWarnings = useMemo(() => {
    const warns: string[] = [];
    for (const p of staff) {
      // 6+ consecutive working days (D.Lgs 66/2003)
      let consecutive = 0;
      let maxRun = 0;
      for (const date of monthDates) {
        if (slots.some(s => s.date === date && s.staff_id === p.id)) {
          consecutive++;
          if (consecutive > maxRun) maxRun = consecutive;
        } else {
          consecutive = 0;
        }
      }
      if (maxRun > 6) {
        warns.push(`${p.name}: ${maxRun} giorni consecutivi senza riposo (max 6, D.Lgs 66/2003)`);
      }

      // Insufficient rest between shifts (< 11h)
      for (let i = 0; i < monthDates.length - 1; i++) {
        const d1 = monthDates[i], d2 = monthDates[i + 1];
        const s1 = slots.filter(s => s.date === d1 && s.staff_id === p.id);
        const s2 = slots.filter(s => s.date === d2 && s.staff_id === p.id);
        for (const a of s1) {
          const tA = stById.get(a.shift_type_id);
          if (!tA) continue;
          for (const b of s2) {
            const tB = stById.get(b.shift_type_id);
            if (!tB) continue;
            const endMin = toMin(tA.end);
            const startMin = toMin(tA.start);
            const isOvernight = endMin <= startMin;
            const nextStartMin = toMin(tB.start);
            const rest = isOvernight
              ? (nextStartMin - endMin)
              : (24 * 60 - endMin + nextStartMin);
            if (rest >= 0 && rest < 11 * 60) {
              warns.push(`${p.name}: riposo insufficiente (<11h) tra ${fmtDayShort(d1)} (${tA.name}) e ${fmtDayShort(d2)} (${tB.name})`);
            }
          }
        }
      }
    }
    return warns;
  }, [slots, staff, monthDates, stById]);

  /* ── Monthly coverage breakdown ── */
  const monthlyCoverage = useMemo(() => {
    return staff.map(p => {
      const byType: Record<string, number> = {};
      const workedDates = new Set<string>();
      for (const s of slots) {
        if (s.staff_id !== p.id) continue;
        byType[s.shift_type_id] = (byType[s.shift_type_id] ?? 0) + 1;
        workedDates.add(s.date);
      }
      const workDays = workedDates.size;
      const restDays = monthDates.length - workDays;
      const totalHours = monthHoursMap[p.id] ?? 0;
      const monthWeeks = monthDates.length / 7;
      const maxHours = p.hours_per_week > 0 ? p.hours_per_week * monthWeeks : 0;
      const overHours = maxHours > 0 && totalHours > maxHours;
      // D.Lgs 66/2003: at least 1 rest per 6 working days → minimum rest days = floor(workDays / 6)
      const minRestNeeded = Math.floor(workDays / 6);
      const lowRest = restDays < minRestNeeded;
      return { staffId: p.id, staffName: p.name, staffType: p.type as string, byType, totalHours, workDays, restDays, overHours, lowRest };
    });
  }, [slots, staff, monthDates, monthHoursMap]);

  /* ── Daily coverage (needed vs assigned) ── */
  const dailyCoverageGaps = useMemo(() => {
    const gapDays: { date: string; needed: number; assigned: number }[] = [];
    for (const date of monthDates) {
      const wd = isoWd(date);
      const needed = coverage.filter(c => c.weekday === wd).reduce((s, c) => s + c.count, 0);
      const assigned = slots.filter(s => s.date === date && s.staff_id).length;
      if (assigned < needed) gapDays.push({ date, needed, assigned });
    }
    return gapDays;
  }, [monthDates, coverage, slots]);

  const weekLabel = `${fmtDayShort(weekDates[0])}–${fmtDayShort(weekDates[6])}`;

  const allWarnings = [...warnings, ...constraintWarnings];

  return (
    <>
      {/* ── KPI Cards ── */}
      {!isStaff && (
      <div className="cards" style={{ gridTemplateColumns: "repeat(4,1fr)", marginBottom: 20 }}>
        <div className="card" style={{ borderLeft: gaps > 0 ? "3px solid #9E3B2E" : "3px solid #2D5A3D" }}>
          <div className="label">Turni scoperti</div>
          <div className="value tabular" style={{ color: gaps > 0 ? "#9E3B2E" : "#2D5A3D" }}>{gaps}</div>
          <div className="meta">{gaps > 0 ? "Da coprire" : "Tutti coperti"}</div>
        </div>
        <div className="card">
          <div className="label">Ore pianificate</div>
          <div className="value tabular">{Math.round(totalPlannedHours)}h</div>
          <div className="meta">{monthLabel}</div>
        </div>
        <div className="card">
          <div className="label">Dipendenti attivi</div>
          <div className="value tabular">{staff.length}</div>
        </div>
        <div className="card accent">
          <div className="label">Costo stimato</div>
          <div className="value tabular">{eur(totalMonthCost)}</div>
          <div className="meta">personale a chiamata</div>
        </div>
      </div>
      )}

      {/* ── Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 16 }}>
        <h1 className="serif" style={{ fontSize: 24, fontWeight: 500 }}>{isStaff ? `I miei turni · ${monthLabel}` : `Turni · ${monthLabel}`}</h1>
        {!isStaff && (
        <div className="view-toggle">
          <button className={view === "month" ? "active" : ""} onClick={() => setView("month")}>Mese</button>
          <button className={view === "week" ? "active" : ""} onClick={() => setView("week")}>Settimana</button>
        </div>
        )}
      </div>

      {/* ── Controls ── */}
      <div className="section" style={{ marginBottom: 20 }}>
        <div className="section-body" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {view === "month" ? (
              <>
                <button className="btn-ghost" style={{ padding: "8px 14px", borderRadius: 9, fontSize: 14 }} onClick={prevMonth}>←</button>
                <span className="serif" style={{ fontWeight: 500, fontSize: 16, minWidth: 180, textAlign: "center" }}>{monthLabel}</span>
                <button className="btn-ghost" style={{ padding: "8px 14px", borderRadius: 9, fontSize: 14 }} onClick={nextMonth}>→</button>
                <button className="btn-ghost" style={{ padding: "8px 12px", borderRadius: 9, fontSize: 13 }} onClick={goToday}>Oggi</button>
              </>
            ) : (
              <>
                <button className="btn-ghost" style={{ padding: "8px 14px", borderRadius: 9 }} onClick={prevWeek}>←</button>
                <span className="serif" style={{ fontWeight: 500, fontSize: 15, minWidth: 120, textAlign: "center" }}>{weekLabel}</span>
                <button className="btn-ghost" style={{ padding: "8px 14px", borderRadius: 9 }} onClick={nextWeek}>→</button>
                <button className="btn-ghost" style={{ padding: "8px 12px", borderRadius: 9, fontSize: 13 }} onClick={goToday}>Oggi</button>
              </>
            )}
          </div>
          {!isStaff && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button className="btn btn-primary" style={{ padding: "10px 18px" }} onClick={genera} disabled={loading || staff.length === 0}>Genera bozza</button>
              <button className="btn btn-ghost" style={{ padding: "10px 18px" }} onClick={salvaManuale} disabled={loading || saving}>
                {saving ? "Salvataggio..." : saved ? (
                  <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline", verticalAlign: "-2px", marginRight: 4 }}><path d="M20 6L9 17l-5-5" /></svg>Salvato</>
                ) : "Salva turni"}
              </button>
              <Link href={`/turni/stampa?month=${activeMonth.year}-${String(activeMonth.month).padStart(2, "0")}`} className="btn btn-ghost" style={{ padding: "10px 18px" }}>Stampa</Link>
              <Link href="/turni/copertura" className="muted" style={{ fontWeight: 600 }}>Copertura →</Link>
            </div>
          )}
        </div>
      </div>

      {/* ── Legend ── */}
      {stRows.length > 0 && (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 20, padding: "12px 18px", background: "var(--surface-2)", borderRadius: 10 }}>
          {stRows.map(st => (
            <div key={st.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <span style={{ width: 12, height: 12, borderRadius: 4, background: st.color, flexShrink: 0 }} />
              <span style={{ fontWeight: 700 }}>{st.name.charAt(0).toUpperCase()}</span>
              <span className="muted">{st.name} ({st.start_time.slice(0, 5)}–{st.end_time.slice(0, 5)})</span>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <span style={{ width: 12, height: 12, borderRadius: 4, background: "#E8E0D0", flexShrink: 0 }} />
            <span style={{ fontWeight: 700 }}>R</span>
            <span className="muted">Riposo</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <span style={{ width: 12, height: 12, borderRadius: 4, background: "#4F7B8C", flexShrink: 0 }} />
            <span style={{ fontWeight: 700 }}>F</span>
            <span className="muted">Ferie</span>
          </div>
        </div>
      )}

      {/* ── Alerts ── */}
      {staff.length === 0 && (
        <div className="section" style={{ marginBottom: 20 }}>
          <div className="section-body" style={{ textAlign: "center", padding: "24px 20px" }}>
            <p style={{ fontSize: 14, color: "var(--ink-soft)" }}>
              Aggiungi prima il personale nella sezione <Link href="/personale" style={{ fontWeight: 700, color: "var(--ink)" }}>&quot;Personale&quot;</Link>.
            </p>
          </div>
        </div>
      )}

      {!isStaff && allWarnings.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
          {allWarnings.map((w, i) => (
            <div key={i} style={{
              padding: "10px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600,
              background: "#F6E3D3", color: "var(--warn)", border: "1px solid rgba(158,59,46,.15)",
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline", verticalAlign: "-2px", marginRight: 4 }}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><path d="M12 9v4M12 17h.01" /></svg>
              {w}
            </div>
          ))}
        </div>
      )}

      {/* ── Grid ── */}
      {(loading || roleLoading) ? (
        <div className="section"><div className="empty">Caricamento...</div></div>
      ) : view === "month" ? (
        <div className="section">
          <div className="section-head">
            <h2>Pianificazione mensile</h2>
            <span className="muted">{gaps > 0 ? `${gaps} turni scoperti` : <><span>Tutti coperti </span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline", verticalAlign: "-2px" }}><path d="M20 6L9 17l-5-5" /></svg></>}</span>
          </div>
          <div className="section-body" style={{ padding: 0, overflowX: "auto" }}>
            <table className="tbl" style={{ fontSize: 13, minWidth: 600 }}>
              <thead>
                <tr>
                  <th style={{ position: "sticky", left: 0, background: "var(--surface)", zIndex: 2, minWidth: 110 }}>Giorno</th>
                  {shiftTypes.map(st => {
                    const color = stColorMap.get(st.id);
                    return (
                      <th key={st.id} style={{ textAlign: "center", minWidth: 180 }}>
                        <div style={{ fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                          {color && <span style={{ width: 8, height: 8, borderRadius: 3, background: color }} />}
                          {st.name}
                        </div>
                        <div className="muted" style={{ fontWeight: 400, fontSize: 11 }}>{st.start}–{st.end}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {monthDates.map(date => {
                  const wd = isoWd(date);
                  const dayName = WEEKDAYS[wd - 1];
                  const isPast = date < today;
                  const isWeekend = wd >= 6;
                  const isToday = date === today;
                  const rowBg = isToday ? "#EEFBF1" : isWeekend ? "var(--surface-2)" : undefined;
                  const stickyBg = isToday ? "#EEFBF1" : isWeekend ? "var(--surface-2)" : "var(--surface)";
                  return (
                    <tr key={date} style={{ background: rowBg }}>
                      <td style={{
                        fontWeight: 600, whiteSpace: "nowrap", position: "sticky", left: 0,
                        background: stickyBg, zIndex: 1, opacity: isPast ? 0.5 : 1,
                        borderLeft: isToday ? "3px solid var(--accent)" : undefined,
                      }}>
                        <div>{dayName}</div>
                        <div className="muted" style={{ fontSize: 11, fontWeight: 500 }}>{fmtDayShort(date)}</div>
                      </td>
                      {shiftTypes.map(st => {
                        const cellSlots = byDateAndType[date]?.[st.id] ?? [];
                        return (
                          <td key={st.id} style={{ padding: "6px 10px", opacity: isPast ? 0.5 : 1, verticalAlign: "middle" }}>
                            {cellSlots.length === 0 ? (
                              <span className="muted">—</span>
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                {cellSlots.map(s => {
                                const isMyShift = isStaff && myStaffId != null && s.staff_id === myStaffId;
                                return (isPast || isStaff) ? (
                                  <div key={s.key} style={{
                                    fontSize: 13, fontWeight: 600, padding: "6px 10px",
                                    background: isMyShift ? "rgba(45,90,61,.12)" : s.staff_id ? "rgba(0,0,0,.03)" : "transparent",
                                    borderRadius: 8,
                                    border: isMyShift ? "2px solid #2D5A3D" : "1.5px solid transparent",
                                  }}>
                                    {s.staff_id ? staffById.get(s.staff_id)?.name ?? "?" : (
                                      <span style={{ color: "var(--danger)" }}>scoperto</span>
                                    )}
                                  </div>
                                ) : (
                                  <select key={s.key} value={s.staff_id ?? ""}
                                    onChange={e => setSlotValue(s.key, e.target.value || null)}
                                    style={{
                                      width: "100%", minWidth: 140, fontFamily: "inherit", fontSize: 13,
                                      padding: "8px 10px", borderRadius: 8,
                                      border: flashKey === s.key ? "2px solid #2D5A3D" : "1.5px solid var(--line)",
                                      background: flashKey === s.key ? "#E3EEE4" : s.staff_id ? "#fff" : "var(--surface-2)",
                                      color: s.staff_id ? "var(--ink)" : "var(--danger)",
                                      fontWeight: s.staff_id ? 500 : 600,
                                      transition: "border-color .3s, background .3s",
                                    }}>
                                    <option value="">— scoperto —</option>
                                    {staff.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                  </select>
                                );
                              })}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ── WEEK VIEW ── */
        <div className="section">
          <div className="section-head">
            <h2>Settimana {weekLabel}</h2>
            <span className="muted">
              {(() => { const wg = slots.filter(s => weekDates.includes(s.date) && !s.staff_id).length; return wg > 0 ? `${wg} scoperti` : <><span>Tutti coperti </span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline", verticalAlign: "-2px" }}><path d="M20 6L9 17l-5-5" /></svg></>; })()}
            </span>
          </div>
          <div className="section-body" style={{ padding: 16 }}>
            {weekDates.map((date, i) => {
              const daySlots = byDate[date] ?? [];
              const isPast = date < today;
              const isToday = date === today;
              return (
                <div key={date} style={{
                  marginBottom: 16, paddingBottom: 16,
                  borderBottom: i < 6 ? "1px solid var(--line)" : undefined,
                  opacity: isPast ? 0.5 : 1,
                }}>
                  <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
                    {isToday && <span style={{ width: 8, height: 8, borderRadius: 4, background: "var(--accent)", flexShrink: 0 }} />}
                    {WEEKDAYS[i]} <span className="muted" style={{ fontWeight: 500 }}>{fmtDayShort(date)}</span>
                    {isToday && <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)" }}>OGGI</span>}
                  </div>
                  {daySlots.length === 0 ? (
                    <div className="muted">Nessuna copertura prevista.</div>
                  ) : (
                    <div className="turni-day-grid">
                      {daySlots.map(s => {
                        const t = stById.get(s.shift_type_id);
                        const color = stColorMap.get(s.shift_type_id) ?? "var(--accent)";
                        return (
                          <div key={s.key} style={{
                            border: `1.5px solid ${s.staff_id ? "var(--line)" : "rgba(158,59,46,.25)"}`,
                            borderRadius: 12, padding: "14px 16px",
                            background: flashKey === s.key ? "#E3EEE4" : s.staff_id ? "#fff" : "rgba(158,59,46,.03)",
                            transition: "background .3s",
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                              <span style={{ width: 8, height: 8, borderRadius: 3, background: color, flexShrink: 0 }} />
                              <span style={{ fontSize: 14, fontWeight: 700 }}>{t?.name ?? "—"}</span>
                            </div>
                            <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>{t?.start}–{t?.end}</div>
                            {(() => {
                            const isMyShift = isStaff && myStaffId != null && s.staff_id === myStaffId;
                            return (isPast || isStaff) ? (
                              <div style={{
                                fontSize: 15, fontWeight: 600, padding: "10px 12px", borderRadius: 8,
                                background: isMyShift ? "rgba(45,90,61,.12)" : "rgba(0,0,0,.03)",
                                border: isMyShift ? "2px solid #2D5A3D" : "1.5px solid transparent",
                              }}>
                                {s.staff_id ? (staffById.get(s.staff_id)?.name ?? "?") : (
                                  <span style={{ color: "var(--danger)" }}>— scoperto —</span>
                                )}
                              </div>
                            ) : (
                              <select value={s.staff_id ?? ""} onChange={e => setSlotValue(s.key, e.target.value || null)}
                                style={{
                                  width: "100%", fontFamily: "inherit", fontSize: 14, padding: "10px 12px",
                                  border: "1.5px solid var(--line)", borderRadius: 10, background: "#fff",
                                  fontWeight: s.staff_id ? 500 : 600,
                                  color: s.staff_id ? "var(--ink)" : "var(--danger)",
                                }}>
                                <option value="">— scoperto —</option>
                                {staff.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                              </select>
                            );
                          })()}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Monthly Coverage Breakdown ── */}
      {!isStaff && staff.length > 0 && view === "month" && (
        <div className="section">
          <div className="section-head">
            <h2>Copertura mensile</h2>
            <span className="muted">{monthLabel}</span>
          </div>
          <div className="section-body" style={{ padding: 0, overflowX: "auto" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Persona</th>
                  {shiftTypes.map(st => (
                    <th key={st.id} style={{ textAlign: "center" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 3, background: stColorMap.get(st.id) ?? "var(--accent)" }} />
                        {st.name}
                      </span>
                    </th>
                  ))}
                  <th style={{ textAlign: "right" }}>Ore</th>
                  <th style={{ textAlign: "center" }}>Lavorati</th>
                  <th style={{ textAlign: "center" }}>Riposi</th>
                  <th>Stato</th>
                </tr>
              </thead>
              <tbody>
                {monthlyCoverage.map(row => (
                  <tr key={row.staffId}>
                    <td><strong>{row.staffName}</strong></td>
                    {shiftTypes.map(st => (
                      <td key={st.id} className="tabular" style={{ textAlign: "center", fontWeight: 600 }}>
                        {row.byType[st.id] ?? 0}
                      </td>
                    ))}
                    <td className="tabular" style={{ textAlign: "right", fontWeight: 700, color: row.overHours ? "var(--danger)" : undefined }}>
                      {row.totalHours}h
                    </td>
                    <td className="tabular" style={{ textAlign: "center" }}>{row.workDays}g</td>
                    <td className="tabular" style={{ textAlign: "center", color: row.lowRest ? "var(--danger)" : undefined, fontWeight: row.lowRest ? 700 : 400 }}>
                      {row.restDays}g
                    </td>
                    <td>
                      {row.overHours && <span className="badge" style={{ background: "rgba(158,59,46,.1)", color: "#9E3B2E", fontSize: 11, marginRight: 4 }}>Ore eccessive</span>}
                      {row.lowRest && <span className="badge" style={{ background: "rgba(158,59,46,.1)", color: "#9E3B2E", fontSize: 11 }}>Pochi riposi</span>}
                      {!row.overHours && !row.lowRest && <span className="badge" style={{ background: "#E3EEE4", color: "#2D5A3D", fontSize: 11 }}>OK</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Daily coverage gaps ── */}
      {!isStaff && dailyCoverageGaps.length > 0 && view === "month" && (
        <div className="section">
          <div className="section-head">
            <h2>Giorni con copertura insufficiente</h2>
            <span className="muted">{dailyCoverageGaps.length} giorni</span>
          </div>
          <div className="section-body">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {dailyCoverageGaps.map(g => (
                <div key={g.date} style={{
                  padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                  background: "rgba(158,59,46,.06)", border: "1px solid rgba(158,59,46,.15)", color: "#9E3B2E",
                }}>
                  {fmtDayShort(g.date)} — {g.assigned}/{g.needed} coperti
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Hours Summary ── */}
      {!isStaff && staff.length > 0 && (
        <div className="section">
          <div className="section-head">
            <h2>Riepilogo ore e costi</h2>
            <span className="muted">{view === "week" ? `Sett. ${weekLabel}` : monthLabel}</span>
          </div>
          <div className="section-body" style={{ padding: 0, overflowX: "auto" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Persona</th>
                  <th>Tipo</th>
                  <th style={{ textAlign: "right" }}>Ore sett.</th>
                  <th style={{ textAlign: "right" }}>Ore mese</th>
                  <th style={{ textAlign: "right" }}>Contratto</th>
                  <th style={{ textAlign: "right" }}>Costo sett.</th>
                  <th style={{ textAlign: "right" }}>Costo mese</th>
                </tr>
              </thead>
              <tbody>
                {staff.map(p => {
                  const mh = monthHoursMap[p.id] ?? 0;
                  const wh = weekHoursMap[p.id] ?? 0;
                  const isOnCall = p.type === "a_chiamata";
                  const wCost = isOnCall ? wh * HOURLY_RATE_ON_CALL : null;
                  const mCost = isOnCall ? mh * HOURLY_RATE_ON_CALL : null;
                  const monthWeeks = monthDates.length / 7;
                  const overMonth = p.hours_per_week > 0 && mh > p.hours_per_week * monthWeeks;
                  return (
                    <tr key={p.id}>
                      <td><strong>{p.name}</strong></td>
                      <td>
                        <span className={`badge ${isOnCall ? "badge-call" : "badge-dip"}`}>
                          {isOnCall ? "A chiamata" : "Dipendente"}
                        </span>
                      </td>
                      <td className="tabular" style={{ textAlign: "right", fontWeight: 600 }}>{wh}h</td>
                      <td className="tabular" style={{ textAlign: "right", fontWeight: 600, color: overMonth ? "var(--danger)" : undefined }}>{mh}h</td>
                      <td className="tabular muted" style={{ textAlign: "right" }}>{p.hours_per_week || "—"}h/sett</td>
                      <td className="tabular" style={{ textAlign: "right", background: isOnCall ? "rgba(191,167,98,.08)" : undefined, fontWeight: isOnCall ? 600 : 400 }}>
                        {wCost != null ? eur(wCost) : "—"}
                      </td>
                      <td className="tabular" style={{ textAlign: "right", background: isOnCall ? "rgba(191,167,98,.08)" : undefined, fontWeight: isOnCall ? 600 : 400 }}>
                        {mCost != null ? eur(mCost) : "—"}
                      </td>
                    </tr>
                  );
                })}
                <tr style={{ background: "var(--surface-2)" }}>
                  <td colSpan={5} style={{ textAlign: "right", fontWeight: 700 }}>Totale a chiamata</td>
                  <td className="tabular" style={{ textAlign: "right", fontWeight: 700 }}>{eur(totalWeekCost)}</td>
                  <td className="tabular" style={{ textAlign: "right", fontWeight: 700 }}>{eur(totalMonthCost)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Absences ── */}
      {!isStaff && monthAbsences.length > 0 && (
        <div className="section">
          <div className="section-head">
            <h2>Assenze nel periodo</h2>
            <span className="muted">{monthAbsences.length} registrate</span>
          </div>
          <div className="section-body">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {monthAbsences.sort((a, b) => a.absent_date.localeCompare(b.absent_date)).map((a, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 14px", borderRadius: 10, border: "1px solid var(--line)",
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{staffById.get(a.staff_id)?.name ?? "?"}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {fmtDayShort(a.absent_date)}{a.end_date ? ` – ${fmtDayShort(a.end_date)}` : ""}
                      {a.notes ? ` · ${a.notes}` : ""}
                    </div>
                  </div>
                  <span className={`badge badge-${a.type ?? "permesso"}`}>
                    {a.type === "ferie" ? "Ferie" : a.type === "malattia" ? "Malattia" : "Permesso"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Staff: Swap Requests Received ── */}
      {isStaff && swapRequests.length > 0 && (
        <div className="section" style={{ marginTop: 20, borderLeft: "3px solid #BFA762" }}>
          <div className="section-head"><h2>Richieste cambio turno</h2></div>
          <div className="section-body" style={{ padding: 16 }}>
            {swapRequests.map(r => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid var(--line)", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{r.requester?.full_name ?? "?"}</div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    Vuole scambiare il turno del {new Date(r.request_date + "T00:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "long" })}
                    {r.request_shift ? ` (${r.request_shift})` : ""}
                  </div>
                  {r.note && <div className="muted" style={{ fontSize: 12, fontStyle: "italic", marginTop: 4 }}>&quot;{r.note}&quot;</div>}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-primary" style={{ padding: "8px 16px", fontSize: 13 }} onClick={() => respondSwapRequest(r.id, true)}>Accetta</button>
                  <button className="btn-ghost" style={{ padding: "8px 16px", borderRadius: 8, fontSize: 13 }} onClick={() => respondSwapRequest(r.id, false)}>Rifiuta</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Staff: Personal Summary ── */}
      {isStaff && (
        <div className="section" style={{ marginTop: 20 }}>
          <div className="section-head"><h2>Il mio riepilogo</h2><span className="muted">{monthLabel}</span></div>
          <div className="section-body" style={{ padding: 20 }}>
            {myStaffId ? (() => {
              const mySlots = slots.filter(s => s.staff_id === myStaffId);
              const byType: Record<string, number> = {};
              for (const s of mySlots) {
                const t = stById.get(s.shift_type_id);
                if (t) byType[t.name] = (byType[t.name] ?? 0) + 1;
              }
              const restDays = monthDates.length - new Set(mySlots.map(s => s.date)).size;
              return (
                <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                  {Object.entries(byType).map(([name, count]) => (
                    <div key={name} style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "'Fraunces', serif" }}>{count}</div>
                      <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{name}</div>
                    </div>
                  ))}
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "'Fraunces', serif" }}>{restDays}</div>
                    <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>Riposi</div>
                  </div>
                </div>
              );
            })() : <p className="muted">Profilo staff non trovato. Contatta l&#39;amministratore.</p>}
          </div>
        </div>
      )}

      {/* ── Staff: Request Swap Button ── */}
      {isStaff && myStaffId && (
        <div style={{ marginTop: 20, display: "flex", justifyContent: "center" }}>
          <button className="btn btn-primary" style={{ padding: "14px 28px", fontSize: 15 }} onClick={() => setShowSwapModal(true)}>
            Richiedi cambio turno
          </button>
        </div>
      )}

      {/* ── Staff: Swap Modal ── */}
      {isStaff && showSwapModal && (
        <div className="modal-overlay" onClick={() => setShowSwapModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="section-head" style={{ padding: "20px 24px", borderBottom: "1px solid var(--line)" }}>
              <h2>Richiedi cambio turno</h2>
              <button className="btn-ghost" style={{ padding: "4px 10px", borderRadius: 8 }} onClick={() => setShowSwapModal(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="field">
                <label>Il mio turno da scambiare</label>
                <select value={swapDate} onChange={e => setSwapDate(e.target.value)}>
                  <option value="">Seleziona...</option>
                  {slots.filter(s => s.staff_id === myStaffId && s.date >= today).map(s => {
                    const t = stById.get(s.shift_type_id);
                    return <option key={s.key} value={s.date}>{new Date(s.date + "T00:00:00").toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "long" })} — {t?.name ?? "?"}</option>;
                  })}
                </select>
              </div>
              <div className="field">
                <label>Scambia con</label>
                <select value={swapTargetId} onChange={e => setSwapTargetId(e.target.value)}>
                  <option value="">Seleziona collega...</option>
                  {staff.filter(s => s.id !== myStaffId).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Nota (opzionale)</label>
                <textarea value={swapNote} onChange={e => setSwapNote(e.target.value)} placeholder="Motivo dello scambio..." rows={3} />
              </div>
              <button className="btn btn-primary" style={{ width: "100%", padding: "14px 22px", fontSize: 15 }}
                onClick={submitSwapRequest} disabled={swapSending || !swapDate || !swapTargetId}>
                {swapSending ? "Invio..." : "Invia richiesta"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Unsaved bar ── */}
      {!isStaff && !saved && !loading && staff.length > 0 && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: "#1F3326", color: "#FAF9F5", padding: "12px 28px", borderRadius: 12,
          fontSize: 14, fontWeight: 600, zIndex: 200, boxShadow: "0 4px 20px rgba(0,0,0,.25)",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          {saving ? (
            <><div style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin .6s linear infinite" }} />Salvataggio...</>
          ) : (
            <>Modifiche non salvate<button onClick={salvaManuale} style={{ background: "var(--accent)", color: "#1F3326", border: "none", borderRadius: 8, padding: "6px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Salva ora</button></>
          )}
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)",
          background: "#2D5A3D", color: "#FAF9F5", padding: "10px 22px", borderRadius: 10,
          fontSize: 13, fontWeight: 600, zIndex: 201, boxShadow: "0 4px 16px rgba(0,0,0,.2)",
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline", verticalAlign: "-2px", marginRight: 6 }}><path d="M20 6L9 17l-5-5" /></svg>
          {toast}
        </div>
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
}
