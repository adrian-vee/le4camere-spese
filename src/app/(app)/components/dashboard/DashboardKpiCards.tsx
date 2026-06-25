"use client";
import { useEffect, useRef, useState } from "react";
import useCountUp from "./useCountUp";

type KpiCard = {
  label: string;
  value: number;
  format: "eur" | "int";
  subtitle: string;
  icon: React.ReactNode;
  iconBg?: string;
  borderTop?: string;
  accent?: boolean;
  valueColor?: string;
  sparkline?: number[];
  trend?: { pct: number; label: string } | null;
};

type DashboardKpiCardsProps = {
  cards: KpiCard[];
  saldo: {
    value: number;
    entrate: number;
    uscite: number;
    sparkline: number[];
    trend: { pct: number; label: string } | null;
  };
};

/* ── Sparkline SVG ── */
function Sparkline({ data, color = "rgba(191,167,98,0.5)", width = 120, height = 32, strokeW = 1.5, animate = true }: {
  data: number[]; color?: string; width?: number; height?: number; strokeW?: number; animate?: boolean;
}) {
  const ref = useRef<SVGPathElement>(null);
  const [drawn, setDrawn] = useState(!animate);
  useEffect(() => {
    if (!animate || !ref.current) return;
    const path = ref.current;
    const len = path.getTotalLength();
    path.style.strokeDasharray = `${len}`;
    path.style.strokeDashoffset = `${len}`;
    // trigger reflow
    path.getBoundingClientRect();
    path.style.transition = "stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1)";
    path.style.strokeDashoffset = "0";
    const t = setTimeout(() => setDrawn(true), 1300);
    return () => clearTimeout(t);
  }, [animate]);

  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const pad = 2;
  const pts = data.map((v, i) => ({
    x: pad + (i / (data.length - 1)) * (width - pad * 2),
    y: pad + (1 - (v - min) / range) * (height - pad * 2),
  }));
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  // area fill path
  const areaD = d + ` L${pts[pts.length - 1].x.toFixed(1)},${height} L${pts[0].x.toFixed(1)},${height} Z`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block", overflow: "visible" }}>
      {drawn && <path d={areaD} fill={color.replace(/[\d.]+\)$/, "0.08)")} />}
      <path ref={ref} d={d} fill="none" stroke={color} strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round" />
      {drawn && (
        <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={2.5} fill={color} />
      )}
    </svg>
  );
}

/* ── Animated value ── */
function AnimatedValue({ value, format, color, className }: {
  value: number; format: "eur" | "int"; color?: string; className?: string;
}) {
  const animated = useCountUp(value);
  const display = format === "eur"
    ? animated.toLocaleString("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : Math.round(animated).toLocaleString("it-IT");
  return <span className={className} style={{ color }}>{display}</span>;
}

/* ── Trend badge ── */
function TrendBadge({ pct, label }: { pct: number; label: string }) {
  const up = pct > 0;
  const neutral = pct === 0;
  const color = neutral ? "#6C6B5D" : up ? "#9E3B2E" : "#2d6a4f";
  const bg = neutral ? "rgba(108,107,93,0.08)" : up ? "rgba(158,59,46,0.08)" : "rgba(45,106,79,0.08)";
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

/* ── Main component ── */
export default function DashboardKpiCards({ cards, saldo }: DashboardKpiCardsProps) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVisible(true), 50); return () => clearTimeout(t); }, []);

  const saldoPositive = saldo.value >= 0;
  const saldoAccentColor = saldoPositive ? "#BFA762" : "#E89B94";

  return (
    <div className="bento-grid">
      {/* ═══ HERO — Saldo Mese ═══ */}
      <div
        className={`bento-hero${visible ? " bento-visible" : ""}`}
        style={{ transitionDelay: "0ms" }}
      >
        {/* Subtle geometric pattern overlay */}
        <div className="bento-hero-pattern" />
        <div className="bento-hero-content">
          <div className="bento-hero-label" style={{ color: saldoAccentColor }}>SALDO MESE</div>
          <div className="bento-hero-value">
            <AnimatedValue value={saldo.value} format="eur" color={saldoAccentColor} />
          </div>
          <div className="bento-hero-sub">
            <span>{saldo.entrate.toLocaleString("it-IT", { style: "currency", currency: "EUR" })} entrate</span>
            <span className="bento-hero-divider">&minus;</span>
            <span>{saldo.uscite.toLocaleString("it-IT", { style: "currency", currency: "EUR" })} uscite</span>
          </div>
          {saldo.trend && <TrendBadge pct={saldo.trend.pct} label={saldo.trend.label} />}
        </div>
        <div className="bento-hero-sparkline">
          <Sparkline data={saldo.sparkline} color={saldoAccentColor} width={160} height={48} strokeW={2} />
        </div>
      </div>

      {/* ═══ Regular KPI cards ═══ */}
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
          <div className="bento-card-bottom">
            <div className="bento-card-sub">{c.subtitle}</div>
            {c.sparkline && c.sparkline.length > 1 && (
              <Sparkline data={c.sparkline} color={c.borderTop || "#BFA762"} width={80} height={24} strokeW={1.5} />
            )}
          </div>
          {c.trend && <TrendBadge pct={c.trend.pct} label={c.trend.label} />}
        </div>
      ))}
    </div>
  );
}
