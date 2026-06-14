"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { eur } from "@/lib/format";
import { logClientActivity } from "@/lib/activityLog";
import { useRole } from "@/lib/useRole";
import { generateSchedule, shiftHours, type Staff, type ShiftType, type CoverageReq, type Assignment, type Unavailability, type DateUnavailability, type CoverageException } from "@/lib/scheduler";
import {
  toStaff, toShiftType, toCoverage, weekDatesFrom, monthDatesFrom, fmtDayShort, WEEKDAYS, expandAbsences, expandLeaves,
  type StaffRow, type ShiftTypeRow, type CoverageRow, type CoverageExceptionRow, type ShiftRow, type AbsenceRow, type AvailabilityRow, type LeaveRow,
} from "@/lib/turni";
import LeaveModal from "@/components/LeaveModal";
import DatePickerIT from "@/components/ui/DatePickerIT";
import { generateTurniPdf, generateReportPdf, type TurniPdfData, type ReportPdfData } from "@/lib/pdf";

type Slot = { key: string; date: string; shift_type_id: string; staff_id: string | null };
type View = "month" | "week";

const HOURLY_RATE_ON_CALL = 8;
const isoWd = (d: string) => { const x = new Date(`${d}T00:00:00`).getDay(); return x === 0 ? 7 : x; };
const toMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

// Module-level helpers for leave blocking (no closure/TDZ issues)
const LEAVE_TYPE_LABEL: Record<string, string> = { permesso: "Permesso", ferie: "Ferie", malattia: "Malattia" };
function leaveLabel(t: string) { return LEAVE_TYPE_LABEL[t] ?? "Assenza"; }
function leaveBlocksShiftType(leavePeriod: string, shiftStartHour: number): boolean {
  if (leavePeriod === "giornata_intera") return true;
  if (leavePeriod === "mattina" && shiftStartHour < 14) return true;
  if (leavePeriod === "pomeriggio" && shiftStartHour >= 14) return true;
  return false;
}

export default function TurniPage() {
  const supabase = createClient();
  const { role, userId, loading: roleLoading } = useRole();
  const isStaff = role === "staff";
  const [view, setViewRaw] = useState<View>("month");
  const setView = (v: View) => setViewRaw(isStaff ? "month" : v);
  const [anchor, setAnchor] = useState(new Date());
  const [myStaffId, setMyStaffId] = useState<string | null>(null);

  const weekDates = useMemo(() => weekDatesFrom(anchor), [anchor]);
  const activeMonth = useMemo(() => {
    if (view === "month") return { year: anchor.getFullYear(), month: anchor.getMonth() + 1 };
    const thu = weekDates[3];
    return { year: parseInt(thu.slice(0, 4)), month: parseInt(thu.slice(5, 7)) };
  }, [view, anchor, weekDates]);
  const monthDates = useMemo(() => monthDatesFrom(activeMonth.year, activeMonth.month), [activeMonth.year, activeMonth.month]);

  const monthLabel = useMemo(() => {
    const d = new Date(activeMonth.year, activeMonth.month - 1, 1);
    const s = d.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }, [activeMonth.year, activeMonth.month]);

  const [staff, setStaff] = useState<Staff[]>([]);
  const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([]);
  const [stRows, setStRows] = useState<ShiftTypeRow[]>([]);
  const [coverage, setCoverage] = useState<CoverageReq[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [absenceRows, setAbsenceRows] = useState<AbsenceRow[]>([]);
  const [unavailable, setUnavailable] = useState<Unavailability[]>([]);
  const [weekUnavailable, setWeekUnavailable] = useState<{ staff_id: string; weekday: number; shift_type_id: string; date: string }[]>([]);
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [swapDate, setSwapDate] = useState("");
  const [swapShiftTypeId, setSwapShiftTypeId] = useState("");
  const [swapTargetId, setSwapTargetId] = useState("");
  const [swapNote, setSwapNote] = useState("");
  const [swapSending, setSwapSending] = useState(false);
  const [swapRequests, setSwapRequests] = useState<any[]>([]);
  const [leaveRows, setLeaveRows] = useState<LeaveRow[]>([]);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [pendingLeaves, setPendingLeaves] = useState<LeaveRow[]>([]);
  const [staffProfileMap, setStaffProfileMap] = useState<Map<string, string | null>>(new Map());
  const [coverageExceptions, setCoverageExceptions] = useState<CoverageException[]>([]);
  const [editingLeave, setEditingLeave] = useState<LeaveRow | null>(null);
  const [deletingLeave, setDeletingLeave] = useState<(LeaveRow & { displayName: string }) | null>(null);

  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  const monthDatesRef = useRef(monthDates);
  monthDatesRef.current = monthDates;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stById = useMemo(() => new Map(shiftTypes.map(s => [s.id, s])), [shiftTypes]);
  const staffById = useMemo(() => new Map(staff.map(s => [s.id, s])), [staff]);
  const stColorMap = useMemo(() => new Map(stRows.map(r => [r.id, r.color])), [stRows]);

  const today = new Date().toISOString().slice(0, 10);
  const firstOfCurrentMonth = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  }, []);
  const isAdmin = role === "admin" || role === "manager";

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 2000); }

  async function loadSwapRequests() {
    if (!userId) return;
    const { data } = await supabase.from("shift_swap_requests")
      .select("*, requester:profiles!shift_swap_requests_requester_id_fkey(full_name)")
      .eq("target_id", userId)
      .eq("status", "pending");
    setSwapRequests(data ?? []);
  }

  async function submitSwapRequest() {
    if (!swapDate || !swapTargetId || !myStaffId) return;
    // target_id must be a profiles.id, not staff.id — resolve via staffProfileMap
    const targetProfileId = staffProfileMap.get(swapTargetId);
    if (!targetProfileId) { showToast("Errore: profilo del collega non trovato"); return; }
    setSwapSending(true);
    const mySlot = slots.find(s => s.date === swapDate && s.staff_id === myStaffId);
    const shiftType = mySlot ? stById.get(mySlot.shift_type_id)?.name ?? "" : "";
    const { error } = await supabase.from("shift_swap_requests").insert({
      requester_id: userId,
      target_id: targetProfileId,
      request_date: swapDate,
      request_shift: shiftType,
      note: swapNote || null,
      status: "pending",
    });
    setSwapSending(false);
    if (error) { showToast("Errore: " + error.message); return; }
    showToast("Richiesta inviata");
    setShowSwapModal(false);
    setSwapDate(""); setSwapTargetId(""); setSwapNote("");
  }

  async function respondSwapRequest(id: string, accept: boolean) {
    const { error } = await supabase.from("shift_swap_requests")
      .update({ status: accept ? "approved" : "rejected", responded_at: new Date().toISOString() })
      .eq("id", id);
    if (error) { showToast("Errore: " + error.message); return; }
    showToast(accept ? "Richiesta accettata" : "Richiesta rifiutata");
    setSwapRequests(prev => prev.filter(r => r.id !== id));
  }

  function buildEmptySlots(dates: string[], cov: CoverageReq[], types: ShiftType[], exceptions: CoverageException[] = []): Slot[] {
    const typeMap = new Map(types.map(t => [t.id, t]));
    const excMap = new Map(exceptions.map(e => [`${e.date}|${e.shift_type_id}`, e.count]));
    const out: Slot[] = [];
    for (const date of dates) {
      const wd = isoWd(date);
      const baseReqs = cov.filter(c => c.weekday === wd && c.count > 0);
      // Apply exceptions: override count per date+shift_type_id
      const reqs = baseReqs.map(r => {
        const excCount = excMap.get(`${date}|${r.shift_type_id}`);
        return excCount !== undefined ? { ...r, count: excCount } : r;
      }).filter(r => r.count > 0);
      // Add exceptions for shift types not in base coverage
      for (const e of exceptions) {
        if (e.date !== date || e.count <= 0) continue;
        if (!baseReqs.some(r => r.shift_type_id === e.shift_type_id)) {
          reqs.push({ weekday: wd, shift_type_id: e.shift_type_id, count: e.count });
        }
      }
      reqs.sort((a, b) => (typeMap.get(a.shift_type_id)?.start ?? "").localeCompare(typeMap.get(b.shift_type_id)?.start ?? ""));
      for (const r of reqs) for (let i = 0; i < r.count; i++)
        out.push({ key: `${date}|${r.shift_type_id}|${i}`, date, shift_type_id: r.shift_type_id, staff_id: null });
    }
    return out;
  }

  function fill(base: Slot[], assignments: Assignment[]): Slot[] {
    const next = base.map(s => ({ ...s, staff_id: null as string | null }));
    for (const a of assignments) {
      if (!a.staff_id) continue;
      const slot = next.find(s => s.date === a.date && s.shift_type_id === a.shift_type_id && s.staff_id === null);
      if (slot) slot.staff_id = a.staff_id;
    }
    return next;
  }

  async function loadAll() {
    setLoading(true);
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const [{ data: st }, { data: ty }, { data: cov }, { data: sh }, { data: abs }, { data: avail }, { data: weekAvail }, { data: leavesData }, { data: pendingLeavesData }, { data: excData }] = await Promise.all([
      supabase.from("staff").select("*").eq("active", true).order("name"),
      supabase.from("shift_types").select("*").order("sort"),
      supabase.from("coverage_template").select("*"),
      supabase.from("shifts").select("*").gte("shift_date", monthDates[0]).lte("shift_date", monthDates[monthDates.length - 1]),
      supabase.from("absences").select("*"),
      supabase.from("staff_availability").select("*").eq("available", false),
      // Week-specific availability (from staff submissions)
      supabase.from("staff_week_availability").select("staff_id, avail_date, shift_type_id, available, status")
        .gte("avail_date", monthDates[0]).lte("avail_date", monthDates[monthDates.length - 1]),
      // Approved leaves for this month
      supabase.from("staff_leaves").select("*").eq("status", "approvato")
        .gte("date", monthDates[0]).lte("date", monthDates[monthDates.length - 1]),
      // Pending leave requests
      supabase.from("staff_leaves").select("*").eq("status", "in_attesa"),
      // Coverage exceptions for this month
      supabase.from("coverage_exceptions").select("*")
        .gte("exception_date", monthDates[0]).lte("exception_date", monthDates[monthDates.length - 1]),
    ]);
    const rawTypes = (ty ?? []) as ShiftTypeRow[];
    const staffRaw = (st ?? []) as StaffRow[];

    // Build staff.id → profile_id map; fall back to name matching if profile_id is null
    const needsNameMatch = staffRaw.some(s => !s.profile_id);
    let profileMap = new Map(staffRaw.map(s => [s.id, s.profile_id]));
    if (needsNameMatch) {
      const { data: profiles } = await supabase.from("profiles").select("id, full_name");
      if (profiles) {
        const norm = (s: string) => s.trim().toLowerCase();
        const byFirstName = new Map(profiles.map(p => [norm(p.full_name?.split(" ")[0] ?? ""), p.id]));
        profileMap = new Map(staffRaw.map(s => [s.id, s.profile_id || byFirstName.get(norm(s.name)) || null]));
      }
    }
    setStaffProfileMap(profileMap);
    const staffArr = staffRaw.map(toStaff);
    const typeArr = rawTypes.map(toShiftType);
    const covArr = ((cov ?? []) as CoverageRow[]).map(toCoverage);
    const absRows = (abs ?? []) as AbsenceRow[];
    const unavailRows = (avail ?? []) as AvailabilityRow[];

    // Merge generic weekly unavailability with week-specific unavailability
    const baseUnavail = unavailRows.map(r => ({ staff_id: r.staff_id, weekday: r.weekday, shift_type_id: r.shift_type_id }));

    // Week-specific: filter for unavailable status, convert to scheduler format
    const weekSpecific = ((weekAvail ?? []) as { staff_id: string; avail_date: string; shift_type_id: string; available: boolean; status?: string }[])
      .filter(r => (r.status ?? (r.available ? "available" : "unavailable")) === "unavailable")
      .map(r => ({ staff_id: r.staff_id, weekday: isoWd(r.avail_date), shift_type_id: r.shift_type_id, date: r.avail_date }));

    setStaff(staffArr);
    setShiftTypes(typeArr);
    setStRows(rawTypes);
    setCoverage(covArr);
    setAbsenceRows(absRows);
    setUnavailable(baseUnavail);
    setWeekUnavailable(weekSpecific);
    setLeaveRows((leavesData ?? []) as LeaveRow[]);
    setPendingLeaves((pendingLeavesData ?? []) as LeaveRow[]);
    const excArr: CoverageException[] = ((excData ?? []) as CoverageExceptionRow[]).map(e => ({
      date: e.exception_date, shift_type_id: e.shift_type_id, count: e.required_count,
    }));
    setCoverageExceptions(excArr);

    const base = buildEmptySlots(monthDates, covArr, typeArr, excArr);
    const shifts = (sh ?? []) as ShiftRow[];
    if (shifts.length > 0) {
      const asg: Assignment[] = shifts.map(s => ({ date: s.shift_date, shift_type_id: s.shift_type_id, staff_id: s.staff_id }));
      setSlots(fill(base, asg));
      setSaved(true);
    } else {
      setSlots(base);
    }
    setWarnings([]);
    setLoading(false);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadAll(); }, [monthDates.join(",")]);

  /* ── Resolve logged-in user → staff record (for staff highlight) ── */
  useEffect(() => {
    if (!userId || !isStaff || staff.length === 0) return;
    (async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", userId)
        .single();
      if (!profile?.full_name) return;
      const normalise = (s: string) => s.trim().toLowerCase();
      const match = staff.find(s => normalise(s.name) === normalise(profile.full_name!));
      if (match) {
        setMyStaffId(match.id);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, isStaff, staff.length]);

  // Load swap requests when userId is available
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadSwapRequests(); }, [userId]);

  function prevMonth() { setAnchor(new Date(activeMonth.year, activeMonth.month - 2, 15)); }
  function nextMonth() { setAnchor(new Date(activeMonth.year, activeMonth.month, 15)); }
  function prevWeek() { setAnchor(new Date(anchor.getTime() - 7 * 864e5)); }
  function nextWeek() { setAnchor(new Date(anchor.getTime() + 7 * 864e5)); }
  function goToday() { setAnchor(new Date()); }

  function genera() {
    const allAbsences = expandAbsences(absenceRows, monthDates[0], monthDates[monthDates.length - 1]);
    // Add approved leaves as full-day absences for scheduler
    // Reverse map: profiles.id → staff.id (leaves store profiles.id)
    const profileToStaff = new Map<string, string>();
    for (const [sId, pId] of staffProfileMap) { if (pId) profileToStaff.set(pId, sId); }
    const leaveAbsences = expandLeaves(leaveRows, monthDates[0], monthDates[monthDates.length - 1])
      .filter(l => l.period === "giornata_intera")
      .map(l => ({ staff_id: profileToStaff.get(l.staff_id) ?? l.staff_id, date: l.date }));
    const combinedAbsences = [...allAbsences, ...leaveAbsences];
    // Convert week-specific unavailability to DateUnavailability format
    const dateUnavail: DateUnavailability[] = weekUnavailable.map(u => ({ staff_id: u.staff_id, date: u.date, shift_type_id: u.shift_type_id }));
    const res = generateSchedule(monthDates, staff, shiftTypes, coverage, combinedAbsences, unavailable, dateUnavail, coverageExceptions);
    setSlots(fill(buildEmptySlots(monthDates, coverage, shiftTypes, coverageExceptions), res.assignments));
    setWarnings(res.warnings);
    setSaved(false);
  }

  /* ── Auto-save ── */
  async function doSave() {
    setSaving(true);
    const dates = monthDatesRef.current;
    const current = slotsRef.current;

    // Backend validation: check no assigned staff has a leave
    const conflicts = current.filter(s => s.staff_id && getBlockingLeave(s.date, s.staff_id, s.shift_type_id));
    if (conflicts.length > 0) {
      const names = [...new Set(conflicts.map(s => staffById.get(s.staff_id!)?.name ?? "?"))];
      showToast(`Errore: ${names.join(", ")} ha permessi nei giorni assegnati`);
      setSaving(false);
      return;
    }

    await supabase.from("shifts").delete().gte("shift_date", dates[0]).lte("shift_date", dates[dates.length - 1]);
    const rows = current.filter(s => s.staff_id).map(s => ({
      shift_date: s.date, shift_type_id: s.shift_type_id, staff_id: s.staff_id, status: "draft",
    }));
    if (rows.length) {
      const { error } = await supabase.from("shifts").insert(rows);
      if (error) { showToast("Errore salvataggio"); setSaving(false); return; }
    }
    logClientActivity("update", "turni", `Turni salvati per ${dates[0]} → ${dates[dates.length - 1]}`, { shifts: rows.length });
    setSaved(true);
    setSaving(false);
    showToast("Salvato");
  }

  function setSlotValue(key: string, staff_id: string | null) {
    // Block assignment if staff has a leave on this date/shift
    if (staff_id) {
      const slot = slotsRef.current.find(s => s.key === key);
      if (slot) {
        const leave = getBlockingLeave(slot.date, staff_id, slot.shift_type_id);
        if (leave) {
          const name = staffById.get(staff_id)?.name ?? "?";
          showToast(`${name} ha un ${leaveLabel(leave.type).toLowerCase()} per questa data`);
          return;
        }
      }
    }
    setSlots(prev => prev.map(s => s.key === key ? { ...s, staff_id } : s));
    slotsRef.current = slotsRef.current.map(s => s.key === key ? { ...s, staff_id } : s);
    setFlashKey(key);
    setTimeout(() => setFlashKey(null), 600);
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(doSave, 1000);
  }

  async function salvaManuale() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await doSave();
  }

  /* ── Computed values ── */
  const currentWeekDates = useMemo(() => weekDatesFrom(new Date()), []);
  const summaryWeekDates = view === "week" ? weekDates : currentWeekDates;

  const { monthHoursMap, weekHoursMap } = useMemo(() => {
    const mh: Record<string, number> = {};
    const wh: Record<string, number> = {};
    const weekSet = new Set(summaryWeekDates);
    for (const s of slots) {
      if (!s.staff_id) continue;
      const t = stById.get(s.shift_type_id);
      if (!t) continue;
      const h = shiftHours(t);
      mh[s.staff_id] = (mh[s.staff_id] ?? 0) + h;
      if (weekSet.has(s.date)) wh[s.staff_id] = (wh[s.staff_id] ?? 0) + h;
    }
    return { monthHoursMap: mh, weekHoursMap: wh };
  }, [slots, stById, summaryWeekDates]);

  const { totalWeekCost, totalMonthCost } = useMemo(() => {
    let twc = 0, tmc = 0;
    for (const p of staff) {
      if (p.type !== "a_chiamata") continue;
      twc += (weekHoursMap[p.id] ?? 0) * HOURLY_RATE_ON_CALL;
      tmc += (monthHoursMap[p.id] ?? 0) * HOURLY_RATE_ON_CALL;
    }
    return { totalWeekCost: twc, totalMonthCost: tmc };
  }, [staff, weekHoursMap, monthHoursMap]);

  const gaps = slots.filter(s => !s.staff_id).length;
  const totalPlannedHours = useMemo(() => Object.values(monthHoursMap).reduce((s, h) => s + h, 0), [monthHoursMap]);

  const byDateAndType = useMemo(() => {
    const m: Record<string, Record<string, Slot[]>> = {};
    for (const s of slots) {
      if (!m[s.date]) m[s.date] = {};
      if (!m[s.date][s.shift_type_id]) m[s.date][s.shift_type_id] = [];
      m[s.date][s.shift_type_id].push(s);
    }
    return m;
  }, [slots]);

  const byDate = useMemo(() => {
    const m: Record<string, Slot[]> = {};
    for (const s of slots) {
      if (!weekDates.includes(s.date)) continue;
      (m[s.date] ||= []).push(s);
    }
    return m;
  }, [slots, weekDates]);

  const monthAbsences = useMemo(() => {
    const fromAbsences = absenceRows.filter(r => {
      const end = r.end_date || r.absent_date;
      return r.absent_date <= monthDates[monthDates.length - 1] && end >= monthDates[0];
    });
    // Merge approved leaves into absences display
    // leaveRows.staff_id is profiles.id — reverse map to staff.id for name lookup
    const profileToStaff = new Map<string, string>();
    for (const [sId, pId] of staffProfileMap) { if (pId) profileToStaff.set(pId, sId); }
    const fromLeaves: AbsenceRow[] = leaveRows.map(l => ({
      id: l.id,
      staff_id: profileToStaff.get(l.staff_id) ?? l.staff_id,
      absent_date: l.date,
      end_date: null,
      type: l.type === "altro" ? "permesso" : l.type,
      notes: [l.period !== "giornata_intera" ? (l.period === "mattina" ? "Solo mattina" : "Solo pomeriggio") : null, l.reason].filter(Boolean).join(" · ") || null,
    }));
    return [...fromAbsences, ...fromLeaves];
  }, [absenceRows, leaveRows, staffProfileMap, monthDates]);

  // Reverse map: profiles.id → staff.id
  const profileToStaffId = useMemo(() => {
    const m = new Map<string, string>();
    for (const [staffId, profileId] of staffProfileMap) {
      if (profileId) m.set(profileId, staffId);
    }
    return m;
  }, [staffProfileMap]);

  // Leave lookup by staff table id: `${date}|${staffTableId}` → LeaveRow
  const leaveByDateStaffTableId = useMemo(() => {
    const m = new Map<string, LeaveRow>();
    for (const l of leaveRows) {
      const sid = profileToStaffId.get(l.staff_id) ?? l.staff_id;
      m.set(`${l.date}|${sid}`, l);
    }
    return m;
  }, [leaveRows, profileToStaffId]);

  // Helper: get blocking leave for a date + staff.id + shift_type_id
  // Uses leaveByDateStaffTableId (declared above) and stById (declared earlier)
  const getBlockingLeave = (date: string, staffId: string, shiftTypeId: string): LeaveRow | null => {
    const leave = leaveByDateStaffTableId.get(`${date}|${staffId}`);
    if (!leave) return null;
    const st = stById.get(shiftTypeId);
    const startHour = st ? parseInt(st.start.split(":")[0]) : 0;
    return leaveBlocksShiftType(leave.period, startHour) ? leave : null;
  };

  /* ── Constraint warnings ── */
  const constraintWarnings = useMemo(() => {
    const warns: string[] = [];

    // Leave conflicts: staff assigned to a shift but has a leave that day
    for (const s of slots) {
      if (!s.staff_id) continue;
      const leave = getBlockingLeave(s.date, s.staff_id, s.shift_type_id);
      if (leave) {
        const name = staffById.get(s.staff_id)?.name ?? "?";
        const stName = stById.get(s.shift_type_id)?.name ?? "?";
        warns.push(`${name} ha un ${leaveLabel(leave.type).toLowerCase()} il ${fmtDayShort(s.date)} ma e assegnato al turno ${stName} — sostituire`);
      }
    }

    for (const p of staff) {
      // 6+ consecutive working days (D.Lgs 66/2003)
      let consecutive = 0;
      let maxRun = 0;
      for (const date of monthDates) {
        if (slots.some(s => s.date === date && s.staff_id === p.id)) {
          consecutive++;
          if (consecutive > maxRun) maxRun = consecutive;
        } else {
          consecutive = 0;
        }
      }
      if (maxRun > 6) {
        warns.push(`${p.name}: ${maxRun} giorni consecutivi senza riposo (max 6, D.Lgs 66/2003)`);
      }

      // Insufficient rest between shifts (< 11h)
      for (let i = 0; i < monthDates.length - 1; i++) {
        const d1 = monthDates[i], d2 = monthDates[i + 1];
        const s1 = slots.filter(s => s.date === d1 && s.staff_id === p.id);
        const s2 = slots.filter(s => s.date === d2 && s.staff_id === p.id);
        for (const a of s1) {
          const tA = stById.get(a.shift_type_id);
          if (!tA) continue;
          for (const b of s2) {
            const tB = stById.get(b.shift_type_id);
            if (!tB) continue;
            const endMin = toMin(tA.end);
            const startMin = toMin(tA.start);
            const isOvernight = endMin <= startMin;
            const nextStartMin = toMin(tB.start);
            const rest = isOvernight
              ? (nextStartMin - endMin)
              : (24 * 60 - endMin + nextStartMin);
            if (rest >= 0 && rest < 11 * 60) {
              warns.push(`${p.name}: riposo insufficiente (<11h) tra ${fmtDayShort(d1)} (${tA.name}) e ${fmtDayShort(d2)} (${tB.name})`);
            }
          }
        }
      }
    }
    return warns;
  }, [slots, staff, monthDates, stById, leaveByDateStaffTableId, staffById]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Monthly coverage breakdown ── */
  const monthlyCoverage = useMemo(() => {
    return staff.map(p => {
      const byType: Record<string, number> = {};
      const workedDates = new Set<string>();
      for (const s of slots) {
        if (s.staff_id !== p.id) continue;
        byType[s.shift_type_id] = (byType[s.shift_type_id] ?? 0) + 1;
        workedDates.add(s.date);
      }
      const workDays = workedDates.size;
      const restDays = monthDates.length - workDays;
      const totalHours = monthHoursMap[p.id] ?? 0;
      const monthWeeks = monthDates.length / 7;
      const maxHours = p.hours_per_week > 0 ? p.hours_per_week * monthWeeks : 0;
      const overHours = maxHours > 0 && totalHours > maxHours;
      // D.Lgs 66/2003: at least 1 rest per 6 working days → minimum rest days = floor(workDays / 6)
      const minRestNeeded = Math.floor(workDays / 6);
      const lowRest = restDays < minRestNeeded;
      return { staffId: p.id, staffName: p.name, staffType: p.type as string, byType, totalHours, workDays, restDays, overHours, lowRest };
    });
  }, [slots, staff, monthDates, monthHoursMap]);

  /* ── Daily coverage (needed vs assigned) ── */
  const dailyCoverageGaps = useMemo(() => {
    const excMap = new Map(coverageExceptions.map(e => [`${e.date}|${e.shift_type_id}`, e.count]));
    const gapDays: { date: string; needed: number; assigned: number }[] = [];
    for (const date of monthDates) {
      const wd = isoWd(date);
      const needed = coverage.filter(c => c.weekday === wd).reduce((s, c) => {
        const exc = excMap.get(`${date}|${c.shift_type_id}`);
        return s + (exc !== undefined ? exc : c.count);
      }, 0);
      const assigned = slots.filter(s => s.date === date && s.staff_id).length;
      if (assigned < needed) gapDays.push({ date, needed, assigned });
    }
    return gapDays;
  }, [monthDates, coverage, coverageExceptions, slots]);

  // Leave lookup: date|staff_id -> LeaveRow (original, profiles.id based)
  const leaveByDateStaff = useMemo(() => {
    const m = new Map<string, LeaveRow>();
    for (const l of leaveRows) m.set(`${l.date}|${l.staff_id}`, l);
    return m;
  }, [leaveRows]);

  // Leaves by date for grid visualization
  const leavesByDate = useMemo(() => {
    const m: Record<string, LeaveRow[]> = {};
    for (const l of leaveRows) (m[l.date] ||= []).push(l);
    return m;
  }, [leaveRows]);

  // Leave counts per staff for coverage table
  const leaveCountByStaff = useMemo(() => {
    const m: Record<string, number> = {};
    for (const l of leaveRows) m[l.staff_id] = (m[l.staff_id] ?? 0) + 1;
    return m;
  }, [leaveRows]);

  // Dates that have coverage exceptions (for visual indicator)
  const exceptionDates = useMemo(() => new Set(coverageExceptions.map(e => e.date)), [coverageExceptions]);

  const weekLabel = `${fmtDayShort(weekDates[0])}–${fmtDayShort(weekDates[6])}`;

  const allWarnings = [...warnings, ...constraintWarnings];

  // Approve / reject leave
  async function approveLeave(id: string) {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("staff_leaves").update({ status: "approvato", approved_by: user?.id ?? null }).eq("id", id);
    showToast("Permesso approvato");
    loadAll();
  }
  async function rejectLeave(id: string) {
    await supabase.from("staff_leaves").update({ status: "rifiutato" }).eq("id", id);
    showToast("Permesso rifiutato");
    loadAll();
  }

  async function deleteLeave(id: string) {
    const { error } = await supabase.from("staff_leaves").delete().eq("id", id);
    if (error) { showToast("Errore: " + error.message); return; }
    showToast("Permesso eliminato");
    setDeletingLeave(null);
    loadAll();
  }

  async function updateLeave(id: string, updates: { type: string; date: string; period: string; reason: string | null }) {
    const { error } = await supabase.from("staff_leaves").update(updates).eq("id", id);
    if (error) { showToast("Errore: " + error.message); return; }
    showToast("Permesso modificato");
    setEditingLeave(null);
    loadAll();
  }

  const MONTHS_IT = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

  function downloadTurniPdf() {
    const pdfData: TurniPdfData = {
      year: activeMonth.year, month: activeMonth.month,
      monthName: MONTHS_IT[activeMonth.month - 1],
      dates: monthDates,
      staff: staff.map(s => ({ id: s.id, name: s.name, type: s.type })),
      shiftTypes: stRows.map(t => ({ id: t.id, name: t.name, startTime: t.start_time, endTime: t.end_time, color: t.color })),
      shifts: slots.filter(s => s.staff_id).map(s => ({ staffId: s.staff_id!, date: s.date, shiftTypeId: s.shift_type_id })),
    };
    const doc = generateTurniPdf(pdfData);
    doc.save(`Turni_${MONTHS_IT[activeMonth.month - 1]}_${activeMonth.year}.pdf`);
  }

  function downloadReportPdf() {
    const data: ReportPdfData = {
      monthLabel: monthLabel, weekLabel,
      riepilogoRows: staff.map(p => {
        const mh = monthHoursMap[p.id] ?? 0;
        const wh = weekHoursMap[p.id] ?? 0;
        const isOnCall = p.type === "a_chiamata";
        return {
          name: p.name, type: isOnCall ? "A chiamata" : "Dipendente",
          weekHours: wh, monthHours: mh, contract: p.hours_per_week > 0 ? `${p.hours_per_week}h/sett` : "—",
          weekCost: isOnCall ? eur(wh * HOURLY_RATE_ON_CALL) : "—",
          monthCost: isOnCall ? eur(mh * HOURLY_RATE_ON_CALL) : "—",
        };
      }),
      totalWeekCost: eur(totalWeekCost), totalMonthCost: eur(totalMonthCost),
      shiftTypeNames: shiftTypes.map(st => st.name),
      coperturaRows: monthlyCoverage.map(row => ({
        name: row.staffName, byType: shiftTypes.map(st => row.byType[st.id] ?? 0),
        hours: row.totalHours, workDays: row.workDays, restDays: row.restDays,
        leaves: leaveCountByStaff[row.staffId] ?? 0,
        status: row.overHours ? "Ore eccessive" : row.lowRest ? "Pochi riposi" : "OK",
      })),
    };
    const doc = generateReportPdf(data);
    doc.save(`Report_${MONTHS_IT[activeMonth.month - 1]}_${activeMonth.year}.pdf`);
  }

  return (
    <>
      {/* ── KPI Cards ── */}
      {!isStaff && (
      <div className="cards cards-4" style={{ marginBottom: 20 }}>
        <div className="card" style={{ borderLeft: gaps > 0 ? "3px solid #9E3B2E" : "3px solid #2D5A3D" }}>
          <div className="label">Turni scoperti</div>
          <div className="value tabular" style={{ color: gaps > 0 ? "#9E3B2E" : "#2D5A3D" }}>{gaps}</div>
          <div className="meta">{gaps > 0 ? "Da coprire" : "Tutti coperti"}</div>
        </div>
        <div className="card">
          <div className="label">Ore pianificate</div>
          <div className="value tabular">{Math.round(totalPlannedHours)}h</div>
          <div className="meta">{monthLabel}</div>
        </div>
        <div className="card">
          <div className="label">Dipendenti attivi</div>
          <div className="value tabular">{staff.length}</div>
        </div>
        <div className="card accent">
          <div className="label">Costo stimato</div>
          <div className="value tabular">{eur(totalMonthCost)}</div>
          <div className="meta">personale a chiamata</div>
        </div>
      </div>
      )}

      {/* ── Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 16 }}>
        <h1 className="serif" style={{ fontSize: 24, fontWeight: 500 }}>{isStaff ? `I miei turni · ${monthLabel}` : `Turni · ${monthLabel}`}</h1>
        {!isStaff && (
        <div className="view-toggle">
          <button className={view === "month" ? "active" : ""} onClick={() => setView("month")}>Mese</button>
          <button className={view === "week" ? "active" : ""} onClick={() => setView("week")}>Settimana</button>
        </div>
        )}
      </div>

      {/* ── Controls ── */}
      <div className="section" style={{ marginBottom: 20 }}>
        <div className="section-body turni-controls-bar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div className="turni-nav" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {view === "month" ? (
              <>
                <button className="btn-ghost" style={{ padding: "8px 14px", borderRadius: 9, fontSize: 14 }} onClick={prevMonth}>←</button>
                <span className="serif" style={{ fontWeight: 500, fontSize: 16, minWidth: 180, textAlign: "center" }}>{monthLabel}</span>
                <button className="btn-ghost" style={{ padding: "8px 14px", borderRadius: 9, fontSize: 14 }} onClick={nextMonth}>→</button>
                <button className="btn-ghost" style={{ padding: "8px 12px", borderRadius: 9, fontSize: 13 }} onClick={goToday}>Oggi</button>
              </>
            ) : (
              <>
                <button className="btn-ghost" style={{ padding: "8px 14px", borderRadius: 9 }} onClick={prevWeek}>←</button>
                <span className="serif" style={{ fontWeight: 500, fontSize: 15, minWidth: 120, textAlign: "center" }}>{weekLabel}</span>
                <button className="btn-ghost" style={{ padding: "8px 14px", borderRadius: 9 }} onClick={nextWeek}>→</button>
                <button className="btn-ghost" style={{ padding: "8px 12px", borderRadius: 9, fontSize: 13 }} onClick={goToday}>Oggi</button>
              </>
            )}
          </div>
          {!isStaff && (
            <div className="turni-actions">
              <div className="turni-primary-actions">
                <button className="btn btn-primary" style={{ padding: "10px 18px" }} onClick={genera} disabled={loading || staff.length === 0}>Genera bozza</button>
                <button className="btn" style={{ padding: "10px 18px", background: "#7B61A6", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }} onClick={() => setShowLeaveModal(true)}>Dai permesso</button>
              </div>
              <div className="turni-secondary-actions">
                <button className="btn btn-ghost" style={{ padding: "10px 18px" }} onClick={salvaManuale} disabled={loading || saving}>
                  {saving ? "Salvataggio..." : saved ? (
                    <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline", verticalAlign: "-2px", marginRight: 4 }}><path d="M20 6L9 17l-5-5" /></svg>Salvato</>
                  ) : "Salva turni"}
                </button>
                <button className="turni-pdf-btn" onClick={downloadTurniPdf}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1F3326" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="M9 15l3 3 3-3"/></svg>
                  PDF Turni
                </button>
                <button className="turni-pdf-btn" onClick={downloadReportPdf}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1F3326" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="M9 15l3 3 3-3"/></svg>
                  PDF Report
                </button>
                <Link href="/turni/copertura" className="muted" style={{ fontWeight: 600, fontSize: 13 }}>Copertura →</Link>
              </div>
            </div>
          )}
        </div>
        {isAdmin && activeMonth.year === new Date().getFullYear() && activeMonth.month === new Date().getMonth() + 1 && (
          <div style={{ fontSize: 12, color: "var(--ink-soft)", fontStyle: "italic", marginTop: 4 }}>
            Puoi modificare i turni di tutto il mese corrente, inclusi i giorni passati
          </div>
        )}
      </div>

      {/* ── Legend ── */}
      {stRows.length > 0 && (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 20, padding: "12px 18px", background: "var(--surface-2)", borderRadius: 10 }}>
          {stRows.map(st => (
            <div key={st.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <span style={{ width: 12, height: 12, borderRadius: 4, background: st.color, flexShrink: 0 }} />
              <span style={{ fontWeight: 700 }}>{st.name.charAt(0).toUpperCase()}</span>
              <span className="muted">{st.name} ({st.start_time.slice(0, 5)}–{st.end_time.slice(0, 5)})</span>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <span style={{ width: 12, height: 12, borderRadius: 4, background: "#E8E0D0", flexShrink: 0 }} />
            <span style={{ fontWeight: 700 }}>R</span>
            <span className="muted">Riposo</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <span style={{ width: 12, height: 12, borderRadius: 4, background: "#4F7B8C", flexShrink: 0 }} />
            <span style={{ fontWeight: 700 }}>F</span>
            <span className="muted">Ferie</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <span style={{ width: 12, height: 12, borderRadius: 4, background: "#7B61A6", flexShrink: 0 }} />
            <span style={{ fontWeight: 700 }}>P</span>
            <span className="muted">Permesso</span>
          </div>
        </div>
      )}

      {/* ── Alerts ── */}
      {staff.length === 0 && (
        <div className="section" style={{ marginBottom: 20 }}>
          <div className="section-body" style={{ textAlign: "center", padding: "24px 20px" }}>
            <p style={{ fontSize: 14, color: "var(--ink-soft)" }}>
              Aggiungi prima il personale nella sezione <Link href="/personale" style={{ fontWeight: 700, color: "var(--ink)" }}>&quot;Personale&quot;</Link>.
            </p>
          </div>
        </div>
      )}

      {!isStaff && allWarnings.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
          {allWarnings.map((w, i) => (
            <div key={i} style={{
              padding: "10px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600,
              background: "#F6E3D3", color: "var(--warn)", border: "1px solid rgba(158,59,46,.15)",
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline", verticalAlign: "-2px", marginRight: 4 }}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><path d="M12 9v4M12 17h.01" /></svg>
              {w}
            </div>
          ))}
        </div>
      )}

      {/* ── Grid ── */}
      {(loading || roleLoading) ? (
        <div className="section"><div className="empty">Caricamento...</div></div>
      ) : view === "month" ? (
        <div className="section">
          <div className="section-head">
            <h2>Pianificazione mensile</h2>
            <span className="muted">{gaps > 0 ? `${gaps} turni scoperti` : <><span>Tutti coperti </span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline", verticalAlign: "-2px" }}><path d="M20 6L9 17l-5-5" /></svg></>}</span>
          </div>
          <div className="section-body" style={{ padding: isMobile ? 12 : 0, overflowX: isMobile ? undefined : "auto" }}>
            {isMobile ? (
              /* ── Mobile list view ── */
              <div className="turni-mobile-list">
                {monthDates.map(date => {
                  const wd = isoWd(date);
                  const dayName = WEEKDAYS[wd - 1];
                  const isPast = date < today;
                  const isLocked = date < firstOfCurrentMonth; // previous month — locked for everyone
                  const isReadOnly = isLocked || (isPast && !isAdmin);
                  const isToday = date === today;
                  const daySlots = shiftTypes.flatMap(st => (byDateAndType[date]?.[st.id] ?? []).map(s => ({ ...s, stName: st.name, stColor: stColorMap.get(st.id) })));
                  if (daySlots.length === 0 && isPast) return null;
                  return (
                    <div key={date} className={`turni-mobile-day${isToday ? " today" : ""}`} style={{
                      opacity: isLocked ? 0.4 : (isPast && !isAdmin) ? 0.5 : 1,
                      background: isLocked ? "#E8E6E1" : undefined,
                    }}>
                      <div className="turni-mobile-day-header">
                        <span>{dayName} {fmtDayShort(date)}</span>
                        {exceptionDates.has(date) && <span title="Copertura modificata" style={{ width: 7, height: 7, borderRadius: 4, background: "#BFA762", display: "inline-block" }} />}
                        {isToday && <span className="day-badge">OGGI</span>}
                      </div>
                      {/* Leave badges */}
                      {(leavesByDate[date] ?? []).length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6, padding: "0 2px" }}>
                          {(leavesByDate[date] ?? []).map(l => (
                            <span key={l.id} style={{
                              fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 12,
                              background: "rgba(123,97,166,.12)", color: "#7B61A6",
                            }}>
                              P {l.staff_name}{l.period !== "giornata_intera" ? ` (${l.period === "mattina" ? "AM" : "PM"})` : ""}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="turni-mobile-slots">
                        {daySlots.length === 0 ? (
                          <div className="muted" style={{ fontSize: 12, padding: "4px 0" }}>Nessun turno</div>
                        ) : daySlots.map(s => (
                          <div key={s.key} className="turni-mobile-slot">
                            <span className="slot-dot" style={{ background: s.stColor || "var(--accent)" }} />
                            <span className="slot-name">{s.stName}</span>
                            {(isReadOnly || isStaff) ? (
                              s.staff_id ? (
                                <span className="slot-staff" style={isStaff && myStaffId === s.staff_id ? { fontWeight: 700, color: "#2D5A3D" } : undefined}>
                                  {staffById.get(s.staff_id)?.name ?? "?"}
                                </span>
                              ) : <span className="slot-empty">scoperto</span>
                            ) : (
                              <select value={s.staff_id ?? ""}
                                onChange={e => setSlotValue(s.key, e.target.value || null)}
                                style={{ flex: 1, fontFamily: "inherit", fontSize: 13, padding: "6px 8px", borderRadius: 8, border: "1.5px solid var(--line)", background: s.staff_id ? "#fff" : "var(--surface-2)", color: s.staff_id ? "var(--ink)" : "var(--danger)", fontWeight: s.staff_id ? 500 : 600 }}>
                                <option value="">— scoperto —</option>
                                {staff.map(p => {
                                  const bl = getBlockingLeave(s.date, p.id, s.shift_type_id);
                                  return <option key={p.id} value={p.id} disabled={!!bl}>{bl ? `${p.name} — ${leaveLabel(bl.type)}` : p.name}</option>;
                                })}
                              </select>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* ── Desktop table view ── */
              <table className="tbl" style={{ fontSize: 13, minWidth: 600 }}>
                <thead>
                  <tr>
                    <th style={{ position: "sticky", left: 0, background: "var(--surface)", zIndex: 2, minWidth: 110 }}>Giorno</th>
                    {shiftTypes.map(st => {
                      const color = stColorMap.get(st.id);
                      return (
                        <th key={st.id} style={{ textAlign: "center", minWidth: 180 }}>
                          <div style={{ fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                            {color && <span style={{ width: 8, height: 8, borderRadius: 3, background: color }} />}
                            {st.name}
                          </div>
                          <div className="muted" style={{ fontWeight: 400, fontSize: 11 }}>{st.start}–{st.end}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {monthDates.map(date => {
                    const wd = isoWd(date);
                    const dayName = WEEKDAYS[wd - 1];
                    const isPast = date < today;
                    const isLocked = date < firstOfCurrentMonth;
                    const isReadOnly = isLocked || (isPast && !isAdmin);
                    const isWeekend = wd >= 6;
                    const isToday = date === today;
                    const rowBg = isLocked ? "#E8E6E1" : isToday ? "#EEFBF1" : isWeekend ? "var(--surface-2)" : undefined;
                    const stickyBg = isLocked ? "#E8E6E1" : isToday ? "#EEFBF1" : isWeekend ? "var(--surface-2)" : "var(--surface)";
                    return (
                      <tr key={date} style={{ background: rowBg }} title={isLocked ? "I turni dei mesi precedenti non sono modificabili" : undefined}>
                        <td style={{
                          fontWeight: 600, whiteSpace: "nowrap", position: "sticky", left: 0,
                          background: stickyBg, zIndex: 1, opacity: isLocked ? 0.4 : (isPast && !isAdmin) ? 0.5 : 1,
                          borderLeft: isToday ? "3px solid var(--accent)" : (leavesByDate[date]?.length ? "3px solid #7B61A6" : exceptionDates.has(date) ? "3px solid #BFA762" : undefined),
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>{dayName}{exceptionDates.has(date) && <span title="Copertura modificata" style={{ width: 6, height: 6, borderRadius: 3, background: "#BFA762", display: "inline-block" }} />}</div>
                          <div className="muted" style={{ fontSize: 11, fontWeight: 500 }}>{fmtDayShort(date)}</div>
                          {(leavesByDate[date] ?? []).map(l => (
                            <div key={l.id} style={{ fontSize: 10, fontWeight: 700, color: "#7B61A6", marginTop: 2 }}>
                              P {l.staff_name}{l.period !== "giornata_intera" ? ` (${l.period === "mattina" ? "AM" : "PM"})` : ""}
                            </div>
                          ))}
                        </td>
                        {shiftTypes.map(st => {
                          const cellSlots = byDateAndType[date]?.[st.id] ?? [];
                          return (
                            <td key={st.id} style={{ padding: "6px 10px", opacity: isLocked ? 0.4 : (isPast && !isAdmin) ? 0.5 : 1, verticalAlign: "middle", textAlign: "center" }}>
                              {cellSlots.length === 0 ? (
                                <span className="muted">—</span>
                              ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                  {cellSlots.map(s => {
                                  const isMyShift = isStaff && myStaffId != null && s.staff_id === myStaffId;
                                  const hasLeaveConflict = s.staff_id ? !!getBlockingLeave(s.date, s.staff_id, s.shift_type_id) : false;
                                  return (isReadOnly || isStaff) ? (
                                    <div key={s.key} style={{
                                      fontSize: 13, fontWeight: 600, padding: "6px 10px",
                                      background: hasLeaveConflict ? "#FDF2F2" : isMyShift ? "rgba(45,90,61,.12)" : s.staff_id ? "rgba(0,0,0,.03)" : "transparent",
                                      borderRadius: 8,
                                      border: hasLeaveConflict ? "2px solid #9E3B2E" : isMyShift ? "2px solid #2D5A3D" : "1.5px solid transparent",
                                    }}>
                                      {s.staff_id ? (
                                        <>
                                          {staffById.get(s.staff_id)?.name ?? "?"}
                                          {hasLeaveConflict && <span style={{ fontSize: 11, color: "#9E3B2E", marginLeft: 4 }} title="Ha un permesso questo giorno">&#9888;</span>}
                                        </>
                                      ) : (
                                        <span style={{ color: "var(--danger)" }}>scoperto</span>
                                      )}
                                    </div>
                                  ) : (
                                    <select key={s.key} value={s.staff_id ?? ""}
                                      onChange={e => setSlotValue(s.key, e.target.value || null)}
                                      style={{
                                        width: "100%", minWidth: 140, fontFamily: "inherit", fontSize: 13,
                                        padding: "8px 10px", borderRadius: 8,
                                        border: (s.staff_id && getBlockingLeave(s.date, s.staff_id, s.shift_type_id)) ? "2px solid #9E3B2E" : flashKey === s.key ? "2px solid #2D5A3D" : "1.5px solid var(--line)",
                                        background: (s.staff_id && getBlockingLeave(s.date, s.staff_id, s.shift_type_id)) ? "#FDF2F2" : flashKey === s.key ? "#E3EEE4" : s.staff_id ? "#fff" : "var(--surface-2)",
                                        color: s.staff_id ? "var(--ink)" : "var(--danger)",
                                        fontWeight: s.staff_id ? 500 : 600,
                                        transition: "border-color .3s, background .3s",
                                      }}>
                                      <option value="">— scoperto —</option>
                                      {staff.map(p => {
                                        const bl = getBlockingLeave(s.date, p.id, s.shift_type_id);
                                        return <option key={p.id} value={p.id} disabled={!!bl}>{bl ? `${p.name} — ${leaveLabel(bl.type)}` : p.name}</option>;
                                      })}
                                    </select>
                                  );
                                })}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : (
        /* ── WEEK VIEW ── */
        <div className="section">
          <div className="section-head">
            <h2>Settimana {weekLabel}</h2>
            <span className="muted">
              {(() => { const wg = slots.filter(s => weekDates.includes(s.date) && !s.staff_id).length; return wg > 0 ? `${wg} scoperti` : <><span>Tutti coperti </span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline", verticalAlign: "-2px" }}><path d="M20 6L9 17l-5-5" /></svg></>; })()}
            </span>
          </div>
          <div className="section-body" style={{ padding: 16 }}>
            {weekDates.map((date, i) => {
              const daySlots = byDate[date] ?? [];
              const isPast = date < today;
              const isLocked = date < firstOfCurrentMonth;
              const isReadOnly = isLocked || (isPast && !isAdmin);
              const isToday = date === today;
              return (
                <div key={date} style={{
                  marginBottom: 16, paddingBottom: 16,
                  borderBottom: i < 6 ? "1px solid var(--line)" : undefined,
                  opacity: isLocked ? 0.4 : (isPast && !isAdmin) ? 0.5 : 1,
                  background: isLocked ? "#E8E6E1" : undefined,
                  borderRadius: isLocked ? 8 : undefined,
                  padding: isLocked ? "12px 16px" : undefined,
                }} title={isLocked ? "I turni dei mesi precedenti non sono modificabili" : undefined}>
                  <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
                    {isToday && <span style={{ width: 8, height: 8, borderRadius: 4, background: "var(--accent)", flexShrink: 0 }} />}
                    {WEEKDAYS[i]} <span className="muted" style={{ fontWeight: 500 }}>{fmtDayShort(date)}</span>
                    {exceptionDates.has(date) && <span title="Copertura modificata" style={{ width: 7, height: 7, borderRadius: 4, background: "#BFA762", display: "inline-block" }} />}
                    {isToday && <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)" }}>OGGI</span>}
                  </div>
                  {daySlots.length === 0 ? (
                    <div className="muted">Nessuna copertura prevista.</div>
                  ) : (
                    <div className="turni-day-grid">
                      {daySlots.map(s => {
                        const t = stById.get(s.shift_type_id);
                        const color = stColorMap.get(s.shift_type_id) ?? "var(--accent)";
                        return (
                          <div key={s.key} style={{
                            border: `1.5px solid ${s.staff_id ? "var(--line)" : "rgba(158,59,46,.25)"}`,
                            borderRadius: 12, padding: "14px 16px",
                            background: flashKey === s.key ? "#E3EEE4" : s.staff_id ? "#fff" : "rgba(158,59,46,.03)",
                            transition: "background .3s",
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                              <span style={{ width: 8, height: 8, borderRadius: 3, background: color, flexShrink: 0 }} />
                              <span style={{ fontSize: 14, fontWeight: 700 }}>{t?.name ?? "—"}</span>
                            </div>
                            <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>{t?.start}–{t?.end}</div>
                            {(() => {
                            const isMyShift = isStaff && myStaffId != null && s.staff_id === myStaffId;
                            return (isReadOnly || isStaff) ? (
                              <div style={{
                                fontSize: 15, fontWeight: 600, padding: "10px 12px", borderRadius: 8,
                                background: isMyShift ? "rgba(45,90,61,.12)" : "rgba(0,0,0,.03)",
                                border: isMyShift ? "2px solid #2D5A3D" : "1.5px solid transparent",
                              }}>
                                {s.staff_id ? (staffById.get(s.staff_id)?.name ?? "?") : (
                                  <span style={{ color: "var(--danger)" }}>— scoperto —</span>
                                )}
                              </div>
                            ) : (
                              <select value={s.staff_id ?? ""} onChange={e => setSlotValue(s.key, e.target.value || null)}
                                style={{
                                  width: "100%", fontFamily: "inherit", fontSize: 14, padding: "10px 12px",
                                  border: (s.staff_id && getBlockingLeave(s.date, s.staff_id, s.shift_type_id)) ? "2px solid #9E3B2E" : "1.5px solid var(--line)",
                                  borderRadius: 10,
                                  background: (s.staff_id && getBlockingLeave(s.date, s.staff_id, s.shift_type_id)) ? "#FDF2F2" : "#fff",
                                  fontWeight: s.staff_id ? 500 : 600,
                                  color: s.staff_id ? "var(--ink)" : "var(--danger)",
                                }}>
                                <option value="">— scoperto —</option>
                                {staff.map(p => {
                                  const bl = getBlockingLeave(s.date, p.id, s.shift_type_id);
                                  return <option key={p.id} value={p.id} disabled={!!bl}>{bl ? `${p.name} — ${leaveLabel(bl.type)}` : p.name}</option>;
                                })}
                              </select>
                            );
                          })()}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Monthly Coverage Breakdown ── */}
      {!isStaff && staff.length > 0 && view === "month" && (
        <div className="section">
          <div className="section-head">
            <h2>Copertura mensile</h2>
            <span className="muted">{monthLabel}</span>
          </div>
          <div className="section-body" style={{ padding: 0, overflowX: "auto" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Persona</th>
                  {shiftTypes.map(st => (
                    <th key={st.id} style={{ textAlign: "center" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 3, background: stColorMap.get(st.id) ?? "var(--accent)" }} />
                        {st.name}
                      </span>
                    </th>
                  ))}
                  <th style={{ textAlign: "right" }}>Ore</th>
                  <th style={{ textAlign: "center" }}>Lavorati</th>
                  <th style={{ textAlign: "center" }}>Riposi</th>
                  <th style={{ textAlign: "center" }}>Permessi</th>
                  <th>Stato</th>
                </tr>
              </thead>
              <tbody>
                {monthlyCoverage.map(row => (
                  <tr key={row.staffId}>
                    <td><strong>{row.staffName}</strong></td>
                    {shiftTypes.map(st => (
                      <td key={st.id} className="tabular" style={{ textAlign: "center", fontWeight: 600 }}>
                        {row.byType[st.id] ?? 0}
                      </td>
                    ))}
                    <td className="tabular" style={{ textAlign: "right", fontWeight: 700, color: row.overHours ? "var(--danger)" : undefined }}>
                      {row.totalHours}h
                    </td>
                    <td className="tabular" style={{ textAlign: "center" }}>{row.workDays}g</td>
                    <td className="tabular" style={{ textAlign: "center", color: row.lowRest ? "var(--danger)" : undefined, fontWeight: row.lowRest ? 700 : 400 }}>
                      {row.restDays}g
                    </td>
                    <td className="tabular" style={{ textAlign: "center", color: "#7B61A6", fontWeight: 600 }}>
                      {leaveCountByStaff[row.staffId] ?? 0}
                    </td>
                    <td>
                      {row.overHours && <span className="badge" style={{ background: "rgba(158,59,46,.1)", color: "#9E3B2E", fontSize: 11, marginRight: 4 }}>Ore eccessive</span>}
                      {row.lowRest && <span className="badge" style={{ background: "rgba(158,59,46,.1)", color: "#9E3B2E", fontSize: 11 }}>Pochi riposi</span>}
                      {!row.overHours && !row.lowRest && <span className="badge" style={{ background: "#E3EEE4", color: "#2D5A3D", fontSize: 11 }}>OK</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Daily coverage gaps ── */}
      {!isStaff && dailyCoverageGaps.length > 0 && view === "month" && (
        <div className="section">
          <div className="section-head">
            <h2>Giorni con copertura insufficiente</h2>
            <span className="muted">{dailyCoverageGaps.length} giorni</span>
          </div>
          <div className="section-body">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {dailyCoverageGaps.map(g => (
                <div key={g.date} style={{
                  padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                  background: "rgba(158,59,46,.06)", border: "1px solid rgba(158,59,46,.15)", color: "#9E3B2E",
                }}>
                  {fmtDayShort(g.date)} — {g.assigned}/{g.needed} coperti
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Hours Summary ── */}
      {!isStaff && staff.length > 0 && (
        <div className="section">
          <div className="section-head">
            <h2>Riepilogo ore e costi</h2>
            <span className="muted">{view === "week" ? `Sett. ${weekLabel}` : monthLabel}</span>
          </div>
          <div className="section-body" style={{ padding: 0, overflowX: "auto" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Persona</th>
                  <th>Tipo</th>
                  <th style={{ textAlign: "right" }}>Ore sett.</th>
                  <th style={{ textAlign: "right" }}>Ore mese</th>
                  <th style={{ textAlign: "right" }}>Contratto</th>
                  <th style={{ textAlign: "right" }}>Costo sett.</th>
                  <th style={{ textAlign: "right" }}>Costo mese</th>
                </tr>
              </thead>
              <tbody>
                {staff.map(p => {
                  const mh = monthHoursMap[p.id] ?? 0;
                  const wh = weekHoursMap[p.id] ?? 0;
                  const isOnCall = p.type === "a_chiamata";
                  const wCost = isOnCall ? wh * HOURLY_RATE_ON_CALL : null;
                  const mCost = isOnCall ? mh * HOURLY_RATE_ON_CALL : null;
                  const monthWeeks = monthDates.length / 7;
                  const overMonth = p.hours_per_week > 0 && mh > p.hours_per_week * monthWeeks;
                  return (
                    <tr key={p.id}>
                      <td><strong>{p.name}</strong></td>
                      <td>
                        <span className={`badge ${isOnCall ? "badge-call" : "badge-dip"}`}>
                          {isOnCall ? "A chiamata" : "Dipendente"}
                        </span>
                      </td>
                      <td className="tabular" style={{ textAlign: "right", fontWeight: 600 }}>{wh}h</td>
                      <td className="tabular" style={{ textAlign: "right", fontWeight: 600, color: overMonth ? "var(--danger)" : undefined }}>{mh}h</td>
                      <td className="tabular muted" style={{ textAlign: "right" }}>{p.hours_per_week || "—"}h/sett</td>
                      <td className="tabular" style={{ textAlign: "right", background: isOnCall ? "rgba(191,167,98,.08)" : undefined, fontWeight: isOnCall ? 600 : 400 }}>
                        {wCost != null ? eur(wCost) : "—"}
                      </td>
                      <td className="tabular" style={{ textAlign: "right", background: isOnCall ? "rgba(191,167,98,.08)" : undefined, fontWeight: isOnCall ? 600 : 400 }}>
                        {mCost != null ? eur(mCost) : "—"}
                      </td>
                    </tr>
                  );
                })}
                <tr style={{ background: "var(--surface-2)" }}>
                  <td colSpan={5} style={{ textAlign: "right", fontWeight: 700 }}>Totale a chiamata</td>
                  <td className="tabular" style={{ textAlign: "right", fontWeight: 700 }}>{eur(totalWeekCost)}</td>
                  <td className="tabular" style={{ textAlign: "right", fontWeight: 700 }}>{eur(totalMonthCost)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Absences ── */}
      {!isStaff && monthAbsences.length > 0 && (
        <div className="section">
          <div className="section-head">
            <h2>Assenze nel periodo</h2>
            <span className="muted">{monthAbsences.length} registrate</span>
          </div>
          <div className="section-body">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {monthAbsences.sort((a, b) => a.absent_date.localeCompare(b.absent_date)).map((a, i) => {
                const sourceLeave = leaveRows.find(l => l.id === a.id);
                const displayName = staffById.get(a.staff_id)?.name ?? "?";
                return (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "10px 14px", borderRadius: 10, border: "1px solid var(--line)",
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{displayName}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {fmtDayShort(a.absent_date)}{a.end_date ? ` – ${fmtDayShort(a.end_date)}` : ""}
                        {a.notes ? ` · ${a.notes}` : ""}
                      </div>
                    </div>
                    <span className={`badge badge-${a.type ?? "permesso"}`}>
                      {a.type === "ferie" ? "Ferie" : a.type === "malattia" ? "Malattia" : "Permesso"}
                    </span>
                    {sourceLeave && (
                      <div style={{ display: "flex", gap: 4 }}>
                        <button title="Modifica" onClick={() => setEditingLeave(sourceLeave)} style={{
                          background: "none", border: "none", cursor: "pointer", padding: 6, borderRadius: 6,
                          color: "#BFA762", transition: "color .15s",
                        }} onMouseEnter={e => (e.currentTarget.style.color = "#1F3326")} onMouseLeave={e => (e.currentTarget.style.color = "#BFA762")}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.85 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>
                        </button>
                        <button title="Elimina" onClick={() => setDeletingLeave({ ...sourceLeave, displayName })} style={{
                          background: "none", border: "none", cursor: "pointer", padding: 6, borderRadius: 6,
                          color: "#999", transition: "color .15s",
                        }} onMouseEnter={e => (e.currentTarget.style.color = "#C4453C")} onMouseLeave={e => (e.currentTarget.style.color = "#999")}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Staff: Swap Requests Received ── */}
      {isStaff && swapRequests.length > 0 && (
        <div className="section" style={{ marginTop: 20, borderLeft: "3px solid #BFA762" }}>
          <div className="section-head"><h2>Richieste cambio turno</h2></div>
          <div className="section-body" style={{ padding: 16 }}>
            {swapRequests.map(r => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid var(--line)", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{r.requester?.full_name ?? "?"}</div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    Vuole scambiare il turno del {new Date(r.request_date + "T00:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "long" })}
                    {r.request_shift ? ` (${r.request_shift})` : ""}
                  </div>
                  {r.note && <div className="muted" style={{ fontSize: 12, fontStyle: "italic", marginTop: 4 }}>&quot;{r.note}&quot;</div>}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-primary" style={{ padding: "8px 16px", fontSize: 13 }} onClick={() => respondSwapRequest(r.id, true)}>Accetta</button>
                  <button className="btn-ghost" style={{ padding: "8px 16px", borderRadius: 8, fontSize: 13 }} onClick={() => respondSwapRequest(r.id, false)}>Rifiuta</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Staff: Personal Summary (redesigned) ── */}
      {isStaff && myStaffId && (() => {
        const mySlots = slots.filter(s => s.staff_id === myStaffId);
        const byType: Record<string, number> = {};
        for (const s of mySlots) {
          const t = stById.get(s.shift_type_id);
          if (t) byType[t.name] = (byType[t.name] ?? 0) + 1;
        }
        const restDays = monthDates.length - new Set(mySlots.map(s => s.date)).size;

        const futureSlots = mySlots.filter(s => s.date >= today).sort((a, b) => a.date.localeCompare(b.date));
        const nextSlot = futureSlots[0] ?? null;
        const nextShift = nextSlot ? stById.get(nextSlot.shift_type_id) : null;
        const isShiftToday = nextSlot?.date === today;
        const daysUntilNext = nextSlot ? Math.round((new Date(nextSlot.date + "T00:00:00").getTime() - new Date(today + "T00:00:00").getTime()) / 864e5) : null;
        const nextDateLabel = nextSlot ? new Date(nextSlot.date + "T00:00:00").toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" }) : "";

        const upcomingList = futureSlots.filter(s => s.date !== today).slice(0, 10);

        function generateIcs() {
          const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Le4Camere//Turni//IT", "CALSCALE:GREGORIAN"];
          for (const s of mySlots) {
            const t = stById.get(s.shift_type_id);
            if (!t) continue;
            const d = s.date.replace(/-/g, "");
            const start = t.start.replace(":", "") + "00";
            const end = t.end.replace(":", "") + "00";
            lines.push("BEGIN:VEVENT", `DTSTART;TZID=Europe/Rome:${d}T${start}`, `DTEND;TZID=Europe/Rome:${d}T${end}`, `SUMMARY:Turno ${t.name} Le 4 Camere`, "LOCATION:Le 4 Camere Hotel", "END:VEVENT");
          }
          lines.push("END:VCALENDAR");
          const blob = new Blob([lines.join("\r\n")], { type: "text/calendar" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `turni-${activeMonth.year}-${String(activeMonth.month).padStart(2, "0")}.ics`;
          a.click();
          URL.revokeObjectURL(url);
          showToast("File calendario scaricato");
        }

        function copyToClipboard() {
          const header = `I miei turni ${monthLabel}:`;
          const lines = mySlots.sort((a, b) => a.date.localeCompare(b.date)).map(s => {
            const t = stById.get(s.shift_type_id);
            const d = new Date(s.date + "T00:00:00");
            const label = d.toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "2-digit" });
            return `${label} — ${t?.name ?? "?"}`;
          }).join("\n");
          navigator.clipboard.writeText(`${header}\n${lines}`).then(() => showToast("Turni copiati negli appunti"));
        }

        function printMyShifts() {
          const w = window.open("", "_blank");
          if (!w) return;
          const rows = mySlots.sort((a, b) => a.date.localeCompare(b.date)).map(s => {
            const t = stById.get(s.shift_type_id);
            const d = new Date(s.date + "T00:00:00");
            return `<tr><td style="padding:6px 12px;border-bottom:1px solid #E8E0D0">${d.toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "long" })}</td><td style="padding:6px 12px;border-bottom:1px solid #E8E0D0;font-weight:700">${t?.name ?? ""}</td><td style="padding:6px 12px;border-bottom:1px solid #E8E0D0;color:#6C6B5D">${t?.start ?? ""}–${t?.end ?? ""}</td></tr>`;
          }).join("");
          w.document.write(`<!DOCTYPE html><html><head><title>I miei turni</title><style>body{font-family:sans-serif;padding:40px;color:#1F3326}table{width:100%;border-collapse:collapse}th{text-align:left;padding:8px 12px;background:#1F3326;color:#FAF9F5}@media print{body{padding:20px}}</style></head><body><h1 style="font-size:20px;margin-bottom:4px">I miei turni — ${monthLabel}</h1><p style="color:#6C6B5D;font-size:13px;margin-bottom:16px">Le 4 Camere Hotel</p><table><thead><tr><th>Giorno</th><th>Turno</th><th>Orario</th></tr></thead><tbody>${rows}</tbody></table><p style="margin-top:24px;font-size:11px;color:#6C6B5D">Stampato il ${new Date().toLocaleDateString("it-IT")}</p><script>window.print()</script></body></html>`);
          w.document.close();
        }

        return (
          <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Next shift card */}
            {nextSlot && (
              <div className="section" style={{ borderLeft: isShiftToday ? "4px solid #2D5A3D" : "4px solid #BFA762" }}>
                <div className="section-body" style={{
                  padding: "20px 24px",
                  background: isShiftToday ? "rgba(45,90,61,.06)" : undefined,
                }}>
                  {isShiftToday ? (
                    <>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "#2D5A3D", marginBottom: 6 }}>Oggi in turno</div>
                      <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 600, color: "#1F3326" }}>
                        {nextShift?.name} {nextShift?.start}–{nextShift?.end}
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "#BFA762", marginBottom: 6 }}>Prossimo turno</div>
                      <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 600, color: "#1F3326", marginBottom: 4 }}>
                        Tra {daysUntilNext} {daysUntilNext === 1 ? "giorno" : "giorni"}
                      </div>
                      <div style={{ fontSize: 14, color: "var(--ink-soft)" }}>
                        {nextDateLabel.charAt(0).toUpperCase() + nextDateLabel.slice(1)} — {nextShift?.name} {nextShift?.start}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Monthly stats pills */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12 }}>
              {Object.entries(byType).map(([name, count]) => (
                <div key={name} className="card" style={{ textAlign: "center", padding: "16px 12px", borderTop: `3px solid ${name.toLowerCase().includes("matt") ? "#BFA762" : "#4F7B8C"}` }}>
                  <div style={{ fontSize: 13, marginBottom: 6 }}>
                    {name.toLowerCase().includes("matt") ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#BFA762" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "-3px" }}><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4F7B8C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "-3px" }}><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></svg>
                    )}
                  </div>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: "#1F3326", lineHeight: 1 }}>{count}</div>
                  <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4 }}>{name}</div>
                </div>
              ))}
              <div className="card" style={{ textAlign: "center", padding: "16px 12px", borderTop: "3px solid #E8E0D0" }}>
                <div style={{ fontSize: 13, marginBottom: 6 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6C6B5D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "-3px" }}><circle cx="12" cy="12" r="10" /><path d="M8 12h8" /></svg>
                </div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: "#1F3326", lineHeight: 1 }}>{restDays}</div>
                <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4 }}>Riposi</div>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
              <button className="btn-ghost" style={{ padding: "12px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }} onClick={generateIcs}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>
                Aggiungi al calendario
              </button>
              <button className="btn-ghost" style={{ padding: "12px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }} onClick={printMyShifts}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
                Stampa i miei turni
              </button>
              <button className="btn-ghost" style={{ padding: "12px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }} onClick={copyToClipboard}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></svg>
                Condividi
              </button>
              <button className="btn btn-primary" style={{ padding: "12px 16px", borderRadius: 10, fontSize: 13 }} onClick={() => setShowSwapModal(true)}>
                Richiedi cambio turno
              </button>
              <button style={{ padding: "12px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600, background: "#7B61A6", color: "#fff", border: "none", cursor: "pointer", fontFamily: "inherit" }} onClick={() => setShowLeaveModal(true)}>
                Richiedi permesso
              </button>
            </div>

            {/* Upcoming shifts */}
            {upcomingList.length > 0 && (
              <div className="section">
                <div className="section-head"><h2>Prossimi turni</h2><span className="muted">{upcomingList.length} in programma</span></div>
                <div className="section-body" style={{ padding: 0 }}>
                  {upcomingList.map(s => {
                    const t = stById.get(s.shift_type_id);
                    const d = new Date(s.date + "T00:00:00");
                    const dayLabel = d.toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "2-digit" });
                    const otherSlots = slots.filter(os => os.date === s.date && os.staff_id && os.staff_id !== myStaffId);
                    const colleagues = otherSlots.map(os => {
                      const name = staffById.get(os.staff_id!)?.name ?? "?";
                      const oType = stById.get(os.shift_type_id)?.name?.toLowerCase() ?? "";
                      return `${name} (${oType})`;
                    });
                    return (
                      <div key={s.key} style={{
                        display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
                        borderBottom: "1px solid var(--line)",
                      }}>
                        <span style={{ width: 8, height: 8, borderRadius: 4, background: stColorMap.get(s.shift_type_id) ?? "var(--accent)", flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{dayLabel} — {t?.name ?? "?"}</div>
                          <div className="muted" style={{ fontSize: 12 }}>
                            {t?.start}–{t?.end}
                            {colleagues.length > 0 && <> · con {colleagues.join(", ")}</>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}
      {isStaff && !myStaffId && (
        <div className="section" style={{ marginTop: 20 }}>
          <div className="section-body" style={{ padding: 20 }}>
            <p className="muted">Profilo staff non trovato. Contatta l&#39;amministratore.</p>
          </div>
        </div>
      )}

      {/* ── Staff: Swap Modal ── */}
      {isStaff && showSwapModal && (
        <div className="modal-overlay" onClick={() => setShowSwapModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="section-head" style={{ padding: "20px 24px", borderBottom: "1px solid var(--line)" }}>
              <h2>Richiedi cambio turno</h2>
              <button className="btn-ghost" style={{ padding: "4px 10px", borderRadius: 8 }} onClick={() => setShowSwapModal(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="field">
                <label>Il mio turno da scambiare</label>
                <select value={swapDate} onChange={e => setSwapDate(e.target.value)}>
                  <option value="">Seleziona...</option>
                  {slots.filter(s => s.staff_id === myStaffId && s.date >= today).map(s => {
                    const t = stById.get(s.shift_type_id);
                    return <option key={s.key} value={s.date}>{new Date(s.date + "T00:00:00").toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "long" })} — {t?.name ?? "?"}</option>;
                  })}
                </select>
              </div>
              <div className="field">
                <label>Scambia con</label>
                <select value={swapTargetId} onChange={e => setSwapTargetId(e.target.value)}>
                  <option value="">Seleziona collega...</option>
                  {staff.filter(s => s.id !== myStaffId).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Nota (opzionale)</label>
                <textarea value={swapNote} onChange={e => setSwapNote(e.target.value)} placeholder="Motivo dello scambio..." rows={3} />
              </div>
              <button className="btn btn-primary" style={{ width: "100%", padding: "14px 22px", fontSize: 15 }}
                onClick={submitSwapRequest} disabled={swapSending || !swapDate || !swapTargetId}>
                {swapSending ? "Invio..." : "Invia richiesta"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Pending Leave Requests (admin/manager) ── */}
      {!isStaff && pendingLeaves.length > 0 && (
        <div className="section" style={{ borderLeft: "3px solid #7B61A6" }}>
          <div className="section-head">
            <h2>Richieste permesso in attesa</h2>
            <span style={{ background: "#7B61A6", color: "#fff", padding: "2px 10px", borderRadius: 10, fontSize: 12, fontWeight: 700 }}>{pendingLeaves.length}</span>
          </div>
          <div className="section-body" style={{ padding: 16 }}>
            {pendingLeaves.map(l => (
              <div key={l.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid var(--line)", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{l.staff_name}</div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {new Date(l.date + "T00:00:00").toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "long" })}
                    {l.period !== "giornata_intera" && ` (${l.period === "mattina" ? "mattina" : "pomeriggio"})`}
                    {" — "}{l.type === "permesso" ? "Permesso" : l.type === "malattia" ? "Malattia" : l.type === "ferie" ? "Ferie" : "Altro"}
                  </div>
                  {l.reason && <div className="muted" style={{ fontSize: 12, fontStyle: "italic", marginTop: 4 }}>&quot;{l.reason}&quot;</div>}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-primary" style={{ padding: "8px 16px", fontSize: 13 }} onClick={() => approveLeave(l.id)}>Approva</button>
                  <button className="btn-ghost" style={{ padding: "8px 16px", borderRadius: 8, fontSize: 13, color: "var(--danger)" }} onClick={() => rejectLeave(l.id)}>Rifiuta</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Leave Modal ── */}
      {showLeaveModal && (() => {
        const leaveStaff = staff
          .map(s => ({ id: staffProfileMap.get(s.id) ?? "", name: s.name, staffId: s.id }))
          .filter(s => s.id);
        const p2s = new Map(leaveStaff.map(s => [s.id, s.staffId]));
        return (
          <LeaveModal
            staff={leaveStaff.map(s => ({ id: s.id, name: s.name }))}
            supabase={supabase}
            onClose={() => setShowLeaveModal(false)}
            onDone={() => loadAll()}
            showToast={showToast}
            preselectedStaffId={isStaff ? userId ?? undefined : undefined}
            asRequest={isStaff}
            profileToStaffId={p2s}
          />
        );
      })()}

      {/* ── Delete Leave Confirmation ── */}
      {deletingLeave && (
        <div className="modal-overlay" onClick={() => setDeletingLeave(null)}>
          <div className="modal-card" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div className="section-head" style={{ padding: "20px 24px", borderBottom: "1px solid var(--line)" }}>
              <h2>Conferma eliminazione</h2>
              <button className="btn-ghost" style={{ padding: "4px 10px", borderRadius: 8 }} onClick={() => setDeletingLeave(null)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div style={{ padding: 24 }}>
              <p style={{ fontSize: 14, color: "var(--ink)", lineHeight: 1.6, margin: "0 0 20px" }}>
                Sei sicuro di voler eliminare il permesso di <strong>{deletingLeave.displayName}</strong> del{" "}
                <strong>{new Date(deletingLeave.date + "T00:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" })}</strong>?
              </p>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button className="btn-ghost" style={{ padding: "10px 20px", borderRadius: 8, fontSize: 14 }} onClick={() => setDeletingLeave(null)}>Annulla</button>
                <button className="btn btn-primary" style={{ padding: "10px 20px", fontSize: 14, background: "#9E3B2E" }} onClick={() => deleteLeave(deletingLeave.id)}>Elimina</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Leave Modal ── */}
      {editingLeave && (() => {
        const EditLeaveInner = () => {
          const [editType, setEditType] = useState(editingLeave.type);
          const [editDate, setEditDate] = useState(editingLeave.date);
          const [editPeriod, setEditPeriod] = useState(editingLeave.period);
          const [editReason, setEditReason] = useState(editingLeave.reason ?? "");
          const [editSaving, setEditSaving] = useState(false);

          return (
            <div className="modal-overlay" onClick={() => setEditingLeave(null)}>
              <div className="modal-card" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
                <div className="section-head" style={{ padding: "20px 24px", borderBottom: "1px solid var(--line)" }}>
                  <h2>Modifica permesso</h2>
                  <button className="btn-ghost" style={{ padding: "4px 10px", borderRadius: 8 }} onClick={() => setEditingLeave(null)}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
                </div>
                <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
                  {/* Persona (disabled) */}
                  <div className="field">
                    <label>Persona</label>
                    <input value={editingLeave.staff_name} disabled style={{ background: "var(--surface-2)" }} />
                  </div>

                  {/* Data */}
                  <div className="field">
                    <label>Data</label>
                    <DatePickerIT value={editDate} onChange={setEditDate} />
                  </div>

                  {/* Tipo */}
                  <div>
                    <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-soft)", display: "block", marginBottom: 6 }}>Tipo</label>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {[{ value: "permesso", label: "Permesso" }, { value: "malattia", label: "Malattia" }, { value: "ferie", label: "Ferie" }, { value: "altro", label: "Altro" }].map(t => (
                        <button key={t.value} type="button"
                          className={`absence-pill ${t.value}${editType === t.value ? " active" : ""}`}
                          onClick={() => setEditType(t.value as typeof editType)}>
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Periodo */}
                  <div>
                    <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-soft)", display: "block", marginBottom: 6 }}>Periodo</label>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {[{ value: "giornata_intera", label: "Giornata intera" }, { value: "mattina", label: "Solo mattina" }, { value: "pomeriggio", label: "Solo pomeriggio" }].map(p => (
                        <button key={p.value} type="button"
                          style={{
                            padding: "8px 16px", borderRadius: 20, fontSize: 13, fontWeight: 600,
                            border: editPeriod === p.value ? "2px solid #7B61A6" : "1.5px solid var(--line)",
                            background: editPeriod === p.value ? "rgba(123,97,166,.12)" : "transparent",
                            color: editPeriod === p.value ? "#7B61A6" : "var(--ink-soft)",
                            cursor: "pointer", fontFamily: "inherit",
                          }}
                          onClick={() => setEditPeriod(p.value as typeof editPeriod)}>
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Note */}
                  <div className="field">
                    <label>Note (opzionale)</label>
                    <input value={editReason} onChange={e => setEditReason(e.target.value)} placeholder="Es. visita medica, motivi personali..." />
                  </div>

                  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                    <button className="btn-ghost" style={{ padding: "12px 20px", borderRadius: 8, fontSize: 14 }} onClick={() => setEditingLeave(null)}>Annulla</button>
                    <button className="btn btn-primary" style={{ padding: "12px 22px", fontSize: 14 }}
                      disabled={editSaving || !editDate}
                      onClick={async () => {
                        setEditSaving(true);
                        await updateLeave(editingLeave.id, {
                          type: editType,
                          date: editDate,
                          period: editPeriod,
                          reason: editReason.trim() || null,
                        });
                        setEditSaving(false);
                      }}>
                      {editSaving ? "Salvataggio..." : "Salva modifiche"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        };
        return <EditLeaveInner />;
      })()}

      {/* ── Unsaved bar ── */}
      {!isStaff && !saved && !loading && staff.length > 0 && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: "#1F3326", color: "#FAF9F5", padding: "12px 28px", borderRadius: 12,
          fontSize: 14, fontWeight: 600, zIndex: 200, boxShadow: "0 4px 20px rgba(0,0,0,.25)",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          {saving ? (
            <><div style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin .6s linear infinite" }} />Salvataggio...</>
          ) : (
            <>Modifiche non salvate<button onClick={salvaManuale} style={{ background: "var(--accent)", color: "#1F3326", border: "none", borderRadius: 8, padding: "6px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Salva ora</button></>
          )}
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)",
          background: "#2D5A3D", color: "#FAF9F5", padding: "10px 22px", borderRadius: 10,
          fontSize: 13, fontWeight: 600, zIndex: 201, boxShadow: "0 4px 16px rgba(0,0,0,.2)",
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline", verticalAlign: "-2px", marginRight: 6 }}><path d="M20 6L9 17l-5-5" /></svg>
          {toast}
        </div>
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
}
