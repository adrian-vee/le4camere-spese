"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRole } from "@/lib/useRole";
import { WEEKDAYS, type ShiftTypeRow } from "@/lib/turni";

type WeekSlot = { date: string; weekday: number; label: string };

function mondayOf(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const m = new Date(d);
  m.setDate(d.getDate() + diff);
  m.setHours(0, 0, 0, 0);
  return m;
}

function buildWeek(monday: Date): WeekSlot[] {
  const slots: WeekSlot[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    slots.push({
      date: d.toISOString().slice(0, 10),
      weekday: i + 1,
      label: d.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" }),
    });
  }
  return slots;
}

function fmtWeekRange(monday: Date): string {
  const sun = new Date(monday);
  sun.setDate(monday.getDate() + 6);
  const fmtD = (d: Date) => d.toLocaleDateString("it-IT", { day: "numeric", month: "long" });
  return `${fmtD(monday)} — ${fmtD(sun)}`;
}

export default function DisponibilitaPage() {
  const supabase = createClient();
  const { role, userId, loading: roleLoading } = useRole();

  const [myStaffId, setMyStaffId] = useState<string | null>(null);
  const [myStaffType, setMyStaffType] = useState<string | null>(null);
  const [shiftTypes, setShiftTypes] = useState<ShiftTypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  // Week navigation: default to next week
  const [weekOffset, setWeekOffset] = useState(1);
  const monday = useMemo(() => {
    const m = mondayOf(new Date());
    m.setDate(m.getDate() + weekOffset * 7);
    return m;
  }, [weekOffset]);
  const week = useMemo(() => buildWeek(monday), [monday]);
  const weekStart = week[0].date;

  // Availability grid: key = "date|shiftTypeId", value = boolean (available)
  const [grid, setGrid] = useState<Map<string, boolean>>(new Map());
  const [submitted, setSubmitted] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);

  // Admin view: all submissions for this week
  const isManager = role === "admin" || role === "manager";
  const [allSubmissions, setAllSubmissions] = useState<{
    staff_id: string; staff_name: string; submitted_at: string;
    slots: { avail_date: string; shift_type_id: string; available: boolean }[];
  }[]>([]);
  const [aChiamataStaff, setAChiamataStaff] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (roleLoading) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleLoading, weekStart]);

  async function loadData() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const [{ data: profileData }, { data: staffAllData }, { data: stData }] = await Promise.all([
      supabase.from("profiles").select("full_name").eq("id", user.id).single(),
      supabase.from("staff").select("id, name, type, profile_id, active").eq("active", true),
      supabase.from("shift_types").select("*").order("sort"),
    ]);

    setShiftTypes((stData ?? []) as ShiftTypeRow[]);
    const staffAll = (staffAllData ?? []) as { id: string; name: string; type: string; profile_id: string | null; active: boolean }[];

    // Match staff by profile_id or full_name
    const fullName = (profileData as { full_name: string | null } | null)?.full_name ?? "";
    const myStaff = staffAll.find(s => s.profile_id === user.id) ?? staffAll.find(s => s.name === fullName) ?? null;
    setMyStaffId(myStaff?.id ?? null);
    setMyStaffType(myStaff?.type ?? null);

    // Load a_chiamata staff for admin view
    const aChiamata = staffAll.filter(s => s.type === "a_chiamata");
    setAChiamataStaff(aChiamata.map(s => ({ id: s.id, name: s.name })));

    // Load my availability for this week (if staff)
    if (myStaff && myStaff.type === "a_chiamata") {
      const weekEnd = week[6].date;
      const [{ data: availData }, { data: subData }] = await Promise.all([
        supabase.from("staff_week_availability").select("avail_date, shift_type_id, available")
          .eq("staff_id", myStaff.id).gte("avail_date", weekStart).lte("avail_date", weekEnd),
        supabase.from("staff_availability_submissions").select("submitted_at")
          .eq("staff_id", myStaff.id).eq("week_start", weekStart).maybeSingle(),
      ]);

      const newGrid = new Map<string, boolean>();
      // Default: all available
      for (const slot of week) {
        for (const st of (stData ?? []) as ShiftTypeRow[]) {
          newGrid.set(`${slot.date}|${st.id}`, true);
        }
      }
      // Override with saved data
      for (const row of (availData ?? []) as { avail_date: string; shift_type_id: string; available: boolean }[]) {
        newGrid.set(`${row.avail_date}|${row.shift_type_id}`, row.available);
      }
      setGrid(newGrid);
      setSubmitted(!!subData);
      setSubmittedAt((subData as { submitted_at: string } | null)?.submitted_at ?? null);
    }

    // Admin: load all submissions for this week
    if (role === "admin" || role === "manager") {
      const weekEnd = week[6].date;
      const [{ data: subsData }, { data: allAvailData }] = await Promise.all([
        supabase.from("staff_availability_submissions").select("staff_id, submitted_at")
          .eq("week_start", weekStart),
        supabase.from("staff_week_availability").select("staff_id, avail_date, shift_type_id, available")
          .gte("avail_date", weekStart).lte("avail_date", weekEnd)
          .in("staff_id", aChiamata.map(s => s.id)),
      ]);

      const subs = (subsData ?? []) as { staff_id: string; submitted_at: string }[];
      const allAvail = (allAvailData ?? []) as { staff_id: string; avail_date: string; shift_type_id: string; available: boolean }[];

      const submissions = aChiamata
        .filter(s => subs.some(sub => sub.staff_id === s.id))
        .map(s => ({
          staff_id: s.id,
          staff_name: s.name,
          submitted_at: subs.find(sub => sub.staff_id === s.id)!.submitted_at,
          slots: allAvail.filter(a => a.staff_id === s.id),
        }));
      setAllSubmissions(submissions);
    }

    setLoading(false);
  }

  function toggleSlot(date: string, shiftTypeId: string) {
    const key = `${date}|${shiftTypeId}`;
    setGrid(prev => {
      const next = new Map(prev);
      next.set(key, !prev.get(key));
      return next;
    });
  }

  function toggleDay(date: string) {
    const allOn = shiftTypes.every(st => grid.get(`${date}|${st.id}`) !== false);
    setGrid(prev => {
      const next = new Map(prev);
      for (const st of shiftTypes) {
        next.set(`${date}|${st.id}`, !allOn);
      }
      return next;
    });
  }

  function selectAll(value: boolean) {
    setGrid(prev => {
      const next = new Map(prev);
      for (const slot of week) {
        for (const st of shiftTypes) {
          next.set(`${slot.date}|${st.id}`, value);
        }
      }
      return next;
    });
  }

  async function saveAvailability() {
    if (!myStaffId) return;
    setSaving(true);

    const weekEnd = week[6].date;

    // Delete existing entries for this week
    await supabase.from("staff_week_availability")
      .delete()
      .eq("staff_id", myStaffId)
      .gte("avail_date", weekStart)
      .lte("avail_date", weekEnd);

    // Insert all slots
    const rows: { staff_id: string; avail_date: string; shift_type_id: string; available: boolean }[] = [];
    for (const slot of week) {
      for (const st of shiftTypes) {
        const key = `${slot.date}|${st.id}`;
        rows.push({
          staff_id: myStaffId,
          avail_date: slot.date,
          shift_type_id: st.id,
          available: grid.get(key) ?? true,
        });
      }
    }
    await supabase.from("staff_week_availability").insert(rows);

    // Upsert submission record
    await supabase.from("staff_availability_submissions")
      .upsert({ staff_id: myStaffId, week_start: weekStart, submitted_at: new Date().toISOString() }, { onConflict: "staff_id,week_start" });

    setSubmitted(true);
    setSubmittedAt(new Date().toISOString());
    setSaving(false);
    setToast("Disponibilità salvata!");
    setTimeout(() => setToast(""), 3000);
  }

  const availCount = useMemo(() => {
    let count = 0;
    for (const [, v] of grid) if (v) count++;
    return count;
  }, [grid]);
  const totalSlots = week.length * shiftTypes.length;

  if (roleLoading || loading) {
    return (
      <>
        <div style={{ marginBottom: 24 }}>
          <h1 className="serif" style={{ fontSize: 24, fontWeight: 500 }}>Disponibilità</h1>
        </div>
        <div className="section"><div className="section-body"><div className="empty">Caricamento…</div></div></div>
      </>
    );
  }

  const canSubmit = myStaffType === "a_chiamata";

  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <h1 className="serif" style={{ fontSize: 24, fontWeight: 500 }}>Disponibilità</h1>
        <p className="muted" style={{ fontSize: 14 }}>
          {canSubmit
            ? "Indica quando sei disponibile per la settimana selezionata."
            : isManager
            ? "Panoramica disponibilità staff a chiamata."
            : "Solo lo staff a chiamata può inserire disponibilità."}
        </p>
      </div>

      {/* Week navigation */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <button className="btn-ghost" style={{ padding: "8px 14px", borderRadius: 8, fontSize: 13 }}
          onClick={() => setWeekOffset(w => w - 1)}>
          ← Settimana prec.
        </button>
        <div style={{ fontWeight: 700, fontSize: 15, flex: 1, textAlign: "center", minWidth: 200 }}>
          {fmtWeekRange(monday)}
          {weekOffset === 0 && <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>(questa settimana)</span>}
          {weekOffset === 1 && <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>(prossima settimana)</span>}
        </div>
        <button className="btn-ghost" style={{ padding: "8px 14px", borderRadius: 8, fontSize: 13 }}
          onClick={() => setWeekOffset(w => w + 1)}>
          Settimana succ. →
        </button>
      </div>

      {/* ── Staff submission form ── */}
      {canSubmit && (
        <div className="section" style={{ borderLeft: submitted ? "3px solid #2D5A3D" : "3px solid #BFA762" }}>
          <div className="section-head">
            <h2>La mia disponibilità</h2>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {submitted && (
                <span style={{
                  fontSize: 12, fontWeight: 700, color: "#2D5A3D",
                  background: "rgba(45,90,61,0.1)", padding: "4px 12px", borderRadius: 20,
                }}>
                  Inviata {submittedAt ? new Date(submittedAt).toLocaleDateString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}
                </span>
              )}
              <span className="muted" style={{ fontSize: 12 }}>
                {availCount}/{totalSlots} slot disponibili
              </span>
            </div>
          </div>
          <div className="section-body">
            {/* Quick actions */}
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <button className="btn-ghost" style={{ padding: "6px 14px", borderRadius: 8, fontSize: 12 }}
                onClick={() => selectAll(true)}>Seleziona tutto</button>
              <button className="btn-ghost" style={{ padding: "6px 14px", borderRadius: 8, fontSize: 12 }}
                onClick={() => selectAll(false)}>Deseleziona tutto</button>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table className="tbl" style={{ fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ padding: "10px 12px", minWidth: 120 }}>Fascia</th>
                    {week.map(slot => (
                      <th key={slot.date} style={{ textAlign: "center", padding: "10px 6px", minWidth: 70 }}>
                        <div style={{ fontSize: 12, fontWeight: 700 }}>{WEEKDAYS[slot.weekday - 1]}</div>
                        <div style={{ fontSize: 11, color: "var(--ink-soft)", fontWeight: 400 }}>
                          {new Date(slot.date + "T00:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shiftTypes.map(st => (
                    <tr key={st.id}>
                      <td style={{ fontWeight: 600, fontSize: 12.5, whiteSpace: "nowrap" }}>
                        <span style={{
                          display: "inline-block", width: 8, height: 8, borderRadius: "50%",
                          background: st.color, marginRight: 6, verticalAlign: "middle",
                        }} />
                        {st.name}
                        <div className="muted" style={{ fontSize: 11, fontWeight: 400 }}>
                          {st.start_time.slice(0, 5)}–{st.end_time.slice(0, 5)}
                        </div>
                      </td>
                      {week.map(slot => {
                        const key = `${slot.date}|${st.id}`;
                        const available = grid.get(key) !== false;
                        return (
                          <td key={slot.date} style={{ textAlign: "center", padding: 6 }}>
                            <button type="button"
                              className={`avail-cell${available ? " on" : ""}`}
                              onClick={() => toggleSlot(slot.date, st.id)}
                              style={{ width: 36, height: 36 }}>
                              {available && (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M20 6L9 17l-5-5" />
                                </svg>
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {/* Day toggle row */}
                  <tr>
                    <td style={{ fontSize: 11, color: "var(--ink-soft)", fontWeight: 600 }}>Tutto il giorno</td>
                    {week.map(slot => {
                      const allOn = shiftTypes.every(st => grid.get(`${slot.date}|${st.id}`) !== false);
                      return (
                        <td key={slot.date} style={{ textAlign: "center", padding: 6 }}>
                          <button type="button"
                            className={`avail-cell${allOn ? " on" : ""}`}
                            style={{ width: 36, height: 36, opacity: 0.7 }}
                            onClick={() => toggleDay(slot.date)}>
                            {allOn && (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20 6L9 17l-5-5" />
                              </svg>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button className="btn btn-primary" style={{ padding: "12px 28px", fontSize: 14 }}
                onClick={saveAvailability} disabled={saving}>
                {saving ? "Salvataggio…" : submitted ? "Aggiorna disponibilità" : "Invia disponibilità"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Admin/Manager view: all submissions ── */}
      {isManager && (
        <div className="section">
          <div className="section-head">
            <h2>Stato invio — Staff a chiamata</h2>
            <span className="muted" style={{ fontSize: 13 }}>
              {allSubmissions.length}/{aChiamataStaff.length} hanno inviato
            </span>
          </div>
          <div className="section-body">
            {aChiamataStaff.length === 0 ? (
              <div className="empty">Nessuno staff a chiamata configurato.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {aChiamataStaff.map(staff => {
                  const sub = allSubmissions.find(s => s.staff_id === staff.id);
                  const hasSubmitted = !!sub;
                  return (
                    <div key={staff.id} style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "12px 16px", borderRadius: 10,
                      background: "var(--surface)", border: "1px solid var(--line)",
                      borderLeft: `3px solid ${hasSubmitted ? "#2D5A3D" : "#C77B4A"}`,
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{staff.name}</div>
                        {hasSubmitted ? (
                          <div className="muted" style={{ fontSize: 12 }}>
                            Inviata il {new Date(sub.submitted_at).toLocaleDateString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                            {" · "}{sub.slots.filter(s => s.available).length} slot disponibili
                          </div>
                        ) : (
                          <div style={{ fontSize: 12, color: "#C77B4A", fontWeight: 600 }}>Non ancora inviata</div>
                        )}
                      </div>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 20,
                        background: hasSubmitted ? "rgba(45,90,61,0.1)" : "rgba(199,123,74,0.1)",
                        color: hasSubmitted ? "#2D5A3D" : "#C77B4A",
                      }}>
                        {hasSubmitted ? "Inviata" : "In attesa"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Admin: detailed availability grid per staff ── */}
      {isManager && allSubmissions.length > 0 && (
        <div className="section">
          <div className="section-head">
            <h2>Dettaglio disponibilità</h2>
          </div>
          <div className="section-body">
            {allSubmissions.map(sub => (
              <div key={sub.staff_id} style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{sub.staff_name}</h3>
                <div style={{ overflowX: "auto" }}>
                  <table className="tbl" style={{ fontSize: 12.5 }}>
                    <thead>
                      <tr>
                        <th style={{ padding: "8px 10px" }}>Fascia</th>
                        {week.map(slot => (
                          <th key={slot.date} style={{ textAlign: "center", padding: "8px 6px", minWidth: 56 }}>
                            <div style={{ fontSize: 11, fontWeight: 700 }}>{WEEKDAYS[slot.weekday - 1]}</div>
                            <div style={{ fontSize: 10, color: "var(--ink-soft)" }}>
                              {new Date(slot.date + "T00:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {shiftTypes.map(st => (
                        <tr key={st.id}>
                          <td style={{ fontWeight: 600, fontSize: 12, whiteSpace: "nowrap" }}>
                            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: st.color, marginRight: 6, verticalAlign: "middle" }} />
                            {st.name}
                          </td>
                          {week.map(slot => {
                            const entry = sub.slots.find(s => s.avail_date === slot.date && s.shift_type_id === st.id);
                            const available = entry ? entry.available : false;
                            return (
                              <td key={slot.date} style={{ textAlign: "center", padding: 6 }}>
                                <span style={{
                                  display: "inline-flex", width: 28, height: 28, alignItems: "center", justifyContent: "center",
                                  borderRadius: 6, fontSize: 14,
                                  background: available ? "rgba(45,90,61,0.12)" : "rgba(158,59,46,0.08)",
                                  color: available ? "#2D5A3D" : "#9E3B2E",
                                }}>
                                  {available ? "✓" : "✗"}
                                </span>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Not a chiamata message ── */}
      {!canSubmit && !isManager && (
        <div className="section">
          <div className="section-body">
            <div className="empty">
              <div className="serif" style={{ fontSize: 18, marginBottom: 6 }}>Non applicabile</div>
              <div>Solo lo staff con contratto "a chiamata" può inserire la propria disponibilità settimanale.</div>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="toast show">{toast}</div>
      )}
    </>
  );
}
