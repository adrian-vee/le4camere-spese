"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Sidebar({ userName }: { userName: string }) {
  const path = usePathname();
  const is = (p: string) => (p === "/" ? path === "/" : path.startsWith(p));

  const links = [
    {
      href: "/",
      label: "Dashboard",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 12l9-9 9 9M5 10v10h14V10" />
        </svg>
      ),
    },
    {
      href: "/spese",
      label: "Spese",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 6h16M4 12h16M4 18h10" />
        </svg>
      ),
    },
    {
      href: "/nuova",
      label: "Nuova spesa",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      ),
    },
    {
      href: "/turni",
      label: "Turni",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="17" rx="2" />
          <path d="M3 9h18M8 2v4M16 2v4" />
        </svg>
      ),
    },
    {
      href: "/inventario",
      label: "Inventario",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" />
        </svg>
      ),
    },
    {
      href: "/housekeeping",
      label: "Housekeeping",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" />
          <path d="M20 4v3M21.5 5.5h-3" />
          <path d="M4 17v3M5.5 18.5h-3" />
        </svg>
      ),
    },
    {
      href: "/personale",
      label: "Staff",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3.5 20a5.5 5.5 0 0 1 11 0M17 11a3 3 0 1 0-1.5-5.6M20.5 20a5.2 5.2 0 0 0-4-5" />
        </svg>
      ),
    },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <img src="/le4camere-logo-bianco.svg" alt="Le 4 Camere" width="160" height="auto" style={{ width: 160, height: "auto" }} />
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 13, letterSpacing: 3, color: "rgba(250,249,245,0.6)", marginTop: 6 }}>GESTIONALE ALBERGHIERO</div>
      </div>

      <nav className="sidebar-nav">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`sidebar-link${is(l.href) ? " active" : ""}`}
          >
            {l.icon}
            {l.label}
          </Link>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="user-name">{userName}</div>
        <form action="/auth/signout" method="post">
          <button type="submit" className="logout-btn">
            Esci
          </button>
        </form>
        <img src="/roverchiara-verona-italy-bianco.svg" alt="Roverchiara, Verona" width="100" height="auto" style={{ width: 100, height: "auto", opacity: 0.6, marginTop: 16 }} />
      </div>
    </aside>
  );
}
