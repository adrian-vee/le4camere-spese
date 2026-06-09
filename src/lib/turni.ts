import type { Staff, ShiftType, CoverageReq } from "./scheduler";

// Righe DB
export type StaffRow = {
  id: string; name: string; type: "dipendente" | "a_chiamata";
  hours_per_week: number; days_per_week: number; role: string | null;
  active: boolean; notes: string | null; profile_id: string | null;
};
export type ShiftTypeRow = {
  id: string; name: string; start_time: string; end_time: string; color: string; sort: number;
};
export type CoverageRow = { id: string; weekday: number; shift_type_id: string; count: number };
export type ShiftRow = {
  id: string; shift_date: string; shift_type_id: string; staff_id: string | null; status: string;
};

export type AvailabilityRow = {
  id: string;
  staff_id: string;
  weekday: number;
  shift_type_id: string;
  available: boolean;
};

export type AbsenceRow = {
  id: string;
  staff_id: string;
  absent_date: string;
  end_date: string | null;
  type: "ferie" | "malattia" | "permesso";
  notes: string | null;
};

export type LeaveRow = {
  id: string;
  staff_id: string;
  staff_name: string;
  date: string;
  type: "permesso" | "malattia" | "ferie" | "altro";
  period: "giornata_intera" | "mattina" | "pomeriggio";
  reason: string | null;
  status: "approvato" | "in_attesa" | "rifiutato";
  approved_by: string | null;
  created_at: string;
};

export const WEEKDAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

const hhmm = (t: string) => t.slice(0, 5); // "07:00:00" -> "07:00"

// Mapping DB -> tipi dello scheduler
export const toStaff = (r: StaffRow): Staff => ({
  id: r.id, name: r.name, type: r.type,
  hours_per_week: Number(r.hours_per_week), days_per_week: r.days_per_week,
});
export const toShiftType = (r: ShiftTypeRow): ShiftType => ({
  id: r.id, name: r.name, start: hhmm(r.start_time), end: hhmm(r.end_time),
});
export const toCoverage = (r: CoverageRow): CoverageReq => ({
  weekday: r.weekday, shift_type_id: r.shift_type_id, count: r.count,
});

function localIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function weekDatesFrom(d: Date): string[] {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const x = new Date(monday);
    x.setDate(monday.getDate() + i);
    out.push(localIso(x));
  }
  return out;
}

export function monthDatesFrom(year: number, month: number): string[] {
  const days = new Date(year, month, 0).getDate();
  const out: string[] = [];
  for (let d = 1; d <= days; d++) {
    out.push(localIso(new Date(year, month - 1, d)));
  }
  return out;
}

export const fmtDayShort = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });

export function expandAbsences(
  rows: AbsenceRow[],
  weekStart: string,
  weekEnd: string,
): { staff_id: string; date: string }[] {
  const result: { staff_id: string; date: string }[] = [];
  for (const r of rows) {
    const end = r.end_date || r.absent_date;
    if (end < weekStart || r.absent_date > weekEnd) continue;
    const d = new Date(`${r.absent_date}T00:00:00`);
    const endD = new Date(`${end}T00:00:00`);
    while (d <= endD) {
      const ds = d.toISOString().slice(0, 10);
      if (ds >= weekStart && ds <= weekEnd) {
        result.push({ staff_id: r.staff_id, date: ds });
      }
      d.setDate(d.getDate() + 1);
    }
  }
  return result;
}

/** Expand approved leaves into daily absence entries for the scheduler */
export function expandLeaves(
  rows: LeaveRow[],
  startDate: string,
  endDate: string,
): { staff_id: string; date: string; period: string }[] {
  return rows
    .filter(r => r.status === "approvato" && r.date >= startDate && r.date <= endDate)
    .map(r => ({ staff_id: r.staff_id, date: r.date, period: r.period }));
}
