"use client";

import { useState, useCallback } from "react";
import type { BarProduct } from "@/lib/bar/types";
import { eur } from "@/lib/format";

type ProductGridProps = {
  products: BarProduct[];
  onAdd: (product: BarProduct) => void;
};

export default function ProductGrid({ products, onAdd }: ProductGridProps) {
  if (products.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 200,
          color: "#6C6B5D",
          fontFamily: "'Albert Sans', sans-serif",
          fontSize: 15,
        }}
      >
        Nessun prodotto
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
        gap: 12,
      }}
    >
      {products.map((product) => (
        <ProductCard key={product.id} product={product} onAdd={onAdd} />
      ))}
    </div>
  );
}

function ProductCard({
  product,
  onAdd,
}: {
  product: BarProduct;
  onAdd: (product: BarProduct) => void;
}) {
  const [tapped, setTapped] = useState(false);
  const isLinked = product.warehouse_product_id !== null;
  const isOutOfStock = isLinked && (product.stock ?? 0) <= 0;

  const handleTap = useCallback(() => {
    if (isOutOfStock) return;
    onAdd(product);
    setTapped(true);
    setTimeout(() => setTapped(false), 150);
  }, [product, onAdd, isOutOfStock]);

  return (
    <button
      type="button"
      onClick={handleTap}
      disabled={isOutOfStock}
      style={{
        position: "relative",
        background: "#fff",
        border: "1px solid #D8CCB8",
        borderRadius: 12,
        padding: 16,
        minHeight: 80,
        cursor: isOutOfStock ? "default" : "pointer",
        opacity: isOutOfStock ? 0.5 : 1,
        transform: tapped ? "scale(0.95)" : "scale(1)",
        transition: "transform 120ms ease-out, opacity 150ms",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: 8,
        textAlign: "left",
        fontFamily: "'Albert Sans', sans-serif",
        WebkitTapHighlightColor: "transparent",
        touchAction: "manipulation",
      }}
    >
      <span
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "#1F3326",
          lineHeight: 1.3,
        }}
      >
        {product.name}
      </span>

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <span
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 22,
            color: "#BFA762",
            lineHeight: 1,
          }}
        >
          {eur(product.price)}
        </span>

        {isLinked && !isOutOfStock && product.stock != null && (
          <span
            style={{
              fontSize: 12,
              color: "#6C6B5D",
              fontWeight: 500,
            }}
          >
            x{product.stock}
          </span>
        )}
      </div>

      {isOutOfStock && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 12,
            background: "rgba(250, 249, 245, 0.6)",
          }}
        >
          <span
            style={{
              fontFamily: "'Albert Sans', sans-serif",
              fontSize: 13,
              fontWeight: 700,
              color: "#9E3B2E",
              background: "rgba(255,255,255,0.9)",
              padding: "4px 12px",
              borderRadius: 8,
            }}
          >
            Esaurito
          </span>
        </div>
      )}
    </button>
  );
}
