"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { generateSchedule, shiftHours, type Staff, type ShiftType, type CoverageReq, type Assignment } from "@/lib/scheduler";
import {
  toStaff, toShiftType, toCoverage, weekDatesFrom, fmtDayShort, WEEKDAYS,
  type StaffRow, type ShiftTypeRow, type CoverageRow, type ShiftRow,
} from "@/lib/turni";

type Slot = { key: string; date: string; shift_type_id: string; staff_id: string | null };

const isoWd = (d: string) => { const x = new Date(`${d}T00:00:00`).getDay(); return x === 0 ? 7 : x; };

export default function TurniPage() {
  const supabase = createClient();
  const [anchor, setAnchor] = useState(new Date());
  const week = useMemo(() => weekDatesFrom(anchor), [anchor]);

  const [staff, setStaff] = useState<Staff[]>([]);
  const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([]);
  const [coverage, setCoverage] = useState<CoverageReq[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  const stById = useMemo(() => new Map(shiftTypes.map((s) => [s.id, s])), [shiftTypes]);
  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);

  function buildEmptySlots(cov: CoverageReq[], types: ShiftType[]): Slot[] {
    const typeMap = new Map(types.map((t) => [t.id, t]));
    const out: Slot[] = [];
    for (const date of week) {
      const wd = isoWd(date);
      const reqs = cov.filter((c) => c.weekday === wd && c.count > 0)
        .sort((a, b) => (typeMap.get(a.shift_type_id)?.start ?? "").localeCompare(typeMap.get(b.shift_type_id)?.start ?? ""));
      for (const r of reqs) for (let i = 0; i < r.count; i++)
        out.push({ key: `${date}|${r.shift_type_id}|${i}`, date, shift_type_id: r.shift_type_id, staff_id: null });
    }
    return out;
  }

  function fill(base: Slot[], assignments: Assignment[]): Slot[] {
    const next = base.map((s) => ({ ...s, staff_id: null as string | null }));
    for (const a of assignments) {
      if (!a.staff_id) continue;
      const slot = next.find((s) => s.date === a.date && s.shift_type_id === a.shift_type_id && s.staff_id === null);
      if (slot) slot.staff_id = a.staff_id;
    }
    return next;
  }

  async function loadAll() {
    setLoading(true);
    setSaved(false);
    const [{ data: st }, { data: ty }, { data: cov }, { data: sh }, { data: abs }] = await Promise.all([
      supabase.from("staff").select("*").eq("active", true).order("name"),
      supabase.from("shift_types").select("*").order("sort"),
      supabase.from("coverage_template").select("*"),
      supabase.from("shifts").select("*").in("shift_date", week),
      supabase.from("absences").select("*").in("absent_date", week),
    ]);
    const staffArr = ((st ?? []) as StaffRow[]).map(toStaff);
    const typeArr = ((ty ?? []) as ShiftTypeRow[]).map(toShiftType);
    const covArr = ((cov ?? []) as CoverageRow[]).map(toCoverage);
    setStaff(staffArr); setShiftTypes(typeArr); setCoverage(covArr);

    const base = buildEmptySlots(covArr, typeArr);
    const shifts = (sh ?? []) as ShiftRow[];
    if (shifts.length > 0) {
      const asg: Assignment[] = shifts.map((s) => ({ date: s.shift_date, shift_type_id: s.shift_type_id, staff_id: s.staff_id }));
      setSlots(fill(base, asg));
      setSaved(true);
    } else {
      setSlots(base);
    }
    setWarnings([]);
    setLoading(false);
  }
  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, [week.join()]);

  function genera() {
    const absences: { staff_id: string; date: string }[] = [];
    const res = generateSchedule(week, staff, shiftTypes as ShiftType[], coverage, absences);
    setSlots(fill(buildEmptySlots(coverage, shiftTypes), res.assignments));
    setWarnings(res.warnings);
    setSaved(false);
  }

  function setSlot(key: string, staff_id: string | null) {
    setSlots((prev) => prev.map((s) => (s.key === key ? { ...s, staff_id } : s)));
    setSaved(false);
  }

  async function salva() {
    await supabase.from("shifts").delete().in("shift_date", week);
    const rows = slots.filter((s) => s.staff_id).map((s) => ({
      shift_date: s.date, shift_type_id: s.shift_type_id, staff_id: s.staff_id, status: "draft",
    }));
    if (rows.length) {
      const { error } = await supabase.from("shifts").insert(rows);
      if (error) return alert("Errore nel salvataggio: " + error.message);
    }
    setSaved(true);
  }

  // riepilogo ore (sui dati correnti, anche dopo modifiche manuali)
  const summary = useMemo(() => {
    const h: Record<string, number> = {};
    for (const s of slots) {
      if (!s.staff_id) continue;
      const t = stById.get(s.shift_type_id);
      if (t) h[s.staff_id] = (h[s.staff_id] ?? 0) + shiftHours(t);
    }
    return h;
  }, [slots, stById]);

  const gaps = slots.filter((s) => !s.staff_id).length;
  const byDate = useMemo(() => {
    const m: Record<string, Slot[]> = {};
    for (const s of slots) (m[s.date] ||= []).push(s);
    return m;
  }, [slots]);

  return (
    <>
      <div className="section">
        <div className="section-head">
          <h2>Turni · settimana {fmtDayShort(week[0])}–{fmtDayShort(week[6])}</h2>
          <div className="filters">
            <button className="btn-ghost" style={{ padding: "8px 12px", borderRadius: 9 }} onClick={() => setAnchor(new Date(anchor.getTime() - 7 * 864e5))}>← Prec.</button>
            <button className="btn-ghost" style={{ padding: "8px 12px", borderRadius: 9 }} onClick={() => setAnchor(new Date())}>Oggi</button>
            <button className="btn-ghost" style={{ padding: "8px 12px", borderRadius: 9 }} onClick={() => setAnchor(new Date(anchor.getTime() + 7 * 864e5))}>Succ. →</button>
          </div>
        </div>
        <div className="section-body">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button className="btn btn-primary" style={{ padding: "11px 18px" }} onClick={genera} disabled={loading || staff.length === 0}>⚙︎ Genera bozza</button>
            <button className="btn btn-ghost" style={{ padding: "11px 18px" }} onClick={salva} disabled={loading}>{saved ? "✓ Salvato" : "Salva turni"}</button>
            <Link href={`/turni/stampa?week=${week[0]}`} className="btn btn-ghost" style={{ padding: "11px 18px" }}>🖶 Stampa</Link>
            <Link href="/turni/copertura" className="muted" style={{ fontWeight: 600, marginLeft: "auto" }}>Imposta copertura →</Link>
          </div>
          {staff.length === 0 && <p className="scan-status" style={{ marginTop: 12 }}>Aggiungi prima il personale nella sezione “Staff”.</p>}
          {warnings.length > 0 && (
            <div style={{ marginTop: 14 }}>
              {warnings.map((w, i) => <div key={i} className="scan-status" style={{ background: "#F6E3D3", color: "var(--warn)", marginBottom: 6 }}>⚠ {w}</div>)}
            </div>
          )}
        </div>
      </div>

      {/* Griglia turni */}
      {loading ? (
        <div className="section"><div className="empty">Caricamento…</div></div>
      ) : (
        <div className="section">
          <div className="section-head"><h2>Pianificazione</h2><span className="muted">{gaps > 0 ? `${gaps} turni scoperti` : "Tutti i turni coperti"}</span></div>
          <div className="section-body" style={{ padding: 14 }}>
            {week.map((date, i) => {
              const daySlots = byDate[date] ?? [];
              return (
                <div key={date} style={{ marginBottom: 14, borderBottom: "1px solid var(--line)", paddingBottom: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>{WEEKDAYS[i]} <span className="muted">{fmtDayShort(date)}</span></div>
                  {daySlots.length === 0 ? <div className="muted">Nessuna copertura prevista.</div> : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
                      {daySlots.map((s) => {
                        const t = stById.get(s.shift_type_id);
                        return (
                          <div key={s.key} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "8px 10px", background: s.staff_id ? "#fff" : "#FBEFE3" }}>
                            <div style={{ fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                              <span className="dot" style={{ background: "var(--accent)" }} />{t?.name ?? "—"}
                              <span className="muted" style={{ fontWeight: 500 }}>{t?.start}–{t?.end}</span>
                            </div>
                            <select value={s.staff_id ?? ""} onChange={(e) => setSlot(s.key, e.target.value || null)}
                              style={{ width: "100%", fontFamily: "inherit", fontSize: 14, padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 8, background: "#fff" }}>
                              <option value="">— scoperto —</option>
                              {staff.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
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

      {/* Riepilogo ore */}
      {staff.length > 0 && (
        <div className="section">
          <div className="section-head"><h2>Ore settimana</h2></div>
          <div className="section-body" style={{ padding: 0 }}>
            <table className="tbl">
              <thead><tr><th>Persona</th><th>Tipo</th><th style={{ textAlign: "right" }}>Ore assegnate</th><th style={{ textAlign: "right" }}>Contratto</th></tr></thead>
              <tbody>
                {staff.map((p) => {
                  const assigned = summary[p.id] ?? 0;
                  const over = p.hours_per_week > 0 && assigned > p.hours_per_week;
                  return (
                    <tr key={p.id}>
                      <td><strong>{p.name}</strong></td>
                      <td><span className="tag">{p.type === "dipendente" ? "Dipendente" : "A chiamata"}</span></td>
                      <td className="tabular" style={{ textAlign: "right", color: over ? "var(--danger)" : undefined, fontWeight: 600 }}>{assigned}h</td>
                      <td className="tabular muted" style={{ textAlign: "right" }}>{p.hours_per_week || "—"}h</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
