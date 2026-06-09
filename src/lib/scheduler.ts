// ---------------------------------------------------------------------------
// Generatore turni — bozza automatica a regole, rispettosa dei vincoli.
// Funzione PURA: nessuna dipendenza, testabile in isolamento.
//
// Vincoli garantiti (mai violati: se non riesce, lascia un BUCO da coprire):
//  - Riposo giornaliero: almeno 11h tra la fine di un turno e l'inizio del
//    successivo (D.Lgs 66/2003, art. 7).
//  - Riposo settimanale: almeno 1 giorno libero nella finestra di 7 giorni
//    (al massimo 6 giorni lavorati; rispetta anche i giorni/settimana del
//    contratto).
//  - Ore di contratto: i dipendenti non superano le ore settimanali impostate.
//  - Un solo turno per persona al giorno.
//  - Gli "a chiamata" si usano solo per riempire i buchi lasciati dai dipendenti.
//  - Disponibilità settimanali: rispetta le indisponibilità per giorno/fascia.
//  - Assenze: rispetta ferie, malattia, permessi.
// ---------------------------------------------------------------------------

export type StaffType = "dipendente" | "a_chiamata";

export interface Staff {
  id: string;
  name: string;
  type: StaffType;
  hours_per_week: number; // 0 o <0 = nessun limite (tipico per a chiamata)
  days_per_week: number; // 0 o <0 = nessun limite (verrà comunque capato a 6)
}

export interface ShiftType {
  id: string;
  name: string;
  start: string; // "HH:MM"
  end: string; // "HH:MM" (se <= start è considerato notturno -> giorno dopo)
}

export interface CoverageReq {
  weekday: number; // ISO: 1 = Lun ... 7 = Dom
  shift_type_id: string;
  count: number;
}

export interface Absence {
  staff_id: string;
  date: string; // "YYYY-MM-DD"
}

export interface Unavailability {
  staff_id: string;
  weekday: number; // ISO: 1 = Lun ... 7 = Dom
  shift_type_id: string;
}

// Date-specific unavailability (from staff weekly submissions)
export interface DateUnavailability {
  staff_id: string;
  date: string; // "YYYY-MM-DD"
  shift_type_id: string;
}

export interface Assignment {
  date: string; // "YYYY-MM-DD"
  shift_type_id: string;
  staff_id: string | null; // null = buco non coperto
}

export interface GenResult {
  assignments: Assignment[];
  hoursByStaff: Record<string, number>;
  daysByStaff: Record<string, number>;
  gaps: number;
  warnings: string[];
}

const REST_MS = 11 * 60 * 60 * 1000;

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export function shiftHours(st: ShiftType): number {
  let diff = toMin(st.end) - toMin(st.start);
  if (diff <= 0) diff += 24 * 60; // notturno
  return diff / 60;
}

const startDate = (date: string, st: ShiftType) => new Date(`${date}T${st.start}:00`);

function endDate(date: string, st: ShiftType): Date {
  const s = startDate(date, st);
  const e = new Date(`${date}T${st.end}:00`);
  if (toMin(st.end) <= toMin(st.start)) e.setDate(e.getDate() + 1);
  return e;
}

// ISO weekday: 1 = Lun ... 7 = Dom
export function isoWeekday(date: string): number {
  const wd = new Date(`${date}T00:00:00`).getDay(); // 0 = Dom .. 6 = Sab
  return wd === 0 ? 7 : wd;
}

export function generateSchedule(
  weekDates: string[],
  staff: Staff[],
  shiftTypes: ShiftType[],
  coverage: CoverageReq[],
  absences: Absence[] = [],
  unavailable: Unavailability[] = [],
  dateUnavailable: DateUnavailability[] = [],
): GenResult {
  const stById = new Map(shiftTypes.map((s) => [s.id, s]));
  const absSet = new Set(absences.map((a) => `${a.staff_id}|${a.date}`));
  const unavailSet = new Set(unavailable.map((u) => `${u.staff_id}|${u.weekday}|${u.shift_type_id}`));
  const dateUnavailSet = new Set(dateUnavailable.map((u) => `${u.staff_id}|${u.date}|${u.shift_type_id}`));

  const totalDays = weekDates.length;
  const totalWeeks = totalDays / 7;

  const hours: Record<string, number> = {};
  const days: Record<string, number> = {};
  const lastEnd: Record<string, Date | null> = {};
  const workedToday = new Set<string>();
  for (const p of staff) {
    hours[p.id] = 0;
    days[p.id] = 0;
    lastEnd[p.id] = null;
  }

  function daysInWindow(staffId: string, date: string): number {
    const d = new Date(`${date}T00:00:00`);
    let count = 0;
    for (let i = 0; i < 7; i++) {
      const ck = new Date(d);
      ck.setDate(d.getDate() - i);
      if (workedToday.has(`${staffId}|${ck.toISOString().slice(0, 10)}`)) count++;
    }
    return count;
  }

  const assignments: Assignment[] = [];
  const warnings: string[] = [];
  let gaps = 0;

  for (let dayIndex = 0; dayIndex < totalDays; dayIndex++) {
    const date = weekDates[dayIndex];
    const wd = isoWeekday(date);
    const reqs = coverage.filter((c) => c.weekday === wd && c.count > 0);

    const slots: ShiftType[] = [];
    for (const r of reqs) {
      const st = stById.get(r.shift_type_id);
      if (!st) continue;
      for (let i = 0; i < r.count; i++) slots.push(st);
    }
    slots.sort((a, b) => toMin(a.start) - toMin(b.start));

    for (const st of slots) {
      const sStart = startDate(date, st);
      const sEnd = endDate(date, st);
      const h = shiftHours(st);

      const eligible = staff.filter((p) => {
        if (absSet.has(`${p.id}|${date}`)) return false;
        if (unavailSet.has(`${p.id}|${wd}|${st.id}`)) return false;
        if (dateUnavailSet.has(`${p.id}|${date}|${st.id}`)) return false;
        if (workedToday.has(`${p.id}|${date}`)) return false;
        const dayCap = p.days_per_week > 0 ? Math.min(p.days_per_week, 6) : 6;
        if (daysInWindow(p.id, date) >= dayCap) return false;
        const pacedCap = Math.ceil((dayCap / 7) * (dayIndex + 1));
        if (days[p.id] >= pacedCap) return false;
        const le = lastEnd[p.id];
        if (le && sStart.getTime() - le.getTime() < REST_MS) return false;
        const hourCap = p.hours_per_week > 0 ? p.hours_per_week * totalWeeks : 0;
        if (hourCap > 0 && hours[p.id] + h > hourCap) return false;
        return true;
      });

      const expectedByNow = (p: Staff) => {
        const cap = p.days_per_week > 0 ? Math.min(p.days_per_week, 6) : 6;
        return (cap / 7) * (dayIndex + 1);
      };

      eligible.sort((a, b) => {
        if (a.type !== b.type) return a.type === "dipendente" ? -1 : 1;
        const defA = expectedByNow(a) - days[a.id];
        const defB = expectedByNow(b) - days[b.id];
        if (Math.abs(defA - defB) > 1e-9) return defB - defA;
        const hCapA = a.hours_per_week > 0 ? a.hours_per_week * totalWeeks : 40 * totalWeeks;
        const hCapB = b.hours_per_week > 0 ? b.hours_per_week * totalWeeks : 40 * totalWeeks;
        const ra = hours[a.id] / hCapA;
        const rb = hours[b.id] / hCapB;
        if (Math.abs(ra - rb) > 1e-9) return ra - rb;
        return days[a.id] - days[b.id];
      });

      const pick = eligible[0];
      if (pick) {
        assignments.push({ date, shift_type_id: st.id, staff_id: pick.id });
        hours[pick.id] += h;
        if (!workedToday.has(`${pick.id}|${date}`)) days[pick.id] += 1;
        lastEnd[pick.id] = sEnd;
        workedToday.add(`${pick.id}|${date}`);
      } else {
        assignments.push({ date, shift_type_id: st.id, staff_id: null });
        gaps++;
      }
    }
  }

  if (gaps > 0) warnings.push(`${gaps} turni non coperti: aggiungi personale o riduci la copertura.`);
  for (const p of staff) {
    if (p.type === "dipendente" && p.hours_per_week > 0) {
      const expected = Math.round(p.hours_per_week * totalWeeks);
      if (hours[p.id] < expected) {
        warnings.push(`${p.name}: ${hours[p.id]}h assegnate su ${expected}h di contratto.`);
      }
    }
  }

  return { assignments, hoursByStaff: hours, daysByStaff: days, gaps, warnings };
}
