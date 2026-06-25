import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { sendMail, isMailerConfigured, hrReportEmailHtml, type HrReportData, type HrDayRow, type HrShiftSummary } from "@/lib/mailer";

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

type StaffRow = { id: string; name: string; type: string; hours_per_week: number; profile_id: string | null; active: boolean };
type ShiftTypeRow = { id: string; name: string; start_time: string; end_time: string; color: string };
type ShiftRow = { shift_date: string; shift_type_id: string; staff_id: string };
type LeaveRow = { staff_id: string; date: string; type: string; period: string };

export async function GET(req: NextRequest) {
  // Auth: cron secret or manual trigger
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const isManual = req.nextUrl.searchParams.get("manual") === "1";
  const staffFilter = req.nextUrl.searchParams.get("staff_id");
  const staffIds = req.nextUrl.searchParams.get("staff_ids"); // comma-separated
  const reportType = req.nextUrl.searchParams.get("type") || "initial";

  if (!isManual && cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isMailerConfigured()) {
    return NextResponse.json({ error: "SMTP not configured" }, { status: 500 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!serviceKey) {
    return NextResponse.json({ error: "Missing service role key" }, { status: 500 });
  }
  const admin = createClient(supabaseUrl, serviceKey);

  // Get settings
  const { data: settingsRows } = await admin.from("settings").select("key, value")
    .in("key", ["hr_email", "hr_hourly_rate", "hr_report_day", "hr_auto_send"]);
  const settings: Record<string, unknown> = {};
  for (const r of settingsRows ?? []) settings[r.key] = r.value;

  const hrEmail = (settings.hr_email as string) || "";
  const hourlyRate = Number(settings.hr_hourly_rate) || 8;

  if (!hrEmail) {
    return NextResponse.json({ error: "No HR email configured" }, { status: 400 });
  }

  // Determine month
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  const dates = monthDates(year, month);

  // Load staff, shift types, shifts, leaves
  const [{ data: staffData }, { data: shiftTypesData }, { data: shiftsData }, { data: leavesData }] = await Promise.all([
    admin.from("staff").select("id, name, type, hours_per_week, profile_id, active").eq("active", true).order("name"),
    admin.from("shift_types").select("id, name, start_time, end_time, color").order("sort"),
    admin.from("shifts").select("shift_date, shift_type_id, staff_id").gte("shift_date", dates[0]).lte("shift_date", dates[dates.length - 1]),
    admin.from("staff_leaves").select("staff_id, date, type, period").eq("status", "approvato").gte("date", dates[0]).lte("date", dates[dates.length - 1]),
  ]);

  const staffList = (staffData ?? []) as StaffRow[];
  const shiftTypes = (shiftTypesData ?? []) as ShiftTypeRow[];
  const shifts = (shiftsData ?? []) as ShiftRow[];
  const leaves = (leavesData ?? []) as LeaveRow[];

  const stById = new Map(shiftTypes.map(st => [st.id, st]));

  // Build profileId → staffId map
  const profileToStaff = new Map<string, string>();
  for (const s of staffList) {
    if (s.profile_id) profileToStaff.set(s.profile_id, s.id);
  }

  // Filter staff if specific staff requested
  const staffIdSet = staffIds ? new Set(staffIds.split(",").map(id => id.trim())) : null;
  const targetStaff = staffFilter
    ? staffList.filter(s => s.id === staffFilter)
    : staffIdSet
      ? staffList.filter(s => staffIdSet.has(s.id))
      : staffList;

  const sentResults: { name: string; success: boolean }[] = [];
  const generatedDate = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;

  for (const person of targetStaff) {
    // Shifts for this person
    const personShifts = shifts.filter(s => s.staff_id === person.id);
    const shiftByDate = new Map<string, ShiftRow>();
    for (const s of personShifts) shiftByDate.set(s.shift_date, s);

    // Leaves for this person (staff_leaves.staff_id = profiles.id)
    const personLeaves = leaves.filter(l => {
      const mappedStaffId = profileToStaff.get(l.staff_id);
      return mappedStaffId === person.id || l.staff_id === person.id;
    });
    const leaveByDate = new Map<string, LeaveRow>();
    for (const l of personLeaves) leaveByDate.set(l.date, l);

    const days: HrDayRow[] = [];
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
        const leaveType = leave.type;
        let code = "F";
        let detail = "Ferie";
        if (leaveType === "malattia") { code = "MA"; detail = "Malattia"; }
        else if (leaveType === "permesso") { code = "PE"; detail = "Permesso"; }

        const isWd = isWeekday(date);
        if (isWd) {
          detail += " (8h)";
          if (leaveType === "ferie") ferieDays++;
          else if (leaveType === "malattia") malattiaDays++;
          else permessoDays++;
        }

        days.push({ date, dayLabel, shiftCode: code, hours: isWd ? 8 : 0, detail });
      } else if (shift) {
        const st = stById.get(shift.shift_type_id);
        if (st) {
          const hrs = shiftHours(st.start_time, st.end_time);
          const code = st.name.charAt(0).toUpperCase();
          const startFmt = st.start_time.slice(0, 5);
          const endFmt = st.end_time.slice(0, 5);
          days.push({ date, dayLabel, shiftCode: code, hours: hrs, detail: `${hrs}h (${startFmt}-${endFmt})` });
          workedHours += hrs;
          shiftTypeCounts[st.name] = (shiftTypeCounts[st.name] ?? 0) + 1;
        }
      } else {
        days.push({ date, dayLabel, shiftCode: "R", hours: 0, detail: "Riposo" });
        restDays++;
      }
    }

    const leaveHours = (ferieDays + malattiaDays + permessoDays) * 8;
    const totalHours = workedHours + leaveHours;
    const isAChiamata = person.type === "a_chiamata";
    const amount = isAChiamata ? workedHours * hourlyRate : 0;

    const shiftSummaries: HrShiftSummary[] = Object.entries(shiftTypeCounts).map(([name, count]) => ({ name, count }));

    const contract = person.hours_per_week > 0 ? `${person.hours_per_week}h/settimana` : "A chiamata";
    const staffType = isAChiamata ? "A chiamata" : "Dipendente";

    const printToken = randomUUID();

    const data: HrReportData = {
      staffId: person.id,
      printToken,
      staffName: person.name,
      staffType,
      contract,
      monthKey: monthKey,
      monthLabel: `${MONTHS_IT[month - 1]} ${year}`,
      days,
      shiftSummaries,
      restDays,
      ferieDays,
      malattiaDays,
      permessoDays,
      workedHours,
      leaveHours,
      totalHours,
      isAChiamata,
      hourlyRate,
      amount,
      isUpdate: reportType === "update",
      generatedDate,
    };

    const html = hrReportEmailHtml(data);
    const subject = reportType === "update"
      ? `AGGIORNAMENTO - Report Ore ${MONTHS_IT[month - 1]} ${year} - ${person.name}`
      : `Report Ore ${MONTHS_IT[month - 1]} ${year} - ${person.name} - Le 4 Camere Hotel`;

    const sent = await sendMail({ to: hrEmail, subject, html });
    sentResults.push({ name: person.name, success: sent });

    // Log with print token (valid 90 days)
    const tokenExpires = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    await admin.from("hr_report_logs").insert({
      month: monthKey,
      staff_id: person.profile_id,
      staff_table_id: person.id,
      staff_name: person.name,
      staff_type: person.type,
      total_hours: totalHours,
      worked_hours: workedHours,
      leave_hours: leaveHours,
      amount: isAChiamata ? amount : null,
      report_type: reportType,
      email_sent_to: hrEmail,
      print_token: printToken,
      print_token_expires: tokenExpires,
    });
  }

  return NextResponse.json({
    month: monthKey,
    sent: sentResults.length,
    results: sentResults,
  });
}
