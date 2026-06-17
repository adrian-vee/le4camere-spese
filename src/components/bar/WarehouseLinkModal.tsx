"use client";

import { useState, useMemo } from "react";
import type { BarProduct } from "@/lib/bar/types";

type WarehouseProduct = { id: string; name: string; category: string | null; current_stock?: number };

type WarehouseLinkModalProps = {
  isOpen: boolean;
  onClose: () => void;
  unlinkedProducts: BarProduct[];
  warehouseProducts: WarehouseProduct[];
  onApply: (links: { barProductId: string; warehouseProductId: string }[]) => Promise<void>;
};

type MatchRow = {
  barProduct: BarProduct;
  suggestedWp: WarehouseProduct | null;
  selectedWpId: string;
  confirmed: boolean;
  rejected: boolean;
};

function findBestMatch(barName: string, warehouse: WarehouseProduct[]): WarehouseProduct | null {
  const lower = barName.toLowerCase().trim();

  // 1. Exact match
  const exact = warehouse.find(w => w.name.toLowerCase().trim() === lower);
  if (exact) return exact;

  // 2. Bar name contained in warehouse name or vice versa
  const contained = warehouse.find(w => {
    const wLower = w.name.toLowerCase().trim();
    return wLower.includes(lower) || lower.includes(wLower);
  });
  if (contained) return contained;

  // 3. First word match (at least 3 chars)
  const firstWord = lower.split(/\s+/)[0];
  if (firstWord.length >= 3) {
    const firstWordMatch = warehouse.find(w =>
      w.name.toLowerCase().trim().split(/\s+/)[0] === firstWord
    );
    if (firstWordMatch) return firstWordMatch;
  }

  // 4. Any word overlap (at least 4 chars)
  const barWords = lower.split(/\s+/).filter(w => w.length >= 4);
  if (barWords.length > 0) {
    let bestScore = 0;
    let bestWp: WarehouseProduct | null = null;
    for (const wp of warehouse) {
      const wpWords = wp.name.toLowerCase().split(/\s+/).filter(w => w.length >= 4);
      const overlap = barWords.filter(w => wpWords.some(ww => ww.includes(w) || w.includes(ww))).length;
      if (overlap > bestScore) {
        bestScore = overlap;
        bestWp = wp;
      }
    }
    if (bestScore > 0) return bestWp;
  }

  return null;
}

export default function WarehouseLinkModal({
  isOpen,
  onClose,
  unlinkedProducts,
  warehouseProducts,
  onApply,
}: WarehouseLinkModalProps) {
  const [applying, setApplying] = useState(false);

  const initialRows = useMemo(() => {
    return unlinkedProducts.map(bp => {
      const suggested = findBestMatch(bp.name, warehouseProducts);
      return {
        barProduct: bp,
        suggestedWp: suggested,
        selectedWpId: suggested?.id ?? "",
        confirmed: !!suggested,
        rejected: false,
      };
    });
  }, [unlinkedProducts, warehouseProducts]);

  const [rows, setRows] = useState<MatchRow[]>(initialRows);

  // Reset rows when modal reopens
  useMemo(() => {
    if (isOpen) setRows(initialRows);
  }, [isOpen, initialRows]);

  if (!isOpen) return null;

  const confirmedCount = rows.filter(r => r.confirmed && r.selectedWpId && !r.rejected).length;

  function toggleConfirm(idx: number) {
    setRows(prev => prev.map((r, i) => {
      if (i !== idx) return r;
      if (r.rejected) return { ...r, rejected: false, confirmed: true };
      return { ...r, confirmed: !r.confirmed };
    }));
  }

  function rejectRow(idx: number) {
    setRows(prev => prev.map((r, i) =>
      i === idx ? { ...r, rejected: true, confirmed: false } : r
    ));
  }

  function changeSelection(idx: number, wpId: string) {
    setRows(prev => prev.map((r, i) =>
      i === idx ? { ...r, selectedWpId: wpId, confirmed: !!wpId, rejected: false } : r
    ));
  }

  async function handleApply() {
    const links = rows
      .filter(r => r.confirmed && r.selectedWpId && !r.rejected)
      .map(r => ({ barProductId: r.barProduct.id, warehouseProductId: r.selectedWpId }));
    if (links.length === 0) return;
    setApplying(true);
    await onApply(links);
    setApplying(false);
    onClose();
  }

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999,
      }}
    >
      <div
        className="modal-card"
        onClick={e => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 16, padding: 24, width: 720,
          maxWidth: "95vw", maxHeight: "85vh", display: "flex",
          flexDirection: "column", fontFamily: "'Albert Sans', sans-serif",
        }}
      >
        <h3 style={{
          margin: "0 0 4px", fontFamily: "'Fraunces', serif",
          fontSize: 20, color: "#1F3326", fontWeight: 600,
        }}>
          Collega prodotti al Magazzino
        </h3>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "#6C6B5D" }}>
          {unlinkedProducts.length} prodotti bar senza collegamento.
          I match suggeriti sono pre-confermati — verifica e modifica se necessario.
        </p>

        {/* Table */}
        <div style={{ flex: 1, overflowY: "auto", border: "1px solid #D8CCB8", borderRadius: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#F3EBDD", position: "sticky", top: 0, zIndex: 1 }}>
                <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#6C6B5D", borderBottom: "1px solid #D8CCB8" }}>
                  Prodotto Bar
                </th>
                <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#6C6B5D", borderBottom: "1px solid #D8CCB8" }}>
                  Prodotto Magazzino
                </th>
                <th style={{ padding: "10px 12px", textAlign: "center", fontSize: 12, fontWeight: 600, color: "#6C6B5D", borderBottom: "1px solid #D8CCB8", width: 80 }}>
                  Azione
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr
                  key={row.barProduct.id}
                  style={{
                    background: row.rejected ? "rgba(158,59,46,0.04)" :
                      row.confirmed && row.selectedWpId ? "rgba(45,90,61,0.04)" :
                      idx % 2 === 1 ? "rgba(243,235,221,0.2)" : "transparent",
                    borderBottom: "1px solid rgba(216,204,184,0.5)",
                  }}
                >
                  <td style={{ padding: "10px 12px", fontSize: 14, color: "#1F3326", fontWeight: 500 }}>
                    {row.barProduct.name}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    {row.rejected ? (
                      <span style={{ fontSize: 13, color: "#9E3B2E", fontStyle: "italic" }}>Rifiutato</span>
                    ) : (
                      <select
                        value={row.selectedWpId}
                        onChange={e => changeSelection(idx, e.target.value)}
                        style={{
                          width: "100%", padding: "6px 8px", border: "1px solid #D8CCB8",
                          borderRadius: 6, fontSize: 13, fontFamily: "inherit",
                          color: row.selectedWpId ? "#1F3326" : "#6C6B5D",
                          background: "#fff",
                        }}
                      >
                        <option value="">— Nessun match —</option>
                        {warehouseProducts.map(wp => (
                          <option key={wp.id} value={wp.id}>
                            {wp.name}{wp.category ? ` (${wp.category})` : ""}
                            {wp.current_stock != null ? ` [${wp.current_stock}]` : ""}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "center" }}>
                    <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                      {!row.rejected && row.selectedWpId && (
                        <button
                          type="button"
                          onClick={() => toggleConfirm(idx)}
                          title={row.confirmed ? "Deseleziona" : "Conferma"}
                          style={{
                            width: 30, height: 30, borderRadius: 6, border: "none",
                            background: row.confirmed ? "#2D5A3D" : "#F3EBDD",
                            color: row.confirmed ? "#fff" : "#1F3326",
                            fontSize: 16, cursor: "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}
                        >
                          {row.confirmed ? "\u2713" : "\u2713"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => row.rejected ? changeSelection(idx, row.suggestedWp?.id ?? "") : rejectRow(idx)}
                        title={row.rejected ? "Annulla rifiuto" : "Rifiuta"}
                        style={{
                          width: 30, height: 30, borderRadius: 6, border: "none",
                          background: row.rejected ? "#6C6B5D" : "rgba(158,59,46,0.08)",
                          color: row.rejected ? "#fff" : "#9E3B2E",
                          fontSize: 16, cursor: "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                      >
                        {row.rejected ? "\u21A9" : "\u2717"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
          <span style={{ fontSize: 13, color: "#6C6B5D" }}>
            {confirmedCount} collegament{confirmedCount === 1 ? "o" : "i"} da applicare
          </span>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "10px 20px", borderRadius: 8,
                border: "1px solid #D8CCB8", background: "#fff",
                color: "#1F3326", fontSize: 14, fontWeight: 600,
                fontFamily: "inherit", cursor: "pointer",
              }}
            >
              Annulla
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={applying || confirmedCount === 0}
              style={{
                padding: "10px 24px", borderRadius: 8,
                border: "none", background: confirmedCount > 0 ? "#1F3326" : "#a0a09a",
                color: "#fff", fontSize: 14, fontWeight: 700,
                fontFamily: "inherit",
                cursor: confirmedCount > 0 ? "pointer" : "default",
                opacity: applying ? 0.6 : 1,
              }}
            >
              {applying ? "Applicazione..." : `Applica ${confirmedCount} collegament${confirmedCount === 1 ? "o" : "i"}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
