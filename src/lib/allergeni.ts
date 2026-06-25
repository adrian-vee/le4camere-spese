export type Allergene = {
  slug: string;
  it: string;
  en: string;
  de: string;
  color: string;
};

export const ALLERGENI: Allergene[] = [
  { slug: "glutine", it: "Glutine", en: "Gluten", de: "Gluten", color: "#d97706" },
  { slug: "crostacei", it: "Crostacei", en: "Crustaceans", de: "Krebstiere", color: "#dc2626" },
  { slug: "uova", it: "Uova", en: "Eggs", de: "Eier", color: "#eab308" },
  { slug: "pesce", it: "Pesce", en: "Fish", de: "Fisch", color: "#0ea5e9" },
  { slug: "arachidi", it: "Arachidi", en: "Peanuts", de: "Erdnüsse", color: "#b45309" },
  { slug: "soia", it: "Soia", en: "Soy", de: "Soja", color: "#65a30d" },
  { slug: "latte", it: "Latte", en: "Milk", de: "Milch", color: "#3b82f6" },
  { slug: "frutta_a_guscio", it: "Frutta a guscio", en: "Tree nuts", de: "Schalenfrüchte", color: "#92400e" },
  { slug: "sedano", it: "Sedano", en: "Celery", de: "Sellerie", color: "#16a34a" },
  { slug: "senape", it: "Senape", en: "Mustard", de: "Senf", color: "#ca8a04" },
  { slug: "sesamo", it: "Sesamo", en: "Sesame", de: "Sesam", color: "#a16207" },
  { slug: "solfiti", it: "Anidride solforosa e solfiti", en: "Sulphites", de: "Sulfite", color: "#7c3aed" },
  { slug: "lupini", it: "Lupini", en: "Lupin", de: "Lupinen", color: "#facc15" },
  { slug: "molluschi", it: "Molluschi", en: "Molluscs", de: "Weichtiere", color: "#0891b2" },
];

export const ALLERGENE_MAP = new Map(ALLERGENI.map((a) => [a.slug, a]));

export const BREAKFAST_CATEGORIES = [
  { value: "dolce", label: "Dolce", labelEn: "Sweet", labelDe: "Süß" },
  { value: "salato", label: "Salato", labelEn: "Savory", labelDe: "Herzhaft" },
  { value: "bevanda", label: "Bevanda", labelEn: "Beverage", labelDe: "Getränk" },
  { value: "frutta", label: "Frutta", labelEn: "Fruit", labelDe: "Obst" },
  { value: "panificati", label: "Panificati", labelEn: "Bakery", labelDe: "Backwaren" },
  { value: "altro", label: "Altro", labelEn: "Other", labelDe: "Andere" },
];

export function getAllergeneSvgPath(slug: string): string {
  switch (slug) {
    case "glutine":
      return "M12 2c-1 4-3 6-3 10s1.5 6 3 10M12 2c1 4 3 6 3 10s-1.5 6-3 10M8 8l8 4M8 16l8-4";
    case "crostacei":
      return "M12 21c-4 0-7-3-7-7 0-2 1-4 3-5l2-3h4l2 3c2 1 3 3 3 5 0 4-3 7-7 7zM9 14v3M15 14v3M12 6V3";
    case "uova":
      return "M12 3C8.5 3 5 8.5 5 13a7 7 0 0014 0c0-4.5-3.5-10-7-10z";
    case "pesce":
      return "M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7zM22 12l-3 3M22 12l-3-3M12 9v6";
    case "arachidi":
      return "M12 4c-2 0-4 2-4 4.5S10 13 12 13s4-2.5 4-4.5S14 4 12 4zM12 13c-2 0-4 2-4 4.5S10 22 12 22s4-2.5 4-4.5S14 13 12 13z";
    case "soia":
      return "M12 3c-3 0-5 3-5 6s2 5 5 7c3-2 5-4 5-7s-2-6-5-6zM8 18c0 2 1.8 3 4 3s4-1 4-3";
    case "latte":
      return "M8 2h8l1 5H7l1-5zM7 7h10v12a3 3 0 01-3 3h-4a3 3 0 01-3-3V7zM10 11v5M14 11v5";
    case "frutta_a_guscio":
      return "M12 4C9 4 6 7 6 11c0 5 6 10 6 10s6-5 6-10c0-4-3-7-6-7zM12 4V2M10 8a2 2 0 014 0";
    case "sedano":
      return "M12 22V8M12 8c-2-3-5-5-5-5M12 8c2-3 5-5 5-5M8 14c-2 0-4-1-4-1M16 14c2 0 4-1 4-1M9 18c-1 1-3 1-3 1M15 18c1 1 3 1 3 1";
    case "senape":
      return "M12 3l-2 7h4l-2 7M7 14c0 4 2.2 7 5 7s5-3 5-7M6 10h12";
    case "sesamo":
      return "M12 5a2 2 0 100-4 2 2 0 000 4zM7 11a2 2 0 100-4 2 2 0 000 4zM17 11a2 2 0 100-4 2 2 0 000 4zM9 18a2 2 0 100-4 2 2 0 000 4zM15 18a2 2 0 100-4 2 2 0 000 4zM12 23a2 2 0 100-4 2 2 0 000 4z";
    case "solfiti":
      return "M12 12m-3 0a3 3 0 106 0 3 3 0 10-6 0M12 9V5M12 15v4M15 12h4M9 12H5M14.1 9.9l2.8-2.8M9.9 14.1l-2.8 2.8M14.1 14.1l2.8 2.8M9.9 9.9L7.1 7.1";
    case "lupini":
      return "M12 3c-1.5 2-2 5-2 8s.5 6 2 8c1.5-2 2-5 2-8s-.5-6-2-8zM6 7c1 1.5 3 2.5 6 3M18 7c-1 1.5-3 2.5-6 3M6 17c1-1.5 3-2.5 6-3M18 17c-1-1.5-3-2.5-6-3";
    case "molluschi":
      return "M12 21c-5 0-8-4-8-8 0-3 1.5-5 4-6.5C10.5 5 12 3 12 3s1.5 2 4 3.5C18.5 8 20 10 20 13c0 4-3 8-8 8zM9 13c0 1.5 1.3 3 3 3s3-1.5 3-3";
    default:
      return "M15 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7z";
  }
}
