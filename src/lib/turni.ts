import type { Staff, ShiftType, CoverageReq } from "./scheduler";

// Righe DB
export type StaffRow = {
  id: string; name: string; type: "dipendente" | "a_chiamata";
  hours_per_week: number; days_per_week: number; role: string | null;
  active: boolean; notes: string | null;
};
export type ShiftTypeRow = {
  id: string; name: string; start_time: string; end_time: string; color: string; sort: number;
};
export type CoverageRow = { id: string; weekday: number; shift_type_id: string; count: number };
export type ShiftRow = {
  id: string; shift_date: string; shift_type_id: string; staff_id: string | null; status: string;
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

// Lunedì della settimana che contiene `d` + 7 date consecutive (Lun..Dom)
export function weekDatesFrom(d: Date): string[] {
  const day = d.getDay(); // 0=Dom..6=Sab
  const diff = day === 0 ? -6 : 1 - day; // porta a lunedì
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const x = new Date(monday);
    x.setDate(monday.getDate() + i);
    out.push(x.toISOString().slice(0, 10));
  }
  return out;
}

export const fmtDayShort = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
