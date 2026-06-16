"use client";

import { eur, fmtDate } from "@/lib/format";
import { generatePDF } from "./InventarioPDFGenerator";

type Product = { product_id: string; name: string; category: string; unit: string; unit_cost: number; current_stock: number; barcode: string | null; tracking_type: "units" | "bottle"; bottle_capacity_ml: number | null; standard_pour_ml: number | null };
type Session = { id: string; started_at: string; completed_at: string | null; status: string; operator_id: string | null; notes: string | null; total_products: number; counted_products: number; discrepancies_count: number; discrepancies_value: number; profiles?: { full_name: string } | null };
type Count = { id: string; session_id: string; product_id: string; expected_qty: number; counted_qty: number | null; difference: number | null; value_difference: number | null; counted_at: string | null; notes: string | null; products?: { name: string; category: string; unit: string; unit_cost: number; barcode: string | null } | null };

interface InventarioReportViewProps {
  reportSession: Session;
  reportCounts: Count[];
  products: Product[];
  isStaff: boolean;
  onlyDiffs: boolean;
  setOnlyDiffs: (v: boolean) => void;
  onBack: () => void;
  onAlignStock: () => void;
  invStyles: React.ReactNode;
  toastNode: React.ReactNode;
}

export default function InventarioReportView({
  reportSession,
  reportCounts,
  products,
  isStaff,
  onlyDiffs,
  setOnlyDiffs,
  onBack,
  onAlignStock,
  invStyles,
  toastNode,
}: InventarioReportViewProps) {
  const counted = reportCounts.filter(c => c.counted_qty !== null);
  const discrepancies = counted.filter(c => (c.difference ?? 0) !== 0).sort((a, b) => Math.abs(b.value_difference ?? 0) - Math.abs(a.value_difference ?? 0));
  const totalAmmanchi = discrepancies.filter(c => (c.difference ?? 0) < 0).reduce((s, c) => s + Math.abs(c.value_difference ?? 0), 0);
  const totalEccedenze = discrepancies.filter(c => (c.difference ?? 0) > 0).reduce((s, c) => s + (c.value_difference ?? 0), 0);
  const accuracy = counted.length > 0 ? ((counted.length - discrepancies.length) / counted.length) * 100 : 100;
  const tableRows = onlyDiffs ? discrepancies : counted;
  const reportGrouped: [string, Count[]][] = (() => {
    const map: Record<string, Count[]> = {};
    for (const c of tableRows) {
      const cat = c.products?.category ?? "Altro";
      (map[cat] ??= []).push(c);
    }
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  })();
  let parsedSessionCategories: string[] | null = null;
  try { const n = reportSession.notes ? JSON.parse(reportSession.notes) : null; if (n?.categories) parsedSessionCategories = n.categories; } catch {}

  return (
    <>
      {invStyles}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 className="serif" style={{ fontSize: 24, fontWeight: 500 }}>Report inventario</h1>
          <div className="muted" style={{ marginTop: 4 }}>
            {fmtDate(reportSession.started_at)}{reportSession.completed_at ? " — " + fmtDate(reportSession.completed_at) : ""}
            {parsedSessionCategories && <span className="badge" style={{ marginLeft: 8, background: "#FDF6E3", color: "#C77B4A", fontSize: 11 }}>Inventario parziale · {parsedSessionCategories.length} categorie</span>}
          </div>
          {parsedSessionCategories && (
            <div style={{ marginTop: 6, display: "flex", gap: 4, flexWrap: "wrap" }}>
              {parsedSessionCategories.map(c => <span key={c} className="badge" style={{ background: "#F3EBDD", color: "#6C6B5D", fontSize: 11 }}>{c}</span>)}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={onBack}>Torna alla lista</button>
          {!isStaff && <button className="btn btn-ghost" onClick={() => generatePDF({ reportSession, reportCounts })}>Scarica PDF</button>}
          {!isStaff && reportSession.status === "completato" && discrepancies.length > 0 && (
            <button className="btn btn-primary" onClick={onAlignStock}>Allinea magazzino</button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="cards inv-kpi-report" style={{ marginBottom: 24 }}>
        <div className="card"><div className="label">Prodotti contati</div><div className="value tabular">{counted.length}/{reportCounts.length}</div></div>
        <div className="card" style={{ borderLeft: "3px solid #4F7B8C" }}>
          <div className="label">Accuratezza</div><div className="value tabular" style={{ color: accuracy < 95 ? "#9E3B2E" : "var(--ok)" }}>{accuracy.toFixed(1)}%</div>
        </div>
        <div className="card"><div className="label">Con differenze</div><div className="value tabular" style={{ color: discrepancies.length > 0 ? "#9E3B2E" : "var(--ok)" }}>{discrepancies.length}</div></div>
        {!isStaff && (
          <div className="card" style={{ borderLeft: totalAmmanchi > 0 ? "3px solid #9E3B2E" : undefined }}>
            <div className="label">Ammanchi</div><div className="value tabular" style={{ color: "#9E3B2E" }}>{eur(-totalAmmanchi)}</div>
          </div>
        )}
        {!isStaff && (
          <div className="card" style={{ borderLeft: totalEccedenze > 0 ? "3px solid #BFA762" : undefined }}>
            <div className="label">Eccedenze</div><div className="value tabular" style={{ color: "#BFA762" }}>+{eur(totalEccedenze)}</div>
          </div>
        )}
      </div>

      {/* Results grouped by category */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700 }}>{onlyDiffs ? `Differenze trovate (${discrepancies.length})` : `Tutti i conteggi (${counted.length})`}</h2>
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }}>
          <input type="checkbox" checked={onlyDiffs} onChange={e => setOnlyDiffs(e.target.checked)} style={{ accentColor: "#1F3326" }} />
          Solo differenze
        </label>
      </div>

      {reportGrouped.length > 0 ? reportGrouped.map(([cat, catRows]) => {
        const catDiffs = catRows.filter(c => (c.difference ?? 0) !== 0);
        return (
          <div key={cat} className="section" style={{ marginBottom: 16 }}>
            <div className="section-head" style={{ padding: "10px 18px" }}>
              <h2 style={{ fontSize: 14 }}>{cat}</h2>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                {catDiffs.length > 0 && <span className="badge" style={{ background: "rgba(158,59,46,.1)", color: "#9E3B2E", fontSize: 11 }}>{catDiffs.length} diff.</span>}
                <span className="muted" style={{ fontSize: 12 }}>{catRows.length} prodotti</span>
              </div>
            </div>
            <div className="section-body" style={{ padding: 0, overflowX: "auto" }}>
              <table className="tbl">
                <thead><tr><th>Prodotto</th><th className="num" style={{ textAlign: "right" }}>Teorico</th><th className="num" style={{ textAlign: "right" }}>Contato</th><th className="num" style={{ textAlign: "right" }}>Diff.</th>{!isStaff && <th className="num" style={{ textAlign: "right" }}>Val. diff.</th>}</tr></thead>
                <tbody>
                  {catRows.map(c => {
                    const hasDiff = (c.difference ?? 0) !== 0;
                    const diffColor = (c.difference ?? 0) < 0 ? "#9E3B2E" : (c.difference ?? 0) > 0 ? "#BFA762" : "var(--ok)";
                    const rProd = products.find(p => p.product_id === c.product_id);
                    const rIsBottle = rProd?.tracking_type === "bottle";
                    const rPour = rProd?.standard_pour_ml ?? 30;
                    const mlSuffix = rIsBottle ? "ml" : "";
                    return (
                      <tr key={c.id} style={{ borderLeft: hasDiff ? `3px solid ${diffColor}` : undefined }}>
                        <td>
                          <strong>{c.products?.name ?? "?"}</strong>
                          {rIsBottle && <span className="badge" style={{ marginLeft: 6, background: "rgba(138,115,85,.12)", color: "#8A7355", fontSize: 9, padding: "1px 5px" }}>Bottiglia</span>}
                        </td>
                        <td className="tabular" style={{ textAlign: "right" }}>{c.expected_qty}{mlSuffix}{rIsBottle ? <span className="muted" style={{ fontSize: 10 }}> (~{Math.floor(c.expected_qty / rPour)} dosi)</span> : null}</td>
                        <td className="tabular" style={{ textAlign: "right", fontWeight: 600 }}>{c.counted_qty}{mlSuffix}{rIsBottle && c.counted_qty != null ? <span className="muted" style={{ fontSize: 10 }}> (~{Math.floor(c.counted_qty / rPour)} dosi)</span> : null}</td>
                        <td className="tabular" style={{ textAlign: "right", fontWeight: 700, color: diffColor }}>
                          {hasDiff ? `${(c.difference ?? 0) > 0 ? "+" : ""}${c.difference}${mlSuffix}` : "0"}
                          {rIsBottle && hasDiff ? <span style={{ fontSize: 10, fontWeight: 400 }}> (~{Math.floor(Math.abs(c.difference ?? 0) / rPour)} dosi)</span> : null}
                        </td>
                        {!isStaff && (
                          <td className="tabular" style={{ textAlign: "right", fontWeight: hasDiff ? 700 : 400, color: hasDiff ? diffColor : undefined }}>
                            {hasDiff ? eur(c.value_difference ?? 0) : "—"}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      }) : (
        <div className="section">
          <div className="section-body" style={{ textAlign: "center", padding: "40px 20px" }}>
            <div className="serif" style={{ fontSize: 20, color: "var(--ok)", marginBottom: 6 }}>Nessuna differenza</div>
            <div className="muted">Tutte le giacenze corrispondono ai conteggi fisici.</div>
          </div>
        </div>
      )}

      {toastNode}
    </>
  );
}
