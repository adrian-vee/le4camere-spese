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

export async function GET(req: NextRequest) {
  const staffId = req.nextUrl.searchParams.get("staff_id");
  const monthParam = req.nextUrl.searchParams.get("month"); // "2026-07"

  if (!staffId || !monthParam) {
    return NextResponse.json({ error: "Missing staff_id or month" }, { status: 400 });
  }

  const [yearStr, monthStr] = monthParam.split("-");
  const year = parseInt(yearStr);
  const month = parseInt(monthStr);
  if (!year || !month || month < 1 || month > 12) {
    return NextResponse.json({ error: "Invalid month format" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!serviceKey) {
    return NextResponse.json({ error: "Missing service role key" }, { status: 500 });
  }
  const admin = createClient(supabaseUrl, serviceKey);

  const dates = monthDates(year, month);
  const monthLabel = `${MONTHS_IT[month - 1]} ${year}`;

  const [{ data: staffData }, { data: shiftTypesData }, { data: shiftsData }, { data: leavesData }, { data: settingsRows }] = await Promise.all([
    admin.from("staff").select("id, name, type, hours_per_week, profile_id").eq("id", staffId).single(),
    admin.from("shift_types").select("id, name, start_time, end_time, color").order("sort"),
    admin.from("shifts").select("shift_date, shift_type_id, staff_id").eq("staff_id", staffId).gte("shift_date", dates[0]).lte("shift_date", dates[dates.length - 1]),
    admin.from("staff_leaves").select("staff_id, date, type, period").eq("status", "approvato").gte("date", dates[0]).lte("date", dates[dates.length - 1]),
    admin.from("settings").select("key, value").in("key", ["hr_hourly_rate"]),
  ]);

  if (!staffData) {
    return new NextResponse("Persona non trovata", { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  const person = staffData as StaffRow;
  const shiftTypes = (shiftTypesData ?? []) as ShiftTypeRow[];
  const shifts = (shiftsData ?? []) as ShiftRow[];
  const leaves = (leavesData ?? []) as LeaveRow[];
  const hourlyRate = Number((settingsRows ?? []).find(r => r.key === "hr_hourly_rate")?.value) || 8;

  const stById = new Map(shiftTypes.map(st => [st.id, st]));

  // Build profileToStaff map
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
  const isAChiamata = person.type === "a_chiamata";
  const amount = isAChiamata ? workedHours * hourlyRate : 0;
  const contract = person.hours_per_week > 0 ? `${person.hours_per_week}h/settimana` : "A chiamata";
  const staffType = isAChiamata ? "A chiamata" : "Dipendente";
  const now = new Date();
  const generatedDate = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;

  const dayRowsHtml = days.map((day, i) => {
    const bg = i % 2 === 0 ? "#fff" : "#FAF9F5";
    const sc = SHIFT_COLORS[day.shiftCode] || "#333";
    return `<tr style="background:${bg}">
      <td style="padding:6px 10px;border-bottom:1px solid #E8E4DC;font-size:12px">${esc(day.dayLabel)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #E8E4DC;text-align:center;font-weight:700;color:${sc};font-size:12px">${esc(day.shiftCode)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #E8E4DC;font-size:12px">${esc(day.detail)}</td>
    </tr>`;
  }).join("");

  const shiftSummaryHtml = Object.entries(shiftTypeCounts).map(([name, count]) =>
    `<tr><td style="padding:4px 0;font-size:13px">Turni ${esc(name)}:</td><td style="padding:4px 0;font-size:13px;font-weight:600;text-align:right">${count} giorni</td></tr>`
  ).join("");

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Report Ore - ${esc(person.name)} - ${esc(monthLabel)}</title>
<style>
  @media print {
    body { margin: 0; padding: 0; }
    .no-print { display: none !important; }
    @page { margin: 15mm 10mm; size: A4; }
  }
  body { font-family: Arial, Helvetica, sans-serif; color: #333; background: #fff; margin: 0; padding: 20px; }
  .container { max-width: 700px; margin: 0 auto; }
  .header { background: #1F3326; color: #FAF9F5; padding: 20px 24px; border-radius: 10px 10px 0 0; text-align: center; }
  .header h1 { margin: 0; font-size: 20px; letter-spacing: 2px; }
  .header .sub { font-size: 11px; letter-spacing: 3px; color: #BFA762; margin-top: 4px; text-transform: uppercase; }
  .hr-banner { background: #F3EBDD; border-left: 4px solid #BFA762; padding: 10px 16px; margin: 16px 0; border-radius: 4px; font-size: 12px; font-weight: 700; color: #1F3326; letter-spacing: 1px; }
  .info-table td { padding: 3px 0; font-size: 13px; }
  .info-table td:first-child { color: #6C6B5D; padding-right: 12px; }
  .info-table td:last-child { font-weight: 600; color: #1F3326; }
  .day-table { width: 100%; border-collapse: collapse; border: 1px solid #D8CCB8; margin: 16px 0; font-size: 12px; }
  .day-table th { background: #F3EBDD; padding: 8px 10px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #1F3326; font-weight: 700; }
  .day-table th:nth-child(2) { text-align: center; }
  .summary { background: #F3EBDD; border: 1px solid #D8CCB8; border-radius: 8px; padding: 16px 20px; margin: 16px 0; }
  .summary h3 { margin: 0 0 10px; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #6C6B5D; }
  .summary table { width: 100%; }
  .summary td { padding: 3px 0; font-size: 13px; }
  .total-row td { font-weight: 700; font-size: 14px; color: #1F3326; border-top: 1px solid #D8CCB8; padding-top: 8px; }
  .compenso { background: #1F3326; color: #FAF9F5; border-radius: 8px; padding: 16px 20px; margin: 16px 0; }
  .compenso .label { font-size: 11px; letter-spacing: 2px; color: #BFA762; font-weight: 700; text-transform: uppercase; margin-bottom: 8px; }
  .compenso .calc { font-size: 13px; color: #FAF9F5; }
  .compenso .total { font-size: 18px; font-weight: 700; color: #BFA762; margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(250,249,245,.2); }
  .footer { text-align: center; padding: 16px; font-size: 11px; color: #999; }
  .print-btn { display: inline-block; padding: 12px 24px; background: #1F3326; color: #fff; font-size: 14px; font-weight: 700; border: none; border-radius: 8px; cursor: pointer; margin: 16px auto; }
  .print-btn:hover { background: #2a4a35; }
</style>
</head>
<body>
<div class="container">
  <div class="no-print" style="text-align:center;margin-bottom:16px">
    <button class="print-btn" onclick="window.print()">&#128424; Stampa questo report</button>
  </div>
  <div class="header">
    <h1>LE 4 CAMERE</h1>
    <div>HOTEL &#9733;&#9733;&#9733;</div>
    <div class="sub">GESTIONALE ALBERGHIERO</div>
  </div>
  <div class="hr-banner">&#128203; REPORT PER IL REPARTO RISORSE UMANE</div>
  <h2 style="margin:16px 0 12px;font-size:18px;color:#1F3326">Report Ore &mdash; ${esc(monthLabel)}</h2>
  <table class="info-table">
    <tr><td>Persona:</td><td>${esc(person.name)}</td></tr>
    <tr><td>Tipo:</td><td>${esc(staffType)}</td></tr>
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
      <tr><td>Riposi:</td><td style="text-align:right;font-weight:600">${restDays} giorni</td></tr>
      ${ferieDays > 0 ? `<tr><td style="color:#2563eb">Ferie:</td><td style="text-align:right;font-weight:600;color:#2563eb">${ferieDays} giorni (${ferieDays * 8}h)</td></tr>` : ""}
      ${malattiaDays > 0 ? `<tr><td style="color:#d97706">Malattia:</td><td style="text-align:right;font-weight:600;color:#d97706">${malattiaDays} giorni (${malattiaDays * 8}h)</td></tr>` : ""}
      ${permessoDays > 0 ? `<tr><td style="color:#7c3aed">Permessi:</td><td style="text-align:right;font-weight:600;color:#7c3aed">${permessoDays} giorni (${permessoDays * 8}h)</td></tr>` : ""}
      <tr class="total-row"><td>ORE LAVORATE:</td><td style="text-align:right">${workedHours}h</td></tr>
      ${leaveHours > 0 ? `<tr><td style="font-weight:700;color:#2563eb">ORE FERIE/PERMESSI:</td><td style="text-align:right;font-weight:700;color:#2563eb">${leaveHours}h</td></tr>` : ""}
      <tr><td style="font-weight:700;font-size:15px;color:#1F3326">ORE TOTALI:</td><td style="text-align:right;font-weight:700;font-size:15px;color:#1F3326">${totalHours}h</td></tr>
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
