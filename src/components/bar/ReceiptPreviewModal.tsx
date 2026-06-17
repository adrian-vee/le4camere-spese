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

export default function ReceiptPreviewModal({ isOpen, onClose, onPrint, order }: ReceiptPreviewModalProps) {
  if (!isOpen || !order) return null;

  const lines: string[] = [];
  lines.push("================================");
  lines.push("       LE 4 CAMERE - BAR       ");
  lines.push("================================");
  lines.push(`Data: ${fmtDate()}    Ora: ${fmtTime()}`);
  lines.push(`Operatore: ${order.operatorName}`);
  if (order.serviceArea !== "bar") {
    lines.push(`Area: ${order.serviceArea}`);
  }
  lines.push("--------------------------------");

  for (const item of order.cart) {
    const name = item.product.name.length > 20
      ? item.product.name.substring(0, 20)
      : item.product.name;
    const lineTotal = eur(item.quantity * item.product.price);
    const qty = `${item.quantity}x`;
    lines.push(`${qty.padEnd(4)} ${name.padEnd(20)} ${lineTotal.padStart(8)}`);
  }

  lines.push("--------------------------------");

  if (order.discount > 0 && !order.isComplimentary) {
    lines.push(`Subtotale:${eur(order.subtotal).padStart(22)}`);
    lines.push(`Sconto:${("-" + eur(order.discount)).padStart(25)}`);
  }

  lines.push(`TOTALE:${eur(order.total).padStart(25)}`);

  if (order.isComplimentary) {
    lines.push("");
    lines.push("        *** OMAGGIO ***         ");
    if (order.complimentaryReason) {
      lines.push(`Motivo: ${order.complimentaryReason}`);
    }
  } else if (order.paymentMethod === "contanti" && order.amountReceived) {
    lines.push(`Ricevuto:${eur(order.amountReceived).padStart(23)}`);
    lines.push(`Resto:${eur(order.changeGiven ?? 0).padStart(26)}`);
  } else if (order.paymentMethod === "camera" && order.roomNumber) {
    lines.push("");
    lines.push(`Addebito camera ${order.roomNumber}`);
    if (order.guestName) lines.push(`Ospite: ${order.guestName}`);
  } else if (order.paymentMethod === "carta") {
    lines.push("Pagamento: Carta");
  } else if (order.paymentMethod === "misto") {
    lines.push("Pagamento: Misto");
  }

  if (order.notes) {
    lines.push("");
    lines.push(`Note: ${order.notes}`);
  }

  lines.push("");
  lines.push("         Grazie e arrivederci!        ");
  lines.push("================================");

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
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 16, padding: 24, width: 320,
          maxWidth: "92vw", fontFamily: "'Albert Sans', sans-serif",
        }}
      >
        <h3 style={{
          margin: "0 0 16px", fontFamily: "'Fraunces', serif",
          fontSize: 18, color: "#1F3326", fontWeight: 600,
        }}>
          Scontrino
        </h3>

        {/* Receipt preview */}
        <div style={{
          background: "#FAFAF8", border: "1px solid #D8CCB8", borderRadius: 8,
          padding: "16px 12px", fontFamily: "'Courier New', monospace",
          fontSize: 11, lineHeight: 1.5, color: "#1F3326",
          whiteSpace: "pre", overflowX: "auto", maxHeight: 400,
          overflowY: "auto",
        }}>
          {lines.join("\n")}
        </div>

        {/* Actions */}
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
