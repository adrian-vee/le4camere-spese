"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { monthDatesFrom, type ShiftTypeRow, type StaffRow, type ShiftRow } from "@/lib/turni";
import { generateTurniPdf, type TurniPdfData } from "@/lib/pdf";

const MONTHS_IT = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

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

  function downloadPdf() {
    const pdfData: TurniPdfData = {
      year,
      month,
      monthName: MONTHS_IT[month - 1],
      dates,
      staff: staff.map(s => ({ id: s.id, name: s.name, type: s.type })),
      shiftTypes: types.map(t => ({
        id: t.id, name: t.name, startTime: t.start_time, endTime: t.end_time, color: t.color,
      })),
      shifts: shifts.filter(s => s.staff_id).map(s => ({
        staffId: s.staff_id!, date: s.shift_date, shiftTypeId: s.shift_type_id,
      })),
    };
    const doc = generateTurniPdf(pdfData);
    doc.save(`Turni_${MONTHS_IT[month - 1]}_${year}.pdf`);
  }

  if (loading) return <div className="empty">Caricamento...</div>;

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 24 }}>
        <button className="btn btn-primary" onClick={downloadPdf} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Scarica PDF Turni
        </button>
        <button className="btn btn-ghost" onClick={() => window.history.back()} style={{ padding: "10px 18px" }}>
          ← Torna ai turni
        </button>
      </div>

      <div style={{ background: "var(--surface-2)", borderRadius: 12, padding: 20, fontSize: 14, color: "var(--ink-soft)" }}>
        <strong>Anteprima:</strong> {MONTHS_IT[month - 1]} {year} — {staff.length} persone, {dates.length} giorni, {shifts.filter(s => s.staff_id).length} turni assegnati.
        <br />Il PDF viene generato in formato A4 orizzontale con colori e leggenda delle fasce.
      </div>
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
