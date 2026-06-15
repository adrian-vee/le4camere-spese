"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { useRole } from "@/lib/useRole";

export default function BottomNav({ isAChiamata = false }: { isAChiamata?: boolean }) {
  const path = usePathname();
  const is = (p: string) => (p === "/" ? path === "/" : path.startsWith(p));
  const { role } = useRole();
  const isManager = role === "admin" || role === "manager";
  const isAdmin = role === "admin";
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close drawer on navigation
  useEffect(() => { setDrawerOpen(false); }, [path]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (drawerOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [drawerOpen]);

  /* ── Icons (reusable) ── */
  const iconHome = <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12l9-9 9 9M5 10v10h14V10" /></svg>;
  const iconCassa = <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M2 10h20" /></svg>;
  const iconTurni = <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>;
  const iconMagazzino = <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/></svg>;
  const iconMenu = <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 12h18M3 6h18M3 18h18" /></svg>;

  /* ── Drawer icon helper (20px) ── */
  const di = (children: React.ReactNode) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>;

  /* ── STAFF bottom nav: Home | Cassa | Turni | Magazzino | Menu ── */
  if (!isManager) {
    const staffDrawerLinks: { href: string; label: string; icon: React.ReactNode }[] = [
      {
        href: "/fornitori", label: "Fornitori",
        icon: di(<><path d="M14 18V6a2 2 0 00-2-2H4a2 2 0 00-2 2v11a1 1 0 001 1h2" /><path d="M15 18H9" /><path d="M19 18h2a1 1 0 001-1v-3.65a1 1 0 00-.22-.624l-3.48-4.35A1 1 0 0017.52 8H14" /><circle cx="17" cy="18" r="2" /><circle cx="7" cy="18" r="2" /></>),
      },
      {
        href: "/inventario", label: "Inventario",
        icon: di(<><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></>),
      },
      {
        href: "/nuova", label: "Nuova spesa",
        icon: di(<><path d="M12 5v14M5 12h14" /></>),
      },
      ...(isAChiamata ? [{
        href: "/disponibilita", label: "Disponibilità",
        icon: di(<><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M9 14l2 2 4-4" /></>),
      }] : []),
    ];

    return (
      <>
        <nav className="bottomnav">
          <Link href="/" className={is("/") ? "active" : ""}>{iconHome}<span>Home</span></Link>
          <Link href="/cassa" className={is("/cassa") ? "active" : ""}>{iconCassa}<span>Cassa</span></Link>
          <Link href="/turni" className={is("/turni") ? "active" : ""}>{iconTurni}<span>Turni</span></Link>
          <Link href="/magazzino" className={is("/magazzino") ? "active" : ""}>{iconMagazzino}<span>Magazzino</span></Link>
          <button className={`bottomnav-menu${drawerOpen ? " active" : ""}`} onClick={() => setDrawerOpen(!drawerOpen)}>
            {iconMenu}<span>Menu</span>
          </button>
        </nav>

        {/* Staff drawer */}
        {drawerOpen && (
          <div className="drawer-overlay" onClick={() => setDrawerOpen(false)}>
            <div className="drawer-panel" onClick={e => e.stopPropagation()}>
              <div className="drawer-head">
                <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 14, letterSpacing: 3, opacity: 0.6 }}>MENU</span>
                <button className="drawer-close" onClick={() => setDrawerOpen(false)}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              </div>
              <nav className="drawer-nav">
                {staffDrawerLinks.map(l => (
                  <Link key={l.href} href={l.href} className={`drawer-link${is(l.href) ? " active" : ""}`}>
                    {l.icon}
                    {l.label}
                  </Link>
                ))}
                <div className="drawer-divider" />
                <Link href="/aiuto" className={`drawer-link${is("/aiuto") ? " active" : ""}`}>
                  {di(<><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></>)}
                  Aiuto
                </Link>
                <Link href="/impostazioni" className={`drawer-link${is("/impostazioni") ? " active" : ""}`}>
                  {di(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></>)}
                  Impostazioni
                </Link>
                <Link href="/privacy" className={`drawer-link${is("/privacy") ? " active" : ""}`} style={{ fontSize: 13, opacity: 0.8 }}>
                  {di(<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></>)}
                  Privacy e dati
                </Link>
                <form action="/auth/signout" method="post" style={{ margin: 0 }}>
                  <button type="submit" className="drawer-link drawer-logout">
                    {di(<><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></>)}
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

  /* ── ADMIN/MANAGER bottom nav: Home | Cassa | Turni | Magazzino | Menu ── */
  const drawerLinks: { href: string; label: string; icon: React.ReactNode; adminOnly?: boolean }[] = [
    { href: "/spese", label: "Spese", icon: di(<><path d="M4 6h16M4 12h16M4 18h10" /></>) },
    { href: "/nuova", label: "Nuova spesa", icon: di(<><path d="M12 5v14M5 12h14" /></>) },
    { href: "/fornitori", label: "Fornitori", icon: di(<><path d="M14 18V6a2 2 0 00-2-2H4a2 2 0 00-2 2v11a1 1 0 001 1h2" /><path d="M15 18H9" /><path d="M19 18h2a1 1 0 001-1v-3.65a1 1 0 00-.22-.624l-3.48-4.35A1 1 0 0017.52 8H14" /><circle cx="17" cy="18" r="2" /><circle cx="7" cy="18" r="2" /></>) },
    { href: "/inventario", label: "Inventario", icon: di(<><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></>) },
    { href: "/utenze", label: "Utenze", icon: di(<><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></>) },
    { href: "/documenti", label: "Documenti", icon: di(<><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" /></>) },
    { href: "/personale", label: "Personale", icon: di(<><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0M17 11a3 3 0 1 0-1.5-5.6M20.5 20a5.2 5.2 0 0 0-4-5" /></>) },
    { href: "/disponibilita", label: "Disponibilità", icon: di(<><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M9 14l2 2 4-4" /></>) },
    { href: "/report", label: "Report", icon: di(<><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8M8 17h8" /></>) },
    { href: "/statistiche", label: "Statistiche", icon: di(<><path d="M18 20V10M12 20V4M6 20v-6" /></>) },
    { href: "/gestione-account", label: "Gestione account", adminOnly: true, icon: di(<><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4-4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></>) },
  ];

  const adminDrawerLinks: { href: string; label: string; icon: React.ReactNode }[] = [
    { href: "/admin/attivita", label: "Attività", icon: di(<><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></>) },
    { href: "/admin/panoramica", label: "Panoramica admin", icon: di(<><path d="M18 20V10M12 20V4M6 20v-6" /></>) },
    { href: "/admin/sicurezza", label: "Sicurezza", icon: di(<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></>) },
  ];

  const visibleDrawerLinks = drawerLinks.filter(l => !l.adminOnly || isAdmin);

  return (
    <>
      <nav className="bottomnav">
        <Link href="/" className={is("/") ? "active" : ""}>{iconHome}<span>Home</span></Link>
        <Link href="/cassa" className={is("/cassa") ? "active" : ""}>{iconCassa}<span>Cassa</span></Link>
        <Link href="/turni" className={is("/turni") ? "active" : ""}>{iconTurni}<span>Turni</span></Link>
        <Link href="/magazzino" className={is("/magazzino") ? "active" : ""}>{iconMagazzino}<span>Magazzino</span></Link>
        <button className={`bottomnav-menu${drawerOpen ? " active" : ""}`} onClick={() => setDrawerOpen(!drawerOpen)}>
          {iconMenu}<span>Menu</span>
        </button>
      </nav>

      {/* Drawer overlay + panel */}
      {drawerOpen && (
        <div className="drawer-overlay" onClick={() => setDrawerOpen(false)}>
          <div className="drawer-panel" onClick={e => e.stopPropagation()}>
            <div className="drawer-head">
              <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 14, letterSpacing: 3, opacity: 0.6 }}>MENU</span>
              <button className="drawer-close" onClick={() => setDrawerOpen(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <nav className="drawer-nav">
              {visibleDrawerLinks.map(l => (
                <Link key={l.href} href={l.href} className={`drawer-link${is(l.href) ? " active" : ""}`}>
                  {l.icon}
                  {l.label}
                </Link>
              ))}
              {isAdmin && (
                <>
                  <div className="drawer-divider">
                    <span>Admin</span>
                  </div>
                  {adminDrawerLinks.map(l => (
                    <Link key={l.href} href={l.href} className={`drawer-link${is(l.href) ? " active" : ""}`}>
                      {l.icon}
                      {l.label}
                    </Link>
                  ))}
                </>
              )}
              <div className="drawer-divider" />
              <Link href="/aiuto" className={`drawer-link${is("/aiuto") ? " active" : ""}`}>
                {di(<><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></>)}
                Aiuto
              </Link>
              <Link href="/impostazioni" className={`drawer-link${is("/impostazioni") ? " active" : ""}`}>
                {di(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></>)}
                Impostazioni
              </Link>
              <Link href="/privacy" className={`drawer-link${is("/privacy") ? " active" : ""}`} style={{ fontSize: 13, opacity: 0.8 }}>
                {di(<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></>)}
                Privacy e dati
              </Link>
              <form action="/auth/signout" method="post" style={{ margin: 0 }}>
                <button type="submit" className="drawer-link drawer-logout">
                  {di(<><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></>)}
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
