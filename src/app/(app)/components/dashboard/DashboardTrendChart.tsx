import { eur } from "@/lib/format";

type TrendMonth = { key: string; label: string; total: number };

type DashboardTrendChartProps = {
  months6: TrendMonth[];
  maxTrend: number;
};

export default function DashboardTrendChart({ months6, maxTrend }: DashboardTrendChartProps) {
  return (
    <div className="section">
      <div className="section-head">
        <h2>Trend spese</h2>
        <span className="muted">Ultimi 6 mesi</span>
      </div>
      <div className="section-body">
        <div className="chart">
          {months6.map(m => (
            <div className="bar-row" key={m.key}>
              <div className="cat"><span style={{ fontWeight: 600 }}>{m.label}</span></div>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${(m.total / maxTrend) * 100}%`, background: "var(--accent)" }} />
              </div>
              <div className="amt tabular">{eur(m.total)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
