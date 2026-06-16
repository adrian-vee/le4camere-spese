import { eur } from "@/lib/format";

type StaffSummaryRow = {
  name: string;
  type: string;
  hours: number;
  cost: number | null;
};

type DashboardStaffTableProps = {
  staffSummary: StaffSummaryRow[];
  totalOnCallCost: number;
  monthLabel: string;
};

export default function DashboardStaffTable({ staffSummary, totalOnCallCost, monthLabel }: DashboardStaffTableProps) {
  return (
    <div className="section">
      <div className="section-head">
        <h2>Riepilogo personale</h2>
        <span className="muted">{monthLabel}</span>
      </div>
      <div className="section-body" style={{ padding: 0 }}>
        {staffSummary.length === 0 ? (
          <div style={{ padding: "32px 22px", textAlign: "center" }}>
            <p className="muted">Nessun turno registrato questo mese.</p>
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Tipo</th>
                <th style={{ textAlign: "right" }}>Ore</th>
                <th style={{ textAlign: "right" }}>Costo</th>
              </tr>
            </thead>
            <tbody>
              {staffSummary.map(s => (
                <tr key={s.name}>
                  <td><strong>{s.name}</strong></td>
                  <td><span className="tag">{s.type === "a_chiamata" ? "A chiamata" : "Dipendente"}</span></td>
                  <td className="tabular" style={{ textAlign: "right", fontWeight: 600 }}>{s.hours}h</td>
                  <td className="tabular" style={{ textAlign: "right", fontWeight: 600 }}>{s.cost != null ? eur(s.cost) : "—"}</td>
                </tr>
              ))}
              <tr style={{ borderTop: "2px solid var(--line)" }}>
                <td colSpan={3} style={{ textAlign: "right", fontWeight: 700 }}>Totale a chiamata</td>
                <td className="tabular" style={{ textAlign: "right", fontWeight: 700 }}>{eur(totalOnCallCost)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
