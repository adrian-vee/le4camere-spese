"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRole } from "@/lib/useRole";
import { logClientActivity } from "@/lib/activityLog";

interface CashSession {
  id: string;
  opened_at: string;
  closed_at: string | null;
  opened_by: string;
  closed_by: string | null;
  opening_amount: number;
  expected_amount: number | null;
  actual_amount: number | null;
  difference: number | null;
  notes: string | null;
  status: "open" | "closed";
  shift_date: string | null;
  shift_type: string | null;
}

interface CashMovement {
  id: string;
  session_id: string;
  created_at: string;
  created_by: string;
  type: "entrata" | "uscita";
  amount: number;
  category: string;
  description: string | null;
  receipt_url: string | null;
}

interface ShiftTypeRow {
  id: string; name: string; start_time: string; end_time: string; color: string; sort: number;
}

interface ShiftRow {
  shift_date: string; shift_type_id: string; staff_id: string | null;
}

interface StaffRow {
  id: string; name: string;
}

const CATEGORIES = [
  { value: "vendita", label: "Vendita" },
  { value: "servizio", label: "Servizio" },
  { value: "pagamento_fornitore", label: "Pagamento fornitore" },
  { value: "prelievo", label: "Prelievo" },
  { value: "deposito", label: "Deposito" },
  { value: "altro", label: "Altro" },
];

function fmtEur(n: number) {
  return n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}
function catLabel(val: string) {
  return CATEGORIES.find(c => c.value === val)?.label ?? val;
}

/** Determine which shift type matches the current time */
function detectCurrentShift(types: ShiftTypeRow[]): ShiftTypeRow | null {
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  for (const t of types) {
    const [sh, sm] = t.start_time.split(":").map(Number);
    const [eh, em] = t.end_time.split(":").map(Number);
    const start = sh * 60 + sm;
    const end = eh * 60 + em;
    if (end > start) {
      if (nowMins >= start && nowMins < end) return t;
    } else {
      // overnight shift
      if (nowMins >= start || nowMins < end) return t;
    }
  }
  return null;
}

/** Compute alerts for admin */
function computeAlerts(sessions: CashSession[]): { type: string; msg: string }[] {
  const alerts: { type: string; msg: string }[] = [];

  // Check for open sessions > 10 hours
  const openSess = sessions.filter(s => s.status === "open");
  for (const s of openSess) {
    const hoursOpen = (Date.now() - new Date(s.opened_at).getTime()) / (1000 * 60 * 60);
    if (hoursOpen > 10) {
      alerts.push({ type: "timeout", msg: `Cassa aperta da oltre ${Math.floor(hoursOpen)}h (dal ${fmtDateTime(s.opened_at)})` });
    }
  }

  // Check for >10€ difference on recent closed sessions (last 7 days)
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const s of sessions) {
    if (s.status === "closed" && new Date(s.opened_at).getTime() > weekAgo) {
      const diff = Math.abs(Number(s.difference ?? 0));
      if (diff > 10) {
        alerts.push({ type: "difference", msg: `Differenza di ${fmtEur(Number(s.difference ?? 0))} nella sessione del ${fmtDate(s.opened_at)}` });
      }
    }
  }

  // Check for duplicate openings on same shift_date + shift_type
  const shiftKeys = new Map<string, number>();
  for (const s of sessions) {
    if (s.shift_date && s.shift_type) {
      const key = `${s.shift_date}|${s.shift_type}`;
      shiftKeys.set(key, (shiftKeys.get(key) ?? 0) + 1);
    }
  }
  for (const [key, count] of shiftKeys) {
    if (count > 1) {
      const [d, t] = key.split("|");
      alerts.push({ type: "duplicate", msg: `Doppia apertura turno ${t} del ${fmtDate(d + "T00:00:00")}` });
    }
  }

  return alerts;
}

function MovementsTable({ mvs, profiles, showDelete, onDelete }: {
  mvs: CashMovement[];
  profiles: Record<string, string>;
  showDelete?: boolean;
  onDelete?: (id: string) => void;
}) {
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>Ora</th>
          <th>Tipo</th>
          <th>Importo</th>
          <th>Categoria</th>
          <th className="hide-sm">Descrizione</th>
          <th className="hide-sm">Operatore</th>
          {showDelete && <th></th>}
        </tr>
      </thead>
      <tbody>
        {mvs.map(m => (
          <tr key={m.id}>
            <td style={{ whiteSpace: "nowrap", fontSize: 13 }}>{fmtTime(m.created_at)}</td>
            <td>
              <span style={{
                display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                background: m.type === "entrata" ? "#E3EEE4" : "#F5E6E4",
                color: m.type === "entrata" ? "#2D5A3D" : "#9E3B2E",
              }}>
                {m.type === "entrata" ? "Entrata" : "Uscita"}
              </span>
            </td>
            <td style={{ fontWeight: 700, fontSize: 14, color: m.type === "entrata" ? "#2D5A3D" : "#9E3B2E" }}>
              {m.type === "entrata" ? "+" : "-"}{fmtEur(Number(m.amount))}
            </td>
            <td style={{ fontSize: 13 }}>{catLabel(m.category)}</td>
            <td className="hide-sm muted" style={{ fontSize: 13 }}>{m.description || "—"}</td>
            <td className="hide-sm muted" style={{ fontSize: 13 }}>{profiles[m.created_by] || "?"}</td>
            {showDelete && (
              <td style={{ textAlign: "right" }}>
                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  {m.receipt_url && (
                    <a href={m.receipt_url} target="_blank" rel="noreferrer"
                      className="btn-ghost" style={{ padding: "4px 8px", borderRadius: 6, fontSize: 11 }}>
                      Ricevuta
                    </a>
                  )}
                  <button className="btn-ghost" style={{ padding: "4px 8px", borderRadius: 6, fontSize: 11, color: "#9E3B2E" }}
                    onClick={() => onDelete?.(m.id)}>Elimina</button>
                </div>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function CassaPage() {
  const supabase = createClient();
  const { isAdmin, role, loading: roleLoading } = useRole();
  const isStaff = role === "staff";

  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const [activeSession, setActiveSession] = useState<CashSession | null>(null);
  const [justClosed, setJustClosed] = useState(false);

  // Shift data
  const [shiftTypes, setShiftTypes] = useState<ShiftTypeRow[]>([]);
  const [todayShifts, setTodayShifts] = useState<ShiftRow[]>([]);
  const [staffMap, setStaffMap] = useState<Record<string, string>>({});
  const [currentShiftType, setCurrentShiftType] = useState<ShiftTypeRow | null>(null);
  const [currentShiftStaff, setCurrentShiftStaff] = useState<string | null>(null);

  // Previous session (for auto-fill opening amount)
  const [prevCloseAmount, setPrevCloseAmount] = useState<number | null>(null);
  const [prevUnclosed, setPrevUnclosed] = useState(false);
  const [prevUnclosedName, setPrevUnclosedName] = useState("");

  // Open session form
  const [openAmount, setOpenAmount] = useState("");
  const [openingSession, setOpeningSession] = useState(false);

  // New movement form
  const [mvType, setMvType] = useState<"entrata" | "uscita">("entrata");
  const [mvAmount, setMvAmount] = useState("");
  const [mvCategory, setMvCategory] = useState("vendita");
  const [mvDesc, setMvDesc] = useState("");
  const [mvFile, setMvFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Close session
  const [showClose, setShowClose] = useState(false);
  const [actualAmount, setActualAmount] = useState("");
  const [closeNotes, setCloseNotes] = useState("");

  // History detail
  const [viewSession, setViewSession] = useState<CashSession | null>(null);
  const [viewMovements, setViewMovements] = useState<CashMovement[]>([]);

  // Monthly filter
  const now = new Date();
  const [filterMonth, setFilterMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);

  const printRef = useRef<HTMLDivElement>(null);

  function showToastMsg(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  const today = new Date().toISOString().slice(0, 10);

  async function loadData() {
    setLoading(true);
    const [{ data: sessData }, { data: profData }, { data: stData }, { data: shData }, { data: staffData }] = await Promise.all([
      supabase.from("cash_sessions").select("*").order("opened_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name"),
      supabase.from("shift_types").select("*").order("sort"),
      supabase.from("shifts").select("shift_date, shift_type_id, staff_id").eq("shift_date", today),
      supabase.from("staff").select("id, name").eq("active", true),
    ]);

    const sess = (sessData ?? []) as CashSession[];
    setSessions(sess);

    const profMap: Record<string, string> = {};
    for (const p of (profData ?? [])) profMap[p.id] = p.full_name || "Utente";
    setProfiles(profMap);

    const types = (stData ?? []) as ShiftTypeRow[];
    setShiftTypes(types);

    const shifts = (shData ?? []) as ShiftRow[];
    setTodayShifts(shifts);

    const sMap: Record<string, string> = {};
    for (const s of (staffData ?? []) as StaffRow[]) sMap[s.id] = s.name;
    setStaffMap(sMap);

    // Detect current shift
    const curShift = detectCurrentShift(types);
    setCurrentShiftType(curShift);

    // Find staff assigned to current shift today
    if (curShift) {
      const assigned = shifts.filter(s => s.shift_type_id === curShift.id && s.staff_id);
      const names = assigned.map(s => sMap[s.staff_id!]).filter(Boolean);
      setCurrentShiftStaff(names.length > 0 ? names.join(", ") : null);
    }

    // Active session
    const open = sess.find(s => s.status === "open");
    setActiveSession(open ?? null);

    if (open) {
      const { data: mvData } = await supabase
        .from("cash_movements").select("*")
        .eq("session_id", open.id)
        .order("created_at", { ascending: true });
      setMovements((mvData ?? []) as CashMovement[]);
    } else {
      setMovements([]);
    }

    // Previous session info (for auto-fill)
    const lastClosed = sess.find(s => s.status === "closed");
    if (lastClosed?.actual_amount != null) {
      setPrevCloseAmount(Number(lastClosed.actual_amount));
    } else if (lastClosed?.expected_amount != null) {
      setPrevCloseAmount(Number(lastClosed.expected_amount));
    } else {
      setPrevCloseAmount(null);
    }

    // Check if previous session is unclosed (someone else's)
    if (!open) {
      const anyOpen = sess.find(s => s.status === "open");
      if (anyOpen) {
        setPrevUnclosed(true);
        setPrevUnclosedName(profMap[anyOpen.opened_by] || "Sconosciuto");
      } else {
        setPrevUnclosed(false);
      }
    }

    setLoading(false);
  }

  useEffect(() => {
    loadData();
    // Auto-fill opening amount from previous close
    // eslint-disable-next-line
  }, []);

  // Set opening amount from previous close when available
  useEffect(() => {
    if (prevCloseAmount != null && !activeSession && openAmount === "") {
      setOpenAmount(prevCloseAmount.toFixed(2));
    }
  }, [prevCloseAmount, activeSession, openAmount]);

  const sessionTotals = useMemo(() => {
    const entrate = movements.filter(m => m.type === "entrata").reduce((s, m) => s + Number(m.amount), 0);
    const uscite = movements.filter(m => m.type === "uscita").reduce((s, m) => s + Number(m.amount), 0);
    const saldo = (activeSession ? Number(activeSession.opening_amount) : 0) + entrate - uscite;
    return { entrate, uscite, saldo };
  }, [movements, activeSession]);

  const monthSessions = useMemo(() => {
    const [y, m] = filterMonth.split("-").map(Number);
    return sessions.filter(s => {
      const d = new Date(s.opened_at);
      return d.getFullYear() === y && d.getMonth() + 1 === m;
    });
  }, [sessions, filterMonth]);

  const monthStats = useMemo(() => {
    let sessCount = 0, totalDiff = 0;
    for (const s of monthSessions) {
      if (s.status === "closed") {
        sessCount++;
        if (s.difference != null) totalDiff += Number(s.difference);
      }
    }
    return { sessCount, totalDiff };
  }, [monthSessions]);

  // Admin alerts
  const alerts = useMemo(() => computeAlerts(sessions), [sessions]);

  async function openSession() {
    const amt = parseFloat(openAmount);
    if (isNaN(amt) || amt < 0) return alert("Inserisci un importo di apertura valido.");
    setOpeningSession(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setOpeningSession(false); return; }

    const { error } = await supabase.from("cash_sessions").insert({
      opened_by: user.id, opening_amount: amt, status: "open",
      shift_date: today,
      shift_type: currentShiftType?.name ?? null,
    }).select().single();

    if (error) { alert("Errore: " + error.message); setOpeningSession(false); return; }
    setOpenAmount("");
    setOpeningSession(false);
    logClientActivity("create", "cassa", `Apertura cassa con fondo ${amt}€`, { amount: amt, shift_type: currentShiftType?.name ?? null });
    showToastMsg("Sessione di cassa aperta");
    loadData();
  }

  async function addMovement() {
    const amt = parseFloat(mvAmount);
    if (isNaN(amt) || amt <= 0) return alert("Importo non valido.");
    if (!activeSession) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    let receiptUrl: string | null = null;
    if (mvFile) {
      const ext = mvFile.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `cassa/${activeSession.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("documenti").upload(path, mvFile);
      if (!upErr) {
        const { data: { publicUrl } } = supabase.storage.from("documenti").getPublicUrl(path);
        receiptUrl = publicUrl;
      }
    }

    const { error } = await supabase.from("cash_movements").insert({
      session_id: activeSession.id, created_by: user.id,
      type: mvType, amount: amt, category: mvCategory,
      description: mvDesc || null, receipt_url: receiptUrl,
    });

    if (error) return alert("Errore: " + error.message);

    logClientActivity("create", "cassa", `${mvType === "entrata" ? "Entrata" : "Uscita"} di ${amt}€ — ${mvCategory}`, { type: mvType, amount: amt, category: mvCategory, description: mvDesc || null });
    setMvAmount(""); setMvDesc(""); setMvFile(null); setMvCategory("vendita");
    if (fileRef.current) fileRef.current.value = "";
    showToastMsg(`${mvType === "entrata" ? "Entrata" : "Uscita"} di ${fmtEur(amt)} registrata`);
    loadData();
  }

  async function closeSession() {
    const amt = parseFloat(actualAmount);
    if (isNaN(amt) || amt < 0) return alert("Inserisci il conteggio effettivo.");
    if (!activeSession) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const expected = sessionTotals.saldo;
    const diff = amt - expected;

    const { error } = await supabase.from("cash_sessions").update({
      closed_at: new Date().toISOString(), closed_by: user.id,
      expected_amount: expected, actual_amount: amt, difference: diff,
      notes: closeNotes || null, status: "closed",
    }).eq("id", activeSession.id);

    if (error) return alert("Errore: " + error.message);

    logClientActivity("update", "cassa", `Chiusura cassa — atteso ${expected}€, effettivo ${amt}€, diff ${diff}€`, { expected, actual: amt, difference: diff });
    setShowClose(false); setActualAmount(""); setCloseNotes("");
    if (isStaff) setJustClosed(true);
    showToastMsg("Sessione chiusa. Differenza: " + fmtEur(diff));
    loadData();
  }

  async function deleteMovement(id: string) {
    if (!confirm("Eliminare questo movimento?")) return;
    const mv = movements.find(m => m.id === id);
    await supabase.from("cash_movements").delete().eq("id", id);
    logClientActivity("delete", "cassa", `Movimento eliminato: ${mv?.type ?? "?"} ${mv?.amount ?? 0}€`, { movementId: id, type: mv?.type, amount: mv?.amount });
    showToastMsg("Movimento eliminato");
    loadData();
  }

  async function viewHistorySession(s: CashSession) {
    setViewSession(s);
    const { data } = await supabase
      .from("cash_movements").select("*")
      .eq("session_id", s.id)
      .order("created_at", { ascending: true });
    setViewMovements((data ?? []) as CashMovement[]);
  }

  const todayStr = new Date().toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  if (loading || roleLoading) return <div className="empty">Caricamento...</div>;

  return (
    <>
      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <h1 className="serif" style={{ fontSize: 24, fontWeight: 500 }}>Cassa</h1>
        {activeSession && (
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn-ghost" style={{ padding: "8px 14px", borderRadius: 8, fontSize: 13 }} onClick={() => window.print()}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: "inline", verticalAlign: "-2px", marginRight: 4 }}>
                <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" /><rect x="6" y="14" width="12" height="8" />
              </svg>
              Stampa report
            </button>
            <button className="btn btn-primary" style={{ padding: "8px 16px", fontSize: 13, background: "#9E3B2E" }}
              onClick={() => setShowClose(true)}>
              Chiudi cassa
            </button>
          </div>
        )}
      </div>

      {/* ── Current shift info bar ── */}
      {currentShiftType && (
        <div className="no-print" style={{
          display: "flex", gap: 12, alignItems: "center", marginBottom: 20, padding: "10px 16px",
          background: currentShiftType.color + "15", border: `1px solid ${currentShiftType.color}40`,
          borderRadius: 10, fontSize: 13, flexWrap: "wrap",
        }}>
          <span style={{ fontWeight: 700, color: currentShiftType.color }}>
            Turno attuale: {currentShiftType.name}
          </span>
          <span style={{ color: "var(--ink-soft)" }}>
            {currentShiftType.start_time.slice(0, 5)}–{currentShiftType.end_time.slice(0, 5)}
          </span>
          {currentShiftStaff && (
            <span>Operatore: <strong>{currentShiftStaff}</strong></span>
          )}
          {!currentShiftStaff && (
            <span style={{ color: "#C77B4A" }}>Nessuno assegnato a questo turno oggi</span>
          )}
        </div>
      )}

      {/* ── Admin alerts ── */}
      {isAdmin && alerts.length > 0 && (
        <div className="no-print" style={{ marginBottom: 20 }}>
          {alerts.map((a, i) => (
            <div key={i} style={{
              padding: "10px 16px", marginBottom: 8, borderRadius: 10,
              background: "#F5E6E4", border: "1px solid #9E3B2E40",
              fontSize: 13, color: "#9E3B2E", display: "flex", alignItems: "center", gap: 8,
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9E3B2E" strokeWidth="2" style={{ flexShrink: 0 }}>
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" />
              </svg>
              {a.msg}
            </div>
          ))}
        </div>
      )}

      {/* ── Unclosed previous session warning ── */}
      {!activeSession && prevUnclosed && (
        <div className="no-print" style={{
          padding: "12px 16px", marginBottom: 20, borderRadius: 10,
          background: "#FFF8F0", border: "1px solid #C77B4A40",
          fontSize: 13, color: "#C77B4A",
        }}>
          <strong>Attenzione:</strong> La cassa del turno precedente ({prevUnclosedName}) non è stata chiusa. Contatta l&apos;amministratore.
        </div>
      )}

      {/* ── Staff just closed: success message ── */}
      {isStaff && justClosed && !activeSession && (
        <div className="section" style={{ maxWidth: 520, margin: "40px auto", textAlign: "center" }}>
          <div className="section-body" style={{ padding: 40 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "#2D5A3D", marginBottom: 8 }}>Cassa chiusa correttamente</h2>
            <p style={{ color: "#6C6B5D", fontSize: 14 }}>Buon riposo!</p>
          </div>
        </div>
      )}

      {/* ── No active session: open one ── */}
      {!activeSession && !prevUnclosed && !justClosed && (
        <div className="section no-print" style={{ maxWidth: 520, margin: "40px auto" }}>
          <div className="section-head">
            <h2>
              Apri cassa
              {currentShiftType && <span style={{ fontWeight: 400, fontSize: 14, marginLeft: 8, color: "var(--ink-soft)" }}>
                — Turno {currentShiftType.name}
              </span>}
            </h2>
          </div>
          <div className="section-body" style={{ padding: 24 }}>
            {!currentShiftType && !isAdmin && (
              <div style={{ padding: "12px 16px", marginBottom: 16, borderRadius: 10, background: "#FFF8F0", border: "1px solid #C77B4A40", fontSize: 13, color: "#C77B4A" }}>
                Non sei in turno al momento. Solo chi è in turno o un admin può aprire la cassa.
              </div>
            )}

            {(currentShiftType || isAdmin) && (
              <>
                {currentShiftStaff && (
                  <p style={{ fontSize: 14, color: "var(--ink-soft)", marginBottom: 12 }}>
                    Operatore in turno: <strong>{currentShiftStaff}</strong>
                  </p>
                )}

                <div className="field">
                  <label>Fondo cassa iniziale (€)</label>
                  <input type="number" min="0" step="0.01" value={openAmount}
                    onChange={e => setOpenAmount(e.target.value)} placeholder="0.00"
                    onKeyDown={e => e.key === "Enter" && openSession()} />
                  {prevCloseAmount != null && (
                    <span className="muted" style={{ fontSize: 12, marginTop: 4, display: "block" }}>
                      Pre-compilato dal saldo chiusura precedente: {fmtEur(prevCloseAmount)}
                    </span>
                  )}
                </div>
                <button className="btn btn-primary" style={{ width: "100%", padding: "14px", fontSize: 15, marginTop: 8 }}
                  onClick={openSession} disabled={openingSession}>
                  {openingSession ? "Apertura..." : `Apri cassa${currentShiftType ? ` — ${currentShiftType.name}` : ""}`}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Active session ── */}
      {activeSession && (
        <>
          {/* Shift info on active */}
          {activeSession.shift_type && (
            <div className="no-print" style={{
              display: "inline-block", padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700,
              background: "#F3EBDD", color: "#1F3326", marginBottom: 16,
            }}>
              Turno: {activeSession.shift_type} — {fmtDate(activeSession.shift_date ? activeSession.shift_date + "T00:00:00" : activeSession.opened_at)}
            </div>
          )}

          {/* KPI Cards */}
          <div className="no-print" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 24 }}>
            <div className="section" style={{ borderTop: "3px solid #2D5A3D" }}>
              <div className="section-body" style={{ padding: "16px 20px" }}>
                <div style={{ fontSize: 12, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Fondo iniziale</div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: "#1F3326" }}>{fmtEur(Number(activeSession.opening_amount))}</div>
              </div>
            </div>
            <div className="section" style={{ borderTop: "3px solid #2D5A3D" }}>
              <div className="section-body" style={{ padding: "16px 20px" }}>
                <div style={{ fontSize: 12, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Entrate</div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: "#2D5A3D" }}>+{fmtEur(sessionTotals.entrate)}</div>
              </div>
            </div>
            <div className="section" style={{ borderTop: "3px solid #9E3B2E" }}>
              <div className="section-body" style={{ padding: "16px 20px" }}>
                <div style={{ fontSize: 12, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Uscite</div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: "#9E3B2E" }}>-{fmtEur(sessionTotals.uscite)}</div>
              </div>
            </div>
            <div className="section" style={{ borderTop: "3px solid #BFA762" }}>
              <div className="section-body" style={{ padding: "16px 20px" }}>
                <div style={{ fontSize: 12, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Saldo attuale</div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: "#1F3326" }}>{fmtEur(sessionTotals.saldo)}</div>
              </div>
            </div>
          </div>

          {/* Info bar */}
          <div className="no-print" style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 20, fontSize: 13, color: "var(--ink-soft)", flexWrap: "wrap" }}>
            <span>Aperta da <strong>{profiles[activeSession.opened_by] || "?"}</strong></span>
            <span>il <strong>{fmtDateTime(activeSession.opened_at)}</strong></span>
            <span>{movements.length} movimenti</span>
          </div>

          {/* New movement form */}
          <div className="section no-print" style={{ marginBottom: 24 }}>
            <div className="section-head"><h2>Nuovo movimento</h2></div>
            <div className="section-body" style={{ padding: 20 }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <button type="button"
                  className={`contract-pill${mvType === "entrata" ? " active" : ""}`}
                  style={mvType === "entrata" ? { background: "#E3EEE4", borderColor: "#2D5A3D", color: "#2D5A3D" } : {}}
                  onClick={() => setMvType("entrata")}>
                  + Entrata
                </button>
                <button type="button"
                  className={`contract-pill${mvType === "uscita" ? " active" : ""}`}
                  style={mvType === "uscita" ? { background: "#F5E6E4", borderColor: "#9E3B2E", color: "#9E3B2E" } : {}}
                  onClick={() => setMvType("uscita")}>
                  - Uscita
                </button>
              </div>
              <div className="grid2">
                <div className="field">
                  <label>Importo (€)</label>
                  <input type="number" min="0.01" step="0.01" value={mvAmount}
                    onChange={e => setMvAmount(e.target.value)} placeholder="0.00" />
                </div>
                <div className="field">
                  <label>Categoria</label>
                  <select value={mvCategory} onChange={e => setMvCategory(e.target.value)}>
                    {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid2">
                <div className="field">
                  <label>Descrizione (opzionale)</label>
                  <input value={mvDesc} onChange={e => setMvDesc(e.target.value)} placeholder="Es. Pagamento camera 3" />
                </div>
                <div className="field">
                  <label>Ricevuta (opzionale)</label>
                  <input type="file" accept="image/*,.pdf" ref={fileRef} onChange={e => setMvFile(e.target.files?.[0] ?? null)} />
                </div>
              </div>
              <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={addMovement}>
                Registra movimento
              </button>
            </div>
          </div>

          {/* Movements list */}
          {movements.length > 0 && (
            <div className="section no-print" style={{ marginBottom: 24 }}>
              <div className="section-head"><h2>Movimenti sessione corrente</h2></div>
              <div className="section-body" style={{ padding: 0 }}>
                <MovementsTable mvs={movements} profiles={profiles} showDelete onDelete={deleteMovement} />
              </div>
            </div>
          )}

          {/* ── PRINT-ONLY report ── */}
          <div className="print-only" ref={printRef}>
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 2, color: "#1F3326" }}>LE 4 CAMERE</div>
              <div style={{ fontSize: 11, letterSpacing: 3, color: "#BFA762", marginTop: 2 }}>GESTIONALE ALBERGHIERO</div>
              <div style={{ height: 2, background: "linear-gradient(90deg,#BFA762,#1F3326)", margin: "10px 0" }} />
              <div style={{ fontSize: 16, fontWeight: 600, marginTop: 8 }}>Report Cassa</div>
              {activeSession.shift_type && (
                <div style={{ fontSize: 13, marginTop: 4, color: "#6C6B5D" }}>
                  Turno: {activeSession.shift_type} — {fmtDate(activeSession.shift_date ? activeSession.shift_date + "T00:00:00" : activeSession.opened_at)}
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 12, color: "#6C6B5D" }}>
              <span>Apertura: {fmtDateTime(activeSession.opened_at)} — Operatore: {profiles[activeSession.opened_by] || "?"}</span>
              <span>Fondo iniziale: {fmtEur(Number(activeSession.opening_amount))}</span>
            </div>

            {movements.length > 0 && (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, marginBottom: 16 }}>
                <thead>
                  <tr style={{ background: "#1F3326", color: "#FAF9F5" }}>
                    <th style={{ padding: "6px 8px", textAlign: "left" }}>Ora</th>
                    <th style={{ padding: "6px 8px", textAlign: "left" }}>Tipo</th>
                    <th style={{ padding: "6px 8px", textAlign: "left" }}>Categoria</th>
                    <th style={{ padding: "6px 8px", textAlign: "left" }}>Descrizione</th>
                    <th style={{ padding: "6px 8px", textAlign: "left" }}>Operatore</th>
                    <th style={{ padding: "6px 8px", textAlign: "right" }}>Importo</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m, i) => (
                    <tr key={m.id} style={{ background: i % 2 === 0 ? "#fff" : "#F3EBDD" }}>
                      <td style={{ padding: "5px 8px" }}>{fmtTime(m.created_at)}</td>
                      <td style={{ padding: "5px 8px", fontWeight: 700, color: m.type === "entrata" ? "#2D5A3D" : "#9E3B2E" }}>
                        {m.type === "entrata" ? "Entrata" : "Uscita"}
                      </td>
                      <td style={{ padding: "5px 8px" }}>{catLabel(m.category)}</td>
                      <td style={{ padding: "5px 8px" }}>{m.description || "—"}</td>
                      <td style={{ padding: "5px 8px" }}>{profiles[m.created_by] || "?"}</td>
                      <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700, color: m.type === "entrata" ? "#2D5A3D" : "#9E3B2E" }}>
                        {m.type === "entrata" ? "+" : "-"}{fmtEur(Number(m.amount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div style={{ borderTop: "2px solid #1F3326", paddingTop: 10, fontSize: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span>Fondo iniziale</span><strong>{fmtEur(Number(activeSession.opening_amount))}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, color: "#2D5A3D" }}>
                <span>Subtotale entrate</span><strong>+{fmtEur(sessionTotals.entrate)}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, color: "#9E3B2E" }}>
                <span>Subtotale uscite</span><strong>-{fmtEur(sessionTotals.uscite)}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, borderTop: "1px solid #D8CCB8", paddingTop: 6, fontSize: 14 }}>
                <strong>Saldo atteso</strong><strong>{fmtEur(sessionTotals.saldo)}</strong>
              </div>
            </div>

            <div style={{ marginTop: 40, display: "flex", justifyContent: "space-between", fontSize: 11, color: "#6C6B5D" }}>
              <div>
                <div style={{ borderTop: "1px solid #6C6B5D", width: 200, marginBottom: 4 }} />
                Firma operatore
              </div>
              <div>Stampato il {todayStr}</div>
            </div>
          </div>
        </>
      )}

      {/* ── Close session modal ── */}
      {showClose && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 300,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        }} onClick={() => setShowClose(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: "#FFFFFF", borderRadius: 12, padding: 28, maxWidth: 560, width: "100%",
            boxShadow: "0 8px 32px rgba(0,0,0,.15)", maxHeight: "85vh", overflowY: "auto",
          }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: "#1F3326" }}>Chiusura cassa</h3>

            <div style={{ marginBottom: 16, padding: 16, background: "#F3EBDD", borderRadius: 10 }}>
              {activeSession?.shift_type && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span>Turno</span><strong>{activeSession.shift_type}</strong>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span>Fondo iniziale</span>
                <strong>{fmtEur(Number(activeSession?.opening_amount ?? 0))}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, color: "#2D5A3D" }}>
                <span>Entrate ({movements.filter(m => m.type === "entrata").length})</span>
                <strong>+{fmtEur(sessionTotals.entrate)}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, color: "#9E3B2E" }}>
                <span>Uscite ({movements.filter(m => m.type === "uscita").length})</span>
                <strong>-{fmtEur(sessionTotals.uscite)}</strong>
              </div>
              <div style={{ borderTop: "1px solid #D8CCB8", paddingTop: 8, display: "flex", justifyContent: "space-between", fontSize: 16 }}>
                <strong>Saldo atteso</strong>
                <strong style={{ color: "#1F3326" }}>{fmtEur(sessionTotals.saldo)}</strong>
              </div>
            </div>

            {movements.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: "#1F3326" }}>
                  Dettaglio movimenti ({movements.length})
                </div>
                <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid #D8CCB8", borderRadius: 8 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "#F3EBDD" }}>
                        <th style={{ padding: "6px 8px", textAlign: "left" }}>Ora</th>
                        <th style={{ padding: "6px 8px", textAlign: "left" }}>Tipo</th>
                        <th style={{ padding: "6px 8px", textAlign: "left" }}>Descrizione</th>
                        <th style={{ padding: "6px 8px", textAlign: "right" }}>Importo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movements.map(m => (
                        <tr key={m.id} style={{ borderBottom: "1px solid #F3EBDD" }}>
                          <td style={{ padding: "5px 8px" }}>{fmtTime(m.created_at)}</td>
                          <td style={{ padding: "5px 8px", fontWeight: 600, color: m.type === "entrata" ? "#2D5A3D" : "#9E3B2E" }}>
                            {m.type === "entrata" ? "Entrata" : "Uscita"}
                          </td>
                          <td style={{ padding: "5px 8px" }}>{m.description || catLabel(m.category)}</td>
                          <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700, color: m.type === "entrata" ? "#2D5A3D" : "#9E3B2E" }}>
                            {m.type === "entrata" ? "+" : "-"}{fmtEur(Number(m.amount))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="field">
              <label style={{ fontWeight: 700 }}>Conteggio effettivo in cassa (€)</label>
              <input type="number" min="0" step="0.01" value={actualAmount}
                onChange={e => setActualAmount(e.target.value)} placeholder="0.00" autoFocus
                style={{ fontSize: 18, padding: "12px 16px", fontWeight: 700 }} />
            </div>

            {actualAmount && !isNaN(parseFloat(actualAmount)) && (
              <div style={{
                padding: 14, borderRadius: 10, marginBottom: 12, marginTop: 4,
                background: Math.abs(parseFloat(actualAmount) - sessionTotals.saldo) < 0.01 ? "#E3EEE4" : "#F5E6E4",
                fontWeight: 700, fontSize: 16, textAlign: "center",
                color: Math.abs(parseFloat(actualAmount) - sessionTotals.saldo) < 0.01 ? "#2D5A3D" : "#9E3B2E",
              }}>
                Differenza: {fmtEur(parseFloat(actualAmount) - sessionTotals.saldo)}
                {Math.abs(parseFloat(actualAmount) - sessionTotals.saldo) < 0.01 && " — Tutto quadra!"}
              </div>
            )}

            <div className="field">
              <label>Note chiusura (opzionale)</label>
              <input value={closeNotes} onChange={e => setCloseNotes(e.target.value)} placeholder="Es. tutto quadra, banconota da 50 mancante…" />
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button className="btn-ghost" style={{ flex: 1, padding: 12, borderRadius: 8 }} onClick={() => setShowClose(false)}>Annulla</button>
              <button className="btn btn-primary" style={{ flex: 1, padding: 12, background: "#9E3B2E" }} onClick={closeSession}>
                Conferma chiusura
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── History section ── */}
      {!isStaff && (
        <div className="section no-print" style={{ marginTop: activeSession ? 0 : 32 }}>
          <div className="section-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <h2>Storico sessioni</h2>
            <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
              style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #D8CCB8", fontSize: 13 }} />
          </div>
          <div className="section-body" style={{ padding: 0 }}>
            {monthSessions.filter(s => s.status === "closed").length === 0 ? (
              <div className="empty" style={{ padding: 32 }}>Nessuna sessione chiusa in questo mese.</div>
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Turno</th>
                    <th>Apertura</th>
                    <th>Chiusura</th>
                    <th className="hide-sm">Operatore</th>
                    <th>Atteso</th>
                    <th>Effettivo</th>
                    <th>Diff.</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {monthSessions.filter(s => s.status === "closed").map(s => {
                    const diff = Number(s.difference ?? 0);
                    return (
                      <tr key={s.id}>
                        <td style={{ fontWeight: 600, fontSize: 13 }}>{fmtDate(s.opened_at)}</td>
                        <td style={{ fontSize: 12 }}>
                          {s.shift_type ? (
                            <span style={{ padding: "2px 8px", borderRadius: 10, background: "#F3EBDD", fontWeight: 600 }}>{s.shift_type}</span>
                          ) : "—"}
                        </td>
                        <td style={{ fontSize: 13 }}>{fmtTime(s.opened_at)}</td>
                        <td style={{ fontSize: 13 }}>{s.closed_at ? fmtTime(s.closed_at) : "—"}</td>
                        <td className="hide-sm" style={{ fontSize: 13 }}>{profiles[s.opened_by] || "?"}</td>
                        <td style={{ fontSize: 13 }}>{s.expected_amount != null ? fmtEur(Number(s.expected_amount)) : "—"}</td>
                        <td style={{ fontSize: 13 }}>{s.actual_amount != null ? fmtEur(Number(s.actual_amount)) : "—"}</td>
                        <td style={{ fontWeight: 700, fontSize: 13, color: Math.abs(diff) < 0.01 ? "#2D5A3D" : "#9E3B2E" }}>
                          {diff >= 0 ? "+" : ""}{fmtEur(diff)}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <button className="btn-ghost" style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12 }}
                            onClick={() => viewHistorySession(s)}>
                            Dettaglio
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {!isStaff && monthSessions.filter(s => s.status === "closed").length > 0 && (
        <div className="no-print" style={{ display: "flex", gap: 16, marginTop: 16, fontSize: 13, color: "var(--ink-soft)", flexWrap: "wrap" }}>
          <span>Sessioni chiuse: <strong>{monthStats.sessCount}</strong></span>
          <span>Differenza totale mese: <strong style={{ color: Math.abs(monthStats.totalDiff) < 0.01 ? "#2D5A3D" : "#9E3B2E" }}>
            {monthStats.totalDiff >= 0 ? "+" : ""}{fmtEur(monthStats.totalDiff)}
          </strong></span>
        </div>
      )}

      {/* ── Session detail modal ── */}
      {!isStaff && viewSession && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 300,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        }} onClick={() => setViewSession(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: "#FFFFFF", borderRadius: 12, padding: 28, maxWidth: 640, width: "100%",
            boxShadow: "0 8px 32px rgba(0,0,0,.15)", maxHeight: "85vh", overflowY: "auto",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: "#1F3326" }}>
                Sessione del {fmtDate(viewSession.opened_at)}
                {viewSession.shift_type && <span style={{ fontWeight: 400, fontSize: 14, marginLeft: 8 }}>— {viewSession.shift_type}</span>}
              </h3>
              <button className="btn-ghost" style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12 }}
                onClick={() => setViewSession(null)}>Chiudi</button>
            </div>

            <div style={{ marginBottom: 16, padding: 16, background: "#F3EBDD", borderRadius: 10, fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span>Aperta da</span><strong>{profiles[viewSession.opened_by] || "?"}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span>Orario apertura</span><strong>{fmtDateTime(viewSession.opened_at)}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span>Chiusa da</span><strong>{viewSession.closed_by ? (profiles[viewSession.closed_by] || "?") : "—"}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span>Orario chiusura</span><strong>{viewSession.closed_at ? fmtDateTime(viewSession.closed_at) : "—"}</strong>
              </div>
              <div style={{ borderTop: "1px solid #D8CCB8", paddingTop: 8, marginTop: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span>Fondo iniziale</span><strong>{fmtEur(Number(viewSession.opening_amount))}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span>Atteso</span><strong>{viewSession.expected_amount != null ? fmtEur(Number(viewSession.expected_amount)) : "—"}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span>Effettivo</span><strong>{viewSession.actual_amount != null ? fmtEur(Number(viewSession.actual_amount)) : "—"}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #D8CCB8", paddingTop: 6, fontSize: 14 }}>
                  <strong>Differenza</strong>
                  <strong style={{ color: Math.abs(Number(viewSession.difference ?? 0)) < 0.01 ? "#2D5A3D" : "#9E3B2E" }}>
                    {fmtEur(Number(viewSession.difference ?? 0))}
                  </strong>
                </div>
              </div>
              {viewSession.notes && (
                <div style={{ marginTop: 8, color: "#6C6B5D", fontStyle: "italic" }}>Note: {viewSession.notes}</div>
              )}
            </div>

            {viewMovements.length === 0 ? (
              <div className="empty" style={{ padding: 20 }}>Nessun movimento in questa sessione.</div>
            ) : (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: "#1F3326" }}>
                  Movimenti ({viewMovements.length})
                </div>
                <div style={{ border: "1px solid #D8CCB8", borderRadius: 8, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "#F3EBDD" }}>
                        <th style={{ padding: "8px", textAlign: "left" }}>Ora</th>
                        <th style={{ padding: "8px", textAlign: "left" }}>Tipo</th>
                        <th style={{ padding: "8px", textAlign: "left" }}>Categoria</th>
                        <th style={{ padding: "8px", textAlign: "left" }}>Descrizione</th>
                        <th style={{ padding: "8px", textAlign: "left" }}>Operatore</th>
                        <th style={{ padding: "8px", textAlign: "right" }}>Importo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewMovements.map((m, i) => (
                        <tr key={m.id} style={{ borderBottom: i < viewMovements.length - 1 ? "1px solid #F3EBDD" : undefined }}>
                          <td style={{ padding: "6px 8px" }}>{fmtTime(m.created_at)}</td>
                          <td style={{ padding: "6px 8px" }}>
                            <span style={{
                              padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 700,
                              background: m.type === "entrata" ? "#E3EEE4" : "#F5E6E4",
                              color: m.type === "entrata" ? "#2D5A3D" : "#9E3B2E",
                            }}>
                              {m.type === "entrata" ? "Entrata" : "Uscita"}
                            </span>
                          </td>
                          <td style={{ padding: "6px 8px" }}>{catLabel(m.category)}</td>
                          <td style={{ padding: "6px 8px", color: "#6C6B5D" }}>{m.description || "—"}</td>
                          <td style={{ padding: "6px 8px", color: "#6C6B5D" }}>{profiles[m.created_by] || "?"}</td>
                          <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, color: m.type === "entrata" ? "#2D5A3D" : "#9E3B2E" }}>
                            {m.type === "entrata" ? "+" : "-"}{fmtEur(Number(m.amount))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop: 12, padding: 12, background: "#F3EBDD", borderRadius: 8, fontSize: 13 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, color: "#2D5A3D" }}>
                    <span>Subtotale entrate</span>
                    <strong>+{fmtEur(viewMovements.filter(m => m.type === "entrata").reduce((s, m) => s + Number(m.amount), 0))}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", color: "#9E3B2E" }}>
                    <span>Subtotale uscite</span>
                    <strong>-{fmtEur(viewMovements.filter(m => m.type === "uscita").reduce((s, m) => s + Number(m.amount), 0))}</strong>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: "#2D5A3D", color: "#FAF9F5", padding: "12px 24px", borderRadius: 10,
          fontSize: 14, fontWeight: 600, zIndex: 400, boxShadow: "0 4px 20px rgba(0,0,0,.25)",
        }}>
          {toast}
        </div>
      )}

      <style>{`
        .print-only{display:none}
        @media print {
          .sidebar,.topbar-mobile,.bottomnav,.no-print{display:none!important}
          .print-only{display:block!important}
          .shell{padding:0!important;display:block}
          .shell-content{display:block}
          .wrap{padding:0!important;max-width:100%!important}
          body{background:#fff;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}
        }
      `}</style>
    </>
  );
}
