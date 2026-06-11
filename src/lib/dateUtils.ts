/**
 * Utility centralizzate per formattazione date in italiano.
 * Tutte le funzioni usano locale 'it-IT' e formato 24h.
 */

/** DD/MM/YYYY */
export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date.includes("T") ? date : date + "T00:00:00") : date;
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** HH:MM (24h) */
export function formatTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** DD/MM/YYYY, HH:MM */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

/** "giugno 2026" */
export function formatMonthYear(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date.includes("T") ? date : date + "T00:00:00") : date;
  return d.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
}

/** "11 giugno 2026" */
export function formatDayMonthYear(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date.includes("T") ? date : date + "T00:00:00") : date;
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
}

/** "mer 11/06" */
export function formatShortDay(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date.includes("T") ? date : date + "T00:00:00") : date;
  return d.toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "2-digit" });
}

/** EUR con virgola: "1,50 €" */
export function formatEur(n: number): string {
  return n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
}
