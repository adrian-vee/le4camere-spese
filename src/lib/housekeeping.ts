export type HkStatus = "da_pulire" | "in_corso" | "pulita" | "ispezionata";

export type ChecklistItem = {
  id: string;
  label: string;
  checked: boolean;
};

export const STATUS_COLORS: Record<HkStatus, string> = {
  da_pulire: "#9E3B2E",
  in_corso: "#B68A3E",
  pulita: "#2D5A3D",
  ispezionata: "#1F3326",
};

export const STATUS_LABELS: Record<HkStatus, string> = {
  da_pulire: "Da pulire",
  in_corso: "In corso",
  pulita: "Pulita",
  ispezionata: "Ispezionata",
};

export const CHECKLIST_TEMPLATE: { id: string; label: string }[] = [
  { id: "letto", label: "Letto rifatto" },
  { id: "lenzuola", label: "Lenzuola cambiate" },
  { id: "bagno", label: "Bagno pulito e disinfettato" },
  { id: "asciugamani", label: "Asciugamani nuovi" },
  { id: "pavimento", label: "Pavimento lavato" },
  { id: "polvere", label: "Polvere e superfici" },
  { id: "cestini", label: "Cestini svuotati" },
  { id: "minibar", label: "Minibar controllato" },
  { id: "finestre", label: "Finestre e tende" },
  { id: "luci", label: "Luci / TV / AC funzionanti" },
  { id: "amenities", label: "Amenities bagno rifornite" },
];

export function defaultChecklist(): ChecklistItem[] {
  return CHECKLIST_TEMPLATE.map((t) => ({ ...t, checked: false }));
}
