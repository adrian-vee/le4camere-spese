"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { BAR_RECIPES } from "@/lib/barRecipes";

interface QuickButton {
  label: string;
  amount: number;
  category: string;
  type: "entrata" | "uscita";
  description: string;
  recipeId?: string;
}

const ENTRATA_CATS = [
  { value: "camera", label: "Camera" },
  { value: "bar_bevande", label: "Bar / Bevande" },
  { value: "colazione", label: "Colazione" },
  { value: "minibar", label: "Minibar" },
  { value: "extra_servizi", label: "Extra / Servizi" },
  { value: "altro_entrata", label: "Altro" },
];

const USCITA_CATS = [
  { value: "fondo_cassa_dato", label: "Fondo cassa dato" },
  { value: "spesa_piccola", label: "Spesa piccola" },
  { value: "fornitore_contanti", label: "Fornitore pagato contanti" },
  { value: "altro_uscita", label: "Altro" },
];

const ALL_CATS = [
  ...ENTRATA_CATS, ...USCITA_CATS,
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

export interface AddQuickButtonModalProps {
  isOpen: boolean;
  onClose: () => void;
  quickButtons: QuickButton[];
  onSave: (buttons: QuickButton[]) => void;
  showToast: (msg: string, type?: "ok" | "warn" | "error") => void;
}

export function AddQuickButtonModal({
  isOpen,
  onClose,
  quickButtons,
  onSave,
  showToast,
}: AddQuickButtonModalProps) {
  const [newQuick, setNewQuick] = useState<QuickButton>({
    label: "", amount: 0, category: "bar_bevande", type: "entrata", description: "",
  });

  function handleAdd() {
    if (!newQuick.label.trim() || newQuick.amount <= 0) {
      showToast("Compila etichetta e importo.", "warn");
      return;
    }
    onSave([...quickButtons, { ...newQuick, label: newQuick.label.trim(), description: newQuick.description.trim() }]);
    setNewQuick({ label: "", amount: 0, category: "bar_bevande", type: "entrata", description: "" });
    onClose();
    showToast("Bottone rapido aggiunto");
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nuovo bottone rapido" maxWidth={440}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Etichetta</label>
          <input value={newQuick.label} onChange={e => setNewQuick({ ...newQuick, label: e.target.value })} placeholder="Es. Caffe" />
        </div>
        <div className="grid2">
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Importo (EUR)</label>
            <input type="number" min="0.01" step="0.01" value={newQuick.amount || ""} onChange={e => setNewQuick({ ...newQuick, amount: Number(e.target.value) })} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Tipo</label>
            <select value={newQuick.type} onChange={e => setNewQuick({ ...newQuick, type: e.target.value as "entrata" | "uscita", category: e.target.value === "entrata" ? ENTRATA_CATS[0].value : USCITA_CATS[0].value })}>
              <option value="entrata">Entrata</option>
              <option value="uscita">Uscita</option>
            </select>
          </div>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Categoria</label>
          <select value={newQuick.category} onChange={e => setNewQuick({ ...newQuick, category: e.target.value })}>
            {(newQuick.type === "entrata" ? ENTRATA_CATS : USCITA_CATS).map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Descrizione auto</label>
          <input value={newQuick.description} onChange={e => setNewQuick({ ...newQuick, description: e.target.value })} placeholder="Es. Caffe" />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Ricetta collegata <span className="muted" style={{ fontWeight: 400 }}>(opzionale — scarico automatico magazzino)</span></label>
          <select value={newQuick.recipeId ?? ""} onChange={e => setNewQuick({ ...newQuick, recipeId: e.target.value || undefined })}>
            <option value="">Nessuna</option>
            {BAR_RECIPES.map(r => <option key={r.id} value={r.id}>{r.emoji} {r.name} — &euro;{r.price ?? "?"}</option>)}
          </select>
        </div>
        <button className="btn btn-primary" style={{ marginTop: 4 }} onClick={handleAdd}>Aggiungi</button>
      </div>
      {/* Existing quick buttons with remove */}
      {quickButtons.length > 0 && (
        <div style={{ paddingTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-soft)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Bottoni esistenti</div>
          {quickButtons.map((qb, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #F3EBDD", fontSize: 13 }}>
              <span>{qb.label} — {qb.amount.toLocaleString("it-IT", { minimumFractionDigits: 2 })} &euro; ({catLabel(qb.category)})</span>
              <button className="btn-ghost" style={{ padding: "2px 6px", color: "#9E3B2E", fontSize: 11 }}
                onClick={() => {
                  onSave(quickButtons.filter((_, idx) => idx !== i));
                  showToast("Bottone rimosso");
                }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
