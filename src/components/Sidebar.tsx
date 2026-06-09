"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";

type UserRole = "admin" | "manager" | "staff";

interface NotifItem { label: string; count: number; href: string; color: string }

export default function Sidebar({ userName, lowStockCount = 0, cassaAlertCount = 0, adminNotifCount = 0, userRole = "staff" }: {
  userName: string; lowStockCount?: number; cassaAlertCount?: number; adminNotifCount?: number; userRole?: UserRole;
}) {
  const path = usePathname();
  const is = (p: string) => (p === "/" ? path === "/" : path.startsWith(p));
  const isManager = userRole === "admin" || userRole === "manager";
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(e: MouseEvent) { if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false); }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const links: { href: string; label: string; icon: React.ReactNode; badge?: number; adminOnly?: boolean; managerOnly?: boolean }[] = [
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
      href: "/nuova", label: "Nuova spesa", managerOnly: true,
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>,
    },
    {
      href: "/turni", label: "Turni",
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>,
    },
    {
      href: "/magazzino", label: "Magazzino", badge: lowStockCount,
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" /></svg>,
    },
    {
      href: "/inventario", label: "Inventario", managerOnly: true,
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>,
    },
    {
      href: "/utenze", label: "Utenze", managerOnly: true,
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>,
    },
    {
      href: "/housekeeping", label: "Pulizie",
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" /><path d="M20 4v3M21.5 5.5h-3" /><path d="M4 17v3M5.5 18.5h-3" /></svg>,
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
      href: "/admin/attivita", label: "Attivit\u00e0",
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

  const notifItems: NotifItem[] = [
    { label: "Alert cassa", count: cassaAlertCount, href: "/cassa", color: "#BFA762" },
    { label: "Scorte basse", count: lowStockCount, href: "/magazzino", color: "#9E3B2E" },
  ];
  const totalNotif = adminNotifCount;

  return (
    <aside className="sidebar">
      <div className="sidebar-brand" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <img src="/le4camere-logo-bianco.svg" alt="Le 4 Camere" width="160" height="auto" style={{ width: 160, height: "auto" }} />
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 13, letterSpacing: 3, color: "rgba(250,249,245,0.6)", marginTop: 6 }}>GESTIONALE ALBERGHIERO</div>
        </div>
        {userRole === "admin" && (
          <div ref={bellRef} style={{ position: "relative" }}>
            <button onClick={() => setBellOpen(!bellOpen)} style={{
              background: "none", border: "none", cursor: "pointer", position: "relative", padding: 6,
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(250,249,245,0.8)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" />
              </svg>
              {totalNotif > 0 && (
                <span style={{
                  position: "absolute", top: 2, right: 2, background: "#9E3B2E", color: "#FAF9F5",
                  fontSize: 10, fontWeight: 700, borderRadius: 10, padding: "1px 5px", minWidth: 16, textAlign: "center", lineHeight: "14px",
                }}>{totalNotif}</span>
              )}
            </button>
            {bellOpen && (
              <div style={{
                position: "absolute", top: 40, right: 0, width: 240, background: "#FFFFFF",
                borderRadius: 10, boxShadow: "0 8px 32px rgba(0,0,0,.2)", zIndex: 50, overflow: "hidden",
              }}>
                <div style={{ padding: "12px 16px", borderBottom: "1px solid #F3EBDD", fontWeight: 700, fontSize: 13, color: "#1F3326" }}>Notifiche</div>
                {notifItems.filter(n => n.count > 0).map((n, i) => (
                  <Link key={i} href={n.href} onClick={() => setBellOpen(false)} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 16px", borderBottom: "1px solid #F3EBDD", textDecoration: "none", color: "#1F3326",
                  }}>
                    <span style={{ fontSize: 13 }}>{n.label}</span>
                    <span style={{
                      background: n.color + "18", color: n.color, fontSize: 11, fontWeight: 700,
                      padding: "2px 8px", borderRadius: 10,
                    }}>{n.count}</span>
                  </Link>
                ))}
                {notifItems.every(n => n.count === 0) && (
                  <div style={{ padding: "16px", textAlign: "center", fontSize: 13, color: "#6C6B5D" }}>Tutto a posto</div>
                )}
                <Link href="/admin/panoramica" onClick={() => setBellOpen(false)} style={{
                  display: "block", padding: "10px 16px", textDecoration: "none", fontSize: 12,
                  fontWeight: 700, color: "#4F7B8C", textAlign: "center",
                }}>Vai alla panoramica admin &rarr;</Link>
              </div>
            )}
          </div>
        )}
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
