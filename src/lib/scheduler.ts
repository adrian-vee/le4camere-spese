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
  weekDates: string[], // 7 date consecutive (Lun..Dom)
  staff: Staff[],
  shiftTypes: ShiftType[],
  coverage: CoverageReq[],
  absences: Absence[] = []
): GenResult {
  const stById = new Map(shiftTypes.map((s) => [s.id, s]));
  const absSet = new Set(absences.map((a) => `${a.staff_id}|${a.date}`));

  const hours: Record<string, number> = {};
  const days: Record<string, number> = {};
  const lastEnd: Record<string, Date | null> = {};
  const workedToday = new Set<string>(); // `${staffId}|${date}`
  for (const p of staff) {
    hours[p.id] = 0;
    days[p.id] = 0;
    lastEnd[p.id] = null;
  }

  const assignments: Assignment[] = [];
  const warnings: string[] = [];
  let gaps = 0;

  for (let dayIndex = 0; dayIndex < weekDates.length; dayIndex++) {
    const date = weekDates[dayIndex];
    const progress = weekDates.length > 1 ? dayIndex / (weekDates.length - 1) : 1;
    const wd = isoWeekday(date);
    const reqs = coverage.filter((c) => c.weekday === wd && c.count > 0);

    // espandi gli slot e ordina per orario d'inizio (mattina prima)
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
        if (workedToday.has(`${p.id}|${date}`)) return false;
        const dayCap = p.days_per_week > 0 ? Math.min(p.days_per_week, 6) : 6;
        if (days[p.id] >= dayCap) return false;
        // Riserva di capacità: non superare il passo proporzionale entro questo
        // giorno, così restano giorni disponibili per il resto della settimana
        // (evita di esaurire i dipendenti nei feriali e scoprire il weekend).
        const pacedCap = Math.ceil((dayCap * (dayIndex + 1)) / weekDates.length);
        if (days[p.id] >= pacedCap) return false;
        const le = lastEnd[p.id];
        if (le && sStart.getTime() - le.getTime() < REST_MS) return false;
        if (p.hours_per_week > 0 && hours[p.id] + h > p.hours_per_week) return false;
        return true;
      });

      // priorità: dipendenti prima; poi chi è più "indietro" rispetto al
      // passo settimanale (così i giorni si spalmano e il weekend resta coperto);
      // a parità, chi è più scarico di ore.
      eligible.sort((a, b) => {
        if (a.type !== b.type) return a.type === "dipendente" ? -1 : 1;
        const capA = a.days_per_week > 0 ? Math.min(a.days_per_week, 6) : 6;
        const capB = b.days_per_week > 0 ? Math.min(b.days_per_week, 6) : 6;
        const defA = capA * progress - days[a.id]; // >0 = indietro sul passo
        const defB = capB * progress - days[b.id];
        if (Math.abs(defA - defB) > 1e-9) return defB - defA;
        const ra = a.hours_per_week > 0 ? hours[a.id] / a.hours_per_week : hours[a.id] / 40;
        const rb = b.hours_per_week > 0 ? hours[b.id] / b.hours_per_week : hours[b.id] / 40;
        if (ra !== rb) return ra - rb;
        return days[a.id] - days[b.id];
      });

      const pick = eligible[0];
      if (pick) {
        assignments.push({ date, shift_type_id: st.id, staff_id: pick.id });
        hours[pick.id] += h;
        days[pick.id] += 1;
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
    if (p.type === "dipendente" && p.hours_per_week > 0 && hours[p.id] < p.hours_per_week) {
      warnings.push(`${p.name}: ${hours[p.id]}h assegnate su ${p.hours_per_week}h di contratto.`);
    }
  }

  return { assignments, hoursByStaff: hours, daysByStaff: days, gaps, warnings };
}
