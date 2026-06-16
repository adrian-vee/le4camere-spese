"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { eur, fmtDate, isoToday, monthKey, monthLabel, type Expense, type Category } from "@/lib/format";
import { useToast } from "@/lib/useToast";
import { Toast } from "@/components/Toast";
import { Modal } from "@/components/ui/Modal";

type Recurring = {
  id: string;
  name: string;
  amount: number;
  category_id: string | null;
  supplier_name: string | null;
  day_of_month: number;
  frequency: string;
  payment_method: string;
  notes: string | null;
  active: boolean;
  last_generated: string | null;
  created_by: string | null;
};

const FREQUENCIES = ["mensile", "bimestrale", "trimestrale", "semestrale", "annuale"] as const;
const FREQ_COLORS: Record<string, { bg: string; color: string }> = {
  mensile:     { bg: "#E3EEE4", color: "#2D5A3D" },
  bimestrale:  { bg: "#DAE7F5", color: "#3B6FA0" },
  trimestrale: { bg: "#F5EEDB", color: "#B68A3E" },
  semestrale:  { bg: "#F6E3D3", color: "#C0713B" },
  annuale:     { bg: "#F3D9D5", color: "#9E3B2E" },
};

const PAYMENT_METHODS = ["Carta", "Contanti", "Bonifico", "Altro"];

const emptyRecurring = {
  name: "",
  amount: "",
  category_id: "",
  supplier_name: "",
  day_of_month: "1",
  frequency: "mensile" as string,
  payment_method: "Bonifico",
  notes: "",
};

function shouldGenerate(freq: string, month: number): boolean {
  switch (freq) {
    case "mensile": return true;
    case "bimestrale": return month % 2 === 0;
    case "trimestrale": return [3, 6, 9, 12].includes(month);
    case "semestrale": return [6, 12].includes(month);
    case "annuale": return month === 12;
    default: return false;
  }
}

export default function SpesePage() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(searchParams.get("q") || "");
  const [month, setMonth] = useState(searchParams.get("month") || "");
  const [cat, setCat] = useState(searchParams.get("cat") || "");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  const updateUrlFilters = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== "all" && value !== "") params.set(key, value);
    else params.delete(key);
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [searchParams, router]);

  // Guide
  const [guideOpen, setGuideOpen] = useState(false);
  useEffect(() => {
    if (localStorage.getItem("spese_guide_closed") !== "1") setGuideOpen(true);
  }, []);
  function toggleGuide() {
    setGuideOpen(prev => {
      const next = !prev;
      localStorage.setItem("spese_guide_closed", next ? "0" : "1");
      return next;
    });
  }

  // Recurring
  const [recurrings, setRecurrings] = useState<Recurring[]>([]);
  const [showRecModal, setShowRecModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [recForm, setRecForm] = useState({ ...emptyRecurring });
  const [savingRec, setSavingRec] = useState(false);
  const [generating, setGenerating] = useState(false);
  const { toast, showToast } = useToast();

  async function load() {
    setLoading(true);
    const [{ data: exp }, { data: c }, { data: rec }] = await Promise.all([
      supabase.from("expenses").select("*, categories(name,color), profiles(full_name)").order("expense_date", { ascending: false }),
      supabase.from("categories").select("*").order("sort"),
      supabase.from("recurring_expenses").select("*").order("name"),
    ]);
    setExpenses((exp ?? []) as Expense[]);
    setCats((c ?? []) as Category[]);
    setRecurrings((rec ?? []) as Recurring[]);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  // Reset pagination when filters change
  useEffect(() => { setPage(0); }, [q, month, cat, statusFilter]);

  const months = useMemo(
    () => [...new Set(expenses.map((e) => monthKey(e.expense_date)).filter(Boolean))].sort().reverse(),
    [expenses]
  );

  const filtered = useMemo(() => {
    const query = q.toLowerCase().trim();
    return expenses.filter((e) => {
      if (month && monthKey(e.expense_date) !== month) return false;
      if (cat && e.category_id !== cat) return false;
      if (statusFilter && e.payment_status !== statusFilter) return false;
      if (query && !`${e.supplier_name ?? ""} ${e.notes ?? ""}`.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [expenses, q, month, cat, statusFilter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginatedExpenses = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const total = filtered.reduce((s, e) => s + Number(e.amount), 0);
  const totalDaPagare = filtered.filter(e => e.payment_status === "da_pagare").reduce((s, e) => s + Number(e.amount), 0);
  const totalPagate = filtered.filter(e => e.payment_status === "pagato").reduce((s, e) => s + Number(e.amount), 0);
  const countDaPagare = filtered.filter(e => e.payment_status === "da_pagare").length;

  async function del(id: string, path: string | null) {
    if (!confirm("Eliminare questa spesa?")) return;
    if (path) {
      const { error: storageErr } = await supabase.storage.from("documenti").remove([path]);
      if (storageErr) { showToast("Errore rimozione file", "error"); return; }
    }
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) { showToast("Errore eliminazione spesa", "error"); return; }
    setExpenses((prev) => prev.filter((e) => e.id !== id));
  }

  async function openDoc(path: string) {
    const { data } = await supabase.storage.from("documenti").createSignedUrl(path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }

  function exportCSV() {
    if (!filtered.length) return alert("Nessuna spesa da esportare.");
    const head = ["Data", "Fornitore", "Categoria", "Tipo", "Pagamento", "Stato", "Centro di costo", "Note", "Importo EUR"];
    const rows = filtered.map((e) => [
      fmtDate(e.expense_date), e.supplier_name ?? "", e.categories?.name ?? "", e.doc_type,
      e.payment_method, e.payment_status, e.cost_center ?? "", (e.notes ?? "").replace(/\n/g, " "),
      String(e.amount).replace(".", ","),
    ]);
    const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = `spese-le4camere-${isoToday()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ── Recurring CRUD ── */

  function openNewRec() {
    setRecForm({ ...emptyRecurring });
    setEditId(null);
    setShowRecModal(true);
  }

  function openEditRec(r: Recurring) {
    setRecForm({
      name: r.name,
      amount: String(r.amount),
      category_id: r.category_id ?? "",
      supplier_name: r.supplier_name ?? "",
      day_of_month: String(r.day_of_month),
      frequency: r.frequency,
      payment_method: r.payment_method,
      notes: r.notes ?? "",
    });
    setEditId(r.id);
    setShowRecModal(true);
  }

  async function saveRecurring() {
    const amt = parseFloat(recForm.amount);
    if (!recForm.name.trim() || isNaN(amt) || amt <= 0) {
      showToast("Compila nome e importo", "warn");
      return;
    }
    setSavingRec(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const payload = {
        name: recForm.name.trim(),
        amount: amt,
        category_id: recForm.category_id || null,
        supplier_name: recForm.supplier_name.trim() || null,
        day_of_month: parseInt(recForm.day_of_month) || 1,
        frequency: recForm.frequency,
        payment_method: recForm.payment_method,
        notes: recForm.notes.trim() || null,
        created_by: user?.id ?? null,
      };

      if (editId) {
        const { error } = await supabase.from("recurring_expenses").update(payload).eq("id", editId);
        if (error) throw error;
        showToast("Ricorrente aggiornata");
      } else {
        const { error } = await supabase.from("recurring_expenses").insert({ ...payload, active: true });
        if (error) throw error;
        showToast("Ricorrente creata");
      }
      setShowRecModal(false);
      load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Errore", "error");
    } finally {
      setSavingRec(false);
    }
  }

  async function deleteRecurring(id: string) {
    if (!confirm("Eliminare questa spesa ricorrente?")) return;
    const { error } = await supabase.from("recurring_expenses").delete().eq("id", id);
    if (error) { showToast("Errore eliminazione ricorrente", "error"); return; }
    setRecurrings((prev) => prev.filter((r) => r.id !== id));
    showToast("Ricorrente eliminata");
  }

  async function toggleRecActive(r: Recurring) {
    const newVal = !r.active;
    const { error } = await supabase.from("recurring_expenses").update({ active: newVal }).eq("id", r.id);
    if (error) { showToast("Errore aggiornamento stato", "error"); return; }
    setRecurrings((prev) => prev.map((x) => (x.id === r.id ? { ...x, active: newVal } : x)));
  }

  async function generateMonth() {
    setGenerating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const now = new Date();
      const curMonth = now.getMonth() + 1;
      const curYear = now.getFullYear();
      const monthStart = `${curYear}-${String(curMonth).padStart(2, "0")}-01`;
      const monthName = now.toLocaleDateString("it-IT", { month: "long" });

      const active = recurrings.filter((r) => r.active);
      let generated = 0;
      let skipped = 0;

      for (const r of active) {
        if (!shouldGenerate(r.frequency, curMonth)) { skipped++; continue; }

        if (r.last_generated && r.last_generated >= monthStart) { skipped++; continue; }

        const day = Math.min(r.day_of_month, new Date(curYear, curMonth, 0).getDate());
        const expenseDate = `${curYear}-${String(curMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

        const { error } = await supabase.from("expenses").insert({
          amount: r.amount,
          expense_date: expenseDate,
          category_id: r.category_id,
          supplier_name: r.supplier_name,
          payment_method: r.payment_method,
          payment_status: "da_pagare",
          doc_type: "Fattura",
          notes: `Spesa ricorrente: ${r.name}`,
          created_by: user?.id ?? null,
        });
        if (error) continue;

        const { error: updErr } = await supabase.from("recurring_expenses").update({ last_generated: isoToday() }).eq("id", r.id);
        if (updErr) continue;
        generated++;
      }

      if (generated > 0) {
        showToast(`Generate ${generated} spese ricorrenti per ${monthName}`);
      } else {
        showToast(`Tutte le spese ricorrenti di ${monthName} sono gia state generate`, "warn");
      }
      load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Errore generazione", "error");
    } finally {
      setGenerating(false);
    }
  }

  const now = new Date();
  const curMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const pendingCount = recurrings.filter((r) =>
    r.active && shouldGenerate(r.frequency, now.getMonth() + 1) && (!r.last_generated || r.last_generated < curMonthStart)
  ).length;

  return (
    <>
      {/* ── Guide Banner ── */}
      <div style={{
        background: "#F3EBDD", borderLeft: "3px solid #BFA762", borderRadius: 8,
        padding: guideOpen ? "16px 18px" : "12px 18px", marginBottom: 20,
        transition: "padding 0.2s",
      }}>
        <button onClick={toggleGuide} style={{
          background: "none", border: "none", cursor: "pointer", padding: 0,
          display: "flex", alignItems: "center", gap: 8, width: "100%",
          fontFamily: "'Albert Sans', sans-serif", fontSize: 14, fontWeight: 600, color: "#1F3326",
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#BFA762" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
          </svg>
          Come funziona
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6C6B5D" strokeWidth="2" strokeLinecap="round" style={{ marginLeft: "auto", transform: guideOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {guideOpen && (
          <div style={{ marginTop: 12, fontSize: 13, lineHeight: 1.6, color: "#6C6B5D" }}>
            Qui trovi tutte le spese registrate per l&apos;hotel. Registra qui le spese <strong>NON da fornitore</strong>: supermercato, manutenzione, servizi, acquisti vari.
            Le spese generate automaticamente da arrivi fornitore hanno un badge &laquo;Da fornitore&raquo; e non sono modificabili da qui.
            Le spese con stato &laquo;Da pagare&raquo; sono evidenziate in rosso.
            Per registrare una nuova spesa, clicca su <strong>&laquo;+ Nuova spesa&raquo;</strong> nella sidebar o nel bottone in alto.
            Per vedere il dettaglio di una spesa, cliccaci sopra.
          </div>
        )}
      </div>

      {/* ── KPI Cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 24 }}>
        <div style={{ background: "#FFFFFF", borderRadius: 12, border: "1px solid #D8CCB8", borderTop: "3px solid #BFA762", padding: "16px 20px" }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: "#1F3326", lineHeight: 1 }}>{eur(total)}</div>
          <div style={{ fontSize: 12, color: "#6C6B5D", marginTop: 4, fontFamily: "'Albert Sans', sans-serif" }}>Totale spese</div>
        </div>
        <div style={{ background: "#FFFFFF", borderRadius: 12, border: "1px solid #D8CCB8", borderTop: "3px solid #9E3B2E", padding: "16px 20px" }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: "#9E3B2E", lineHeight: 1 }}>{eur(totalDaPagare)}</div>
          <div style={{ fontSize: 12, color: "#6C6B5D", marginTop: 4, fontFamily: "'Albert Sans', sans-serif" }}>Da pagare ({countDaPagare})</div>
        </div>
        <div style={{ background: "#FFFFFF", borderRadius: 12, border: "1px solid #D8CCB8", borderTop: "3px solid #2D5A3D", padding: "16px 20px" }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: "#2D5A3D", lineHeight: 1 }}>{eur(totalPagate)}</div>
          <div style={{ fontSize: 12, color: "#6C6B5D", marginTop: 4, fontFamily: "'Albert Sans', sans-serif" }}>Pagate</div>
        </div>
      </div>

      {/* ── Recurring Expenses Section ── */}
      <div className="section" style={{ marginBottom: 24 }}>
        <div className="section-head">
          <h2>Spese ricorrenti</h2>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn btn-ghost" style={{ padding: "8px 14px", fontSize: 13, fontWeight: 600 }} onClick={openNewRec}>
              + Nuova ricorrente
            </button>
            <button
              className="btn btn-primary"
              style={{ padding: "8px 14px", fontSize: 13 }}
              onClick={generateMonth}
              disabled={generating}
            >
              {generating ? "Generazione..." : "Genera spese del mese"}
              {pendingCount > 0 && (
                <span style={{
                  background: "#fff", color: "var(--ink)", borderRadius: 20, padding: "1px 7px",
                  fontSize: 11, fontWeight: 700, marginLeft: 8,
                }}>{pendingCount}</span>
              )}
            </button>
          </div>
        </div>
        <div className="section-body" style={{ padding: 0 }}>
          {recurrings.length === 0 ? (
            <div className="empty" style={{ padding: "32px 20px" }}>
              <div className="serif">Nessuna spesa ricorrente</div>
              <div>Crea una spesa ricorrente per automatizzare le registrazioni mensili.</div>
            </div>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th style={{ textAlign: "right" }}>Importo</th>
                  <th className="hide-sm">Fornitore</th>
                  <th className="hide-sm">Giorno</th>
                  <th>Frequenza</th>
                  <th className="hide-sm">Ultima gen.</th>
                  <th>Attiva</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {recurrings.map((r) => {
                  const fc = FREQ_COLORS[r.frequency] || FREQ_COLORS.mensile;
                  return (
                    <tr key={r.id} style={{ opacity: r.active ? 1 : 0.5 }}>
                      <td><strong>{r.name}</strong></td>
                      <td className="amt-cell tabular" style={{ textAlign: "right" }}>{eur(r.amount)}</td>
                      <td className="hide-sm">{r.supplier_name || "—"}</td>
                      <td className="hide-sm">{r.day_of_month}</td>
                      <td>
                        <span className="badge" style={{ background: fc.bg, color: fc.color }}>{r.frequency}</span>
                      </td>
                      <td className="hide-sm">{r.last_generated ? fmtDate(r.last_generated) : "Mai"}</td>
                      <td>
                        <button
                          className={`toggle-switch${r.active ? " on" : ""}`}
                          onClick={() => toggleRecActive(r)}
                          style={{ width: 40, height: 22 }}
                        />
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          <button className="btn-ghost" style={{ padding: "5px 8px", borderRadius: 8, fontSize: 12 }} onClick={() => openEditRec(r)}>Modifica</button>
                          <button className="btn-ghost" style={{ padding: "5px 8px", borderRadius: 8, fontSize: 12 }} onClick={() => deleteRecurring(r.id)}>Elimina</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Expense Registry ── */}
      <div className="section">
        <div className="section-head">
          <h2>Registro spese &middot; {eur(total)}</h2>
          <div className="filters">
            <input type="search" placeholder="Cerca..." value={q} onChange={(e) => { setQ(e.target.value); updateUrlFilters("q", e.target.value); }} />
            <select value={month} onChange={(e) => { setMonth(e.target.value); updateUrlFilters("month", e.target.value); }}>
              <option value="">Tutti i mesi</option>
              {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
            <select value={cat} onChange={(e) => { setCat(e.target.value); updateUrlFilters("cat", e.target.value); }}>
              <option value="">Tutte le categorie</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); updateUrlFilters("status", e.target.value); }}>
              <option value="">Tutti gli stati</option>
              <option value="pagato">Pagata</option>
              <option value="da_pagare">Da pagare</option>
            </select>
            {(q || month || cat || statusFilter) && (
              <button className="btn-ghost" style={{ padding: "9px 12px", borderRadius: 9, fontSize: 12 }}
                onClick={() => { setQ(""); setMonth(""); setCat(""); setStatusFilter(""); router.replace("?", { scroll: false }); }}>
                Azzera filtri
              </button>
            )}
            <a href="/nuova" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", background: "#fff", border: "1px solid #D8CCB8", borderRadius: 8, color: "#1F3326", fontWeight: 600, fontSize: 14, textDecoration: "none" }}>
              Scansiona scontrino
            </a>
            <button className="btn-ghost" style={{ padding: "9px 14px", borderRadius: 9, fontSize: 13, fontWeight: 600 }} onClick={exportCSV}>Esporta CSV</button>
          </div>
        </div>
        <div className="section-body" style={{ padding: 0 }}>
          {loading ? (
            <div className="empty">Caricamento...</div>
          ) : filtered.length === 0 ? (
            <div className="empty" style={{ padding: "48px 20px" }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#D8CCB8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 16 }}>
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
              </svg>
              <div className="serif" style={{ fontSize: 20, marginBottom: 6 }}>Nessuna spesa registrata</div>
              <div style={{ color: "#6C6B5D", fontSize: 14, marginBottom: 20 }}>
                {(month || cat || statusFilter || q) ? "Nessun risultato con i filtri selezionati." : "Non ci sono ancora spese per questo periodo."}
              </div>
              <Link href="/nuova" className="btn btn-primary" style={{ padding: "10px 20px", fontSize: 14, textDecoration: "none" }}>
                Registra la prima spesa
              </Link>
            </div>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Data</th><th>Fornitore</th><th className="hide-sm">Categoria</th>
                  <th className="hide-sm">Doc.</th><th style={{ textAlign: "right" }}>Importo</th><th></th>
                </tr>
              </thead>
              <tbody>
                {paginatedExpenses.map((e) => {
                  const catColor = e.categories?.color ?? "#9C8E78";
                  const isPaid = e.payment_status === "pagato";
                  return (
                    <tr key={e.id}>
                      <td>{fmtDate(e.expense_date)}</td>
                      <td>
                        <strong>{e.supplier_name || "—"}</strong>
                        <span style={{
                          display: "inline-block", marginLeft: 8, padding: "2px 9px", borderRadius: 20,
                          fontSize: 11, fontWeight: 700,
                          background: isPaid ? "#E3EEE4" : "#F3D9D5",
                          color: isPaid ? "#2D5A3D" : "#9E3B2E",
                        }}>{isPaid ? "Pagata" : "Da pagare"}</span>
                        {e.categories?.name === "Fornitore" && (
                          <span style={{ display: "inline-block", marginLeft: 6, padding: "2px 9px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: "rgba(31,51,38,.08)", color: "#1F3326" }}>
                            Da fornitore
                          </span>
                        )}
                        {e.notes && <div className="muted">{e.notes}</div>}
                        {e.profiles?.full_name && <div className="muted" style={{ fontSize: 12 }}>di {e.profiles.full_name}</div>}
                      </td>
                      <td className="hide-sm">
                        <span style={{
                          display: "inline-block", padding: "3px 10px", borderRadius: 20,
                          fontSize: 12, fontWeight: 600,
                          background: catColor + "18", color: catColor,
                        }}>{e.categories?.name ?? "Altro"}</span>
                      </td>
                      <td className="hide-sm">
                        {e.document_path
                          ? <button className="btn-ghost" style={{ padding: "5px 10px", borderRadius: 8, fontSize: 12 }} onClick={() => openDoc(e.document_path!)}>&#x1F4CE; {e.doc_type}</button>
                          : <span className="muted">{e.doc_type}</span>}
                      </td>
                      <td className="amt-cell tabular" style={{ textAlign: "right" }}>{eur(Number(e.amount))}</td>
                      <td style={{ textAlign: "right" }}>
                        <button className="btn-ghost" style={{ padding: "6px 10px", borderRadius: 8, fontSize: 12 }} onClick={() => del(e.id, e.document_path)}>Elimina</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {/* ── Pagination ── */}
          {filtered.length > PAGE_SIZE && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
              padding: "16px 20px", borderTop: "1px solid #D8CCB8",
            }}>
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                style={{
                  background: "#1F3326", color: "#fff", border: "none", borderRadius: 8,
                  padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: page === 0 ? "default" : "pointer",
                  opacity: page === 0 ? 0.5 : 1, fontFamily: "'Albert Sans', sans-serif",
                }}
              >
                Precedente
              </button>
              <span style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 13, color: "#6C6B5D" }}>
                Pagina {page + 1} di {totalPages} &middot; {filtered.length} spese
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                style={{
                  background: "#1F3326", color: "#fff", border: "none", borderRadius: 8,
                  padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: page >= totalPages - 1 ? "default" : "pointer",
                  opacity: page >= totalPages - 1 ? 0.5 : 1, fontFamily: "'Albert Sans', sans-serif",
                }}
              >
                Successiva
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Recurring Modal ── */}
      <Modal isOpen={showRecModal} onClose={() => setShowRecModal(false)} title={editId ? "Modifica ricorrente" : "Nuova spesa ricorrente"}>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          <div className="grid2">
            <div className="field">
              <label>Nome</label>
              <input value={recForm.name} onChange={(e) => setRecForm({ ...recForm, name: e.target.value })} placeholder='Es. "Bolletta Enel"' />
            </div>
            <div className="field">
              <label>Importo stimato (EUR)</label>
              <input type="number" step="0.01" min="0" value={recForm.amount} onChange={(e) => setRecForm({ ...recForm, amount: e.target.value })} placeholder="0.00" />
            </div>
            <div className="field">
              <label>Categoria</label>
              <select value={recForm.category_id} onChange={(e) => setRecForm({ ...recForm, category_id: e.target.value })}>
                <option value="">— Nessuna —</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Fornitore</label>
              <input value={recForm.supplier_name} onChange={(e) => setRecForm({ ...recForm, supplier_name: e.target.value })} placeholder="Es. Enel, Booking..." />
            </div>
            <div className="field">
              <label>Giorno del mese (1-28)</label>
              <input type="number" min="1" max="28" value={recForm.day_of_month} onChange={(e) => setRecForm({ ...recForm, day_of_month: e.target.value })} />
            </div>
            <div className="field">
              <label>Frequenza</label>
              <select value={recForm.frequency} onChange={(e) => setRecForm({ ...recForm, frequency: e.target.value })}>
                {FREQUENCIES.map((f) => <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Metodo pagamento</label>
              <select value={recForm.payment_method} onChange={(e) => setRecForm({ ...recForm, payment_method: e.target.value })}>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div className="field">
            <label>Note</label>
            <textarea value={recForm.notes} onChange={(e) => setRecForm({ ...recForm, notes: e.target.value })} placeholder="Note opzionali..." style={{ minHeight: 50 }} />
          </div>
        </div>
        <div style={{ paddingTop: 16, borderTop: "1px solid var(--line)", display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="btn btn-ghost" onClick={() => setShowRecModal(false)}>Annulla</button>
          <button className="btn btn-primary" onClick={saveRecurring} disabled={savingRec}>
            {savingRec ? "Salvataggio..." : editId ? "Aggiorna" : "Crea"}
          </button>
        </div>
      </Modal>

      {/* ── Toast ── */}
      <Toast toast={toast} />
    </>
  );
}
