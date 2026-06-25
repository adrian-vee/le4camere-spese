"use client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts";

type MonthData = {
  label: string;
  entrate: number;
  uscite: number;
};

type Props = {
  data: MonthData[];
  avgMargin: number;
};

function eurFmt(v: number) {
  return v.toLocaleString("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string; color: string }[]; label?: string }) {
  if (!active || !payload) return null;
  return (
    <div style={{
      background: "#fff", border: "1px solid #D8CCB8", borderRadius: 10, padding: "12px 16px",
      boxShadow: "0 4px 16px rgba(31,51,38,0.10)", fontSize: 13,
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
  return (
    <div className="section revenue-chart-section">
      <div className="section-head">
        <h2>Entrate vs Uscite</h2>
        <span className="muted">Ultimi 6 mesi</span>
      </div>
      <div className="section-body" style={{ paddingBottom: 8 }}>
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer>
            <BarChart data={data} barGap={4} barCategoryGap="25%">
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E0D0" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: "#6C6B5D", fontSize: 13, fontFamily: "'Albert Sans', sans-serif" }}
                axisLine={{ stroke: "#D8CCB8" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#6C6B5D", fontSize: 12, fontFamily: "'Albert Sans', sans-serif" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                width={45}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(31,51,38,0.04)" }} />
              <Legend
                iconType="square"
                iconSize={10}
                wrapperStyle={{ fontSize: 13, fontFamily: "'Albert Sans', sans-serif", paddingTop: 8 }}
              />
              <Bar dataKey="entrate" name="Entrate" fill="#BFA762" radius={[4, 4, 0, 0]} />
              <Bar dataKey="uscite" name="Uscite" fill="#1F3326" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{
          marginTop: 12, paddingTop: 12, borderTop: "1px solid #E8E0D0",
          display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#6C6B5D",
        }}>
          <span style={{ fontWeight: 600 }}>Margine medio mensile:</span>
          <span style={{
            fontWeight: 700, fontSize: 15,
            fontFamily: "'Fraunces', serif",
            color: avgMargin >= 0 ? "#2d6a4f" : "#C4453C",
          }}>
            {eurFmt(avgMargin)}
          </span>
        </div>
      </div>
    </div>
  );
}
