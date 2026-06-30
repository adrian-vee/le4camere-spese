"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { eur, fmtDate, isoToday, monthKey, monthLabel, DOC_TYPES, PAYMENT_METHODS, COST_CENTERS, type Expense, type Category, type EditHistoryEntry } from "@/lib/format";
import { useRole } from "@/lib/useRole";
import { canAccess } from "@/lib/permissions";
import { useToast } from "@/lib/useToast";
import { Toast } from "@/components/Toast";
import { Modal } from "@/components/ui/Modal";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

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

import { shouldGenerate } from "@/lib/recurring";

/* ── Animated counter hook ── */
function useCountUp(target: number, duration = 900) {
  const [val, setVal] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const start = prev.current;
    const diff = target - start;
    if (diff === 0) return;
    const startTime = performance.now();
    let raf: number;
    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setVal(start + diff * eased);
      if (progress < 1) raf = requestAnimationFrame(tick);
      else prev.current = target;
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

/* ── Default category colors ── */
const CAT_PALETTE = [
  "#BFA762", "#4F7B8C", "#9E3B2E", "#2D5A3D", "#C77B4A",
  "#6C6B5D", "#8B5E8B", "#3B6FA0", "#D4A574", "#5B8C5A",
];

export default function SpesePage() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { role, loading: roleLoading } = useRole();

  useEffect(() => {
    if (!roleLoading && !canAccess(role, "/spese")) {
      router.replace("/");
    }
  }, [roleLoading, role, router]);

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(searchParams.get("q") || "");
  const [month, setMonth] = useState(searchParams.get("month") || "");
  const [cat, setCat] = useState(searchParams.get("cat") || "");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "");
  const [originFilter, setOriginFilter] = useState(searchParams.get("origin") || "");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  const updateUrlFilters = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== "all" && value !== "") params.set(key, value);
    else params.delete(key);
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [searchParams, router]);

  // Recurring
  const [recurrings, setRecurrings] = useState<Recurring[]>([]);
  const [showRecModal, setShowRecModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [recForm, setRecForm] = useState({ ...emptyRecurring });
  const [savingRec, setSavingRec] = useState(false);
  const [generating, setGenerating] = useState(false);
  const { toast, showToast } = useToast();

  // Edit expense
  const [showEditModal, setShowEditModal] = useState(false);
  const [editExpense, setEditExpense] = useState<Expense | null>(null);
  const [editForm, setEditForm] = useState({
    amount: "", expense_date: "", supplier_name: "", category_id: "",
    doc_type: "Scontrino", payment_method: "Carta", cost_center: "Generale",
    payment_status: "pagato" as string, notes: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [historyTooltip, setHistoryTooltip] = useState<string | null>(null);

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

  useEffect(() => { setPage(0); }, [q, month, cat, statusFilter, originFilter]);

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
      if (originFilter === "manuale" && e.supplier_id) return false;
      if (originFilter === "fornitore" && !e.supplier_id) return false;
      if (query && !`${e.supplier_name ?? ""} ${e.notes ?? ""}`.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [expenses, q, month, cat, statusFilter, originFilter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginatedExpenses = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const total = filtered.reduce((s, e) => s + Number(e.amount), 0);
  const totalDaPagare = filtered.filter(e => e.payment_status === "da_pagare").reduce((s, e) => s + Number(e.amount), 0);
  const totalPagate = filtered.filter(e => e.payment_status === "pagato").reduce((s, e) => s + Number(e.amount), 0);
  const countDaPagare = filtered.filter(e => e.payment_status === "da_pagare").length;

  /* ── Donut chart data ── */
  const catTotals = useMemo(() => {
    const map = new Map<string, { name: string; value: number; color: string }>();
    for (const e of filtered) {
      const catName = e.categories?.name ?? "Altro";
      const catColor = e.categories?.color ?? "";
      const existing = map.get(catName);
      if (existing) {
        existing.value += Number(e.amount);
      } else {
        map.set(catName, { name: catName, value: Number(e.amount), color: catColor });
      }
    }
    const arr = [...map.values()].sort((a, b) => b.value - a.value);
    return arr.map((item, i) => ({
      ...item,
      color: item.color || CAT_PALETTE[i % CAT_PALETTE.length],
    }));
  }, [filtered]);

  const animTotal = useCountUp(total);
  const animDaPagare = useCountUp(totalDaPagare);
  const animPagate = useCountUp(totalPagate);

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

  /* ── Edit Expense ── */

  function openEditExpense(e: Expense) {
    setEditExpense(e);
    setEditForm({
      amount: String(e.amount),
      expense_date: e.expense_date,
      supplier_name: e.supplier_name ?? "",
      category_id: e.category_id ?? "",
      doc_type: e.doc_type,
      payment_method: e.payment_method,
      cost_center: e.cost_center ?? "Generale",
      payment_status: e.payment_status,
      notes: e.notes ?? "",
    });
    setShowEditModal(true);
  }

  const FIELD_LABELS: Record<string, string> = {
    amount: "Importo", expense_date: "Data", supplier_name: "Fornitore",
    category_id: "Categoria", doc_type: "Tipo documento", payment_method: "Pagamento",
    cost_center: "Centro di costo", payment_status: "Stato", notes: "Note",
  };

  function formatFieldValue(field: string, value: unknown): string {
    if (value === null || value === undefined || value === "") return "\u2014";
    if (field === "amount") return eur(Number(value));
    if (field === "expense_date") return fmtDate(String(value));
    if (field === "category_id") {
      const c = cats.find(c => c.id === value);
      return c?.name ?? String(value);
    }
    if (field === "payment_status") return value === "pagato" ? "Pagata" : "Da pagare";
    return String(value);
  }

  async function saveEditExpense() {
    if (!editExpense) return;
    const amt = parseFloat(editForm.amount);
    if (isNaN(amt) || amt <= 0 || !editForm.expense_date) {
      showToast("Compila importo e data", "warn");
      return;
    }
    setSavingEdit(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user?.id ?? "").single();

      const changes: Record<string, { old: unknown; new: unknown }> = {};
      const fieldMap: Record<string, unknown> = {
        amount: editExpense.amount,
        expense_date: editExpense.expense_date,
        supplier_name: editExpense.supplier_name ?? "",
        category_id: editExpense.category_id ?? "",
        doc_type: editExpense.doc_type,
        payment_method: editExpense.payment_method,
        cost_center: editExpense.cost_center ?? "Generale",
        payment_status: editExpense.payment_status,
        notes: editExpense.notes ?? "",
      };

      for (const [key, oldVal] of Object.entries(fieldMap)) {
        const newVal = key === "amount" ? amt : (editForm as Record<string, string>)[key];
        if (String(oldVal) !== String(newVal)) {
          changes[key] = { old: oldVal, new: newVal };
        }
      }

      if (Object.keys(changes).length === 0) {
        showToast("Nessuna modifica rilevata", "warn");
        setSavingEdit(false);
        return;
      }

      const historyEntry: EditHistoryEntry = {
        edited_by: user?.id ?? "",
        edited_by_name: profile?.full_name ?? "Sconosciuto",
        edited_at: new Date().toISOString(),
        changes,
      };

      const { error } = await supabase.from("expenses").update({
        amount: amt,
        expense_date: editForm.expense_date,
        supplier_name: editForm.supplier_name.trim() || null,
        category_id: editForm.category_id || null,
        doc_type: editForm.doc_type,
        payment_method: editForm.payment_method,
        cost_center: editForm.cost_center || null,
        payment_status: editForm.payment_status,
        notes: editForm.notes.trim() || null,
      }).eq("id", editExpense.id);

      if (error) throw error;

      const existingHistory: EditHistoryEntry[] = Array.isArray(editExpense.edit_history) ? editExpense.edit_history : [];
      const newHistory = [...existingHistory, historyEntry];
      await supabase.from("expenses").update({ edit_history: newHistory }).eq("id", editExpense.id);
      showToast("Spesa aggiornata");
      setShowEditModal(false);
      load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Errore", "error");
    } finally {
      setSavingEdit(false);
    }
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

  /* ── Recurring section collapsed state ── */
  const [recCollapsed, setRecCollapsed] = useState(true);

  if (roleLoading || !canAccess(role, "/spese")) {
    return <div style={{ padding: 40, textAlign: "center", color: "#6C6B5D", fontFamily: "'Albert Sans', sans-serif" }}>Caricamento...</div>;
  }

  return (
    <>
      <style>{`
        .spese-kpi {
          background: #FFFFFF;
          border-radius: 16px;
          border: 1px solid #D8CCB8;
          padding: 22px 24px;
          position: relative;
          overflow: hidden;
          transition: transform 0.25s cubic-bezier(0.16,1,0.3,1), box-shadow 0.25s cubic-bezier(0.16,1,0.3,1);
        }
        .spese-kpi:hover {
          transform: translateY(-3px);
          box-shadow: 0 12px 32px rgba(31,51,38,0.08), 0 2px 8px rgba(191,167,98,0.06);
        }
        .spese-kpi::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
        }
        .spese-kpi-gold::before { background: linear-gradient(90deg, #BFA762, #D4C07A); }
        .spese-kpi-red::before { background: linear-gradient(90deg, #9E3B2E, #C25544); }
        .spese-kpi-green::before { background: linear-gradient(90deg, #2D5A3D, #3D7A53); }

        .spese-kpi .kpi-num {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 32px;
          line-height: 1;
          letter-spacing: 0.5px;
        }
        .spese-kpi .kpi-label {
          font-family: 'Albert Sans', sans-serif;
          font-size: 12px;
          color: #6C6B5D;
          margin-top: 6px;
          font-weight: 500;
        }

        .spese-filter-bar {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: center;
          padding: 14px 20px;
          background: #F3EBDD;
          border-radius: 12px;
          margin-bottom: 16px;
        }
        .spese-filter-bar input,
        .spese-filter-bar select {
          font-family: 'Albert Sans', sans-serif;
          font-size: 13px;
          border: 1px solid #D8CCB8;
          border-radius: 8px;
          padding: 8px 12px;
          background: #fff;
          color: #1F3326;
          min-width: 130px;
        }
        .spese-filter-bar input:focus,
        .spese-filter-bar select:focus {
          outline: none;
          border-color: #BFA762;
          box-shadow: 0 0 0 3px rgba(191,167,98,0.15);
        }

        .spese-tbl {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          font-family: 'Albert Sans', sans-serif;
          font-size: 14px;
        }
        .spese-tbl thead th {
          background: #F3EBDD;
          padding: 12px 16px;
          text-align: left;
          font-weight: 600;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #6C6B5D;
          border-bottom: 1px solid #D8CCB8;
        }
        .spese-tbl thead th:first-child { border-radius: 10px 0 0 0; }
        .spese-tbl thead th:last-child { border-radius: 0 10px 0 0; }
        .spese-tbl tbody tr {
          transition: background 0.15s;
        }
        .spese-tbl tbody tr:nth-child(even) {
          background: rgba(243,235,221,0.3);
        }
        .spese-tbl tbody tr:hover {
          background: #F3EBDD;
        }
        .spese-tbl td {
          padding: 12px 16px;
          border-bottom: 1px solid rgba(216,204,184,0.4);
          vertical-align: middle;
        }
        .spese-tbl .amt-cell {
          font-variant-numeric: tabular-nums;
          font-weight: 600;
        }

        .spese-badge {
          display: inline-block;
          padding: 3px 10px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 700;
          white-space: nowrap;
        }

        .spese-btn-action {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 12px;
          font-family: 'Albert Sans', sans-serif;
          border: 1px solid #D8CCB8;
          background: #fff;
          color: #1F3326;
          cursor: pointer;
          transition: all 0.15s;
          font-weight: 500;
        }
        .spese-btn-action:hover {
          background: #F3EBDD;
          border-color: #BFA762;
        }
        .spese-btn-action:disabled,
        .spese-btn-action[data-disabled="true"] {
          color: #9C8E78;
          cursor: not-allowed;
          opacity: 0.6;
        }
        .spese-btn-action[data-disabled="true"]:hover {
          background: #fff;
          border-color: #D8CCB8;
        }

        .donut-legend {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-family: 'Albert Sans', sans-serif;
          font-size: 13px;
        }
        .donut-legend-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 4px 8px;
          border-radius: 6px;
          transition: background 0.15s;
          cursor: default;
        }
        .donut-legend-item:hover {
          background: rgba(243,235,221,0.5);
        }

        .rec-toggle-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          background: none;
          border: none;
          cursor: pointer;
          font-family: 'Fraunces', serif;
          font-size: 18px;
          color: #1F3326;
          padding: 0;
        }
        .rec-toggle-btn svg {
          transition: transform 0.25s;
        }

        @media (max-width: 768px) {
          .spese-kpi .kpi-num { font-size: 26px; }
          .spese-filter-bar { padding: 12px 14px; gap: 8px; }
          .spese-filter-bar input,
          .spese-filter-bar select { min-width: 100px; font-size: 12px; padding: 7px 10px; }
          .spese-tbl td { padding: 10px 12px; font-size: 13px; }
          .hide-sm { display: none !important; }
        }
      `}</style>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 26, color: "#1F3326", margin: 0, fontWeight: 600 }}>Spese</h1>
          <p style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 14, color: "#6C6B5D", margin: "4px 0 0" }}>Gestione spese e costi</p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <Link href="/nuova" style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "#1F3326", color: "#fff", border: "none", borderRadius: 10,
            padding: "9px 16px", fontSize: 13, fontWeight: 600,
            fontFamily: "'Albert Sans', sans-serif", textDecoration: "none",
            transition: "background 0.15s",
          }}>
            + Nuova spesa
          </Link>
          <button onClick={openNewRec} style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "#fff", color: "#1F3326", border: "1px solid #D8CCB8", borderRadius: 10,
            padding: "9px 16px", fontSize: 13, fontWeight: 600,
            fontFamily: "'Albert Sans', sans-serif", cursor: "pointer",
            transition: "all 0.15s",
          }}>
            + Ricorrente
          </button>
          <button onClick={generateMonth} disabled={generating} style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: pendingCount > 0 ? "#BFA762" : "#fff",
            color: pendingCount > 0 ? "#fff" : "#1F3326",
            border: pendingCount > 0 ? "1px solid #BFA762" : "1px solid #D8CCB8",
            borderRadius: 10, padding: "9px 16px", fontSize: 13, fontWeight: 600,
            fontFamily: "'Albert Sans', sans-serif", cursor: generating ? "default" : "pointer",
            opacity: generating ? 0.7 : 1, transition: "all 0.15s",
          }}>
            {generating ? "Generazione..." : "Genera mese"}
            {pendingCount > 0 && (
              <span style={{
                background: "#fff", color: "#BFA762", borderRadius: 20, padding: "1px 7px",
                fontSize: 11, fontWeight: 700, marginLeft: 4,
              }}>{pendingCount}</span>
            )}
          </button>
          <button onClick={exportCSV} style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "#fff", color: "#1F3326", border: "1px solid #D8CCB8", borderRadius: 10,
            padding: "9px 16px", fontSize: 13, fontWeight: 600,
            fontFamily: "'Albert Sans', sans-serif", cursor: "pointer",
            transition: "all 0.15s",
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Esporta CSV
          </button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 28 }}>
        <div className="spese-kpi spese-kpi-gold">
          <div className="kpi-num" style={{ color: "#1F3326" }}>{eur(animTotal)}</div>
          <div className="kpi-label">Totale spese ({filtered.length})</div>
        </div>
        <div className="spese-kpi spese-kpi-red">
          <div className="kpi-num" style={{ color: totalDaPagare > 0 ? "#9E3B2E" : "#1F3326" }}>{eur(animDaPagare)}</div>
          <div className="kpi-label">Da pagare ({countDaPagare})</div>
        </div>
        <div className="spese-kpi spese-kpi-green">
          <div className="kpi-num" style={{ color: "#2D5A3D" }}>{eur(animPagate)}</div>
          <div className="kpi-label">Pagate</div>
        </div>
      </div>

      {/* ── Donut Chart — Spese per Categoria ── */}
      {catTotals.length > 0 && (
        <div style={{
          background: "#fff", borderRadius: 16, border: "1px solid #D8CCB8",
          padding: 24, marginBottom: 28,
          display: "grid", gridTemplateColumns: "220px 1fr", gap: 32, alignItems: "center",
        }}>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={catTotals}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="none"
                >
                  {catTotals.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => eur(Number(value))}
                  contentStyle={{
                    background: "#1F3326", color: "#FAF9F5", border: "none",
                    borderRadius: 10, fontFamily: "'Albert Sans', sans-serif", fontSize: 13,
                    padding: "8px 14px", boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
                  }}
                  itemStyle={{ color: "#FAF9F5" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 16, color: "#1F3326", marginBottom: 14, fontWeight: 600 }}>
              Spese per categoria
            </div>
            <div className="donut-legend">
              {catTotals.slice(0, 8).map((c, i) => (
                <div key={i} className="donut-legend-item">
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: c.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, color: "#1F3326", fontWeight: 500 }}>{c.name}</span>
                  <span style={{ color: "#6C6B5D", fontVariantNumeric: "tabular-nums" }}>{eur(c.value)}</span>
                  <span style={{ color: "#9C8E78", fontSize: 11 }}>
                    {total > 0 ? `${Math.round(c.value / total * 100)}%` : ""}
                  </span>
                </div>
              ))}
              {catTotals.length > 8 && (
                <div style={{ fontSize: 12, color: "#9C8E78", paddingLeft: 18 }}>
                  +{catTotals.length - 8} altre categorie
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Spese Ricorrenti (collapsible) ── */}
      <div style={{
        background: "#fff", borderRadius: 16, border: "1px solid #D8CCB8",
        marginBottom: 28, overflow: "hidden",
      }}>
        <div style={{
          padding: "16px 24px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          borderBottom: recCollapsed ? "none" : "1px solid #D8CCB8",
        }}>
          <button className="rec-toggle-btn" onClick={() => setRecCollapsed(!recCollapsed)}>
            Spese ricorrenti
            <span style={{
              fontFamily: "'Albert Sans', sans-serif", fontSize: 12, fontWeight: 600,
              background: "#F3EBDD", color: "#6C6B5D", borderRadius: 20, padding: "2px 10px",
            }}>{recurrings.length}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6C6B5D" strokeWidth="2" strokeLinecap="round"
              style={{ transform: recCollapsed ? "rotate(0deg)" : "rotate(180deg)" }}>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </div>
        {!recCollapsed && (
          <div style={{ padding: 0 }}>
            {recurrings.length === 0 ? (
              <div style={{ padding: "32px 24px", textAlign: "center" }}>
                <div style={{ fontFamily: "'Fraunces', serif", fontSize: 16, color: "#1F3326", marginBottom: 6 }}>Nessuna spesa ricorrente</div>
                <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 13, color: "#6C6B5D" }}>Crea una spesa ricorrente per automatizzare le registrazioni mensili.</div>
              </div>
            ) : (
              <table className="spese-tbl">
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
                        <td className="amt-cell" style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{eur(r.amount)}</td>
                        <td className="hide-sm">{r.supplier_name || "\u2014"}</td>
                        <td className="hide-sm">{r.day_of_month}</td>
                        <td>
                          <span className="spese-badge" style={{ background: fc.bg, color: fc.color }}>{r.frequency}</span>
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
                            <button className="spese-btn-action" onClick={() => openEditRec(r)}>Modifica</button>
                            <button className="spese-btn-action" onClick={() => deleteRecurring(r.id)}>Elimina</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* ── Registro Spese ── */}
      <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #D8CCB8", overflow: "hidden" }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #D8CCB8" }}>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 18, color: "#1F3326", margin: 0, fontWeight: 600 }}>
            Registro spese
          </h2>
        </div>

        {/* Filter Bar */}
        <div className="spese-filter-bar" style={{ margin: "16px 16px 0", borderRadius: 12 }}>
          <input
            type="search"
            placeholder="Cerca fornitore..."
            value={q}
            onChange={(e) => { setQ(e.target.value); updateUrlFilters("q", e.target.value); }}
            style={{ flex: "1 1 160px" }}
          />
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
          <select value={originFilter} onChange={(e) => { setOriginFilter(e.target.value); updateUrlFilters("origin", e.target.value); }}>
            <option value="">Tutte le origini</option>
            <option value="manuale">Solo manuali</option>
            <option value="fornitore">Solo fornitori</option>
          </select>
          {(q || month || cat || statusFilter || originFilter) && (
            <button onClick={() => { setQ(""); setMonth(""); setCat(""); setStatusFilter(""); setOriginFilter(""); router.replace("?", { scroll: false }); }}
              style={{
                background: "none", border: "1px solid #D8CCB8", borderRadius: 8,
                padding: "8px 12px", fontSize: 12, fontFamily: "'Albert Sans', sans-serif",
                color: "#9E3B2E", cursor: "pointer", fontWeight: 600,
              }}>
              Azzera filtri
            </button>
          )}
        </div>

        {/* Table */}
        <div style={{ padding: "0 0 0 0", overflowX: "auto" }}>
          {loading ? (
            <div style={{ padding: "48px 20px", textAlign: "center", fontFamily: "'Albert Sans', sans-serif", color: "#6C6B5D" }}>Caricamento...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: "56px 20px", textAlign: "center" }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#D8CCB8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 16 }}>
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
              </svg>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: 20, marginBottom: 6, color: "#1F3326" }}>Nessuna spesa registrata</div>
              <div style={{ color: "#6C6B5D", fontSize: 14, marginBottom: 20, fontFamily: "'Albert Sans', sans-serif" }}>
                {(month || cat || statusFilter || originFilter || q) ? "Nessun risultato con i filtri selezionati." : "Non ci sono ancora spese per questo periodo."}
              </div>
              <Link href="/nuova" style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: "#1F3326", color: "#fff", border: "none", borderRadius: 10,
                padding: "10px 20px", fontSize: 14, fontWeight: 600,
                fontFamily: "'Albert Sans', sans-serif", textDecoration: "none",
              }}>
                Registra la prima spesa
              </Link>
            </div>
          ) : (
            <table className="spese-tbl">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Fornitore</th>
                  <th className="hide-sm">Categoria</th>
                  <th className="hide-sm">Stato</th>
                  <th className="hide-sm">Doc.</th>
                  <th style={{ textAlign: "right" }}>Importo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {paginatedExpenses.map((e) => {
                  const catColor = e.categories?.color ?? "#9C8E78";
                  const isPaid = e.payment_status === "pagato";
                  return (
                    <tr key={e.id}>
                      <td style={{ whiteSpace: "nowrap" }}>{fmtDate(e.expense_date)}</td>
                      <td>
                        <strong style={{ color: "#1F3326" }}>{e.supplier_name || "\u2014"}</strong>
                        {e.supplier_id && (
                          <span className="spese-badge" style={{ marginLeft: 8, background: "#F6E3D3", color: "#C0713B" }}>Da fornitore</span>
                        )}
                        {Array.isArray(e.edit_history) && e.edit_history.length > 0 && (
                          <span
                            className="spese-badge"
                            style={{ marginLeft: 6, background: "#DAE7F5", color: "#3B6FA0", cursor: "pointer", position: "relative" }}
                            onMouseEnter={() => setHistoryTooltip(e.id)}
                            onMouseLeave={() => setHistoryTooltip(null)}
                          >
                            Modificata ({e.edit_history.length})
                            {historyTooltip === e.id && (
                              <div style={{
                                position: "absolute", bottom: "calc(100% + 6px)", left: 0,
                                background: "#1F3326", color: "#FAF9F5", borderRadius: 10,
                                padding: "12px 14px", fontSize: 12, lineHeight: 1.6, zIndex: 100,
                                minWidth: 280, maxWidth: 380, boxShadow: "0 4px 20px rgba(0,0,0,.2)",
                                whiteSpace: "normal", fontWeight: 400,
                              }}>
                                {(e.edit_history as EditHistoryEntry[]).map((h, i) => (
                                  <div key={i} style={{ marginBottom: i < e.edit_history!.length - 1 ? 10 : 0, borderBottom: i < e.edit_history!.length - 1 ? "1px solid rgba(255,255,255,.15)" : "none", paddingBottom: i < e.edit_history!.length - 1 ? 8 : 0 }}>
                                    <div style={{ fontWeight: 600, marginBottom: 2 }}>
                                      {h.edited_by_name} &mdash; {fmtDate(h.edited_at)} {new Date(h.edited_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                                    </div>
                                    {Object.entries(h.changes).map(([field, { old: oldV, new: newV }]) => (
                                      <div key={field} style={{ fontSize: 11, color: "rgba(250,249,245,.7)" }}>
                                        {FIELD_LABELS[field] ?? field}: {formatFieldValue(field, oldV)} &rarr; {formatFieldValue(field, newV)}
                                      </div>
                                    ))}
                                  </div>
                                ))}
                              </div>
                            )}
                          </span>
                        )}
                        {e.notes && <div style={{ fontSize: 12, color: "#9C8E78", marginTop: 2 }}>{e.notes}</div>}
                        {e.profiles?.full_name && <div style={{ fontSize: 11, color: "#9C8E78", marginTop: 1 }}>di {e.profiles.full_name}</div>}
                      </td>
                      <td className="hide-sm">
                        <span className="spese-badge" style={{ background: catColor + "18", color: catColor }}>
                          {e.categories?.name ?? "Altro"}
                        </span>
                      </td>
                      <td className="hide-sm">
                        <span className="spese-badge" style={{
                          background: isPaid ? "#E3EEE4" : "#F3D9D5",
                          color: isPaid ? "#2D5A3D" : "#9E3B2E",
                        }}>
                          {isPaid ? "Pagata" : "Da pagare"}
                        </span>
                      </td>
                      <td className="hide-sm">
                        {e.document_path
                          ? <button className="spese-btn-action" onClick={() => openDoc(e.document_path!)}>&#x1F4CE; {e.doc_type}</button>
                          : <span style={{ color: "#9C8E78", fontSize: 12 }}>{e.doc_type}</span>}
                      </td>
                      <td className="amt-cell" style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{eur(Number(e.amount))}</td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          {e.supplier_id ? (
                            <span
                              title="Modifica dalla pagina Fornitori"
                              className="spese-btn-action"
                              data-disabled="true"
                            >
                              Modifica
                            </span>
                          ) : (
                            <button className="spese-btn-action" onClick={() => openEditExpense(e)}>
                              Modifica
                            </button>
                          )}
                          {e.supplier_id ? (
                            <span
                              title="Spesa collegata a una consegna fornitore"
                              className="spese-btn-action"
                              data-disabled="true"
                            >
                              Elimina
                            </span>
                          ) : (
                            <button className="spese-btn-action" onClick={() => del(e.id, e.document_path)}>Elimina</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
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
                transition: "opacity 0.15s",
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
                transition: "opacity 0.15s",
              }}
            >
              Successiva
            </button>
          </div>
        )}
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

      {/* ── Edit Expense Modal ── */}
      <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="Modifica spesa">
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          <div className="grid2">
            <div className="field">
              <label>Importo (EUR)</label>
              <input type="number" step="0.01" min="0" value={editForm.amount} onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })} />
            </div>
            <div className="field">
              <label>Data</label>
              <input type="date" value={editForm.expense_date} onChange={(e) => setEditForm({ ...editForm, expense_date: e.target.value })} />
            </div>
            <div className="field">
              <label>Fornitore</label>
              <input value={editForm.supplier_name} onChange={(e) => setEditForm({ ...editForm, supplier_name: e.target.value })} />
            </div>
            <div className="field">
              <label>Categoria</label>
              <select value={editForm.category_id} onChange={(e) => setEditForm({ ...editForm, category_id: e.target.value })}>
                <option value="">— Nessuna —</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Tipo documento</label>
              <select value={editForm.doc_type} onChange={(e) => setEditForm({ ...editForm, doc_type: e.target.value })}>
                {DOC_TYPES.map((d) => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Metodo pagamento</label>
              <select value={editForm.payment_method} onChange={(e) => setEditForm({ ...editForm, payment_method: e.target.value })}>
                {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Centro di costo</label>
              <select value={editForm.cost_center} onChange={(e) => setEditForm({ ...editForm, cost_center: e.target.value })}>
                {COST_CENTERS.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Stato</label>
              <select value={editForm.payment_status} onChange={(e) => setEditForm({ ...editForm, payment_status: e.target.value })}>
                <option value="pagato">Pagata</option>
                <option value="da_pagare">Da pagare</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label>Note</label>
            <textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} placeholder="Note opzionali..." style={{ minHeight: 50 }} />
          </div>
        </div>
        <div style={{ paddingTop: 16, borderTop: "1px solid var(--line)", display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="btn btn-ghost" onClick={() => setShowEditModal(false)}>Annulla</button>
          <button className="btn btn-primary" onClick={saveEditExpense} disabled={savingEdit}>
            {savingEdit ? "Salvataggio..." : "Salva modifiche"}
          </button>
        </div>
      </Modal>

      {/* ── Toast ── */}
      <Toast toast={toast} />
    </>
  );
}
