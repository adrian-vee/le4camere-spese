"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { weekDatesFrom, fmtDayShort, WEEKDAYS, type ShiftTypeRow, type StaffRow, type ShiftRow } from "@/lib/turni";

function StampaInner() {
  const supabase = createClient();
  const params = useSearchParams();
  const weekParam = params.get("week");
  const week = weekDatesFrom(weekParam ? new Date(`${weekParam}T00:00:00`) : new Date());

  const [types, setTypes] = useState<ShiftTypeRow[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: ty }, { data: st }, { data: sh }] = await Promise.all([
        supabase.from("shift_types").select("*").order("sort"),
        supabase.from("staff").select("*"),
        supabase.from("shifts").select("*").in("shift_date", week),
      ]);
      setTypes((ty ?? []) as ShiftTypeRow[]);
      setStaff((st ?? []) as StaffRow[]);
      setShifts((sh ?? []) as ShiftRow[]);
      setLoading(false);
    })();
    // eslint-disable-next-line
  }, [week.join()]);

  const staffName = (id: string | null) => (id ? staff.find((s) => s.id === id)?.name ?? "?" : "—");
  const cell = (date: string, typeId: string) =>
    shifts.filter((s) => s.shift_date === date && s.shift_type_id === typeId).map((s) => staffName(s.staff_id));

  if (loading) return <div className="empty">Caricamento…</div>;

  return (
    <div className="print-area">
      <div className="no-print" style={{ marginBottom: 16, display: "flex", gap: 10 }}>
        <button className="btn btn-primary" onClick={() => window.print()}>🖶 Stampa / Salva PDF</button>
      </div>

      <h1 className="serif" style={{ fontSize: 22, marginBottom: 2 }}>Le 4 Camere — Turni</h1>
      <p className="muted" style={{ marginBottom: 16 }}>Settimana {fmtDayShort(week[0])} – {fmtDayShort(week[6])}</p>

      <table className="print-table">
        <thead>
          <tr>
            <th>Fascia</th>
            {week.map((d, i) => <th key={d}>{WEEKDAYS[i]}<br /><span style={{ fontWeight: 400, fontSize: 11 }}>{fmtDayShort(d)}</span></th>)}
          </tr>
        </thead>
        <tbody>
          {types.map((t) => (
            <tr key={t.id}>
              <td><strong>{t.name}</strong><br /><span style={{ fontSize: 11, color: "#666" }}>{t.start_time.slice(0, 5)}–{t.end_time.slice(0, 5)}</span></td>
              {week.map((d) => {
                const names = cell(d, t.id);
                return <td key={d}>{names.length ? names.join(", ") : <span style={{ color: "#bbb" }}>—</span>}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <style>{`
        .print-table{width:100%;border-collapse:collapse;font-size:13px}
        .print-table th,.print-table td{border:1px solid #ccc;padding:8px 10px;text-align:center;vertical-align:middle}
        .print-table th:first-child,.print-table td:first-child{text-align:left}
        .print-table thead th{background:#F0E9DB}
        @media print{
          .topbar,.bottomnav,.no-print{display:none !important}
          .shell{padding:0 !important}
          .wrap{padding:0 !important;max-width:100% !important}
          body{background:#fff}
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
