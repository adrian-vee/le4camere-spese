"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";

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

export default function CassaPage() {
  const supabase = createClient();

  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  // Current session
  const [activeSession, setActiveSession] = useState<CashSession | null>(null);

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

  // Close session form
  const [showClose, setShowClose] = useState(false);
  const [actualAmount, setActualAmount] = useState("");
  const [closeNotes, setCloseNotes] = useState("");

  // History view
  const [viewSession, setViewSession] = useState<CashSession | null>(null);
  const [viewMovements, setViewMovements] = useState<CashMovement[]>([]);

  // Monthly filter
  const now = new Date();
  const [filterMonth, setFilterMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);

  function showToastMsg(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function loadData() {
    setLoading(true);
    const [{ data: sessData }, { data: profData }] = await Promise.all([
      supabase.from("cash_sessions").select("*").order("opened_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name"),
    ]);

    const sess = (sessData ?? []) as CashSession[];
    setSessions(sess);

    const profMap: Record<string, string> = {};
    for (const p of (profData ?? [])) profMap[p.id] = p.full_name || "Utente";
    setProfiles(profMap);

    const open = sess.find(s => s.status === "open");
    setActiveSession(open ?? null);

    if (open) {
      const { data: mvData } = await supabase
        .from("cash_movements")
        .select("*")
        .eq("session_id", open.id)
        .order("created_at", { ascending: true });
      setMovements((mvData ?? []) as CashMovement[]);
    } else {
      setMovements([]);
    }

    setLoading(false);
  }

  useEffect(() => { loadData(); /* eslint-disable-next-line */ }, []);

  // Computed totals for active session
  const sessionTotals = useMemo(() => {
    const entrate = movements.filter(m => m.type === "entrata").reduce((s, m) => s + Number(m.amount), 0);
    const uscite = movements.filter(m => m.type === "uscita").reduce((s, m) => s + Number(m.amount), 0);
    const saldo = (activeSession ? Number(activeSession.opening_amount) : 0) + entrate - uscite;
    return { entrate, uscite, saldo };
  }, [movements, activeSession]);

  // Monthly stats
  const monthSessions = useMemo(() => {
    const [y, m] = filterMonth.split("-").map(Number);
    return sessions.filter(s => {
      const d = new Date(s.opened_at);
      return d.getFullYear() === y && d.getMonth() + 1 === m;
    });
  }, [sessions, filterMonth]);

  const monthStats = useMemo(() => {
    let totalEntrate = 0, totalUscite = 0, sessCount = 0, totalDiff = 0;
    for (const s of monthSessions) {
      sessCount++;
      if (s.difference != null) totalDiff += Number(s.difference);
    }
    return { sessCount, totalDiff };
  }, [monthSessions]);

  // ── Open session ──
  async function openSession() {
    const amt = parseFloat(openAmount);
    if (isNaN(amt) || amt < 0) return alert("Inserisci un importo di apertura valido.");
    setOpeningSession(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setOpeningSession(false); return; }

    const { data, error } = await supabase.from("cash_sessions").insert({
      opened_by: user.id,
      opening_amount: amt,
      status: "open",
    }).select().single();

    if (error) { alert("Errore: " + error.message); setOpeningSession(false); return; }
    setOpenAmount("");
    setOpeningSession(false);
    showToastMsg("Sessione di cassa aperta");
    loadData();
  }

  // ── Add movement ──
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
      session_id: activeSession.id,
      created_by: user.id,
      type: mvType,
      amount: amt,
      category: mvCategory,
      description: mvDesc || null,
      receipt_url: receiptUrl,
    });

    if (error) return alert("Errore: " + error.message);

    setMvAmount(""); setMvDesc(""); setMvFile(null); setMvCategory("vendita");
    if (fileRef.current) fileRef.current.value = "";
    showToastMsg(`${mvType === "entrata" ? "Entrata" : "Uscita"} di ${fmtEur(amt)} registrata`);
    loadData();
  }

  // ── Close session ──
  async function closeSession() {
    const amt = parseFloat(actualAmount);
    if (isNaN(amt) || amt < 0) return alert("Inserisci il conteggio effettivo.");
    if (!activeSession) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const expected = sessionTotals.saldo;
    const diff = amt - expected;

    const { error } = await supabase.from("cash_sessions").update({
      closed_at: new Date().toISOString(),
      closed_by: user.id,
      expected_amount: expected,
      actual_amount: amt,
      difference: diff,
      notes: closeNotes || null,
      status: "closed",
    }).eq("id", activeSession.id);

    if (error) return alert("Errore: " + error.message);

    setShowClose(false); setActualAmount(""); setCloseNotes("");
    showToastMsg("Sessione chiusa. Differenza: " + fmtEur(diff));
    loadData();
  }

  // ── Delete movement ──
  async function deleteMovement(id: string) {
    if (!confirm("Eliminare questo movimento?")) return;
    await supabase.from("cash_movements").delete().eq("id", id);
    showToastMsg("Movimento eliminato");
    loadData();
  }

  // ── View history session ──
  async function viewHistorySession(s: CashSession) {
    setViewSession(s);
    const { data } = await supabase
      .from("cash_movements")
      .select("*")
      .eq("session_id", s.id)
      .order("created_at", { ascending: true });
    setViewMovements((data ?? []) as CashMovement[]);
  }

  // ── Print / PDF ──
  function printReport() {
    window.print();
  }

  if (loading) return <div className="empty">Caricamento...</div>;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <h1 className="serif" style={{ fontSize: 24, fontWeight: 500 }}>Cassa</h1>
        {activeSession && (
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn-ghost" style={{ padding: "8px 14px", borderRadius: 8, fontSize: 13 }} onClick={printReport}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: "inline", verticalAlign: "-2px", marginRight: 4 }}>
                <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" /><rect x="6" y="14" width="12" height="8" />
              </svg>
              Stampa
            </button>
            <button className="btn btn-primary" style={{ padding: "8px 16px", fontSize: 13, background: "#9E3B2E" }}
              onClick={() => setShowClose(true)}>
              Chiudi cassa
            </button>
          </div>
        )}
      </div>

      {/* ── No active session: open one ── */}
      {!activeSession && (
        <div className="section" style={{ maxWidth: 500, margin: "40px auto" }}>
          <div className="section-head"><h2>Apri sessione di cassa</h2></div>
          <div className="section-body" style={{ padding: 24 }}>
            <p style={{ fontSize: 14, color: "var(--ink-soft)", marginBottom: 16 }}>
              Nessuna sessione di cassa aperta. Inserisci il fondo cassa iniziale per iniziare.
            </p>
            <div className="field">
              <label>Fondo cassa iniziale (€)</label>
              <input type="number" min="0" step="0.01" value={openAmount}
                onChange={e => setOpenAmount(e.target.value)}
                placeholder="0.00"
                onKeyDown={e => e.key === "Enter" && openSession()} />
            </div>
            <button className="btn btn-primary" style={{ width: "100%", padding: "14px", fontSize: 15, marginTop: 8 }}
              onClick={openSession} disabled={openingSession}>
              {openingSession ? "Apertura..." : "Apri cassa"}
            </button>
          </div>
        </div>
      )}

      {/* ── Active session ── */}
      {activeSession && (
        <>
          {/* KPI Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 24 }}>
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
          <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 20, fontSize: 13, color: "var(--ink-soft)", flexWrap: "wrap" }}>
            <span>Aperta da <strong>{profiles[activeSession.opened_by] || "?"}</strong></span>
            <span>il <strong>{fmtDateTime(activeSession.opened_at)}</strong></span>
            <span>{movements.length} movimenti</span>
          </div>

          {/* New movement form */}
          <div className="section" style={{ marginBottom: 24 }}>
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
            <div className="section" style={{ marginBottom: 24 }}>
              <div className="section-head"><h2>Movimenti sessione corrente</h2></div>
              <div className="section-body" style={{ padding: 0 }}>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Ora</th>
                      <th>Tipo</th>
                      <th>Importo</th>
                      <th>Categoria</th>
                      <th className="hide-sm">Descrizione</th>
                      <th className="hide-sm">Operatore</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map(m => (
                      <tr key={m.id}>
                        <td style={{ whiteSpace: "nowrap", fontSize: 13 }}>
                          {new Date(m.created_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                        </td>
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
                        <td style={{ fontSize: 13 }}>{CATEGORIES.find(c => c.value === m.category)?.label ?? m.category}</td>
                        <td className="hide-sm muted" style={{ fontSize: 13 }}>{m.description || "—"}</td>
                        <td className="hide-sm muted" style={{ fontSize: 13 }}>{profiles[m.created_by] || "?"}</td>
                        <td style={{ textAlign: "right" }}>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            {m.receipt_url && (
                              <a href={m.receipt_url} target="_blank" rel="noreferrer"
                                className="btn-ghost" style={{ padding: "4px 8px", borderRadius: 6, fontSize: 11 }}>
                                Ricevuta
                              </a>
                            )}
                            <button className="btn-ghost" style={{ padding: "4px 8px", borderRadius: 6, fontSize: 11, color: "#9E3B2E" }}
                              onClick={() => deleteMovement(m.id)}>Elimina</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Close session modal ── */}
      {showClose && (
        <div className="modal-overlay" onClick={() => setShowClose(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Chiusura cassa</h3>
            <div style={{ marginBottom: 16, padding: 16, background: "#F3EBDD", borderRadius: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span>Fondo iniziale</span>
                <strong>{fmtEur(Number(activeSession?.opening_amount ?? 0))}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, color: "#2D5A3D" }}>
                <span>Entrate</span>
                <strong>+{fmtEur(sessionTotals.entrate)}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, color: "#9E3B2E" }}>
                <span>Uscite</span>
                <strong>-{fmtEur(sessionTotals.uscite)}</strong>
              </div>
              <div style={{ borderTop: "1px solid #D8CCB8", paddingTop: 8, display: "flex", justifyContent: "space-between", fontSize: 16 }}>
                <strong>Saldo atteso</strong>
                <strong style={{ color: "#1F3326" }}>{fmtEur(sessionTotals.saldo)}</strong>
              </div>
            </div>
            <div className="field">
              <label>Conteggio effettivo in cassa (€)</label>
              <input type="number" min="0" step="0.01" value={actualAmount}
                onChange={e => setActualAmount(e.target.value)} placeholder="0.00" autoFocus />
            </div>
            {actualAmount && !isNaN(parseFloat(actualAmount)) && (
              <div style={{
                padding: 12, borderRadius: 8, marginBottom: 12,
                background: Math.abs(parseFloat(actualAmount) - sessionTotals.saldo) < 0.01 ? "#E3EEE4" : "#F5E6E4",
                fontWeight: 700, fontSize: 14, textAlign: "center",
                color: Math.abs(parseFloat(actualAmount) - sessionTotals.saldo) < 0.01 ? "#2D5A3D" : "#9E3B2E",
              }}>
                Differenza: {fmtEur(parseFloat(actualAmount) - sessionTotals.saldo)}
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
      <div className="section" style={{ marginTop: activeSession ? 0 : 32 }}>
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
                  <th>Apertura</th>
                  <th>Chiusura</th>
                  <th>Fondo</th>
                  <th>Atteso</th>
                  <th>Effettivo</th>
                  <th>Differenza</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {monthSessions.filter(s => s.status === "closed").map(s => {
                  const diff = Number(s.difference ?? 0);
                  return (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 600, fontSize: 13 }}>{fmtDate(s.opened_at)}</td>
                      <td style={{ fontSize: 13 }}>{new Date(s.opened_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</td>
                      <td style={{ fontSize: 13 }}>{s.closed_at ? new Date(s.closed_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                      <td style={{ fontSize: 13 }}>{fmtEur(Number(s.opening_amount))}</td>
                      <td style={{ fontSize: 13 }}>{s.expected_amount != null ? fmtEur(Number(s.expected_amount)) : "—"}</td>
                      <td style={{ fontSize: 13 }}>{s.actual_amount != null ? fmtEur(Number(s.actual_amount)) : "—"}</td>
                      <td style={{
                        fontWeight: 700, fontSize: 13,
                        color: Math.abs(diff) < 0.01 ? "#2D5A3D" : "#9E3B2E",
                      }}>
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

      {/* Monthly summary */}
      {monthSessions.filter(s => s.status === "closed").length > 0 && (
        <div style={{ display: "flex", gap: 16, marginTop: 16, fontSize: 13, color: "var(--ink-soft)", flexWrap: "wrap" }}>
          <span>Sessioni chiuse: <strong>{monthStats.sessCount}</strong></span>
          <span>Differenza totale mese: <strong style={{ color: Math.abs(monthStats.totalDiff) < 0.01 ? "#2D5A3D" : "#9E3B2E" }}>
            {monthStats.totalDiff >= 0 ? "+" : ""}{fmtEur(monthStats.totalDiff)}
          </strong></span>
        </div>
      )}

      {/* ── Session detail modal ── */}
      {viewSession && (
        <div className="modal-overlay" onClick={() => setViewSession(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 600, maxHeight: "80vh", overflow: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700 }}>Sessione del {fmtDate(viewSession.opened_at)}</h3>
              <button className="btn-ghost" style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12 }}
                onClick={() => setViewSession(null)}>Chiudi</button>
            </div>

            <div style={{ marginBottom: 16, padding: 16, background: "#F3EBDD", borderRadius: 10, fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span>Aperta da</span><strong>{profiles[viewSession.opened_by] || "?"}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span>Chiusa da</span><strong>{viewSession.closed_by ? (profiles[viewSession.closed_by] || "?") : "—"}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span>Fondo iniziale</span><strong>{fmtEur(Number(viewSession.opening_amount))}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span>Atteso</span><strong>{viewSession.expected_amount != null ? fmtEur(Number(viewSession.expected_amount)) : "—"}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span>Effettivo</span><strong>{viewSession.actual_amount != null ? fmtEur(Number(viewSession.actual_amount)) : "—"}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #D8CCB8", paddingTop: 8 }}>
                <strong>Differenza</strong>
                <strong style={{ color: Math.abs(Number(viewSession.difference ?? 0)) < 0.01 ? "#2D5A3D" : "#9E3B2E" }}>
                  {fmtEur(Number(viewSession.difference ?? 0))}
                </strong>
              </div>
              {viewSession.notes && (
                <div style={{ marginTop: 8, color: "var(--ink-soft)" }}>Note: {viewSession.notes}</div>
              )}
            </div>

            {viewMovements.length === 0 ? (
              <div className="empty" style={{ padding: 20 }}>Nessun movimento in questa sessione.</div>
            ) : (
              <table className="tbl" style={{ fontSize: 13 }}>
                <thead>
                  <tr>
                    <th>Ora</th>
                    <th>Tipo</th>
                    <th>Importo</th>
                    <th>Categoria</th>
                    <th>Descrizione</th>
                  </tr>
                </thead>
                <tbody>
                  {viewMovements.map(m => (
                    <tr key={m.id}>
                      <td>{new Date(m.created_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</td>
                      <td>
                        <span style={{
                          padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 700,
                          background: m.type === "entrata" ? "#E3EEE4" : "#F5E6E4",
                          color: m.type === "entrata" ? "#2D5A3D" : "#9E3B2E",
                        }}>
                          {m.type === "entrata" ? "Entrata" : "Uscita"}
                        </span>
                      </td>
                      <td style={{ fontWeight: 700, color: m.type === "entrata" ? "#2D5A3D" : "#9E3B2E" }}>
                        {m.type === "entrata" ? "+" : "-"}{fmtEur(Number(m.amount))}
                      </td>
                      <td>{CATEGORIES.find(c => c.value === m.category)?.label ?? m.category}</td>
                      <td className="muted">{m.description || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: "#2D5A3D", color: "#FAF9F5", padding: "12px 24px", borderRadius: 10,
          fontSize: 14, fontWeight: 600, zIndex: 200, boxShadow: "0 4px 20px rgba(0,0,0,.25)",
        }}>
          {toast}
        </div>
      )}

      <style>{`
        @media print {
          .sidebar,.topbar-mobile,.bottomnav,.no-print{display:none!important}
          .shell{padding:0!important;display:block}
          .shell-content{display:block}
          .wrap{padding:0!important;max-width:100%!important}
          body{background:#fff;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}
        }
      `}</style>
    </>
  );
}
