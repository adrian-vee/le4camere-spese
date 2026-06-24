"use client";

import type { CartItem } from "@/lib/bar/types";
import { eur } from "@/lib/format";

type ReceiptPreviewModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onPrint: () => void;
  order: {
    paymentMethod: string;
    cart: CartItem[];
    subtotal: number;
    discount: number;
    total: number;
    isComplimentary: boolean;
    complimentaryReason?: string;
    amountReceived?: number;
    changeGiven?: number;
    roomNumber?: string;
    guestName?: string;
    serviceArea: string;
    notes?: string;
    operatorName: string;
  } | null;
};

function fmtTime(): string {
  return new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

function fmtDate(): string {
  return new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const SEP = "================================";
const SEP_THIN = "- - - - - - - - - - - - - - - -";

const mono: React.CSSProperties = {
  fontFamily: "'Courier New', Courier, monospace",
  fontSize: 12,
  lineHeight: 1.7,
  color: "#1F3326",
};

const row: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
};

export default function ReceiptPreviewModal({ isOpen, onClose, onPrint, order }: ReceiptPreviewModalProps) {
  if (!isOpen || !order) return null;

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
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#f0ede6", borderRadius: 16, padding: 24, width: 360,
          maxWidth: "92vw", fontFamily: "'Albert Sans', sans-serif",
        }}
      >
        <h3 style={{
          margin: "0 0 16px", fontFamily: "'Fraunces', serif",
          fontSize: 18, color: "#1F3326", fontWeight: 600, textAlign: "center",
        }}>
          Anteprima scontrino
        </h3>

        <div style={{
          maxWidth: 280, margin: "0 auto", background: "#fff",
          border: "1px solid #e8e4dc", borderRadius: 4,
          padding: "24px 18px",
          boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
          ...mono,
        }}>
          <div style={{ textAlign: "center", fontWeight: 700, fontSize: 13, letterSpacing: 1.5 }}>
            LE 4 CAMERE &mdash; BAR
          </div>
          <div style={{ textAlign: "center", fontSize: 10, color: "#999", letterSpacing: 2, margin: "6px 0" }}>
            {SEP}
          </div>

          <div style={{ textAlign: "center", fontSize: 11, marginBottom: 2 }}>
            {fmtDate()} &nbsp;&nbsp; {fmtTime()}
          </div>
          <div style={{ textAlign: "center", fontSize: 11, marginBottom: order.serviceArea !== "bar" ? 2 : 6 }}>
            Op: {order.operatorName}
          </div>
          {order.serviceArea !== "bar" && (
            <div style={{ textAlign: "center", fontSize: 11, marginBottom: 6 }}>
              Area: {order.serviceArea}
            </div>
          )}

          <div style={{ textAlign: "center", fontSize: 10, color: "#999", letterSpacing: 2, margin: "4px 0 8px" }}>
            {SEP_THIN}
          </div>

          {order.cart.map((item, i) => {
            const name = item.product.name.length > 18
              ? item.product.name.substring(0, 18) + ".."
              : item.product.name;
            return (
              <div key={i} style={{ ...row, marginBottom: 3 }}>
                <span>{item.quantity}x {name}</span>
                <span style={{ flexShrink: 0 }}>{eur(item.quantity * item.product.price)}</span>
              </div>
            );
          })}

          <div style={{ textAlign: "center", fontSize: 10, color: "#999", letterSpacing: 2, margin: "8px 0" }}>
            {SEP_THIN}
          </div>

          {order.discount > 0 && !order.isComplimentary && (
            <>
              <div style={{ ...row, marginBottom: 2 }}>
                <span>Subtotale</span>
                <span>{eur(order.subtotal)}</span>
              </div>
              <div style={{ ...row, marginBottom: 4 }}>
                <span>Sconto</span>
                <span>-{eur(order.discount)}</span>
              </div>
            </>
          )}

          <div style={{ ...row, fontWeight: 700, fontSize: 14, margin: "4px 0 2px" }}>
            <span>TOTALE</span>
            <span>{eur(order.total)}</span>
          </div>

          {order.isComplimentary && (
            <div style={{ textAlign: "center", margin: "10px 0 2px" }}>
              <div style={{ fontWeight: 700 }}>*** OMAGGIO ***</div>
              {order.complimentaryReason && (
                <div style={{ fontSize: 11 }}>Motivo: {order.complimentaryReason}</div>
              )}
            </div>
          )}

          {!order.isComplimentary && order.paymentMethod === "contanti" && order.amountReceived != null && (
            <div style={{ marginTop: 6 }}>
              <div style={row}>
                <span>Ricevuto</span>
                <span>{eur(order.amountReceived)}</span>
              </div>
              <div style={row}>
                <span>Resto</span>
                <span>{eur(order.changeGiven ?? 0)}</span>
              </div>
            </div>
          )}

          {!order.isComplimentary && order.paymentMethod === "camera" && order.roomNumber && (
            <div style={{ textAlign: "center", marginTop: 8 }}>
              <div>Addebito camera {order.roomNumber}</div>
              {order.guestName && <div style={{ fontSize: 11 }}>Ospite: {order.guestName}</div>}
            </div>
          )}

          {!order.isComplimentary && order.paymentMethod === "carta" && (
            <div style={{ textAlign: "center", marginTop: 6, fontSize: 11 }}>Pagamento: Carta</div>
          )}

          {!order.isComplimentary && order.paymentMethod === "misto" && (
            <div style={{ textAlign: "center", marginTop: 6, fontSize: 11 }}>Pagamento: Misto</div>
          )}

          {order.notes && (
            <div style={{ textAlign: "center", fontSize: 11, marginTop: 8, fontStyle: "italic" }}>
              Note: {order.notes}
            </div>
          )}

          <div style={{ textAlign: "center", fontSize: 10, color: "#999", letterSpacing: 2, margin: "12px 0 6px" }}>
            {SEP}
          </div>
          <div style={{ textAlign: "center", fontStyle: "italic", fontSize: 11 }}>
            Grazie e arrivederci!
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1, padding: "12px 0", borderRadius: 10,
              border: "1px solid #D8CCB8", background: "#fff",
              color: "#1F3326", fontSize: 13, fontWeight: 600,
              fontFamily: "inherit", cursor: "pointer",
            }}
          >
            Chiudi
          </button>
          <button
            type="button"
            onClick={onPrint}
            style={{
              flex: 1, padding: "12px 0", borderRadius: 10,
              border: "none", background: "#1F3326", color: "#fff",
              fontSize: 13, fontWeight: 700, fontFamily: "inherit",
              cursor: "pointer", display: "flex", alignItems: "center",
              justifyContent: "center", gap: 6,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            Stampa
          </button>
        </div>
      </div>
    </div>
  );
}
