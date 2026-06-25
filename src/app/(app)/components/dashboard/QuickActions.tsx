"use client";
import Link from "next/link";

const actions = [
  {
    href: "/bar",
    title: "POS Bar",
    sub: "Apri il punto vendita",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 2l1 1h6l1-1" stroke="#BFA762" strokeWidth="1.5" />
        <path d="M7 3h10l-1.5 13a2 2 0 01-2 1.8h-3a2 2 0 01-2-1.8L7 3z" stroke="#1F3326" strokeWidth="1.5" />
        <path d="M12 17v3M9 20h6" stroke="#1F3326" strokeWidth="1.5" />
        <circle cx="15" cy="7" r="1.2" fill="#BFA762" stroke="none" />
      </svg>
    ),
  },
  {
    href: "/cassa",
    title: "Cassa",
    sub: "Gestisci i contanti",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="10" width="20" height="10" rx="2" stroke="#1F3326" strokeWidth="1.5" />
        <path d="M5 10V7a2 2 0 012-2h10a2 2 0 012 2v3" stroke="#1F3326" strokeWidth="1.5" />
        <rect x="8" y="13" width="8" height="4" rx="1" stroke="#BFA762" strokeWidth="1.5" />
        <line x1="5" y1="7" x2="19" y2="7" stroke="#D8CCB8" strokeWidth="1" />
      </svg>
    ),
  },
  {
    href: "/turni",
    title: "Turni",
    sub: "Pianifica i turni",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="17" rx="2" stroke="#1F3326" strokeWidth="1.5" />
        <line x1="3" y1="9" x2="21" y2="9" stroke="#1F3326" strokeWidth="1.5" />
        <line x1="8" y1="2" x2="8" y2="6" stroke="#1F3326" strokeWidth="1.5" />
        <line x1="16" y1="2" x2="16" y2="6" stroke="#1F3326" strokeWidth="1.5" />
        <circle cx="16" cy="16" r="3.5" fill="#FAF9F5" stroke="#BFA762" strokeWidth="1.5" />
        <polyline points="16 14.5 16 16 17.2 17" stroke="#BFA762" strokeWidth="1.2" />
      </svg>
    ),
  },
  {
    href: "/magazzino",
    title: "Magazzino",
    sub: "Gestisci lo stock",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" stroke="#1F3326" strokeWidth="1.5" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" stroke="#1F3326" strokeWidth="1.5" />
        <line x1="12" y1="22.08" x2="12" y2="12" stroke="#1F3326" strokeWidth="1.5" />
        <path d="M16 5l-4 2.5" stroke="#BFA762" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    href: "/nuova",
    title: "Spese",
    sub: "Registra una nuova spesa",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="#1F3326" strokeWidth="1.5" />
        <polyline points="14 2 14 8 20 8" stroke="#1F3326" strokeWidth="1.5" />
        <line x1="12" y1="11" x2="12" y2="17" stroke="#BFA762" strokeWidth="1.5" />
        <path d="M10 14.5a2 2 0 104 0c0-1.5-2-1.5-2-3a2 2 0 014 0" stroke="#BFA762" strokeWidth="1.3" fill="none" />
      </svg>
    ),
  },
  {
    href: "/personale",
    title: "Personale",
    sub: "Gestisci lo staff",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2" stroke="#1F3326" strokeWidth="0" />
        <circle cx="9" cy="7" r="3.5" stroke="#1F3326" strokeWidth="1.5" />
        <path d="M17 21v-2a4 4 0 00-3-3.87" stroke="#1F3326" strokeWidth="1.5" />
        <circle cx="16" cy="4.5" r="2.5" stroke="#BFA762" strokeWidth="1.5" />
        <path d="M21 21v-2a4 4 0 00-2-3.47" stroke="#BFA762" strokeWidth="1.5" />
        <path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" stroke="#1F3326" strokeWidth="1.5" />
      </svg>
    ),
  },
];

export default function QuickActions() {
  return (
    <>
      <div className="qa-grid">
        {actions.map(a => (
          <Link key={a.href} href={a.href} className="qa-card">
            <div className="qa-icon-badge">{a.icon}</div>
            <div className="qa-text">
              <div className="qa-title">{a.title}</div>
              <div className="qa-sub">{a.sub}</div>
            </div>
            <svg className="qa-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#BFA762" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </Link>
        ))}
      </div>
      {/* Ornamental separator */}
      <div className="qa-separator">
        <div className="qa-sep-line" />
        <div className="qa-sep-diamond" />
        <div className="qa-sep-line" />
      </div>
    </>
  );
}
