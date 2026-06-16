"use client";

import type { BarCategory } from "@/lib/bar/types";

type CategoryTabsProps = {
  categories: BarCategory[];
  active: string | null;
  onSelect: (id: string | null) => void;
};

export default function CategoryTabs({ categories, active, onSelect }: CategoryTabsProps) {
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
