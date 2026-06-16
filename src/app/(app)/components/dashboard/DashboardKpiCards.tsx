import { eur } from "@/lib/format";

type DashboardKpiCardsProps = {
  sumMonth: number;
  deltaPct: number | null;
  monthLabel: string;
  sumYear: number;
  yearExpCount: number;
  curY: string;
  sumToPay: number;
  toPayCount: number;
  overdueCount: number;
  totalOnCallCost: number;
  monthShortLabel: string;
  totalExpenses: number;
};

export default function DashboardKpiCards({
  sumMonth, deltaPct, monthLabel, sumYear, yearExpCount, curY,
  sumToPay, toPayCount, overdueCount, totalOnCallCost, monthShortLabel, totalExpenses,
}: DashboardKpiCardsProps) {
  return (
    <div className="cards kpi-scroll">
      <div className="card accent">
        <div className="label">Spese mese corrente</div>
        <div className="value tabular">{eur(sumMonth)}</div>
        <div className="meta">
          {monthLabel}
          {deltaPct !== null && (
            <span className={`kpi-delta ${deltaPct > 0 ? "up" : "down"}`}>
              {deltaPct > 0 ? "+" : ""}{deltaPct}%
            </span>
          )}
        </div>
      </div>
      <div className="card">
        <div className="label">Totale anno {curY}</div>
        <div className="value tabular">{eur(sumYear)}</div>
        <div className="meta">{yearExpCount} registrazioni</div>
      </div>
      <div className="card">
        <div className="label">Da pagare</div>
        <div className="value tabular" style={{ color: overdueCount > 0 ? "var(--danger)" : sumToPay > 0 ? "var(--danger)" : undefined }}>
          {eur(sumToPay)}
        </div>
        <div className="meta">
          {toPayCount} in sospeso
          {overdueCount > 0 && <span style={{ color: "var(--danger)", fontWeight: 700 }}> &middot; {overdueCount} scadute</span>}
        </div>
      </div>
      <div className="card">
        <div className="label">Costo personale</div>
        <div className="value tabular">{eur(totalOnCallCost)}</div>
        <div className="meta">a chiamata &middot; {monthShortLabel}</div>
      </div>
      <div className="card">
        <div className="label">Totale registrato</div>
        <div className="value tabular">{totalExpenses}</div>
        <div className="meta">spese in archivio</div>
      </div>
    </div>
  );
}
