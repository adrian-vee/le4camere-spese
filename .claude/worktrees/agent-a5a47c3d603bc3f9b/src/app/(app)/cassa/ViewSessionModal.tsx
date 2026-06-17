"use client";

import { Modal } from "@/components/ui/Modal";
import { eur, fmtDate } from "@/lib/format";

interface CashSession {
  id: string;
  opened_at: string;
  closed_at: string | null;
  opened_by: string;
  closed_by: string | null;
  opening_amount: number;
  expected_amount: number | null;
  actual_amount: number | null;
  difference: number | null;
  notes: string | null;
  status: "open" | "closed";
  shift_date: string | null;
  shift_type: string | null;
}

interface CashMovement {
  id: string;
  session_id: string;
  created_at: string;
  created_by: string;
  type: "entrata" | "uscita";
  amount: number;
  category: string;
  description: string | null;
  receipt_url: string | null;
}

const ALL_CATS = [
  { value: "camera", label: "Camera" },
  { value: "bar_bevande", label: "Bar / Bevande" },
  { value: "colazione", label: "Colazione" },
  { value: "minibar", label: "Minibar" },
  { value: "extra_servizi", label: "Extra / Servizi" },
  { value: "altro_entrata", label: "Altro" },
  { value: "fondo_cassa_dato", label: "Fondo cassa dato" },
  { value: "spesa_piccola", label: "Spesa piccola" },
  { value: "fornitore_contanti", label: "Fornitore pagato contanti" },
  { value: "altro_uscita", label: "Altro" },
  { value: "vendita", label: "Vendita" },
  { value: "servizio", label: "Servizio" },
  { value: "pagamento_fornitore", label: "Pagamento fornitore" },
  { value: "prelievo", label: "Prelievo" },
  { value: "deposito", label: "Deposito" },
  { value: "altro", label: "Altro" },
];

function catLabel(val: string) {
  return ALL_CATS.find(c => c.value === val)?.label ?? val;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export interface ViewSessionModalProps {
  session: CashSession | null;
  onClose: () => void;
  movements: CashMovement[];
  profiles: Record<string, string>;
  fondoCassa: number;
  isStaff: boolean;
}

export function ViewSessionModal({
  session,
  onClose,
  movements,
  profiles,
  fondoCassa,
  isStaff,
}: ViewSessionModalProps) {
  if (!session) return null;

  const title = `Sessione del ${fmtDate(session.opened_at)}${session.shift_type ? ` — ${session.shift_type}` : ""}`;

  const vOpenAmount = Number(session.opening_amount);
  const vRiporto = vOpenAmount - fondoCassa;
  const vIncassi = movements.filter(m => m.type === "entrata").reduce((s, m) => s + Number(m.amount), 0);
  const vUscite = movements.filter(m => m.type === "uscita").reduce((s, m) => s + Number(m.amount), 0);
  const vConsegnato = movements.filter(m => m.category === "fondo_cassa_dato").reduce((s, m) => s + Number(m.amount), 0);
  const vInCassa = vOpenAmount + vIncassi - vUscite;
  const vDiff = session.actual_amount != null ? Number(session.actual_amount) - vInCassa : null;
  const vDiffColor = vDiff === null ? undefined : Math.abs(vDiff) < 0.01 ? "#2D5A3D" : vDiff < 0 ? "#9E3B2E" : "#C77B4A";

  return (
    <Modal isOpen={!isStaff && !!session} onClose={onClose} title={title} maxWidth={640}>
      <div style={{ maxHeight: "70vh", overflowY: "auto" }}>
        <div style={{ marginBottom: 16, padding: 16, background: "#F3EBDD", borderRadius: 10, fontSize: 13 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span>Aperta da</span><strong>{profiles[session.opened_by] || "?"}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span>Orario apertura</span><strong>{fmtDateTime(session.opened_at)}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span>Chiusa da</span><strong>{session.closed_by ? (profiles[session.closed_by] || "?") : "—"}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span>Orario chiusura</span><strong>{session.closed_at ? fmtDateTime(session.closed_at) : "—"}</strong>
          </div>
          <div style={{ borderTop: "1px solid #D8CCB8", paddingTop: 8, marginTop: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span>Fondo fisso</span><strong>{eur(fondoCassa)}</strong>
            </div>
            {vRiporto > 0.01 && (
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, color: "#C77B4A" }}>
                <span>Riporto turno prec.</span><strong>+{eur(vRiporto)}</strong>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, color: "#2D5A3D" }}>
              <span>Incassi turno</span><strong>+{eur(vIncassi)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, color: "#9E3B2E" }}>
              <span>Uscite turno</span><strong>-{eur(vUscite)}</strong>
            </div>
            {vConsegnato > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, color: "#4F7B8C" }}>
                <span>Consegnato</span><strong>{eur(vConsegnato)}</strong>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span>In cassa calcolato</span><strong>{eur(vInCassa)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span>Effettivo</span><strong>{session.actual_amount != null ? eur(Number(session.actual_amount)) : "—"}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #D8CCB8", paddingTop: 6, fontSize: 14 }}>
              <strong>Differenza</strong>
              <strong style={{ color: vDiffColor }}>
                {vDiff === null ? "—" : `${vDiff >= 0 ? "+" : ""}${eur(vDiff)}`}
              </strong>
            </div>
          </div>
          {session.notes && (
            <div style={{ marginTop: 8, color: "#6C6B5D", fontStyle: "italic" }}>Note: {session.notes}</div>
          )}
        </div>

        {movements.length === 0 ? (
          <div className="empty" style={{ padding: 20 }}>Nessun movimento in questa sessione.</div>
        ) : (
          <>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: "#1F3326" }}>
              Movimenti ({movements.length})
            </div>
            <div style={{ border: "1px solid #D8CCB8", borderRadius: 8, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#F3EBDD" }}>
                    <th style={{ padding: "8px", textAlign: "left" }}>Ora</th>
                    <th style={{ padding: "8px", textAlign: "left" }}>Tipo</th>
                    <th style={{ padding: "8px", textAlign: "left" }}>Categoria</th>
                    <th style={{ padding: "8px", textAlign: "left" }}>Descrizione</th>
                    <th style={{ padding: "8px", textAlign: "left" }}>Operatore</th>
                    <th style={{ padding: "8px", textAlign: "right" }}>Importo</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m, i) => (
                    <tr key={m.id} style={{ borderBottom: i < movements.length - 1 ? "1px solid #F3EBDD" : undefined }}>
                      <td style={{ padding: "6px 8px" }}>{fmtTime(m.created_at)}</td>
                      <td style={{ padding: "6px 8px" }}>
                        <span style={{
                          padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 700,
                          background: m.type === "entrata" ? "#E3EEE4" : "#F5E6E4",
                          color: m.type === "entrata" ? "#2D5A3D" : "#9E3B2E",
                        }}>
                          {m.type === "entrata" ? "Entrata" : "Uscita"}
                        </span>
                      </td>
                      <td style={{ padding: "6px 8px" }}>{catLabel(m.category)}</td>
                      <td style={{ padding: "6px 8px", color: "#6C6B5D" }}>{m.description || "—"}</td>
                      <td style={{ padding: "6px 8px", color: "#6C6B5D" }}>{profiles[m.created_by] || "?"}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, color: m.type === "entrata" ? "#2D5A3D" : "#9E3B2E" }}>
                        {m.type === "entrata" ? "+" : "-"}{eur(Number(m.amount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 12, padding: 12, background: "#F3EBDD", borderRadius: 8, fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, color: "#2D5A3D" }}>
                <span>Subtotale entrate</span>
                <strong>+{eur(vIncassi)}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", color: "#9E3B2E" }}>
                <span>Subtotale uscite</span>
                <strong>-{eur(vUscite)}</strong>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
