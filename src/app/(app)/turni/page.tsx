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

  // Navigation
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

  // Summary
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

  // Grouping for month view
  const byDateAndType = useMemo(() => {
    const m: Record<string, Record<string, Slot[]>> = {};
    for (const s of slots) {
      if (!m[s.date]) m[s.date] = {};
      if (!m[s.date][s.shift_type_id]) m[s.date][s.shift_type_id] = [];
      m[s.date][s.shift_type_id].push(s);
    }
    return m;
  }, [slots]);

  // Grouping for week view
  const byDate = useMemo(() => {
    const m: Record<string, Slot[]> = {};
    for (const s of slots) {
      if (!weekDates.includes(s.date)) continue;
      (m[s.date] ||= []).push(s);
    }
    return m;
  }, [slots, weekDates]);

  // Absences in the month
  const monthAbsences = useMemo(() => {
    return absenceRows.filter(r => {
      const end = r.end_date || r.absent_date;
      return r.absent_date <= monthDates[monthDates.length - 1] && end >= monthDates[0];
    });
  }, [absenceRows, monthDates]);

  const weekLabel = `${fmtDayShort(weekDates[0])}–${fmtDayShort(weekDates[6])}`;

  return (
    <>
      {/* Controls */}
      <div className="section">
        <div className="section-head">
          <h2>Turni · {monthLabel}</h2>
          <div style={{ display: "flex", gap: 2, background: "var(--surface-2)", borderRadius: 10, padding: 3 }}>
            <button onClick={() => setView("month")}
              style={{ padding: "7px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: view === "month" ? 700 : 500,
                background: view === "month" ? "var(--surface)" : "transparent", color: "var(--ink)", boxShadow: view === "month" ? "0 1px 3px rgba(0,0,0,.08)" : "none" }}>
              Mese
            </button>
            <button onClick={() => setView("week")}
              style={{ padding: "7px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: view === "week" ? 700 : 500,
                background: view === "week" ? "var(--surface)" : "transparent", color: "var(--ink)", boxShadow: view === "week" ? "0 1px 3px rgba(0,0,0,.08)" : "none" }}>
              Settimana
            </button>
          </div>
        </div>
        <div className="section-body">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
            {view === "month" ? (
              <>
                <button className="btn-ghost" style={{ padding: "8px 14px", borderRadius: 9, fontSize: 14 }} onClick={prevMonth}>←</button>
                <span className="serif" style={{ fontWeight: 500, fontSize: 16, minWidth: 180, textAlign: "center" }}>{monthLabel}</span>
                <button className="btn-ghost" style={{ padding: "8px 14px", borderRadius: 9, fontSize: 14 }} onClick={nextMonth}>→</button>
                <button className="btn-ghost" style={{ padding: "8px 12px", borderRadius: 9, fontSize: 13, marginLeft: 4 }} onClick={goToday}>Oggi</button>
              </>
            ) : (
              <>
                <button className="btn-ghost" style={{ padding: "8px 12px", borderRadius: 9 }} onClick={prevWeek}>← Prec.</button>
                <button className="btn-ghost" style={{ padding: "8px 12px", borderRadius: 9 }} onClick={goToday}>Oggi</button>
                <button className="btn-ghost" style={{ padding: "8px 12px", borderRadius: 9 }} onClick={nextWeek}>Succ. →</button>
                <span className="muted" style={{ fontWeight: 600 }}>{weekLabel}</span>
              </>
            )}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button className="btn btn-primary" style={{ padding: "11px 18px" }} onClick={genera} disabled={loading || staff.length === 0}>
              ⚙︎ Genera bozza {view === "month" ? "mese" : ""}
            </button>
            <button className="btn btn-ghost" style={{ padding: "11px 18px" }} onClick={salva} disabled={loading}>
              {saved ? "✓ Salvato" : "Salva turni"}
            </button>
            <Link href={`/turni/stampa?week=${weekDates[0]}`} className="btn btn-ghost" style={{ padding: "11px 18px" }}>🖶 Stampa</Link>
            <Link href="/turni/copertura" className="muted" style={{ fontWeight: 600, marginLeft: "auto" }}>Imposta copertura →</Link>
          </div>
          {staff.length === 0 && <p className="scan-status" style={{ marginTop: 12 }}>Aggiungi prima il personale nella sezione &quot;Staff&quot;.</p>}
          {warnings.length > 0 && (
            <div style={{ marginTop: 14 }}>
              {warnings.map((w, i) => <div key={i} className="scan-status" style={{ background: "#F6E3D3", color: "var(--warn)", marginBottom: 6 }}>⚠ {w}</div>)}
            </div>
          )}
          {monthAbsences.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div className="muted" style={{ fontWeight: 600, marginBottom: 6 }}>Assenze nel mese:</div>
              {monthAbsences.map((a, i) => (
                <div key={i} className="scan-status" style={{ marginBottom: 4 }}>
                  {staffById.get(a.staff_id)?.name ?? "?"} — {a.type ?? "assenza"} ({fmtDayShort(a.absent_date)}{a.end_date ? `–${fmtDayShort(a.end_date)}` : ""})
                  {a.notes ? ` · ${a.notes}` : ""}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="section"><div className="empty">Caricamento…</div></div>
      ) : view === "month" ? (
        /* ---- MONTH VIEW ---- */
        <div className="section">
          <div className="section-head">
            <h2>Pianificazione mensile</h2>
            <span className="muted">{gaps > 0 ? `${gaps} turni scoperti` : "Tutti coperti"}</span>
          </div>
          <div className="section-body" style={{ padding: 0, overflowX: "auto" }}>
            <table className="tbl" style={{ fontSize: 13, minWidth: 500 }}>
              <thead>
                <tr>
                  <th style={{ position: "sticky", left: 0, background: "var(--surface)", zIndex: 2, minWidth: 100 }}>Giorno</th>
                  {shiftTypes.map(st => (
                    <th key={st.id} style={{ textAlign: "center", minWidth: 180 }}>
                      {st.name}<br /><span className="muted" style={{ fontWeight: 400 }}>{st.start}–{st.end}</span>
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
                  const bg = isToday ? "#EEFBF1" : isWeekend ? "var(--surface-2)" : undefined;
                  const stickyBg = isToday ? "#EEFBF1" : isWeekend ? "var(--surface-2)" : "var(--surface)";
                  return (
                    <tr key={date} style={{ background: bg }}>
                      <td style={{ fontWeight: 600, whiteSpace: "nowrap", position: "sticky", left: 0, background: stickyBg, zIndex: 1, opacity: isPast ? 0.5 : 1,
                        borderLeft: isToday ? "3px solid var(--ok)" : undefined }}>
                        {dayName} {fmtDayShort(date)}
                      </td>
                      {shiftTypes.map(st => {
                        const cellSlots = byDateAndType[date]?.[st.id] ?? [];
                        return (
                          <td key={st.id} style={{ padding: "4px 8px", opacity: isPast ? 0.5 : 1 }}>
                            {cellSlots.length === 0 ? (
                              <span className="muted">—</span>
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                {cellSlots.map(s => isPast ? (
                                  <div key={s.key} style={{ fontSize: 13, fontWeight: 500, padding: "4px 8px", background: s.staff_id ? "rgba(0,0,0,.04)" : "transparent", borderRadius: 6 }}>
                                    {s.staff_id ? staffById.get(s.staff_id)?.name ?? "?" : <span style={{ color: "var(--danger)" }}>scoperto</span>}
                                  </div>
                                ) : (
                                  <select key={s.key} value={s.staff_id ?? ""} onChange={e => setSlotValue(s.key, e.target.value || null)}
                                    style={{ width: "100%", fontFamily: "inherit", fontSize: 13, padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 6,
                                      background: s.staff_id ? "#fff" : "var(--surface-2)" }}>
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
        /* ---- WEEK VIEW ---- */
        <div className="section">
          <div className="section-head">
            <h2>Settimana {weekLabel}</h2>
            <span className="muted">{(() => { const wg = slots.filter(s => weekDates.includes(s.date) && !s.staff_id).length; return wg > 0 ? `${wg} scoperti` : "Tutti coperti"; })()}</span>
          </div>
          <div className="section-body" style={{ padding: 14 }}>
            {weekDates.map((date, i) => {
              const daySlots = byDate[date] ?? [];
              const isPast = date < today;
              return (
                <div key={date} style={{ marginBottom: 14, borderBottom: "1px solid var(--line)", paddingBottom: 12, opacity: isPast ? 0.5 : 1 }}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>{WEEKDAYS[i]} <span className="muted">{fmtDayShort(date)}</span></div>
                  {daySlots.length === 0 ? <div className="muted">Nessuna copertura prevista.</div> : (
                    <div className="turni-day-grid">
                      {daySlots.map(s => {
                        const t = stById.get(s.shift_type_id);
                        return (
                          <div key={s.key} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "8px 10px", background: s.staff_id ? "#fff" : "var(--surface-2)" }}>
                            <div style={{ fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                              <span className="dot" style={{ background: "var(--accent)" }} />{t?.name ?? "—"}
                              <span className="muted" style={{ fontWeight: 500 }}>{t?.start}–{t?.end}</span>
                            </div>
                            {isPast ? (
                              <div style={{ fontSize: 14, padding: "8px 10px", fontWeight: 500 }}>
                                {s.staff_id ? (staffById.get(s.staff_id)?.name ?? "?") : <span style={{ color: "var(--danger)" }}>— scoperto —</span>}
                              </div>
                            ) : (
                              <select value={s.staff_id ?? ""} onChange={e => setSlotValue(s.key, e.target.value || null)}
                                style={{ width: "100%", fontFamily: "inherit", fontSize: 14, padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 8, background: "#fff" }}>
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

      {/* Summary table */}
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
                      <td><span className="tag">{isOnCall ? "A chiamata" : "Dipendente"}</span></td>
                      <td className="tabular" style={{ textAlign: "right", fontWeight: 600 }}>{wh}h</td>
                      <td className="tabular" style={{ textAlign: "right", fontWeight: 600, color: overMonth ? "var(--danger)" : undefined }}>{mh}h</td>
                      <td className="tabular muted" style={{ textAlign: "right" }}>{p.hours_per_week || "—"}h/sett</td>
                      <td className="tabular" style={{ textAlign: "right" }}>{wCost != null ? eur(wCost) : "—"}</td>
                      <td className="tabular" style={{ textAlign: "right" }}>{mCost != null ? eur(mCost) : "—"}</td>
                    </tr>
                  );
                })}
                <tr style={{ borderTop: "2px solid var(--line)" }}>
                  <td colSpan={5} style={{ textAlign: "right", fontWeight: 700 }}>Totale a chiamata</td>
                  <td className="tabular" style={{ textAlign: "right", fontWeight: 700 }}>{eur(totalWeekCost)}</td>
                  <td className="tabular" style={{ textAlign: "right", fontWeight: 700 }}>{eur(totalMonthCost)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
