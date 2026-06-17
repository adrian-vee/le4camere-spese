"use client";

import { useState, useCallback } from "react";
import type { BarProduct } from "@/lib/bar/types";
import { eur } from "@/lib/format";

type ProductGridProps = {
  products: BarProduct[];
  onAdd: (product: BarProduct) => void;
  categoryIconMap?: Record<string, string>;
};

export default function ProductGrid({ products, onAdd, categoryIconMap }: ProductGridProps) {
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
        <ProductCard
          key={product.id}
          product={product}
          onAdd={onAdd}
          categoryIcon={categoryIconMap?.[product.category_id ?? ""] ?? null}
        />
      ))}
    </div>
  );
}

function ProductCard({
  product,
  onAdd,
  categoryIcon,
}: {
  product: BarProduct;
  onAdd: (product: BarProduct) => void;
  categoryIcon: string | null;
}) {
  const [tapped, setTapped] = useState(false);
  const isLinked = product.warehouse_product_id !== null;
  const isOutOfStock = isLinked && (product.stock ?? 0) <= 0;
  const isLowStock = isLinked && !isOutOfStock && (product.stock ?? 999) <= (product.low_stock_threshold ?? 3);

  const handleTap = useCallback(() => {
    if (isOutOfStock) return;
    onAdd(product);
    setTapped(true);
    setTimeout(() => setTapped(false), 150);
  }, [product, onAdd, isOutOfStock]);

  const hasImage = !!product.image_url;

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
        padding: 0,
        overflow: "hidden",
        minHeight: 180,
        cursor: isOutOfStock ? "default" : "pointer",
        opacity: isOutOfStock ? 0.5 : 1,
        transform: tapped ? "scale(0.95)" : "scale(1)",
        transition: "transform 120ms ease-out, opacity 150ms, box-shadow 150ms",
        display: "flex",
        flexDirection: "column",
        textAlign: "left",
        fontFamily: "'Albert Sans', sans-serif",
        WebkitTapHighlightColor: "transparent",
        touchAction: "manipulation",
        boxShadow: tapped ? "0 0 0 2px #BFA762" : "none",
      }}
    >
      {/* Image or placeholder */}
      {hasImage ? (
        <div style={{
          width: "100%",
          height: 120,
          overflow: "hidden",
          background: "#1F3326",
          flexShrink: 0,
          position: "relative",
        }}>
          <img
            src={product.image_url!}
            alt={product.name}
            loading="lazy"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
            }}
          />
          {isLowStock && (
            <span style={{
              position: "absolute",
              top: 6,
              right: 6,
              background: "#C77B4A",
              color: "#fff",
              fontSize: 10,
              fontWeight: 700,
              padding: "2px 6px",
              borderRadius: 6,
              fontFamily: "'Albert Sans', sans-serif",
            }}>
              Scorte basse
            </span>
          )}
        </div>
      ) : (
        <div style={{
          width: "100%",
          height: 120,
          overflow: "hidden",
          background: "#1F3326",
          flexShrink: 0,
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          {categoryIcon ? (
            <i
              className={`ti ti-${categoryIcon}`}
              style={{
                fontSize: 48,
                color: "rgba(250,249,245,0.15)",
              }}
            />
          ) : (
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="rgba(250,249,245,0.15)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M8 2h8l-1 7H9L8 2z" />
              <path d="M12 9v4" />
              <path d="M7 17h10" />
              <path d="M9 13c0 2-2 4-2 4h10s-2-2-2-4" />
            </svg>
          )}
          {isLowStock && (
            <span style={{
              position: "absolute",
              top: 6,
              right: 6,
              background: "#C77B4A",
              color: "#fff",
              fontSize: 10,
              fontWeight: 700,
              padding: "2px 6px",
              borderRadius: 6,
              fontFamily: "'Albert Sans', sans-serif",
            }}>
              Scorte basse
            </span>
          )}
        </div>
      )}

      {/* Content */}
      <div style={{
        padding: "10px 12px 12px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: 8,
        flex: 1,
      }}>
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
                fontSize: 11,
                color: isLowStock ? "#C77B4A" : "#6C6B5D",
                fontWeight: isLowStock ? 700 : 500,
              }}
            >
              x{product.stock}
            </span>
          )}
        </div>
      </div>

      {/* Out of stock overlay */}
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
