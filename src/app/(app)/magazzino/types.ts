export type Product = {
  product_id: string; name: string; category: string; unit: string;
  unit_cost: number; vat_rate: number; min_stock: number; supplier_id: string | null;
  supplier_code: string | null;
  notes: string | null; active: boolean; current_stock: number;
  barcode: string | null; expiry_date: string | null;
  tracking_type: "units" | "bottle"; bottle_capacity_ml: number | null; standard_pour_ml: number | null;
};

export type Movement = {
  id: string; product_id: string; type: "in" | "out"; quantity: number;
  notes: string | null; created_by: string | null; created_at: string;
  expiry_date: string | null;
  products?: { name: string } | null;
  profiles?: { full_name: string } | null;
};

export type Supplier = { id: string; name: string };

export type Batch = {
  id: string; product_id: string; quantity_initial: number; quantity_remaining: number;
  expiry_date: string | null; source: string; source_delivery_id: string | null;
  notes: string | null; created_at: string;
  fill_level: number | null; is_open: boolean | null;
};

export const CAT_COLORS: Record<string, string> = {
  Pulizia: "#5C7363", Colazione: "#C77B4A", Biancheria: "#4F7B8C",
  "Bagno/Toiletries": "#7A6A8C", Manutenzione: "#A8552F", Cancelleria: "#B68A3E",
  Bar: "#9E3B2E", Cucina: "#C77B4A", Minibar: "#7A6A8C",
  Bevande: "#4F7B8C", Alcolici: "#8A7355", "Snack/Distributori": "#B68A3E",
  Altro: "#6C6B5D",
};

export const CATEGORIES = Object.keys(CAT_COLORS);
export const UNITS = ["pz", "kg", "litri", "rotoli", "conf", "bottiglie", "pacchi"];
export const VAT_RATES = [22, 10, 4, 0] as const;
export const VAT_LABELS: Record<number, string> = { 22: "22% ordinaria", 10: "10% ridotta", 4: "4% super ridotta", 0: "0% esente" };
export const SCARICO_REASONS = ["Uso camere", "Uso cucina", "Uso bar", "Uso pulizie", "Danneggiato", "Scaduto", "Altro"];

export const catBg = (cat: string) => (CAT_COLORS[cat] ?? "#6C6B5D") + "1A";
export const catFg = (cat: string) => CAT_COLORS[cat] ?? "#6C6B5D";

export const fmtDT = (s: string) => {
  const d = new Date(s);
  return `${d.toLocaleDateString("it-IT")} ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
};
