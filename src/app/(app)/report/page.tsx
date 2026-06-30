"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { eur, fmtDate } from "@/lib/format";
import { useRole } from "@/lib/useRole";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

function getCursorY(doc: jsPDF, fallback = 20): number {
  return (doc as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? fallback;
}

/* ── Types ── */
type ExpenseRow = { amount: number; expense_date: string; category_name: string; supplier_name: string | null; payment_method: string; notes: string | null };
type CashSession = { shift_date: string; shift_type: string | null; opening_amount: number; expected_amount: number | null; actual_amount: number | null; difference: number | null; status: string };
type CashMovement = { type: string; amount: number };
type UtilityBill = { provider: string; utility_type: string; amount: number; period_start: string; period_end: string; due_date: string | null; status: string };
type StockItem = { name: string; category: string; current_stock: number; min_stock: number; unit: string };
type BarOrder = { total: number; is_complimentary: boolean; original_total: number | null };
type ShiftType = { id: string; name: string; start_time: string; end_time: string };
type Shift = { shift_date: string; shift_type_id: string; staff_id: string | null };
type StaffMember = { id: string; name: string; type: "dipendente" | "a_chiamata" };

/* ── Helpers ── */
function calcHours(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff <= 0) diff += 24 * 60;
  return diff / 60;
}

function getMonthRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(year, month, 0);
  const end = `${year}-${String(month).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;
  return { start, end };
}

function getMonthLabel(year: number, month: number) {
  const d = new Date(year, month - 1, 1);
  const raw = d.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function pdfHeader(doc: jsPDF, monthLabel: string, reportTitle: string): number {
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
  doc.setFontSize(14);
  doc.setTextColor(31, 51, 38);
  doc.text(`${reportTitle} — ${monthLabel}`, pageW / 2, y, { align: "center" });
  y += 10;
  return y;
}

function pdfFooter(doc: jsPDF, monthLabel: string) {
  const pageW = doc.internal.pageSize.getWidth();
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(108, 107, 93);
    doc.text(`Le 4 Camere — ${monthLabel} — Pagina ${i}/${pages}`, pageW / 2, doc.internal.pageSize.getHeight() - 8, { align: "center" });
  }
}

/* ── SVG Icons ── */
const icons = {
  spese: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1F3326" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <circle cx="12" cy="15" r="3" stroke="#9E3B2E" strokeWidth="1.5" fill="none" />
      <text x="12" y="17.5" textAnchor="middle" fill="#9E3B2E" stroke="none" fontSize="6" fontWeight="700">&euro;</text>
    </svg>
  ),
  cassa: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1F3326" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="10" width="20" height="10" rx="2" />
      <path d="M5 10V7a2 2 0 012-2h10a2 2 0 012 2v3" />
      <rect x="8" y="13" width="8" height="4" rx="1" stroke="#2D5A3D" strokeWidth="1.5" />
    </svg>
  ),
  magazzino: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1F3326" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  ),
  personale: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1F3326" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="7" r="3.5" />
      <path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" />
      <circle cx="16" cy="4.5" r="2.5" stroke="#7B5EA7" strokeWidth="1.5" />
      <path d="M21 21v-2a4 4 0 00-2-3.47" stroke="#7B5EA7" strokeWidth="1.5" />
    </svg>
  ),
  bar: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1F3326" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2l1 1h6l1-1" stroke="#BFA762" strokeWidth="1.5" />
      <path d="M7 3h10l-1.5 13a2 2 0 01-2 1.8h-3a2 2 0 01-2-1.8L7 3z" />
      <path d="M12 17v3M9 20h6" />
      <circle cx="15" cy="7" r="1.2" fill="#BFA762" stroke="none" />
    </svg>
  ),
  utenze: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1F3326" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill="none" />
    </svg>
  ),
};

const BORDER_COLORS: Record<string, string> = {
  spese: "#9E3B2E",
  cassa: "#2D5A3D",
  magazzino: "#4F7B8C",
  personale: "#7B5EA7",
  bar: "#BFA762",
  utenze: "#C77B4A",
};

/* ── Report card config ── */
const REPORT_CARDS = [
  { key: "spese", title: "Report Spese", desc: "Tutte le spese del mese, suddivise per categoria e fornitore" },
  { key: "cassa", title: "Report Cassa", desc: "Movimenti contanti, incassi bar, chiusure cassa" },
  { key: "magazzino", title: "Report Magazzino", desc: "Stato stock, movimenti in/out, valore magazzino" },
  { key: "personale", title: "Report Personale", desc: "Ore lavorate, assenze, costi personale a chiamata" },
  { key: "bar", title: "Report Bar", desc: "Vendite POS Bar, prodotti venduti, omaggi" },
  { key: "utenze", title: "Report Utenze", desc: "Bollette e costi fissi del mese" },
] as const;

type ReportKey = typeof REPORT_CARDS[number]["key"];

type KpiData = {
  spese: { total: number; count: number };
  cassa: { entrate: number; uscite: number };
  magazzino: { stockValue: number; lowStock: number };
  personale: { totalHours: number; onCallCost: number };
  bar: { revenue: number; orders: number };
  utenze: { total: number };
};

export default function ReportPage() {
  const supabase = createClient();
  const router = useRouter();
  const { isAdmin, loading: roleLoading } = useRole();

  const now = new Date();
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1);
  const [selYear, setSelYear] = useState(now.getFullYear());
  const [loadingKpi, setLoadingKpi] = useState(false);
  const [kpi, setKpi] = useState<KpiData | null>(null);
  const [pdfLoading, setPdfLoading] = useState<ReportKey | "full" | null>(null);

  // Raw data for PDF generation
  const [rawExpenses, setRawExpenses] = useState<ExpenseRow[]>([]);
  const [rawCashSessions, setRawCashSessions] = useState<CashSession[]>([]);
  const [rawCashMovements, setRawCashMovements] = useState<CashMovement[]>([]);
  const [rawUtilities, setRawUtilities] = useState<UtilityBill[]>([]);
  const [rawStock, setRawStock] = useState<StockItem[]>([]);
  const [rawBarOrders, setRawBarOrders] = useState<BarOrder[]>([]);
  const [rawShifts, setRawShifts] = useState<Shift[]>([]);
  const [rawShiftTypes, setRawShiftTypes] = useState<ShiftType[]>([]);
  const [rawStaff, setRawStaff] = useState<StaffMember[]>([]);
  const [hourlyRate, setHourlyRate] = useState(8);

  useEffect(() => {
    if (!roleLoading && !isAdmin) router.replace("/");
  }, [roleLoading, isAdmin, router]);

  const loadData = useCallback(async () => {
    setLoadingKpi(true);
    setKpi(null);
    const { start, end } = getMonthRange(selYear, selMonth);

    const [
      { data: expData },
      { data: cashData },
      { data: cashMvData },
      { data: utilData },
      { data: stockData },
      { data: barData },
      { data: shiftsData },
      { data: shiftTypesData },
      { data: staffData },
      { data: settingsData },
    ] = await Promise.all([
      supabase.from("expenses").select("amount, expense_date, categories(name), supplier_name, payment_method, notes").gte("expense_date", start).lte("expense_date", end).order("expense_date"),
      supabase.from("cash_sessions").select("shift_date, shift_type, opening_amount, expected_amount, actual_amount, difference, status").gte("shift_date", start).lte("shift_date", end).order("shift_date"),
      supabase.from("cash_movements").select("type, amount, session_id, cash_sessions!inner(shift_date)").gte("cash_sessions.shift_date", start).lte("cash_sessions.shift_date", end),
      supabase.from("utility_bills").select("provider, utility_type, amount, period_start, period_end, due_date, status").gte("period_start", start).lte("period_start", end).order("period_start"),
      supabase.from("stock_levels").select("name, category, current_stock, min_stock, unit").eq("active", true).order("name"),
      supabase.from("bar_orders").select("total, is_complimentary, original_total, created_at").eq("status", "pagato").gte("created_at", `${start}T00:00:00`).lte("created_at", `${end}T23:59:59`),
      supabase.from("shifts").select("shift_date, shift_type_id, staff_id").gte("shift_date", start).lte("shift_date", end),
      supabase.from("shift_types").select("id, name, start_time, end_time").order("sort"),
      supabase.from("staff").select("id, name, type").eq("active", true),
      supabase.from("settings").select("key, value"),
    ]);

    // Parse expenses
    const parsedExp = (expData ?? []).map((e: Record<string, unknown>) => ({
      amount: Number(e.amount),
      expense_date: String(e.expense_date),
      category_name: (e.categories as { name: string } | null)?.name ?? "---",
      supplier_name: e.supplier_name as string | null,
      payment_method: String(e.payment_method ?? ""),
      notes: e.notes as string | null,
    }));
    setRawExpenses(parsedExp);
    const totSpese = parsedExp.reduce((s, e) => s + e.amount, 0);

    // Parse cash
    const sessions = (cashData ?? []) as CashSession[];
    setRawCashSessions(sessions);
    const mvs = (cashMvData ?? []) as CashMovement[];
    setRawCashMovements(mvs);
    const entrate = mvs.filter(m => m.type === "entrata").reduce((s, m) => s + Number(m.amount), 0);
    const uscite = mvs.filter(m => m.type === "uscita").reduce((s, m) => s + Number(m.amount), 0);

    // Parse utilities
    const parsedUtil = (utilData ?? []) as UtilityBill[];
    setRawUtilities(parsedUtil);
    const totUtenze = parsedUtil.reduce((s, u) => s + Number(u.amount), 0);

    // Parse stock
    const stockItems = (stockData ?? []) as StockItem[];
    setRawStock(stockItems);
    const lowStock = stockItems.filter(s => s.min_stock > 0 && s.current_stock < s.min_stock).length;

    // Parse bar
    const barOrders = (barData ?? []) as BarOrder[];
    setRawBarOrders(barOrders);
    const barRevenue = barOrders.filter(o => !o.is_complimentary).reduce((s, o) => s + Number(o.total), 0);
    const barOrderCount = barOrders.filter(o => !o.is_complimentary).length;

    // Parse staff/shifts
    const shifts = (shiftsData ?? []) as Shift[];
    setRawShifts(shifts);
    const types = (shiftTypesData ?? []) as ShiftType[];
    setRawShiftTypes(types);
    const staff = (staffData ?? []) as StaffMember[];
    setRawStaff(staff);

    const settingsMap: Record<string, string> = {};
    for (const r of (settingsData ?? []) as { key: string; value: string }[]) settingsMap[r.key] = r.value;
    const rate = Number(settingsMap["default_hourly_rate"]) || 8;
    setHourlyRate(rate);

    const stMap = new Map(types.map(t => [t.id, t]));
    const staffHours: Record<string, number> = {};
    for (const s of shifts) {
      if (!s.staff_id) continue;
      const st = stMap.get(s.shift_type_id);
      if (!st) continue;
      staffHours[s.staff_id] = (staffHours[s.staff_id] ?? 0) + calcHours(st.start_time, st.end_time);
    }
    const totalHours = Object.values(staffHours).reduce((s, h) => s + h, 0);
    const onCallCost = staff
      .filter(s => s.type === "a_chiamata")
      .reduce((sum, s) => sum + (staffHours[s.id] ?? 0) * rate, 0);

    setKpi({
      spese: { total: totSpese, count: parsedExp.length },
      cassa: { entrate, uscite },
      magazzino: { stockValue: stockItems.reduce((s, i) => s + i.current_stock, 0), lowStock },
      personale: { totalHours, onCallCost },
      bar: { revenue: barRevenue, orders: barOrderCount },
      utenze: { total: totUtenze },
    });
    setLoadingKpi(false);
  }, [selYear, selMonth, supabase]);

  useEffect(() => { loadData(); }, [loadData]);

  /* ── PDF Generators ── */
  const monthLabel = getMonthLabel(selYear, selMonth);
  const marginX = 16;

  function genSpesePdf(doc: jsPDF, startY?: number) {
    let y = startY ?? pdfHeader(doc, monthLabel, "Report Spese");
    if (rawExpenses.length === 0) {
      doc.setFontSize(10); doc.setTextColor(108, 107, 93);
      doc.text("Nessuna spesa registrata nel periodo.", marginX, y);
      return;
    }
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(31, 51, 38);
    doc.text(`Totale: ${eur(kpi?.spese.total ?? 0)} | ${rawExpenses.length} registrazioni`, marginX, y);
    y += 6;
    autoTable(doc, {
      startY: y, margin: { left: marginX, right: marginX },
      head: [["Data", "Categoria", "Fornitore", "Metodo", "Importo"]],
      body: rawExpenses.map(e => [fmtDate(e.expense_date + "T00:00:00"), e.category_name, e.supplier_name ?? "---", e.payment_method || "---", eur(e.amount)]),
      foot: [["", "", "", "TOTALE", eur(kpi?.spese.total ?? 0)]],
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: [31, 51, 38], textColor: 255, fontStyle: "bold" },
      footStyles: { fillColor: [243, 235, 221], textColor: [31, 51, 38], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [250, 249, 245] },
    });
    y = getCursorY(doc) + 8;
    // Category breakdown
    const catMap = new Map<string, number>();
    for (const e of rawExpenses) catMap.set(e.category_name, (catMap.get(e.category_name) ?? 0) + e.amount);
    const catRows = [...catMap.entries()].sort((a, b) => b[1] - a[1]);
    const tot = kpi?.spese.total || 1;
    if (y > 250) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(31, 51, 38);
    doc.text("Spese per Categoria", marginX, y); y += 2;
    autoTable(doc, {
      startY: y, margin: { left: marginX, right: marginX },
      head: [["Categoria", "Totale", "% sul totale"]],
      body: catRows.map(([cat, val]) => [cat, eur(val), `${((val / tot) * 100).toFixed(1)}%`]),
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: [31, 51, 38], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [250, 249, 245] },
    });
  }

  function genCassaPdf(doc: jsPDF, startY?: number) {
    let y = startY ?? pdfHeader(doc, monthLabel, "Report Cassa");
    if (rawCashSessions.length === 0) {
      doc.setFontSize(10); doc.setTextColor(108, 107, 93);
      doc.text("Nessuna sessione cassa nel periodo.", marginX, y); return;
    }
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(31, 51, 38);
    doc.text(`Entrate: ${eur(kpi?.cassa.entrate ?? 0)} | Uscite: ${eur(kpi?.cassa.uscite ?? 0)}`, marginX, y); y += 6;
    autoTable(doc, {
      startY: y, margin: { left: marginX, right: marginX },
      head: [["Data", "Turno", "Apertura", "Atteso", "Effettivo", "Diff."]],
      body: rawCashSessions.map(c => [
        fmtDate(c.shift_date + "T00:00:00"), c.shift_type ?? "---", eur(c.opening_amount),
        c.expected_amount != null ? eur(c.expected_amount) : "---",
        c.actual_amount != null ? eur(c.actual_amount) : "---",
        c.difference != null ? eur(c.difference) : "---",
      ]),
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: [31, 51, 38], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [250, 249, 245] },
    });
  }

  function genMagazzinoPdf(doc: jsPDF, startY?: number) {
    let y = startY ?? pdfHeader(doc, monthLabel, "Report Magazzino");
    const lowItems = rawStock.filter(s => s.min_stock > 0 && s.current_stock < s.min_stock);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(31, 51, 38);
    doc.text(`Prodotti attivi: ${rawStock.length} | Sotto scorta: ${lowItems.length}`, marginX, y); y += 6;
    if (rawStock.length === 0) return;
    autoTable(doc, {
      startY: y, margin: { left: marginX, right: marginX },
      head: [["Prodotto", "Categoria", "Stock", "Min", "Unita", "Stato"]],
      body: rawStock.map(s => [s.name, s.category, String(s.current_stock), String(s.min_stock), s.unit, s.min_stock > 0 && s.current_stock < s.min_stock ? "SOTTO SCORTA" : "OK"]),
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: [31, 51, 38], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [250, 249, 245] },
      didParseCell(data) {
        if (data.column.index === 5 && data.section === "body") {
          const val = data.cell.raw as string;
          if (val === "SOTTO SCORTA") { data.cell.styles.textColor = [158, 59, 46]; data.cell.styles.fontStyle = "bold"; }
        }
      },
    });
  }

  function genPersonalePdf(doc: jsPDF, startY?: number) {
    let y = startY ?? pdfHeader(doc, monthLabel, "Report Personale");
    const stMap = new Map(rawShiftTypes.map(t => [t.id, t]));
    const staffHours: Record<string, number> = {};
    for (const s of rawShifts) {
      if (!s.staff_id) continue;
      const st = stMap.get(s.shift_type_id);
      if (!st) continue;
      staffHours[s.staff_id] = (staffHours[s.staff_id] ?? 0) + calcHours(st.start_time, st.end_time);
    }
    const rows = rawStaff
      .map(s => ({ name: s.name, type: s.type, hours: staffHours[s.id] ?? 0, cost: s.type === "a_chiamata" ? (staffHours[s.id] ?? 0) * hourlyRate : null }))
      .filter(s => s.hours > 0)
      .sort((a, b) => b.hours - a.hours);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(31, 51, 38);
    doc.text(`Ore totali: ${(kpi?.personale.totalHours ?? 0).toFixed(1)}h | Costo a chiamata: ${eur(kpi?.personale.onCallCost ?? 0)}`, marginX, y); y += 6;
    if (rows.length === 0) { doc.setFontSize(10); doc.text("Nessun turno registrato.", marginX, y); return; }
    autoTable(doc, {
      startY: y, margin: { left: marginX, right: marginX },
      head: [["Nome", "Tipo", "Ore", "Costo"]],
      body: rows.map(r => [r.name, r.type === "a_chiamata" ? "A chiamata" : "Dipendente", `${r.hours.toFixed(1)}h`, r.cost != null ? eur(r.cost) : "---"]),
      foot: [["", "TOTALE", `${rows.reduce((s, r) => s + r.hours, 0).toFixed(1)}h`, eur(rows.reduce((s, r) => s + (r.cost ?? 0), 0))]],
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: [31, 51, 38], textColor: 255, fontStyle: "bold" },
      footStyles: { fillColor: [243, 235, 221], textColor: [31, 51, 38], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [250, 249, 245] },
    });
  }

  function genBarPdf(doc: jsPDF, startY?: number) {
    let y = startY ?? pdfHeader(doc, monthLabel, "Report Bar");
    const paid = rawBarOrders.filter(o => !o.is_complimentary);
    const compl = rawBarOrders.filter(o => o.is_complimentary);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(31, 51, 38);
    doc.text(`Ricavi: ${eur(kpi?.bar.revenue ?? 0)} | ${paid.length} ordini | ${compl.length} omaggi`, marginX, y); y += 6;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(108, 107, 93);
    if (compl.length > 0) {
      const complValue = compl.reduce((s, o) => s + Number(o.original_total ?? o.total), 0);
      doc.text(`Valore omaggi: ${eur(complValue)}`, marginX, y); y += 8;
    }
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(31, 51, 38);
    doc.text("Riepilogo vendite POS Bar per il periodo selezionato.", marginX, y);
  }

  function genUtenzePdf(doc: jsPDF, startY?: number) {
    let y = startY ?? pdfHeader(doc, monthLabel, "Report Utenze");
    if (rawUtilities.length === 0) {
      doc.setFontSize(10); doc.setTextColor(108, 107, 93);
      doc.text("Nessuna bolletta nel periodo.", marginX, y); return;
    }
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(31, 51, 38);
    doc.text(`Totale utenze: ${eur(kpi?.utenze.total ?? 0)}`, marginX, y); y += 6;
    autoTable(doc, {
      startY: y, margin: { left: marginX, right: marginX },
      head: [["Fornitore", "Tipo", "Periodo", "Importo", "Stato"]],
      body: rawUtilities.map(u => [u.provider, u.utility_type, `${fmtDate(u.period_start + "T00:00:00")} - ${fmtDate(u.period_end + "T00:00:00")}`, eur(u.amount), u.status]),
      foot: [["", "", "TOTALE", eur(kpi?.utenze.total ?? 0), ""]],
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: [31, 51, 38], textColor: 255, fontStyle: "bold" },
      footStyles: { fillColor: [243, 235, 221], textColor: [31, 51, 38], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [250, 249, 245] },
    });
  }

  const genMap: Record<ReportKey, (doc: jsPDF, y?: number) => void> = {
    spese: genSpesePdf,
    cassa: genCassaPdf,
    magazzino: genMagazzinoPdf,
    personale: genPersonalePdf,
    bar: genBarPdf,
    utenze: genUtenzePdf,
  };

  async function downloadSinglePdf(key: ReportKey) {
    setPdfLoading(key);
    await new Promise(r => setTimeout(r, 50)); // let UI update
    const doc = new jsPDF("p", "mm", "a4");
    genMap[key](doc);
    pdfFooter(doc, monthLabel);
    doc.save(`report-${key}-${selYear}-${String(selMonth).padStart(2, "0")}.pdf`);
    setPdfLoading(null);
  }

  async function downloadFullPdf() {
    setPdfLoading("full");
    await new Promise(r => setTimeout(r, 50));
    const doc = new jsPDF("p", "mm", "a4");
    let y = pdfHeader(doc, monthLabel, "Report Completo");

    // Summary
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(31, 51, 38);
    doc.text("Riepilogo", marginX, y); y += 5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    if (kpi) {
      doc.text(`Spese totali: ${eur(kpi.spese.total)} (${kpi.spese.count} registrazioni)`, marginX, y); y += 4;
      doc.text(`Cassa — Entrate: ${eur(kpi.cassa.entrate)} | Uscite: ${eur(kpi.cassa.uscite)}`, marginX, y); y += 4;
      doc.text(`Ricavi Bar: ${eur(kpi.bar.revenue)} (${kpi.bar.orders} ordini)`, marginX, y); y += 4;
      doc.text(`Personale: ${kpi.personale.totalHours.toFixed(1)}h | Costo a chiamata: ${eur(kpi.personale.onCallCost)}`, marginX, y); y += 4;
      doc.text(`Utenze: ${eur(kpi.utenze.total)}`, marginX, y); y += 4;
      doc.text(`Prodotti sotto scorta: ${kpi.magazzino.lowStock}`, marginX, y); y += 8;
    }

    // Each section
    const sections: { title: string; key: ReportKey }[] = [
      { title: "Spese", key: "spese" },
      { title: "Cassa", key: "cassa" },
      { title: "Utenze", key: "utenze" },
      { title: "Personale", key: "personale" },
      { title: "Bar", key: "bar" },
      { title: "Magazzino", key: "magazzino" },
    ];
    for (const sec of sections) {
      doc.addPage();
      y = 20;
      doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(31, 51, 38);
      doc.text(sec.title, marginX, y); y += 8;
      genMap[sec.key](doc, y);
    }

    pdfFooter(doc, monthLabel);
    doc.save(`report-completo-${selYear}-${String(selMonth).padStart(2, "0")}.pdf`);
    setPdfLoading(null);
  }

  function kpiLine(key: ReportKey) {
    if (!kpi) return { v1: "---", l1: "", v2: undefined as string | undefined, l2: undefined as string | undefined };
    switch (key) {
      case "spese": return { v1: eur(kpi.spese.total), l1: "totale", v2: String(kpi.spese.count), l2: "registrazioni" };
      case "cassa": return { v1: eur(kpi.cassa.entrate), l1: "entrate", v2: eur(kpi.cassa.uscite), l2: "uscite" };
      case "magazzino": return { v1: String(rawStock.length), l1: "prodotti", v2: String(kpi.magazzino.lowStock), l2: "sotto scorta" };
      case "personale": return { v1: `${kpi.personale.totalHours.toFixed(0)}h`, l1: "ore mese", v2: eur(kpi.personale.onCallCost), l2: "a chiamata" };
      case "bar": return { v1: eur(kpi.bar.revenue), l1: "ricavi", v2: String(kpi.bar.orders), l2: "ordini" };
      case "utenze": return { v1: eur(kpi.utenze.total), l1: "totale", v2: undefined, l2: undefined };
    }
  }

  if (roleLoading || !isAdmin) {
    return <div style={{ padding: 40, textAlign: "center", color: "#6C6B5D", fontFamily: "'Albert Sans', sans-serif" }}>Caricamento...</div>;
  }

  const months = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: new Date(2000, i, 1).toLocaleDateString("it-IT", { month: "long" }),
  }));
  const years = Array.from({ length: 4 }, (_, i) => now.getFullYear() - i);

  return (
    <>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 500, color: "#1F3326", margin: 0 }}>Centro Report</h1>
        <p style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 14, color: "#888", margin: "4px 0 0" }}>Genera, consulta e scarica i report del tuo hotel</p>
      </div>

      {/* Filters */}
      <div className="rpt-filter-card">
        <div className="rpt-filter-row">
          <div className="rpt-filter-field">
            <label>Mese</label>
            <select value={selMonth} onChange={e => setSelMonth(Number(e.target.value))}>
              {months.map(m => <option key={m.value} value={m.value}>{m.label.charAt(0).toUpperCase() + m.label.slice(1)}</option>)}
            </select>
          </div>
          <div className="rpt-filter-field">
            <label>Anno</label>
            <select value={selYear} onChange={e => setSelYear(Number(e.target.value))}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <button
            className="rpt-btn-full"
            onClick={downloadFullPdf}
            disabled={!kpi || pdfLoading !== null}
          >
            {pdfLoading === "full" ? "Generazione..." : "Genera report completo"}
          </button>
        </div>
      </div>

      {/* Report Cards Grid */}
      <div className="rpt-grid">
        {REPORT_CARDS.map(card => {
          const k = kpiLine(card.key);
          return (
            <div key={card.key} className="rpt-card" style={{ borderTopColor: BORDER_COLORS[card.key] }}>
              <div className="rpt-card-head">
                <div className="rpt-card-icon">{icons[card.key]}</div>
                <div>
                  <div className="rpt-card-title">{card.title}</div>
                  <div className="rpt-card-desc">{card.desc}</div>
                </div>
              </div>
              <div className="rpt-card-kpi">
                {loadingKpi ? (
                  <span className="rpt-kpi-loading">Caricamento...</span>
                ) : (
                  <>
                    <div className="rpt-kpi-item">
                      <span className="rpt-kpi-value">{k.v1}</span>
                      <span className="rpt-kpi-label">{k.l1}</span>
                    </div>
                    {k.v2 !== undefined && (
                      <div className="rpt-kpi-item">
                        <span className="rpt-kpi-value">{k.v2}</span>
                        <span className="rpt-kpi-label">{k.l2}</span>
                      </div>
                    )}
                  </>
                )}
              </div>
              <button
                className="rpt-btn-download"
                onClick={() => downloadSinglePdf(card.key)}
                disabled={!kpi || pdfLoading !== null}
              >
                {pdfLoading === card.key ? "Generazione..." : "Scarica PDF"}
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
