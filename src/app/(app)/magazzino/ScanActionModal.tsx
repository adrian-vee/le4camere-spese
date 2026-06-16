"use client";

import { fmtDate } from "@/lib/format";
import { Modal } from "@/components/ui/Modal";
import type { Product, Batch } from "./types";
import { catBg, catFg } from "./types";

interface ScanActionModalProps {
  product: Product | null;
  nearestExpiryMap: Record<string, string>;
  todayStr: string;
  batchesByProduct: Record<string, Batch[]>;
  scanRef: React.RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onQuickCarico: (p: Product) => void;
  onScarico: (p: Product) => void;
  onDetail: (p: Product) => void;
}

export default function ScanActionModal({
  product,
  nearestExpiryMap,
  todayStr,
  batchesByProduct,
  scanRef,
  onClose,
  onQuickCarico,
  onScarico,
  onDetail,
}: ScanActionModalProps) {
  if (!product) return null;

  return (
    <Modal isOpen={!!product} onClose={onClose} maxWidth={420}>
      <div style={{ padding: "0 0 0" }}>
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>{product.name}</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <span className="badge" style={{ background: catBg(product.category), color: catFg(product.category) }}>{product.category}</span>
          {product.barcode && <span className="badge" style={{ fontFamily: "'Courier New', monospace", letterSpacing: 1 }}>{product.barcode}</span>}
        </div>
        <div style={{ display: "flex", gap: 16, padding: "14px 18px", background: "var(--surface-2)", borderRadius: 10, marginBottom: 6 }}>
          <div style={{ textAlign: "center", flex: 1 }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink-soft)", fontWeight: 600 }}>Giacenza</div>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 600, marginTop: 2 }}>{product.current_stock} <span style={{ fontSize: 13, fontWeight: 400, color: "var(--ink-soft)" }}>{product.unit}</span></div>
          </div>
          {(() => {
            const pb = batchesByProduct[product.product_id];
            if (!pb || pb.length === 0) return null;
            return (
              <div style={{ textAlign: "center", flex: 1, borderLeft: "1px solid var(--line)", paddingLeft: 16 }}>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink-soft)", fontWeight: 600 }}>Lotti</div>
                <div style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 600, marginTop: 2 }}>{pb.length}</div>
                {nearestExpiryMap[product.product_id] && (
                  <div style={{ fontSize: 11, color: nearestExpiryMap[product.product_id] < todayStr ? "#9E3B2E" : "#C77B4A", fontWeight: 600, marginTop: 2 }}>
                    Scad. {fmtDate(nearestExpiryMap[product.product_id])}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-soft)", marginBottom: 2 }}>Cosa vuoi fare?</div>
        <button className="btn" style={{ width: "100%", padding: "14px 20px", fontSize: 15, fontWeight: 700, background: "#2D5A3D", color: "#FAF9F5", borderRadius: 10, border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, justifyContent: "center" }}
          onClick={() => { const p = product; onClose(); onQuickCarico(p); setTimeout(() => scanRef.current?.focus(), 100); }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          Carico merce
        </button>
        <button className="btn" style={{ width: "100%", padding: "14px 20px", fontSize: 15, fontWeight: 700, background: "#1F3326", color: "#FAF9F5", borderRadius: 10, border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, justifyContent: "center" }}
          onClick={() => { const p = product; onClose(); onScarico(p); setTimeout(() => scanRef.current?.focus(), 100); }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14" /></svg>
          Scarico rapido
        </button>
        <button className="btn btn-ghost" style={{ width: "100%", padding: "12px 20px", fontSize: 14 }}
          onClick={() => { const p = product; onClose(); onDetail(p); }}>
          Dettaglio prodotto
        </button>
      </div>
    </Modal>
  );
}
