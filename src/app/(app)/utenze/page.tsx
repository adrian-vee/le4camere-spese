"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { eur, fmtDate, isoToday, csvSafe, type Category } from "@/lib/format";
import { useRole } from "@/lib/useRole";
import { canAccess } from "@/lib/permissions";
import { useToast } from "@/lib/useToast";
import { Toast } from "@/components/Toast";
import { Modal } from "@/components/ui/Modal";
import DatePickerIT from "@/components/ui/DatePickerIT";
import { extractBillFromPdf, type ExtractedBillData } from "@/lib/extractBillData";

/* ── Types ── */

type Bill = {
  id: string;
  utility_type: string;
  supplier: string;
  amount: number;
  period_start: string;
  period_end: string;
  consumption: number | null;
  unit: string | null;
  contract_power: string | null;
  contract_type: string | null;
  notes: string | null;
  file_path: string | null;
  expense_id: string | null;
  created_by: string | null;
  created_at: string;
};

type Expense = { id: string; supplier_name: string | null; amount: number; expense_date: string; supplier?: string | null; category_id?: string | null };

/* ── Constants ── */

const BILL_TYPES = [
  { value: "Luce", color: "#eab308", unit: "kWh", icon: "M13 2L3 14h9l-1 8 10-12h-9l1-8z" },
  { value: "Gas", color: "#ea580c", unit: "Smc", icon: "M12 2c0 4-4 6-4 10a4 4 0 108 0c0-4-4-6-4-10z" },
  { value: "Acqua", color: "#3b82f6", unit: "m\u00B3", icon: "M12 2c-4 6-7 9-7 13a7 7 0 1014 0c0-4-3-7-7-13z" },
  { value: "Immondizia", color: "#2d6a4f", unit: "kg", icon: "M3 6h18M8 6V4h8v2M5 6v14a2 2 0 002 2h10a2 2 0 002-2V6" },
  { value: "Internet", color: "#7c3aed", unit: "", icon: "M12 20h.01M8.53 16.11a6 6 0 018.94 0M5.06 12.68a10 10 0 0113.88 0M1.59 9.25a14 14 0 0120.82 0" },
];

const KPI_BORDER_COLORS: Record<string, string> = {
  Luce: "#eab308",
  Gas: "#ea580c",
  Acqua: "#3b82f6",
  Immondizia: "#2d6a4f",
  Internet: "#7c3aed",
  Totale: "#BFA762",
};

const MONTH_LABELS = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
const MONTH_FULL = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

const typeColor = (t: string) => BILL_TYPES.find((b) => b.value === t)?.color ?? "#6C6B5D";
const typeUnit = (t: string) => BILL_TYPES.find((b) => b.value === t)?.unit ?? "";

const emptyForm = {
  utility_type: "Luce" as string,
  supplier: "",
  amount: "",
  period_start: "",
  period_end: "",
  consumption: "",
  unit: "kWh",
  contract_power: "",
  notes: "",
  auto_expense: true,
  link_expense_id: "",
};

function BillIcon({ type, size = 18 }: { type: string; size?: number }) {
  const bt = BILL_TYPES.find((b) => b.value === type);
  if (!bt) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={bt.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d={bt.icon} />
    </svg>
  );
}

/* ── Component ── */

export default function UtenzePage() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { role, loading: roleLoading } = useRole();

  useEffect(() => {
    if (!roleLoading && !canAccess(role, "/utenze")) {
      router.replace("/");
    }
  }, [roleLoading, role, router]);

  const [bills, setBills] = useState<Bill[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  /* Filters */
  const [filterType, setFilterType] = useState(searchParams.get("type") || "");
  const [filterSupplier, setFilterSupplier] = useState(searchParams.get("supplier") || "");
  const [filterYear, setFilterYear] = useState(searchParams.get("year") || String(new Date().getFullYear()));

  const updateUrlFilters = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== "") params.set(key, value);
    else params.delete(key);
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [searchParams, router]);

  /* Chart year */
  const [chartYear, setChartYear] = useState(String(new Date().getFullYear()));

  /* Modal */
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [file, setFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractResult, setExtractResult] = useState<"success" | "partial" | "none" | null>(null);

  /* Toast */
  const { toast, showToast } = useToast();

  const set = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  /** Handle file upload with optional PDF extraction */
  async function handleFileUpload(f: File | null) {
    setFile(f);
    setExtractResult(null);
    if (!f || !f.name.toLowerCase().endsWith(".pdf")) return;

    setExtracting(true);
    try {
      const data: ExtractedBillData = await extractBillFromPdf(f);
      const fields = Object.values(data).filter(Boolean);

      if (fields.length === 0) {
        setExtractResult("none");
        setExtracting(false);
        return;
      }

      setForm((prev) => ({
        ...prev,
        ...(data.utility_type ? { utility_type: data.utility_type } : {}),
        ...(data.supplier ? { supplier: data.supplier } : {}),
        ...(data.period_start ? { period_start: data.period_start } : {}),
        ...(data.period_end ? { period_end: data.period_end } : {}),
        ...(data.consumption ? { consumption: data.consumption } : {}),
        ...(data.unit ? { unit: data.unit } : {}),
        ...(data.amount ? { amount: data.amount } : {}),
      }));

      setExtractResult(fields.length >= 3 ? "success" : "partial");
    } catch {
      setExtractResult("none");
    }
    setExtracting(false);
  }

  /* ── Data loading ── */

  async function load() {
    const [{ data: b }, { data: c }, { data: e }] = await Promise.all([
      supabase.from("utility_bills").select("*").order("period_end", { ascending: false }),
      supabase.from("categories").select("*").order("sort"),
      supabase.from("expenses").select("id, supplier_name, amount, expense_date, category_id").order("expense_date", { ascending: false }),
    ]);
    setBills((b ?? []) as Bill[]);
    setCats((c ?? []) as Category[]);
    setExpenses((e ?? []) as Expense[]);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  /* ── Derived data ── */

  const availableYears = useMemo(() => {
    const years = new Set(bills.map((b) => new Date(b.period_end).getFullYear()));
    years.add(new Date().getFullYear());
    return [...years].sort((a, b) => b - a);
  }, [bills]);

  const suppliers = useMemo(() => [...new Set(bills.map((b) => b.supplier))].sort(), [bills]);

  const utenzeExpenses = useMemo(() => {
    const utCat = cats.find((c) => c.name.toLowerCase().includes("utenz") || c.name.toLowerCase().includes("luce") || c.name.toLowerCase().includes("gas"));
    return utCat ? expenses.filter((e) => e.category_id === utCat.id) : expenses;
  }, [cats, expenses]);

  /* KPI: totals per type for current year */
  const kpiYear = new Date().getFullYear();
  const kpiBills = useMemo(() => bills.filter((b) => new Date(b.period_end).getFullYear() === kpiYear), [bills, kpiYear]);
  const kpiByType = useMemo(() => {
    const map: Record<string, number> = {};
    for (const bt of BILL_TYPES) map[bt.value] = 0;
    for (const b of kpiBills) map[b.utility_type] = (map[b.utility_type] || 0) + b.amount;
    return map;
  }, [kpiBills]);
  const kpiTotal = useMemo(() => kpiBills.reduce((s, b) => s + b.amount, 0), [kpiBills]);

  /* Chart data: monthly totals by type for chartYear */
  const chartData = useMemo(() => {
    const yr = parseInt(chartYear);
    const months: { month: number; byType: Record<string, number>; total: number }[] = [];
    for (let m = 0; m < 12; m++) {
      const byType: Record<string, number> = {};
      for (const bt of BILL_TYPES) byType[bt.value] = 0;
      const monthBills = bills.filter((b) => {
        const d = new Date(b.period_end);
        return d.getFullYear() === yr && d.getMonth() === m;
      });
      for (const b of monthBills) byType[b.utility_type] = (byType[b.utility_type] || 0) + b.amount;
      const total = monthBills.reduce((s, b) => s + b.amount, 0);
      months.push({ month: m, byType, total });
    }
    return months;
  }, [bills, chartYear]);

  const chartMax = useMemo(() => Math.max(1, ...chartData.map((m) => m.total)), [chartData]);

  /* Filtered bills table */
  const filtered = useMemo(() => {
    const yr = parseInt(filterYear);
    const q = filterSupplier.toLowerCase().trim();
    return bills.filter((b) => {
      if (filterType && b.utility_type !== filterType) return false;
      if (yr && new Date(b.period_end).getFullYear() !== yr) return false;
      if (q && !b.supplier.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [bills, filterType, filterSupplier, filterYear]);

  /* Year-over-year comparison */
  const yoyYear = parseInt(filterYear) || new Date().getFullYear();
  const yoyData = useMemo(() => {
    const curr = yoyYear;
    const prev = curr - 1;
    const rows: { month: number; currAmt: number; prevAmt: number; diff: number; pct: number | null }[] = [];
    for (let m = 0; m < 12; m++) {
      const currAmt = bills
        .filter((b) => { const d = new Date(b.period_end); return d.getFullYear() === curr && d.getMonth() === m; })
        .reduce((s, b) => s + b.amount, 0);
      const prevAmt = bills
        .filter((b) => { const d = new Date(b.period_end); return d.getFullYear() === prev && d.getMonth() === m; })
        .reduce((s, b) => s + b.amount, 0);
      const diff = currAmt - prevAmt;
      const pct = prevAmt > 0 ? ((diff / prevAmt) * 100) : null;
      rows.push({ month: m, currAmt, prevAmt, diff, pct });
    }
    return rows;
  }, [bills, yoyYear]);

  // Only show months that have data in either year
  const yoyFiltered = useMemo(() => yoyData.filter(r => r.currAmt > 0 || r.prevAmt > 0), [yoyData]);

  /* ── Actions ── */

  function openNew() {
    setForm({ ...emptyForm });
    setEditId(null);
    setFile(null);
    setExtractResult(null);
    setShowModal(true);
  }

  function openEdit(b: Bill) {
    setForm({
      utility_type: b.utility_type,
      supplier: b.supplier,
      amount: String(b.amount),
      period_start: b.period_start,
      period_end: b.period_end,
      consumption: b.consumption != null ? String(b.consumption) : "",
      unit: b.unit || typeUnit(b.utility_type),
      contract_power: b.contract_power || "",
      notes: b.notes || "",
      auto_expense: false,
      link_expense_id: b.expense_id || "",
    });
    setEditId(b.id);
    setFile(null);
    setExtractResult(null);
    setShowModal(true);
  }

  async function save() {
    const amt = parseFloat(form.amount);
    if (!form.supplier.trim() || isNaN(amt) || amt <= 0 || !form.period_start || !form.period_end) {
      showToast("Compila tutti i campi obbligatori", "warn");
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non autenticato");

      const consumption = form.consumption ? parseFloat(form.consumption) : null;
      const payload = {
        utility_type: form.utility_type,
        supplier: form.supplier.trim(),
        amount: amt,
        period_start: form.period_start,
        period_end: form.period_end,
        consumption,
        unit: consumption ? form.unit : null,
        contract_power: form.contract_power.trim() || null,
        notes: form.notes.trim() || null,
        created_by: user.id,
      };

      let billId = editId;

      if (editId) {
        const { error } = await supabase.from("utility_bills").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { data: bill, error } = await supabase.from("utility_bills").insert(payload).select("id").single();
        if (error) throw error;
        billId = bill.id;
      }

      /* File upload */
      if (file && billId) {
        const filePath = `utenze/${billId}/${file.name}`;
        const { error: upErr } = await supabase.storage.from("documenti").upload(filePath, file, { upsert: true });
        if (!upErr) {
          await supabase.from("utility_bills").update({ file_path: filePath }).eq("id", billId);
        }
      }

      /* Link or auto-create expense */
      let expenseCreated = false;
      if (!editId) {
        if (form.link_expense_id) {
          const { error: linkErr } = await supabase.from("utility_bills").update({ expense_id: form.link_expense_id }).eq("id", billId);
          if (linkErr) throw new Error("Errore collegamento spesa: " + linkErr.message);
          expenseCreated = true;
        } else if (form.auto_expense) {
          const utenzeCat = cats.find((c) =>
            c.name.toLowerCase().includes("utenz") || c.name.toLowerCase().includes("luce") || c.name.toLowerCase().includes("gas")
          );
          const dueDate = new Date(form.period_end);
          dueDate.setDate(dueDate.getDate() + 30);
          const consumoNote = consumption ? ` | Consumo: ${consumption} ${form.unit}` : "";
          const noteText = `Bolletta ${form.utility_type} \u2014 periodo ${fmtDate(form.period_start)} - ${fmtDate(form.period_end)}${consumoNote}`;
          const { data: expense, error: expErr } = await supabase
            .from("expenses")
            .insert({
              amount: amt,
              expense_date: form.period_end,
              category_id: utenzeCat?.id ?? null,
              supplier_name: form.supplier.trim(),

              doc_type: "Fattura",
              payment_method: "Bonifico",
              payment_status: "da_pagare",
              due_date: dueDate.toISOString().slice(0, 10),
              cost_center: "Generale",
              notes: noteText,
              created_by: user.id,
            })
            .select("id")
            .single();
          if (expErr) throw new Error("Errore creazione spesa automatica: " + expErr.message);
          if (expense) {
            await supabase.from("utility_bills").update({ expense_id: expense.id }).eq("id", billId);
            expenseCreated = true;
          }
        }
      }

      showToast(editId ? "Bolletta aggiornata" : expenseCreated ? "Bolletta salvata + spesa creata" : "Bolletta salvata");
      setShowModal(false);
      load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Errore imprevisto", "error");
    } finally {
      setSaving(false);
    }
  }

  async function del(id: string) {
    if (!confirm("Eliminare questa bolletta?")) return;
    const bill = bills.find((b) => b.id === id);
    if (bill?.file_path) await supabase.storage.from("documenti").remove([bill.file_path]);
    await supabase.from("utility_bills").delete().eq("id", id);
    setBills((prev) => prev.filter((b) => b.id !== id));
    showToast("Bolletta eliminata");
  }

  async function openDoc(path: string) {
    const { data } = await supabase.storage.from("documenti").createSignedUrl(path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  function exportCSV() {
    if (!filtered.length) return showToast("Nessuna bolletta da esportare", "warn");
    const head = ["Data", "Tipo", "Fornitore", "Periodo", "Consumo", "Unit\u00E0", "Costo", "Contratto", "Note"];
    const rows = filtered.map((b) => [
      csvSafe(fmtDate(b.period_end)),
      csvSafe(b.utility_type),
      csvSafe(b.supplier),
      csvSafe(`${fmtDate(b.period_start)} - ${fmtDate(b.period_end)}`),
      csvSafe(b.consumption != null ? String(b.consumption).replace(".", ",") : ""),
      csvSafe(b.unit || ""),
      csvSafe(String(b.amount).replace(".", ",")),
      csvSafe(b.contract_power || ""),
      csvSafe((b.notes || "").replace(/\n/g, " ")),
    ]);
    const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = `utenze-le4camere-${isoToday()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ── Render ── */

  if (roleLoading || !canAccess(role, "/utenze")) {
    return <div style={{ padding: 40, textAlign: "center", color: "#6C6B5D", fontFamily: "'Albert Sans', sans-serif" }}>Caricamento...</div>;
  }

  /* ── Shared styles ── */
  const S = {
    card: { background: "#fff", border: "1px solid #D8CCB8", borderRadius: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" } as React.CSSProperties,
    label: { fontFamily: "'Albert Sans', sans-serif", fontSize: 11, letterSpacing: "0.5px", textTransform: "uppercase" as const, color: "#6C6B5D", fontWeight: 600 },
    value: { fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 600, color: "#1F3326" },
    sectionTitle: { fontFamily: "'Fraunces', serif", fontSize: 16, fontWeight: 500, color: "#1F3326", margin: 0 },
    body: { fontFamily: "'Albert Sans', sans-serif", fontSize: 13, color: "#1F3326" },
  };

  return (
    <>
      <style>{`
        .ut-page{max-width:1400px;margin:0 auto;padding:0 24px}
        .ut-header{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:20px}
        .ut-cols{display:grid;grid-template-columns:1fr 0.67fr;gap:20px;align-items:start}
        .ut-kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px}
        .ut-badge{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:20px;font-size:11px;font-weight:600;font-family:'Albert Sans',sans-serif}
        .ut-tbl{width:100%;border-collapse:collapse;font-family:'Albert Sans',sans-serif;font-size:13px}
        .ut-tbl thead th{background:#F3EBDD;color:#1F3326;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;padding:8px 10px;text-align:left;border-bottom:1px solid #D8CCB8}
        .ut-tbl tbody td{padding:8px 10px;border-bottom:1px solid #f0ebe0;color:#1F3326;vertical-align:middle}
        .ut-tbl tbody tr:hover{background:#FAF7F0}
        .ut-chart-bars{display:flex;align-items:flex-end;gap:6px;height:200px}
        .ut-chart-col{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;min-width:0}
        .ut-chart-stack{display:flex;flex-direction:column-reverse;width:100%;gap:1px;height:170px;justify-content:flex-start}
        .ut-chart-seg{width:100%;border-radius:2px 2px 0 0;min-height:0;transition:height .3s ease}
        .ut-legend{display:flex;gap:12px;flex-wrap:wrap;margin-top:12px}
        .ut-legend-item{display:flex;align-items:center;gap:5px;font-family:'Albert Sans',sans-serif;font-size:11px;color:#6C6B5D;font-weight:600}
        .ut-legend-dot{width:8px;height:8px;border-radius:2px}
        .ut-yoy-tbl{width:100%;border-collapse:collapse;font-family:'Albert Sans',sans-serif;font-size:12px}
        .ut-yoy-tbl thead th{background:#F3EBDD;color:#1F3326;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;padding:7px 8px;text-align:left;border-bottom:1px solid #D8CCB8}
        .ut-yoy-tbl tbody td{padding:7px 8px;border-bottom:1px solid #f0ebe0;color:#1F3326}
        .ut-yoy-tbl tbody tr:hover{background:#FAF7F0}
        .ut-file-link{color:#BFA762;font-size:12px;font-weight:600;cursor:pointer;text-decoration:underline;background:none;border:none;padding:0;font-family:'Albert Sans',sans-serif}
        .ut-act-btn{background:none;border:1px solid #D8CCB8;border-radius:6px;padding:4px 10px;font-family:'Albert Sans',sans-serif;font-size:11px;font-weight:600;color:#1F3326;cursor:pointer}
        .ut-act-btn:hover{background:#F3EBDD}
        .ut-filter select,.ut-filter input{font-family:'Albert Sans',sans-serif;font-size:13px;border:1px solid #D8CCB8;border-radius:8px;padding:6px 10px;background:#fff;color:#1F3326}
        @media(max-width:1024px){.ut-cols{grid-template-columns:1fr}}
        @media(max-width:640px){.ut-kpi-grid{grid-template-columns:repeat(2,1fr)}}
      `}</style>

      <div className="ut-page">
        {/* ── Header ── */}
        <div className="ut-header">
          <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 26, color: "#1F3326", margin: 0, fontWeight: 500 }}>
            Utenze e Costi Fissi
          </h1>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={openNew} style={{
              background: "#1F3326", color: "#fff", border: "none", borderRadius: 8,
              padding: "9px 18px", fontFamily: "'Albert Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: 6,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Nuova bolletta
            </button>
            <button onClick={exportCSV} style={{
              background: "#fff", color: "#1F3326", border: "1px solid #D8CCB8", borderRadius: 8,
              padding: "9px 18px", fontFamily: "'Albert Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: 6,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Esporta CSV
            </button>
          </div>
        </div>

        {/* ── Two-column layout ── */}
        <div className="ut-cols">

          {/* ══ LEFT COLUMN (60%) ══ */}
          <div>
            {/* KPI Cards 3x2 */}
            <div className="ut-kpi-grid">
              {BILL_TYPES.map((bt) => (
                <div key={bt.value} style={{ ...S.card, padding: 14, borderTop: `3px solid ${KPI_BORDER_COLORS[bt.value]}` }}>
                  <div style={{ ...S.label, display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                    <BillIcon type={bt.value} size={14} />
                    {bt.value}
                  </div>
                  <div style={S.value}>{eur(kpiByType[bt.value] || 0)}</div>
                  <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 10, color: "#999", marginTop: 2 }}>{kpiYear}</div>
                </div>
              ))}
              <div style={{ ...S.card, padding: 14, borderTop: `3px solid ${KPI_BORDER_COLORS.Totale}` }}>
                <div style={{ ...S.label, display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#BFA762" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6" />
                  </svg>
                  Totale
                </div>
                <div style={{ ...S.value, color: "#BFA762" }}>{eur(kpiTotal)}</div>
                <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 10, color: "#999", marginTop: 2 }}>{kpiYear}</div>
              </div>
            </div>

            {/* Registro bollette */}
            <div style={{ ...S.card, overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid #f0ebe0", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <h3 style={{ ...S.sectionTitle, fontSize: 15 }}>
                  Registro bollette <span style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 12, color: "#6C6B5D", fontWeight: 400 }}>&middot; {eur(filtered.reduce((s, b) => s + b.amount, 0))}</span>
                </h3>
                <div className="ut-filter" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <select value={filterType} onChange={(e) => { setFilterType(e.target.value); updateUrlFilters("type", e.target.value); }} style={{ padding: "5px 8px", fontSize: 12 }}>
                    <option value="">Tutti</option>
                    {BILL_TYPES.map((bt) => <option key={bt.value} value={bt.value}>{bt.value}</option>)}
                  </select>
                  <input type="search" placeholder="Fornitore..." value={filterSupplier} onChange={(e) => { setFilterSupplier(e.target.value); updateUrlFilters("supplier", e.target.value); }} style={{ padding: "5px 8px", fontSize: 12, width: 110 }} />
                  <select value={filterYear} onChange={(e) => { setFilterYear(e.target.value); updateUrlFilters("year", e.target.value); }} style={{ padding: "5px 8px", fontSize: 12 }}>
                    {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>

              {loading ? (
                <div style={{ padding: "20px 16px", textAlign: "center", ...S.body, color: "#999" }}>Caricamento...</div>
              ) : filtered.length === 0 ? (
                <div style={{ padding: "16px 20px", background: "#F3EBDD", fontFamily: "'Albert Sans', sans-serif", fontSize: 13, color: "#6C6B5D", display: "flex", alignItems: "center", gap: 8 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#BFA762" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  Nessuna bolletta &mdash; premi <strong style={{ margin: "0 4px" }}>+ Nuova bolletta</strong> per iniziare
                </div>
              ) : (
                <table className="ut-tbl">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Tipo</th>
                      <th>Fornitore</th>
                      <th style={{ textAlign: "right" }}>Costo</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((b) => (
                      <tr key={b.id}>
                        <td style={{ whiteSpace: "nowrap" }}>{fmtDate(b.period_end)}</td>
                        <td>
                          <span className="ut-badge" style={{ background: typeColor(b.utility_type) + "18", color: typeColor(b.utility_type) }}>
                            <BillIcon type={b.utility_type} size={12} />
                            {b.utility_type}
                          </span>
                        </td>
                        <td>
                          <strong>{b.supplier}</strong>
                          {b.consumption != null && <span style={{ fontSize: 11, color: "#999", marginLeft: 6 }}>{b.consumption} {b.unit}</span>}
                        </td>
                        <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{eur(b.amount)}</td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                            {b.file_path && <button className="ut-file-link" onClick={() => openDoc(b.file_path!)}>Doc</button>}
                            <button className="ut-act-btn" onClick={() => openEdit(b)}>Modifica</button>
                            <button className="ut-act-btn" onClick={() => del(b.id)}>Elimina</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* ══ RIGHT COLUMN (40%) ══ */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Andamento mensile */}
            <div style={{ ...S.card, padding: "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <h3 style={S.sectionTitle}>Andamento mensile</h3>
                <select value={chartYear} onChange={(e) => setChartYear(e.target.value)} style={{
                  padding: "4px 10px", borderRadius: 8, border: "1px solid #D8CCB8",
                  fontSize: 12, background: "#fff", fontFamily: "'Albert Sans', sans-serif", color: "#1F3326",
                }}>
                  {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div className="ut-chart-bars">
                {chartData.map((m) => (
                  <div key={m.month} className="ut-chart-col">
                    <div className="ut-chart-stack">
                      {BILL_TYPES.map((bt) => {
                        const h = chartMax > 0 ? (m.byType[bt.value] / chartMax) * 170 : 0;
                        return h > 0 ? <div key={bt.value} className="ut-chart-seg" style={{ height: h, background: bt.color }} title={`${bt.value}: ${eur(m.byType[bt.value])}`} /> : null;
                      })}
                    </div>
                    <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 10, color: "#6C6B5D", fontWeight: 600 }}>{MONTH_LABELS[m.month]}</div>
                    {m.total > 0 && <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 9, color: "#999", fontVariantNumeric: "tabular-nums" }}>{eur(m.total)}</div>}
                  </div>
                ))}
              </div>
              <div className="ut-legend">
                {BILL_TYPES.map((bt) => (
                  <div key={bt.value} className="ut-legend-item">
                    <div className="ut-legend-dot" style={{ background: bt.color }} />
                    {bt.value}
                  </div>
                ))}
              </div>
            </div>

            {/* Confronto anno su anno */}
            <div style={{ ...S.card, overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid #f0ebe0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <h3 style={{ ...S.sectionTitle, fontSize: 14 }}>Confronto anno su anno</h3>
                <span style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 11, color: "#999", fontWeight: 600 }}>{yoyYear} vs {yoyYear - 1}</span>
              </div>
              {yoyFiltered.length === 0 ? (
                <div style={{ padding: "14px 16px", fontFamily: "'Albert Sans', sans-serif", fontSize: 13, color: "#6C6B5D", background: "#F3EBDD" }}>
                  Nessun dato disponibile per il confronto
                </div>
              ) : (
                <table className="ut-yoy-tbl">
                  <thead>
                    <tr>
                      <th>Mese</th>
                      <th style={{ textAlign: "right" }}>{yoyYear}</th>
                      <th style={{ textAlign: "right" }}>{yoyYear - 1}</th>
                      <th style={{ textAlign: "right" }}>Diff.</th>
                      <th style={{ textAlign: "right" }}>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {yoyFiltered.map((r) => {
                      const diffColor = r.diff > 0 ? "#9E3B2E" : r.diff < 0 ? "#2D5A3D" : "#6C6B5D";
                      return (
                        <tr key={r.month}>
                          <td style={{ fontWeight: 600 }}>{MONTH_FULL[r.month]}</td>
                          <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.currAmt > 0 ? eur(r.currAmt) : "\u2014"}</td>
                          <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.prevAmt > 0 ? eur(r.prevAmt) : "\u2014"}</td>
                          <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: diffColor, fontWeight: 600 }}>
                            {r.currAmt === 0 && r.prevAmt === 0 ? "\u2014" : `${r.diff > 0 ? "+" : ""}${eur(r.diff)}`}
                          </td>
                          <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: diffColor, fontWeight: 600 }}>
                            {r.pct != null ? `${r.pct > 0 ? "+" : ""}${r.pct.toFixed(1)}%` : "\u2014"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── New / Edit Modal ── */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editId ? "Modifica bolletta" : "Nuova bolletta"} maxWidth={560}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, overflowY: "auto", maxHeight: "calc(100dvh - 240px)", padding: "0 2px" }}>

          {/* Upload bolletta — first, so PDF extraction pre-fills fields below */}
          <div className="field">
            <label>Upload bolletta (PDF per lettura automatica)</label>
            <div style={{
              border: "1px dashed #D8CCB8", borderRadius: 8, padding: "10px 14px",
              background: "#FAF9F5", display: "flex", alignItems: "center", gap: 10,
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6C6B5D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={(e) => handleFileUpload(e.target.files?.[0] || null)}
                style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 13, color: "#1F3326", flex: 1 }}
              />
            </div>
          </div>

          {/* Extraction feedback */}
          {extracting && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
              background: "#F3EBDD", borderRadius: 8, marginBottom: 4,
              fontFamily: "'Albert Sans', sans-serif", fontSize: 13, color: "#6C6B5D",
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#BFA762" strokeWidth="2" strokeLinecap="round" style={{ animation: "spin 1s linear infinite" }}>
                <path d="M21 12a9 9 0 11-6.219-8.56" />
              </svg>
              Lettura bolletta in corso...
            </div>
          )}
          {extractResult === "success" && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
              background: "rgba(45,90,61,0.08)", border: "1px solid rgba(45,90,61,0.2)",
              borderRadius: 8, marginBottom: 4,
              fontFamily: "'Albert Sans', sans-serif", fontSize: 13, color: "#2D5A3D",
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2D5A3D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              Campi precompilati dalla bolletta &mdash; verifica prima di salvare
            </div>
          )}
          {extractResult === "partial" && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
              background: "rgba(191,167,98,0.1)", border: "1px solid rgba(191,167,98,0.25)",
              borderRadius: 8, marginBottom: 4,
              fontFamily: "'Albert Sans', sans-serif", fontSize: 13, color: "#8B7333",
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#BFA762" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              Alcuni campi precompilati &mdash; completa quelli mancanti
            </div>
          )}
          {extractResult === "none" && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
              background: "rgba(158,59,46,0.06)", border: "1px solid rgba(158,59,46,0.15)",
              borderRadius: 8, marginBottom: 4,
              fontFamily: "'Albert Sans', sans-serif", fontSize: 13, color: "#9E3B2E",
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9E3B2E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              Non è stato possibile leggere la bolletta &mdash; inserisci i dati manualmente
            </div>
          )}

          {/* Tipo + Fornitore */}
          <div className="grid2">
            <div className="field">
              <label>Tipo utenza</label>
              <select value={form.utility_type} onChange={(e) => { set("utility_type", e.target.value); set("unit", typeUnit(e.target.value)); }}>
                {BILL_TYPES.map((bt) => <option key={bt.value} value={bt.value}>{bt.value}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Fornitore</label>
              <input
                list="ut-suppliers"
                value={form.supplier}
                onChange={(e) => set("supplier", e.target.value)}
                placeholder="Es. Enel, A2A..."
              />
              <datalist id="ut-suppliers">
                {suppliers.map((s) => <option key={s} value={s} />)}
              </datalist>
            </div>
          </div>

          {/* Periodo da / a */}
          <div className="grid2">
            <div className="field">
              <label>Periodo da</label>
              <DatePickerIT value={form.period_start} onChange={v => set("period_start", v)} />
            </div>
            <div className="field">
              <label>Periodo a</label>
              <DatePickerIT value={form.period_end} onChange={v => set("period_end", v)} />
            </div>
          </div>

          {/* Consumo + Unità */}
          <div className="grid2">
            <div className="field">
              <label>Consumo</label>
              <input type="number" step="0.01" min="0" value={form.consumption} onChange={(e) => set("consumption", e.target.value)} placeholder="Opzionale" />
            </div>
            <div className="field">
              <label>Unit&agrave;</label>
              <input value={form.unit} readOnly style={{ background: "#F3EBDD", cursor: "default", color: "#6C6B5D" }} />
            </div>
          </div>

          {/* Costo + Contratto */}
          <div className="grid2">
            <div className="field">
              <label>Costo &euro;</label>
              <input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0.00" />
            </div>
            <div className="field">
              <label>Contratto</label>
              <input value={form.contract_power} onChange={(e) => set("contract_power", e.target.value)} placeholder='Es. "3kW monofase"' />
            </div>
          </div>

          {/* Note */}
          <div className="field">
            <label>Note</label>
            <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Note opzionali..." style={{ minHeight: 60 }} />
          </div>

          {/* Collega a spesa */}
          {!editId && (
            <div style={{ background: "#F3EBDD", borderRadius: 10, padding: "12px 14px", marginTop: 2, marginBottom: 4 }}>
              <label style={{
                display: "flex", alignItems: "center", gap: 10,
                fontFamily: "'Albert Sans', sans-serif", fontSize: 14, fontWeight: 600,
                color: "#1F3326", cursor: "pointer",
              }}>
                <input
                  type="checkbox"
                  checked={form.auto_expense}
                  onChange={(e) => { set("auto_expense", e.target.checked); if (e.target.checked) set("link_expense_id", ""); }}
                  style={{ width: 18, height: 18, accentColor: "#2D5A3D" }}
                />
                Collega a spesa
              </label>
              {form.auto_expense && (
                <div className="field" style={{ marginTop: 10, marginBottom: 0 }}>
                  <label>Spesa esistente (lascia vuoto per crearne una nuova)</label>
                  <select value={form.link_expense_id} onChange={(e) => set("link_expense_id", e.target.value)}>
                    <option value="">Crea nuova spesa automaticamente</option>
                    {utenzeExpenses.slice(0, 50).map((ex) => (
                      <option key={ex.id} value={ex.id}>
                        {fmtDate(ex.expense_date)} &mdash; {ex.supplier_name || "N/D"} &mdash; {eur(ex.amount)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ paddingTop: 16, marginTop: 8, borderTop: "1px solid #D8CCB8", display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Annulla</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? "Salvataggio..." : editId ? "Aggiorna" : "Salva bolletta"}
          </button>
        </div>
      </Modal>

      {/* ── Toast ── */}
      <Toast toast={toast} />
    </>
  );
}
