"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { eur, fmtDate, type Category } from "@/lib/format";
import DatePickerIT from "@/components/ui/DatePickerIT";

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

type Expense = { id: string; supplier_name: string | null; amount: number; expense_date: string; supplier?: string | null };

/* ── Constants ── */

const BILL_TYPES = [
  { value: "Luce", color: "#F5C542", unit: "kWh", icon: "M13 2L3 14h9l-1 8 10-12h-9l1-8z" },
  { value: "Gas", color: "#E07B3A", unit: "Smc", icon: "M12 2c0 4-4 6-4 10a4 4 0 108 0c0-4-4-6-4-10z" },
  { value: "Acqua", color: "#4A9BD9", unit: "m³", icon: "M12 2c-4 6-7 9-7 13a7 7 0 1014 0c0-4-3-7-7-13z" },
  { value: "Immondizia", color: "#5C7363", unit: "kg", icon: "M3 6h18M8 6V4h8v2M5 6v14a2 2 0 002 2h10a2 2 0 002-2V6" },
  { value: "Internet", color: "#7A6A8C", unit: "", icon: "M12 20h.01M8.53 16.11a6 6 0 018.94 0M5.06 12.68a10 10 0 0113.88 0M1.59 9.25a14 14 0 0120.82 0" },
];

const MONTH_LABELS = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
const MONTH_FULL = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

const typeColor = (t: string) => BILL_TYPES.find((b) => b.value === t)?.color ?? "var(--ink-soft)";
const typeIcon = (t: string) => BILL_TYPES.find((b) => b.value === t)?.icon ?? "";
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
  const [bills, setBills] = useState<Bill[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  /* Filters */
  const [filterType, setFilterType] = useState("");
  const [filterSupplier, setFilterSupplier] = useState("");
  const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()));

  /* Chart year */
  const [chartYear, setChartYear] = useState(String(new Date().getFullYear()));

  /* Modal */
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [file, setFile] = useState<File | null>(null);

  /* Toast */
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "warn" | "error" } | null>(null);

  function showToast(msg: string, type: "ok" | "warn" | "error" = "ok") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  const set = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  /* ── Data loading ── */

  async function load() {
    const [{ data: b }, { data: c }, { data: e }] = await Promise.all([
      supabase.from("utility_bills").select("*").order("period_end", { ascending: false }),
      supabase.from("categories").select("*").order("sort"),
      supabase.from("expenses").select("id, supplier_name, amount, expense_date").order("expense_date", { ascending: false }),
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
    return utCat ? expenses.filter(() => true) : expenses;
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

  /* ── Actions ── */

  function openNew() {
    setForm({ ...emptyForm });
    setEditId(null);
    setFile(null);
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
          const noteText = `Bolletta ${form.utility_type} — periodo ${fmtDate(form.period_start)} - ${fmtDate(form.period_end)}${consumoNote}`;
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
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }

  function exportCSV() {
    if (!filtered.length) return showToast("Nessuna bolletta da esportare", "warn");
    const head = ["Data", "Tipo", "Fornitore", "Periodo", "Consumo", "Unità", "Costo", "Contratto", "Note"];
    const rows = filtered.map((b) => [
      fmtDate(b.period_end),
      b.utility_type,
      b.supplier,
      `${fmtDate(b.period_start)} - ${fmtDate(b.period_end)}`,
      b.consumption != null ? String(b.consumption).replace(".", ",") : "",
      b.unit || "",
      String(b.amount).replace(".", ","),
      b.contract_power || "",
      (b.notes || "").replace(/\n/g, " "),
    ]);
    const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `utenze-le4camere-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  /* ── Render ── */

  return (
    <>
      <style>{`
        .wrap:has(.ut-header){max-width:none;padding-left:24px;padding-right:24px}
        .ut-header{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;margin-bottom:28px}
        .ut-header h1{margin:0;font-size:clamp(1.6rem,3vw,2.2rem);color:var(--ink)}
        .ut-header .actions{display:flex;gap:10px;flex-wrap:wrap}
        .ut-kpi-row{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:28px}
        .ut-kpi{background:var(--surface);border-radius:var(--radius);box-shadow:var(--shadow);padding:14px 14px;border-top:3px solid var(--ink)}
        .ut-kpi .kpi-label{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--ink-soft);font-weight:600;margin-bottom:6px}
        .ut-kpi .kpi-value{font-size:1.15rem;font-weight:700;color:var(--ink);font-variant-numeric:tabular-nums}
        .ut-chart-section{background:var(--surface);border-radius:var(--radius);box-shadow:var(--shadow);padding:24px;margin-bottom:28px}
        .ut-chart-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px}
        .ut-chart-head h3{margin:0;font-size:1.1rem;color:var(--ink)}
        .ut-chart{display:flex;align-items:flex-end;gap:8px;height:180px;padding-bottom:0}
        .ut-chart-col{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:0}
        .ut-chart-bars{display:flex;flex-direction:column-reverse;width:100%;gap:1px;height:150px;justify-content:flex-start}
        .ut-chart-bar{width:100%;border-radius:3px 3px 0 0;min-height:0;transition:height .3s ease}
        .ut-chart-lbl{font-size:11px;color:var(--ink-soft);font-weight:600;white-space:nowrap}
        .ut-chart-amt{font-size:10px;color:var(--ink-soft);font-variant-numeric:tabular-nums;white-space:nowrap}
        .ut-legend{display:flex;gap:16px;flex-wrap:wrap;margin-top:14px}
        .ut-legend-item{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--ink-soft);font-weight:600}
        .ut-legend-dot{width:10px;height:10px;border-radius:3px}
        .ut-yoy td,.ut-yoy th{padding:10px 14px;font-size:13px}
        .ut-yoy .positive{color:#9E3B2E;font-weight:600}
        .ut-yoy .negative{color:#2D5A3D;font-weight:600}
        .ut-yoy .zero{color:var(--ink-soft)}
        .ut-type-badge{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:600}
        .ut-file-link{color:var(--accent);font-size:12px;font-weight:600;cursor:pointer;text-decoration:underline;background:none;border:none;padding:0}
        @media(max-width:1100px){.ut-kpi-row{grid-template-columns:repeat(3,1fr)}}
        @media(max-width:600px){.ut-kpi-row{grid-template-columns:repeat(2,1fr)}.ut-chart{height:140px}.ut-chart-bars{height:110px}}
      `}</style>

      {/* ── Header ── */}
      <div className="ut-header">
        <h1 className="serif">Utenze &amp; Costi Fissi</h1>
        <div className="actions">
          <button className="btn btn-primary" style={{ padding: "10px 20px", fontSize: 14 }} onClick={openNew}>+ Nuova bolletta</button>
          <button className="btn btn-ghost" style={{ padding: "10px 20px", fontSize: 14, fontWeight: 600 }} onClick={exportCSV}>Esporta CSV</button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="ut-kpi-row">
        {BILL_TYPES.map((bt) => (
          <div key={bt.value} className="ut-kpi" style={{ borderTopColor: bt.color }}>
            <div className="kpi-label">
              <BillIcon type={bt.value} size={16} />
              {bt.value} {kpiYear}
            </div>
            <div className="kpi-value">{eur(kpiByType[bt.value] || 0)}</div>
          </div>
        ))}
        <div className="ut-kpi" style={{ borderTopColor: "var(--ink)" }}>
          <div className="kpi-label">
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6" />
            </svg>
            Totale {kpiYear}
          </div>
          <div className="kpi-value">{eur(kpiTotal)}</div>
        </div>
      </div>

      {/* ── Monthly Chart ── */}
      <div className="ut-chart-section">
        <div className="ut-chart-head">
          <h3 className="serif">Andamento mensile</h3>
          <select value={chartYear} onChange={(e) => setChartYear(e.target.value)} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13, background: "var(--surface)" }}>
            {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="ut-chart">
          {chartData.map((m) => (
            <div key={m.month} className="ut-chart-col">
              <div className="ut-chart-bars">
                {BILL_TYPES.map((bt) => {
                  const h = chartMax > 0 ? (m.byType[bt.value] / chartMax) * 150 : 0;
                  return h > 0 ? <div key={bt.value} className="ut-chart-bar" style={{ height: h, background: bt.color }} title={`${bt.value}: ${eur(m.byType[bt.value])}`} /> : null;
                })}
              </div>
              <div className="ut-chart-lbl">{MONTH_LABELS[m.month]}</div>
              <div className="ut-chart-amt">{m.total > 0 ? eur(m.total) : ""}</div>
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

      {/* ── Bills Table ── */}
      <div className="section">
        <div className="section-head">
          <h2>Registro bollette &middot; {eur(filtered.reduce((s, b) => s + b.amount, 0))}</h2>
          <div className="filters">
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="">Tutti i tipi</option>
              {BILL_TYPES.map((bt) => <option key={bt.value} value={bt.value}>{bt.value}</option>)}
            </select>
            <input type="search" placeholder="Cerca fornitore..." value={filterSupplier} onChange={(e) => setFilterSupplier(e.target.value)} />
            <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)}>
              {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
        <div className="section-body" style={{ padding: 0 }}>
          {loading ? (
            <div className="empty">Caricamento...</div>
          ) : filtered.length === 0 ? (
            <div className="empty">
              <div className="serif">Nessuna bolletta registrata</div>
              <div>Premi &quot;+ Nuova bolletta&quot; per iniziare.</div>
            </div>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Tipo</th>
                  <th>Fornitore</th>
                  <th className="hide-sm">Periodo</th>
                  <th className="hide-sm">Consumo</th>
                  <th style={{ textAlign: "right" }}>Costo</th>
                  <th className="hide-sm">File</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => (
                  <tr key={b.id}>
                    <td>{fmtDate(b.period_end)}</td>
                    <td>
                      <span className="ut-type-badge" style={{ background: typeColor(b.utility_type) + "22", color: typeColor(b.utility_type) }}>
                        <BillIcon type={b.utility_type} size={14} />
                        {b.utility_type}
                      </span>
                    </td>
                    <td>
                      <strong>{b.supplier}</strong>
                      {b.contract_power && <div className="muted" style={{ fontSize: 11 }}>{b.contract_power}</div>}
                    </td>
                    <td className="hide-sm">{fmtDate(b.period_start)} &mdash; {fmtDate(b.period_end)}</td>
                    <td className="hide-sm">{b.consumption != null ? `${b.consumption} ${b.unit || ""}` : "—"}</td>
                    <td className="amt-cell tabular" style={{ textAlign: "right" }}>{eur(b.amount)}</td>
                    <td className="hide-sm">
                      {b.file_path
                        ? <button className="ut-file-link" onClick={() => openDoc(b.file_path!)}>Scarica</button>
                        : <span className="muted">—</span>}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <button className="btn-ghost" style={{ padding: "5px 8px", borderRadius: 8, fontSize: 12 }} onClick={() => openEdit(b)}>Modifica</button>
                        <button className="btn-ghost" style={{ padding: "5px 8px", borderRadius: 8, fontSize: 12 }} onClick={() => del(b.id)}>Elimina</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Year-over-Year Comparison ── */}
      <div className="section" style={{ marginTop: 24 }}>
        <div className="section-head">
          <h2>Confronto anno su anno</h2>
          <span className="muted" style={{ fontSize: 13 }}>{yoyYear} vs {yoyYear - 1}</span>
        </div>
        <div className="section-body" style={{ padding: 0 }}>
          <table className="tbl ut-yoy">
            <thead>
              <tr>
                <th>Mese</th>
                <th style={{ textAlign: "right" }}>{yoyYear}</th>
                <th style={{ textAlign: "right" }}>{yoyYear - 1}</th>
                <th style={{ textAlign: "right" }}>Diff. &euro;</th>
                <th style={{ textAlign: "right" }}>Diff. %</th>
              </tr>
            </thead>
            <tbody>
              {yoyData.map((r) => {
                const cls = r.diff > 0 ? "positive" : r.diff < 0 ? "negative" : "zero";
                return (
                  <tr key={r.month}>
                    <td><strong>{MONTH_FULL[r.month]}</strong></td>
                    <td className="tabular" style={{ textAlign: "right" }}>{r.currAmt > 0 ? eur(r.currAmt) : "—"}</td>
                    <td className="tabular" style={{ textAlign: "right" }}>{r.prevAmt > 0 ? eur(r.prevAmt) : "—"}</td>
                    <td className={`tabular ${cls}`} style={{ textAlign: "right" }}>
                      {r.currAmt === 0 && r.prevAmt === 0 ? "—" : `${r.diff > 0 ? "+" : ""}${eur(r.diff)}`}
                    </td>
                    <td className={`tabular ${cls}`} style={{ textAlign: "right" }}>
                      {r.pct != null ? `${r.pct > 0 ? "+" : ""}${r.pct.toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── New / Edit Modal ── */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600, display: "flex", flexDirection: "column" }}>
            <div className="section-head" style={{ padding: "20px 24px", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
              <h2>{editId ? "Modifica bolletta" : "Nuova bolletta"}</h2>
              <button className="btn-ghost" style={{ padding: "6px 10px", borderRadius: 8, fontSize: 18, lineHeight: 1 }} onClick={() => setShowModal(false)}>&times;</button>
            </div>
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 0, overflowY: "auto", flex: 1, minHeight: 0 }}>
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
              <div className="field">
                <label>Periodo da</label>
                <DatePickerIT value={form.period_start} onChange={v => set("period_start", v)} />
              </div>
              <div className="field">
                <label>Periodo a</label>
                <DatePickerIT value={form.period_end} onChange={v => set("period_end", v)} />
              </div>
              <div className="grid2">
                <div className="field">
                  <label>Consumo</label>
                  <input type="number" step="0.01" min="0" value={form.consumption} onChange={(e) => set("consumption", e.target.value)} placeholder="Opzionale" />
                </div>
                <div className="field">
                  <label>Unit&agrave;</label>
                  <input value={form.unit} readOnly style={{ background: "var(--surface-2)", cursor: "default" }} />
                </div>
              </div>
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
              <div className="field">
                <label>Note</label>
                <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Note opzionali..." style={{ minHeight: 50 }} />
              </div>
              <div className="field">
                <label>Upload bolletta</label>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </div>
              {!editId && (
                <>
                  <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, fontWeight: 600, cursor: "pointer", marginBottom: 12, marginTop: 4 }}>
                    <input
                      type="checkbox"
                      checked={form.auto_expense}
                      onChange={(e) => { set("auto_expense", e.target.checked); if (e.target.checked) set("link_expense_id", ""); }}
                      style={{ width: 20, height: 20, accentColor: "var(--ok)" }}
                    />
                    Collega a spesa
                  </label>
                  {form.auto_expense && (
                    <div className="field" style={{ marginBottom: 8 }}>
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
                </>
              )}
            </div>
            <div style={{ padding: "16px 24px", borderTop: "1px solid var(--line)", display: "flex", gap: 10, justifyContent: "flex-end", flexShrink: 0 }}>
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Annulla</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? "Salvataggio..." : editId ? "Aggiorna" : "Salva bolletta"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: toast.type === "ok" ? "#2D5A3D" : toast.type === "warn" ? "#B68A3E" : "#9E3B2E",
          color: "#FAF9F5", padding: "12px 24px", borderRadius: 10, fontSize: 14, fontWeight: 600,
          zIndex: 200, boxShadow: "0 4px 20px rgba(0,0,0,.25)",
        }}>
          {toast.msg}
        </div>
      )}
    </>
  );
}
