"use client";

import type { BarCategory } from "@/lib/bar/types";

type CategoryTabsProps = {
  categories: BarCategory[];
  active: string | null;
  onSelect: (id: string | null) => void;
  bestSellers?: string[];
};

export default function CategoryTabs({ categories, active, onSelect, bestSellers }: CategoryTabsProps) {
  const tabStyle = (isActive: boolean): React.CSSProperties => ({
    padding: "8px 20px",
    fontSize: 14,
    fontWeight: 600,
    fontFamily: "'Albert Sans', sans-serif",
    whiteSpace: "nowrap",
    cursor: "pointer",
    minHeight: 40,
    border: isActive ? "none" : "1px solid #D8CCB8",
    borderRadius: 20,
    background: isActive ? "#1F3326" : "#F3EBDD",
    color: isActive ? "#fff" : "#1F3326",
    transition: "background 150ms, color 150ms",
    display: "flex",
    alignItems: "center",
    gap: 6,
  });

  const hasBestSellers = bestSellers && bestSellers.length > 0;

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        padding: "12px 16px",
        overflowX: "auto",
        flexShrink: 0,
        borderBottom: "1px solid #D8CCB8",
        msOverflowStyle: "none",
        scrollbarWidth: "none",
      }}
    >
      <button
        type="button"
        style={tabStyle(active === null)}
        onClick={() => onSelect(null)}
      >
        Tutti
      </button>
      {hasBestSellers && (
        <button
          type="button"
          style={{
            ...tabStyle(active === "best-sellers"),
            background: active === "best-sellers" ? "#BFA762" : "#FFF8E7",
            color: active === "best-sellers" ? "#fff" : "#8B6914",
            border: active === "best-sellers" ? "none" : "1px solid #E8D9A0",
          }}
          onClick={() => onSelect("best-sellers")}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
          Top venduti
        </button>
      )}
      {categories.map((cat) => (
        <button
          key={cat.id}
          type="button"
          style={tabStyle(active === cat.id)}
          onClick={() => onSelect(cat.id)}
        >
          {cat.icon && <i className={`ti ti-${cat.icon}`} style={{ fontSize: 16 }} />}
          {cat.name}
        </button>
      ))}
    </div>
  );
}
