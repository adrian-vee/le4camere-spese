"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { eur } from "@/lib/format";
import { useRole } from "@/lib/useRole";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  LineChart, Line,
} from "recharts";

const COLORS = ["#1F3326", "#BFA762", "#9E3B2E", "#4F7B8C", "#C77B4A", "#2D5A3D", "#7A6A8C", "#B68A3E", "#5C7363", "#6C6B5D"];
const MONTH_NAMES = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

type Expense = { amount: number; expense_date: string; category_name: string; payment_method: string };
type CashMv = { type: string; amount: number; shift_date: string };
type UtilBill = { amount: number; utility_type: string; period_start: string };

export default function StatistichePage() {
  const supabase = createClient();
  const router = useRouter();
  const { role, isAdmin, loading: roleLoading } = useRole();

  useEffect(() => {
    if (!roleLoading && !isAdmin) {
      router.replace("/");
    }
  }, [roleLoading, isAdmin, router]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [cashMvs, setCashMvs] = useState<CashMv[]>([]);
  const [utilBills, setUtilBills] = useState<UtilBill[]>([]);

  async function loadData() {
    setLoading(true);
    const start = `${year}-01-01`;
    const end = `${year}-12-31`;

    const [{ data: expData }, { data: mvData }, { data: utilData }] = await Promise.all([
      supabase.from("expenses").select("amount, expense_date, categories(name), payment_method").gte("expense_date", start).lte("expense_date", end),
      supabase.from("cash_movements").select("type, amount, cash_sessions!inner(shift_date)").gte("cash_sessions.shift_date", start).lte("cash_sessions.shift_date", end),
      supabase.from("utility_bills").select("amount, utility_type, period_start").gte("period_start", start).lte("period_start", end),
    ]);

    setExpenses((expData ?? []).map((e: Record<string, unknown>) => ({
      amount: Number(e.amount),
      expense_date: String(e.expense_date),
      category_name: (e.categories as { name: string } | null)?.name ?? "Altro",
      payment_method: String(e.payment_method ?? ""),
    })));

    setCashMvs((mvData ?? []).map((m: Record<string, unknown>) => ({
      type: String(m.type),
      amount: Number(m.amount),
      shift_date: String((m.cash_sessions as { shift_date: string })?.shift_date ?? ""),
    })));

    setUtilBills((utilData ?? []).map((u: Record<string, unknown>) => ({
      amount: Number(u.amount),
      utility_type: String(u.utility_type),
      period_start: String(u.period_start),
    })));

    setLoading(false);
  }

  useEffect(() => { loadData(); }, [year]); // eslint-disable-line react-hooks/exhaustive-deps

  const totExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const totCashIn = cashMvs.filter(m => m.type === "entrata").reduce((s, m) => s + m.amount, 0);
  const totCashOut = cashMvs.filter(m => m.type === "uscita").reduce((s, m) => s + m.amount, 0);
  const totUtil = utilBills.reduce((s, u) => s + u.amount, 0);

  const monthlyExpenses = useMemo(() => {
    const map = new Map<number, number>();
    for (const e of expenses) {
      const mo = new Date(e.expense_date).getMonth();
      map.set(mo, (map.get(mo) ?? 0) + e.amount);
    }
    return Array.from({ length: 12 }, (_, i) => ({ month: MONTH_NAMES[i], spese: Math.round(map.get(i) ?? 0) }));
  }, [expenses]);

  const monthlyCash = useMemo(() => {
    const inMap = new Map<number, number>();
    const outMap = new Map<number, number>();
    for (const m of cashMvs) {
      const mo = new Date(m.shift_date).getMonth();
      if (m.type === "entrata") inMap.set(mo, (inMap.get(mo) ?? 0) + m.amount);
      else outMap.set(mo, (outMap.get(mo) ?? 0) + m.amount);
    }
    return Array.from({ length: 12 }, (_, i) => ({
      month: MONTH_NAMES[i],
      entrate: Math.round(inMap.get(i) ?? 0),
      uscite: Math.round(outMap.get(i) ?? 0),
    }));
  }, [cashMvs]);

  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expenses) map.set(e.category_name, (map.get(e.category_name) ?? 0) + e.amount);
    return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value: Math.round(value) }));
  }, [expenses]);

  const paymentBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expenses) {
      const method = e.payment_method || "Non specificato";
      map.set(method, (map.get(method) ?? 0) + e.amount);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value: Math.round(value) }));
  }, [expenses]);

  const monthlyUtil = useMemo(() => {
    const map = new Map<number, number>();
    for (const u of utilBills) {
      const mo = new Date(u.period_start).getMonth();
      map.set(mo, (map.get(mo) ?? 0) + u.amount);
    }
    return Array.from({ length: 12 }, (_, i) => ({ month: MONTH_NAMES[i], utenze: Math.round(map.get(i) ?? 0) }));
  }, [utilBills]);

  const utilTypeBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const u of utilBills) map.set(u.utility_type, (map.get(u.utility_type) ?? 0) + u.amount);
    return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value: Math.round(value) }));
  }, [utilBills]);

  if (roleLoading || !isAdmin) {
    return <div style={{ padding: 40, textAlign: "center", color: "#6C6B5D", fontFamily: "'Albert Sans', sans-serif" }}>Caricamento...</div>;
  }

  const tooltipFormatter = (val: number | string | ReadonlyArray<number | string> | undefined) => eur(Number(val ?? 0));

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h1 className="serif" style={{ fontSize: 24, fontWeight: 500 }}>Statistiche {year}</h1>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn btn-ghost" onClick={() => setYear(y => y - 1)}>◀ {year - 1}</button>
          <button className="btn btn-ghost" style={{ fontWeight: 700 }}>{year}</button>
          {year < new Date().getFullYear() && <button className="btn btn-ghost" onClick={() => setYear(y => y + 1)}>{year + 1} ▶</button>}
        </div>
      </div>

      {loading ? <div className="empty">Caricamento...</div> : (
        <>
          {/* KPI Cards */}
          <div className="cards cards-4">
            <div className="card accent">
              <div className="label">Spese totali</div>
              <div className="value tabular">{eur(totExpenses)}</div>
              <div className="meta">{expenses.length} voci</div>
            </div>
            <div className="card">
              <div className="label">Cassa entrate</div>
              <div className="value tabular" style={{ color: "#2D5A3D" }}>{eur(totCashIn)}</div>
            </div>
            <div className="card">
              <div className="label">Cassa uscite</div>
              <div className="value tabular" style={{ color: "#9E3B2E" }}>{eur(totCashOut)}</div>
            </div>
            <div className="card">
              <div className="label">Utenze</div>
              <div className="value tabular">{eur(totUtil)}</div>
              <div className="meta">{utilBills.length} bollette</div>
            </div>
          </div>

          {/* Monthly Expenses Chart */}
          <div className="section" style={{ marginTop: 20 }}>
            <div className="section-head"><h2>Andamento spese mensili</h2></div>
            <div className="section-body" style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyExpenses}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#D8CCB8" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(v: number) => `€${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={tooltipFormatter} />
                  <Bar dataKey="spese" fill="#1F3326" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Category + Payment breakdown */}
          <div className="stat-grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 20 }}>
            <div className="section">
              <div className="section-head"><h2>Spese per categoria</h2></div>
              <div className="section-body" style={{ height: 300 }}>
                {categoryBreakdown.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={categoryBreakdown} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false} style={{ fontSize: 10 }}>
                        {categoryBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={tooltipFormatter} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <div className="empty">Nessun dato</div>}
              </div>
            </div>
            <div className="section">
              <div className="section-head"><h2>Metodo di pagamento</h2></div>
              <div className="section-body" style={{ height: 300 }}>
                {paymentBreakdown.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={paymentBreakdown} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false} style={{ fontSize: 10 }}>
                        {paymentBreakdown.map((_, i) => <Cell key={i} fill={COLORS[(i + 3) % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={tooltipFormatter} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <div className="empty">Nessun dato</div>}
              </div>
            </div>
          </div>

          {/* Cash flow chart */}
          <div className="section" style={{ marginTop: 20 }}>
            <div className="section-head"><h2>Flusso cassa mensile</h2></div>
            <div className="section-body" style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyCash}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#D8CCB8" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(v: number) => `€${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={tooltipFormatter} />
                  <Legend />
                  <Bar dataKey="entrate" fill="#2D5A3D" name="Entrate" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="uscite" fill="#9E3B2E" name="Uscite" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Utilities */}
          <div className="stat-grid-util" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20, marginTop: 20 }}>
            <div className="section">
              <div className="section-head"><h2>Utenze mensili</h2></div>
              <div className="section-body" style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyUtil}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#D8CCB8" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(v: number) => `€${v}`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={tooltipFormatter} />
                    <Line type="monotone" dataKey="utenze" stroke="#4F7B8C" strokeWidth={2.5} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="section">
              <div className="section-head"><h2>Per tipo utenza</h2></div>
              <div className="section-body" style={{ padding: 0 }}>
                {utilTypeBreakdown.length > 0 ? (
                  <table className="tbl">
                    <tbody>
                      {utilTypeBreakdown.map(u => (
                        <tr key={u.name}>
                          <td style={{ fontWeight: 600 }}>{u.name}</td>
                          <td className="tabular" style={{ textAlign: "right" }}>{eur(u.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <div className="empty">Nessun dato</div>}
              </div>
            </div>
          </div>

          {/* Category table detail */}
          {categoryBreakdown.length > 0 && (
            <div className="section" style={{ marginTop: 20 }}>
              <div className="section-head"><h2>Dettaglio categorie spese</h2></div>
              <div className="section-body" style={{ padding: 0 }}>
                <table className="tbl">
                  <thead><tr><th>Categoria</th><th style={{ textAlign: "right" }}>Totale</th><th style={{ textAlign: "right" }}>% sul totale</th><th style={{ textAlign: "right" }}>Media mensile</th></tr></thead>
                  <tbody>
                    {categoryBreakdown.map((c, i) => (
                      <tr key={c.name}>
                        <td>
                          <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: COLORS[i % COLORS.length], marginRight: 8 }} />
                          <strong>{c.name}</strong>
                        </td>
                        <td className="tabular" style={{ textAlign: "right" }}>{eur(c.value)}</td>
                        <td className="tabular" style={{ textAlign: "right", color: "#6C6B5D" }}>{totExpenses > 0 ? ((c.value / totExpenses) * 100).toFixed(1) : 0}%</td>
                        <td className="tabular" style={{ textAlign: "right", color: "#6C6B5D" }}>{eur(c.value / 12)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <style>{`
        @media(max-width:768px){
          .stat-grid-2col{grid-template-columns:1fr !important}
          .stat-grid-util{grid-template-columns:1fr !important}
        }
      `}</style>
    </>
  );
}
