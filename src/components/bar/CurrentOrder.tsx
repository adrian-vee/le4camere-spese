"use client";

import type { CartItem } from "@/lib/bar/types";
import { eur } from "@/lib/format";

type CurrentOrderProps = {
  cart: CartItem[];
  total: number;
  notes: string;
  onNotesChange: (notes: string) => void;
  onUpdateQty: (productId: string, delta: number) => void;
  onRemove: (productId: string) => void;
  onClear: () => void;
  onPayCash: () => void;
  onPayCard: () => void;
  onPayRoom: () => void;
  completing: boolean;
};

const BTN_BASE: React.CSSProperties = {
  fontFamily: "'Albert Sans', sans-serif",
  fontSize: 15,
  fontWeight: 700,
  width: "100%",
  height: 48,
  borderRadius: 10,
  cursor: "pointer",
  border: "none",
  transition: "opacity 150ms",
  touchAction: "manipulation",
};

export default function CurrentOrder({
  cart,
  total,
  notes,
  onNotesChange,
  onUpdateQty,
  onRemove,
  onClear,
  onPayCash,
  onPayCard,
  onPayRoom,
  completing,
}: CurrentOrderProps) {
  const isEmpty = cart.length === 0;
  const disabled = isEmpty || completing;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        fontFamily: "'Albert Sans', sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px 20px 12px",
          borderBottom: "1px solid #D8CCB8",
        }}
      >
        <h2
          style={{
            margin: 0,
            fontFamily: "'Fraunces', serif",
            fontSize: 20,
            color: "#1F3326",
            fontWeight: 600,
          }}
        >
          Conto corrente
        </h2>
      </div>

      {/* Cart items */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: isEmpty ? "0 20px" : "12px 20px",
        }}
      >
        {isEmpty ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "#6C6B5D",
              fontSize: 14,
              textAlign: "center",
              lineHeight: 1.5,
            }}
          >
            Tocca un prodotto per iniziare
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {cart.map((item) => (
              <CartRow
                key={item.product.id}
                item={item}
                onUpdateQty={onUpdateQty}
                onRemove={onRemove}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer: total, notes, buttons */}
      <div
        style={{
          flexShrink: 0,
          borderTop: "1px solid #D8CCB8",
          padding: "16px 20px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {/* Total */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 600, color: "#1F3326" }}>
            Totale
          </span>
          <span
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 28,
              color: "#1F3326",
              lineHeight: 1,
            }}
          >
            {eur(total)}
          </span>
        </div>

        {/* Notes */}
        <textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="Note..."
          rows={2}
          style={{
            fontFamily: "'Albert Sans', sans-serif",
            fontSize: 14,
            border: "1px solid #D8CCB8",
            borderRadius: 8,
            padding: "8px 12px",
            resize: "none",
            color: "#1F3326",
            background: "#fff",
            outline: "none",
          }}
        />

        {/* Payment buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            type="button"
            onClick={onPayCash}
            disabled={disabled}
            style={{
              ...BTN_BASE,
              background: disabled ? "#a0a09a" : "#1F3326",
              color: "#fff",
              opacity: disabled ? 0.6 : 1,
            }}
          >
            {completing ? "Salvataggio..." : "Paga contanti"}
          </button>

          <button
            type="button"
            onClick={onPayCard}
            disabled={disabled}
            style={{
              ...BTN_BASE,
              background: "#fff",
              border: "1px solid #D8CCB8",
              color: disabled ? "#a0a09a" : "#1F3326",
              opacity: disabled ? 0.6 : 1,
            }}
          >
            Paga carta
          </button>

          <button
            type="button"
            onClick={onPayRoom}
            disabled={disabled}
            style={{
              ...BTN_BASE,
              background: disabled ? "#d4c89d" : "#BFA762",
              color: "#1F3326",
              opacity: disabled ? 0.6 : 1,
            }}
          >
            Addebita camera
          </button>
        </div>

        {/* Cancel */}
        {!isEmpty && (
          <button
            type="button"
            onClick={onClear}
            style={{
              background: "none",
              border: "none",
              fontFamily: "'Albert Sans', sans-serif",
              fontSize: 13,
              fontWeight: 600,
              color: "#9E3B2E",
              cursor: "pointer",
              padding: "4px 0",
              textAlign: "center",
            }}
          >
            Annulla conto
          </button>
        )}
      </div>
    </div>
  );
}

function CartRow({
  item,
  onUpdateQty,
  onRemove,
}: {
  item: CartItem;
  onUpdateQty: (productId: string, delta: number) => void;
  onRemove: (productId: string) => void;
}) {
  const lineTotal = item.quantity * item.product.price;
  const qtyBtnStyle: React.CSSProperties = {
    width: 32,
    height: 32,
    borderRadius: 8,
    border: "none",
    background: "#F3EBDD",
    fontFamily: "'Albert Sans', sans-serif",
    fontSize: 16,
    fontWeight: 700,
    color: "#1F3326",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    touchAction: "manipulation",
    flexShrink: 0,
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 0",
        borderBottom: "1px solid rgba(216,204,184,0.4)",
      }}
    >
      {/* Qty controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => onUpdateQty(item.product.id, -1)}
          style={qtyBtnStyle}
          aria-label="Riduci quantita"
        >
          -
        </button>
        <span
          style={{
            width: 28,
            textAlign: "center",
            fontWeight: 700,
            fontSize: 15,
            color: "#1F3326",
          }}
        >
          {item.quantity}
        </span>
        <button
          type="button"
          onClick={() => onUpdateQty(item.product.id, 1)}
          style={qtyBtnStyle}
          aria-label="Aumenta quantita"
        >
          +
        </button>
      </div>

      {/* Name */}
      <span
        style={{
          flex: 1,
          fontSize: 14,
          color: "#1F3326",
          fontWeight: 500,
          lineHeight: 1.3,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {item.product.name}
      </span>

      {/* Line total */}
      <span
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: "#1F3326",
          flexShrink: 0,
          minWidth: 56,
          textAlign: "right",
        }}
      >
        {eur(lineTotal)}
      </span>

      {/* Remove */}
      <button
        type="button"
        onClick={() => onRemove(item.product.id)}
        style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          border: "none",
          background: "transparent",
          color: "#9E3B2E",
          fontSize: 16,
          fontWeight: 700,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          touchAction: "manipulation",
        }}
        aria-label={`Rimuovi ${item.product.name}`}
      >
        x
      </button>
    </div>
  );
}
