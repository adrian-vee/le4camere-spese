"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRole } from "@/lib/useRole";
import { useSettings } from "@/lib/useSettings";
import { useToast } from "@/lib/useToast";
import { Toast } from "@/components/Toast";
import { logClientActivity } from "@/lib/activityLog";
import { eur, fmtDate, isoToday } from "@/lib/format";
import { CloseSessionModal } from "./CloseSessionModal";
import { ViewSessionModal } from "./ViewSessionModal";

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

const ALL_CATS = [
  ...ENTRATA_CATS, ...USCITA_CATS,
  { value: "vendita_bar", label: "Vendita Bar" },
  { value: "vendita", label: "Vendita" },
  { value: "servizio", label: "Servizio" },
  { value: "pagamento_fornitore", label: "Pagamento fornitore" },
  { value: "prelievo", label: "Prelievo" },
  { value: "deposito", label: "Deposito" },
  { value: "altro", label: "Altro" },
];

const CARD: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #D8CCB8",
  borderRadius: 16,
  boxShadow: "0 2px 8px rgba(31,51,38,0.04)",
};

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

function isPosBar(m: CashMovement): boolean {
  return !!(m.description && /Vendita Bar/i.test(m.description));
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
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#888", marginBottom: 10 }}>Riepilogo per categoria</div>
      {entrate.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {entrate.map(t => (
            <div key={t.category} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3 }}>
              <span style={{ color: "#2d6a4f" }}>{t.label} ({t.count})</span>
              <strong style={{ color: "#2d6a4f" }}>+{eur(t.total)}</strong>
            </div>
          ))}
        </div>
      )}
      {uscite.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {uscite.map(t => (
            <div key={t.category} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3 }}>
              <span style={{ color: "#C4453C" }}>{t.label} ({t.count})</span>
              <strong style={{ color: "#C4453C" }}>-{eur(t.total)}</strong>
            </div>
          ))}
        </div>
      )}
      <div style={{ borderTop: "1px solid #D8CCB8", paddingTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
          <span>Totale entrate</span><strong style={{ color: "#2d6a4f" }}>+{eur(totEntrate)}</strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
          <span>Totale uscite</span><strong style={{ color: "#C4453C" }}>-{eur(totUscite)}</strong>
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
  const { toast, showToast } = useToast();

  const [activeSession, setActiveSession] = useState<CashSession | null>(null);
  const [justClosed, setJustClosed] = useState(false);

  const [shiftTypes, setShiftTypes] = useState<ShiftTypeRow[]>([]);
  const [todayShifts, setTodayShifts] = useState<ShiftRow[]>([]);
  const [staffMap, setStaffMap] = useState<Record<string, string>>({});
  const [currentShiftType, setCurrentShiftType] = useState<ShiftTypeRow | null>(null);
  const [currentShiftStaff, setCurrentShiftStaff] = useState<string | null>(null);
  const [isMyShift, setIsMyShift] = useState(false);

  const [prevUnclosed, setPrevUnclosed] = useState(false);
  const [prevUnclosedName, setPrevUnclosedName] = useState("");

  const [openingSession, setOpeningSession] = useState(false);
  const [savingMovement, setSavingMovement] = useState(false);

  const [mvType, setMvType] = useState<"entrata" | "uscita">("entrata");
  const [mvAmount, setMvAmount] = useState("");
  const [mvCategory, setMvCategory] = useState("camera");
  const [mvDesc, setMvDesc] = useState("");
  const [mvConsegnatoA, setMvConsegnatoA] = useState("");
  const [mvFile, setMvFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [expenseCategories, setExpenseCategories] = useState<{ id: string; name: string }[]>([]);
  const [mvSpesaCatId, setMvSpesaCatId] = useState("");
  const [dragging, setDragging] = useState(false);

  const [showClose, setShowClose] = useState(false);

  const [viewSession, setViewSession] = useState<CashSession | null>(null);
  const [viewMovements, setViewMovements] = useState<CashMovement[]>([]);

  const now = new Date();
  const [filterMonth, setFilterMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [historyMvMap, setHistoryMvMap] = useState<Record<string, CashMovement[]>>({});

  const SESSIONS_PER_PAGE = 10;
  const [historyPage, setHistoryPage] = useState(1);

  const MOVEMENTS_PREVIEW = 15;
  const [showAllMovements, setShowAllMovements] = useState(false);

  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMvCategory(mvType === "entrata" ? ENTRATA_CATS[0].value : USCITA_CATS[0].value);
    setMvConsegnatoA("");
  }, [mvType]);

  const today = isoToday();

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

  const visibleSessions = useMemo(() => {
    if (isStaff && userId) return sessions.filter(s => s.opened_by === userId);
    return sessions;
  }, [sessions, isStaff, userId]);

  const sessionTotals = useMemo(() => {
    const openingAmount = activeSession ? Number(activeSession.opening_amount) : fondoCassa;
    const riporto = openingAmount - fondoCassa;
    const entrate = movements.filter(m => m.type === "entrata").reduce((s, m) => s + Number(m.amount), 0);
    const uscite = movements.filter(m => m.type === "uscita").reduce((s, m) => s + Number(m.amount), 0);
    const consegnato = movements.filter(m => m.category === "fondo_cassa_dato").reduce((s, m) => s + Number(m.amount), 0);
    const saldo = openingAmount + entrate - uscite;
    const daConsegnare = saldo - fondoCassa;
    return { openingAmount, fondoFisso: fondoCassa, riporto, entrate, uscite, consegnato, saldo, daConsegnare };
  }, [movements, activeSession, fondoCassa]);

  useEffect(() => {
    if (mvCategory === "fondo_cassa_dato" && sessionTotals.daConsegnare > 0) {
      setMvAmount(sessionTotals.daConsegnare.toFixed(2));
    }
  }, [mvCategory, sessionTotals.daConsegnare]);

  const monthSessions = useMemo(() => {
    const [y, m] = filterMonth.split("-").map(Number);
    return visibleSessions.filter(s => {
      const d = new Date(s.opened_at);
      return d.getFullYear() === y && d.getMonth() + 1 === m;
    });
  }, [visibleSessions, filterMonth]);

  useEffect(() => { setHistoryPage(1); }, [filterMonth]);

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

  const allAlerts = useMemo(() => computeAlerts(visibleSessions), [visibleSessions]);
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

  const computedOpeningAmount = useMemo(() => {
    const closedSorted = visibleSessions
      .filter(s => s.status === "closed" && s.closed_at)
      .sort((a, b) => new Date(b.closed_at!).getTime() - new Date(a.closed_at!).getTime());
    if (closedSorted.length === 0) return fondoCassa;
    const last = closedSorted[0];
    if (last.actual_amount != null) return Number(last.actual_amount);
    if (last.expected_amount != null) return Number(last.expected_amount);
    return fondoCassa;
  }, [visibleSessions, fondoCassa]);

  async function openSession() {
    setOpeningSession(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setOpeningSession(false); return; }

    const { error } = await supabase.from("cash_sessions").insert({
      opened_by: user.id, opening_amount: computedOpeningAmount, status: "open",
      shift_date: today,
      shift_type: currentShiftType?.name ?? null,
    }).select().single();

    if (error) { showToast("Errore: " + error.message, "error"); setOpeningSession(false); return; }
    setOpeningSession(false);
    if (!isAdmin) logClientActivity("create", "cassa", `Apertura cassa con fondo ${computedOpeningAmount}`, { amount: computedOpeningAmount, shift_type: currentShiftType?.name ?? null });
    showToast("Sessione di cassa aperta");
    loadData();
  }

  async function addMovement() {
    const amt = parseFloat(mvAmount);
    if (isNaN(amt) || amt <= 0) { showToast("Importo non valido.", "warn"); return; }
    if (!activeSession) return;
    if (mvCategory === "fondo_cassa_dato" && !mvConsegnatoA.trim()) { showToast("Inserisci il nome della persona che ha ricevuto i contanti.", "warn"); return; }
    if (savingMovement) return;
    setSavingMovement(true);
    try {

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

    if (error) { showToast("Errore: " + error.message, "error"); return; }

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

    } finally { setSavingMovement(false); }
  }

  async function closeSession(amt: number, notes: string) {
    if (!activeSession) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const expected = sessionTotals.saldo;
    const diff = amt - expected;

    const { error } = await supabase.from("cash_sessions").update({
      closed_at: new Date().toISOString(), closed_by: user.id,
      expected_amount: expected, actual_amount: amt, difference: diff,
      notes: notes || null, status: "closed",
    }).eq("id", activeSession.id);

    if (error) { showToast("Errore: " + error.message, "error"); return; }

    if (!isAdmin) logClientActivity("update", "cassa", `Chiusura cassa — atteso ${expected}, effettivo ${amt}, diff ${diff}`, { expected, actual: amt, difference: diff });
    setShowClose(false);
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

  const closeCatTotals = useMemo(() => categoryTotals(movements), [movements]);

  if (loading || roleLoading || settingsLoading) return <div className="empty">Caricamento...</div>;

  const currentCats = mvType === "entrata" ? ENTRATA_CATS : USCITA_CATS;
  const displayMvs = movements.length > MOVEMENTS_PREVIEW && !showAllMovements ? movements.slice(0, MOVEMENTS_PREVIEW) : movements;
  const todayFmt = new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });

  return (
    <>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* ── Header ── */}
        <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 600, color: "#1F3326", margin: 0 }}>Cassa</h1>
            <p style={{ fontSize: 14, color: "#888", fontFamily: "'Albert Sans', sans-serif", margin: "4px 0 0" }}>Registro movimenti contanti</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {!activeSession && !isStaff && (
              <button style={{
                padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600,
                border: "1px solid #D8CCB8", background: "#fff", color: "#1F3326",
                cursor: "pointer", fontFamily: "'Albert Sans', sans-serif",
              }} onClick={openSession} disabled={openingSession}>
                {openingSession ? "Apertura..." : `Apri sessione${currentShiftType ? ` — ${currentShiftType.name}` : ""}`}
              </button>
            )}
            {activeSession && (
              <>
                <button style={{
                  padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600,
                  border: "1px solid #D8CCB8", background: "#fff", color: "#1F3326",
                  cursor: "pointer", fontFamily: "'Albert Sans', sans-serif",
                  display: "flex", alignItems: "center", gap: 6,
                }} onClick={() => window.print()}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" /><rect x="6" y="14" width="12" height="8" />
                  </svg>
                  Stampa report
                </button>
                <button style={{
                  padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 700,
                  border: "none", background: "#C4453C", color: "#fff",
                  cursor: "pointer", fontFamily: "'Albert Sans', sans-serif",
                }} onClick={() => setShowClose(true)}>
                  Chiudi cassa
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── Shift info card (dark) ── */}
        {currentShiftType && (!isStaff || isMyShift) && (
          <div className="no-print" style={{
            background: "#1F3326", color: "#fff", borderRadius: 12, padding: "14px 20px",
            marginBottom: 20, fontFamily: "'Albert Sans', sans-serif", fontSize: 14,
            display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
          }}>
            <span>Turno: <strong>{currentShiftType.name}</strong> {currentShiftType.start_time.slice(0, 5)}–{currentShiftType.end_time.slice(0, 5)}</span>
            <span style={{ opacity: 0.4 }}>&middot;</span>
            {currentShiftStaff ? (
              <span>Operatore: <strong>{currentShiftStaff}</strong></span>
            ) : (
              <span style={{ color: "#C77B4A" }}>Nessuno assegnato</span>
            )}
            <span style={{ opacity: 0.4 }}>&middot;</span>
            <span>{todayFmt}</span>
          </div>
        )}

        {/* ── Admin alerts ── */}
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

        {/* ── Unclosed previous session warning ── */}
        {!activeSession && prevUnclosed && (
          <div className="no-print" style={{
            padding: "12px 16px", marginBottom: 20, borderRadius: 10,
            background: "#FFF8F0", border: "1px solid #C77B4A40",
            fontSize: 13, color: "#C77B4A",
          }}>
            <strong>Attenzione:</strong> La cassa del turno precedente ({prevUnclosedName}) non &egrave; stata chiusa. Contatta l&apos;amministratore.
          </div>
        )}

        {/* ── Staff just closed: success ── */}
        {isStaff && justClosed && !activeSession && (
          <div style={{ maxWidth: 520, margin: "40px auto", textAlign: "center", ...CARD, padding: 40 }}>
            <div style={{ fontSize: 48, marginBottom: 16, color: "#2d6a4f" }}>&#10003;</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "#2d6a4f", marginBottom: 8, fontFamily: "'Albert Sans', sans-serif" }}>Cassa chiusa correttamente</h2>
            <p style={{ color: "#6C6B5D", fontSize: 14, margin: 0 }}>Buon riposo!</p>
          </div>
        )}

        {/* ── Staff: open cassa form ── */}
        {!activeSession && !prevUnclosed && !justClosed && isStaff && (
          <div className="no-print" style={{ maxWidth: 520, margin: "40px auto", ...CARD, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #D8CCB8" }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, fontFamily: "'Albert Sans', sans-serif", color: "#1F3326" }}>
                Apri cassa
                {currentShiftType && <span style={{ fontWeight: 400, fontSize: 14, marginLeft: 8, color: "#888" }}>
                  — Turno {currentShiftType.name}
                </span>}
              </h2>
            </div>
            <div style={{ padding: 24 }}>
              {!isMyShift && (
                <div style={{ padding: "12px 16px", marginBottom: 16, borderRadius: 10, background: "#FFF8F0", border: "1px solid #C77B4A40", fontSize: 13, color: "#C77B4A" }}>
                  Non sei in turno al momento. Solo chi &egrave; in turno pu&ograve; aprire la cassa.
                </div>
              )}
              {isMyShift && (
                <>
                  <div style={{ padding: "14px 18px", borderRadius: 10, background: "#F3EBDD", marginBottom: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 14, color: "#1F3326" }}>Fondo cassa iniziale</span>
                      <strong style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 24, fontWeight: 700, color: "#1F3326" }}>{eur(computedOpeningAmount)}</strong>
                    </div>
                    {computedOpeningAmount > fondoCassa + 0.01 && (
                      <div style={{ fontSize: 12, color: "#C77B4A", marginTop: 6 }}>
                        Fondo fisso {eur(fondoCassa)} + riporto turno precedente {eur(computedOpeningAmount - fondoCassa)}
                      </div>
                    )}
                  </div>
                  <button style={{
                    width: "100%", padding: 14, fontSize: 15, fontWeight: 700,
                    borderRadius: 10, border: "none", background: "#1F3326", color: "#fff",
                    cursor: "pointer", fontFamily: "'Albert Sans', sans-serif",
                  }} onClick={openSession} disabled={openingSession}>
                    {openingSession ? "Apertura..." : `Apri cassa${currentShiftType ? ` — ${currentShiftType.name}` : ""}`}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Admin/Manager: no active session banner ── */}
        {!activeSession && !isStaff && !justClosed && (
          <div className="no-print" style={{
            padding: "14px 20px", marginBottom: 20, borderRadius: 12,
            background: "#F3EBDD", border: "1px solid #D8CCB8",
            fontSize: 14, color: "#1F3326", display: "flex", alignItems: "center", gap: 10,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#BFA762" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
            </svg>
            <span>Nessuna sessione di cassa attiva al momento.{computedOpeningAmount > fondoCassa + 0.01 ? ` Fondo disponibile: ${eur(computedOpeningAmount)} (fondo ${eur(fondoCassa)} + riporto ${eur(computedOpeningAmount - fondoCassa)}).` : ""}</span>
          </div>
        )}

        {/* ══════════════════ ACTIVE SESSION ══════════════════ */}
        {activeSession && (
          <>
            {/* ── KPI Cards ── */}
            <div className="no-print" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16, marginBottom: 24 }}>
              {[
                { label: "FONDO FISSO", value: eur(sessionTotals.fondoFisso), color: "#1F3326", textColor: "#1F3326" },
                { label: "RIPORTO TURNO PREC.", value: `+${eur(sessionTotals.riporto)}`, color: "#BFA762", textColor: "#BFA762" },
                { label: "ENTRATE TURNO", value: `+${eur(sessionTotals.entrate)}`, color: "#2d6a4f", textColor: "#2d6a4f" },
                { label: "USCITE TURNO", value: `-${eur(sessionTotals.uscite)}`, color: "#C4453C", textColor: "#C4453C" },
                { label: "IN CASSA ORA", value: eur(sessionTotals.saldo), color: "#1F3326", textColor: "#1F3326" },
                { label: "DA CONSEGNARE", value: eur(sessionTotals.daConsegnare), color: "#BFA762", textColor: sessionTotals.daConsegnare > 0.01 ? "#BFA762" : sessionTotals.daConsegnare < -0.01 ? "#C4453C" : "#2d6a4f" },
              ].map((kpi) => (
                <div key={kpi.label} style={{ ...CARD, borderRadius: 12, borderTop: `3px solid ${kpi.color}`, padding: "16px 18px" }}>
                  <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, fontFamily: "'Albert Sans', sans-serif", fontWeight: 600 }}>{kpi.label}</div>
                  <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 24, fontWeight: 600, color: kpi.textColor }}>{kpi.value}</div>
                  {kpi.label === "DA CONSEGNARE" && sessionTotals.consegnato > 0 && (
                    <div style={{ fontSize: 11, color: "#2d6a4f", marginTop: 4 }}>Già consegnato: {eur(sessionTotals.consegnato)}</div>
                  )}
                </div>
              ))}
            </div>

            {/* ── Movements card ── */}
            <div className="no-print" style={{ ...CARD, overflow: "hidden", marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid #D8CCB8" }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, fontFamily: "'Albert Sans', sans-serif", color: "#1F3326" }}>
                  Movimenti del turno <span style={{ fontWeight: 400, color: "#888" }}>({movements.length})</span>
                </h2>
                {movements.length > MOVEMENTS_PREVIEW && (
                  <button onClick={() => setShowAllMovements(!showAllMovements)} style={{
                    background: "none", border: "none", cursor: "pointer",
                    fontSize: 13, color: "#BFA762", fontWeight: 600, fontFamily: "'Albert Sans', sans-serif",
                  }}>
                    {showAllMovements ? "Mostra meno" : "Vedi tutti →"}
                  </button>
                )}
              </div>

              {movements.length === 0 ? (
                <div style={{ padding: 32, textAlign: "center", color: "#888", fontSize: 13 }}>
                  Nessun movimento registrato in questo turno
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#FAF9F5" }}>
                      <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#888", fontFamily: "'Albert Sans', sans-serif" }}>Ora</th>
                      <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#888", fontFamily: "'Albert Sans', sans-serif" }}>Tipo</th>
                      <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#888", fontFamily: "'Albert Sans', sans-serif" }}>Descrizione</th>
                      <th style={{ padding: "10px 16px", textAlign: "right", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#888", fontFamily: "'Albert Sans', sans-serif" }}>Importo</th>
                      <th style={{ width: 60 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayMvs.map((m, i) => (
                      <tr key={m.id}
                        style={{ background: i % 2 === 0 ? "#fff" : "#FAF9F5", cursor: "default", transition: "background .12s" }}
                        onMouseOver={e => { e.currentTarget.style.background = "#F3EBDD"; }}
                        onMouseOut={e => { e.currentTarget.style.background = i % 2 === 0 ? "#fff" : "#FAF9F5"; }}
                      >
                        <td style={{ padding: "12px 16px", fontSize: 13, whiteSpace: "nowrap", color: "#6C6B5D", fontFamily: "'Albert Sans', sans-serif" }}>
                          {fmtTime(m.created_at)}
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          {isPosBar(m) ? (
                            <span style={{ display: "inline-block", padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: "#E3EEE4", color: "#2d6a4f", whiteSpace: "nowrap" }}>
                              POS Bar
                            </span>
                          ) : (
                            <span style={{ display: "inline-block", padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: "#F3EBDD", color: "#6C6B5D", whiteSpace: "nowrap" }}>
                              Manuale
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <div style={{ fontSize: 13, color: "#1F3326", fontWeight: 500, fontFamily: "'Albert Sans', sans-serif" }}>
                            {m.description || catLabel(m.category)}
                          </div>
                          <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                            {catLabel(m.category)}{m.description ? "" : ""} &middot; {profiles[m.created_by] || "?"}
                          </div>
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 600, fontSize: 16, color: m.type === "entrata" ? "#2d6a4f" : "#C4453C", fontFamily: "'Albert Sans', sans-serif" }}>
                          {m.type === "entrata" ? "+" : "-"}{eur(Number(m.amount))}
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "right" }}>
                          <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                            {m.receipt_url && (
                              <a href={m.receipt_url} target="_blank" rel="noreferrer"
                                style={{ padding: "4px 6px", borderRadius: 6, fontSize: 11, color: "#BFA762", textDecoration: "none" }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                              </a>
                            )}
                            <button style={{ padding: "4px 6px", borderRadius: 6, border: "none", background: "none", cursor: "pointer", color: "#C4453C", opacity: 0.5 }}
                              onClick={() => deleteMovement(m.id)} title="Elimina">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {movements.length > MOVEMENTS_PREVIEW && (
                <div style={{ padding: "12px 16px", textAlign: "center", borderTop: "1px solid #D8CCB8" }}>
                  <button onClick={() => setShowAllMovements(!showAllMovements)}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: "8px 20px", fontSize: 13, fontWeight: 600, color: "#BFA762", fontFamily: "'Albert Sans', sans-serif" }}>
                    {showAllMovements ? `Mostra ultimi ${MOVEMENTS_PREVIEW}` : `Mostra tutti (${movements.length})`}
                  </button>
                </div>
              )}

              <CategorySummary mvs={movements} />
            </div>

            {/* ── New movement card ── */}
            <div className="no-print" style={{ ...CARD, overflow: "hidden", marginBottom: 24 }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #D8CCB8" }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, fontFamily: "'Albert Sans', sans-serif", color: "#1F3326" }}>
                  Registra movimento manuale
                </h2>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "#888" }}>
                  Per movimenti non legati al POS Bar (pagamenti camera, spese, ecc.)
                </p>
              </div>
              <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
                {/* Toggle Entrata/Uscita */}
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" onClick={() => setMvType("entrata")}
                    style={{
                      padding: "10px 20px", borderRadius: 20, fontSize: 13, fontWeight: 700,
                      cursor: "pointer", fontFamily: "'Albert Sans', sans-serif", transition: "all .15s",
                      border: mvType === "entrata" ? "none" : "1px solid #D8CCB8",
                      background: mvType === "entrata" ? "#2d6a4f" : "#F3EBDD",
                      color: mvType === "entrata" ? "#fff" : "#1F3326",
                    }}>
                    + Entrata
                  </button>
                  <button type="button" onClick={() => setMvType("uscita")}
                    style={{
                      padding: "10px 20px", borderRadius: 20, fontSize: 13, fontWeight: 700,
                      cursor: "pointer", fontFamily: "'Albert Sans', sans-serif", transition: "all .15s",
                      border: mvType === "uscita" ? "none" : "1px solid #D8CCB8",
                      background: mvType === "uscita" ? "#C4453C" : "#F3EBDD",
                      color: mvType === "uscita" ? "#fff" : "#1F3326",
                    }}>
                    - Uscita
                  </button>
                </div>

                {/* Amount with € prefix */}
                <div>
                  <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 600, color: "#1F3326", fontFamily: "'Albert Sans', sans-serif" }}>Importo</label>
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 20, color: "#6C6B5D", fontWeight: 600, pointerEvents: "none", fontFamily: "'Albert Sans', sans-serif" }}>€</span>
                    <input type="number" min="0.01" step="0.01" value={mvAmount}
                      onChange={e => setMvAmount(e.target.value)} placeholder="0,00"
                      style={{
                        width: "100%", padding: "12px 14px 12px 40px", fontSize: 20, fontWeight: 600,
                        border: "1px solid #D8CCB8", borderRadius: 10, fontFamily: "'Albert Sans', sans-serif",
                        color: "#1F3326", outline: "none", boxSizing: "border-box",
                      }}
                      onFocus={e => { e.target.style.borderColor = "#BFA762"; }}
                      onBlur={e => { e.target.style.borderColor = "#D8CCB8"; }}
                    />
                  </div>
                </div>

                {/* Category */}
                <div>
                  <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 600, color: "#1F3326", fontFamily: "'Albert Sans', sans-serif" }}>Categoria</label>
                  <select value={mvCategory} onChange={e => setMvCategory(e.target.value)}
                    style={{
                      width: "100%", padding: "10px 14px", fontSize: 14,
                      border: "1px solid #D8CCB8", borderRadius: 10, fontFamily: "'Albert Sans', sans-serif",
                      color: "#1F3326", background: "#fff", outline: "none", cursor: "pointer",
                    }}
                    onFocus={e => { e.target.style.borderColor = "#BFA762"; }}
                    onBlur={e => { e.target.style.borderColor = "#D8CCB8"; }}
                  >
                    {currentCats.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>

                {/* Consegnato a — only for fondo_cassa_dato */}
                {mvCategory === "fondo_cassa_dato" && (
                  <div>
                    <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 600, color: "#1F3326", fontFamily: "'Albert Sans', sans-serif" }}>
                      Consegnato a <span style={{ color: "#C4453C" }}>*</span>
                    </label>
                    <input value={mvConsegnatoA} onChange={e => setMvConsegnatoA(e.target.value)}
                      placeholder="Nome della persona che riceve i contanti"
                      style={{
                        width: "100%", padding: "10px 14px", fontSize: 14,
                        border: "1px solid #D8CCB8", borderRadius: 10, fontFamily: "'Albert Sans', sans-serif",
                        color: "#1F3326", outline: "none", boxSizing: "border-box",
                      }}
                      onFocus={e => { e.target.style.borderColor = "#BFA762"; }}
                      onBlur={e => { e.target.style.borderColor = "#D8CCB8"; }}
                    />
                  </div>
                )}

                {/* Categoria spesa — only for spesa_piccola/fornitore_contanti */}
                {(mvCategory === "spesa_piccola" || mvCategory === "fornitore_contanti") && (
                  <div>
                    <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 600, color: "#1F3326", fontFamily: "'Albert Sans', sans-serif" }}>Categoria spesa</label>
                    <select value={mvSpesaCatId} onChange={e => setMvSpesaCatId(e.target.value)}
                      style={{
                        width: "100%", padding: "10px 14px", fontSize: 14,
                        border: "1px solid #D8CCB8", borderRadius: 10, fontFamily: "'Albert Sans', sans-serif",
                        color: "#1F3326", background: "#fff", outline: "none", cursor: "pointer",
                      }}>
                      <option value="">— Nessuna —</option>
                      {expenseCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                )}

                {/* Description */}
                <div>
                  <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 600, color: "#1F3326", fontFamily: "'Albert Sans', sans-serif" }}>Descrizione</label>
                  <input value={mvDesc} onChange={e => setMvDesc(e.target.value)}
                    placeholder="Es. Pagamento camera 3"
                    style={{
                      width: "100%", padding: "10px 14px", fontSize: 14,
                      border: "1px solid #D8CCB8", borderRadius: 10, fontFamily: "'Albert Sans', sans-serif",
                      color: "#1F3326", outline: "none", boxSizing: "border-box",
                    }}
                    onFocus={e => { e.target.style.borderColor = "#BFA762"; }}
                    onBlur={e => { e.target.style.borderColor = "#D8CCB8"; }}
                  />
                </div>

                {/* Upload ricevuta — drag & drop area */}
                <div>
                  <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 600, color: "#1F3326", fontFamily: "'Albert Sans', sans-serif" }}>Ricevuta (opzionale)</label>
                  <div
                    onClick={() => fileRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={e => {
                      e.preventDefault();
                      setDragging(false);
                      const file = e.dataTransfer.files[0];
                      if (file) setMvFile(file);
                    }}
                    style={{
                      border: `2px dashed ${dragging ? "#BFA762" : mvFile ? "#2d6a4f" : "#D8CCB8"}`,
                      borderRadius: 10, padding: "18px 20px", textAlign: "center",
                      cursor: "pointer", background: dragging ? "#F3EBDD" : mvFile ? "#f0f7f1" : "#FAF9F5",
                      transition: "all .15s",
                    }}
                  >
                    <input type="file" accept="image/*,.pdf" ref={fileRef}
                      onChange={e => setMvFile(e.target.files?.[0] ?? null)}
                      style={{ display: "none" }}
                    />
                    {mvFile ? (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2d6a4f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                        <span style={{ fontSize: 13, color: "#1F3326", fontWeight: 600 }}>{mvFile.name}</span>
                        <button type="button" onClick={e => { e.stopPropagation(); setMvFile(null); if (fileRef.current) fileRef.current.value = ""; }}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#C4453C", fontSize: 16, lineHeight: 1, padding: "0 4px" }}>&times;</button>
                      </div>
                    ) : (
                      <div>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 4 }}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>
                        <div style={{ fontSize: 13, color: "#888" }}>Trascina qui o clicca per caricare</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Submit */}
                <button onClick={addMovement} disabled={savingMovement}
                  style={{
                    width: "100%", padding: 14, fontSize: 15, fontWeight: 700,
                    borderRadius: 10, border: "none", background: "#1F3326", color: "#fff",
                    cursor: savingMovement ? "wait" : "pointer", fontFamily: "'Albert Sans', sans-serif",
                    opacity: savingMovement ? 0.7 : 1, transition: "opacity .15s",
                  }}>
                  {savingMovement ? "Salvataggio..." : "Registra movimento"}
                </button>
              </div>
            </div>

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

        {/* ── Close session modal ── */}
        <CloseSessionModal
          isOpen={showClose && !!activeSession}
          onClose={() => setShowClose(false)}
          activeSession={activeSession}
          sessionTotals={sessionTotals}
          movements={movements}
          closeCatTotals={closeCatTotals}
          fondoCassa={fondoCassa}
          onConfirm={closeSession}
        />

        {/* ── History section — admin/manager only ── */}
        {!isStaff && (
          <div style={{ ...CARD, overflow: "hidden", marginTop: activeSession ? 0 : 32 }} className="no-print">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, padding: "16px 20px", borderBottom: "1px solid #D8CCB8" }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, fontFamily: "'Albert Sans', sans-serif", color: "#1F3326" }}>Storico sessioni</h2>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <select value={parseInt(filterMonth.split("-")[1])} onChange={e => {
                  const y = filterMonth.split("-")[0];
                  setFilterMonth(`${y}-${String(e.target.value).padStart(2, "0")}`);
                }} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #D8CCB8", fontSize: 13, fontFamily: "'Albert Sans', sans-serif" }}>
                  {["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"].map((m, i) => (
                    <option key={i + 1} value={i + 1}>{m}</option>
                  ))}
                </select>
                <select value={parseInt(filterMonth.split("-")[0])} onChange={e => {
                  const m = filterMonth.split("-")[1];
                  setFilterMonth(`${e.target.value}-${m}`);
                }} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #D8CCB8", fontSize: 13, fontFamily: "'Albert Sans', sans-serif" }}>
                  {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ padding: 0 }}>
              {(() => {
                const closedSessions = monthSessions.filter(s => s.status === "closed");
                if (closedSessions.length === 0) {
                  return <div style={{ padding: 32, textAlign: "center", color: "#888", fontSize: 13 }}>Nessuna sessione chiusa in questo mese.</div>;
                }
                const totalPages = Math.ceil(closedSessions.length / SESSIONS_PER_PAGE);
                const pageStart = (historyPage - 1) * SESSIONS_PER_PAGE;
                const pageSessions = closedSessions.slice(pageStart, pageStart + SESSIONS_PER_PAGE);
                return (
                  <>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "#FAF9F5" }}>
                          {["Data","Turno"].map(h => (
                            <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#888", fontFamily: "'Albert Sans', sans-serif" }}>{h}</th>
                          ))}
                          <th className="hide-sm" style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#888", fontFamily: "'Albert Sans', sans-serif" }}>Operatore</th>
                          <th className="hide-sm" style={{ padding: "10px 12px", textAlign: "right", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#888", fontFamily: "'Albert Sans', sans-serif" }}>Riporto</th>
                          <th style={{ padding: "10px 12px", textAlign: "right", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#888", fontFamily: "'Albert Sans', sans-serif" }}>Incassi</th>
                          <th style={{ padding: "10px 12px", textAlign: "right", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#888", fontFamily: "'Albert Sans', sans-serif" }}>Consegnato</th>
                          <th className="hide-sm" style={{ padding: "10px 12px", textAlign: "right", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#888", fontFamily: "'Albert Sans', sans-serif" }}>Residuo</th>
                          <th style={{ padding: "10px 12px", textAlign: "right", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#888", fontFamily: "'Albert Sans', sans-serif" }}>Effettivo</th>
                          <th style={{ padding: "10px 12px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#888", fontFamily: "'Albert Sans', sans-serif" }}>Diff.</th>
                          <th style={{ width: 80 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {pageSessions.map((s, i) => {
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
                          const diffColor = !hasActual ? undefined : Math.abs(diff) < 0.01 ? "#2d6a4f" : diff < 0 ? "#C4453C" : "#C77B4A";
                          return (
                            <tr key={s.id} style={{ background: i % 2 === 0 ? "#fff" : "#FAF9F5" }}>
                              <td style={{ padding: "10px 12px", fontWeight: 600, fontSize: 13 }}>{fmtDate(s.opened_at)}</td>
                              <td style={{ padding: "10px 12px", fontSize: 12 }}>
                                {s.shift_type ? (
                                  <span style={{ padding: "3px 10px", borderRadius: 10, background: "#F3EBDD", fontWeight: 600, fontSize: 11 }}>{s.shift_type}</span>
                                ) : "—"}
                              </td>
                              <td className="hide-sm" style={{ padding: "10px 12px", fontSize: 13 }}>{profiles[s.opened_by] || "?"}</td>
                              <td className="hide-sm" style={{ padding: "10px 12px", fontSize: 13, textAlign: "right", color: sRiporto > 0.01 ? "#BFA762" : undefined }}>
                                {sRiporto > 0.01 ? `+${eur(sRiporto)}` : "—"}
                              </td>
                              <td style={{ padding: "10px 12px", fontSize: 13, textAlign: "right", color: "#2d6a4f", fontWeight: 600 }}>
                                {sIncassi > 0 ? `+${eur(sIncassi)}` : "—"}
                              </td>
                              <td style={{ padding: "10px 12px", fontSize: 13, textAlign: "right", color: sConsegnato > 0 ? "#4F7B8C" : undefined }}>
                                {sConsegnato > 0 ? eur(sConsegnato) : "—"}
                              </td>
                              <td className="hide-sm" style={{ padding: "10px 12px", fontSize: 13, textAlign: "right", color: sResiduo > 0.01 ? "#C77B4A" : "#2d6a4f", fontWeight: sResiduo > 0.01 ? 700 : 400 }}>
                                {Math.abs(sResiduo) < 0.01 ? "—" : eur(sResiduo)}
                              </td>
                              <td style={{ padding: "10px 12px", fontSize: 13, textAlign: "right" }}>{hasActual ? eur(Number(s.actual_amount)) : "—"}</td>
                              <td style={{ padding: "10px 12px", fontWeight: 700, fontSize: 13, color: diffColor }}>
                                {!hasActual ? "—" : `${diff >= 0 ? "+" : ""}${eur(diff)}`}
                              </td>
                              <td style={{ padding: "10px 12px", textAlign: "right" }}>
                                <button style={{
                                  padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                                  border: "1px solid #D8CCB8", background: "#fff", color: "#1F3326",
                                  cursor: "pointer", fontFamily: "'Albert Sans', sans-serif",
                                }} onClick={() => viewHistorySession(s)}>
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
                          style={{
                            padding: "6px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                            border: "1px solid #D8CCB8", background: "#fff", color: "#1F3326",
                            cursor: historyPage <= 1 ? "default" : "pointer",
                            opacity: historyPage <= 1 ? 0.4 : 1, fontFamily: "'Albert Sans', sans-serif",
                          }}
                          disabled={historyPage <= 1}
                          onClick={() => setHistoryPage(p => p - 1)}
                        >
                          &larr; Precedente
                        </button>
                        <span style={{ fontWeight: 600, color: "#888" }}>
                          Pagina {historyPage} di {totalPages}
                        </span>
                        <button
                          style={{
                            padding: "6px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                            border: "1px solid #D8CCB8", background: "#fff", color: "#1F3326",
                            cursor: historyPage >= totalPages ? "default" : "pointer",
                            opacity: historyPage >= totalPages ? 0.4 : 1, fontFamily: "'Albert Sans', sans-serif",
                          }}
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
          <div className="no-print" style={{ display: "flex", gap: 16, marginTop: 16, fontSize: 13, color: "#888", flexWrap: "wrap" }}>
            <span>Sessioni chiuse: <strong style={{ color: "#1F3326" }}>{monthStats.sessCount}</strong></span>
            <span>Differenza totale mese: <strong style={{ color: Math.abs(monthStats.totalDiff) < 0.01 ? "#2d6a4f" : "#C4453C" }}>
              {monthStats.totalDiff >= 0 ? "+" : ""}{eur(monthStats.totalDiff)}
            </strong></span>
          </div>
        )}
      </div>

      {/* Session detail modal */}
      <ViewSessionModal
        session={viewSession}
        onClose={() => setViewSession(null)}
        movements={viewMovements}
        profiles={profiles}
        fondoCassa={fondoCassa}
        isStaff={isStaff}
      />

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
