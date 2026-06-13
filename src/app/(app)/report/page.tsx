"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { eur, fmtDate } from "@/lib/format";
import { useRole } from "@/lib/useRole";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type MonthOption = { value: string; label: string };

function getMonthOptions(): MonthOption[] {
  const opts: MonthOption[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    opts.push({
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("it-IT", { month: "long", year: "numeric" }),
    });
  }
  return opts;
}

type ExpenseRow = { amount: number; expense_date: string; category_name: string; supplier_name: string | null; payment_method: string; notes: string | null };
type CashSession = { shift_date: string; shift_type: string | null; opening_amount: number; expected_amount: number | null; actual_amount: number | null; difference: number | null; status: string };
type UtilityBill = { provider: string; utility_type: string; amount: number; period_start: string; period_end: string; due_date: string | null; status: string };
type StockSummary = { name: string; category: string; current_stock: number; min_stock: number; unit: string };

export default function ReportPage() {
  const supabase = createClient();
  const { role, loading: roleLoading } = useRole();
  const monthOptions = getMonthOptions();
  const [month, setMonth] = useState(monthOptions[0].value);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [cashSessions, setCashSessions] = useState<CashSession[]>([]);
  const [utilities, setUtilities] = useState<UtilityBill[]>([]);
  const [stockItems, setStockItems] = useState<StockSummary[]>([]);

  const [totSpese, setTotSpese] = useState(0);
  const [totCassa, setTotCassa] = useState({ entrate: 0, uscite: 0, diff: 0 });
  const [totUtenze, setTotUtenze] = useState(0);

  if (!roleLoading && role === "staff") {
    return (
      <>
        <h1 className="serif" style={{ fontSize: 24, marginBottom: 8 }}>Report Mensile</h1>
        <div className="section"><div className="section-body"><div className="empty">Accesso riservato ad admin e manager.</div></div></div>
      </>
    );
  }

  async function loadReport() {
    setLoading(true);
    const [year, mo] = month.split("-");
    const start = `${year}-${mo}-01`;
    const endDate = new Date(Number(year), Number(mo), 0);
    const end = `${year}-${mo}-${String(endDate.getDate()).padStart(2, "0")}`;

    const [{ data: expData }, { data: cashData }, { data: cashMvData }, { data: utilData }, { data: stockData }] = await Promise.all([
      supabase.from("expenses").select("amount, expense_date, categories(name), supplier_name, payment_method, notes").gte("expense_date", start).lte("expense_date", end).order("expense_date"),
      supabase.from("cash_sessions").select("shift_date, shift_type, opening_amount, expected_amount, actual_amount, difference, status").gte("shift_date", start).lte("shift_date", end).order("shift_date"),
      supabase.from("cash_movements").select("type, amount, session_id, cash_sessions!inner(shift_date)").gte("cash_sessions.shift_date", start).lte("cash_sessions.shift_date", end),
      supabase.from("utility_bills").select("provider, utility_type, amount, period_start, period_end, due_date, status").gte("period_start", start).lte("period_start", end).order("period_start"),
      supabase.from("stock_levels").select("name, category, current_stock, min_stock, unit").eq("active", true).order("name"),
    ]);

    const parsedExp = (expData ?? []).map((e: Record<string, unknown>) => ({
      amount: Number(e.amount),
      expense_date: String(e.expense_date),
      category_name: (e.categories as { name: string } | null)?.name ?? "—",
      supplier_name: e.supplier_name as string | null,
      payment_method: String(e.payment_method ?? ""),
      notes: e.notes as string | null,
    }));
    setExpenses(parsedExp);
    setTotSpese(parsedExp.reduce((s, e) => s + e.amount, 0));

    setCashSessions((cashData ?? []) as CashSession[]);
    const mvs = (cashMvData ?? []) as { type: string; amount: number }[];
    const entrate = mvs.filter(m => m.type === "entrata").reduce((s, m) => s + Number(m.amount), 0);
    const uscite = mvs.filter(m => m.type === "uscita").reduce((s, m) => s + Number(m.amount), 0);
    const diffTot = (cashData ?? []).reduce((s, c: Record<string, unknown>) => s + (Number(c.difference) || 0), 0);
    setTotCassa({ entrate, uscite, diff: diffTot });

    const parsedUtil = (utilData ?? []) as UtilityBill[];
    setUtilities(parsedUtil);
    setTotUtenze(parsedUtil.reduce((s, u) => s + Number(u.amount), 0));

    setStockItems((stockData ?? []) as StockSummary[]);
    setGenerated(true);
    setLoading(false);
  }

  function generatePDF() {
    const doc = new jsPDF("p", "mm", "a4");
    const pageW = doc.internal.pageSize.getWidth();
    const marginX = 16;
    let y = 20;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(31, 51, 38);
    doc.text("LE 4 CAMERE", pageW / 2, y, { align: "center" });
    y += 6;
    doc.setFontSize(9);
    doc.setTextColor(191, 167, 98);
    doc.text("GESTIONALE ALBERGHIERO", pageW / 2, y, { align: "center" });
    y += 4;
    doc.setDrawColor(191, 167, 98);
    doc.setLineWidth(0.5);
    doc.line(marginX, y, pageW - marginX, y);
    y += 8;

    const monthLabel = monthOptions.find(o => o.value === month)?.label ?? month;
    doc.setFontSize(14);
    doc.setTextColor(31, 51, 38);
    doc.text(`Report Mensile — ${monthLabel}`, pageW / 2, y, { align: "center" });
    y += 10;

    // --- Summary KPI ---
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(31, 51, 38);
    doc.text("Riepilogo", marginX, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Spese totali: ${eur(totSpese)}`, marginX, y); y += 5;
    doc.text(`Utenze totali: ${eur(totUtenze)}`, marginX, y); y += 5;
    doc.text(`Cassa — Entrate: ${eur(totCassa.entrate)} | Uscite: ${eur(totCassa.uscite)} | Differenze: ${eur(totCassa.diff)}`, marginX, y); y += 5;
    const lowStockCount = stockItems.filter(s => s.min_stock > 0 && s.current_stock < s.min_stock).length;
    doc.text(`Prodotti sotto scorta: ${lowStockCount}`, marginX, y); y += 10;

    // --- Expenses Table ---
    if (expenses.length > 0) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("Spese", marginX, y);
      y += 2;
      autoTable(doc, {
        startY: y,
        margin: { left: marginX, right: marginX },
        head: [["Data", "Categoria", "Fornitore", "Metodo", "Importo"]],
        body: expenses.map(e => [
          fmtDate(e.expense_date + "T00:00:00"),
          e.category_name,
          e.supplier_name ?? "—",
          e.payment_method || "—",
          eur(e.amount),
        ]),
        foot: [["", "", "", "TOTALE", eur(totSpese)]],
        styles: { fontSize: 8, cellPadding: 2.5 },
        headStyles: { fillColor: [31, 51, 38], textColor: 255, fontStyle: "bold" },
        footStyles: { fillColor: [243, 235, 221], textColor: [31, 51, 38], fontStyle: "bold" },
        alternateRowStyles: { fillColor: [250, 249, 245] },
      });
      y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
    }

    // Category breakdown
    if (expenses.length > 0) {
      const catMap = new Map<string, number>();
      for (const e of expenses) catMap.set(e.category_name, (catMap.get(e.category_name) ?? 0) + e.amount);
      const catRows = [...catMap.entries()].sort((a, b) => b[1] - a[1]);

      if (y > 250) { doc.addPage(); y = 20; }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("Spese per Categoria", marginX, y);
      y += 2;
      autoTable(doc, {
        startY: y,
        margin: { left: marginX, right: marginX },
        head: [["Categoria", "Totale", "% sul totale"]],
        body: catRows.map(([cat, tot]) => [cat, eur(tot), `${((tot / totSpese) * 100).toFixed(1)}%`]),
        styles: { fontSize: 8, cellPadding: 2.5 },
        headStyles: { fillColor: [31, 51, 38], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [250, 249, 245] },
      });
      y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
    }

    // --- Cash Sessions ---
    if (cashSessions.length > 0) {
      if (y > 230) { doc.addPage(); y = 20; }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("Sessioni Cassa", marginX, y);
      y += 2;
      autoTable(doc, {
        startY: y,
        margin: { left: marginX, right: marginX },
        head: [["Data", "Turno", "Apertura", "Atteso", "Effettivo", "Diff."]],
        body: cashSessions.map(c => [
          fmtDate(c.shift_date + "T00:00:00"),
          c.shift_type ?? "—",
          eur(c.opening_amount),
          c.expected_amount != null ? eur(c.expected_amount) : "—",
          c.actual_amount != null ? eur(c.actual_amount) : "—",
          c.difference != null ? eur(c.difference) : "—",
        ]),
        styles: { fontSize: 8, cellPadding: 2.5 },
        headStyles: { fillColor: [31, 51, 38], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [250, 249, 245] },
      });
      y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
    }

    // --- Utilities ---
    if (utilities.length > 0) {
      if (y > 230) { doc.addPage(); y = 20; }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("Utenze", marginX, y);
      y += 2;
      autoTable(doc, {
        startY: y,
        margin: { left: marginX, right: marginX },
        head: [["Fornitore", "Tipo", "Periodo", "Importo", "Stato"]],
        body: utilities.map(u => [
          u.provider,
          u.utility_type,
          `${fmtDate(u.period_start + "T00:00:00")} → ${fmtDate(u.period_end + "T00:00:00")}`,
          eur(u.amount),
          u.status,
        ]),
        foot: [["", "", "TOTALE", eur(totUtenze), ""]],
        styles: { fontSize: 8, cellPadding: 2.5 },
        headStyles: { fillColor: [31, 51, 38], textColor: 255, fontStyle: "bold" },
        footStyles: { fillColor: [243, 235, 221], textColor: [31, 51, 38], fontStyle: "bold" },
        alternateRowStyles: { fillColor: [250, 249, 245] },
      });
      y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
    }

    // --- Low Stock ---
    const lowItems = stockItems.filter(s => s.min_stock > 0 && s.current_stock < s.min_stock);
    if (lowItems.length > 0) {
      if (y > 230) { doc.addPage(); y = 20; }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("Prodotti Sotto Scorta", marginX, y);
      y += 2;
      autoTable(doc, {
        startY: y,
        margin: { left: marginX, right: marginX },
        head: [["Prodotto", "Categoria", "Attuale", "Minimo", "Da ordinare"]],
        body: lowItems.map(s => [s.name, s.category, `${s.current_stock} ${s.unit}`, `${s.min_stock} ${s.unit}`, `${s.min_stock - s.current_stock} ${s.unit}`]),
        styles: { fontSize: 8, cellPadding: 2.5 },
        headStyles: { fillColor: [31, 51, 38], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [250, 249, 245] },
      });
    }

    // Footer on all pages
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(108, 107, 93);
      doc.text(`Le 4 Camere — Report ${monthLabel} — Pagina ${i}/${pages}`, pageW / 2, doc.internal.pageSize.getHeight() - 8, { align: "center" });
    }

    doc.save(`report-${month}.pdf`);
  }

  return (
    <>
      <h1 className="serif" style={{ fontSize: 24, marginBottom: 8 }}>Report Mensile</h1>
      <p className="muted" style={{ marginBottom: 24 }}>Genera un PDF con riepilogo spese, cassa, utenze e magazzino.</p>

      <div className="section">
        <div className="section-body" style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="field" style={{ flex: "1 1 200px", marginBottom: 0 }}>
            <label>Mese</label>
            <select value={month} onChange={e => { setMonth(e.target.value); setGenerated(false); }}>
              {monthOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <button className="btn btn-primary" style={{ padding: "12px 28px" }} onClick={loadReport} disabled={loading}>
            {loading ? "Caricamento..." : "Genera report"}
          </button>
          {generated && (
            <button className="btn btn-ghost" style={{ padding: "12px 28px", fontWeight: 700 }} onClick={generatePDF}>
              Scarica PDF
            </button>
          )}
        </div>
      </div>

      {generated && (
        <>
          {/* KPI Summary */}
          <div className="cards cards-4" style={{ marginTop: 20 }}>
            <div className="card accent">
              <div className="label">Spese totali</div>
              <div className="value tabular">{eur(totSpese)}</div>
              <div className="meta">{expenses.length} movimenti</div>
            </div>
            <div className="card">
              <div className="label">Utenze</div>
              <div className="value tabular">{eur(totUtenze)}</div>
              <div className="meta">{utilities.length} bollette</div>
            </div>
            <div className="card">
              <div className="label">Cassa entrate</div>
              <div className="value tabular" style={{ color: "#2D5A3D" }}>{eur(totCassa.entrate)}</div>
            </div>
            <div className="card">
              <div className="label">Cassa uscite</div>
              <div className="value tabular" style={{ color: "#9E3B2E" }}>{eur(totCassa.uscite)}</div>
            </div>
          </div>

          {/* Expenses by category */}
          {expenses.length > 0 && (() => {
            const catMap = new Map<string, number>();
            for (const e of expenses) catMap.set(e.category_name, (catMap.get(e.category_name) ?? 0) + e.amount);
            const catRows = [...catMap.entries()].sort((a, b) => b[1] - a[1]);
            return (
              <div className="section" style={{ marginTop: 20 }}>
                <div className="section-head"><h2>Spese per Categoria</h2></div>
                <div className="section-body" style={{ padding: 0 }}>
                  <table className="tbl">
                    <thead><tr><th>Categoria</th><th style={{ textAlign: "right" }}>Totale</th><th style={{ textAlign: "right" }}>%</th></tr></thead>
                    <tbody>
                      {catRows.map(([cat, tot]) => (
                        <tr key={cat}>
                          <td style={{ fontWeight: 600 }}>{cat}</td>
                          <td className="tabular" style={{ textAlign: "right" }}>{eur(tot)}</td>
                          <td className="tabular" style={{ textAlign: "right", color: "#6C6B5D" }}>{((tot / totSpese) * 100).toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          {/* Cash sessions summary */}
          {cashSessions.length > 0 && (
            <div className="section" style={{ marginTop: 20 }}>
              <div className="section-head"><h2>Sessioni Cassa</h2><span className="muted">{cashSessions.length} sessioni</span></div>
              <div className="section-body" style={{ padding: 0, overflowX: "auto" }}>
                <table className="tbl">
                  <thead><tr><th>Data</th><th>Turno</th><th style={{ textAlign: "right" }}>Atteso</th><th style={{ textAlign: "right" }}>Effettivo</th><th style={{ textAlign: "right" }}>Diff.</th></tr></thead>
                  <tbody>
                    {cashSessions.map((c, i) => (
                      <tr key={i}>
                        <td>{fmtDate(c.shift_date + "T00:00:00")}</td>
                        <td>{c.shift_type ?? "—"}</td>
                        <td className="tabular" style={{ textAlign: "right" }}>{c.expected_amount != null ? eur(c.expected_amount) : "—"}</td>
                        <td className="tabular" style={{ textAlign: "right" }}>{c.actual_amount != null ? eur(c.actual_amount) : "—"}</td>
                        <td className="tabular" style={{ textAlign: "right", color: c.difference && c.difference !== 0 ? (c.difference > 0 ? "#2D5A3D" : "#9E3B2E") : undefined, fontWeight: c.difference && c.difference !== 0 ? 700 : 400 }}>
                          {c.difference != null ? eur(c.difference) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Utilities */}
          {utilities.length > 0 && (
            <div className="section" style={{ marginTop: 20 }}>
              <div className="section-head"><h2>Utenze</h2></div>
              <div className="section-body" style={{ padding: 0, overflowX: "auto" }}>
                <table className="tbl">
                  <thead><tr><th>Fornitore</th><th>Tipo</th><th>Periodo</th><th style={{ textAlign: "right" }}>Importo</th><th>Stato</th></tr></thead>
                  <tbody>
                    {utilities.map((u, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{u.provider}</td>
                        <td>{u.utility_type}</td>
                        <td className="muted">{fmtDate(u.period_start + "T00:00:00")} → {fmtDate(u.period_end + "T00:00:00")}</td>
                        <td className="tabular" style={{ textAlign: "right" }}>{eur(u.amount)}</td>
                        <td><span className="badge">{u.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
