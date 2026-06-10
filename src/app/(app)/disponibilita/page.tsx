"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRole } from "@/lib/useRole";
import type { ShiftTypeRow } from "@/lib/turni";
import AvailabilityCalendar, { type AvailStatus } from "@/components/AvailabilityCalendar";

function cycleStatus(s: AvailStatus): AvailStatus {
  if (s === "unspecified") return "available";
  if (s === "available") return "preferred";
  if (s === "preferred") return "unavailable";
  return "unspecified";
}

/* ── Calendar helpers ── */
function buildMonthDates(year: number, month: number): string[] {
  const last = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, "0");
  return Array.from({ length: last }, (_, i) => `${year}-${mm}-${String(i + 1).padStart(2, "0")}`);
}

function buildCalendarWeeks(year: number, month: number): (string | null)[][] {
  const dates = buildMonthDates(year, month);
  const firstDow = new Date(year, month - 1, 1).getDay();
  const pad = firstDow === 0 ? 6 : firstDow - 1;
  const weeks: (string | null)[][] = [];
  let row: (string | null)[] = new Array(pad).fill(null);
  for (const d of dates) {
    row.push(d);
    if (row.length === 7) { weeks.push(row); row = []; }
  }
  if (row.length) { while (row.length < 7) row.push(null); weeks.push(row); }
  return weeks;
}

function fmtMonth(y: number, m: number) {
  const s = new Date(y, m - 1, 1).toLocaleDateString("it-IT", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const LEGEND_COLORS: [string, string][] = [
  ["#2D5A3D", "Disponibile"],
  ["#BFA762", "Preferito"],
  ["#C4453C", "Non disponibile"],
  ["#E8E6E1", "Non specificato"],
];

/* ── Component ── */
export default function DisponibilitaPage() {
  const supabase = createClient();
  const { role, userId, loading: roleLoading } = useRole();

  const [myStaffId, setMyStaffId] = useState<string | null>(null);
  const [myStaffType, setMyStaffType] = useState<string | null>(null);
  const [shiftTypes, setShiftTypes] = useState<ShiftTypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [notes, setNotes] = useState("");

  /* ── Month navigation ── */
  const [monthYear, setMonthYear] = useState(() => {
    const n = new Date();
    const next = new Date(n.getFullYear(), n.getMonth() + 1, 1);
    return { year: next.getFullYear(), month: next.getMonth() + 1 };
  });
  const monthDates = useMemo(() => buildMonthDates(monthYear.year, monthYear.month), [monthYear]);
  const calWeeks = useMemo(() => buildCalendarWeeks(monthYear.year, monthYear.month), [monthYear]);
  const mLabel = useMemo(() => fmtMonth(monthYear.year, monthYear.month), [monthYear]);
  const monthStartIso = `${monthYear.year}-${String(monthYear.month).padStart(2, "0")}-01`;
  const monthEndIso = monthDates[monthDates.length - 1];

  /* ── Grid state ── */
  const [grid, setGrid] = useState<Map<string, AvailStatus>>(new Map());
  const [submitted, setSubmitted] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [editCount, setEditCount] = useState(0);

  /* ── Admin ── */
  const isManager = role === "admin" || role === "manager";
  const [aChiamataStaff, setAChiamataStaff] = useState<{ id: string; name: string }[]>([]);
  const [allSubmissions, setAllSubmissions] = useState<{
    staff_id: string; staff_name: string; submitted_at: string; notes: string;
    slots: { avail_date: string; shift_type_id: string; status: AvailStatus }[];
  }[]>([]);
  const [expandedStaff, setExpandedStaff] = useState<string | null>(null);

  const canSubmit = myStaffType === "a_chiamata";

  /* ── Time window rules ── */
  const oggi = new Date();
  const giorno = oggi.getDate();
  const currentMonthNum = oggi.getMonth() + 1;
  const currentYear = oggi.getFullYear();
  const nextMonth = currentMonthNum === 12 ? 1 : currentMonthNum + 1;
  const nextMonthYear = currentMonthNum === 12 ? currentYear + 1 : currentYear;
  const isViewingSubmittableMonth = monthYear.year === nextMonthYear && monthYear.month === nextMonth;
  const currentMonthLabel = oggi.toLocaleDateString("it-IT", { month: "long" });

  const windowClosed = giorno > 25;
  const editExhausted = submitted && editCount >= 1;
  const isReadOnly = !canSubmit || !isViewingSubmittableMonth || windowClosed || editExhausted;
  const canSave = canSubmit && isViewingSubmittableMonth && !windowClosed && !editExhausted;

  /* ============ DATA ============ */

  useEffect(() => {
    if (roleLoading) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleLoading, monthYear.year, monthYear.month]);

  async function loadData() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const [{ data: profileData }, { data: staffAllData }, { data: stData }] = await Promise.all([
      supabase.from("profiles").select("full_name").eq("id", user.id).single(),
      supabase.from("staff").select("id, name, type, profile_id, active").eq("active", true),
      supabase.from("shift_types").select("*").order("sort"),
    ]);

    const sts = (stData ?? []) as ShiftTypeRow[];
    setShiftTypes(sts);
    const staffAll = (staffAllData ?? []) as { id: string; name: string; type: string; profile_id: string | null }[];
    const fullName = (profileData as { full_name: string | null } | null)?.full_name ?? "";
    const myStaff = staffAll.find(s => s.profile_id === user.id) ?? staffAll.find(s => s.name === fullName) ?? null;
    setMyStaffId(myStaff?.id ?? null);
    setMyStaffType(myStaff?.type ?? null);

    const aChiamata = staffAll.filter(s => s.type === "a_chiamata");
    setAChiamataStaff(aChiamata.map(s => ({ id: s.id, name: s.name })));

    // Load own availability
    if (myStaff && myStaff.type === "a_chiamata") {
      const [{ data: availData }, { data: subData }] = await Promise.all([
        supabase.from("staff_week_availability").select("avail_date, shift_type_id, available, status")
          .eq("staff_id", myStaff.id).gte("avail_date", monthStartIso).lte("avail_date", monthEndIso),
        supabase.from("staff_availability_submissions").select("submitted_at, notes, edit_count")
          .eq("staff_id", myStaff.id).order("submitted_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      const g = new Map<string, AvailStatus>();
      for (const d of monthDates) for (const st of sts) g.set(`${d}|${st.id}`, "unspecified");
      for (const r of (availData ?? []) as { avail_date: string; shift_type_id: string; available: boolean; status?: string }[]) {
        const status = (r.status as AvailStatus) || (r.available ? "available" : "unavailable");
        g.set(`${r.avail_date}|${r.shift_type_id}`, status);
      }
      setGrid(g);
      const hasSlots = (availData ?? []).length > 0;
      setSubmitted(hasSlots);
      setSubmittedAt((subData as { submitted_at: string } | null)?.submitted_at ?? null);
      setNotes((subData as { notes: string } | null)?.notes ?? "");
      setEditCount((subData as { edit_count: number } | null)?.edit_count ?? 0);
    }

    // Admin: load availability via API route (bypasses RLS completely)
    if (isManager) {
      try {
        const res = await fetch(`/api/admin/list-availability?month_start=${monthStartIso}&month_end=${monthEndIso}`);
        const json = await res.json();
        const subs = (json.submissions ?? []) as {
          staff_id: string; staff_name: string; submitted: boolean;
          submitted_at: string | null; notes: string | null; slot_count: number;
          slots: { avail_date: string; shift_type_id: string; available: boolean; status: string }[];
        }[];
        setAllSubmissions(subs.map(s => ({
          staff_id: s.staff_id,
          staff_name: s.staff_name,
          submitted_at: s.submitted_at || "",
          notes: s.notes || "",
          slots: s.slots.map(sl => ({
            avail_date: sl.avail_date,
            shift_type_id: sl.shift_type_id,
            status: (sl.status as AvailStatus) || "unspecified",
          })),
        })));
        setAChiamataStaff(subs.map(s => ({ id: s.staff_id, name: s.staff_name })));
      } catch (e) {
        console.error("[disponibilita admin] fetch error", e);
        setAllSubmissions([]);
      }
    }
    setLoading(false);
  }

  /* ============ GRID ACTIONS ============ */

  const toggleSlot = useCallback((date: string, stId: string) => {
    if (isReadOnly) return;
    setGrid(p => {
      const n = new Map(p);
      const k = `${date}|${stId}`;
      n.set(k, cycleStatus(p.get(k) ?? "unspecified"));
      return n;
    });
  }, [isReadOnly]);

  const toggleDay = useCallback((date: string) => {
    if (isReadOnly) return;
    setGrid(p => {
      const allAvail = shiftTypes.every(st => {
        const s = p.get(`${date}|${st.id}`) ?? "unspecified";
        return s === "available" || s === "preferred";
      });
      const n = new Map(p);
      for (const st of shiftTypes) n.set(`${date}|${st.id}`, allAvail ? "unavailable" : "available");
      return n;
    });
  }, [isReadOnly, shiftTypes]);

  function quickFill(mode: "all" | "weekdays" | "weekends" | "reset") {
    if (isReadOnly) return;
    setGrid(p => {
      const n = new Map(p);
      for (const d of monthDates) {
        const dow = new Date(d + "T00:00:00").getDay();
        const isWe = dow === 0 || dow === 6;
        let s: AvailStatus;
        if (mode === "reset") s = "unspecified";
        else if (mode === "all") s = "available";
        else if (mode === "weekdays") s = isWe ? "unspecified" : "available";
        else s = isWe ? "available" : "unspecified";
        for (const st of shiftTypes) n.set(`${d}|${st.id}`, s);
      }
      return n;
    });
  }

  /* ============ SAVE ============ */

  async function saveMonth() {
    if (!myStaffId || !canSave) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/save-availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staff_id: myStaffId,
          month_start: monthStartIso,
          month_end: monthEndIso,
          notes: notes || null,
          slots: monthDates.flatMap(d => shiftTypes.map(st => {
            const status = grid.get(`${d}|${st.id}`) ?? "unspecified";
            return { avail_date: d, shift_type_id: st.id, available: status === "available" || status === "preferred", status };
          })),
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        setToast(result.error || "Errore nel salvataggio");
        setSaving(false);
        setTimeout(() => setToast(""), 4000);
        return;
      }
      setSubmitted(true);
      setSubmittedAt(new Date().toISOString());
      setEditCount(result.edit_count ?? editCount);
      setSaving(false);
      setToast("Disponibilita mensile inviata!");
      setTimeout(() => setToast(""), 3000);
    } catch {
      setToast("Errore di rete");
      setSaving(false);
      setTimeout(() => setToast(""), 4000);
    }
  }

  /* ============ STATS ============ */

  const stats = useMemo(() => {
    let avail = 0, pref = 0, unavail = 0, unspec = 0;
    for (const d of monthDates) {
      for (const st of shiftTypes) {
        const s = grid.get(`${d}|${st.id}`) ?? "unspecified";
        if (s === "available") avail++;
        else if (s === "preferred") pref++;
        else if (s === "unavailable") unavail++;
        else unspec++;
      }
    }
    const total = monthDates.length * shiftTypes.length;
    return { avail, pref, unavail, unspec, total };
  }, [grid, monthDates, shiftTypes]);

  /* ── Helpers ── */
  const goPrevMonth = () => setMonthYear(p => { const d = new Date(p.year, p.month - 2, 1); return { year: d.getFullYear(), month: d.getMonth() + 1 }; });
  const goNextMonth = () => setMonthYear(p => { const d = new Date(p.year, p.month, 1); return { year: d.getFullYear(), month: d.getMonth() + 1 }; });
  const todayIso = new Date().toISOString().slice(0, 10);

  const getStaffStatus = useCallback((date: string, shiftTypeId: string): AvailStatus => {
    return grid.get(`${date}|${shiftTypeId}`) ?? "unspecified";
  }, [grid]);

  /* ============ RENDER ============ */

  if (roleLoading || loading) return (
    <>
      <div style={{ marginBottom: 24 }}>
        <h1 className="serif" style={{ fontSize: 28, fontWeight: 600 }}>Disponibilita</h1>
      </div>
      <div className="section"><div className="section-body"><div className="empty">Caricamento...</div></div></div>
    </>
  );

  return (
    <>
      {/* ── Page header ── */}
      <div style={{ marginBottom: 24 }}>
        <h1 className="serif" style={{ fontSize: 28, fontWeight: 600, color: "#1F3326" }}>Disponibilita</h1>
        <p style={{ fontSize: 14, color: "#6C6B5D", marginTop: 4 }}>
          {canSubmit ? "Indica quando sei disponibile per il prossimo mese."
            : isManager ? "Panoramica disponibilita staff a chiamata."
            : "Solo lo staff a chiamata puo inserire la disponibilita."}
        </p>
      </div>

      {/* ── Month navigation ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 20,
        marginBottom: 28, padding: "14px 0",
      }}>
        <button onClick={goPrevMonth} style={{
          width: 40, height: 40, borderRadius: 10, border: "1px solid #D8CCB8",
          background: "#fff", cursor: "pointer", fontSize: 18, color: "#1F3326",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all .15s",
        }}
        onMouseEnter={e => { e.currentTarget.style.background = "#F3EBDD"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "#fff"; }}
        >&larr;</button>
        <span className="serif" style={{
          fontSize: 22, fontWeight: 600, color: "#1F3326",
          minWidth: 220, textAlign: "center", letterSpacing: "0.02em",
        }}>{mLabel}</span>
        <button onClick={goNextMonth} style={{
          width: 40, height: 40, borderRadius: 10, border: "1px solid #D8CCB8",
          background: "#fff", cursor: "pointer", fontSize: 18, color: "#1F3326",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all .15s",
        }}
        onMouseEnter={e => { e.currentTarget.style.background = "#F3EBDD"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "#fff"; }}
        >&rarr;</button>
      </div>

      {/* ══════════ MY AVAILABILITY ══════════ */}
      {canSubmit && (
        <div className="section" style={{
          borderLeft: submitted ? "4px solid #2D5A3D" : "4px solid #BFA762",
          borderRadius: 12,
        }}>
          <div className="section-head" style={{ flexWrap: "wrap", gap: 12 }}>
            <h2 style={{ fontSize: 18 }}>Le mie disponibilita &middot; {mLabel}</h2>
            {submitted && (
              <span style={{
                fontSize: 12, fontWeight: 700, color: "#2D5A3D",
                background: "rgba(45,90,61,0.1)", padding: "5px 14px", borderRadius: 20,
              }}>
                Inviata il {submittedAt ? new Date(submittedAt).toLocaleDateString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}
              </span>
            )}
          </div>
          <div className="section-body" style={{ padding: 0 }}>

            {/* ── Submission window banners ── */}
            {isViewingSubmittableMonth && windowClosed && (
              <div style={{
                margin: "16px 24px 0", padding: "12px 16px", borderRadius: 8,
                background: "#FDF2F2", borderLeft: "3px solid #C4453C",
                fontSize: 14, color: "#1F3326", fontFamily: "'Albert Sans', sans-serif",
              }}>
                Le disponibilita per {mLabel} sono chiuse dal 25 {currentMonthLabel}.
                {!submitted && <span style={{ fontWeight: 700, color: "#C4453C", marginLeft: 8 }}>Non inviata — scaduta</span>}
              </div>
            )}
            {isViewingSubmittableMonth && !windowClosed && editExhausted && (
              <div style={{
                margin: "16px 24px 0", padding: "12px 16px", borderRadius: 8,
                background: "#FDF2F2", borderLeft: "3px solid #C4453C",
                fontSize: 14, color: "#1F3326", fontFamily: "'Albert Sans', sans-serif",
              }}>
                Hai esaurito la modifica disponibile. Contatta l&apos;amministratore per ulteriori cambiamenti.
              </div>
            )}
            {isViewingSubmittableMonth && !windowClosed && submitted && !editExhausted && (
              <div style={{
                margin: "16px 24px 0", padding: "12px 16px", borderRadius: 8,
                background: "#F3EBDD", borderLeft: "3px solid #BFA762",
                fontSize: 14, color: "#1F3326", fontFamily: "'Albert Sans', sans-serif",
              }}>
                Puoi ancora modificare 1 volta entro il 25 {currentMonthLabel}.
              </div>
            )}

            {/* Legend */}
            <div style={{
              display: "flex", gap: 16, padding: "16px 24px", flexWrap: "wrap",
              alignItems: "center", borderBottom: "1px solid #F0EDE8",
            }}>
              {LEGEND_COLORS.map(([color, label]) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                  <span style={{
                    width: 12, height: 12, borderRadius: "50%",
                    background: color, display: "inline-block", flexShrink: 0,
                  }} />
                  <span style={{ fontWeight: 600, color: "#6C6B5D" }}>{label}</span>
                </div>
              ))}
              {!isReadOnly && <span style={{ fontSize: 11, color: "#9E9A8F", marginLeft: "auto" }}>Clicca per cambiare stato</span>}
            </div>

            {/* Quick-fill */}
            {!isReadOnly && (
              <div style={{
                display: "flex", gap: 8, padding: "12px 24px",
                flexWrap: "wrap", borderBottom: "1px solid #F0EDE8",
              }}>
                {([
                  ["all", "Tutti disponibili"],
                  ["weekdays", "Solo feriali"],
                  ["weekends", "Solo weekend"],
                  ["reset", "Resetta tutto"],
                ] as [string, string][]).map(([m, l]) => (
                  <button key={m} onClick={() => quickFill(m as "all")} style={{
                    padding: "7px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                    border: "1px solid #D8CCB8", background: m === "reset" ? "#FFF5F4" : "#fff",
                    color: m === "reset" ? "#9E3B2E" : "#1F3326", cursor: "pointer",
                    fontFamily: "inherit", transition: "all .15s",
                  }}>{l}</button>
                ))}
              </div>
            )}

            {/* Calendar grid — same component as admin */}
            <div style={{ padding: "16px 24px 8px" }}>
              <AvailabilityCalendar
                calWeeks={calWeeks}
                shiftTypes={shiftTypes}
                todayIso={todayIso}
                getStatus={getStaffStatus}
                readOnly={isReadOnly}
                onToggleSlot={toggleSlot}
                onToggleDay={toggleDay}
              />
            </div>

            {/* Shift types legend */}
            <div style={{ display: "flex", gap: 20, padding: "8px 24px 12px", flexWrap: "wrap" }}>
              {shiftTypes.map((st, idx) => (
                <div key={st.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                  <span style={{ fontSize: 14 }}>{idx === 0 ? "\u2600" : "\u{1F319}"}</span>
                  <span style={{ fontWeight: 700, color: "#1F3326" }}>{st.name.charAt(0).toUpperCase()} = {st.name}</span>
                  <span style={{ color: "#9E9A8F" }}>({st.start_time.slice(0, 5)}&ndash;{st.end_time.slice(0, 5)})</span>
                </div>
              ))}
            </div>

            {/* Summary card */}
            <div style={{
              margin: "0 24px 16px", padding: "14px 20px", borderRadius: 10,
              background: "#F3EBDD", display: "flex", gap: 20, flexWrap: "wrap",
              alignItems: "center",
            }}>
              <div style={{ fontSize: 13, color: "#1F3326" }}>
                <strong style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22 }}>{stats.avail + stats.pref}</strong>
                <span style={{ marginLeft: 4 }}>disponibili</span>
              </div>
              <div style={{ fontSize: 13, color: "#96832E" }}>
                <strong style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22 }}>{stats.pref}</strong>
                <span style={{ marginLeft: 4 }}>preferiti</span>
              </div>
              <div style={{ fontSize: 13, color: "#9E3B2E" }}>
                <strong style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22 }}>{stats.unavail}</strong>
                <span style={{ marginLeft: 4 }}>non disponibili</span>
              </div>
              <div style={{ fontSize: 13, color: "#9E9A8F" }}>
                <strong style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22 }}>{stats.unspec}</strong>
                <span style={{ marginLeft: 4 }}>non indicati</span>
              </div>
              <div style={{ marginLeft: "auto", fontSize: 12, color: "#6C6B5D" }}>
                su {stats.total} slot totali
              </div>
            </div>

            {/* Notes */}
            <div style={{ padding: "0 24px 20px" }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#1F3326" }}>
                Note (opzionale)
              </label>
              <textarea
                value={notes} onChange={e => !isReadOnly && setNotes(e.target.value)}
                placeholder="Es: il 15 sono disponibile solo di mattina, il 20 preferisco non lavorare..."
                rows={3}
                readOnly={isReadOnly}
                style={{
                  width: "100%", padding: "10px 14px", borderRadius: 8,
                  border: "1px solid #D8CCB8", fontSize: 14, fontFamily: "inherit",
                  resize: "vertical", color: "#1F3326",
                  background: isReadOnly ? "#F0EDE8" : "#FAFAF8",
                }}
              />
            </div>

            {/* Submit */}
            <div style={{
              padding: "16px 24px", borderTop: "1px solid #F0EDE8",
              display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 16,
            }}>
              {canSave && submitted && (
                <span style={{ fontSize: 13, color: "#BFA762" }}>Questa sara la tua ultima modifica</span>
              )}
              {isViewingSubmittableMonth && !windowClosed && (
                <button onClick={saveMonth} disabled={saving || !canSave} style={{
                  padding: "12px 32px", borderRadius: 10, fontSize: 15, fontWeight: 700,
                  background: canSave ? "#1F3326" : "#E8E6E1",
                  color: canSave ? "#fff" : "#999",
                  border: "none",
                  cursor: canSave ? "pointer" : "not-allowed",
                  fontFamily: "inherit", transition: "all .15s",
                  opacity: saving ? 0.6 : 1,
                }}>
                  {saving ? "Salvataggio..." : submitted ? "Aggiorna disponibilita" : `Invia disponibilita ${mLabel}`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════ ADMIN: Submission status ══════════ */}
      {isManager && (
        <div className="section" style={{ marginTop: canSubmit ? 24 : 0 }}>
          <div className="section-head" style={{ flexWrap: "wrap", gap: 12 }}>
            <h2 style={{ fontSize: 18 }}>Staff a chiamata &mdash; {mLabel}</h2>
            <span style={{
              fontSize: 13, fontWeight: 700, padding: "5px 14px", borderRadius: 20,
              background: allSubmissions.filter(s => s.slots.length > 0).length === aChiamataStaff.length ? "rgba(45,90,61,0.1)" : "rgba(199,123,74,0.1)",
              color: allSubmissions.filter(s => s.slots.length > 0).length === aChiamataStaff.length ? "#2D5A3D" : "#C77B4A",
            }}>
              {allSubmissions.filter(s => s.slots.length > 0).length}/{aChiamataStaff.length} inviati
            </span>
          </div>
          <div className="section-body">
            {aChiamataStaff.length === 0 ? (
              <div className="empty">Nessuno staff a chiamata configurato.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {aChiamataStaff.map(s => {
                  const raw = allSubmissions.find(x => x.staff_id === s.id);
                  const sub = raw && raw.slots.length > 0 ? raw : null;
                  const isExpanded = expandedStaff === s.id;

                  const getAdminStatus = (date: string, shiftTypeId: string): AvailStatus => {
                    const e = sub?.slots.find(x => x.avail_date === date && x.shift_type_id === shiftTypeId);
                    return (e?.status as AvailStatus) ?? "unspecified";
                  };

                  return (
                    <div key={s.id} style={{
                      borderRadius: 12, background: "#fff",
                      border: "1px solid #EEEBE5",
                      borderLeft: `4px solid ${sub ? "#2D5A3D" : "#C77B4A"}`,
                      overflow: "hidden",
                    }}>
                      {/* Header row */}
                      <div
                        onClick={() => sub && setExpandedStaff(isExpanded ? null : s.id)}
                        style={{
                          display: "flex", alignItems: "center", gap: 12,
                          padding: "14px 18px", cursor: sub ? "pointer" : "default",
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 15, color: "#1F3326" }}>{s.name}</div>
                          {sub ? (
                            <div style={{ fontSize: 12, color: "#6C6B5D", marginTop: 2 }}>
                              {sub.submitted_at ? (
                                <>Inviata il {new Date(sub.submitted_at).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}</>
                              ) : (
                                <>Inviata</>
                              )}
                              {" \u00b7 "}{sub.slots.filter(x => x.status === "available" || x.status === "preferred").length} slot disponibili
                              {sub.notes && <span> &middot; <em>&quot;{sub.notes.slice(0, 50)}{sub.notes.length > 50 ? "..." : ""}&quot;</em></span>}
                            </div>
                          ) : (
                            <div style={{ fontSize: 12, color: "#C77B4A", fontWeight: 600, marginTop: 2 }}>Non ancora inviata</div>
                          )}
                        </div>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: "5px 14px", borderRadius: 20,
                          background: sub ? "rgba(45,90,61,0.1)" : "rgba(199,123,74,0.1)",
                          color: sub ? "#2D5A3D" : "#C77B4A",
                        }}>{sub ? "Inviata" : "In attesa"}</span>
                        {sub && (
                          <span style={{
                            fontSize: 16, color: "#9E9A8F", transition: "transform .2s",
                            transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                          }}>&darr;</span>
                        )}
                      </div>

                      {/* Expanded calendar */}
                      {sub && isExpanded && (
                        <div style={{
                          padding: "0 18px 18px", borderTop: "1px solid #F0EDE8",
                        }}>
                          {/* Legend */}
                          <div style={{
                            display: "flex", gap: 16, padding: "14px 0 10px", flexWrap: "wrap",
                            alignItems: "center",
                          }}>
                            {LEGEND_COLORS.map(([color, label]) => (
                              <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                                <span style={{
                                  width: 10, height: 10, borderRadius: "50%",
                                  background: color, display: "inline-block", flexShrink: 0,
                                }} />
                                <span style={{ color: "#6C6B5D", fontWeight: 500 }}>{label}</span>
                              </div>
                            ))}
                          </div>

                          {/* Calendar grid — same shared component */}
                          <AvailabilityCalendar
                            calWeeks={calWeeks}
                            shiftTypes={shiftTypes}
                            todayIso={todayIso}
                            getStatus={getAdminStatus}
                            readOnly={true}
                          />

                          {sub.notes && (
                            <div style={{
                              marginTop: 12, padding: "10px 14px", borderRadius: 8,
                              background: "#FAF9F5", fontSize: 13, color: "#6C6B5D",
                              fontStyle: "italic", border: "1px solid #EEEBE5",
                            }}>
                              {sub.notes}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Not applicable */}
      {!canSubmit && !isManager && (
        <div className="section"><div className="section-body"><div className="empty">
          <div className="serif" style={{ fontSize: 18, marginBottom: 6 }}>Non applicabile</div>
          <div>Solo lo staff con contratto &ldquo;a chiamata&rdquo; puo inserire la propria disponibilita.</div>
        </div></div></div>
      )}

      {toast && <div className="toast show">{toast}</div>}

      {/* ── Scoped styles ── */}
      <style>{`
        .avail-cal-cell:hover {
          box-shadow: 0 2px 10px rgba(0,0,0,0.08);
        }
        .avail-cal-cell button:hover {
          transform: scale(1.08);
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        }
        @media (max-width: 768px) {
          .avail-cal-grid { min-width: 400px !important; }
          .avail-cal-cell { min-height: 60px !important; padding: 4px !important; }
          .avail-cal-cell .serif { font-size: 13px !important; }
          .avail-cal-cell button, .avail-cal-cell div[style*="height: 28px"] {
            height: 22px !important; font-size: 10px !important;
          }
        }
      `}</style>
    </>
  );
}
