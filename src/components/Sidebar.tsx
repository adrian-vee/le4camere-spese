"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ICONS } from "@/components/ui/NavIcons";

type UserRole = "admin" | "manager" | "staff";

type NavItem = { href: string; label: string; icon: React.ReactNode; badge?: number; dot?: boolean };

const groupLabelStyle: React.CSSProperties = {
  fontFamily: "'Albert Sans', sans-serif",
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 2,
  color: "rgba(255,255,255,0.4)",
  padding: "16px 16px 4px",
};

export default function Sidebar({ userName, lowStockCount = 0, pendingFolioCount = 0, userRole = "staff", isAChiamata = false, availabilityPending = false }: {
  userName: string; lowStockCount?: number; pendingFolioCount?: number; userRole?: UserRole; isAChiamata?: boolean; availabilityPending?: boolean;
}) {
  const path = usePathname();
  const is = (p: string) => (p === "/" ? path === "/" : path.startsWith(p));
  const isManager = userRole === "admin" || userRole === "manager";

  const operativo: NavItem[] = [
    { href: "/", label: "Panoramica", icon: ICONS.home },
    { href: "/cassa", label: "Cassa", icon: ICONS.wallet },
    { href: "/turni", label: "Turni", icon: ICONS.calendarDays },
    ...((isAChiamata || isManager) ? [{ href: "/disponibilita", label: "Disponibilità", icon: ICONS.calendarCheck, dot: availabilityPending }] : []),
  ];

  const magazzino: NavItem[] = [
    { href: "/magazzino", label: "Magazzino", icon: ICONS.pkg, badge: isManager ? lowStockCount : 0 },
    ...(isManager ? [
      { href: "/fornitori", label: "Fornitori", icon: ICONS.truck },
      { href: "/inventario", label: "Inventario", icon: ICONS.clipboardList },
    ] : []),
  ];

  const bar: NavItem[] = [
    { href: "/bar", label: "POS Bar", icon: ICONS.cocktail },
    ...(isManager ? [
      { href: "/bar-conti-camera", label: "Conti Camera", icon: ICONS.bed, badge: pendingFolioCount },
      { href: "/bar-admin", label: "Prodotti Bar", icon: ICONS.settings },
      { href: "/bar-storico", label: "Storico Vendite", icon: ICONS.fileBarChart },
    ] : []),
  ];

  const contabilita: NavItem[] = isManager ? [
    { href: "/spese", label: "Spese", icon: ICONS.receipt },
    { href: "/utenze", label: "Utenze", icon: ICONS.zap },
  ] : [];

  const gestione: NavItem[] = [
    ...(isManager ? [{ href: "/personale", label: "Personale", icon: ICONS.users }] : []),
    ...(userRole === "admin" ? [{ href: "/gestione-account", label: "Gestione account", icon: ICONS.userCog }] : []),
    ...(isManager ? [{ href: "/documenti", label: "Documenti", icon: ICONS.folderOpen }] : []),
  ];

  const analisi: NavItem[] = isManager ? [
    { href: "/report", label: "Report", icon: ICONS.fileBarChart },
    { href: "/statistiche", label: "Statistiche", icon: ICONS.barChart3 },
    ...(userRole === "admin" ? [
      { href: "/admin/attivita", label: "Attività", icon: ICONS.activity },
      { href: "/admin/panoramica", label: "Panoramica admin", icon: ICONS.layoutDashboard },
      { href: "/admin/sicurezza", label: "Sicurezza", icon: ICONS.shield },
    ] : []),
  ] : [];

  const footer: NavItem[] = [
    { href: "/aiuto", label: "Aiuto", icon: ICONS.helpCircle },
    ...(isManager ? [{ href: "/impostazioni-sistema", label: "Impostazioni", icon: ICONS.settings }] : []),
    { href: "/privacy", label: "Privacy e dati", icon: ICONS.lock },
  ];

  function renderLink(l: NavItem) {
    return (
      <Link key={l.href} href={l.href} className={`sidebar-link${is(l.href) ? " active" : ""}`}>
        {l.icon}
        {l.label}
        {!!l.badge && l.badge > 0 && (
          <span className="sidebar-badge">{l.badge}</span>
        )}
        {l.dot && !l.badge && (
          <span className="sidebar-dot" />
        )}
      </Link>
    );
  }

  function renderGroup(title: string, items: NavItem[]) {
    if (items.length === 0) return null;
    return (
      <>
        <div style={groupLabelStyle}>{title}</div>
        {items.map(renderLink)}
      </>
    );
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <Image src="/le4camere-logo-bianco.svg" alt="Le 4 Camere" width={160} height={40} style={{ width: 160, height: "auto", margin: "0 auto" }} />
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 13, letterSpacing: 3, color: "rgba(250,249,245,0.6)", marginTop: 6, textAlign: "center" }}>GESTIONALE ALBERGHIERO</div>
      </div>

      <nav className="sidebar-nav">
        {renderGroup("OPERATIVO", operativo)}
        {renderGroup("MAGAZZINO", magazzino)}

        {/* Drink Lab — standalone card */}
        <div className="sidebar-drinklab">
          <Link href="/drink-lab" className={`sidebar-link sidebar-drinklab-link${is("/drink-lab") ? " active" : ""}`}>
            {ICONS.wine}
            Drink Lab
          </Link>
        </div>

        {renderGroup("BAR", bar)}
        {contabilita.length > 0 && renderGroup("CONTABILITÀ", contabilita)}
        {gestione.length > 0 && renderGroup("GESTIONE", gestione)}
        {analisi.length > 0 && renderGroup("ANALISI", analisi)}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-footer-sep" />
        {footer.map(renderLink)}

        <div className="sidebar-footer-sep" />
        <div className="sidebar-userbox">
          <div style={{ flex: 1, minWidth: 0 }}>
            <Link href="/impostazioni" style={{ textDecoration: "none", color: "#FAF9F5", fontFamily: "'Albert Sans', sans-serif", fontSize: 14, fontWeight: 700 }}>
              {userName}
            </Link>
            <div style={{ fontSize: 12, fontFamily: "'Albert Sans', sans-serif", color: "#BFA762", marginTop: 2, textTransform: "capitalize" }}>
              {userRole}
            </div>
          </div>
          <form action="/auth/signout" method="post" style={{ margin: 0 }}>
            <button type="submit" className="sidebar-logout-btn" title="Esci">
              {ICONS.logout}
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
