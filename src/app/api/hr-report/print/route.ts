import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const WEEKDAYS_IT = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
const MONTHS_IT = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

function monthDates(year: number, month: number): string[] {
  const days: string[] = [];
  const count = new Date(year, month, 0).getDate();
  for (let d = 1; d <= count; d++) {
    days.push(`${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  return days;
}

function isWeekday(d: string): boolean {
  const day = new Date(`${d}T00:00:00`).getDay();
  return day >= 1 && day <= 5;
}

function fmtDayShort(d: string): string {
  const dt = new Date(`${d}T00:00:00`);
  const wd = WEEKDAYS_IT[dt.getDay()];
  return `${wd} ${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}`;
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function shiftHours(start: string, end: string): number {
  let diff = toMin(end) - toMin(start);
  if (diff <= 0) diff += 24 * 60;
  return diff / 60;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

type StaffRow = { id: string; name: string; type: string; hours_per_week: number; profile_id: string | null };
type ShiftTypeRow = { id: string; name: string; start_time: string; end_time: string; color: string };
type ShiftRow = { shift_date: string; shift_type_id: string; staff_id: string };
type LeaveRow = { staff_id: string; date: string; type: string; period: string };

const SHIFT_COLORS: Record<string, string> = {
  M: "#1F3326", P: "#BFA762", R: "#888888", F: "#2563eb", MA: "#d97706", PE: "#7c3aed",
};

function errorPage(message: string, status: number) {
  return new NextResponse(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Errore</title>
<style>body{font-family:Arial,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#FAF9F5;color:#1F3326}
.card{background:#fff;border:1px solid #D8CCB8;border-radius:12px;padding:32px;text-align:center;max-width:400px}
h1{font-size:18px;margin:0 0 12px}p{font-size:14px;color:#6C6B5D;margin:0}</style></head>
<body><div class="card"><h1>${esc(message)}</h1><p>Contatta l'amministratore per un nuovo link.</p></div></body></html>`,
  { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");

  if (!token) {
    return errorPage("Link non valido", 400);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!serviceKey) {
    return errorPage("Configurazione server mancante", 500);
  }
  const admin = createClient(supabaseUrl, serviceKey);

  // Look up token
  const { data: logRow } = await admin.from("hr_report_logs")
    .select("*")
    .eq("print_token", token)
    .single();

  if (!logRow) {
    return errorPage("Report non trovato", 404);
  }

  // Check expiry
  if (logRow.print_token_expires && new Date(logRow.print_token_expires) < new Date()) {
    return errorPage("Questo link e' scaduto", 410);
  }

  // Parse month from log
  const [yearStr, monthStr] = (logRow.month as string).split("-");
  const year = parseInt(yearStr);
  const month = parseInt(monthStr);
  const staffName = logRow.staff_name as string;
  const staffType = logRow.staff_type as string;

  // Look up staff record: prefer staff_table_id (staff.id), fallback to profile_id
  let staffData = null;
  if (logRow.staff_table_id) {
    const res = await admin.from("staff")
      .select("id, name, type, hours_per_week, profile_id")
      .eq("id", logRow.staff_table_id)
      .single();
    staffData = res.data;
  }
  if (!staffData && logRow.staff_id) {
    const res = await admin.from("staff")
      .select("id, name, type, hours_per_week, profile_id")
      .eq("profile_id", logRow.staff_id)
      .single();
    staffData = res.data;
  }

  if (!staffData) {
    return errorPage("Persona non trovata nel sistema", 404);
  }

  const person = staffData as StaffRow;
  const dates = monthDates(year, month);
  const monthLabel = `${MONTHS_IT[month - 1]} ${year}`;

  const [{ data: shiftTypesData }, { data: shiftsData }, { data: leavesData }, { data: settingsRows }] = await Promise.all([
    admin.from("shift_types").select("id, name, start_time, end_time, color").order("sort"),
    admin.from("shifts").select("shift_date, shift_type_id, staff_id").eq("staff_id", person.id).gte("shift_date", dates[0]).lte("shift_date", dates[dates.length - 1]),
    admin.from("staff_leaves").select("staff_id, date, type, period").eq("status", "approvato").gte("date", dates[0]).lte("date", dates[dates.length - 1]),
    admin.from("settings").select("key, value").in("key", ["hr_hourly_rate"]),
  ]);

  const shiftTypes = (shiftTypesData ?? []) as ShiftTypeRow[];
  const shifts = (shiftsData ?? []) as ShiftRow[];
  const leaves = (leavesData ?? []) as LeaveRow[];
  const hourlyRate = Number((settingsRows ?? []).find(r => r.key === "hr_hourly_rate")?.value) || 8;

  const stById = new Map(shiftTypes.map(st => [st.id, st]));

  const profileToStaff = new Map<string, string>();
  if (person.profile_id) profileToStaff.set(person.profile_id, person.id);

  const personLeaves = leaves.filter(l => {
    const mapped = profileToStaff.get(l.staff_id);
    return mapped === person.id || l.staff_id === person.id;
  });
  const leaveByDate = new Map<string, LeaveRow>();
  for (const l of personLeaves) leaveByDate.set(l.date, l);

  const shiftByDate = new Map<string, ShiftRow>();
  for (const s of shifts) shiftByDate.set(s.shift_date, s);

  type DayRow = { dayLabel: string; shiftCode: string; hours: number; detail: string };
  const days: DayRow[] = [];
  const shiftTypeCounts: Record<string, number> = {};
  let workedHours = 0;
  let restDays = 0;
  let ferieDays = 0;
  let malattiaDays = 0;
  let permessoDays = 0;

  for (const date of dates) {
    const dayLabel = fmtDayShort(date);
    const shift = shiftByDate.get(date);
    const leave = leaveByDate.get(date);

    if (leave) {
      let code = "F";
      let detail = "Ferie";
      if (leave.type === "malattia") { code = "MA"; detail = "Malattia"; }
      else if (leave.type === "permesso") { code = "PE"; detail = "Permesso"; }
      const isWd = isWeekday(date);
      if (isWd) {
        detail += " (8h)";
        if (leave.type === "ferie") ferieDays++;
        else if (leave.type === "malattia") malattiaDays++;
        else permessoDays++;
      }
      days.push({ dayLabel, shiftCode: code, hours: isWd ? 8 : 0, detail });
    } else if (shift) {
      const st = stById.get(shift.shift_type_id);
      if (st) {
        const hrs = shiftHours(st.start_time, st.end_time);
        const code = st.name.charAt(0).toUpperCase();
        days.push({ dayLabel, shiftCode: code, hours: hrs, detail: `${hrs}h (${st.start_time.slice(0, 5)}-${st.end_time.slice(0, 5)})` });
        workedHours += hrs;
        shiftTypeCounts[st.name] = (shiftTypeCounts[st.name] ?? 0) + 1;
      }
    } else {
      days.push({ dayLabel, shiftCode: "R", hours: 0, detail: "Riposo" });
      restDays++;
    }
  }

  const leaveHours = (ferieDays + malattiaDays + permessoDays) * 8;
  const totalHours = workedHours + leaveHours;
  const isAChiamata = staffType === "a_chiamata";
  const amount = isAChiamata ? workedHours * hourlyRate : 0;
  const contract = person.hours_per_week > 0 ? `${person.hours_per_week}h/settimana` : "A chiamata";
  const staffTypeLabel = isAChiamata ? "A chiamata" : "Dipendente";
  const now = new Date();
  const generatedDate = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;

  const visibleDays = isAChiamata
    ? days.filter(day => day.shiftCode !== "R" && day.hours > 0)
    : days;

  const workedDaysCount = Object.values(shiftTypeCounts).reduce((a, c) => a + c, 0);

  const dayRowsHtml = visibleDays.map((day, i) => {
    const bg = i % 2 === 0 ? "#fff" : "#F8F7F3";
    const sc = SHIFT_COLORS[day.shiftCode] || "#333";
    return `<tr style="background:${bg}">
      <td class="dc">${esc(day.dayLabel)}</td>
      <td class="dc" style="text-align:center;font-weight:700;color:${sc}">${esc(day.shiftCode)}</td>
      <td class="dc">${esc(day.detail)}</td>
    </tr>`;
  }).join("");

  const shiftSummaryHtml = Object.entries(shiftTypeCounts).map(([name, count]) =>
    `<tr><td class="sc">Turni ${esc(name)}:</td><td class="sc" style="text-align:right;font-weight:600">${count} gg</td></tr>`
  ).join("");

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Report Ore - ${esc(staffName)} - ${esc(monthLabel)}</title>
<style>
  @media print {
    body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none !important; }
    @page { size: A4; margin: 12mm 10mm; }
    .container { max-width: none; padding: 0; }
  }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #333; background: #fff; margin: 0; padding: 16px; font-size: 11px; }
  .container { max-width: 700px; margin: 0 auto; }
  .header { background: #1F3326; color: #FAF9F5; padding: 14px 20px; text-align: center; }
  .header h1 { margin: 0; font-size: 16px; letter-spacing: 2px; }
  .header .sub { font-size: 9px; letter-spacing: 3px; color: #BFA762; margin-top: 3px; text-transform: uppercase; }
  .hr-banner { background: #F3EBDD; border-left: 3px solid #BFA762; padding: 6px 12px; margin: 8px 0; font-size: 10px; font-weight: 700; color: #1F3326; letter-spacing: 1px; }
  .title { margin: 8px 0 6px; font-size: 14px; color: #1F3326; }
  .info-table td { padding: 1px 0; font-size: 11px; }
  .info-table td:first-child { color: #6C6B5D; padding-right: 10px; }
  .info-table td:last-child { font-weight: 600; color: #1F3326; }
  .day-table { width: 100%; border-collapse: collapse; border: 1px solid #D8CCB8; margin: 6px 0; }
  .day-table th { background: #F3EBDD; padding: 4px 6px; text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: #1F3326; font-weight: 700; }
  .day-table th:nth-child(2) { text-align: center; }
  .dc { padding: 3px 6px; border-bottom: 1px solid #E8E4DC; font-size: 10px; }
  .summary { background: #F3EBDD; border: 1px solid #D8CCB8; border-radius: 6px; padding: 10px 14px; margin: 8px 0; }
  .summary h3 { margin: 0 0 6px; font-size: 9px; text-transform: uppercase; letter-spacing: 2px; color: #6C6B5D; }
  .summary table { width: 100%; }
  .sc { padding: 2px 0; font-size: 11px; }
  .total-row td { font-weight: 700; font-size: 12px; color: #1F3326; border-top: 1px solid #D8CCB8; padding-top: 5px; }
  .compenso { background: #1F3326; color: #FAF9F5; border-radius: 6px; padding: 10px 14px; margin: 8px 0; }
  .compenso .label { font-size: 9px; letter-spacing: 2px; color: #BFA762; font-weight: 700; text-transform: uppercase; margin-bottom: 4px; }
  .compenso .calc { font-size: 11px; color: #FAF9F5; }
  .compenso .total { font-size: 14px; font-weight: 700; color: #BFA762; margin-top: 5px; padding-top: 5px; border-top: 1px solid rgba(250,249,245,.2); }
  .footer { text-align: center; padding: 8px; font-size: 9px; color: #999; }
  .print-btn { display: inline-block; padding: 12px 24px; background: #1F3326; color: #fff; font-size: 14px; font-weight: 700; border: none; border-radius: 8px; cursor: pointer; margin: 12px auto; }
  .print-btn:hover { background: #2a4a35; }
</style>
</head>
<body>
<div class="container">
  <div class="no-print" style="text-align:center;margin-bottom:12px">
    <button class="print-btn" onclick="window.print()">Stampa questo report</button>
  </div>
  <div class="header">
    <h1>LE 4 CAMERE</h1>
    <div>HOTEL &#9733;&#9733;&#9733;</div>
    <div class="sub">GESTIONALE ALBERGHIERO</div>
  </div>
  <div class="hr-banner">REPORT PER IL REPARTO RISORSE UMANE</div>
  <h2 class="title">Report Ore &mdash; ${esc(monthLabel)}</h2>
  <table class="info-table">
    <tr><td>Persona:</td><td>${esc(staffName)}</td></tr>
    <tr><td>Tipo:</td><td>${esc(staffTypeLabel)}</td></tr>
    <tr><td>Contratto:</td><td>${esc(contract)}</td></tr>
  </table>
  <table class="day-table">
    <thead><tr><th>Data</th><th>Turno</th><th>Ore</th></tr></thead>
    <tbody>${dayRowsHtml}</tbody>
  </table>
  <div class="summary">
    <h3>Riepilogo</h3>
    <table>
      ${shiftSummaryHtml}
      ${!isAChiamata ? `<tr><td class="sc">Riposi:</td><td class="sc" style="text-align:right;font-weight:600">${restDays} gg</td></tr>` : ""}
      ${ferieDays > 0 ? `<tr><td class="sc" style="color:#2563eb">Ferie:</td><td class="sc" style="text-align:right;font-weight:600;color:#2563eb">${ferieDays} gg (${ferieDays * 8}h)</td></tr>` : ""}
      ${malattiaDays > 0 ? `<tr><td class="sc" style="color:#d97706">Malattia:</td><td class="sc" style="text-align:right;font-weight:600;color:#d97706">${malattiaDays} gg (${malattiaDays * 8}h)</td></tr>` : ""}
      ${permessoDays > 0 ? `<tr><td class="sc" style="color:#7c3aed">Permessi:</td><td class="sc" style="text-align:right;font-weight:600;color:#7c3aed">${permessoDays} gg (${permessoDays * 8}h)</td></tr>` : ""}
      ${isAChiamata
        ? `<tr class="total-row"><td>Giorni lavorati:</td><td style="text-align:right">${workedDaysCount} gg</td></tr>
           <tr><td style="font-weight:700;font-size:13px;color:#1F3326">ORE TOTALI:</td><td style="text-align:right;font-weight:700;font-size:13px;color:#1F3326">${workedHours}h</td></tr>`
        : `<tr class="total-row"><td>ORE LAVORATE:</td><td style="text-align:right">${workedHours}h</td></tr>
           ${leaveHours > 0 ? `<tr><td style="font-weight:700;color:#2563eb">ORE FERIE/PERMESSI:</td><td style="text-align:right;font-weight:700;color:#2563eb">${leaveHours}h</td></tr>` : ""}
           <tr><td style="font-weight:700;font-size:13px;color:#1F3326">ORE TOTALI:</td><td style="text-align:right;font-weight:700;font-size:13px;color:#1F3326">${totalHours}h</td></tr>`}
    </table>
  </div>
  ${isAChiamata ? `
  <div class="compenso">
    <div class="label">COMPENSO</div>
    <div class="calc">Ore lavorate: ${workedHours}h &times; &euro;${hourlyRate.toFixed(2)}/h = &euro;${amount.toFixed(2)}</div>
    <div class="total">TOTALE DA CORRISPONDERE: &euro;${amount.toFixed(2)}</div>
  </div>` : ""}
  <div class="footer">
    <p>Le 4 Camere Hotel &#9733;&#9733;&#9733; &mdash; Roverchiara, Verona</p>
    <p>Report generato il ${esc(generatedDate)}</p>
  </div>
</div>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
