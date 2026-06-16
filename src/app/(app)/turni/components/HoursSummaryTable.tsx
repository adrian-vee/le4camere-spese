"use client";

import { eur } from "@/lib/format";

type StaffItem = { id: string; name: string; type: string; hours_per_week: number };

type HoursSummaryTableProps = {
  staff: StaffItem[];
  monthHoursMap: Record<string, number>;
  weekHoursMap: Record<string, number>;
  hourlyRate: number;
  monthDates: string[];
  view: "month" | "week";
  weekLabel: string;
  monthLabel: string;
  totalWeekCost: number;
  totalMonthCost: number;
};

export default function HoursSummaryTable({
  staff, monthHoursMap, weekHoursMap, hourlyRate, monthDates,
  view, weekLabel, monthLabel, totalWeekCost, totalMonthCost,
}: HoursSummaryTableProps) {
  return (
    <div className="section">
      <div className="section-head">
        <h2>Riepilogo ore e costi</h2>
        <span className="muted">{view === "week" ? `Sett. ${weekLabel}` : monthLabel}</span>
      </div>
      <div className="section-body" style={{ padding: 0, overflowX: "auto" }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Persona</th>
              <th>Tipo</th>
              <th style={{ textAlign: "right" }}>Ore sett.</th>
              <th style={{ textAlign: "right" }}>Ore mese</th>
              <th style={{ textAlign: "right" }}>Contratto</th>
              <th style={{ textAlign: "right" }}>Costo sett.</th>
              <th style={{ textAlign: "right" }}>Costo mese</th>
            </tr>
          </thead>
          <tbody>
            {staff.map(p => {
              const mh = monthHoursMap[p.id] ?? 0;
              const wh = weekHoursMap[p.id] ?? 0;
              const isOnCall = p.type === "a_chiamata";
              const wCost = isOnCall ? wh * hourlyRate : null;
              const mCost = isOnCall ? mh * hourlyRate : null;
              const monthWeeks = monthDates.length / 7;
              const overMonth = p.hours_per_week > 0 && mh > p.hours_per_week * monthWeeks;
              return (
                <tr key={p.id}>
                  <td><strong>{p.name}</strong></td>
                  <td>
                    <span className={`badge ${isOnCall ? "badge-call" : "badge-dip"}`}>
                      {isOnCall ? "A chiamata" : "Dipendente"}
                    </span>
                  </td>
                  <td className="tabular" style={{ textAlign: "right", fontWeight: 600 }}>{wh}h</td>
                  <td className="tabular" style={{ textAlign: "right", fontWeight: 600, color: overMonth ? "var(--danger)" : undefined }}>{mh}h</td>
                  <td className="tabular muted" style={{ textAlign: "right" }}>{p.hours_per_week || "—"}h/sett</td>
                  <td className="tabular" style={{ textAlign: "right", background: isOnCall ? "rgba(191,167,98,.08)" : undefined, fontWeight: isOnCall ? 600 : 400 }}>
                    {wCost != null ? eur(wCost) : "—"}
                  </td>
                  <td className="tabular" style={{ textAlign: "right", background: isOnCall ? "rgba(191,167,98,.08)" : undefined, fontWeight: isOnCall ? 600 : 400 }}>
                    {mCost != null ? eur(mCost) : "—"}
                  </td>
                </tr>
              );
            })}
            <tr style={{ background: "var(--surface-2)" }}>
              <td colSpan={5} style={{ textAlign: "right", fontWeight: 700 }}>Totale a chiamata</td>
              <td className="tabular" style={{ textAlign: "right", fontWeight: 700 }}>{eur(totalWeekCost)}</td>
              <td className="tabular" style={{ textAlign: "right", fontWeight: 700 }}>{eur(totalMonthCost)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
