"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRole } from "@/lib/useRole";

export default function BottomNav() {
  const path = usePathname();
  const is = (p: string) => (p === "/" ? path === "/" : path.startsWith(p));
  const { role } = useRole();
  const isManager = role === "admin" || role === "manager";

  return (
    <nav className="bottomnav">
      <Link href="/" className={is("/") ? "active" : ""}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12l9-9 9 9M5 10v10h14V10" /></svg>
        <span>Home</span>
      </Link>
      {isManager ? (
        <>
          <Link href="/spese" className={is("/spese") ? "active" : ""}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h10" /></svg>
            <span>Spese</span>
          </Link>
          <Link href="/nuova" className="fab">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            <span>Nuova</span>
          </Link>
        </>
      ) : (
        <Link href="/cassa" className={is("/cassa") ? "active" : ""}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M2 10h20" /></svg>
          <span>Cassa</span>
        </Link>
      )}
      <Link href="/turni" className={is("/turni") ? "active" : ""}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>
        <span>Turni</span>
      </Link>
      {isManager ? (
        <Link href="/personale" className={is("/personale") ? "active" : ""}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0M17 11a3 3 0 1 0-1.5-5.6M20.5 20a5.2 5.2 0 0 0-4-5" /></svg>
          <span>Personale</span>
        </Link>
      ) : (
        <Link href="/housekeeping" className={is("/housekeeping") ? "active" : ""}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" /></svg>
          <span>Pulizie</span>
        </Link>
      )}
    </nav>
  );
}
