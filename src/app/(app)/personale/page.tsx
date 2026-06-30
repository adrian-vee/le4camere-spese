"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { WEEKDAYS, fmtDayShort, type StaffRow, type ShiftTypeRow, type AvailabilityRow, type AbsenceRow, type LeaveRow } from "@/lib/turni";
import { useRouter } from "next/navigation";
import { fmtDate, isoToday } from "@/lib/format";
import DatePickerIT from "@/components/ui/DatePickerIT";
import { useRole } from "@/lib/useRole";

type StaffDoc = {
  id: string; staff_id: string; doc_type: string; title: string;
  file_path: string | null; expiry_date: string | null; notes: string | null;
  created_at: string;
};

const WEEKDAYS_SHORT = ["L", "M", "M", "G", "V", "S", "D"];

const EMPTY: Omit<StaffRow, "id"> = {
  name: "", type: "dipendente", hours_per_week: 40, days_per_week: 5, role: "", active: true, notes: "", profile_id: null,
};

type ProfileBarPin = { id: string; bar_pin: string | null };

const DOC_CHECKLIST = ["Contratto", "Documento identità", "HACCP", "Visita medica", "Formazione sicurezza"];

const ABSENCE_TYPES = [
  { value: "ferie", label: "Ferie" },
  { value: "malattia", label: "Malattia" },
  { value: "permesso", label: "Permesso" },
] as const;

type PeriodFilter = "month" | "prev_month" | "year" | "all";
type TypeFilter = "" | "ferie" | "malattia" | "permesso";
type AbsView = "dettaglio" | "riepilogo";

function getPeriodRange(filter: PeriodFilter): { start: string; end: string } | null {
  const now = new Date();
  if (filter === "month") {
    const y = now.getFullYear(), m = now.getMonth();
    const last = new Date(y, m + 1, 0).getDate();
    return { start: `${y}-${String(m + 1).padStart(2, "0")}-01`, end: `${y}-${String(m + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}` };
  }
  if (filter === "prev_month") {
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const y = prev.getFullYear(), m = prev.getMonth();
    const last = new Date(y, m + 1, 0).getDate();
    return { start: `${y}-${String(m + 1).padStart(2, "0")}-01`, end: `${y}-${String(m + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}` };
  }
  if (filter === "year") {
    const y = now.getFullYear();
    return { start: `${y}-01-01`, end: `${y}-12-31` };
  }
  return null;
}

const PER_PAGE = 10;

export default function PersonalePage() {
  const supabase = createClient();
  const router = useRouter();
  const { role, isManager, loading: roleLoading, userId } = useRole();

  useEffect(() => {
    if (!roleLoading && !isManager) router.replace("/");
  }, [roleLoading, isManager, router]);

  const [list, setList] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [form, setForm] = useState<Omit<StaffRow, "id">>(EMPTY);
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  const [shiftTypes, setShiftTypes] = useState<ShiftTypeRow[]>([]);
  const [unavailKeys, setUnavailKeys] = useState<Set<string>>(new Set());
  const [absences, setAbsences] = useState<AbsenceRow[]>([]);
  const [absForm, setAbsForm] = useState({ staff_id: "", type: "ferie" as AbsenceRow["type"], absent_date: "", end_date: "", notes: "" });
  const [leaves, setLeaves] = useState<LeaveRow[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [barPin, setBarPin] = useState("");

  const DOC_TYPES = ["Contratto", "Documento identità", "Codice fiscale", "Permesso soggiorno", "Certificazione", "Attestato sicurezza", "HACCP", "Visita medica", "Formazione sicurezza", "UNILAV", "Busta paga", "Altro"];
  const [staffDocs, setStaffDocs] = useState<StaffDoc[]>([]);
  const [docForm, setDocForm] = useState({ doc_type: DOC_TYPES[0], title: "", expiry_date: "", notes: "" });
  const [docFile, setDocFile] = useState<File | null>(null);
  const docFileRef = useRef<HTMLInputElement>(null);

  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("month");
  const [personFilter, setPersonFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("");
  const [absView, setAbsView] = useState<AbsView>("dettaglio");
  const [showAbsForm, setShowAbsForm] = useState(false);
  const [absPage, setAbsPage] = useState(1);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  async function load() {
    setLoading(true);
    const [{ data: staffData }, { data: typesData }, { data: absData }, { data: leavesData }, { data: docsData }] = await Promise.all([
      supabase.from("staff").select("*").order("name"),
      supabase.from("shift_types").select("*").order("sort"),
      supabase.from("absences").select("*").order("absent_date", { ascending: false }),
      supabase.from("staff_leaves").select("*, profiles!staff_leaves_staff_id_fkey(full_name)").order("date", { ascending: false }),
      supabase.from("staff_documents").select("*").order("created_at", { ascending: false }),
    ]);
    console.log("[Personale] absences loaded:", absData?.length ?? 0, absData);
    console.log("[Personale] staff_leaves loaded:", leavesData?.length ?? 0, leavesData);
    setList((staffData ?? []) as StaffRow[]);
    setShiftTypes((typesData ?? []) as ShiftTypeRow[]);
    setAbsences((absData ?? []) as AbsenceRow[]);
    setLeaves((leavesData ?? []).map((l: Record<string, unknown>) => ({ ...l, staff_name: (l.profiles as { full_name?: string } | null)?.full_name || l.staff_name || "Dipendente rimosso" })) as LeaveRow[]);
    setStaffDocs((docsData ?? []) as StaffDoc[]);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  useEffect(() => {
    if (role === "staff" && userId && list.length > 0 && !openFolder) {
      const mine = list.find(s => s.profile_id === userId);
      if (mine) setOpenFolder(mine.id);
    }
  }, [role, userId, list, openFolder]);

  async function loadAvailability(staffId: string) {
    const { data } = await supabase.from("staff_availability").select("*").eq("staff_id", staffId).eq("available", false);
    setUnavailKeys(new Set((data ?? [] as AvailabilityRow[]).map((r: AvailabilityRow) => `${r.weekday}|${r.shift_type_id}`)));
  }

  function openNew() { setEditing(null); setForm(EMPTY); setUnavailKeys(new Set()); setBarPin(""); }
  async function openEdit(s: StaffRow) {
    setEditing(s);
    setForm({ name: s.name, type: s.type, hours_per_week: s.hours_per_week, days_per_week: s.days_per_week, role: s.role ?? "", active: s.active, notes: s.notes ?? "", profile_id: s.profile_id });
    loadAvailability(s.id);
    if (s.profile_id) {
      const { data } = await supabase.from("profiles").select("bar_pin").eq("id", s.profile_id).single();
      setBarPin((data as ProfileBarPin | null)?.bar_pin ?? "");
    } else setBarPin("");
  }

  function toggleAvail(weekday: number, shiftTypeId: string) {
    const key = `${weekday}|${shiftTypeId}`;
    setUnavailKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function save() {
    if (!form.name.trim()) return alert("Inserisci il nome.");
    const payload = { ...form, name: form.name.trim() };
    let staffId: string;
    if (editing) {
      const { error } = await supabase.from("staff").update(payload).eq("id", editing.id);
      if (error) return alert("Errore aggiornamento: " + error.message);
      staffId = editing.id;
    } else {
      const { data, error } = await supabase.from("staff").insert(payload).select("id").single();
      if (error || !data) return alert("Errore creazione: " + (error?.message ?? "sconosciuto"));
      staffId = data.id;
    }
    const profileId = editing?.profile_id ?? form.profile_id;
    if (profileId && barPin !== undefined) {
      await supabase.from("profiles").update({ bar_pin: barPin || null }).eq("id", profileId);
    }
    const { data: existingAvail } = await supabase.from("staff_availability").select("id").eq("staff_id", staffId);
    const existingIds = (existingAvail ?? []).map((r: { id: string }) => r.id);
    const availRows = Array.from(unavailKeys).map(key => {
      const [wd, stId] = key.split("|");
      return { staff_id: staffId, weekday: Number(wd), shift_type_id: stId, available: false };
    });
    if (availRows.length > 0) {
      const { error: insErr } = await supabase.from("staff_availability").insert(availRows);
      if (insErr) return alert("Errore salvataggio disponibilità: " + insErr.message);
    }
    if (existingIds.length > 0) {
      const { error: delErr } = await supabase.from("staff_availability").delete().in("id", existingIds);
      if (delErr) return alert("Errore aggiornamento disponibilità: " + delErr.message);
    }
    setForm(EMPTY); setEditing(null); setUnavailKeys(new Set()); load();
  }

  async function remove(id: string) {
    if (!confirm("Eliminare questa persona? I turni collegati resteranno come scoperti.")) return;
    const { error } = await supabase.from("staff").delete().eq("id", id);
    if (error) return alert("Errore eliminazione: " + error.message);
    load();
  }

  async function saveAbsence() {
    if (!absForm.staff_id || !absForm.absent_date) return alert("Seleziona persona e data inizio.");
    const staff = list.find(s => s.id === absForm.staff_id);
    const profileId = staff?.profile_id;
    if (!profileId) return alert("Questa persona non ha un profilo utente collegato.");
    const startD = new Date(absForm.absent_date + "T00:00:00");
    const endD = absForm.end_date ? new Date(absForm.end_date + "T00:00:00") : new Date(startD);
    const rows: { staff_id: string; date: string; type: string; period: string; reason: string | null; status: string }[] = [];
    const d = new Date(startD);
    while (d <= endD) {
      const day = d.getDay();
      if (day >= 1 && day <= 5) {
        rows.push({ staff_id: profileId, date: d.toISOString().slice(0, 10), type: absForm.type, period: "giornata_intera", reason: absForm.notes || null, status: "approvato" });
      }
      d.setDate(d.getDate() + 1);
    }
    if (rows.length === 0) return alert("Nessun giorno lavorativo nel periodo selezionato.");
    const { error } = await supabase.from("staff_leaves").insert(rows);
    if (error) return alert("Errore: " + error.message);
    setAbsForm({ staff_id: "", type: "ferie", absent_date: "", end_date: "", notes: "" });
    setShowAbsForm(false); load();
  }

  async function removeAbsence(ids: string[]) {
    if (!confirm("Eliminare questa assenza?")) return;
    const { error } = await supabase.from("staff_leaves").delete().in("id", ids);
    if (error) return alert("Errore eliminazione assenza: " + error.message);
    load();
  }

  async function saveDoc() {
    if (!openFolder) return;
    if (!docForm.title.trim()) return alert("Inserisci il titolo del documento.");
    const { data: { user } } = await supabase.auth.getUser();
    let filePath: string | null = null;
    if (docFile) {
      const ext = docFile.name.split(".").pop()?.toLowerCase() ?? "pdf";
      const path = `personale/${openFolder}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("documenti").upload(path, docFile);
      if (upErr) return alert("Errore upload: " + upErr.message);
      filePath = path;
    }
    const { error } = await supabase.from("staff_documents").insert({
      staff_id: openFolder, doc_type: docForm.doc_type, title: docForm.title.trim(),
      file_path: filePath, expiry_date: docForm.expiry_date || null, notes: docForm.notes || null, uploaded_by: user?.id ?? null,
    });
    if (error) return alert("Errore: " + error.message);
    setDocForm({ doc_type: DOC_TYPES[0], title: "", expiry_date: "", notes: "" });
    setDocFile(null);
    if (docFileRef.current) docFileRef.current.value = "";
    load();
  }

  async function deleteDoc(id: string) {
    if (!confirm("Eliminare questo documento?")) return;
    const doc = staffDocs.find(d => d.id === id);
    if (doc?.file_path) await supabase.storage.from("documenti").remove([doc.file_path]);
    const { error } = await supabase.from("staff_documents").delete().eq("id", id);
    if (error) return alert("Errore eliminazione documento: " + error.message);
    load();
  }

  function handlePeriodChange(p: PeriodFilter) {
    setPeriodFilter(p);
    setAbsPage(1);
    if (p === "year") setAbsView("riepilogo");
    else setAbsView("dettaglio");
  }

  function drillDown(profileId: string, type: TypeFilter) {
    const staffId = list.find(s => s.profile_id === profileId)?.id || "";
    setPersonFilter(staffId);
    setTypeFilter(type);
    setAbsView("dettaglio");
    setAbsPage(1);
  }

  /* ── Computed ── */
  const activeCount = list.filter(s => s.active).length;
  const dipCount = list.filter(s => s.type === "dipendente").length;
  const callCount = list.filter(s => s.type === "a_chiamata").length;

  const activeLeaves = leaves.filter(l => l.status !== "rifiutato");

  const curMonthRange = getPeriodRange("month");
  const absThisMonth = curMonthRange
    ? activeLeaves.filter(l => l.date >= curMonthRange.start && l.date <= curMonthRange.end).length
    : 0;

  const periodRange = getPeriodRange(periodFilter);
  const filterProfileId = personFilter ? (list.find(s => s.id === personFilter)?.profile_id || "") : "";
  const filteredLeaves = activeLeaves.filter(l => {
    if (periodRange && (l.date > periodRange.end || l.date < periodRange.start)) return false;
    if (filterProfileId && l.staff_id !== filterProfileId) return false;
    if (typeFilter && l.type !== typeFilter) return false;
    return true;
  });

  const groupedLeaves = (() => {
    const sorted = [...filteredLeaves].sort((a, b) => {
      if (a.staff_id !== b.staff_id) return a.staff_id.localeCompare(b.staff_id);
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      return a.date.localeCompare(b.date);
    });
    const groups: { staffName: string; staffProfileId: string; type: string; startDate: string; endDate: string; days: number; reason: string; ids: string[] }[] = [];
    let cur: (typeof groups)[number] | null = null;
    for (const l of sorted) {
      let extend = false;
      if (cur && cur.staffProfileId === l.staff_id && cur.type === l.type) {
        const diffMs = new Date(l.date + "T00:00:00").getTime() - new Date(cur.endDate + "T00:00:00").getTime();
        extend = diffMs / 86400000 <= 3;
      }
      if (extend && cur) {
        cur.endDate = l.date;
        cur.days++;
        cur.ids.push(l.id);
        if (l.reason && !cur.reason) cur.reason = l.reason;
      } else {
        cur = { staffName: l.staff_name, staffProfileId: l.staff_id, type: l.type, startDate: l.date, endDate: l.date, days: 1, reason: l.reason || "", ids: [l.id] };
        groups.push(cur);
      }
    }
    return groups;
  })();

  const sortedGroups = [...groupedLeaves].sort((a, b) => b.startDate.localeCompare(a.startDate));
  const totalPages = Math.ceil(sortedGroups.length / PER_PAGE);
  const pagedGroups = sortedGroups.slice((absPage - 1) * PER_PAGE, absPage * PER_PAGE);

  const summaryData = (() => {
    const byStaff: Record<string, { name: string; ferie: number; malattia: number; permesso: number; altro: number }> = {};
    for (const l of filteredLeaves) {
      if (!byStaff[l.staff_id]) byStaff[l.staff_id] = { name: l.staff_name, ferie: 0, malattia: 0, permesso: 0, altro: 0 };
      const t = l.type as keyof typeof byStaff[string];
      if (t in byStaff[l.staff_id] && t !== "name") (byStaff[l.staff_id][t] as number)++;
      else byStaff[l.staff_id].altro++;
    }
    return Object.entries(byStaff).sort((a, b) => a[1].name.localeCompare(b[1].name));
  })();

  const todayStr = isoToday();
  const expiringDocs = staffDocs.filter(d => d.expiry_date && d.expiry_date <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
  const isStaffOnly = role === "staff";
  const folderList = isStaffOnly ? list.filter(s => s.profile_id === userId) : list.filter(s => s.active);
  const openStaff = list.find(s => s.id === openFolder);
  const folderDocs = staffDocs.filter(d => d.staff_id === openFolder);
  const folderDocTypes = new Set(folderDocs.map(d => d.doc_type));

  function openFolderFor(staffId: string) {
    setOpenFolder(staffId);
    setDocForm({ doc_type: DOC_TYPES[0], title: "", expiry_date: "", notes: "" });
    setDocFile(null);
    if (docFileRef.current) docFileRef.current.value = "";
  }

  const curYear = new Date().getFullYear();

  if (roleLoading || !isManager) {
    return <div style={{ padding: 40, textAlign: "center", color: "#6C6B5D", fontFamily: "'Albert Sans', sans-serif" }}>Caricamento...</div>;
  }

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      {/* ── HEADER ── */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 500, color: "#1F3326", margin: 0 }}>Personale</h1>
        <p style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 14, color: "#888", marginTop: 4, marginBottom: 0 }}>Gestione team e assenze</p>
      </div>

      {/* ── KPI CARDS ── */}
      <div className="pers-kpi-grid">
        <div className="pers-kpi-card">
          <div className="pers-kpi-top">
            <div className="pers-kpi-icon" style={{ background: "rgba(45,90,61,.1)" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2D5A3D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
            </div>
          </div>
          <div className="pers-kpi-val">{activeCount}</div>
          <div className="pers-kpi-label">Team attivo</div>
        </div>

        <div className="pers-kpi-card" style={{ borderTop: "3px solid #1F3326" }}>
          <div className="pers-kpi-top">
            <div className="pers-kpi-icon" style={{ background: "rgba(31,51,38,.08)" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1F3326" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4-4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
          </div>
          <div className="pers-kpi-val">{dipCount}</div>
          <div className="pers-kpi-label">Dipendenti</div>
        </div>

        <div className="pers-kpi-card" style={{ borderTop: "3px solid #BFA762" }}>
          <div className="pers-kpi-top">
            <div className="pers-kpi-icon" style={{ background: "rgba(191,167,98,.12)" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#BFA762" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
            </div>
          </div>
          <div className="pers-kpi-val">{callCount}</div>
          <div className="pers-kpi-label">A chiamata</div>
        </div>

        <div className="pers-kpi-card" style={{ borderTop: absThisMonth > 0 ? "3px solid #C4453C" : "3px solid #D8CCB8" }}>
          <div className="pers-kpi-top">
            <div className="pers-kpi-icon" style={{ background: absThisMonth > 0 ? "rgba(196,69,60,.1)" : "rgba(108,107,93,.08)" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={absThisMonth > 0 ? "#C4453C" : "#6C6B5D"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            </div>
          </div>
          <div className="pers-kpi-val" style={{ color: absThisMonth > 0 ? "#C4453C" : "#1F3326" }}>{absThisMonth}</div>
          <div className="pers-kpi-label">Assenze questo mese</div>
        </div>
      </div>

      {/* ── 2-COLUMN LAYOUT: Team + Form ── */}
      {isManager && (
        <div className="pers-main-grid">
          {/* LEFT: Team */}
          <div className="pers-section-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <h2 className="pers-section-title">Team ({list.length})</h2>
                <p className="pers-section-sub">Il tuo staff</p>
              </div>
            </div>
            {loading ? (
              <div className="empty">Caricamento...</div>
            ) : list.length === 0 ? (
              <div className="empty">
                <div className="serif" style={{ fontSize: 18, marginBottom: 6 }}>Nessuna persona</div>
                <div>Aggiungi il primo membro dallo staff dal form a destra.</div>
              </div>
            ) : (
              <div className="pers-team-grid">
                {list.map(s => (
                  <div className="pers-team-card" key={s.id} style={{ opacity: s.active ? 1 : 0.55 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                      <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 16, fontWeight: 600, color: "#1F3326" }}>{s.name}</div>
                      <span style={{
                        padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                        background: s.type === "dipendente" ? "#1F3326" : "#BFA762",
                        color: s.type === "dipendente" ? "#fff" : "#1F3326",
                      }}>
                        {s.type === "dipendente" ? "Dipendente" : "A chiamata"}
                      </span>
                    </div>
                    {s.role && <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 13, color: "#888", marginBottom: 4 }}>{s.role}</div>}
                    <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 13, color: "#888", marginBottom: 14 }}>
                      {s.hours_per_week || "—"}h/sett · {s.days_per_week || "—"} giorni
                      {!s.active && <span style={{ color: "#C4453C", fontWeight: 600 }}> · Non attivo</span>}
                    </div>
                    <div className="pers-card-actions" style={{ justifyContent: "flex-end" }}>
                      <button className="btn-ghost" style={{ padding: "5px 12px", borderRadius: 8, fontSize: 12 }} onClick={() => openEdit(s)}>Modifica</button>
                      <button className="btn-ghost" style={{ padding: "5px 12px", borderRadius: 8, fontSize: 12, color: "#C4453C" }} onClick={() => remove(s.id)}>Elimina</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* RIGHT: Form */}
          <div className="pers-form-card" style={isMobile ? undefined : { position: "sticky", top: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 className="pers-section-title">{editing ? `Modifica: ${editing.name}` : "Aggiungi al team"}</h2>
              {editing && (
                <button className="btn-ghost" style={{ padding: "6px 14px", borderRadius: 9, fontSize: 13 }} onClick={openNew}>+ Nuova</button>
              )}
            </div>

            <div className="grid2">
              <div className="field">
                <label>Nome</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Es. Anna Rossi" />
              </div>
              <div className="field">
                <label>Ruolo (opzionale)</label>
                <input value={form.role ?? ""} onChange={e => setForm({ ...form, role: e.target.value })} placeholder="Reception, pulizie..." />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: "#888", display: "block", marginBottom: 6 }}>Tipo contratto</label>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className={`contract-pill${form.type === "dipendente" ? " active" : ""}`}
                  onClick={() => setForm({ ...form, type: "dipendente" })}>Dipendente</button>
                <button type="button" className={`contract-pill${form.type === "a_chiamata" ? " active" : ""}`}
                  onClick={() => setForm({ ...form, type: "a_chiamata" })}>A chiamata</button>
              </div>
            </div>

            <div className="grid2">
              <div className="field">
                <label>Ore / settimana</label>
                <input type="number" min="0" step="1" value={form.hours_per_week} onChange={e => setForm({ ...form, hours_per_week: Number(e.target.value) })} />
                <span className="muted" style={{ fontSize: 11 }}>0 = nessun limite</span>
              </div>
              <div className="field">
                <label>Giorni / settimana</label>
                <input type="number" min="0" max="7" step="1" value={form.days_per_week} onChange={e => setForm({ ...form, days_per_week: Number(e.target.value) })} />
                <span className="muted" style={{ fontSize: 11 }}>0 = nessun limite</span>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: "#888", display: "block", marginBottom: 8 }}>Stato</label>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button type="button" className={`toggle-switch${form.active ? " on" : ""}`} onClick={() => setForm({ ...form, active: !form.active })} />
                <span style={{ fontSize: 13, fontWeight: 600, fontFamily: "'Albert Sans', sans-serif" }}>
                  {form.active ? "Attivo" : "Non attivo"}
                </span>
              </div>
            </div>

            {(editing?.profile_id || form.profile_id) && (
              <div className="field" style={{ marginBottom: 16 }}>
                <label>PIN Bar (4 cifre)</label>
                <input type="text" inputMode="numeric" maxLength={4} pattern="[0-9]*" value={barPin}
                  onChange={e => setBarPin(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="1234" style={{ maxWidth: 140 }} />
              </div>
            )}

            {shiftTypes.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: "#888", display: "block", marginBottom: 8 }}>Disponibilità settimanale</label>
                <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                  <table className="tbl" style={{ fontSize: 12, minWidth: isMobile ? 0 : undefined }}>
                    <thead>
                      <tr>
                        <th style={{ padding: "6px 4px" }}>{isMobile ? "" : "Fascia"}</th>
                        {(isMobile ? WEEKDAYS_SHORT : WEEKDAYS).map((d, i) => (
                          <th key={i} style={{ textAlign: "center", padding: isMobile ? "6px 2px" : "6px 4px", minWidth: isMobile ? 30 : 36 }}>{d}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {shiftTypes.map(st => (
                        <tr key={st.id}>
                          <td style={{ fontWeight: 600, fontSize: isMobile ? 10 : 11, whiteSpace: "nowrap", padding: isMobile ? "4px 2px" : "4px 4px" }}>
                            {isMobile ? st.name.slice(0, 4) : st.name}
                          </td>
                          {WEEKDAYS.map((_, i) => {
                            const wd = i + 1;
                            const key = `${wd}|${st.id}`;
                            const available = !unavailKeys.has(key);
                            return (
                              <td key={i} style={{ textAlign: "center", padding: isMobile ? 2 : 4 }}>
                                <button type="button" className={`avail-cell${available ? " on" : ""}`} style={{ width: 28, height: 28 }}
                                  onClick={() => toggleAvail(wd, st.id)}>
                                  {available && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <button className="btn btn-primary" style={{ width: "100%", padding: "14px 22px", fontSize: 15, borderRadius: 10 }} onClick={save}>
              {editing ? "Salva modifiche" : "Aggiungi persona"}
            </button>
          </div>
        </div>
      )}

      {/* ── ABSENCES SECTION ── */}
      {isManager && (
        <div className="pers-section-card" style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 className="pers-section-title">Registro Assenze</h2>
            <button className="btn-ghost" style={{ padding: "7px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600 }}
              onClick={() => setShowAbsForm(v => !v)}>
              {showAbsForm ? "Chiudi" : "+ Aggiungi"}
            </button>
          </div>

          {/* Add absence form (expandable) */}
          {showAbsForm && (
            <div style={{ borderBottom: "1px solid #D8CCB8", paddingBottom: 20, marginBottom: 20 }}>
              <div className="grid2">
                <div className="field">
                  <label>Persona</label>
                  <select value={absForm.staff_id} onChange={e => setAbsForm({ ...absForm, staff_id: e.target.value })}>
                    <option value="">Seleziona...</option>
                    {list.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 12.5, fontWeight: 600, color: "#888", display: "block", marginBottom: 6 }}>Tipo</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {ABSENCE_TYPES.map(t => (
                      <button key={t.value} type="button"
                        className={`absence-pill ${t.value}${absForm.type === t.value ? " active" : ""}`}
                        onClick={() => setAbsForm({ ...absForm, type: t.value })}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="grid2">
                <div className="field">
                  <label>Data inizio</label>
                  <DatePickerIT value={absForm.absent_date} onChange={v => setAbsForm({ ...absForm, absent_date: v })} />
                </div>
                <div className="field">
                  <label>Data fine <span className="muted">(vuoto = un giorno)</span></label>
                  <DatePickerIT value={absForm.end_date} onChange={v => setAbsForm({ ...absForm, end_date: v })} />
                </div>
              </div>
              <div className="field">
                <label>Note (opzionale)</label>
                <input value={absForm.notes} onChange={e => setAbsForm({ ...absForm, notes: e.target.value })} placeholder="Es. ferie estive..." />
              </div>
              <button className="btn btn-primary" style={{ borderRadius: 10 }} onClick={saveAbsence}>Aggiungi assenza</button>
            </div>
          )}

          {/* Filter bar */}
          <div className="pers-filter-bar">
            <div className="pers-filter-group">
              {([
                { key: "month" as PeriodFilter, label: "Questo mese" },
                { key: "prev_month" as PeriodFilter, label: "Mese scorso" },
                { key: "year" as PeriodFilter, label: `Anno ${curYear}` },
                { key: "all" as PeriodFilter, label: "Tutto" },
              ]).map(p => (
                <button key={p.key} className={`pers-filter-pill${periodFilter === p.key ? " active" : ""}`}
                  onClick={() => handlePeriodChange(p.key)}>{p.label}</button>
              ))}
            </div>

            <select className="pers-filter-select" value={personFilter}
              onChange={e => { setPersonFilter(e.target.value); setAbsPage(1); }}>
              <option value="">Tutte le persone</option>
              {list.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>

            <div className="pers-filter-group">
              {([
                { key: "" as TypeFilter, label: "Tutti" },
                { key: "ferie" as TypeFilter, label: "Ferie" },
                { key: "malattia" as TypeFilter, label: "Malattia" },
                { key: "permesso" as TypeFilter, label: "Permesso" },
              ]).map(t => (
                <button key={t.key} className={`pers-filter-pill${typeFilter === t.key ? " active" : ""}`}
                  onClick={() => { setTypeFilter(t.key); setAbsPage(1); }}>{t.label}</button>
              ))}
            </div>

            <div className="pers-view-toggle">
              <button className={absView === "dettaglio" ? "active" : ""} onClick={() => setAbsView("dettaglio")}>Dettaglio</button>
              <button className={absView === "riepilogo" ? "active" : ""} onClick={() => setAbsView("riepilogo")}>Riepilogo</button>
            </div>
          </div>

          {/* Detail view */}
          {absView === "dettaglio" && (
            sortedGroups.length === 0 ? (
              <div className="empty" style={{ padding: "32px 0" }}>
                <div className="muted">Nessuna assenza trovata per i filtri selezionati.</div>
              </div>
            ) : (
              <>
                <div style={{ overflowX: "auto" }}>
                  <table className="pers-tbl">
                    <thead>
                      <tr>
                        <th>Persona</th>
                        <th>Tipo</th>
                        <th>Dal</th>
                        <th>Al</th>
                        <th style={{ textAlign: "center" }}>Giorni</th>
                        <th className="hide-sm">Note</th>
                        <th style={{ textAlign: "right" }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedGroups.map((g, i) => (
                        <tr key={g.ids[0] || i}>
                          <td style={{ fontWeight: 600, color: "#1F3326" }}>{g.staffName}</td>
                          <td>
                            <span className={`pers-abs-badge ${g.type}`}>
                              <span className={`pers-abs-dot ${g.type}`} />
                              {ABSENCE_TYPES.find(t => t.value === g.type)?.label ?? g.type}
                            </span>
                          </td>
                          <td>{fmtDayShort(g.startDate)}</td>
                          <td>{g.endDate !== g.startDate ? fmtDayShort(g.endDate) : "—"}</td>
                          <td style={{ textAlign: "center", fontWeight: 700, fontFamily: "'Albert Sans', sans-serif" }}>{g.days}</td>
                          <td className="hide-sm" style={{ color: "#888", fontSize: 13 }}>{g.reason || "—"}</td>
                          <td style={{ textAlign: "right" }}>
                            <button className="btn-ghost" style={{ padding: "5px 10px", borderRadius: 8, fontSize: 12 }}
                              onClick={() => removeAbsence(g.ids)}>Elimina</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {totalPages > 1 && (
                  <div className="pers-pagination">
                    <button disabled={absPage <= 1} onClick={() => setAbsPage(p => p - 1)}>Prec</button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                      <button key={p} className={absPage === p ? "active" : ""} onClick={() => setAbsPage(p)}>{p}</button>
                    ))}
                    <button disabled={absPage >= totalPages} onClick={() => setAbsPage(p => p + 1)}>Succ</button>
                  </div>
                )}
              </>
            )
          )}

          {/* Summary view */}
          {absView === "riepilogo" && (
            summaryData.length === 0 ? (
              <div className="empty" style={{ padding: "32px 0" }}>
                <div className="muted">Nessuna assenza trovata per i filtri selezionati.</div>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="pers-tbl">
                  <thead>
                    <tr>
                      <th>Persona</th>
                      <th style={{ textAlign: "center" }}>Ferie</th>
                      <th style={{ textAlign: "center" }}>Malattia</th>
                      <th style={{ textAlign: "center" }}>Permesso</th>
                      <th style={{ textAlign: "center" }}>Altro</th>
                      <th style={{ textAlign: "center" }}>Totale</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryData.map(([id, s]) => {
                      const total = s.ferie + s.malattia + s.permesso + s.altro;
                      return (
                        <tr key={id}>
                          <td style={{ fontWeight: 600, color: "#1F3326" }}>{s.name}</td>
                          <td style={{ textAlign: "center" }}>
                            {s.ferie ? <button className="pers-summary-val ferie" onClick={() => drillDown(id, "ferie")}>{s.ferie}</button> : "—"}
                          </td>
                          <td style={{ textAlign: "center" }}>
                            {s.malattia ? <button className="pers-summary-val malattia" onClick={() => drillDown(id, "malattia")}>{s.malattia}</button> : "—"}
                          </td>
                          <td style={{ textAlign: "center" }}>
                            {s.permesso ? <button className="pers-summary-val permesso" onClick={() => drillDown(id, "permesso")}>{s.permesso}</button> : "—"}
                          </td>
                          <td style={{ textAlign: "center", fontWeight: 600 }}>{s.altro || "—"}</td>
                          <td style={{ textAlign: "center", fontWeight: 700, fontFamily: "'Albert Sans', sans-serif", fontSize: 15 }}>{total}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      )}

      {/* ── FASCICOLO DIPENDENTE ── */}
      {!openFolder ? (
        <div className="section">
          <div className="section-head">
            <h2>Fascicolo dipendente</h2>
            {expiringDocs.length > 0 && (
              <span className="badge" style={{ background: "#9E3B2E", color: "#FAF9F5" }}>{expiringDocs.length} in scadenza</span>
            )}
          </div>
          <div className="section-body">
            {folderList.length === 0 ? (
              <div className="empty">
                <div className="serif" style={{ fontSize: 18, marginBottom: 6 }}>
                  {isStaffOnly ? "Nessun fascicolo disponibile" : "Nessun dipendente attivo"}
                </div>
                <div>{isStaffOnly ? "Il tuo profilo non è ancora collegato." : "Aggiungi persone per creare i fascicoli."}</div>
              </div>
            ) : (
              <div className="folder-grid">
                {folderList.map(s => {
                  const docs = staffDocs.filter(d => d.staff_id === s.id);
                  const docTypes = new Set(docs.map(d => d.doc_type));
                  const checkCount = DOC_CHECKLIST.filter(c => docTypes.has(c)).length;
                  const hasExpiring = docs.some(d => d.expiry_date && d.expiry_date <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
                  const hasExpired = docs.some(d => d.expiry_date && d.expiry_date < todayStr);
                  return (
                    <button key={s.id} className="folder-card" onClick={() => openFolderFor(s.id)}>
                      <div className="folder-card-top">
                        <svg className="folder-card-icon" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#BFA762" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                        </svg>
                        {hasExpired ? (
                          <span className="badge" style={{ background: "rgba(158,59,46,.1)", color: "#9E3B2E", fontSize: 11 }}>Scaduto</span>
                        ) : hasExpiring ? (
                          <span className="badge" style={{ background: "rgba(199,123,74,.1)", color: "#C77B4A", fontSize: 11 }}>In scadenza</span>
                        ) : checkCount === DOC_CHECKLIST.length ? (
                          <span className="badge" style={{ background: "rgba(45,90,61,.1)", color: "#2D5A3D", fontSize: 11 }}>Completo</span>
                        ) : null}
                      </div>
                      <div className="folder-card-name">{s.name}</div>
                      <div className="folder-card-meta">
                        <span className={`badge ${s.type === "dipendente" ? "badge-dip" : "badge-call"}`} style={{ fontSize: 11 }}>
                          {s.type === "dipendente" ? "Dipendente" : "A chiamata"}
                        </span>
                        <span className="muted" style={{ fontSize: 12 }}>{docs.length} doc</span>
                      </div>
                      <div className="folder-card-progress">
                        <div className="folder-card-bar">
                          <div className="folder-card-fill" style={{ width: `${(checkCount / DOC_CHECKLIST.length) * 100}%` }} />
                        </div>
                        <span className="muted" style={{ fontSize: 11, whiteSpace: "nowrap" }}>{checkCount}/{DOC_CHECKLIST.length}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="section">
          <div className="section-head">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button className="btn-ghost" onClick={() => setOpenFolder(null)} style={{ padding: "6px 10px", borderRadius: 8, fontSize: 13 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <h2 style={{ margin: 0 }}>Fascicolo — {openStaff?.name}</h2>
                <span className="muted" style={{ fontSize: 12 }}>
                  {openStaff?.type === "dipendente" ? "Dipendente" : "A chiamata"}
                  {openStaff?.role ? ` · ${openStaff.role}` : ""}
                </span>
              </div>
            </div>
          </div>
          <div className="section-body">
            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-soft)", display: "block", marginBottom: 10 }}>Documenti obbligatori</label>
              <div className="doc-checklist">
                {DOC_CHECKLIST.map(item => {
                  const has = folderDocTypes.has(item);
                  const doc = has ? folderDocs.find(d => d.doc_type === item) : null;
                  const isExpired = doc?.expiry_date && doc.expiry_date < todayStr;
                  const isExpiring = doc?.expiry_date && !isExpired && doc.expiry_date <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
                  return (
                    <div key={item} className={`doc-check-item${has ? " done" : ""}${isExpired ? " expired" : ""}${isExpiring ? " expiring" : ""}`}>
                      <div className={`doc-check-box${has ? " checked" : ""}`}>
                        {has && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>}
                      </div>
                      <span className="doc-check-label">{item}</span>
                      {isExpired && <span style={{ fontSize: 11, fontWeight: 700, color: "#9E3B2E" }}>Scaduto</span>}
                      {isExpiring && <span style={{ fontSize: 11, fontWeight: 700, color: "#C77B4A" }}>In scadenza</span>}
                    </div>
                  );
                })}
              </div>
            </div>

            {isManager && (
              <div style={{ borderTop: "1px solid var(--line)", paddingTop: 20, marginBottom: 24 }}>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-soft)", display: "block", marginBottom: 10 }}>Carica nuovo documento</label>
                <div className="grid2">
                  <div className="field">
                    <label>Tipo documento</label>
                    <select value={docForm.doc_type} onChange={e => setDocForm({ ...docForm, doc_type: e.target.value })}>
                      {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Titolo</label>
                    <input value={docForm.title} onChange={e => setDocForm({ ...docForm, title: e.target.value })} placeholder="Es. Contratto tempo indeterminato" />
                  </div>
                </div>
                <div className="grid2">
                  <div className="field">
                    <label>Scadenza (opzionale)</label>
                    <DatePickerIT value={docForm.expiry_date} onChange={v => setDocForm({ ...docForm, expiry_date: v })} />
                  </div>
                  <div className="field">
                    <label>Note (opzionale)</label>
                    <input value={docForm.notes} onChange={e => setDocForm({ ...docForm, notes: e.target.value })} placeholder="Note aggiuntive..." />
                  </div>
                </div>
                <div className="field">
                  <label>File (opzionale)</label>
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" ref={docFileRef} onChange={e => setDocFile(e.target.files?.[0] ?? null)} />
                </div>
                <button className="btn btn-primary" onClick={saveDoc}>Carica documento</button>
              </div>
            )}

            {folderDocs.length > 0 && (
              <div style={{ borderTop: isManager ? "1px solid var(--line)" : "none", paddingTop: isManager ? 20 : 0 }}>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-soft)", display: "block", marginBottom: 10 }}>
                  Documenti caricati ({folderDocs.length})
                </label>
                <div style={{ overflowX: "auto" }}>
                  <table className="tbl">
                    <thead><tr>
                      <th>Tipo</th><th>Titolo</th><th className="hide-sm">Scadenza</th><th className="hide-sm">Note</th>
                      {isManager && <th></th>}
                    </tr></thead>
                    <tbody>
                      {folderDocs.map(d => {
                        const isExpired = d.expiry_date && d.expiry_date < todayStr;
                        const isExpiring = d.expiry_date && !isExpired && d.expiry_date <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
                        return (
                          <tr key={d.id} style={isExpired ? { background: "rgba(158,59,46,.06)" } : undefined}>
                            <td><span className="badge">{d.doc_type}</span></td>
                            <td>
                              {d.file_path ? (
                                <a href="#" onClick={async (e) => { e.preventDefault(); const { data } = await supabase.storage.from("documenti").createSignedUrl(d.file_path!, 60); if (data?.signedUrl) window.open(data.signedUrl, "_blank"); }}
                                  style={{ color: "#4F7B8C", fontWeight: 600, textDecoration: "none", cursor: "pointer" }}>{d.title}</a>
                              ) : d.title}
                            </td>
                            <td className="hide-sm">
                              {d.expiry_date ? (
                                <span style={{ color: isExpired ? "#9E3B2E" : isExpiring ? "#C77B4A" : undefined, fontWeight: isExpired || isExpiring ? 700 : 400 }}>
                                  {fmtDate(d.expiry_date + "T00:00:00")}
                                  {isExpired && " (scaduto)"}
                                  {isExpiring && " (in scadenza)"}
                                </span>
                              ) : "—"}
                            </td>
                            <td className="hide-sm muted">{d.notes || "—"}</td>
                            {isManager && (
                              <td style={{ textAlign: "right" }}>
                                <button className="btn-ghost" style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12, color: "var(--danger)" }}
                                  onClick={() => deleteDoc(d.id)}>Elimina</button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {folderDocs.length === 0 && (
              <div className="empty" style={{ padding: "24px 0" }}>
                <div className="muted">Nessun documento caricato per {openStaff?.name}.</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
