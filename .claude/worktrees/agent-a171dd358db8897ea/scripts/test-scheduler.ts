import {
  generateSchedule,
  shiftHours,
  isoWeekday,
  type Staff,
  type ShiftType,
  type CoverageReq,
} from "../src/lib/scheduler";

// --- Dati realistici: Le 4 Camere (13 stanze) ---
const shiftTypes: ShiftType[] = [
  { id: "M", name: "Reception mattino", start: "07:00", end: "14:00" }, // 7h
  { id: "P", name: "Reception pomeriggio", start: "14:00", end: "21:00" }, // 7h
  { id: "C", name: "Pulizie", start: "09:00", end: "14:00" }, // 5h
  { id: "N", name: "Notte", start: "21:00", end: "07:00" }, // 10h
];

const staff: Staff[] = [
  { id: "anna", name: "Anna", type: "dipendente", hours_per_week: 40, days_per_week: 5 },
  { id: "luca", name: "Luca", type: "dipendente", hours_per_week: 40, days_per_week: 5 },
  { id: "sara", name: "Sara", type: "dipendente", hours_per_week: 24, days_per_week: 4 },
  { id: "gio", name: "Giovanni", type: "a_chiamata", hours_per_week: 0, days_per_week: 6 },
];

// Copertura: ogni giorno M+P+C, più Notte da Ven a Dom
const coverage: CoverageReq[] = [];
for (let wd = 1; wd <= 7; wd++) {
  coverage.push({ weekday: wd, shift_type_id: "M", count: 1 });
  coverage.push({ weekday: wd, shift_type_id: "P", count: 1 });
  coverage.push({ weekday: wd, shift_type_id: "C", count: 1 });
  if (wd >= 5) coverage.push({ weekday: wd, shift_type_id: "N", count: 1 });
}

const week = ["2026-06-08", "2026-06-09", "2026-06-10", "2026-06-11", "2026-06-12", "2026-06-13", "2026-06-14"];

const res = generateSchedule(week, staff, shiftTypes, coverage, []);

// --- VERIFICA VINCOLI ---
const stById = new Map(shiftTypes.map((s) => [s.id, s]));
const REST_MS = 11 * 60 * 60 * 1000;
let violRest = 0, violDay = 0, violHours = 0, twoSameDay = 0;

const byStaff: Record<string, { date: string; start: Date; end: Date }[]> = {};
for (const a of res.assignments) {
  if (!a.staff_id) continue;
  const st = stById.get(a.shift_type_id)!;
  const start = new Date(`${a.date}T${st.start}:00`);
  const end = new Date(`${a.date}T${st.end}:00`);
  if (st.end <= st.start) end.setDate(end.getDate() + 1);
  (byStaff[a.staff_id] ||= []).push({ date: a.date, start, end });
}

for (const [id, list] of Object.entries(byStaff)) {
  list.sort((a, b) => a.start.getTime() - b.start.getTime());
  // due turni stesso giorno?
  const dates = list.map((l) => l.date);
  if (new Set(dates).size !== dates.length) twoSameDay++;
  // riposo 11h
  for (let i = 1; i < list.length; i++) {
    if (list[i].start.getTime() - list[i - 1].end.getTime() < REST_MS) {
      violRest++;
      console.log(`  ⚠ riposo <11h: ${id} ${list[i - 1].date}->${list[i].date}`);
    }
  }
  // giorni lavorati <= 6
  if (new Set(dates).size > 6) violDay++;
  // ore <= contratto
  const p = staff.find((s) => s.id === id)!;
  const h = list.reduce((s, l) => s + (l.end.getTime() - l.start.getTime()) / 3600000, 0);
  if (p.hours_per_week > 0 && h > p.hours_per_week + 0.001) {
    violHours++;
    console.log(`  ⚠ ore oltre contratto: ${id} ${h}h > ${p.hours_per_week}h`);
  }
}

console.log("=== TABELLA TURNI (giorno x fascia) ===");
const grid: Record<string, Record<string, string>> = {};
for (const a of res.assignments) {
  grid[a.date] ||= {};
  grid[a.date][a.shift_type_id] = a.staff_id
    ? staff.find((s) => s.id === a.staff_id)!.name
    : "— BUCO —";
}
const giorni = ["", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
for (const d of week) {
  const row = shiftTypes.map((st) => `${st.id}:${(grid[d]?.[st.id] ?? "·").padEnd(10)}`).join(" ");
  console.log(`${giorni[isoWeekday(d)]} ${d}  ${row}`);
}

console.log("\n=== ORE / GIORNI per persona ===");
for (const p of staff) {
  console.log(`  ${p.name.padEnd(9)} ${res.hoursByStaff[p.id]}h  /  ${res.daysByStaff[p.id]} giorni  (${p.type}, contratto ${p.hours_per_week || "-"}h)`);
}

console.log("\n=== ESITO VERIFICA ===");
console.log(`  Buchi non coperti: ${res.gaps}`);
console.log(`  Violazioni riposo 11h: ${violRest}`);
console.log(`  Violazioni giorno libero (>6gg): ${violDay}`);
console.log(`  Violazioni ore contratto: ${violHours}`);
console.log(`  Doppio turno stesso giorno: ${twoSameDay}`);
console.log("\n  Warnings:");
res.warnings.forEach((w) => console.log("   - " + w));

const ok = violRest === 0 && violDay === 0 && violHours === 0 && twoSameDay === 0;
console.log(`\n  >>> ${ok ? "✅ NESSUNA VIOLAZIONE DI VINCOLO" : "❌ VINCOLI VIOLATI"} <<<`);
process.exit(ok ? 0 : 1);
