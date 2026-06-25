"use client";
import useCountUp from "./useCountUp";

type KpiCard = {
  label: string;
  value: number;
  format: "eur" | "int";
  subtitle: string;
  icon: React.ReactNode;
  iconBg?: string;
  borderTop?: string;
  accent?: boolean; // dark card
  valueColor?: string;
};

type DashboardKpiCardsProps = {
  cards: KpiCard[];
};

function AnimatedValue({ value, format, color }: { value: number; format: "eur" | "int"; color?: string }) {
  const animated = useCountUp(value);
  const display = format === "eur"
    ? animated.toLocaleString("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : Math.round(animated).toLocaleString("it-IT");
  return <span style={{ color }}>{display}</span>;
}

export default function DashboardKpiCards({ cards }: DashboardKpiCardsProps) {
  return (
    <div className="kpi-premium-grid">
      {cards.map((c, i) => (
        <div
          key={i}
          className={`kpi-premium-card${c.accent ? " kpi-accent" : ""}`}
          style={{ borderTop: c.borderTop ? `3px solid ${c.borderTop}` : undefined }}
        >
          <div className="kpi-icon" style={{ background: c.accent ? "rgba(255,255,255,0.12)" : (c.iconBg || "#F3EBDD") }}>
            {c.icon}
          </div>
          <div className="kpi-label">{c.label}</div>
          <div className="kpi-value">
            <AnimatedValue value={c.value} format={c.format} color={c.accent ? undefined : c.valueColor} />
          </div>
          <div className="kpi-sub">{c.subtitle}</div>
        </div>
      ))}
    </div>
  );
}
