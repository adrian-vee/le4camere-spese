import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { eur, fmtDate, monthKey, type Expense, type Category } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const supabase = await createClient();

  const [{ data: expData }, { data: catData }] = await Promise.all([
    supabase
      .from("expenses")
      .select("*, categories(name,color), profiles(full_name)")
      .order("expense_date", { ascending: false }),
    supabase.from("categories").select("*").order("sort"),
  ]);

  const expenses = (expData ?? []) as Expense[];
  const cats = (catData ?? []) as Category[];

  const now = new Date();
  const curM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const curY = String(now.getFullYear());

  const sumMonth = expenses.filter((e) => monthKey(e.expense_date) === curM).reduce((s, e) => s + Number(e.amount), 0);
  const yearExp = expenses.filter((e) => new Date(e.expense_date).getFullYear().toString() === curY);
  const sumYear = yearExp.reduce((s, e) => s + Number(e.amount), 0);
  const toPay = expenses.filter((e) => e.payment_status === "da_pagare");
  const sumToPay = toPay.reduce((s, e) => s + Number(e.amount), 0);

  // breakdown categoria sull'anno corrente
  const byCat: Record<string, { name: string; color: string; val: number }> = {};
  for (const e of yearExp) {
    const key = e.category_id ?? "none";
    const name = e.categories?.name ?? "Altro";
    const color = e.categories?.color ?? "#9C8E78";
    byCat[key] = byCat[key] || { name, color, val: 0 };
    byCat[key].val += Number(e.amount);
  }
  const bars = Object.values(byCat).sort((a, b) => b.val - a.val);
  const max = Math.max(1, ...bars.map((b) => b.val));

  const recent = expenses.slice(0, 8);

  return (
    <>
      <div className="cards">
        <div className="card accent">
          <div className="label">Spese mese corrente</div>
          <div className="value tabular">{eur(sumMonth)}</div>
          <div className="meta">{now.toLocaleDateString("it-IT", { month: "long", year: "numeric" })}</div>
        </div>
        <div className="card">
          <div className="label">Totale anno {curY}</div>
          <div className="value tabular">{eur(sumYear)}</div>
          <div className="meta">{yearExp.length} registrazioni</div>
        </div>
        <div className="card">
          <div className="label">Da pagare</div>
          <div className="value tabular" style={{ color: sumToPay > 0 ? "var(--warn)" : undefined }}>{eur(sumToPay)}</div>
          <div className="meta">{toPay.length} spese in sospeso</div>
        </div>
        <div className="card">
          <div className="label">Totale registrato</div>
          <div className="value tabular">{expenses.length}</div>
          <div className="meta">spese in archivio</div>
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h2>Spese per categoria · {curY}</h2>
          <span className="muted">{eur(sumYear)}</span>
        </div>
        <div className="section-body">
          {bars.length === 0 ? (
            <p className="muted">Nessuna spesa registrata quest&apos;anno.</p>
          ) : (
            <div className="chart">
              {bars.map((b) => (
                <div className="bar-row" key={b.name}>
                  <div className="cat"><span className="dot" style={{ background: b.color }} /><span className="hide-sm">{b.name}</span></div>
                  <div className="bar-track"><div className="bar-fill" style={{ width: `${(b.val / max) * 100}%`, background: b.color }} /></div>
                  <div className="amt tabular">{eur(b.val)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h2>Ultime spese</h2>
          <Link href="/spese" className="muted" style={{ fontWeight: 600 }}>Vedi tutte →</Link>
        </div>
        <div className="section-body" style={{ padding: 0 }}>
          {recent.length === 0 ? (
            <div className="empty">
              <div className="serif">Ancora nessuna spesa</div>
              <div>Premi “Nuova” per registrare la prima.</div>
            </div>
          ) : (
            <table className="tbl">
              <thead>
                <tr><th>Data</th><th>Fornitore</th><th className="hide-sm">Categoria</th><th style={{ textAlign: "right" }}>Importo</th></tr>
              </thead>
              <tbody>
                {recent.map((e) => (
                  <tr key={e.id}>
                    <td>{fmtDate(e.expense_date)}</td>
                    <td>
                      <strong>{e.supplier_name || "—"}</strong>
                      {e.payment_status === "da_pagare" && <span className="badge warn" style={{ marginLeft: 8 }}>da pagare</span>}
                    </td>
                    <td className="hide-sm"><span className="tag"><span className="dot" style={{ background: e.categories?.color ?? "#9C8E78" }} />{e.categories?.name ?? "Altro"}</span></td>
                    <td className="amt-cell tabular" style={{ textAlign: "right" }}>{eur(Number(e.amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
