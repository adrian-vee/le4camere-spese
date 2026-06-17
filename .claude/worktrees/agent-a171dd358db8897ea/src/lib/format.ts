export const DOC_TYPES = ["Scontrino", "Fattura", "Bolla/DDT", "Ricevuta", "Altro"] as const;
export const PAYMENT_METHODS = ["Carta", "Contanti", "Bonifico", "Altro"] as const;
export const COST_CENTERS = ["Generale", "Camere", "Colazione", "Aree comuni", "Manutenzione"] as const;

export type Category = { id: string; name: string; color: string; sort: number };

export type Expense = {
  id: string;
  amount: number;
  expense_date: string;
  category_id: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  doc_type: string;
  payment_method: string;
  payment_status: "pagato" | "da_pagare";
  due_date: string | null;
  cost_center: string | null;
  notes: string | null;
  document_path: string | null;
  created_by: string | null;
  created_at: string;
  needs_approval?: boolean;
  categories?: { name: string; color: string } | null;
  profiles?: { full_name: string | null } | null;
};

export const eur = (n: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n || 0);

export const fmtDate = (s: string | null) => {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
};

export const monthKey = (s: string) => {
  const d = new Date(s);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export const monthLabel = (k: string) => {
  const [y, m] = k.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("it-IT", { month: "long", year: "numeric" });
};

export const catColor = (cats: Category[], id: string | null) =>
  cats.find((c) => c.id === id)?.color ?? "#9C8E78";

export const isoToday = (): string => new Date().toISOString().slice(0, 10);
