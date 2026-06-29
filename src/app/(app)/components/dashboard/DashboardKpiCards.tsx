"use client";
import { useEffect, useState } from "react";
import useCountUp from "./useCountUp";

type KpiCard = {
  label: string;
  value: number;
  format: "eur" | "int";
  subtitle: string;
  icon: React.ReactNode;
  iconBg?: string;
  valueColor?: string;
  trend?: { pct: number; label: string } | null;
};

type DashboardKpiCardsProps = {
  cards: KpiCard[];
  saldo: {
    value: number;
    entrate: number;
    uscite: number;
    trend: { pct: number; label: string } | null;
  };
};

function AnimatedValue({ value, format, color }: {
  value: number; format: "eur" | "int"; color?: string;
}) {
  const animated = useCountUp(value);
  const display = format === "eur"
    ? animated.toLocaleString("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : Math.round(animated).toLocaleString("it-IT");
  return <span style={{ color }}>{display}</span>;
}

function TrendBadge({ pct, label, onDark }: { pct: number; label: string; onDark?: boolean }) {
  const up = pct > 0;
  const neutral = pct === 0;
  const color = onDark
    ? "#FAF9F5"
    : neutral ? "#6C6B5D" : up ? "#9E3B2E" : "#2d6a4f";
  const bg = onDark
    ? "rgba(255,255,255,0.12)"
    : neutral ? "rgba(108,107,93,0.08)" : up ? "rgba(158,59,46,0.08)" : "rgba(45,106,79,0.08)";
  return (
    <span className="kpi-trend" style={{ color, background: bg }}>
      {!neutral && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          {up ? <><polyline points="23 18 13.5 8.5 8.5 13.5 1 6" /><polyline points="17 18 23 18 23 12" /></>
               : <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></>}
        </svg>
      )}
      {pct > 0 ? "+" : ""}{pct.toFixed(0)}% {label}
    </span>
  );
}

export default function DashboardKpiCards({ cards, saldo }: DashboardKpiCardsProps) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVisible(true), 50); return () => clearTimeout(t); }, []);

  const saldoPositive = saldo.value >= 0;
  const saldoValueColor = saldoPositive ? "#BFA762" : "#E89B94";
  const saldoLabelColor = saldoPositive ? "#BFA762" : "#E89B94";

  return (
    <div className="bento-layout">
      {/* ═══ HERO — Saldo Mese (full width) ═══ */}
      <div className={`bento-hero${visible ? " bento-visible" : ""}`}>
        <div className="bento-hero-pattern" />
        <div className="bento-hero-inner">
          <div className="bento-hero-left">
            <div className="bento-hero-label" style={{ color: saldoLabelColor }}>SALDO MESE</div>
            <div className="bento-hero-value">
              <AnimatedValue value={saldo.value} format="eur" color={saldoValueColor} />
            </div>
            {saldo.trend && <TrendBadge pct={saldo.trend.pct} label={saldo.trend.label} onDark />}
          </div>
          <div className="bento-hero-right">
            <div className="bento-hero-metric">
              <div className="bento-hero-metric-label">Entrate</div>
              <div className="bento-hero-metric-value" style={{ color: "#BFA762" }}>
                {saldo.entrate.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}
              </div>
            </div>
            <div className="bento-hero-metric-divider" />
            <div className="bento-hero-metric">
              <div className="bento-hero-metric-label">Uscite</div>
              <div className="bento-hero-metric-value" style={{ color: "rgba(255,255,255,0.7)" }}>
                {saldo.uscite.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ KPI cards row ═══ */}
      <div className="bento-cards-row">
        {cards.map((c, i) => (
          <div
            key={i}
            className={`bento-card${visible ? " bento-visible" : ""}`}
            style={{ transitionDelay: `${(i + 1) * 60}ms` }}
          >
            <div className="bento-card-top">
              <div className="bento-icon" style={{
                background: c.iconBg || "linear-gradient(135deg, #F3EBDD 0%, #EDE0C8 100%)",
              }}>
                {c.icon}
              </div>
              <div className="bento-card-label">{c.label}</div>
            </div>
            <div className="bento-card-value">
              <AnimatedValue value={c.value} format={c.format} color={c.valueColor} />
            </div>
            <div className="bento-card-sub">{c.subtitle}</div>
            {c.trend && <TrendBadge pct={c.trend.pct} label={c.trend.label} />}
          </div>
        ))}
      </div>
    </div>
  );
}
