"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { useRole } from "@/lib/useRole";
import { I, ICONS } from "@/components/ui/NavIcons";

type UserRole = "admin" | "manager" | "staff";
type NavItem = { href: string; label: string; icon: React.ReactNode };

const groupLabelStyle: React.CSSProperties = {
  fontFamily: "'Albert Sans', sans-serif",
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 2,
  color: "rgba(255,255,255,0.4)",
  padding: "12px 16px 4px",
};

export default function BottomNav({ isAChiamata = false, userName = "", userRole = "staff" as UserRole }: { isAChiamata?: boolean; userName?: string; userRole?: UserRole }) {
  const path = usePathname();
  const is = (p: string) => (p === "/" ? path === "/" : path.startsWith(p));
  const { role } = useRole();
  const isManager = role === "admin" || role === "manager";
  const isAdmin = role === "admin";
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => { setDrawerOpen(false); }, [path]);

  useEffect(() => {
    if (drawerOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [drawerOpen]);

  // 22px icons for bottom nav tabs
  const iconHome22 = I(<><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></>, 22);
  const iconCassa22 = I(<><path d="M21 12V7H5a2 2 0 010-4h14v4" /><path d="M3 5v14a2 2 0 002 2h16v-5" /><path d="M18 12a2 2 0 100 4 2 2 0 000-4z" /></>, 22);
  const iconTurni22 = I(<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>, 22);
  const iconMagazzino22 = I(<><path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></>, 22);

  /* ── Build drawer groups ── */
  const operativo: NavItem[] = [
    { href: "/", label: "Panoramica", icon: ICONS.home },
    { href: "/cassa", label: "Cassa", icon: ICONS.wallet },
    { href: "/turni", label: "Turni", icon: ICONS.calendarDays },
    ...(isAChiamata || isManager ? [{ href: "/disponibilita", label: "Disponibilità", icon: ICONS.calendarCheck }] : []),
  ];

  const magazzino: NavItem[] = [
    { href: "/magazzino", label: "Magazzino", icon: ICONS.pkg },
    ...(isManager ? [
      { href: "/fornitori", label: "Fornitori", icon: ICONS.truck },
      { href: "/inventario", label: "Inventario", icon: ICONS.clipboardList },
    ] : []),
  ];

  const bar: NavItem[] = [
    { href: "/bar", label: "POS Bar", icon: ICONS.cocktail },
    ...(isManager ? [
      { href: "/bar-conti-camera", label: "Conti Camera", icon: ICONS.bed },
      { href: "/bar-admin", label: "Prodotti Bar", icon: ICONS.settings },
      { href: "/bar-storico", label: "Storico Vendite", icon: ICONS.fileBarChart },
    ] : []),
  ];

  const contabilita: NavItem[] = isAdmin ? [
    { href: "/spese", label: "Spese", icon: ICONS.receipt },
    { href: "/utenze", label: "Utenze", icon: ICONS.zap },
  ] : [];

  const gestione: NavItem[] = [
    ...(isManager ? [{ href: "/personale", label: "Personale", icon: ICONS.users }] : []),
    ...(isAdmin ? [{ href: "/gestione-account", label: "Gestione account", icon: ICONS.userCog }] : []),
    ...(isManager ? [{ href: "/documenti", label: "Documenti", icon: ICONS.folderOpen }] : []),
    ...(isManager ? [{ href: "/allergeni", label: "Allergeni", icon: ICONS.wheat }] : []),
    ...(isManager ? [{ href: "/onboarding", label: "Recruiting", icon: ICONS.userPlus }] : []),
  ];

  const analisi: NavItem[] = isAdmin ? [
    { href: "/report", label: "Report", icon: ICONS.fileBarChart },
    { href: "/statistiche", label: "Statistiche", icon: ICONS.barChart3 },
    { href: "/ricavi-camere", label: "Ricavi Camere", icon: ICONS.bed },
    { href: "/admin/attivita", label: "Attività", icon: ICONS.activity },
    { href: "/admin/panoramica", label: "Panoramica admin", icon: ICONS.layoutDashboard },
    { href: "/admin/sicurezza", label: "Sicurezza", icon: ICONS.shield },
  ] : [];

  const footer: NavItem[] = [
    { href: "/aiuto", label: "Aiuto", icon: ICONS.helpCircle },
    ...(isAdmin ? [{ href: "/impostazioni-sistema", label: "Impostazioni", icon: ICONS.settings }] : []),
    ...(role !== "manager" ? [{ href: "/impostazioni", label: "Il mio account", icon: ICONS.userCog }] : []),
    { href: "/privacy", label: "Privacy e dati", icon: ICONS.lock },
  ];

  function renderLink(l: NavItem) {
    return (
      <Link key={l.href} href={l.href} className={`drawer-link${is(l.href) ? " active" : ""}`}>
        {l.icon}
        {l.label}
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

  const displayRole = userRole || role || "staff";

  return (
    <>
      <nav className="bottomnav">
        <Link href="/" className={is("/") ? "active" : ""}>{iconHome22}<span>Home</span></Link>
        <Link href="/cassa" className={is("/cassa") ? "active" : ""}>{iconCassa22}<span>Cassa</span></Link>
        <Link href="/turni" className={is("/turni") ? "active" : ""}>{iconTurni22}<span>Turni</span></Link>
        <Link href="/magazzino" className={is("/magazzino") ? "active" : ""}>{iconMagazzino22}<span>Magazzino</span></Link>
        <button className={`bottomnav-menu${drawerOpen ? " active" : ""}`} onClick={() => setDrawerOpen(!drawerOpen)}>
          {ICONS.menu}<span>Menu</span>
        </button>
      </nav>

      {drawerOpen && (
        <div className="drawer-overlay" onClick={() => setDrawerOpen(false)}>
          <div className="drawer-panel" onClick={e => e.stopPropagation()}>
            <div className="drawer-head">
              <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 14, letterSpacing: 3, opacity: 0.6 }}>MENU</span>
              <button className="drawer-close" onClick={() => setDrawerOpen(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>

            {/* User info at top of drawer */}
            {userName && (
              <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 14, fontWeight: 700, color: "#FAF9F5" }}>{userName}</div>
                <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 12, color: "#BFA762", marginTop: 2, textTransform: "capitalize" }}>{displayRole}</div>
              </div>
            )}

            <nav className="drawer-nav">
              {renderGroup("OPERATIVO", operativo)}
              {renderGroup("MAGAZZINO", magazzino)}

              {/* Drink Lab — standalone card */}
              <div className="drawer-drinklab">
                <Link href="/drink-lab" className={`drawer-link drawer-drinklab-link${is("/drink-lab") ? " active" : ""}`}>
                  {ICONS.wine}
                  Drink Lab
                </Link>
              </div>

              {renderGroup("BAR", bar)}
              {contabilita.length > 0 && renderGroup("CONTABILITÀ", contabilita)}
              {gestione.length > 0 && renderGroup("GESTIONE", gestione)}
              {analisi.length > 0 && renderGroup("ANALISI", analisi)}

              <div className="drawer-divider" />
              {footer.map(renderLink)}

              <div className="drawer-divider" />
              <form action="/auth/signout" method="post" style={{ margin: 0 }}>
                <button type="submit" className="drawer-link drawer-logout">
                  {ICONS.logout}
                  Esci
                </button>
              </form>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
