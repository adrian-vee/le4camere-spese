"use client";

import { useState } from "react";
import Link from "next/link";
import { eur, fmtDate } from "@/lib/format";
import { Modal } from "@/components/ui/Modal";
import BottleIndicator from "@/components/BottleIndicator";
import { getRecipesByProduct } from "@/lib/barRecipes";
import type { Product, Movement, Batch } from "./types";
import { catBg, catFg, fmtDT } from "./types";

interface BottleStockInfo {
  closedCount: number;
  openBottles: { id: string; fill_level: number }[];
  totalMl: number;
  doses: number;
  cap: number;
  pour: number;
}

interface ProductDetailModalProps {
  isOpen: boolean;
  product: Product | null;
  detailMoves: Movement[];
  detailBatches: Batch[];
  allDetailBatches: Batch[];
  isStaff: boolean;
  openingBottleId: string | null;
  onClose: () => void;
  onEdit: (p: Product) => void;
  onDelete: (id: string) => void;
  onOpenBottle: (p: Product) => void;
  onUpdateBatchLevel: (batchId: string, level: number, prodName: string) => void;
  bottleStockInfo: (p: Product) => BottleStockInfo | null;
  miniChart: (moves: Movement[], currentStock: number) => React.ReactNode;
  showToast: (msg: string, type?: "ok" | "warn" | "error") => void;
  refreshDetailBatches: (productId: string) => void;
}

export default function ProductDetailModal({
  isOpen,
  product,
  detailMoves,
  detailBatches,
  allDetailBatches,
  isStaff,
  openingBottleId,
  onClose,
  onEdit,
  onDelete,
  onOpenBottle,
  onUpdateBatchLevel,
  bottleStockInfo,
  miniChart,
}: ProductDetailModalProps) {
  const [showExhaustedLots, setShowExhaustedLots] = useState(false);
  const [editLevelBatchId, setEditLevelBatchId] = useState<string | null>(null);
  const [editLevelVal, setEditLevelVal] = useState(0);

  if (!product) return null;

  const dBInfo = bottleStockInfo(product);

  return (
    <Modal isOpen={isOpen && !!product} onClose={onClose} title={product.name} maxWidth={650}>
      <div style={{ display: "flex", flexDirection: "column", gap: 18, overflowY: "auto" }}>
        {/* Bottle KPI */}
        {dBInfo && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
            <div style={{ background: "var(--surface-2)", borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink-soft)", fontWeight: 600 }}>Chiuse</div>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 600, marginTop: 4 }}>{dBInfo.closedCount}</div>
            </div>
            <div style={{ background: "var(--surface-2)", borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink-soft)", fontWeight: 600 }}>Aperte</div>
              {dBInfo.openBottles.length > 0 ? (
                <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 6 }}>
                  {dBInfo.openBottles.map((ob, i) => (
                    <BottleIndicator key={i} fillLevel={ob.fill_level} size="sm" showLabel capacityMl={dBInfo.cap} />
                  ))}
                </div>
              ) : (
                <div style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 600, marginTop: 4 }}>0</div>
              )}
            </div>
            <div style={{ background: "var(--surface-2)", borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink-soft)", fontWeight: 600 }}>Totale ml</div>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 600, marginTop: 4 }}>{Math.round(dBInfo.totalMl)}</div>
            </div>
            <div style={{ background: "var(--surface-2)", borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink-soft)", fontWeight: 600 }}>Dosi</div>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 600, marginTop: 4 }}>{dBInfo.doses}</div>
              <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{dBInfo.pour}ml/dose</div>
            </div>
          </div>
        )}

        {/* Standard stock KPI */}
        {product.tracking_type !== "bottle" && (
          <div style={{ display: "grid", gridTemplateColumns: isStaff ? "1fr 1fr" : "1fr 1fr 1fr", gap: 12 }}>
            <div style={{ background: "var(--surface-2)", borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink-soft)", fontWeight: 600 }}>Giacenza</div>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 600, marginTop: 4 }}>{product.current_stock}</div>
              <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{product.unit}</div>
            </div>
            {!isStaff && (
              <div style={{ background: "var(--surface-2)", borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink-soft)", fontWeight: 600 }}>Valore netto</div>
                <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 600, marginTop: 4 }}>{eur(product.current_stock * product.unit_cost)}</div>
                {product.vat_rate != null && <div style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 2 }}>+IVA {product.vat_rate}% = {eur(product.current_stock * product.unit_cost * (1 + product.vat_rate / 100))}</div>}
              </div>
            )}
            <div style={{ background: "var(--surface-2)", borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink-soft)", fontWeight: 600 }}>Scorta min</div>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 600, marginTop: 4 }}>{product.min_stock}</div>
            </div>
          </div>
        )}

        {/* Badges */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span className="badge" style={{ background: catBg(product.category), color: catFg(product.category) }}>{product.category}</span>
          {product.tracking_type === "bottle" && <span className="badge" style={{ background: "rgba(138,115,85,.12)", color: "#8A7355" }}>Bottiglia</span>}
          {product.barcode && <span className="badge" style={{ fontFamily: "'Courier New', monospace", letterSpacing: 1 }}>{product.barcode}</span>}
          {!isStaff && <span className="badge">{eur(product.unit_cost)}/{product.unit}</span>}
        </div>

        {/* Mini chart */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-soft)", marginBottom: 8 }}>Andamento giacenza</div>
          {miniChart(detailMoves, product.current_stock) || <div className="muted" style={{ textAlign: "center", padding: 12 }}>Nessun movimento</div>}
        </div>

        {/* Batches / Lots */}
        {(() => {
          const exhaustedCount = allDetailBatches.filter(b => b.quantity_remaining <= 0).length;
          const visibleBatches = showExhaustedLots ? allDetailBatches : detailBatches;
          const totalQty = detailBatches.reduce((s, b) => s + b.quantity_remaining, 0);
          if (visibleBatches.length === 0 && exhaustedCount === 0) return null;
          return (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-soft)" }}>
                  {product.tracking_type === "bottle" ? "Bottiglie in magazzino" : "Lotti in magazzino"}
                </div>
                {detailBatches.length > 0 && (
                  <div style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                    Totale: <strong>{totalQty}</strong> {product.unit} ({detailBatches.length} {detailBatches.length === 1 ? "lotto" : "lotti"})
                  </div>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {visibleBatches.map((b, bIdx) => {
                  const daysLeft = b.expiry_date ? Math.round((new Date(b.expiry_date).getTime() - Date.now()) / 86400000) : null;
                  const isExpired = daysLeft !== null && daysLeft < 0;
                  const isExpiring7 = daysLeft !== null && !isExpired && daysLeft <= 7;
                  const isExpiring30 = daysLeft !== null && !isExpired && !isExpiring7 && daysLeft <= 30;
                  const isExpiring90 = daysLeft !== null && !isExpired && !isExpiring7 && !isExpiring30 && daysLeft <= 90;
                  const isExhausted = b.quantity_remaining <= 0;
                  const expiryBorderColor = b.is_open ? "#BFA762" : isExpired ? "#9E3B2E" : isExpiring7 ? "#C77B4A" : isExpiring30 ? "#BFA762" : "#2D5A3D";
                  return (
                    <div key={b.id} style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                      borderRadius: 8, background: isExhausted ? "rgba(0,0,0,.03)" : b.is_open ? "#FDFAF3" : "var(--surface-2)",
                      borderLeft: `3px solid ${isExhausted ? "var(--line)" : expiryBorderColor}`,
                      opacity: isExhausted ? 0.5 : 1,
                    }}>
                      {b.is_open ? (
                        <div style={{ minWidth: 50, display: "flex", justifyContent: "center" }}>
                          <BottleIndicator
                            fillLevel={b.fill_level ?? 0}
                            size="md"
                            showLabel
                            capacityMl={product.bottle_capacity_ml ?? undefined}
                          />
                        </div>
                      ) : (
                        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 600, minWidth: 50, textAlign: "center", color: isExhausted ? "var(--ink-soft)" : "var(--ink)" }}>
                          {b.quantity_remaining}
                        </div>
                      )}
                      <div style={{ flex: 1, fontSize: 12 }}>
                        {isExhausted ? (
                          <span className="badge" style={{ background: "rgba(0,0,0,.05)", color: "var(--ink-soft)", fontSize: 10, padding: "2px 8px", marginBottom: 4, display: "inline-block" }}>Esaurito</span>
                        ) : b.is_open ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                            <span className="badge" style={{ background: "#F3EBDD", color: "#8A7355", border: "1px solid #BFA762", fontSize: 11, padding: "3px 10px" }}>{"\u{1F37E}"} Bottiglia aperta</span>
                            {editLevelBatchId !== b.id && (
                              <button type="button" style={{ background: "none", border: "none", padding: 0, fontSize: 11, color: "#8A7355", cursor: "pointer", textDecoration: "underline" }}
                                onClick={() => { setEditLevelBatchId(b.id); setEditLevelVal(b.fill_level ?? 0); }}>
                                {"✏️"} Modifica livello
                              </button>
                            )}
                          </div>
                        ) : product.tracking_type === "bottle" ? (
                          <span className="badge" style={{ background: "var(--surface-2)", color: "var(--ink-soft)", border: "1px solid var(--line)", fontSize: 11, padding: "3px 10px", marginBottom: 4, display: "inline-block" }}>{"\u{1F4E6}"} Chiusa</span>
                        ) : detailBatches.length > 1 ? (
                          <div style={{ fontSize: 11, color: "var(--ink-soft)", fontWeight: 600, marginBottom: 2 }}>Lotto {bIdx + 1}</div>
                        ) : null}
                        {b.is_open && editLevelBatchId === b.id && (
                          <div style={{ background: "#FFF", border: "1px solid #BFA762", borderRadius: 8, padding: "10px 12px", marginBottom: 6 }}>
                            <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginBottom: 8 }}>
                              <BottleIndicator fillLevel={editLevelVal} size="md" showLabel capacityMl={product.bottle_capacity_ml ?? undefined} />
                              <div>
                                <div className="bottle-level-selector" style={{ marginBottom: 4 }}>
                                  {Array.from({ length: 11 }, (_, i) => (
                                    <button key={i} type="button"
                                      className={`bottle-level-btn${editLevelVal === i ? " active" : ""}`}
                                      style={{ height: 10 + i * 2.5 }}
                                      onClick={() => setEditLevelVal(i)}>
                                      {i}
                                    </button>
                                  ))}
                                </div>
                                <div style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                                  ~{Math.round(editLevelVal * (product.bottle_capacity_ml ?? 700) / 10)}ml · ~{Math.floor(editLevelVal * (product.bottle_capacity_ml ?? 700) / 10 / (product.standard_pour_ml ?? 30))} dosi
                                </div>
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: "5px 12px" }} onClick={() => setEditLevelBatchId(null)}>Annulla</button>
                              <button type="button" className="btn" style={{ fontSize: 12, padding: "5px 12px", background: "#1F3326", color: "#FAF9F5", border: "none", borderRadius: 8 }}
                                onClick={() => onUpdateBatchLevel(b.id, editLevelVal, product.name)}>Salva</button>
                            </div>
                          </div>
                        )}
                        {b.is_open && (
                          <div style={{ fontSize: 11, color: "#8A7355", marginBottom: 2 }}>Aperta il {fmtDate(b.created_at)}</div>
                        )}
                        {b.expiry_date ? (
                          <div>
                            Scadenza: <strong>{fmtDate(b.expiry_date)}</strong>
                            {isExpired && <span className="badge" style={{ background: "#9E3B2E", color: "#FAF9F5", fontSize: 10, marginLeft: 6 }}>Scaduto</span>}
                            {isExpiring7 && <span className="badge" style={{ background: "rgba(199,123,74,.15)", color: "#C77B4A", fontSize: 10, marginLeft: 6 }}>{daysLeft}gg</span>}
                            {isExpiring30 && <span className="badge" style={{ background: "rgba(191,167,98,.12)", color: "#96832E", fontSize: 10, marginLeft: 6 }}>{daysLeft}gg</span>}
                            {isExpiring90 && <span className="badge" style={{ background: "rgba(45,90,61,.08)", color: "#2D5A3D", fontSize: 10, marginLeft: 6 }}>{daysLeft}gg</span>}
                          </div>
                        ) : <div className="muted">Senza scadenza</div>}
                        <div className="muted" style={{ fontSize: 11 }}>{b.source === "delivery" ? "Fornitore" : b.source === "migration" ? "Migrazione" : "Manuale"} — {fmtDate(b.created_at)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {exhaustedCount > 0 && (
                <button type="button" style={{ background: "none", border: "none", padding: "6px 0", fontSize: 11, color: "var(--ink-soft)", cursor: "pointer", textDecoration: "underline", marginTop: 4 }}
                  onClick={() => setShowExhaustedLots(!showExhaustedLots)}>
                  {showExhaustedLots ? "Nascondi lotti esauriti" : `Mostra ${exhaustedCount} lott${exhaustedCount === 1 ? "o" : "i"} esaurit${exhaustedCount === 1 ? "o" : "i"}`}
                </button>
              )}
            </div>
          );
        })()}

        {/* Movement history */}
        {detailMoves.length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-soft)", marginBottom: 8 }}>Storico movimenti</div>
            <div style={{ maxHeight: 250, overflowY: "auto", borderRadius: 10, border: "1px solid var(--line)" }}>
              <table className="tbl" style={{ margin: 0 }}><tbody>
                {detailMoves.map(m => (
                  <tr key={m.id}>
                    <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>{fmtDT(m.created_at)}</td>
                    <td><span className="badge" style={{ background: m.type === "in" ? "#E3EEE4" : "#F5EEDB", color: m.type === "in" ? "#2D5A3D" : "#B68A3E", fontSize: 10 }}>{m.type === "in" ? "Entrata" : "Uscita"}</span></td>
                    <td className="tabular" style={{ fontWeight: 600 }}>{m.type === "in" ? "+" : "−"}{m.quantity}</td>
                    <td className="muted" style={{ fontSize: 12 }}>{m.notes || "—"}</td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          </div>
        )}

        {/* Cocktail usage */}
        {(() => {
          const cocktailMoves = detailMoves.filter(m => m.type === "out" && m.notes?.startsWith("Vendita "));
          if (cocktailMoves.length === 0) return null;
          const byMonth: Record<string, { count: number; recipes: Set<string> }> = {};
          for (const m of cocktailMoves) {
            const d = new Date(m.created_at);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
            if (!byMonth[key]) byMonth[key] = { count: 0, recipes: new Set() };
            byMonth[key].count++;
            byMonth[key].recipes.add(m.notes!.replace("Vendita ", ""));
          }
          const months = Object.entries(byMonth).sort((a, b) => b[0].localeCompare(a[0]));
          const MONTH_NAMES = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
          return (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-soft)", marginBottom: 8 }}>Uso in cocktail</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {months.map(([key, val]) => {
                  const [y, mo] = key.split("-");
                  return (
                    <div key={key} style={{ padding: "8px 12px", borderRadius: 8, background: "var(--surface-2)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{MONTH_NAMES[parseInt(mo) - 1]} {y}</div>
                        <div className="muted" style={{ fontSize: 11 }}>{Array.from(val.recipes).join(", ")}</div>
                      </div>
                      <div style={{ fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 600, color: "#1F3326" }}>{val.count}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Drink Lab link */}
        {(() => {
          const recipes = getRecipesByProduct(product.name);
          if (recipes.length === 0) return null;
          return (
            <Link href={`/drink-lab?q=${encodeURIComponent(product.name)}`} style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              padding: "10px 16px", borderRadius: 10, background: "rgba(191,167,98,.1)",
              border: "1px solid rgba(191,167,98,.3)", color: "#8B6914", fontWeight: 600,
              fontSize: 14, textDecoration: "none", transition: "all .15s",
            }}>
              Drink Lab - {recipes.length} ricett{recipes.length === 1 ? "a" : "e"}
            </Link>
          );
        })()}

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(() => {
            const isOpening = openingBottleId === product.product_id;
            return dBInfo ? (
              <button className="btn" style={{ flex: "1 1 100%", background: dBInfo.closedCount === 0 ? "var(--surface-2)" : "rgba(138,115,85,.1)", color: dBInfo.closedCount === 0 ? "var(--ink-soft)" : "#8A7355", border: `1px solid ${dBInfo.closedCount === 0 ? "var(--line)" : "rgba(138,115,85,.25)"}`, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: (dBInfo.closedCount === 0 || isOpening) ? 0.6 : 1 }}
                onClick={() => onOpenBottle(product)}
                disabled={dBInfo.closedCount === 0 || isOpening}
                title={dBInfo.closedCount === 0 ? "Nessuna bottiglia chiusa" : `Apri bottiglia — ${dBInfo.closedCount} chiuse disponibili`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 2h6v4H9z"/><rect x="8" y="6" width="8" height="16" rx="2"/><path d="M10 12h4"/></svg>
                {isOpening ? "Apertura..." : dBInfo.closedCount === 0 ? "Nessuna bottiglia chiusa" : `Apri bottiglia (${dBInfo.closedCount} ${dBInfo.closedCount === 1 ? "chiusa" : "chiuse"})`}
              </button>
            ) : null;
          })()}
          {!isStaff && <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { onClose(); onEdit(product); }}>Modifica</button>}
          {!isStaff && <button className="btn btn-ghost" style={{ flex: 1, color: "var(--danger)" }} onClick={() => { onClose(); onDelete(product.product_id); }}>Elimina</button>}
        </div>
      </div>
    </Modal>
  );
}
