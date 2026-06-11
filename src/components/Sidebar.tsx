"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type UserRole = "admin" | "manager" | "staff";

export default function Sidebar({ userName, lowStockCount = 0, cassaAlertCount = 0, userRole = "staff", isAChiamata = false, availabilityPending = false }: {
  userName: string; lowStockCount?: number; cassaAlertCount?: number; userRole?: UserRole; isAChiamata?: boolean; availabilityPending?: boolean;
}) {
  const path = usePathname();
  const is = (p: string) => (p === "/" ? path === "/" : path.startsWith(p));
  const isManager = userRole === "admin" || userRole === "manager";

  const links: { href: string; label: string; icon: React.ReactNode; badge?: number; dot?: boolean; adminOnly?: boolean; managerOnly?: boolean }[] = [
    {
      href: "/",
      label: "Panoramica",
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12l9-9 9 9M5 10v10h14V10" /></svg>,
    },
    {
      href: "/cassa",
      label: "Cassa",
      badge: userRole === "admin" ? cassaAlertCount : 0,
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M2 10h20" /><path d="M6 14h.01M10 14h.01" /></svg>,
    },
    {
      href: "/spese", label: "Spese", managerOnly: true,
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h10" /></svg>,
    },
    {
      href: "/nuova", label: "Nuova spesa",
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>,
    },
    {
      href: "/turni", label: "Turni",
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>,
    },
    ...(isAChiamata || isManager ? [{
      href: "/disponibilita", label: "Disponibilità", dot: availabilityPending,
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M9 14l2 2 4-4" /></svg>,
    }] : []),
    {
      href: "/magazzino", label: "Magazzino", badge: lowStockCount,
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" /></svg>,
    },
    {
      href: "/inventario", label: "Inventario",
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>,
    },
    {
      href: "/utenze", label: "Utenze", managerOnly: true,
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>,
    },
    {
      href: "/documenti", label: "Documenti", managerOnly: true,
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" /></svg>,
    },
    {
      href: "/personale", label: "Personale", managerOnly: true,
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0M17 11a3 3 0 1 0-1.5-5.6M20.5 20a5.2 5.2 0 0 0-4-5" /></svg>,
    },
    {
      href: "/gestione-account", label: "Gestione account", adminOnly: true,
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4-4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>,
    },
  ];

  const adminLinks = [
    {
      href: "/admin/attivita", label: "Attività",
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>,
    },
    {
      href: "/admin/panoramica", label: "Panoramica admin",
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20V10M12 20V4M6 20v-6" /></svg>,
    },
    {
      href: "/admin/sicurezza", label: "Sicurezza",
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
    },
  ];

  const visibleLinks = links.filter(l => {
    if (l.adminOnly && userRole !== "admin") return false;
    if (l.managerOnly && !isManager) return false;
    return true;
  });

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <img src="/le4camere-logo-bianco.svg" alt="Le 4 Camere" width="160" height="auto" style={{ width: 160, height: "auto" }} />
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 13, letterSpacing: 3, color: "rgba(250,249,245,0.6)", marginTop: 6 }}>GESTIONALE ALBERGHIERO</div>
      </div>

      <nav className="sidebar-nav">
        {visibleLinks.map((l) => (
          <Link key={l.href} href={l.href} className={`sidebar-link${is(l.href) ? " active" : ""}`}>
            {l.icon}
            {l.label}
            {!!l.badge && l.badge > 0 && (
              <span style={{
                marginLeft: "auto", background: "#9E3B2E", color: "#FAF9F5",
                fontSize: 11, fontWeight: 700, borderRadius: 10,
                padding: "2px 7px", minWidth: 20, textAlign: "center", lineHeight: "16px",
              }}>{l.badge}</span>
            )}
            {l.dot && !l.badge && (
              <span style={{
                marginLeft: "auto", width: 8, height: 8, borderRadius: "50%",
                background: "#C77B4A", flexShrink: 0,
              }} />
            )}
          </Link>
        ))}

        {/* Admin section */}
        {userRole === "admin" && (
          <>
            <div style={{
              margin: "16px 16px 8px", borderTop: "1px solid rgba(250,249,245,0.12)",
              paddingTop: 12, fontSize: 10, fontWeight: 700, letterSpacing: 2,
              color: "rgba(250,249,245,0.4)", textTransform: "uppercase",
            }}>Admin</div>
            {adminLinks.map((l) => (
              <Link key={l.href} href={l.href} className={`sidebar-link${is(l.href) ? " active" : ""}`}>
                {l.icon}
                {l.label}
              </Link>
            ))}
          </>
        )}
      </nav>

      <div className="sidebar-footer">
        {isManager && (
          <Link href="/impostazioni-sistema" className="sidebar-link" style={{ fontSize: 13, padding: "8px 16px", marginBottom: 4, opacity: is("/impostazioni-sistema") ? 1 : 0.7 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
            Impostazioni
          </Link>
        )}
        <Link href="/impostazioni" className="user-name" style={{ textDecoration: "none", color: "inherit", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          {userName}
          <span style={{ fontSize: 10, opacity: 0.5, textTransform: "uppercase", letterSpacing: 1 }}>{userRole}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        </Link>
        <form action="/auth/signout" method="post">
          <button type="submit" className="logout-btn">Esci</button>
        </form>
      </div>
    </aside>
  );
}
