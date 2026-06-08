"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { weekDatesFrom, fmtDayShort, WEEKDAYS, type ShiftTypeRow, type StaffRow, type ShiftRow, type AbsenceRow } from "@/lib/turni";

function StampaInner() {
  const supabase = createClient();
  const params = useSearchParams();
  const weekParam = params.get("week");
  const week = weekDatesFrom(weekParam ? new Date(`${weekParam}T00:00:00`) : new Date());

  const [types, setTypes] = useState<ShiftTypeRow[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [absences, setAbsences] = useState<AbsenceRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: ty }, { data: st }, { data: sh }, { data: abs }] = await Promise.all([
        supabase.from("shift_types").select("*").order("sort"),
        supabase.from("staff").select("*"),
        supabase.from("shifts").select("*").in("shift_date", week),
        supabase.from("absences").select("*"),
      ]);
      setTypes((ty ?? []) as ShiftTypeRow[]);
      setStaff((st ?? []) as StaffRow[]);
      setShifts((sh ?? []) as ShiftRow[]);
      setAbsences((abs ?? []) as AbsenceRow[]);
      setLoading(false);
    })();
    // eslint-disable-next-line
  }, [week.join()]);

  const staffName = (id: string | null) => (id ? staff.find((s) => s.id === id)?.name ?? "?" : "—");

  const cell = (date: string, typeId: string) =>
    shifts.filter((s) => s.shift_date === date && s.shift_type_id === typeId).map((s) => staffName(s.staff_id));

  const weekAbsences = absences.filter(a => {
    const end = a.end_date || a.absent_date;
    return a.absent_date <= week[6] && end >= week[0];
  });

  if (loading) return <div className="empty">Caricamento…</div>;

  return (
    <div className="print-area">
      <div className="no-print" style={{ marginBottom: 20, display: "flex", gap: 10 }}>
        <button className="btn btn-primary" onClick={() => window.print()}>🖶 Stampa / Scarica PDF</button>
      </div>

      <div className="print-header">
        <h1 className="serif" style={{ fontSize: 24, marginBottom: 4, color: "var(--ink)" }}>Le 4 Camere</h1>
        <h2 style={{ fontSize: 16, fontWeight: 500, color: "var(--ink-soft)", marginBottom: 2 }}>Turni settimanali</h2>
        <p style={{ fontSize: 14, color: "var(--ink-soft)" }}>
          Settimana {fmtDayShort(week[0])} – {fmtDayShort(week[6])}
        </p>
      </div>

      <table className="print-table">
        <thead>
          <tr>
            <th style={{ minWidth: 90 }}>Giorno</th>
            {types.map(t => (
              <th key={t.id}>
                {t.name}
                <br /><span style={{ fontWeight: 400, fontSize: 12 }}>{t.start_time.slice(0, 5)}–{t.end_time.slice(0, 5)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {week.map((date, i) => (
            <tr key={date}>
              <td style={{ fontWeight: 700, textAlign: "left" }}>
                {WEEKDAYS[i]}
                <br /><span style={{ fontWeight: 400, fontSize: 12, color: "#666" }}>{fmtDayShort(date)}</span>
              </td>
              {types.map(t => {
                const names = cell(date, t.id);
                return (
                  <td key={t.id}>
                    {names.length ? names.join(", ") : <span style={{ color: "#bbb" }}>—</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {weekAbsences.length > 0 && (
        <div className="print-legend">
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: "var(--ink)" }}>Assenze della settimana</h3>
          {weekAbsences.map((a, i) => (
            <div key={i} style={{ fontSize: 13, marginBottom: 4, color: "var(--ink-soft)" }}>
              <strong>{staffName(a.staff_id)}</strong> — {a.type ?? "assenza"}
              {" "}({fmtDayShort(a.absent_date)}{a.end_date ? ` – ${fmtDayShort(a.end_date)}` : ""})
              {a.notes ? ` · ${a.notes}` : ""}
            </div>
          ))}
        </div>
      )}

      <style>{`
        .print-header{margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid var(--line)}
        .print-table{width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px}
        .print-table th,.print-table td{border:1px solid #999;padding:10px 14px;text-align:center;vertical-align:middle}
        .print-table thead th{background:#F3EBDD;font-weight:700;font-size:13px}
        .print-table tbody td{min-width:120px;font-size:14px}
        .print-legend{padding:16px 0;border-top:1px solid var(--line)}
        @media print{
          @page{size:landscape;margin:12mm}
          .sidebar,.topbar-mobile,.bottomnav,.no-print{display:none !important}
          .shell{padding:0 !important;display:block}
          .shell-content{display:block}
          .wrap{padding:0 !important;max-width:100% !important}
          body{background:#fff;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}
          .print-header{border-bottom-color:#333}
          .print-header h1{color:#000 !important}
          .print-header h2,.print-header p{color:#444 !important}
          .print-table th,.print-table td{border-color:#555}
          .print-table thead th{background:#ddd !important}
          .print-legend{border-top-color:#333}
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
