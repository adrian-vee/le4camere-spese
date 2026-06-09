"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { monthDatesFrom, type ShiftTypeRow, type StaffRow, type ShiftRow } from "@/lib/turni";

const MONTHS_IT = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

function dayOfWeek(date: string): number {
  const d = new Date(`${date}T00:00:00`).getDay();
  return d === 0 ? 6 : d - 1;
}
const DOW_SHORT = ["L", "M", "M", "G", "V", "S", "D"];

function shiftHours(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60;
  return mins / 60;
}

function StampaInner() {
  const supabase = createClient();
  const params = useSearchParams();
  const monthParam = params.get("month");

  const now = new Date();
  const year = monthParam ? parseInt(monthParam.split("-")[0]) : now.getFullYear();
  const month = monthParam ? parseInt(monthParam.split("-")[1]) : now.getMonth() + 1;
  const dates = monthDatesFrom(year, month);

  const [types, setTypes] = useState<ShiftTypeRow[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const first = dates[0];
      const last = dates[dates.length - 1];
      const [{ data: ty }, { data: st }, { data: sh }] = await Promise.all([
        supabase.from("shift_types").select("*").order("sort"),
        supabase.from("staff").select("*").eq("active", true).order("name"),
        supabase.from("shifts").select("*").gte("shift_date", first).lte("shift_date", last),
      ]);
      setTypes((ty ?? []) as ShiftTypeRow[]);
      setStaff((st ?? []) as StaffRow[]);
      setShifts((sh ?? []) as ShiftRow[]);
      setLoading(false);
    })();
    // eslint-disable-next-line
  }, [year, month]);

  // Map shift_type_id to abbreviation (first letter of name) and color
  const typeInfo = useMemo(() => {
    const map: Record<string, { abbr: string; color: string; name: string }> = {};
    const usedAbbrs = new Set<string>();
    for (const t of types) {
      let abbr = t.name.charAt(0).toUpperCase();
      if (usedAbbrs.has(abbr)) abbr = t.name.slice(0, 2).toUpperCase();
      usedAbbrs.add(abbr);
      map[t.id] = { abbr, color: t.color || "#1F3326", name: t.name };
    }
    return map;
  }, [types]);

  // Build lookup: staffId -> date -> shift abbreviations
  const cellData = useMemo(() => {
    const map: Record<string, Record<string, { abbr: string; color: string }[]>> = {};
    for (const s of shifts) {
      if (!s.staff_id) continue;
      if (!map[s.staff_id]) map[s.staff_id] = {};
      if (!map[s.staff_id][s.shift_date]) map[s.staff_id][s.shift_date] = [];
      const ti = typeInfo[s.shift_type_id];
      if (ti) map[s.staff_id][s.shift_date].push({ abbr: ti.abbr, color: ti.color });
    }
    return map;
  }, [shifts, typeInfo]);

  // Hours per person
  const hoursByPerson = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of shifts) {
      if (!s.staff_id) continue;
      const t = types.find(ty => ty.id === s.shift_type_id);
      if (!t) continue;
      map[s.staff_id] = (map[s.staff_id] ?? 0) + shiftHours(t.start_time, t.end_time);
    }
    return map;
  }, [shifts, types]);

  const todayStr = new Date().toLocaleDateString("it-IT", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });

  if (loading) return <div className="empty">Caricamento...</div>;

  return (
    <div className="stampa-page">
      <div className="no-print" style={{ marginBottom: 20 }}>
        <button className="btn btn-primary" onClick={() => window.print()}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline", verticalAlign: "-3px", marginRight: 6 }}>
            <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
            <rect x="6" y="14" width="12" height="8" />
          </svg>
          Stampa / Scarica PDF
        </button>
      </div>

      {/* Header */}
      <div className="stampa-hdr">
        <div className="stampa-hdr-top">
          <h1 className="serif">LE 4 CAMERE</h1>
          <span className="stampa-hdr-sep">&mdash;</span>
          <h2 className="serif">Turni {MONTHS_IT[month - 1]} {year}</h2>
        </div>
        <div className="stampa-hdr-line" />
      </div>

      {/* Legend */}
      <div className="stampa-legend">
        {types.map(t => {
          const ti = typeInfo[t.id];
          return (
            <span key={t.id} className="stampa-legend-item">
              <span className="stampa-legend-dot" style={{ background: ti?.color }} />
              <strong>{ti?.abbr}</strong> = {t.name} ({t.start_time.slice(0, 5)}&ndash;{t.end_time.slice(0, 5)})
            </span>
          );
        })}
      </div>

      {/* Main table: rows = staff, cols = days */}
      <table className="stampa-tbl">
        <thead>
          <tr>
            <th className="col-staff">Personale</th>
            {dates.map(date => {
              const dayNum = parseInt(date.slice(8, 10));
              const dow = dayOfWeek(date);
              const isWeekend = dow >= 5;
              return (
                <th key={date} className={isWeekend ? "col-we" : ""}>
                  <div className="day-num">{dayNum}</div>
                  <div className="day-dow">{DOW_SHORT[dow]}</div>
                </th>
              );
            })}
            <th className="col-hours">Ore</th>
          </tr>
        </thead>
        <tbody>
          {staff.map(p => (
            <tr key={p.id}>
              <td className="col-staff">{p.name}</td>
              {dates.map(date => {
                const dow = dayOfWeek(date);
                const isWeekend = dow >= 5;
                const cellShifts = cellData[p.id]?.[date] ?? [];
                return (
                  <td key={date} className={isWeekend ? "cell-we" : ""}>
                    {cellShifts.length > 0 ? (
                      <div className="shift-cell">
                        {cellShifts.map((s, i) => (
                          <span key={i} className="shift-badge" style={{ background: s.color + "30", color: s.color }}>{s.abbr}</span>
                        ))}
                      </div>
                    ) : null}
                  </td>
                );
              })}
              <td className="col-hours-val">{hoursByPerson[p.id] ?? 0}h</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Footer */}
      <div className="stampa-foot">
        <span>Documento generato dal Gestionale Le 4 Camere</span>
        <span>Stampato il {todayStr}</span>
      </div>

      <style>{`
        .stampa-page{width:100%}

        .stampa-hdr{margin-bottom:10px}
        .stampa-hdr-top{display:flex;align-items:baseline;gap:12px}
        .stampa-hdr h1{font-size:22px;font-weight:700;color:#1F3326;margin:0;letter-spacing:2px}
        .stampa-hdr-sep{color:#BFA762;font-size:18px}
        .stampa-hdr h2{font-size:16px;font-weight:500;color:#1F3326;margin:0}
        .stampa-hdr-line{height:2px;background:linear-gradient(90deg,#BFA762,#1F3326);margin-top:8px}

        .stampa-legend{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:10px;font-size:9px;color:#6C6B5D}
        .stampa-legend-item{display:flex;align-items:center;gap:4px}
        .stampa-legend-dot{width:8px;height:8px;border-radius:2px;flex-shrink:0}

        .stampa-tbl{width:100%;border-collapse:collapse;font-size:9px;table-layout:fixed}
        .stampa-tbl thead th{background:#1F3326;color:#FAF9F5;padding:3px 1px;font-weight:700;
          text-align:center;border:1px solid #1F3326;vertical-align:middle}
        .stampa-tbl thead th .day-num{font-size:10px;line-height:1.1}
        .stampa-tbl thead th .day-dow{font-size:7px;font-weight:400;opacity:.7;text-transform:uppercase}
        .stampa-tbl thead th.col-we{background:#2D4A35}
        .stampa-tbl thead th.col-staff{text-align:left;padding:3px 6px;width:90px;font-size:8px;text-transform:uppercase;letter-spacing:.5px}
        .stampa-tbl thead th.col-hours{width:36px;font-size:8px}

        .stampa-tbl td{padding:2px 1px;border:1px solid #D8CCB8;text-align:center;vertical-align:middle;height:22px}
        .stampa-tbl td.col-staff{text-align:left;padding:2px 6px;font-weight:700;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .stampa-tbl td.cell-we{background:#F3EBDD}
        .stampa-tbl td.col-hours-val{font-weight:700;font-size:9px;background:#F3EBDD}

        .shift-cell{display:flex;gap:1px;justify-content:center;align-items:center}
        .shift-badge{font-size:8px;font-weight:800;padding:1px 3px;border-radius:2px;line-height:1}

        .stampa-foot{display:flex;justify-content:space-between;font-size:8px;color:#6C6B5D;margin-top:8px;padding-top:6px;border-top:1px solid #D8CCB8}

        @media print{
          @page{size:A4 landscape;margin:10mm}
          .sidebar,.topbar-mobile,.bottomnav,.no-print{display:none!important}
          .shell{padding:0!important;display:block}
          .shell-content{display:block}
          .wrap{padding:0!important;max-width:100%!important}
          body{background:#fff;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}
          .stampa-page{max-width:100%}
          .stampa-tbl thead th{background:#1F3326!important;color:#FAF9F5!important}
          .stampa-tbl thead th.col-we{background:#2D4A35!important}
          .stampa-tbl td.cell-we{background:#F3EBDD!important}
          .stampa-tbl td.col-hours-val{background:#F3EBDD!important}
          .shift-badge{-webkit-print-color-adjust:exact;print-color-adjust:exact}
        }
      `}</style>
    </div>
  );
}

export default function StampaPage() {
  return (
    <Suspense fallback={<div className="empty">Caricamento...</div>}>
      <StampaInner />
    </Suspense>
  );
}
