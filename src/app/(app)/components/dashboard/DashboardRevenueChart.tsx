"use client";
import { useRef, useState, useEffect } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";

type MonthData = {
  label: string;
  entrate: number;
  uscite: number;
};

type Props = {
  data: MonthData[];
  avgMargin: number | null;
};

function eurFmt(v: number) {
  return v.toLocaleString("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string; color: string }[]; label?: string }) {
  if (!active || !payload) return null;
  return (
    <div style={{
      background: "#fff", border: "1px solid #D8CCB8", borderRadius: 10, padding: "12px 16px",
      boxShadow: "0 4px 16px rgba(31,51,38,0.10)", fontSize: 13, fontFamily: "'Albert Sans', sans-serif",
    }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: "#1F3326" }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: p.color, display: "inline-block" }} />
          <span style={{ color: "#6C6B5D" }}>{p.name}:</span>
          <span style={{ fontWeight: 700, color: "#1F3326" }}>{eurFmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function DashboardRevenueChart({ data, avgMargin }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const w = el.clientWidth;
      if (w > 0) setChartWidth(w);
    };

    measure();
    const raf = requestAnimationFrame(measure);

    const ro = new ResizeObserver(() => measure());
    ro.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const chartHeight = 280;
  const isMobile = chartWidth > 0 && chartWidth < 500;

  return (
    <div className="section revenue-chart-section">
      <div className="section-head">
        <h2>Margine operativo</h2>
        <span className="muted">Ultimi 6 mesi</span>
      </div>
      <p style={{ margin: "0 0 8px", fontSize: 12, color: "#9C8E78", fontFamily: "'Albert Sans', sans-serif" }}>
        Entrate = camere + bar · Uscite = spese + personale a chiamata + utenze
      </p>
      <div className="section-body" style={{ paddingBottom: 8 }}>
        <div ref={containerRef} className="revenue-chart-wrap" style={{ width: "100%", minHeight: chartHeight }}>
          {chartWidth > 0 && (
            <AreaChart
              width={chartWidth}
              height={chartHeight}
              data={data}
              margin={{ top: 8, right: isMobile ? 8 : 16, left: isMobile ? -10 : 4, bottom: 4 }}
            >
              <defs>
                <linearGradient id="gradEntrate" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#BFA762" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#BFA762" stopOpacity={0.03} />
                </linearGradient>
                <linearGradient id="gradUscite" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1F3326" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#1F3326" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#D8CCB8" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: "#6C6B5D", fontSize: isMobile ? 11 : 13, fontFamily: "'Albert Sans', sans-serif" }}
                axisLine={{ stroke: "#D8CCB8" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#6C6B5D", fontSize: 12, fontFamily: "'Albert Sans', sans-serif" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                width={isMobile ? 35 : 45}
              />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ stroke: "#D8CCB8", strokeWidth: 1, strokeDasharray: "4 4" }}
              />
              <Legend
                iconType="square"
                iconSize={10}
                wrapperStyle={{ fontSize: 13, fontFamily: "'Albert Sans', sans-serif", paddingTop: 8 }}
              />
              <Area
                type="monotone"
                dataKey="entrate"
                name="Entrate"
                stroke="#BFA762"
                strokeWidth={2.5}
                fill="url(#gradEntrate)"
                dot={{ r: 4, fill: "#BFA762", stroke: "#fff", strokeWidth: 2 }}
                activeDot={{ r: 6, fill: "#BFA762", stroke: "#fff", strokeWidth: 2 }}
              />
              <Area
                type="monotone"
                dataKey="uscite"
                name="Costi operativi"
                stroke="#1F3326"
                strokeWidth={2.5}
                fill="url(#gradUscite)"
                dot={{ r: 4, fill: "#1F3326", stroke: "#fff", strokeWidth: 2 }}
                activeDot={{ r: 6, fill: "#1F3326", stroke: "#fff", strokeWidth: 2 }}
              />
            </AreaChart>
          )}
        </div>
        <div style={{
          marginTop: 12, paddingTop: 12, borderTop: "1px solid #E8E0D0",
          display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#6C6B5D",
        }}>
          <span style={{ fontWeight: 600 }}>Margine operativo medio:</span>
          {avgMargin !== null ? (
            <span style={{
              fontWeight: 700, fontSize: 15,
              fontFamily: "'Fraunces', serif",
              color: avgMargin >= 0 ? "#2d6a4f" : "#C4453C",
            }}>
              {eurFmt(avgMargin)}
            </span>
          ) : (
            <span style={{ fontStyle: "italic", color: "#9C8E78" }}>n/d</span>
          )}
        </div>
      </div>
    </div>
  );
}
