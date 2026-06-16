"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRole } from "@/lib/useRole";
import { useSettings } from "@/lib/useSettings";
import { useToast } from "@/lib/useToast";
import { Toast } from "@/components/Toast";
import { logClientActivity } from "@/lib/activityLog";
import { BAR_RECIPES } from "@/lib/barRecipes";
import { eur, fmtDate } from "@/lib/format";

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

interface QuickButton {
  label: string;
  amount: number;
  category: string;
  type: "entrata" | "uscita";
  description: string;
  recipeId?: string;
}

// ── Constants ──
const FONDO_CASSA = 50;

const ENTRATA_CATS = [
  { value: "camera", label: "Camera" },
  { value: "bar_bevande", label: "Bar / Bevande" },
  { value: "colazione", label: "Colazione" },
  { value: "minibar", label: "Minibar" },
  { value: "extra_servizi", label: "Extra / Servizi" },
  { value: "altro_entrata", label: "Altro" },
];

const USCITA_CATS = [
  { value: "fondo_cassa_dato", label: "Fondo cassa dato" },
  { value: "spesa_piccola", label: "Spesa piccola" },
  { value: "fornitore_contanti", label: "Fornitore pagato contanti" },
  { value: "altro_uscita", label: "Altro" },
];

// Backward compat + merged for label lookup
const ALL_CATS = [
  ...ENTRATA_CATS, ...USCITA_CATS,
  { value: "vendita", label: "Vendita" },
  { value: "servizio", label: "Servizio" },
  { value: "pagamento_fornitore", label: "Pagamento fornitore" },
  { value: "prelievo", label: "Prelievo" },
  { value: "deposito", label: "Deposito" },
  { value: "altro", label: "Altro" },
];

const DEFAULT_QUICK_BUTTONS: QuickButton[] = [
  { label: "Caffè", amount: 1.5, category: "bar_bevande", type: "entrata", description: "Caffè" },
  { label: "Acqua", amount: 1.0, category: "bar_bevande", type: "entrata", description: "Acqua" },
  { label: "Birra", amount: 3.0, category: "bar_bevande", type: "entrata", description: "Birra" },
  { label: "Colazione", amount: 8.0, category: "colazione", type: "entrata", description: "Colazione" },
  { label: "🍹 Spritz Aperol", amount: 5.0, category: "bar_bevande", type: "entrata", description: "Spritz Aperol", recipeId: "spritz-aperol" },
  { label: "🍹 Spritz Campari", amount: 5.0, category: "bar_bevande", type: "entrata", description: "Spritz Campari", recipeId: "spritz-campari" },
  { label: "🥃 Negroni", amount: 7.0, category: "bar_bevande", type: "entrata", description: "Negroni", recipeId: "negroni" },
  { label: "🍸 Gin Tonic", amount: 6.0, category: "bar_bevande", type: "entrata", description: "Gin Tonic", recipeId: "gin-tonic" },
  { label: "🍹 Cuba Libre", amount: 5.0, category: "bar_bevande", type: "entrata", description: "Cuba Libre", recipeId: "cuba-libre" },
  { label: "🥃 Jack & Cola", amount: 6.0, category: "bar_bevande", type: "entrata", description: "Jack & Cola", recipeId: "jack-cola" },
];

// ── Helpers ──
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}
function catLabel(val: string) {
  return ALL_CATS.find(c => c.value === val)?.label ?? val;
}

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
      if (nowMins >= start || nowMins < end) return t;
    }
  }
  return null;
}

function computeAlerts(sessions: CashSession[]): { key: string; type: string; msg: string }[] {
  const alerts: { key: string; type: string; msg: string }[] = [];
  const openSess = sessions.filter(s => s.status === "open");
  for (const s of openSess) {
    const hoursOpen = (Date.now() - new Date(s.opened_at).getTime()) / (1000 * 60 * 60);
    if (hoursOpen > 10) {
      alerts.push({ key: `cassa_timeout_${s.id}`, type: "timeout", msg: `Cassa aperta da oltre ${Math.floor(hoursOpen)}h (dal ${fmtDateTime(s.opened_at)})` });
    }
  }
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const s of sessions) {
    if (s.status === "closed" && new Date(s.opened_at).getTime() > weekAgo) {
      const diff = Math.abs(Number(s.difference ?? 0));
      if (diff > 10) {
        alerts.push({ key: `cassa_diff_${s.id}`, type: "difference", msg: `Differenza di ${eur(Number(s.difference ?? 0))} nella sessione del ${fmtDate(s.opened_at)}` });
      }
    }
  }
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
      alerts.push({ key: `cassa_dup_${key.replace("|", "_")}`, type: "duplicate", msg: `Doppia apertura turno ${t} del ${fmtDate(d + "T00:00:00")}` });
    }
  }
  return alerts;
}

/** Group movements by category with totals */
function categoryTotals(mvs: CashMovement[]): { category: string; label: string; type: "entrata" | "uscita"; total: number; count: number }[] {
  const map = new Map<string, { type: "entrata" | "uscita"; total: number; count: number }>();
  for (const m of mvs) {
    const key = `${m.type}|${m.category}`;
    const cur = map.get(key) ?? { type: m.type, total: 0, count: 0 };
    cur.total += Number(m.amount);
    cur.count++;
    map.set(key, cur);
  }
  return Array.from(map.entries()).map(([key, v]) => ({
    category: key.split("|")[1],
    label: catLabel(key.split("|")[1]),
    type: v.type,
    total: v.total,
    count: v.count,
  }));
}

// ── MovementsTable component ──
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
        {mvs.length === 0 ? (
          <tr><td colSpan={showDelete ? 7 : 6} style={{ textAlign: "center", padding: 20, color: "var(--ink-soft)", fontSize: 13 }}>Nessun movimento registrato in questo turno</td></tr>
        ) : mvs.map(m => (
          <tr key={m.id}>
            <td style={{ whiteSpace: "nowrap", fontSize: 13 }}>{fmtTime(m.created_at)}</td>
            <td>
              <span style={{
                display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                background: m.type === "entrata" ? "#E3EEE4" : "#F5E6E4",
                color: m.type === "entrata" ? "#2D5A3D" : "#9E3B2E",
              }}>
                {m.type === "entrata" ? "+ Entrata" : "- Uscita"}
              </span>
            </td>
            <td style={{ fontWeight: 700, fontSize: 14, color: m.type === "entrata" ? "#2D5A3D" : "#9E3B2E" }}>
              {m.type === "entrata" ? "+" : "-"}{eur(Number(m.amount))}
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
                    onClick={() => onDelete?.(m.id)} title="Elimina movimento">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                  </button>
                </div>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── CategorySummary component ──
function CategorySummary({ mvs }: { mvs: CashMovement[] }) {
  const totals = categoryTotals(mvs);
  const entrate = totals.filter(t => t.type === "entrata");
  const uscite = totals.filter(t => t.type === "uscita");
  const totEntrate = mvs.filter(m => m.type === "entrata").reduce((s, m) => s + Number(m.amount), 0);
  const totUscite = mvs.filter(m => m.type === "uscita").reduce((s, m) => s + Number(m.amount), 0);

  if (totals.length === 0) return null;

  return (
    <div style={{ padding: "16px 20px", borderTop: "1px solid #D8CCB8" }}>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink-soft)", marginBottom: 10 }}>Riepilogo per categoria</div>
      {entrate.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {entrate.map(t => (
            <div key={t.category} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3 }}>
              <span style={{ color: "#2D5A3D" }}>{t.label} ({t.count})</span>
              <strong style={{ color: "#2D5A3D" }}>+{eur(t.total)}</strong>
            </div>
          ))}
        </div>
      )}
      {uscite.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {uscite.map(t => (
            <div key={t.category} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3 }}>
              <span style={{ color: "#9E3B2E" }}>{t.label} ({t.count})</span>
              <strong style={{ color: "#9E3B2E" }}>-{eur(t.total)}</strong>
            </div>
          ))}
        </div>
      )}
      <div style={{ borderTop: "1px solid #D8CCB8", paddingTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
          <span>Totale entrate</span><strong style={{ color: "#2D5A3D" }}>+{eur(totEntrate)}</strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
          <span>Totale uscite</span><strong style={{ color: "#9E3B2E" }}>-{eur(totUscite)}</strong>
        </div>
      </div>
    </div>
  );
}

// ── Main component ──
export default function CassaPage() {
  const supabase = createClient();
  const { isAdmin, role, userId, loading: roleLoading } = useRole();
  const { get: getSetting, loading: settingsLoading } = useSettings();
  const isStaff = role === "staff";
  const fondoCassa = getSetting<number>("cassa_fondo") || FONDO_CASSA;

  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const { toast, showToast } = useToast(3000);

  const [activeSession, setActiveSession] = useState<CashSession | null>(null);
  const [justClosed, setJustClosed] = useState(false);

  // Shift data
  const [shiftTypes, setShiftTypes] = useState<ShiftTypeRow[]>([]);
  const [todayShifts, setTodayShifts] = useState<ShiftRow[]>([]);
  const [staffMap, setStaffMap] = useState<Record<string, string>>({});
  const [currentShiftType, setCurrentShiftType] = useState<ShiftTypeRow | null>(null);
  const [currentShiftStaff, setCurrentShiftStaff] = useState<string | null>(null);
  const [isMyShift, setIsMyShift] = useState(false);

  // Previous session (for auto-fill opening amount)
  const [prevUnclosed, setPrevUnclosed] = useState(false);
  const [prevUnclosedName, setPrevUnclosedName] = useState("");

  // Open session form
  const [openingSession, setOpeningSession] = useState(false);

  // New movement form
  const [mvType, setMvType] = useState<"entrata" | "uscita">("entrata");
  const [mvAmount, setMvAmount] = useState("");
  const [mvCategory, setMvCategory] = useState("camera");
  const [mvDesc, setMvDesc] = useState("");
  const [mvConsegnatoA, setMvConsegnatoA] = useState("");
  const [mvFile, setMvFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [expenseCategories, setExpenseCategories] = useState<{ id: string; name: string }[]>([]);
  const [mvSpesaCatId, setMvSpesaCatId] = useState("");

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
  const [historyMvMap, setHistoryMvMap] = useState<Record<string, CashMovement[]>>({});

  // History pagination
  const SESSIONS_PER_PAGE = 10;
  const [historyPage, setHistoryPage] = useState(1);

  // Movement show-all toggle
  const MOVEMENTS_PREVIEW = 15;
  const [showAllMovements, setShowAllMovements] = useState(false);

  // Quick buttons
  const [quickButtons, setQuickButtons] = useState<QuickButton[]>(DEFAULT_QUICK_BUTTONS);
  const [showAddQuick, setShowAddQuick] = useState(false);
  const [newQuick, setNewQuick] = useState<QuickButton>({ label: "", amount: 0, category: "bar_bevande", type: "entrata", description: "" });

  const printRef = useRef<HTMLDivElement>(null);

  // When type changes, reset category to first option of that type
  useEffect(() => {
    setMvCategory(mvType === "entrata" ? ENTRATA_CATS[0].value : USCITA_CATS[0].value);
    setMvConsegnatoA("");
  }, [mvType]);

  // Load quick buttons from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("cassa_quick_buttons");
      if (stored) setQuickButtons(JSON.parse(stored));
    } catch { /* use defaults */ }
  }, []);

  const saveQuickButtons = (btns: QuickButton[]) => {
    setQuickButtons(btns);
    try { localStorage.setItem("cassa_quick_buttons", JSON.stringify(btns)); } catch {}
  };

  const today = new Date().toISOString().slice(0, 10);

  async function loadData() {
    setLoading(true);
    const [{ data: sessData, error: sessErr }, { data: profData, error: profErr }, { data: stData }, { data: shData }, { data: staffData }, { data: expCats }] = await Promise.all([
      supabase.from("cash_sessions").select("*").order("opened_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name"),
      supabase.from("shift_types").select("*").order("sort"),
      supabase.from("shifts").select("shift_date, shift_type_id, staff_id").eq("shift_date", today),
      supabase.from("staff").select("id, name").eq("active", true),
      supabase.from("categories").select("id, name").order("sort"),
    ]);
    if (sessErr) console.error("[cassa] sessions:", sessErr.message);
    if (profErr) console.error("[cassa] profiles:", profErr.message);
    setExpenseCategories((expCats ?? []) as { id: string; name: string }[]);

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

    const curShift = detectCurrentShift(types);
    setCurrentShiftType(curShift);

    if (curShift) {
      const assigned = shifts.filter(s => s.shift_type_id === curShift.id && s.staff_id);
      const names = assigned.map(s => sMap[s.staff_id!]).filter(Boolean);
      setCurrentShiftStaff(names.length > 0 ? names.join(", ") : null);

      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        const myProfile = (profData ?? []).find((p: { id: string; full_name: string | null }) => p.id === authUser.id);
        if (myProfile?.full_name) {
          const normalise = (s: string) => s.trim().toLowerCase();
          const myStaff = (staffData ?? [] as StaffRow[]).find(
            (s: StaffRow) => normalise(s.name) === normalise(myProfile.full_name!)
          );
          if (myStaff) {
            setIsMyShift(assigned.some(sh => sh.staff_id === myStaff.id));
          } else {
            setIsMyShift(false);
          }
        } else {
          setIsMyShift(false);
        }
      } else {
        setIsMyShift(false);
      }
    } else {
      setIsMyShift(false);
    }

    const open = sess.find(s => s.status === "open");
    setActiveSession(open ?? null);

    if (open) {
      const { data: mvData } = await supabase
        .from("cash_movements").select("*")
        .eq("session_id", open.id)
        .order("created_at", { ascending: false });
      setMovements((mvData ?? []) as CashMovement[]);
    } else {
      setMovements([]);
    }

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

  useEffect(() => { loadData(); /* eslint-disable-next-line */ }, []);

  const sessionTotals = useMemo(() => {
    const openingAmount = activeSession ? Number(activeSession.opening_amount) : fondoCassa;
    const riporto = openingAmount - fondoCassa; // quanto in più del fondo fisso c'era all'apertura
    const entrate = movements.filter(m => m.type === "entrata").reduce((s, m) => s + Number(m.amount), 0);
    const uscite = movements.filter(m => m.type === "uscita").reduce((s, m) => s + Number(m.amount), 0);
    const consegnato = movements.filter(m => m.category === "fondo_cassa_dato").reduce((s, m) => s + Number(m.amount), 0);
    const saldo = openingAmount + entrate - uscite; // In cassa ora
    const daConsegnare = saldo - fondoCassa; // tutto sopra il fondo fisso
    return { openingAmount, fondoFisso: fondoCassa, riporto, entrate, uscite, consegnato, saldo, daConsegnare };
  }, [movements, activeSession, fondoCassa]);

  // Pre-fill amount when selecting "fondo_cassa_dato"
  useEffect(() => {
    if (mvCategory === "fondo_cassa_dato" && sessionTotals.daConsegnare > 0) {
      setMvAmount(sessionTotals.daConsegnare.toFixed(2));
    }
  }, [mvCategory, sessionTotals.daConsegnare]);

  const monthSessions = useMemo(() => {
    const [y, m] = filterMonth.split("-").map(Number);
    return sessions.filter(s => {
      const d = new Date(s.opened_at);
      return d.getFullYear() === y && d.getMonth() + 1 === m;
    });
  }, [sessions, filterMonth]);

  // Reset history pagination when month changes
  useEffect(() => { setHistoryPage(1); }, [filterMonth]);

  // Fetch movements for all closed sessions in the month (for history table columns)
  useEffect(() => {
    const closedIds = monthSessions.filter(s => s.status === "closed").map(s => s.id);
    if (closedIds.length === 0) { setHistoryMvMap({}); return; }
    supabase.from("cash_movements").select("*").in("session_id", closedIds).then(({ data }) => {
      const map: Record<string, CashMovement[]> = {};
      for (const m of (data ?? []) as CashMovement[]) {
        (map[m.session_id] ||= []).push(m);
      }
      setHistoryMvMap(map);
    });
  }, [monthSessions, supabase]);

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

  // Admin alerts with dismissal
  const allAlerts = useMemo(() => computeAlerts(sessions), [sessions]);
  const [dismissedAlertKeys, setDismissedAlertKeys] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const stored = localStorage.getItem("cassa_dismissed_alerts");
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });
  const alerts = allAlerts.filter(a => !dismissedAlertKeys.has(a.key));
  const dismissAlert = (key: string) => {
    setDismissedAlertKeys(prev => {
      const next = new Set(prev);
      next.add(key);
      try { localStorage.setItem("cassa_dismissed_alerts", JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  // Compute opening amount from last closed session
  const computedOpeningAmount = useMemo(() => {
    const closedSorted = sessions
      .filter(s => s.status === "closed" && s.closed_at)
      .sort((a, b) => new Date(b.closed_at!).getTime() - new Date(a.closed_at!).getTime());
    if (closedSorted.length === 0) return fondoCassa;
    const last = closedSorted[0];
    // Use actual_amount (physical count) if available, otherwise expected_amount (calculated)
    if (last.actual_amount != null) return Number(last.actual_amount);
    if (last.expected_amount != null) return Number(last.expected_amount);
    return fondoCassa;
  }, [sessions, fondoCassa]);

  async function openSession() {
    setOpeningSession(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setOpeningSession(false); return; }

    const { error } = await supabase.from("cash_sessions").insert({
      opened_by: user.id, opening_amount: computedOpeningAmount, status: "open",
      shift_date: today,
      shift_type: currentShiftType?.name ?? null,
    }).select().single();

    if (error) { alert("Errore: " + error.message); setOpeningSession(false); return; }
    setOpeningSession(false);
    if (!isAdmin) logClientActivity("create", "cassa", `Apertura cassa con fondo ${computedOpeningAmount}`, { amount: computedOpeningAmount, shift_type: currentShiftType?.name ?? null });
    showToast("Sessione di cassa aperta");
    loadData();
  }

  async function addMovement() {
    const amt = parseFloat(mvAmount);
    if (isNaN(amt) || amt <= 0) return alert("Importo non valido.");
    if (!activeSession) return;
    if (mvCategory === "fondo_cassa_dato" && !mvConsegnatoA.trim()) return alert("Inserisci il nome della persona che ha ricevuto i contanti.");

    // Admin silent: attribute movement to session operator, not admin
    const createdBy = isAdmin ? activeSession.opened_by : userId;
    if (!createdBy) return;

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

    const description = mvCategory === "fondo_cassa_dato"
      ? `Fondo cassa dato a ${mvConsegnatoA.trim()}${mvDesc ? ` — ${mvDesc}` : ""}`
      : mvDesc || null;

    const { data: mvData, error } = await supabase.from("cash_movements").insert({
      session_id: activeSession.id, created_by: createdBy,
      type: mvType, amount: amt, category: mvCategory,
      description, receipt_url: receiptUrl,
    }).select("id").single();

    if (error) return alert("Errore: " + error.message);

    if ((mvCategory === "spesa_piccola" || mvCategory === "fornitore_contanti") && mvData) {
      await supabase.from("expenses").insert({
        amount: amt,
        expense_date: today,
        category_id: mvSpesaCatId || null,
        payment_method: "contanti",
        payment_status: "pagato",
        notes: description || `Da cassa — ${mvCategory === "spesa_piccola" ? "Spesa piccola" : "Fornitore contanti"}`,
        created_by: createdBy,
        source_cash_movement_id: mvData.id,
        document_path: receiptUrl,
      });
    }

    if (!isAdmin) logClientActivity("create", "cassa", `${mvType === "entrata" ? "Entrata" : "Uscita"} di ${amt} — ${mvCategory}`, { type: mvType, amount: amt, category: mvCategory, description: description || null });
    setMvAmount(""); setMvDesc(""); setMvFile(null); setMvConsegnatoA(""); setMvSpesaCatId("");
    setMvCategory(mvType === "entrata" ? ENTRATA_CATS[0].value : USCITA_CATS[0].value);
    if (fileRef.current) fileRef.current.value = "";
    showToast(`${mvType === "entrata" ? "Entrata" : "Uscita"} di ${eur(amt)} registrata`);
    loadData();
  }

  function applyQuickButton(qb: QuickButton) {
    setMvType(qb.type);
    setMvAmount(qb.amount.toFixed(2));
    setMvCategory(qb.category);
    setMvDesc(qb.description);

    if (qb.recipeId) {
      deductRecipeIngredients(qb.recipeId);
    }
  }

  async function deductRecipeIngredients(recipeId: string) {
    try {
      const res = await fetch("/api/drink-lab/deduct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipeId }),
      });
      const data = await res.json();
      if (data.ok) {
        const recipe = BAR_RECIPES.find(r => r.id === recipeId);
        const name = recipe?.name ?? recipeId;
        if (data.warnings?.length > 0) {
          showToast(`🍹 ${name} — ingredienti scaricati. ⚠ ${data.warnings.join("; ")}`);
        } else {
          showToast(`🍹 ${name} — ingredienti scaricati dal magazzino`);
        }
      }
    } catch {
      // Stock deduction failure should never block the sale
    }
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

    if (!isAdmin) logClientActivity("update", "cassa", `Chiusura cassa — atteso ${expected}, effettivo ${amt}, diff ${diff}`, { expected, actual: amt, difference: diff });
    setShowClose(false); setActualAmount(""); setCloseNotes("");
    if (isStaff) setJustClosed(true);
    showToast("Sessione chiusa. Differenza: " + eur(diff));
    loadData();
  }

  async function deleteMovement(id: string) {
    if (!confirm("Sei sicuro di voler eliminare questo movimento?")) return;
    const mv = movements.find(m => m.id === id);

    const { data: linkedExpense } = await supabase
      .from("expenses").select("id").eq("source_cash_movement_id", id).maybeSingle();
    if (linkedExpense) {
      const delExpense = confirm("Questo movimento ha una spesa collegata. Eliminare anche la spesa?");
      if (delExpense) {
        await supabase.from("expenses").delete().eq("id", linkedExpense.id);
      }
    }

    await supabase.from("cash_movements").delete().eq("id", id);
    if (!isAdmin) logClientActivity("delete", "cassa", `Movimento eliminato: ${mv?.type ?? "?"} ${mv?.amount ?? 0}`, { movementId: id, type: mv?.type, amount: mv?.amount });
    showToast("Movimento eliminato");
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

  // ── Close modal data ──
  const closeCatTotals = useMemo(() => categoryTotals(movements), [movements]);
  const closeDiff = actualAmount && !isNaN(parseFloat(actualAmount)) ? parseFloat(actualAmount) - sessionTotals.saldo : null;
  const closeDiffColor = closeDiff === null ? undefined : Math.abs(closeDiff) < 0.01 ? "#2D5A3D" : closeDiff < 0 ? "#9E3B2E" : "#C77B4A";

  if (loading || roleLoading || settingsLoading) return <div className="empty">Caricamento...</div>;

  // Categories for current movement type
  const currentCats = mvType === "entrata" ? ENTRATA_CATS : USCITA_CATS;

  return (
    <>
      {/* Title + subtitle */}
      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="serif" style={{ fontSize: 24, fontWeight: 500 }}>Cassa</h1>
          <p style={{ fontSize: 14, color: "#888", fontFamily: "'Albert Sans', sans-serif", margin: "2px 0 0" }}>Registro movimenti contanti</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {!activeSession && !isStaff && (
            <button className="btn-ghost" style={{ padding: "8px 14px", borderRadius: 8, fontSize: 13 }}
              onClick={openSession} disabled={openingSession}>
              {openingSession ? "Apertura..." : `Apri sessione${currentShiftType ? ` — ${currentShiftType.name}` : ""}`}
            </button>
          )}
          {activeSession && (
            <>
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
            </>
          )}
        </div>
      </div>

      {/* Shift info bar — always show operator name, never admin's name */}
      {currentShiftType && (!isStaff || isMyShift) && (
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

      {/* Admin alerts */}
      {isAdmin && alerts.length > 0 && (
        <div className="no-print" style={{ marginBottom: 20 }}>
          {alerts.map(a => (
            <div key={a.key} style={{
              padding: "10px 16px", marginBottom: 8, borderRadius: 10,
              background: "#F5E6E4", border: "1px solid #9E3B2E40",
              fontSize: 13, color: "#9E3B2E", display: "flex", alignItems: "center", gap: 8,
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9E3B2E" strokeWidth="2" style={{ flexShrink: 0 }}>
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" />
              </svg>
              <span style={{ flex: 1 }}>{a.msg}</span>
              <button onClick={() => dismissAlert(a.key)} style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 6px", fontSize: 16, color: "#9E3B2E", opacity: 0.6, flexShrink: 0, lineHeight: 1 }} title="Chiudi alert">&times;</button>
            </div>
          ))}
        </div>
      )}

      {/* Unclosed previous session warning */}
      {!activeSession && prevUnclosed && (
        <div className="no-print" style={{
          padding: "12px 16px", marginBottom: 20, borderRadius: 10,
          background: "#FFF8F0", border: "1px solid #C77B4A40",
          fontSize: 13, color: "#C77B4A",
        }}>
          <strong>Attenzione:</strong> La cassa del turno precedente ({prevUnclosedName}) non &egrave; stata chiusa. Contatta l&apos;amministratore.
        </div>
      )}

      {/* Staff just closed: success */}
      {isStaff && justClosed && !activeSession && (
        <div className="section" style={{ maxWidth: 520, margin: "40px auto", textAlign: "center" }}>
          <div className="section-body" style={{ padding: 40 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>&#10003;</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "#2D5A3D", marginBottom: 8 }}>Cassa chiusa correttamente</h2>
            <p style={{ color: "#6C6B5D", fontSize: 14 }}>Buon riposo!</p>
          </div>
        </div>
      )}

      {/* No active session: staff sees "Apri cassa", admin/manager sees banner + storico */}
      {!activeSession && !prevUnclosed && !justClosed && isStaff && (
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
            {!isMyShift && (
              <div style={{ padding: "12px 16px", marginBottom: 16, borderRadius: 10, background: "#FFF8F0", border: "1px solid #C77B4A40", fontSize: 13, color: "#C77B4A" }}>
                Non sei in turno al momento. Solo chi è in turno può aprire la cassa.
              </div>
            )}

            {isMyShift && (
              <>
                <div style={{ padding: "14px 18px", borderRadius: 10, background: "#F3EBDD", marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 14, color: "#1F3326" }}>Fondo cassa iniziale</span>
                    <strong style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, color: "#1F3326" }}>{eur(computedOpeningAmount)}</strong>
                  </div>
                  {computedOpeningAmount > fondoCassa + 0.01 && (
                    <div style={{ fontSize: 12, color: "#C77B4A", marginTop: 6 }}>
                      Fondo fisso {eur(fondoCassa)} + riporto turno precedente {eur(computedOpeningAmount - fondoCassa)}
                    </div>
                  )}
                </div>

                <button className="btn btn-primary" style={{ width: "100%", padding: "14px", fontSize: 15 }}
                  onClick={openSession} disabled={openingSession}>
                  {openingSession ? "Apertura..." : `Apri cassa${currentShiftType ? ` — ${currentShiftType.name}` : ""}`}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Admin/Manager: no active session banner */}
      {!activeSession && !isStaff && !justClosed && (
        <div className="no-print" style={{
          padding: "14px 20px", marginBottom: 20, borderRadius: 10,
          background: "#F3EBDD", border: "1px solid #D8CCB8",
          fontSize: 14, color: "#1F3326", display: "flex", alignItems: "center", gap: 10,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#BFA762" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
          </svg>
          <span>Nessuna sessione di cassa attiva al momento.{computedOpeningAmount > fondoCassa + 0.01 ? ` Fondo disponibile: ${eur(computedOpeningAmount)} (fondo ${eur(fondoCassa)} + riporto ${eur(computedOpeningAmount - fondoCassa)}).` : ""}</span>
        </div>
      )}

      {/* Active session */}
      {activeSession && (
        <>
          {/* Shift badge */}
          {activeSession.shift_type && (
            <div className="no-print" style={{
              display: "inline-block", padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700,
              background: "#F3EBDD", color: "#1F3326", marginBottom: 16,
            }}>
              Turno: {activeSession.shift_type} — {fmtDate(activeSession.shift_date ? activeSession.shift_date + "T00:00:00" : activeSession.opened_at)}
            </div>
          )}

          {/* KPI Cards */}
          <div className="no-print" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 24 }}>
            <div className="section" style={{ borderTop: "3px solid #1F3326" }}>
              <div className="section-body" style={{ padding: "14px 16px" }}>
                <div style={{ fontSize: 11, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Fondo fisso</div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, color: "#1F3326" }}>{eur(sessionTotals.fondoFisso)}</div>
              </div>
            </div>
            {sessionTotals.riporto > 0.01 && (
              <div className="section" style={{ borderTop: "3px solid #C77B4A" }}>
                <div className="section-body" style={{ padding: "14px 16px" }}>
                  <div style={{ fontSize: 11, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Riporto turno prec.</div>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, color: "#C77B4A" }}>+{eur(sessionTotals.riporto)}</div>
                </div>
              </div>
            )}
            <div className="section" style={{ borderTop: "3px solid #2D5A3D" }}>
              <div className="section-body" style={{ padding: "14px 16px" }}>
                <div style={{ fontSize: 11, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Entrate turno</div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, color: "#2D5A3D" }}>+{eur(sessionTotals.entrate)}</div>
              </div>
            </div>
            <div className="section" style={{ borderTop: "3px solid #9E3B2E" }}>
              <div className="section-body" style={{ padding: "14px 16px" }}>
                <div style={{ fontSize: 11, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Uscite turno</div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, color: "#9E3B2E" }}>-{eur(sessionTotals.uscite)}</div>
              </div>
            </div>
            <div className="section" style={{ borderTop: "3px solid #4F7B8C" }}>
              <div className="section-body" style={{ padding: "14px 16px" }}>
                <div style={{ fontSize: 11, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>In cassa ora</div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, color: "#1F3326" }}>{eur(sessionTotals.saldo)}</div>
              </div>
            </div>
            <div className="section" style={{ borderTop: `3px solid ${sessionTotals.daConsegnare > 0.01 ? "#BFA762" : sessionTotals.daConsegnare < -0.01 ? "#9E3B2E" : "#2D5A3D"}` }}>
              <div className="section-body" style={{ padding: "14px 16px" }}>
                <div style={{ fontSize: 11, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Da consegnare</div>
                <div style={{
                  fontFamily: "'Bebas Neue', sans-serif", fontSize: 26,
                  color: sessionTotals.daConsegnare > 0.01 ? "#BFA762" : sessionTotals.daConsegnare < -0.01 ? "#9E3B2E" : "#2D5A3D",
                }}>{eur(sessionTotals.daConsegnare)}</div>
                {sessionTotals.consegnato > 0 && (
                  <div style={{ fontSize: 11, color: "#2D5A3D", marginTop: 2 }}>Già consegnato: {eur(sessionTotals.consegnato)}</div>
                )}
              </div>
            </div>
          </div>

          {/* Info bar */}
          <div className="no-print" style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 20, fontSize: 13, color: "var(--ink-soft)", flexWrap: "wrap" }}>
            <span>Aperta da <strong>{profiles[activeSession.opened_by] || "?"}</strong></span>
            <span>il <strong>{fmtDateTime(activeSession.opened_at)}</strong></span>
            <span>{movements.length} movimenti</span>
          </div>

          {/* Quick buttons */}
          {quickButtons.length > 0 && (
            <div className="no-print" style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: 1 }}>Rapidi:</span>
              {quickButtons.map((qb, i) => (
                <button key={i} type="button"
                  style={{
                    padding: "8px 14px", borderRadius: 20, fontSize: 13, fontWeight: 600,
                    border: "1.5px solid #D8CCB8", background: "#fff", color: "#1F3326",
                    cursor: "pointer", fontFamily: "inherit", transition: "all .15s",
                  }}
                  onClick={() => applyQuickButton(qb)}
                  onMouseOver={e => { (e.target as HTMLElement).style.background = "#F3EBDD"; }}
                  onMouseOut={e => { (e.target as HTMLElement).style.background = "#fff"; }}
                >
                  {qb.label} {qb.amount.toLocaleString("it-IT", { minimumFractionDigits: 2 })} €
                </button>
              ))}
              {isAdmin && (
                <button type="button" onClick={() => setShowAddQuick(true)}
                  style={{
                    padding: "8px 12px", borderRadius: 20, fontSize: 16, fontWeight: 700,
                    border: "1.5px dashed #D8CCB8", background: "transparent", color: "#BFA762",
                    cursor: "pointer", lineHeight: 1,
                  }} title="Aggiungi bottone rapido">+</button>
              )}
            </div>
          )}

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
                  <label>Importo (EUR)</label>
                  <input type="number" min="0.01" step="0.01" value={mvAmount}
                    onChange={e => setMvAmount(e.target.value)} placeholder="0.00" />
                </div>
                <div className="field">
                  <label>Categoria</label>
                  <select value={mvCategory} onChange={e => setMvCategory(e.target.value)}>
                    {currentCats.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
              </div>

              {/* "Consegnato a" — only for fondo_cassa_dato */}
              {mvCategory === "fondo_cassa_dato" && (
                <div className="field" style={{ marginBottom: 8 }}>
                  <label>Consegnato a <span style={{ color: "#9E3B2E" }}>*</span></label>
                  <input value={mvConsegnatoA} onChange={e => setMvConsegnatoA(e.target.value)} placeholder="Nome della persona che riceve i contanti" />
                </div>
              )}

              {/* Categoria spesa — only for spesa_piccola/fornitore_contanti */}
              {(mvCategory === "spesa_piccola" || mvCategory === "fornitore_contanti") && (
                <div className="field" style={{ marginBottom: 8 }}>
                  <label>Categoria spesa</label>
                  <select value={mvSpesaCatId} onChange={e => setMvSpesaCatId(e.target.value)}>
                    <option value="">— Nessuna —</option>
                    {expenseCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}

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

          {/* Movements list with category summary */}
          <div className="section no-print" style={{ marginBottom: 24 }}>
            <div className="section-head">
              <h2>Movimenti di questo turno</h2>
              {movements.length > MOVEMENTS_PREVIEW && (
                <span className="muted" style={{ fontSize: 12 }}>{movements.length} totali</span>
              )}
            </div>
            <div className="section-body" style={{ padding: 0 }}>
              <MovementsTable
                mvs={movements.length > MOVEMENTS_PREVIEW && !showAllMovements ? movements.slice(0, MOVEMENTS_PREVIEW) : movements}
                profiles={profiles}
                showDelete
                onDelete={deleteMovement}
              />
              {movements.length > MOVEMENTS_PREVIEW && (
                <div style={{ padding: "12px 16px", textAlign: "center", borderTop: "1px solid #D8CCB8" }}>
                  <button
                    className="btn-ghost"
                    style={{ padding: "8px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600 }}
                    onClick={() => setShowAllMovements(!showAllMovements)}
                  >
                    {showAllMovements ? `Mostra ultimi ${MOVEMENTS_PREVIEW}` : `Mostra tutti (${movements.length})`}
                  </button>
                </div>
              )}
              <CategorySummary mvs={movements} />
            </div>
          </div>

          {/* PRINT-ONLY report */}
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
              <span>Apertura: {eur(sessionTotals.openingAmount)}{sessionTotals.riporto > 0.01 ? ` (fondo ${eur(sessionTotals.fondoFisso)} + riporto ${eur(sessionTotals.riporto)})` : ` (fondo ${eur(sessionTotals.fondoFisso)})`}</span>
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
                  {[...movements].reverse().map((m, i) => (
                    <tr key={m.id} style={{ background: i % 2 === 0 ? "#fff" : "#F3EBDD" }}>
                      <td style={{ padding: "5px 8px" }}>{fmtTime(m.created_at)}</td>
                      <td style={{ padding: "5px 8px", fontWeight: 700, color: m.type === "entrata" ? "#2D5A3D" : "#9E3B2E" }}>
                        {m.type === "entrata" ? "Entrata" : "Uscita"}
                      </td>
                      <td style={{ padding: "5px 8px" }}>{catLabel(m.category)}</td>
                      <td style={{ padding: "5px 8px" }}>{m.description || "—"}</td>
                      <td style={{ padding: "5px 8px" }}>{profiles[m.created_by] || "?"}</td>
                      <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700, color: m.type === "entrata" ? "#2D5A3D" : "#9E3B2E" }}>
                        {m.type === "entrata" ? "+" : "-"}{eur(Number(m.amount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div style={{ borderTop: "2px solid #1F3326", paddingTop: 10, fontSize: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span>Fondo fisso</span><strong>{eur(sessionTotals.fondoFisso)}</strong>
              </div>
              {sessionTotals.riporto > 0.01 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, color: "#C77B4A" }}>
                  <span>Riporto turno prec.</span><strong>+{eur(sessionTotals.riporto)}</strong>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, color: "#2D5A3D" }}>
                <span>Incassi turno</span><strong>+{eur(sessionTotals.entrate)}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, color: "#9E3B2E" }}>
                <span>Uscite turno</span><strong>-{eur(sessionTotals.uscite)}</strong>
              </div>
              {sessionTotals.consegnato > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, color: "#4F7B8C" }}>
                  <span>Consegnato</span><strong>{eur(sessionTotals.consegnato)}</strong>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, borderTop: "1px solid #D8CCB8", paddingTop: 6, fontSize: 14 }}>
                <strong>In cassa ora</strong><strong>{eur(sessionTotals.saldo)}</strong>
              </div>
              {sessionTotals.daConsegnare > 0.01 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, color: "#C77B4A" }}>
                  <span>Da consegnare</span><strong>{eur(sessionTotals.daConsegnare)}</strong>
                </div>
              )}
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

      {/* Close session modal — enhanced with category breakdown */}
      {showClose && activeSession && (
        <div className="modal-overlay" onClick={() => setShowClose(false)}>
          <div className="modal-card" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
            <div className="section-head" style={{ padding: "20px 24px", borderBottom: "1px solid var(--line)" }}>
              <h2>Chiusura cassa — Turno {activeSession.shift_type || ""} {fmtDate(activeSession.shift_date ? activeSession.shift_date + "T00:00:00" : activeSession.opened_at)}</h2>
              <button className="btn-ghost" style={{ padding: "4px 10px", borderRadius: 8 }} onClick={() => setShowClose(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div style={{ padding: 24, maxHeight: "70vh", overflowY: "auto" }}>
              {/* Category breakdown */}
              {closeCatTotals.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: "#1F3326" }}>Riepilogo per categoria</div>
                  {closeCatTotals.filter(t => t.type === "entrata").length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#2D5A3D", marginBottom: 4 }}>Entrate</div>
                      {closeCatTotals.filter(t => t.type === "entrata").map(t => (
                        <div key={t.category} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 2, paddingLeft: 8 }}>
                          <span>{t.label} ({t.count})</span>
                          <strong style={{ color: "#2D5A3D" }}>+{eur(t.total)}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                  {closeCatTotals.filter(t => t.type === "uscita").length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#9E3B2E", marginBottom: 4 }}>Uscite</div>
                      {closeCatTotals.filter(t => t.type === "uscita").map(t => (
                        <div key={t.category} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 2, paddingLeft: 8 }}>
                          <span>{t.label} ({t.count})</span>
                          <strong style={{ color: "#9E3B2E" }}>-{eur(t.total)}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Totals summary */}
              <div style={{ marginBottom: 16, padding: 16, background: "#F3EBDD", borderRadius: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span>Fondo fisso</span>
                  <strong>{eur(sessionTotals.fondoFisso)}</strong>
                </div>
                {sessionTotals.riporto > 0.01 && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, color: "#C77B4A" }}>
                    <span>Riporto turno prec.</span>
                    <strong>+{eur(sessionTotals.riporto)}</strong>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, color: "#2D5A3D" }}>
                  <span>Incassi turno ({movements.filter(m => m.type === "entrata").length})</span>
                  <strong>+{eur(sessionTotals.entrate)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, color: "#9E3B2E" }}>
                  <span>Uscite turno ({movements.filter(m => m.type === "uscita").length})</span>
                  <strong>-{eur(sessionTotals.uscite)}</strong>
                </div>
                {sessionTotals.consegnato > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, color: "#4F7B8C" }}>
                    <span>Consegnato</span>
                    <strong>{eur(sessionTotals.consegnato)}</strong>
                  </div>
                )}
                <div style={{ borderTop: "1px solid #D8CCB8", paddingTop: 8, display: "flex", justifyContent: "space-between", fontSize: 16 }}>
                  <strong>In cassa ora</strong>
                  <strong style={{ color: "#1F3326" }}>{eur(sessionTotals.saldo)}</strong>
                </div>
              </div>

              {/* Warning: still money to hand over */}
              {sessionTotals.daConsegnare > 0.01 && (
                <div style={{
                  padding: 14, borderRadius: 10, marginBottom: 12,
                  background: "#FFF8F0", border: "1px solid #C77B4A40",
                  fontSize: 14, textAlign: "center", color: "#C77B4A", fontWeight: 600,
                }}>
                  Ci sono ancora {eur(sessionTotals.daConsegnare)} da consegnare
                </div>
              )}

              {/* Actual count */}
              <div className="field">
                <label style={{ fontWeight: 700 }}>Conteggio effettivo in cassa (EUR)</label>
                <input type="number" min="0" step="0.01" value={actualAmount}
                  onChange={e => setActualAmount(e.target.value)} placeholder="0.00" autoFocus
                  style={{ fontSize: 18, padding: "12px 16px", fontWeight: 700 }} />
              </div>

              {/* Difference display */}
              {closeDiff !== null && (
                <div style={{
                  padding: 14, borderRadius: 10, marginBottom: 12, marginTop: 4,
                  background: closeDiffColor === "#2D5A3D" ? "#E3EEE4" : closeDiffColor === "#9E3B2E" ? "#F5E6E4" : "#FFF8F0",
                  fontWeight: 700, fontSize: 16, textAlign: "center",
                  color: closeDiffColor,
                }}>
                  Differenza: {eur(closeDiff)}
                  {Math.abs(closeDiff) < 0.01 && " — Tutto quadra!"}
                  {closeDiff > 0.01 && " — Soldi in più (errore di resto?)"}
                </div>
              )}

              <div className="field">
                <label>Note chiusura (opzionale)</label>
                <input value={closeNotes} onChange={e => setCloseNotes(e.target.value)} placeholder="Es. tutto quadra, banconota da 50 mancante..." />
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button className="btn-ghost" style={{ flex: 1, padding: 12, borderRadius: 8 }} onClick={() => setShowClose(false)}>Annulla</button>
                <button className="btn btn-primary" style={{ flex: 1, padding: 12, background: "#9E3B2E" }} onClick={closeSession}>
                  Conferma chiusura
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add quick button modal (admin only) */}
      {showAddQuick && (
        <div className="modal-overlay" onClick={() => setShowAddQuick(false)}>
          <div className="modal-card" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div className="section-head" style={{ padding: "20px 24px", borderBottom: "1px solid var(--line)" }}>
              <h2>Nuovo bottone rapido</h2>
              <button className="btn-ghost" style={{ padding: "4px 10px", borderRadius: 8 }} onClick={() => setShowAddQuick(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Etichetta</label>
                <input value={newQuick.label} onChange={e => setNewQuick({ ...newQuick, label: e.target.value })} placeholder="Es. Caffe" />
              </div>
              <div className="grid2">
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Importo (EUR)</label>
                  <input type="number" min="0.01" step="0.01" value={newQuick.amount || ""} onChange={e => setNewQuick({ ...newQuick, amount: Number(e.target.value) })} />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Tipo</label>
                  <select value={newQuick.type} onChange={e => setNewQuick({ ...newQuick, type: e.target.value as "entrata" | "uscita", category: e.target.value === "entrata" ? ENTRATA_CATS[0].value : USCITA_CATS[0].value })}>
                    <option value="entrata">Entrata</option>
                    <option value="uscita">Uscita</option>
                  </select>
                </div>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Categoria</label>
                <select value={newQuick.category} onChange={e => setNewQuick({ ...newQuick, category: e.target.value })}>
                  {(newQuick.type === "entrata" ? ENTRATA_CATS : USCITA_CATS).map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Descrizione auto</label>
                <input value={newQuick.description} onChange={e => setNewQuick({ ...newQuick, description: e.target.value })} placeholder="Es. Caffe" />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Ricetta collegata <span className="muted" style={{ fontWeight: 400 }}>(opzionale — scarico automatico magazzino)</span></label>
                <select value={newQuick.recipeId ?? ""} onChange={e => setNewQuick({ ...newQuick, recipeId: e.target.value || undefined })}>
                  <option value="">Nessuna</option>
                  {BAR_RECIPES.map(r => <option key={r.id} value={r.id}>{r.emoji} {r.name} — €{r.price ?? "?"}</option>)}
                </select>
              </div>
              <button className="btn btn-primary" style={{ marginTop: 4 }} onClick={() => {
                if (!newQuick.label.trim() || newQuick.amount <= 0) return alert("Compila etichetta e importo.");
                saveQuickButtons([...quickButtons, { ...newQuick, label: newQuick.label.trim(), description: newQuick.description.trim() }]);
                setNewQuick({ label: "", amount: 0, category: "bar_bevande", type: "entrata", description: "" });
                setShowAddQuick(false);
                showToast("Bottone rapido aggiunto");
              }}>Aggiungi</button>
            </div>
            {/* Existing quick buttons with remove */}
            {quickButtons.length > 0 && (
              <div style={{ padding: "0 24px 24px" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-soft)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Bottoni esistenti</div>
                {quickButtons.map((qb, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #F3EBDD", fontSize: 13 }}>
                    <span>{qb.label} — {qb.amount.toLocaleString("it-IT", { minimumFractionDigits: 2 })} € ({catLabel(qb.category)})</span>
                    <button className="btn-ghost" style={{ padding: "2px 6px", color: "#9E3B2E", fontSize: 11 }}
                      onClick={() => {
                        saveQuickButtons(quickButtons.filter((_, idx) => idx !== i));
                        showToast("Bottone rimosso");
                      }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* History section — admin/manager only */}
      {!isStaff && (
        <div className="section no-print" style={{ marginTop: activeSession ? 0 : 32 }}>
          <div className="section-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <h2>Storico sessioni</h2>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <select value={parseInt(filterMonth.split("-")[1])} onChange={e => {
                const y = filterMonth.split("-")[0];
                setFilterMonth(`${y}-${String(e.target.value).padStart(2, "0")}`);
              }} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #D8CCB8", fontSize: 13, fontFamily: "inherit" }}>
                {["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"].map((m, i) => (
                  <option key={i + 1} value={i + 1}>{m}</option>
                ))}
              </select>
              <select value={parseInt(filterMonth.split("-")[0])} onChange={e => {
                const m = filterMonth.split("-")[1];
                setFilterMonth(`${e.target.value}-${m}`);
              }} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #D8CCB8", fontSize: 13, fontFamily: "inherit" }}>
                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="section-body" style={{ padding: 0 }}>
            {(() => {
              const closedSessions = monthSessions.filter(s => s.status === "closed");
              if (closedSessions.length === 0) {
                return <div className="empty" style={{ padding: 32 }}>Nessuna sessione chiusa in questo mese.</div>;
              }
              const totalPages = Math.ceil(closedSessions.length / SESSIONS_PER_PAGE);
              const pageStart = (historyPage - 1) * SESSIONS_PER_PAGE;
              const pageSessions = closedSessions.slice(pageStart, pageStart + SESSIONS_PER_PAGE);
              return (
                <>
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Turno</th>
                        <th className="hide-sm">Operatore</th>
                        <th style={{ textAlign: "right" }} className="hide-sm">Riporto</th>
                        <th style={{ textAlign: "right" }}>Incassi</th>
                        <th style={{ textAlign: "right" }}>Consegnato</th>
                        <th style={{ textAlign: "right" }} className="hide-sm">Residuo</th>
                        <th style={{ textAlign: "right" }}>Effettivo</th>
                        <th>Diff.</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageSessions.map(s => {
                        const sMvs = historyMvMap[s.id] ?? [];
                        const sIncassi = sMvs.filter(m => m.type === "entrata").reduce((a, m) => a + Number(m.amount), 0);
                        const sUscite = sMvs.filter(m => m.type === "uscita").reduce((a, m) => a + Number(m.amount), 0);
                        const sConsegnato = sMvs.filter(m => m.category === "fondo_cassa_dato").reduce((a, m) => a + Number(m.amount), 0);
                        const sOpenAmount = Number(s.opening_amount);
                        const sRiporto = sOpenAmount - fondoCassa;
                        const sInCassa = sOpenAmount + sIncassi - sUscite;
                        const sResiduo = sInCassa - fondoCassa - sConsegnato;
                        const hasActual = s.actual_amount != null;
                        const diff = hasActual ? Number(s.actual_amount) - sInCassa : 0;
                        const diffColor = !hasActual ? undefined : Math.abs(diff) < 0.01 ? "#2D5A3D" : diff < 0 ? "#9E3B2E" : "#C77B4A";
                        return (
                          <tr key={s.id}>
                            <td style={{ fontWeight: 600, fontSize: 13 }}>{fmtDate(s.opened_at)}</td>
                            <td style={{ fontSize: 12 }}>
                              {s.shift_type ? (
                                <span style={{ padding: "2px 8px", borderRadius: 10, background: "#F3EBDD", fontWeight: 600 }}>{s.shift_type}</span>
                              ) : "—"}
                            </td>
                            <td className="hide-sm" style={{ fontSize: 13 }}>{profiles[s.opened_by] || "?"}</td>
                            <td className="hide-sm" style={{ fontSize: 13, textAlign: "right", color: sRiporto > 0.01 ? "#C77B4A" : undefined }}>
                              {sRiporto > 0.01 ? `+${eur(sRiporto)}` : "—"}
                            </td>
                            <td style={{ fontSize: 13, textAlign: "right", color: "#2D5A3D", fontWeight: 600 }}>
                              {sIncassi > 0 ? `+${eur(sIncassi)}` : "—"}
                            </td>
                            <td style={{ fontSize: 13, textAlign: "right", color: sConsegnato > 0 ? "#4F7B8C" : undefined }}>
                              {sConsegnato > 0 ? eur(sConsegnato) : "—"}
                            </td>
                            <td className="hide-sm" style={{ fontSize: 13, textAlign: "right", color: sResiduo > 0.01 ? "#C77B4A" : "#2D5A3D", fontWeight: sResiduo > 0.01 ? 700 : 400 }}>
                              {Math.abs(sResiduo) < 0.01 ? "—" : eur(sResiduo)}
                            </td>
                            <td style={{ fontSize: 13, textAlign: "right" }}>{hasActual ? eur(Number(s.actual_amount)) : "—"}</td>
                            <td style={{ fontWeight: 700, fontSize: 13, color: diffColor }}>
                              {!hasActual ? "—" : `${diff >= 0 ? "+" : ""}${eur(diff)}`}
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
                  {totalPages > 1 && (
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
                      padding: "12px 16px", borderTop: "1px solid #D8CCB8", fontSize: 13,
                    }}>
                      <button
                        className="btn-ghost"
                        style={{ padding: "6px 14px", borderRadius: 8, fontSize: 13, opacity: historyPage <= 1 ? 0.4 : 1 }}
                        disabled={historyPage <= 1}
                        onClick={() => setHistoryPage(p => p - 1)}
                      >
                        &larr; Precedente
                      </button>
                      <span style={{ fontWeight: 600, color: "var(--ink-soft)" }}>
                        Pagina {historyPage} di {totalPages}
                      </span>
                      <button
                        className="btn-ghost"
                        style={{ padding: "6px 14px", borderRadius: 8, fontSize: 13, opacity: historyPage >= totalPages ? 0.4 : 1 }}
                        disabled={historyPage >= totalPages}
                        onClick={() => setHistoryPage(p => p + 1)}
                      >
                        Successiva &rarr;
                      </button>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}

      {!isStaff && monthSessions.filter(s => s.status === "closed").length > 0 && (
        <div className="no-print" style={{ display: "flex", gap: 16, marginTop: 16, fontSize: 13, color: "var(--ink-soft)", flexWrap: "wrap" }}>
          <span>Sessioni chiuse: <strong>{monthStats.sessCount}</strong></span>
          <span>Differenza totale mese: <strong style={{ color: Math.abs(monthStats.totalDiff) < 0.01 ? "#2D5A3D" : "#9E3B2E" }}>
            {monthStats.totalDiff >= 0 ? "+" : ""}{eur(monthStats.totalDiff)}
          </strong></span>
        </div>
      )}

      {/* Session detail modal */}
      {!isStaff && viewSession && (
        <div className="modal-overlay" onClick={() => setViewSession(null)}>
          <div className="modal-card" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
            <div className="section-head" style={{ padding: "20px 24px", borderBottom: "1px solid var(--line)" }}>
              <h2>
                Sessione del {fmtDate(viewSession.opened_at)}
                {viewSession.shift_type && <span style={{ fontWeight: 400, fontSize: 14, marginLeft: 8 }}>— {viewSession.shift_type}</span>}
              </h2>
              <button className="btn-ghost" style={{ padding: "4px 10px", borderRadius: 8 }} onClick={() => setViewSession(null)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div style={{ padding: 24, maxHeight: "70vh", overflowY: "auto" }}>
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
                    <span>Fondo fisso</span><strong>{eur(fondoCassa)}</strong>
                  </div>
                  {(() => {
                    const vOpenAmount = Number(viewSession.opening_amount);
                    const vRiporto = vOpenAmount - fondoCassa;
                    const vIncassi = viewMovements.filter(m => m.type === "entrata").reduce((s, m) => s + Number(m.amount), 0);
                    const vUscite = viewMovements.filter(m => m.type === "uscita").reduce((s, m) => s + Number(m.amount), 0);
                    const vConsegnato = viewMovements.filter(m => m.category === "fondo_cassa_dato").reduce((s, m) => s + Number(m.amount), 0);
                    const vInCassa = vOpenAmount + vIncassi - vUscite;
                    const vDiff = viewSession.actual_amount != null ? Number(viewSession.actual_amount) - vInCassa : null;
                    const vDiffColor = vDiff === null ? undefined : Math.abs(vDiff) < 0.01 ? "#2D5A3D" : vDiff < 0 ? "#9E3B2E" : "#C77B4A";
                    return (<>
                      {vRiporto > 0.01 && (
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, color: "#C77B4A" }}>
                          <span>Riporto turno prec.</span><strong>+{eur(vRiporto)}</strong>
                        </div>
                      )}
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, color: "#2D5A3D" }}>
                        <span>Incassi turno</span><strong>+{eur(vIncassi)}</strong>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, color: "#9E3B2E" }}>
                        <span>Uscite turno</span><strong>-{eur(vUscite)}</strong>
                      </div>
                      {vConsegnato > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, color: "#4F7B8C" }}>
                          <span>Consegnato</span><strong>{eur(vConsegnato)}</strong>
                        </div>
                      )}
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span>In cassa calcolato</span><strong>{eur(vInCassa)}</strong>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span>Effettivo</span><strong>{viewSession.actual_amount != null ? eur(Number(viewSession.actual_amount)) : "—"}</strong>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #D8CCB8", paddingTop: 6, fontSize: 14 }}>
                        <strong>Differenza</strong>
                        <strong style={{ color: vDiffColor }}>
                          {vDiff === null ? "—" : `${vDiff >= 0 ? "+" : ""}${eur(vDiff)}`}
                        </strong>
                      </div>
                    </>);
                  })()}
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
                              {m.type === "entrata" ? "+" : "-"}{eur(Number(m.amount))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ marginTop: 12, padding: 12, background: "#F3EBDD", borderRadius: 8, fontSize: 13 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, color: "#2D5A3D" }}>
                      <span>Subtotale entrate</span>
                      <strong>+{eur(viewMovements.filter(m => m.type === "entrata").reduce((s, m) => s + Number(m.amount), 0))}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#9E3B2E" }}>
                      <span>Subtotale uscite</span>
                      <strong>-{eur(viewMovements.filter(m => m.type === "uscita").reduce((s, m) => s + Number(m.amount), 0))}</strong>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      <Toast toast={toast} />

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
