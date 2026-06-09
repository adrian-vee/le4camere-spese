"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { eur } from "@/lib/format";
import { generateSchedule, shiftHours, type Staff, type ShiftType, type CoverageReq, type Assignment, type Unavailability } from "@/lib/scheduler";
import {
  toStaff, toShiftType, toCoverage, weekDatesFrom, monthDatesFrom, fmtDayShort, WEEKDAYS, expandAbsences,
  type StaffRow, type ShiftTypeRow, type CoverageRow, type ShiftRow, type AbsenceRow, type AvailabilityRow,
} from "@/lib/turni";

type Slot = { key: string; date: string; shift_type_id: string; staff_id: string | null };
type View = "month" | "week";

const HOURLY_RATE_ON_CALL = 8;
const isoWd = (d: string) => { const x = new Date(`${d}T00:00:00`).getDay(); return x === 0 ? 7 : x; };

export default function TurniPage() {
  const supabase = createClient();
  const [view, setView] = useState<View>("month");
  const [anchor, setAnchor] = useState(new Date());

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
  const [coverage, setCoverage] = useState<CoverageReq[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [absenceRows, setAbsenceRows] = useState<AbsenceRow[]>([]);
  const [unavailable, setUnavailable] = useState<Unavailability[]>([]);

  const stById = useMemo(() => new Map(shiftTypes.map(s => [s.id, s])), [shiftTypes]);
  const staffById = useMemo(() => new Map(staff.map(s => [s.id, s])), [staff]);

  const today = new Date().toISOString().slice(0, 10);

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
    const [{ data: st }, { data: ty }, { data: cov }, { data: sh }, { data: abs }, { data: avail }] = await Promise.all([
      supabase.from("staff").select("*").eq("active", true).order("name"),
      supabase.from("shift_types").select("*").order("sort"),
      supabase.from("coverage_template").select("*"),
      supabase.from("shifts").select("*").gte("shift_date", monthDates[0]).lte("shift_date", monthDates[monthDates.length - 1]),
      supabase.from("absences").select("*"),
      supabase.from("staff_availability").select("*").eq("available", false),
    ]);
    const staffArr = ((st ?? []) as StaffRow[]).map(toStaff);
    const typeArr = ((ty ?? []) as ShiftTypeRow[]).map(toShiftType);
    const covArr = ((cov ?? []) as CoverageRow[]).map(toCoverage);
    const absRows = (abs ?? []) as AbsenceRow[];
    const unavailRows = (avail ?? []) as AvailabilityRow[];

    setStaff(staffArr);
    setShiftTypes(typeArr);
    setCoverage(covArr);
    setAbsenceRows(absRows);
    setUnavailable(unavailRows.map(r => ({ staff_id: r.staff_id, weekday: r.weekday, shift_type_id: r.shift_type_id })));

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
  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, [monthDates.join(",")]);

  function prevMonth() { setAnchor(new Date(activeMonth.year, activeMonth.month - 2, 15)); }
  function nextMonth() { setAnchor(new Date(activeMonth.year, activeMonth.month, 15)); }
  function prevWeek() { setAnchor(new Date(anchor.getTime() - 7 * 864e5)); }
  function nextWeek() { setAnchor(new Date(anchor.getTime() + 7 * 864e5)); }
  function goToday() { setAnchor(new Date()); }

  function genera() {
    const allAbsences = expandAbsences(absenceRows, monthDates[0], monthDates[monthDates.length - 1]);
    const res = generateSchedule(monthDates, staff, shiftTypes, coverage, allAbsences, unavailable);
    setSlots(fill(buildEmptySlots(monthDates, coverage, shiftTypes), res.assignments));
    setWarnings(res.warnings);
    setSaved(false);
  }

  function setSlotValue(key: string, staff_id: string | null) {
    setSlots(prev => prev.map(s => s.key === key ? { ...s, staff_id } : s));
    setSaved(false);
  }

  async function salva() {
    await supabase.from("shifts").delete()
      .gte("shift_date", monthDates[0])
      .lte("shift_date", monthDates[monthDates.length - 1]);
    const rows = slots.filter(s => s.staff_id).map(s => ({
      shift_date: s.date, shift_type_id: s.shift_type_id, staff_id: s.staff_id, status: "draft",
    }));
    if (rows.length) {
      const { error } = await supabase.from("shifts").insert(rows);
      if (error) return alert("Errore nel salvataggio: " + error.message);
    }
    setSaved(true);
  }

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

  const weekLabel = `${fmtDayShort(weekDates[0])}–${fmtDayShort(weekDates[6])}`;

  return (
    <>
      {/* ── Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 16 }}>
        <h1 className="serif" style={{ fontSize: 24, fontWeight: 500 }}>
          Turni · {monthLabel}
        </h1>
        <div className="view-toggle">
          <button className={view === "month" ? "active" : ""} onClick={() => setView("month")}>Mese</button>
          <button className={view === "week" ? "active" : ""} onClick={() => setView("week")}>Settimana</button>
        </div>
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
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn btn-primary" style={{ padding: "10px 18px" }} onClick={genera} disabled={loading || staff.length === 0}>
              Genera bozza
            </button>
            <button className="btn btn-ghost" style={{ padding: "10px 18px" }} onClick={salva} disabled={loading}>
              {saved ? <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline", verticalAlign: "-2px", marginRight: 4 }}><path d="M20 6L9 17l-5-5" /></svg>Salvato</> : "Salva turni"}
            </button>
            <Link href={`/turni/stampa?month=${activeMonth.year}-${String(activeMonth.month).padStart(2,'0')}`} className="btn btn-ghost" style={{ padding: "10px 18px" }}>Stampa</Link>
            <Link href="/turni/copertura" className="muted" style={{ fontWeight: 600 }}>Copertura →</Link>
          </div>
        </div>
      </div>

      {/* ── Alerts ── */}
      {staff.length === 0 && (
        <div className="section" style={{ marginBottom: 20 }}>
          <div className="section-body" style={{ textAlign: "center", padding: "24px 20px" }}>
            <p style={{ fontSize: 14, color: "var(--ink-soft)" }}>
              Aggiungi prima il personale nella sezione <Link href="/personale" style={{ fontWeight: 700, color: "var(--ink)" }}>&quot;Staff&quot;</Link>.
            </p>
          </div>
        </div>
      )}

      {warnings.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
          {warnings.map((w, i) => (
            <div key={i} style={{
              padding: "10px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600,
              background: "#F6E3D3", color: "var(--warn)", border: "1px solid rgba(158,59,46,.15)",
            }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline", verticalAlign: "-2px", marginRight: 4 }}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><path d="M12 9v4M12 17h.01" /></svg>{w}</div>
          ))}
        </div>
      )}

      {/* ── Grid ── */}
      {loading ? (
        <div className="section"><div className="empty">Caricamento…</div></div>
      ) : view === "month" ? (
        /* ── MONTH VIEW ── */
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
                  {shiftTypes.map(st => (
                    <th key={st.id} style={{ textAlign: "center", minWidth: 180 }}>
                      <div style={{ fontWeight: 700 }}>{st.name}</div>
                      <div className="muted" style={{ fontWeight: 400, fontSize: 11 }}>{st.start}–{st.end}</div>
                    </th>
                  ))}
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
                                {cellSlots.map(s => isPast ? (
                                  <div key={s.key} style={{
                                    fontSize: 13, fontWeight: 600, padding: "6px 10px",
                                    background: s.staff_id ? "rgba(0,0,0,.03)" : "transparent",
                                    borderRadius: 8,
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
                                      padding: "8px 10px", border: "1.5px solid var(--line)", borderRadius: 8,
                                      background: s.staff_id ? "#fff" : "var(--surface-2)",
                                      color: s.staff_id ? "var(--ink)" : "var(--danger)",
                                      fontWeight: s.staff_id ? 500 : 600,
                                    }}>
                                    <option value="">— scoperto —</option>
                                    {staff.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                  </select>
                                ))}
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
                  <div style={{
                    fontWeight: 700, marginBottom: 10, fontSize: 15,
                    display: "flex", alignItems: "center", gap: 8,
                  }}>
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
                        return (
                          <div key={s.key} style={{
                            border: `1.5px solid ${s.staff_id ? "var(--line)" : "rgba(158,59,46,.25)"}`,
                            borderRadius: 12, padding: "14px 16px",
                            background: s.staff_id ? "#fff" : "rgba(158,59,46,.03)",
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                              <span className="dot" style={{ background: t ? "var(--accent)" : "var(--line)", width: 8, height: 8 }} />
                              <span style={{ fontSize: 14, fontWeight: 700 }}>{t?.name ?? "—"}</span>
                            </div>
                            <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>{t?.start}–{t?.end}</div>
                            {isPast ? (
                              <div style={{
                                fontSize: 15, fontWeight: 600, padding: "10px 12px",
                                borderRadius: 8, background: "rgba(0,0,0,.03)",
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
                            )}
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

      {/* ── Summary ── */}
      {staff.length > 0 && (
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
      {monthAbsences.length > 0 && (
        <div className="section">
          <div className="section-head">
            <h2>Assenze nel periodo</h2>
            <span className="muted">{monthAbsences.length} registrate</span>
          </div>
          <div className="section-body">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {monthAbsences
                .sort((a, b) => a.absent_date.localeCompare(b.absent_date))
                .map((a, i) => (
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
    </>
  );
}
