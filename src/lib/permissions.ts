/**
 * Single source of truth for role-based page access.
 *
 * Access levels:
 *   "all"       → admin, manager, staff
 *   "manager"   → admin + manager
 *   "admin"     → admin only
 *   "notManager" → admin + staff (manager excluded)
 */

export type Role = "admin" | "manager" | "staff";
type Access = "all" | "manager" | "admin" | "notManager";

interface PageDef {
  access: Access;
  /** If true, also visible to "a chiamata" staff regardless of access level */
  aChiamataOverride?: boolean;
}

const PAGE_ACCESS: Record<string, PageDef> = {
  "/":                   { access: "all" },
  "/cassa":              { access: "all" },
  "/turni":              { access: "all" },
  "/disponibilita":      { access: "manager", aChiamataOverride: true },
  "/magazzino":          { access: "all" },
  "/fornitori":          { access: "manager" },
  "/inventario":         { access: "manager" },
  "/drink-lab":          { access: "all" },
  "/bar":                { access: "all" },
  "/bar-conti-camera":   { access: "manager" },
  "/bar-admin":          { access: "manager" },
  "/bar-storico":        { access: "manager" },
  "/spese":              { access: "admin" },
  "/utenze":             { access: "admin" },
  "/nuova":              { access: "admin" },
  "/personale":          { access: "manager" },
  "/gestione-account":   { access: "admin" },
  "/documenti":          { access: "manager" },
  "/allergeni":          { access: "manager" },
  "/controlli-analisi":  { access: "manager" },
  "/onboarding":         { access: "manager" },
  "/report":             { access: "admin" },
  "/statistiche":        { access: "admin" },
  "/ricavi-camere":      { access: "admin" },
  "/admin/attivita":     { access: "admin" },
  "/admin/panoramica":   { access: "admin" },
  "/admin/sicurezza":    { access: "admin" },
  "/impostazioni":       { access: "notManager" },
  "/impostazioni-sistema": { access: "admin" },
  "/aiuto":              { access: "all" },
  "/privacy":            { access: "all" },
};

/** Check if a role can access a page. */
export function canAccess(role: Role, page: string, isAChiamata = false): boolean {
  const def = PAGE_ACCESS[page];
  if (!def) return true; // unlisted pages are open
  if (def.aChiamataOverride && isAChiamata) return true;
  return checkAccess(role, def.access);
}

function checkAccess(role: Role, access: Access): boolean {
  switch (access) {
    case "all": return true;
    case "manager": return role === "admin" || role === "manager";
    case "admin": return role === "admin";
    case "notManager": return role !== "manager";
  }
}

/** Returns true if access level is admin-only (for search/help filtering). */
export function isAdminOnly(page: string): boolean {
  return PAGE_ACCESS[page]?.access === "admin";
}
