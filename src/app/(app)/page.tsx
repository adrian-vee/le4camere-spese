import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { eur, fmtDate, monthKey, isoToday, type Expense, type Category } from "@/lib/format";
import { shouldGenerate as shouldGenerateRec } from "@/lib/recurring";
import DismissAlertLink from "@/components/DismissAlertLink";
import DashboardKpiCards from "./components/dashboard/DashboardKpiCards";
import DashboardRevenueChart from "./components/dashboard/DashboardRevenueChart";
import DashboardStaffTable from "./components/dashboard/DashboardStaffTable";
import StaffHomepage from "./components/dashboard/StaffHomepage";
import QuickActions from "./components/dashboard/QuickActions";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const now = new Date();
  const today = isoToday();
  const isoWd = now.getDay() === 0 ? 7 : now.getDay();
  const curM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const curY = String(now.getFullYear());

  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevM = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

  const mon = new Date(now);
  mon.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1));
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const weekStart = mon.toISOString().slice(0, 10);
  const weekEnd = sun.toISOString().slice(0, 10);

  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonthStartIso = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, "0")}-01`;
  const nextMonthLabel = nextMonthDate.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
  const nextMonthLabelCap = nextMonthLabel.charAt(0).toUpperCase() + nextMonthLabel.slice(1);
  // 6-month window for the chart
  const sixMonthAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const sixMonthStart = `${sixMonthAgo.getFullYear()}-${String(sixMonthAgo.getMonth() + 1).padStart(2, "0")}-01`;
  const availDeadlineDay = 25;
  const daysUntilAvailDeadline = availDeadlineDay - now.getDate();
  const isPastAvailDeadline = now.getDate() > availDeadlineDay;
  const isAvailUrgent = now.getDate() >= 20 && !isPastAvailDeadline;

  const [
    { data: profileData, error: profileError },
    { data: expData, error: expError },
    { data: catData, error: catError },
    { data: shiftTypesData, error: shiftTypesError },
    { data: coverageData, error: coverageError },
    { data: monthShiftsData, error: monthShiftsError },
    { data: staffData, error: staffError },
    { data: absData, error: absError },
    // todayShifts placeholder — extracted from monthShiftsData in JS
    { data: stockLevelsData, error: stockLevelsError },
    { data: recData, error: recError },
    { data: docsExpiringData, error: docsExpiringError },
    { data: utenzeMonthData, error: utenzeMonthError },
    { data: allLeavesData, error: allLeavesError },
    { data: expiryMovesData, error: expiryMovesError },
    { data: settingsData, error: settingsError },
    { data: barOrdersData, error: barOrdersError },
    { data: roomBookingsData, error: roomBookingsError },
  ] = await Promise.all([
    supabase.from("profiles").select("full_name, role, dismissed_alerts").eq("id", user.id).single(),
    supabase.from("expenses").select("*, categories(name,color), profiles(full_name)").gte("expense_date", sixMonthStart).order("expense_date", { ascending: false }),
    supabase.from("categories").select("*").order("sort"),
    supabase.from("shift_types").select("*").order("sort"),
    supabase.from("coverage_template").select("shift_type_id, count").eq("weekday", isoWd),
    supabase.from("shifts").select("shift_date, shift_type_id, staff_id").gte("shift_date", sixMonthStart).lte("shift_date", monthEnd),
    supabase.from("staff").select("*").eq("active", true).order("name"),
    supabase.from("absences").select("id, staff_id, absent_date, end_date, type, notes").gte("absent_date", `${now.getFullYear()}-01-01`).limit(200),
    supabase.from("stock_levels").select("product_id, name, current_stock, min_stock, unit").eq("active", true),
    supabase.from("recurring_expenses").select("id, name, frequency, last_generated, active").eq("active", true),
    supabase.from("documents").select("id, title, category, expiry_date").not("expiry_date", "is", null).gte("expiry_date", today).lte("expiry_date", new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30).toISOString().slice(0, 10)).eq("status", "attivo").order("expiry_date").limit(20),
    supabase.from("utility_bills").select("id, utility_type, amount, period_end").gte("period_end", sixMonthStart).lte("period_end", monthEnd),
    supabase.from("staff_leaves").select("*, profiles!staff_leaves_staff_id_fkey(full_name)").or(`status.eq.in_attesa,and(date.gte.${weekStart},date.lte.${weekEnd},status.eq.approvato)`).limit(100),
    supabase.from("stock_movements").select("product_id, expiry_date, products(name)").eq("type", "in").not("expiry_date", "is", null).lte("expiry_date", new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30).toISOString().slice(0, 10)).order("expiry_date").limit(50),
    supabase.from("settings").select("key, value"),
    // Bar revenue queries
    supabase.from("bar_orders").select("total, is_complimentary, original_total, created_at").eq("status", "pagato").gte("created_at", `${now.getFullYear()}-01-01`),
    // Room bookings for chart (valid, non-cancelled, non-blocked, 6-month window by arrival)
    supabase.from("smoobu_bookings").select("arrival, price").eq("is_cancelled", false).eq("is_blocked", false).gte("arrival", sixMonthStart).lte("arrival", monthEnd),
  ]);

  // Log critical query failures (don't break the page — show partial data)
  if (profileError) console.error("[dashboard] profile:", profileError.message);
  if (expError) console.error("[dashboard] expenses:", expError.message);
  if (monthShiftsError) console.error("[dashboard] shifts:", monthShiftsError.message);
  if (staffError) console.error("[dashboard] staff:", staffError.message);
  if (stockLevelsError) console.error("[dashboard] stock:", stockLevelsError.message);

  // Availability: check who has actual availability slots for next month.
  // The staff_availability_submissions.month_start column is NULL for existing records,
  // so we check staff_week_availability for actual slot data instead (same logic as /disponibilita admin).
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let monthAvailSubsData: { staff_id: string; submitted_at: string }[] | null = null;
  if (serviceKey) {
    const adminDb = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);
    const nextMonthLastDay = new Date(nextMonthDate.getFullYear(), nextMonthDate.getMonth() + 1, 0).getDate();
    const nextMonthEndIso = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, "0")}-${String(nextMonthLastDay).padStart(2, "0")}`;
    const { data: availSlots } = await adminDb
      .from("staff_week_availability")
      .select("staff_id")
      .gte("avail_date", nextMonthStartIso)
      .lte("avail_date", nextMonthEndIso);
    // Staff IDs that have at least one availability slot in the target month = "submitted"
    const staffIdsWithSlots = new Set((availSlots ?? []).map((r: { staff_id: string }) => r.staff_id));
    monthAvailSubsData = [...staffIdsWithSlots].map(id => ({ staff_id: id, submitted_at: "" }));
  }

  // Derive todayShifts from monthShifts (avoids a separate query)
  const todayShiftsData = (monthShiftsData ?? []).filter((s: { shift_date: string }) => s.shift_date === today);
  // Split combined leaves query into week approved + pending
  type LeaveRow = { id: string; staff_id: string; staff_name: string; date: string; type: string; period: string; reason: string | null; status: string };
  const allLeaves = (allLeavesData ?? []).map((l: Record<string, unknown>) => ({ ...l, staff_name: (l.profiles as { full_name?: string } | null)?.full_name || l.staff_name || "Dipendente rimosso" })) as LeaveRow[];
  const weekLeavesData = allLeaves.filter(l => l.status === "approvato" && l.date >= weekStart && l.date <= weekEnd);
  const pendingLeavesData = allLeaves.filter(l => l.status === "in_attesa");

  const profile = profileData as { full_name: string | null; role: string | null; dismissed_alerts?: string[] } | null;
  const userRole = profile?.role ?? "staff";
  const firstName = profile?.full_name?.split(" ")[0] || "Utente";
  const rawDate = now.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const greetingDate = rawDate.charAt(0).toUpperCase() + rawDate.slice(1);
  const hour = now.getHours();
  const greeting = hour < 14 ? "Buongiorno" : hour < 18 ? "Buon pomeriggio" : "Buonasera";

  /* ═══════════════════════════════════════════════
     STAFF DASHBOARD — early return
     ═══════════════════════════════════════════════ */
  if (userRole === "staff") {
    type STRow = { id: string; name: string; start_time: string; end_time: string; color: string; sort: number };
    type StaffR = { id: string; name: string; type?: string; profile_id?: string | null };
    type ShiftR = { shift_date: string; shift_type_id: string; staff_id: string | null };
    type CashSess = { id: string; closed_at: string | null };

    const shiftTypes = (shiftTypesData ?? []) as STRow[];
    const stMap = new Map(shiftTypes.map(st => [st.id, st]));
    const staffAll = (staffData ?? []) as StaffR[];

    // Match current user to a staff record via profile_id or full_name
    const fullName = profile?.full_name ?? "";
    const myStaff = staffAll.find(s => s.profile_id === user.id) ?? staffAll.find(s => s.name === fullName) ?? null;
    const myStaffId = myStaff?.id ?? null;
    const isAChiamataStaff = myStaff?.type === "a_chiamata";

    // Generate next 7 dates (including today)
    const next7: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      next7.push(d.toISOString().slice(0, 10));
    }

    const [
      { data: myTodayShiftsData },
      { data: myWeekShiftsData },
      { data: cassaTodayData },
      { data: swapReqData },
      { data: availSubData },
    ] = await Promise.all([
      myStaffId
        ? supabase.from("shifts").select("shift_date, shift_type_id, staff_id").eq("shift_date", today).eq("staff_id", myStaffId)
        : Promise.resolve({ data: [] }),
      myStaffId
        ? supabase.from("shifts").select("shift_date, shift_type_id, staff_id").gte("shift_date", next7[0]).lte("shift_date", next7[6]).eq("staff_id", myStaffId).order("shift_date")
        : Promise.resolve({ data: [] }),
      supabase.from("cash_sessions").select("id, closed_at").eq("shift_date", today).is("closed_at", null).limit(1),
      supabase.from("shift_swap_requests").select("id, request_date, request_shift, note, requester_id, profiles!shift_swap_requests_requester_id_fkey(full_name)").eq("target_id", user.id).eq("status", "pending"),
      (async () => {
        if (!isAChiamataStaff || !myStaffId) return { data: null };
        // Check actual availability slots for next month (month_start column is NULL in submissions)
        const nextMonthLastDay = new Date(nextMonthDate.getFullYear(), nextMonthDate.getMonth() + 1, 0).getDate();
        const nextMonthEndIso = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, "0")}-${String(nextMonthLastDay).padStart(2, "0")}`;
        const { data: slots } = await supabase.from("staff_week_availability")
          .select("avail_date").eq("staff_id", myStaffId)
          .gte("avail_date", nextMonthStartIso).lte("avail_date", nextMonthEndIso).limit(1);
        if (slots && slots.length > 0) {
          // Has slots = submitted; get submitted_at from submissions table
          const { data: mSub } = await supabase.from("staff_availability_submissions")
            .select("submitted_at").eq("staff_id", myStaffId).order("submitted_at", { ascending: false }).limit(1).maybeSingle();
          return { data: mSub ?? { submitted_at: new Date().toISOString() } };
        }
        return { data: null };
      })(),
    ]);

    const monthAvailSubmitted = isAChiamataStaff ? !!availSubData : false;
    const availSubmittedAt = (availSubData as { submitted_at: string } | null)?.submitted_at ?? null;

    const myTodayShifts = (myTodayShiftsData ?? []) as ShiftR[];
    const myWeekShifts = (myWeekShiftsData ?? []) as ShiftR[];
    const cassaOpen = ((cassaTodayData ?? []) as CashSess[]).length > 0;
    const pendingSwaps = ((swapReqData ?? []) as unknown as { id: string; request_date: string; request_shift: string | null; note: string | null; requester_id: string; profiles: { full_name: string }[] | { full_name: string } | null }[]).map(s => ({
      ...s,
      profiles: Array.isArray(s.profiles) ? (s.profiles[0] ?? null) : s.profiles,
    }));

    // Build today shift info
    const todayShiftInfo = myTodayShifts.length > 0
      ? myTodayShifts.map(s => {
          const st = stMap.get(s.shift_type_id);
          return st ? { name: st.name, start: st.start_time.slice(0, 5), end: st.end_time.slice(0, 5), color: st.color } : null;
        }).filter(Boolean) as { name: string; start: string; end: string; color: string }[]
      : [];

    // Build next shifts (exclude today)
    const nextShifts = myWeekShifts
      .filter(s => s.shift_date !== today)
      .map(s => {
        const st = stMap.get(s.shift_type_id);
        if (!st) return null;
        const d = new Date(s.shift_date + "T00:00:00");
        const dayLabel = d.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
        return { date: dayLabel, name: st.name, start: st.start_time.slice(0, 5), end: st.end_time.slice(0, 5), color: st.color };
      }).filter(Boolean) as { date: string; name: string; start: string; end: string; color: string }[];

    type StockItem = { product_id: string; name: string; current_stock: number; min_stock: number; unit: string };
    const lowStockItems = ((stockLevelsData ?? []) as StockItem[]).filter(p => p.min_stock > 0 && p.current_stock < p.min_stock);

    return (
      <StaffHomepage
        greeting={greeting}
        firstName={firstName}
        greetingDate={greetingDate}
        isAChiamata={isAChiamataStaff}
        todayShiftInfo={todayShiftInfo}
        nextShifts={nextShifts}
        cassaOpen={cassaOpen}
        lowStockItems={lowStockItems}
        pendingSwaps={pendingSwaps}
        monthAvailSubmitted={monthAvailSubmitted}
        availSubmittedAt={availSubmittedAt}
        nextMonthLabelCap={nextMonthLabelCap}
        isPastAvailDeadline={isPastAvailDeadline}
        isAvailUrgent={isAvailUrgent}
        daysUntilAvailDeadline={daysUntilAvailDeadline}
      />
    );
  }

  /* ═══════════════════════════════════════════════
     ADMIN / MANAGER DASHBOARD
     ═══════════════════════════════════════════════ */
  const expenses = (expData ?? []) as Expense[];
  const cats = (catData ?? []) as Category[];

  /* ── KPI ── */
  const sumMonth = expenses.filter(e => monthKey(e.expense_date) === curM).reduce((s, e) => s + Number(e.amount), 0);
  const sumPrevMonth = expenses.filter(e => monthKey(e.expense_date) === prevM).reduce((s, e) => s + Number(e.amount), 0);
  const deltaPct = sumPrevMonth > 0 ? Math.round(((sumMonth - sumPrevMonth) / sumPrevMonth) * 100) : null;

  const yearExp = expenses.filter(e => new Date(e.expense_date).getFullYear().toString() === curY);
  const sumYear = yearExp.reduce((s, e) => s + Number(e.amount), 0);

  const toPay = expenses.filter(e => e.payment_status === "da_pagare");
  const sumToPay = toPay.reduce((s, e) => s + Number(e.amount), 0);
  const overdue = toPay.filter(e => e.due_date && e.due_date < today);

  /* ── Bar Revenue ── */
  type BarOrderRow = { total: number; is_complimentary: boolean; original_total: number | null; created_at: string };
  const barOrders = (barOrdersData ?? []) as BarOrderRow[];
  const barOrdersToday = barOrders.filter(o => o.created_at.slice(0, 10) === today && !o.is_complimentary);
  const barRevenueToday = barOrdersToday.reduce((s, o) => s + Number(o.total), 0);
  const barOrdersTodayCount = barOrdersToday.length;
  const barOrdersMonth = barOrders.filter(o => o.created_at.slice(0, 7) === curM && !o.is_complimentary);
  const barRevenueMonth = barOrdersMonth.reduce((s, o) => s + Number(o.total), 0);
  const barComplimentaryMonth = barOrders.filter(o => o.created_at.slice(0, 7) === curM && o.is_complimentary);
  const barComplimentaryValue = barComplimentaryMonth.reduce((s, o) => s + Number(o.original_total ?? o.total), 0);

  /* ── Shift types & staff maps ── */
  type STRow = { id: string; name: string; start_time: string; end_time: string; color: string; sort: number };
  type StaffR = { id: string; name: string; type: "dipendente" | "a_chiamata"; hours_per_week: number; active: boolean };

  const shiftTypes = (shiftTypesData ?? []) as STRow[];
  const stMap = new Map(shiftTypes.map(st => [st.id, st]));
  const staffList = (staffData ?? []) as StaffR[];
  const staffMap = new Map(staffList.map(s => [s.id, s]));

  /* ── Today's shifts ── */
  type CovRow = { shift_type_id: string; count: number };
  type ShiftR = { shift_date: string; shift_type_id: string; staff_id: string | null };

  const covRows = (coverageData ?? []) as CovRow[];
  const todayShifts = (todayShiftsData ?? []) as ShiftR[];

  type AbsRow = { id: string; staff_id: string; absent_date: string; end_date: string | null; type: string; notes: string | null };
  const absRows = (absData ?? []) as AbsRow[];
  const todayAbsentIds = new Set(
    absRows.filter(a => { const end = a.end_date || a.absent_date; return a.absent_date <= today && end >= today; }).map(a => a.staff_id),
  );

  type TodaySlot = { shiftName: string; startTime: string; endTime: string; color: string; staffName: string | null; isAbsent: boolean };
  const todaySchedule: TodaySlot[] = [];
  for (const cov of covRows) {
    const st = stMap.get(cov.shift_type_id);
    if (!st || cov.count <= 0) continue;
    const assigned = todayShifts.filter(s => s.shift_type_id === cov.shift_type_id && s.staff_id);
    for (let i = 0; i < cov.count; i++) {
      const shift = assigned[i];
      const staffId = shift?.staff_id;
      const member = staffId ? staffMap.get(staffId) : null;
      todaySchedule.push({
        shiftName: st.name,
        startTime: st.start_time.slice(0, 5),
        endTime: st.end_time.slice(0, 5),
        color: st.color,
        staffName: member?.name ?? null,
        isAbsent: staffId ? todayAbsentIds.has(staffId) : false,
      });
    }
  }

  /* ── Week absences ── */
  const weekAbsences = absRows
    .filter(a => { const end = a.end_date || a.absent_date; return a.absent_date <= weekEnd && end >= weekStart; })
    .map(a => ({ ...a, staffName: staffMap.get(a.staff_id)?.name ?? "?" }));

  /* ── Unpaid expenses ── */
  const unpaid = [...toPay].sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999")).slice(0, 10);

  /* ── Staff monthly summary ── */
  const allShifts6m = (monthShiftsData ?? []) as ShiftR[];
  const mShifts = allShifts6m.filter(s => s.shift_date >= monthStart && s.shift_date <= monthEnd);
  function calcHours(start: string, end: string): number {
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    let diff = (eh * 60 + em) - (sh * 60 + sm);
    if (diff <= 0) diff += 24 * 60;
    return diff / 60;
  }
  const staffHours: Record<string, number> = {};
  for (const s of mShifts) {
    if (!s.staff_id) continue;
    const st = stMap.get(s.shift_type_id);
    if (!st) continue;
    staffHours[s.staff_id] = (staffHours[s.staff_id] ?? 0) + calcHours(st.start_time, st.end_time);
  }
  const settingsMap: Record<string, string> = {};
  for (const r of (settingsData ?? []) as { key: string; value: string }[]) settingsMap[r.key] = r.value;
  const HOURLY_RATE = Number(settingsMap["default_hourly_rate"]) || 8;
  const staffSummary = staffList
    .map(s => ({ name: s.name, type: s.type, hours: staffHours[s.id] ?? 0, cost: s.type === "a_chiamata" ? (staffHours[s.id] ?? 0) * HOURLY_RATE : null }))
    .filter(s => s.hours > 0);
  const totalOnCallCost = staffSummary.reduce((sum, s) => sum + (s.cost ?? 0), 0);

  // Per-month helpers (must be defined before chart loop)
  const onCallStaffIds = new Set(staffList.filter(s => s.type === "a_chiamata").map(s => s.id));
  function staffCostForMonth(monthKey6: string): number {
    const shifts = allShifts6m.filter(s => s.staff_id && s.shift_date.slice(0, 7) === monthKey6 && onCallStaffIds.has(s.staff_id));
    let hours = 0;
    for (const s of shifts) {
      const st = stMap.get(s.shift_type_id);
      if (st) hours += calcHours(st.start_time, st.end_time);
    }
    return hours * HOURLY_RATE;
  }

  type UtMonthRow = { id: string; utility_type: string; amount: number; period_end: string };
  const allUtilities6m = (utenzeMonthData ?? []) as UtMonthRow[];
  function utilityCostForMonth(monthKey6: string): number {
    return allUtilities6m.filter(b => (b.period_end as string).slice(0, 7) === monthKey6).reduce((s, b) => s + Number(b.amount), 0);
  }

  /* ── Utenze this month ── */
  const utenzeMonth = allUtilities6m.filter(b => (b.period_end as string).slice(0, 7) === curM);
  const utenzeTotalMonth = utenzeMonth.reduce((s, b) => s + Number(b.amount), 0);
  const utenzeByType: Record<string, number> = {};
  for (const b of utenzeMonth) utenzeByType[b.utility_type] = (utenzeByType[b.utility_type] ?? 0) + Number(b.amount);

  /* ── Room revenue from Smoobu bookings ── */
  type RoomBookingRow = { arrival: string; price: number };
  const roomBookings = (roomBookingsData ?? []) as RoomBookingRow[];
  function roomRevenueForMonth(mk: string): number {
    return roomBookings.filter(b => b.arrival?.slice(0, 7) === mk).reduce((s, b) => s + (Number(b.price) || 0), 0);
  }
  const roomRevenueMonth = roomRevenueForMonth(curM);

  /* ── 6-month trend (margine operativo) ── */
  const months6: { key: string; label: string; total: number }[] = [];
  const revenueChartData: { label: string; entrate: number; uscite: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const lbl = d.toLocaleDateString("it-IT", { month: "short" });
    const label = lbl.charAt(0).toUpperCase() + lbl.slice(1);
    const expTotal = expenses.filter(e => monthKey(e.expense_date) === key).reduce((s, e) => s + Number(e.amount), 0);
    const staffCost = staffCostForMonth(key);
    const utCost = utilityCostForMonth(key);
    const total = expTotal + staffCost + utCost;
    months6.push({ key, label, total });
    const barRev = barOrders.filter(o => o.created_at.slice(0, 7) === key && !o.is_complimentary).reduce((s, o) => s + Number(o.total), 0);
    const roomRev = roomRevenueForMonth(key);
    revenueChartData.push({ label, entrate: barRev + roomRev, uscite: total });
  }
  const monthsWithData = revenueChartData.filter(m => m.entrate > 0 || m.uscite > 0);
  const avgMargin = monthsWithData.length > 0
    ? monthsWithData.reduce((s, m) => s + (m.entrate - m.uscite), 0) / monthsWithData.length
    : null;

  /* ── Top 5 suppliers ── */
  const monthExpenses = expenses.filter(e => monthKey(e.expense_date) === curM);
  const bySup: Record<string, number> = {};
  for (const e of monthExpenses) {
    const name = e.supplier_name || "Senza fornitore";
    bySup[name] = (bySup[name] ?? 0) + Number(e.amount);
  }
  const topSuppliers = Object.entries(bySup).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total).slice(0, 5);

  /* ── Saldo ── */
  const entrateMonth = barRevenueMonth + roomRevenueMonth;
  const usciteMonth = sumMonth + totalOnCallCost + utenzeTotalMonth;
  const saldoMonth = entrateMonth - usciteMonth;

  /* ── Category breakdown ── */
  const byCat: Record<string, { name: string; color: string; val: number }> = {};
  for (const e of yearExp) {
    const key = e.category_id ?? "none";
    const name = e.categories?.name ?? "Altro";
    const color = e.categories?.color ?? "#9C8E78";
    byCat[key] = byCat[key] || { name, color, val: 0 };
    byCat[key].val += Number(e.amount);
  }
  const bars = Object.values(byCat).sort((a, b) => b.val - a.val);
  const maxBar = Math.max(1, ...bars.map(b => b.val));

  /* ── Low stock ── */
  type StockItem = { product_id: string; name: string; current_stock: number; min_stock: number; unit: string };
  const lowStock = ((stockLevelsData ?? []) as StockItem[]).filter(p => p.min_stock > 0 && p.current_stock < p.min_stock);

  /* ── Recurring expenses pending ── */
  type RecRow = { id: string; name: string; frequency: string; last_generated: string | null; active: boolean };
  const recRows = (recData ?? []) as RecRow[];
  const pendingRec = recRows.filter(r =>
    r.active && shouldGenerateRec(r.frequency, now.getMonth() + 1) && (!r.last_generated || r.last_generated < monthStart)
  );

  /* ── Documents expiring soon ── */
  type DocExpRow = { id: string; title: string; category: string; expiry_date: string };
  const docsExpiring = (docsExpiringData ?? []) as DocExpRow[];

  /* ── Leaves this week ── */
  type LeaveR = { id: string; staff_id: string; staff_name: string; date: string; type: string; period: string; reason: string | null; status: string };
  const weekLeaves = weekLeavesData as LeaveR[];
  const pendingLeaves = pendingLeavesData as LeaveR[];

  /* ── Cassa alerts (admin only) ── */
  type CassaAlert = { key: string; type: string; message: string };
  const cassaAlerts: CassaAlert[] = [];
  const dismissedSet = new Set(Array.isArray(profile?.dismissed_alerts) ? profile.dismissed_alerts : []);
  if (userRole === "admin") {
    const tenHoursAgo = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString();
    const [{ data: stuckSessions }, { data: recentClosedSessions }, { data: todayCassaSessions }] = await Promise.all([
      supabase.from("cash_sessions").select("id, opened_at, opened_by, shift_type").is("closed_at", null).lt("opened_at", tenHoursAgo),
      supabase.from("cash_sessions").select("id, shift_type, expected_amount, actual_amount, closed_at").not("closed_at", "is", null).gte("shift_date", today),
      supabase.from("cash_sessions").select("shift_date, shift_type").not("shift_type", "is", null).eq("shift_date", today),
    ]);
    for (const s of (stuckSessions ?? []) as { id: string; opened_at: string; shift_type: string | null }[]) {
      const hrs = Math.round((Date.now() - new Date(s.opened_at).getTime()) / 3600000);
      cassaAlerts.push({ key: `cassa_stuck_${s.id}`, type: "stuck", message: `Sessione cassa aperta da ${hrs}h${s.shift_type ? ` (turno ${s.shift_type})` : ""}` });
    }
    for (const s of (recentClosedSessions ?? []) as { id: string; shift_type: string | null; expected_amount: number | null; actual_amount: number | null }[]) {
      if (s.expected_amount != null && s.actual_amount != null) {
        const diff = Math.abs(s.actual_amount - s.expected_amount);
        if (diff > 10) cassaAlerts.push({ key: `cassa_diff_${s.id}`, type: "diff", message: `Differenza cassa di ${diff.toFixed(2)}€${s.shift_type ? ` nel turno ${s.shift_type}` : ""}` });
      }
    }
    const dupMap = new Map<string, number>();
    for (const s of (todayCassaSessions ?? []) as { shift_date: string; shift_type: string }[]) {
      const key = s.shift_type;
      dupMap.set(key, (dupMap.get(key) ?? 0) + 1);
    }
    for (const [st, count] of dupMap) {
      if (count > 1) cassaAlerts.push({ key: `cassa_dup_${today}_${st}`, type: "dup", message: `${count} sessioni aperte per il turno "${st}" oggi` });
    }
  }
  const visibleCassaAlerts = cassaAlerts.filter(a => !dismissedSet.has(a.key));

  /* ── Availability submissions for next month ── */
  const aChiamataList = staffList.filter(s => s.type === "a_chiamata");
  const monthAvailSubs = (monthAvailSubsData ?? []) as { staff_id: string; submitted_at: string }[];
  const monthSubIds = new Set(monthAvailSubs.map(s => s.staff_id));
  const availSubmittedCount = aChiamataList.filter(s => monthSubIds.has(s.id)).length;
  const availMissingStaff = aChiamataList.filter(s => !monthSubIds.has(s.id));
  const availAllSubmitted = availSubmittedCount === aChiamataList.length && aChiamataList.length > 0;

  /* ── Upcoming inventory widget ── */
  const invNextDate = settingsMap["inventario_prossima_data"] ?? "";
  let invDaysUntil: number | null = null;
  let invAfternoonStaff: string | null = null;
  if (invNextDate) {
    const invD = new Date(invNextDate + "T00:00:00");
    const todayD = new Date(today + "T00:00:00");
    invDaysUntil = Math.round((invD.getTime() - todayD.getTime()) / 86400000);
    if (invDaysUntil >= 0 && invDaysUntil <= 7) {
      const pomType = shiftTypes.find(st => st.name.toLowerCase().includes("pomeriggio"));
      if (pomType) {
        const { data: invShifts } = await supabase
          .from("shifts")
          .select("staff_id")
          .eq("shift_date", invNextDate)
          .eq("shift_type_id", pomType.id)
          .not("staff_id", "is", null)
          .limit(1);
        const invShift = (invShifts ?? [])[0] as { staff_id: string } | undefined;
        if (invShift) {
          const member = staffList.find(s => s.id === invShift.staff_id);
          invAfternoonStaff = member?.name ?? null;
        }
      }
    }
  }

  const recent = expenses.slice(0, 8);

  const monthShortLabel = now.toLocaleDateString("it-IT", { month: "long" });
  const monthLabel = now.toLocaleDateString("it-IT", { month: "long", year: "numeric" });

  // Previous month saldo for trend calculation
  const prevMonthEntrate = revenueChartData.length >= 2 ? revenueChartData[revenueChartData.length - 2].entrate : 0;
  const prevMonthUscite = revenueChartData.length >= 2 ? revenueChartData[revenueChartData.length - 2].uscite : 0;
  const prevSaldo = prevMonthEntrate - prevMonthUscite;
  const saldoTrendPct = prevSaldo !== 0 ? ((saldoMonth - prevSaldo) / Math.abs(prevSaldo)) * 100 : null;

  // Previous month bar revenue for trend
  const prevBarRevenue = revenueChartData.length >= 2 ? revenueChartData[revenueChartData.length - 2].entrate : 0;
  const barTrendPct = prevBarRevenue > 0 ? ((barRevenueMonth - prevBarRevenue) / prevBarRevenue) * 100 : null;

  // KPI icon SVGs
  const iconRevenue = <svg viewBox="0 0 24 24" fill="none" stroke="#1F3326" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><text x="12" y="16" textAnchor="middle" fill="#1F3326" stroke="none" fontSize="12" fontWeight="700" fontFamily="Albert Sans, sans-serif">&euro;</text></svg>;
  const iconTrend = <svg viewBox="0 0 24 24" fill="none" stroke="#1F3326" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.2 7.8l-7.7 7.7-4-4-5.7 5.7"/><path d="M15 7h6v6"/></svg>;
  const iconExpense = <svg viewBox="0 0 24 24" fill="none" stroke="#1F3326" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 18 15 15"/></svg>;
  const iconStaff = <svg viewBox="0 0 24 24" fill="none" stroke="#1F3326" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>;
  const iconClock = <svg viewBox="0 0 24 24" fill="none" stroke="#1F3326" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;

  const kpiCards = [
    {
      label: "Ricavi bar oggi",
      value: barRevenueToday,
      format: "eur" as const,
      subtitle: `${barOrdersTodayCount} ordin${barOrdersTodayCount === 1 ? "e" : "i"}`,
      icon: iconRevenue,
      iconBg: "linear-gradient(135deg, #F3EBDD 0%, #EDE0C8 100%)",
      borderTop: "#BFA762",
      hideOnMobile: true,
    },
    {
      label: "Ricavi bar mese",
      value: barRevenueMonth,
      format: "eur" as const,
      subtitle: barComplimentaryValue > 0 ? `${eur(barComplimentaryValue)} omaggi` : monthShortLabel,
      icon: iconTrend,
      borderTop: "#BFA762",
      trend: barTrendPct !== null ? { pct: Math.round(barTrendPct), label: "vs mese prec." } : null,
    },
    {
      label: "Spese mese",
      value: sumMonth,
      format: "eur" as const,
      subtitle: `${monthExpenses.length} registrazion${monthExpenses.length === 1 ? "e" : "i"}`,
      icon: iconExpense,
      trend: deltaPct !== null ? { pct: deltaPct, label: "vs mese prec." } : null,
    },
    {
      label: "Costo personale",
      value: totalOnCallCost,
      format: "eur" as const,
      subtitle: `a chiamata · ${monthShortLabel}`,
      icon: iconStaff,
    },
    {
      label: "Da pagare",
      value: sumToPay,
      format: "eur" as const,
      subtitle: `${toPay.length} in sospeso${overdue.length > 0 ? ` · ${overdue.length} scadut${overdue.length === 1 ? "a" : "e"}` : ""}`,
      icon: iconClock,
      valueColor: overdue.length > 0 ? "#9E3B2E" : undefined,
    },
  ];

  const saldoData = {
    value: saldoMonth,
    entrate: entrateMonth,
    uscite: usciteMonth,
    trend: saldoTrendPct !== null ? { pct: Math.round(saldoTrendPct), label: "vs mese prec." } : null,
  };

  return (
    <>
      <QuickActions />

      {/* ── KPI Bento Grid ── */}
      <DashboardKpiCards cards={kpiCards} saldo={saldoData} />

      {/* ── Spese da approvare ── */}
      {(() => {
        const pendingApproval = expenses.filter(e => e.needs_approval);
        if (pendingApproval.length === 0) return null;
        return (
          <div style={{
            padding: "16px 20px", borderRadius: 12, marginBottom: 20,
            background: "rgba(191,167,98,.08)", border: "1px solid rgba(191,167,98,.3)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: pendingApproval.length > 1 ? 12 : 0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#BFA762" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
              </svg>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#8B7333" }}>
                {pendingApproval.length} {pendingApproval.length === 1 ? "spesa da approvare" : "spese da approvare"}
              </span>
              <Link href="/spese" style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700, color: "#BFA762", textDecoration: "none" }}>
                Vai alle spese &rarr;
              </Link>
            </div>
            {pendingApproval.slice(0, 5).map(e => (
              <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 30, fontSize: 13, color: "#8B7333", marginTop: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#BFA762", flexShrink: 0 }} />
                <span style={{ fontWeight: 600 }}>{eur(Number(e.amount))}</span>
                <span>— {e.profiles?.full_name ?? "Staff"} · {fmtDate(e.expense_date)}</span>
              </div>
            ))}
            {pendingApproval.length > 5 && (
              <div style={{ marginLeft: 30, fontSize: 12, color: "#8B7333", marginTop: 6 }}>+{pendingApproval.length - 5} altre</div>
            )}
          </div>
        );
      })()}

      {/* ── Cassa alerts (admin only) ── */}
      {visibleCassaAlerts.length > 0 && (
        <div style={{
          padding: "16px 20px", borderRadius: 12, marginBottom: 20,
          background: "rgba(158,59,46,.06)", border: "1px solid rgba(158,59,46,.25)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: visibleCassaAlerts.length > 1 ? 12 : 0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9E3B2E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <path d="M12 9v4M12 17h.01" />
            </svg>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#9E3B2E" }}>
              {visibleCassaAlerts.length} alert cassa
            </span>
            <DismissAlertLink
              keys={visibleCassaAlerts.map(a => a.key)}
              href="/cassa"
              style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700, color: "#9E3B2E", textDecoration: "none" }}
            >
              Vai alla cassa &rarr;
            </DismissAlertLink>
          </div>
          {visibleCassaAlerts.length > 1 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginLeft: 30 }}>
              {visibleCassaAlerts.map(a => (
                <div key={a.key} style={{ fontSize: 13, color: "#9E3B2E", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#9E3B2E", flexShrink: 0 }} />
                  {a.message}
                </div>
              ))}
            </div>
          ) : (
            <span style={{ fontSize: 13, color: "#9E3B2E", marginLeft: 30 }}>{visibleCassaAlerts[0].message}</span>
          )}
        </div>
      )}

      {/* ── Recurring expenses alert ── */}
      {pendingRec.length > 0 && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
          padding: "14px 20px", borderRadius: 12, marginBottom: 20,
          background: "#FAF6EE", borderLeft: "4px solid #BFA762", border: "1px solid #D8CCB8",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B68A3E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>
              {pendingRec.length} {pendingRec.length === 1 ? "spesa ricorrente" : "spese ricorrenti"} da generare per {now.toLocaleDateString("it-IT", { month: "long" })}
            </span>
          </div>
          <Link href="/spese" style={{ fontSize: 13, fontWeight: 700, color: "#B68A3E" }}>Vai alle spese &rarr;</Link>
        </div>
      )}

      {/* ── Prodotti in scadenza ── */}
      {(() => {
        type ExpiryMoveRaw = { product_id: string; expiry_date: string; products: { name: string }[] | { name: string } | null };
        const expiryRaw = (expiryMovesData ?? []) as ExpiryMoveRaw[];
        const expiryMoves = expiryRaw.map(m => ({
          ...m,
          products: Array.isArray(m.products) ? (m.products[0] ?? null) : m.products,
        }));
        if (expiryMoves.length === 0) return null;
        const seen = new Set<string>();
        const unique = expiryMoves.filter(m => { if (seen.has(m.product_id)) return false; seen.add(m.product_id); return true; });
        const expired = unique.filter(m => m.expiry_date < today);
        const expiring = unique.filter(m => m.expiry_date >= today);
        return (
          <div style={{
            padding: "16px 20px", borderRadius: 12, marginBottom: 20,
            background: expired.length > 0 ? "rgba(158,59,46,.06)" : "rgba(199,123,74,.08)",
            border: `1px solid ${expired.length > 0 ? "rgba(158,59,46,.25)" : "rgba(199,123,74,.3)"}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: unique.length > 1 ? 10 : 0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={expired.length > 0 ? "#9E3B2E" : "#C77B4A"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
              </svg>
              <span style={{ fontSize: 15, fontWeight: 700, color: expired.length > 0 ? "#9E3B2E" : "#8B6030" }}>
                {expired.length > 0 && `${expired.length} scadut${expired.length === 1 ? "o" : "i"}`}
                {expired.length > 0 && expiring.length > 0 && " · "}
                {expiring.length > 0 && `${expiring.length} in scadenza`}
              </span>
              <Link href="/magazzino" style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700, color: expired.length > 0 ? "#9E3B2E" : "#C77B4A", textDecoration: "none" }}>
                Vai al magazzino &rarr;
              </Link>
            </div>
            {unique.slice(0, 5).map(m => (
              <div key={m.product_id} style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 30, fontSize: 13, color: m.expiry_date < today ? "#9E3B2E" : "#8B6030", marginTop: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: m.expiry_date < today ? "#9E3B2E" : "#C77B4A", flexShrink: 0 }} />
                <span style={{ fontWeight: 600 }}>{m.products?.name ?? "?"}</span>
                <span>— scade {fmtDate(m.expiry_date)}</span>
              </div>
            ))}
            {unique.length > 5 && (
              <div style={{ marginLeft: 30, fontSize: 12, color: "#8B6030", marginTop: 6 }}>+{unique.length - 5} altri</div>
            )}
          </div>
        );
      })()}

      {/* ── Entrate vs Uscite Chart ── */}
      <DashboardRevenueChart data={revenueChartData} avgMargin={avgMargin} />

      {/* ── 2-column grid ── */}
      <div className="dash-grid">

        {/* Turni di oggi */}
        <div className="section">
          <div className="section-head">
            <h2>Turni di oggi</h2>
            <span className="muted">{fmtDate(today)}</span>
          </div>
          <div className="section-body">
            {todaySchedule.length === 0 ? (
              <p className="muted">Nessuna copertura prevista per oggi.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {todaySchedule.map((s, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "10px 14px", borderRadius: 10,
                    background: s.staffName ? "var(--surface)" : "rgba(158,59,46,.06)",
                    border: `1px solid ${s.staffName ? "var(--line)" : "var(--danger)"}`,
                  }}>
                    <span className="dot" style={{ background: s.color }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{s.shiftName}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{s.startTime}–{s.endTime}</div>
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: s.staffName ? "var(--ink)" : "var(--danger)" }}>
                      {s.staffName ? (
                        <>
                          {s.staffName}
                          {s.isAbsent && <span className="badge warn" style={{ marginLeft: 8 }}>assente</span>}
                        </>
                      ) : (
                        "— Scoperto —"
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Disponibilità mese prossimo */}
        {aChiamataList.length > 0 && (
          <div className="section">
            <div className="section-head">
              <h2>Disponibilità {nextMonthLabelCap}</h2>
              <Link href="/disponibilita" className="muted" style={{ fontWeight: 600 }}>Gestisci →</Link>
            </div>
            <div className="section-body">
              {availAllSubmitted ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1F3326" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                  <span style={{ color: "#1F3326", fontWeight: 600, fontSize: 14 }}>Tutte inviate ({availSubmittedCount}/{aChiamataList.length})</span>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <span style={{ fontSize: 15, fontWeight: 700 }}>{availSubmittedCount}/{aChiamataList.length} inviate</span>
                    {isPastAvailDeadline ? (
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#9E3B2E" }}>Termine scaduto</span>
                    ) : isAvailUrgent ? (
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#9E3B2E" }}>Scade tra {daysUntilAvailDeadline}gg</span>
                    ) : (
                      <span className="muted" style={{ fontSize: 13 }}>Scadenza: 25 {now.toLocaleDateString("it-IT", { month: "long" })}</span>
                    )}
                  </div>
                  <div style={{ height: 10, borderRadius: 5, background: "#E8E0D0", overflow: "hidden", marginBottom: 12 }}>
                    <div style={{
                      height: "100%",
                      width: `${aChiamataList.length > 0 ? (availSubmittedCount / aChiamataList.length) * 100 : 0}%`,
                      background: isPastAvailDeadline ? "#9E3B2E" : isAvailUrgent ? "#C77B4A" : "#B68A3E",
                      borderRadius: 5,
                    }} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {availMissingStaff.slice(0, 6).map(s => (
                      <div key={s.id} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "8px 12px", borderRadius: 8,
                        background: isPastAvailDeadline ? "rgba(158,59,46,.06)" : "rgba(182,138,62,.06)",
                        border: `1px solid ${isPastAvailDeadline ? "rgba(158,59,46,.15)" : "rgba(182,138,62,.15)"}`,
                      }}>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</span>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 20,
                          background: isPastAvailDeadline ? "rgba(196,69,60,.12)" : "rgba(191,167,98,.12)",
                          color: isPastAvailDeadline ? "#C4453C" : "#BFA762",
                        }}>{isPastAvailDeadline ? "Non inviata" : "Da inviare"}</span>
                      </div>
                    ))}
                    {availMissingStaff.length > 6 && (
                      <span className="muted" style={{ fontSize: 12, textAlign: "center" }}>+{availMissingStaff.length - 6} altri</span>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Spese da pagare */}
        <div className="section">
          <div className="section-head">
            <h2>Spese da pagare</h2>
            <span className="muted">{toPay.length} in sospeso</span>
          </div>
          <div className="section-body">
            {unpaid.length === 0 ? (
              <p style={{ color: "var(--ok)", fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>Nessuna spesa in sospeso <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg></p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {unpaid.map(e => {
                  const isOverdue = !!(e.due_date && e.due_date < today);
                  return (
                    <div key={e.id} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "10px 14px", borderRadius: 10,
                      border: `1px solid ${isOverdue ? "var(--danger)" : "var(--line)"}`,
                      background: isOverdue ? "rgba(158,59,46,.04)" : "var(--surface)",
                    }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{e.supplier_name || "—"}</div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          Scad. {e.due_date ? fmtDate(e.due_date) : "—"}
                          {isOverdue && <span style={{ color: "var(--danger)", fontWeight: 700 }}> · SCADUTA</span>}
                        </div>
                      </div>
                      <div className="tabular" style={{ fontWeight: 700, fontSize: 15, color: isOverdue ? "var(--danger)" : "var(--ink)" }}>
                        {eur(Number(e.amount))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Assenze questa settimana */}
        <div className="section">
          <div className="section-head">
            <h2>Assenze questa settimana</h2>
          </div>
          <div className="section-body">
            {weekAbsences.length === 0 ? (
              <p className="muted">Nessuna assenza questa settimana.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {weekAbsences.map((a, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "10px 14px", borderRadius: 10, border: "1px solid var(--line)",
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{a.staffName}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {fmtDate(a.absent_date)}{a.end_date ? ` – ${fmtDate(a.end_date)}` : ""}
                      </div>
                    </div>
                    <span className="badge warn">{a.type}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Permessi questa settimana */}
        {weekLeaves.length > 0 && (
          <div className="section" style={{ borderLeft: "3px solid #7B61A6" }}>
            <div className="section-head">
              <h2>Permessi questa settimana</h2>
              <span style={{ background: "#7B61A6", color: "#fff", padding: "2px 10px", borderRadius: 10, fontSize: 12, fontWeight: 700 }}>{weekLeaves.length}</span>
            </div>
            <div className="section-body">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {weekLeaves.map(l => (
                  <div key={l.id} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(123,97,166,.2)",
                    background: "rgba(123,97,166,.04)",
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{l.staff_name}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {fmtDate(l.date)}
                        {l.period !== "giornata_intera" && ` (${l.period === "mattina" ? "mattina" : "pomeriggio"})`}
                      </div>
                    </div>
                    <span style={{
                      padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                      background: "rgba(123,97,166,.12)", color: "#7B61A6",
                    }}>
                      {l.type === "permesso" ? "Permesso" : l.type === "malattia" ? "Malattia" : l.type === "ferie" ? "Ferie" : "Altro"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Richieste permesso in attesa (admin) */}
        {pendingLeaves.length > 0 && (
          <div className="section" style={{ borderLeft: "3px solid #C77B4A" }}>
            <div className="section-head">
              <h2>Richieste permesso</h2>
              <span style={{ background: "#C77B4A", color: "#fff", padding: "2px 10px", borderRadius: 10, fontSize: 12, fontWeight: 700 }}>{pendingLeaves.length} in attesa</span>
            </div>
            <div className="section-body">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {pendingLeaves.map(l => (
                  <div key={l.id} style={{
                    display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                    padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(199,123,74,.2)",
                    background: "rgba(199,123,74,.04)",
                  }}>
                    <div style={{ flex: 1, minWidth: 120 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{l.staff_name}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {fmtDate(l.date)} — {l.type}
                        {l.reason && ` · ${l.reason}`}
                      </div>
                    </div>
                    <Link href="/turni" style={{ fontSize: 13, fontWeight: 700, color: "#C77B4A" }}>Gestisci →</Link>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Scadenze imminenti */}
        {docsExpiring.length > 0 && (
          <div className="section">
            <div className="section-head">
              <h2 style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B68A3E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                Scadenze imminenti
              </h2>
              <Link href="/documenti" className="muted" style={{ fontWeight: 600 }}>Documenti →</Link>
            </div>
            <div className="section-body">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {docsExpiring.slice(0, 6).map(d => {
                  const daysLeft = Math.round((new Date(d.expiry_date).getTime() - now.getTime()) / 86400000);
                  return (
                    <div key={d.id} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "10px 14px", borderRadius: 10,
                      border: `1px solid ${daysLeft <= 7 ? "rgba(158,59,46,.3)" : "var(--line)"}`,
                      background: daysLeft <= 7 ? "rgba(158,59,46,.04)" : "var(--surface)",
                    }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{d.title}</div>
                        <div className="muted" style={{ fontSize: 12 }}>{d.category}</div>
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: daysLeft <= 7 ? "var(--danger)" : "#B68A3E", whiteSpace: "nowrap" }}>
                        {daysLeft} {daysLeft === 1 ? "giorno" : "giorni"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Utenze mese */}
        <div className="section">
          <div className="section-head">
            <h2 style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F5C542" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
              Utenze mese
            </h2>
            <Link href="/utenze" className="muted" style={{ fontWeight: 600 }}>Dettagli →</Link>
          </div>
          <div className="section-body">
            {utenzeMonth.length === 0 ? (
              <p className="muted">Nessuna bolletta registrata questo mese.</p>
            ) : (
              <>
                <div style={{ fontSize: 24, fontWeight: 800, fontFamily: "'Bebas Neue', sans-serif", marginBottom: 12 }}>{eur(utenzeTotalMonth)}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {Object.entries(utenzeByType).sort((a, b) => b[1] - a[1]).map(([type, total]) => {
                    const colors: Record<string, string> = { luce: "#F5C542", gas: "#E07B3A", acqua: "#4A9BD9", immondizia: "#5C7363", internet: "#7A6A8C", telefono: "#6366f1", altro: "#6C6B5D" };
                    const label = type.charAt(0).toUpperCase() + type.slice(1);
                    return (
                      <div key={type} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ width: 10, height: 10, borderRadius: 3, background: colors[type] ?? "var(--ink-soft)", display: "inline-block" }} />
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
                        </div>
                        <span className="tabular" style={{ fontWeight: 700, fontSize: 14 }}>{eur(total)}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Inventario in arrivo */}
        {invDaysUntil !== null && invDaysUntil >= 0 && invDaysUntil <= 7 && (
          <div className="section">
            <div className="section-head">
              <h2 style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                Inventario in arrivo
              </h2>
              <Link href="/inventario" className="muted" style={{ fontWeight: 600 }}>Vai →</Link>
            </div>
            <div className="section-body">
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>
                      {invNextDate.split("-").reverse().join("/")}
                    </div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {invDaysUntil === 0 ? "Oggi" : invDaysUntil === 1 ? "Domani" : `Tra ${invDaysUntil} giorni`}
                    </div>
                  </div>
                  <span style={{
                    padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                    background: invDaysUntil <= 1 ? "rgba(158,59,46,.12)" : "rgba(191,167,98,.15)",
                    color: invDaysUntil <= 1 ? "#9E3B2E" : "#8C7A3B",
                  }}>
                    {invDaysUntil === 0 ? "OGGI" : invDaysUntil === 1 ? "DOMANI" : `${invDaysUntil}g`}
                  </span>
                </div>
                <div style={{
                  padding: "10px 14px", borderRadius: 10,
                  border: `1px solid ${invAfternoonStaff ? "rgba(45,90,61,.2)" : "rgba(158,59,46,.2)"}`,
                  background: invAfternoonStaff ? "rgba(45,90,61,.04)" : "rgba(158,59,46,.04)",
                }}>
                  <div className="muted" style={{ fontSize: 11, marginBottom: 2 }}>Turno pomeriggio</div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: invAfternoonStaff ? "var(--ok)" : "var(--danger)" }}>
                    {invAfternoonStaff ?? "Non assegnato"}
                  </div>
                  {!invAfternoonStaff && (
                    <Link href="/turni" style={{ fontSize: 12, color: "var(--accent)", fontWeight: 600, marginTop: 4, display: "inline-block" }}>
                      Assegna turno →
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Scorte basse */}
        {lowStock.length > 0 && (
          <div className="section">
            <div className="section-head">
              <h2 style={{ display: "flex", alignItems: "center", gap: 6 }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><path d="M12 9v4M12 17h.01" /></svg> Scorte basse</h2>
              <Link href="/inventario" className="muted" style={{ fontWeight: 600 }}>Magazzino →</Link>
            </div>
            <div className="section-body">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {lowStock.slice(0, 8).map(p => (
                  <div key={p.product_id} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 14px", borderRadius: 10,
                    border: "1px solid rgba(158,59,46,.2)", background: "rgba(158,59,46,.04)",
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        Giacenza: <strong style={{ color: "var(--danger)" }}>{p.current_stock} {p.unit}</strong> · Min: {p.min_stock}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Top 5 fornitori */}
        <div className="section">
          <div className="section-head">
            <h2>Top fornitori del mese</h2>
          </div>
          <div className="section-body">
            {topSuppliers.length === 0 ? (
              <p className="muted">Nessuna spesa nel mese corrente.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {topSuppliers.map((s, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{
                        width: 22, height: 22, borderRadius: 6, background: "var(--surface-2)",
                        display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700, color: "var(--ink-soft)",
                      }}>{i + 1}</span>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{s.name}</span>
                    </div>
                    <span className="tabular" style={{ fontWeight: 700 }}>{eur(s.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Riepilogo personale mese */}
        <DashboardStaffTable
          staffSummary={staffSummary}
          totalOnCallCost={totalOnCallCost}
          monthLabel={monthLabel}
        />
      </div>

      {/* ── Full-width sections ── */}
      <div className="section">
        <div className="section-head">
          <h2>Spese per categoria · {curY}</h2>
          <span className="muted">{eur(sumYear)}</span>
        </div>
        <div className="section-body">
          {bars.length === 0 ? (
            <p className="muted">Nessuna spesa registrata quest&apos;anno.</p>
          ) : (
            <div className="chart">
              {bars.map(b => (
                <div className="bar-row" key={b.name}>
                  <div className="cat"><span className="dot" style={{ background: b.color }} /><span className="hide-sm">{b.name}</span></div>
                  <div className="bar-track"><div className="bar-fill" style={{ width: `${(b.val / maxBar) * 100}%`, background: b.color }} /></div>
                  <div className="amt tabular">{eur(b.val)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h2>Ultime spese</h2>
          <Link href="/spese" className="muted" style={{ fontWeight: 600 }}>Vedi tutte →</Link>
        </div>
        <div className="section-body" style={{ padding: 0 }}>
          {recent.length === 0 ? (
            <div className="empty">
              <div className="serif">Ancora nessuna spesa</div>
              <div>Premi &quot;Nuova&quot; per registrare la prima.</div>
            </div>
          ) : (
            <table className="tbl">
              <thead>
                <tr><th>Data</th><th>Fornitore</th><th className="hide-sm">Categoria</th><th style={{ textAlign: "right" }}>Importo</th></tr>
              </thead>
              <tbody>
                {recent.map(e => (
                  <tr key={e.id}>
                    <td>{fmtDate(e.expense_date)}</td>
                    <td>
                      <strong>{e.supplier_name || "—"}</strong>
                      {e.payment_status === "da_pagare" && <span className="badge warn" style={{ marginLeft: 8 }}>da pagare</span>}
                    </td>
                    <td className="hide-sm"><span className="tag"><span className="dot" style={{ background: e.categories?.color ?? "#9C8E78" }} />{e.categories?.name ?? "Altro"}</span></td>
                    <td className="amt-cell tabular" style={{ textAlign: "right" }}>{eur(Number(e.amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
