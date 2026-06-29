"use client";
import { useRef, useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";

type MonthData = { label: string; revenue: number };

function eurFmt(v: number) {
  return v.toLocaleString("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.[0]) return null;
  return (
    <div style={{
      background: "#fff", border: "1px solid #D8CCB8", borderRadius: 10, padding: "10px 14px",
      boxShadow: "0 4px 16px rgba(31,51,38,0.10)", fontSize: 13, fontFamily: "'Albert Sans', sans-serif",
    }}>
      <div style={{ fontWeight: 700, color: "#1F3326", marginBottom: 4 }}>{label}</div>
      <div style={{ color: "#BFA762", fontWeight: 700 }}>{eurFmt(payload[0].value)}</div>
    </div>
  );
}

export default function RoomRevenueChart({ data }: { data: MonthData[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => { const w = el.clientWidth; if (w > 0) setChartWidth(w); };
    measure();
    const raf = requestAnimationFrame(measure);
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  const chartHeight = 280;
  const isMobile = chartWidth > 0 && chartWidth < 500;

  return (
    <div ref={containerRef} style={{ width: "100%", minHeight: chartHeight }}>
      {chartWidth > 0 && (
        <BarChart
          width={chartWidth}
          height={chartHeight}
          data={data}
          margin={{ top: 8, right: isMobile ? 8 : 16, left: isMobile ? -10 : 4, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#D8CCB8" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "#6C6B5D", fontSize: isMobile ? 10 : 13, fontFamily: "'Albert Sans', sans-serif" }}
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
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(191,167,98,0.08)" }} />
          <Bar dataKey="revenue" fill="#BFA762" radius={[4, 4, 0, 0]} maxBarSize={40} />
        </BarChart>
      )}
    </div>
  );
}
