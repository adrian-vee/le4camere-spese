"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { monthDatesFrom, WEEKDAYS, type ShiftTypeRow, type StaffRow, type ShiftRow } from "@/lib/turni";

const MONTHS_IT = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

function shiftHours(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return (eh * 60 + em - sh * 60 - sm) / 60;
}

function dayOfWeek(date: string): number {
  const d = new Date(`${date}T00:00:00`).getDay();
  return d === 0 ? 6 : d - 1;
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
        supabase.from("staff").select("*"),
        supabase.from("shifts").select("*").gte("shift_date", first).lte("shift_date", last),
      ]);
      setTypes((ty ?? []) as ShiftTypeRow[]);
      setStaff((st ?? []) as StaffRow[]);
      setShifts((sh ?? []) as ShiftRow[]);
      setLoading(false);
    })();
    // eslint-disable-next-line
  }, [year, month]);

  const staffName = (id: string | null) =>
    id ? staff.find((s) => s.id === id)?.name ?? "?" : "—";

  const cell = (date: string, typeId: string) =>
    shifts
      .filter((s) => s.shift_date === date && s.shift_type_id === typeId)
      .map((s) => staffName(s.staff_id));

  const hoursByPerson: Record<string, number> = {};
  for (const s of shifts) {
    if (!s.staff_id) continue;
    const t = types.find((ty) => ty.id === s.shift_type_id);
    if (!t) continue;
    const h = shiftHours(t.start_time, t.end_time);
    hoursByPerson[s.staff_id] = (hoursByPerson[s.staff_id] ?? 0) + h;
  }

  const todayStr = new Date().toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  if (loading) return <div className="empty">Caricamento…</div>;

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

      {/* ── Header ── */}
      <div className="stampa-hdr">
        <h1 className="serif">Le 4 Camere</h1>
        <div className="stampa-hdr-sub">GESTIONALE ALBERGHIERO</div>
        <h2 className="serif">Turni — {MONTHS_IT[month - 1]} {year}</h2>
        <div className="stampa-hdr-line" />
      </div>

      {/* ── Monthly table ── */}
      <table className="stampa-tbl">
        <thead>
          <tr>
            <th style={{ width: 48 }}>Giorno</th>
            <th style={{ width: 40 }}>Data</th>
            {types.map((t) => (
              <th key={t.id}>
                {t.name}
                <br />
                <span style={{ fontWeight: 400, fontSize: 9, opacity: 0.7 }}>
                  {t.start_time.slice(0, 5)}–{t.end_time.slice(0, 5)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dates.map((date) => {
            const dow = dayOfWeek(date);
            const isWeekend = dow >= 5;
            const dayNum = parseInt(date.slice(8, 10));
            return (
              <tr key={date} className={isWeekend ? "row-weekend" : undefined}>
                <td className="col-day">{WEEKDAYS[dow]}</td>
                <td className="col-date">{dayNum}</td>
                {types.map((t) => {
                  const names = cell(date, t.id);
                  return (
                    <td key={t.id}>
                      {names.length > 0
                        ? names.join(", ")
                        : <span className="empty-cell">—</span>}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* ── Hours summary ── */}
      {Object.keys(hoursByPerson).length > 0 && (
        <div className="stampa-summary">
          <strong>Riepilogo ore</strong>
          <div className="stampa-summary-list">
            {Object.entries(hoursByPerson)
              .sort(([, a], [, b]) => b - a)
              .map(([sid, h]) => (
                <span key={sid}>
                  {staffName(sid)} <strong>{h}h</strong>
                </span>
              ))}
          </div>
        </div>
      )}

      {/* ── Footer ── */}
      <div className="stampa-foot">Stampato il {todayStr}</div>

      <style>{`
        .stampa-page{max-width:1100px}

        .stampa-hdr{margin-bottom:14px}
        .stampa-hdr h1{font-size:26px;font-weight:600;color:#1F3326;margin:0;line-height:1.1}
        .stampa-hdr-sub{font-family:'Bebas Neue',sans-serif;font-size:13px;letter-spacing:3px;color:#1F3326;margin-top:3px}
        .stampa-hdr h2{font-size:17px;font-weight:500;color:#1F3326;margin-top:8px}
        .stampa-hdr-line{height:2px;background:#BFA762;margin-top:10px}

        .stampa-tbl{width:100%;border-collapse:collapse;font-size:11.5px;margin-bottom:10px}
        .stampa-tbl thead th{background:#1F3326;color:#FAF9F5;padding:5px 6px;font-size:10px;font-weight:700;
          text-align:center;letter-spacing:.4px;text-transform:uppercase;border:1px solid #1F3326}
        .stampa-tbl td{padding:3px 6px;border:1px solid #D8CCB8;text-align:center;vertical-align:middle;line-height:1.3}
        .stampa-tbl .col-day{font-weight:700;width:48px}
        .stampa-tbl .col-date{width:40px;color:#6C6B5D}
        .stampa-tbl .row-weekend td{background:#F3EBDD}
        .stampa-tbl .empty-cell{color:#ccc}

        .stampa-summary{padding:8px 0;border-top:1px solid #D8CCB8;font-size:10px;color:#1F3326;
          display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
        .stampa-summary strong{font-size:10px;text-transform:uppercase;letter-spacing:1px}
        .stampa-summary-list{display:flex;flex-wrap:wrap;gap:4px 14px}
        .stampa-summary-list span{white-space:nowrap}

        .stampa-foot{font-size:9px;color:#6C6B5D;text-align:right;margin-top:6px}

        @media print{
          @page{size:A4 landscape;margin:15mm}
          .sidebar,.topbar-mobile,.bottomnav,.no-print{display:none!important}
          .shell{padding:0!important;display:block}
          .shell-content{display:block}
          .wrap{padding:0!important;max-width:100%!important}
          body{background:#fff;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}
          .stampa-page{max-width:100%}
          .stampa-tbl{font-size:11px}
          .stampa-tbl td{padding:2.5px 5px}
          .stampa-tbl .row-weekend td{background:#F3EBDD!important}
          .stampa-tbl thead th{background:#1F3326!important;color:#FAF9F5!important}
        }
      `}</style>
    </div>
  );
}

export default function StampaPage() {
  return (
    <Suspense fallback={<div className="empty">Caricamento…</div>}>
      <StampaInner />
    </Suspense>
  );
}
