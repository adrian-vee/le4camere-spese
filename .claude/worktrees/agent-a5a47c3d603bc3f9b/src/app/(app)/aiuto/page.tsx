"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRole } from "@/lib/useRole";
import { getVisibleModules, getAllGuides, type HelpModule } from "@/lib/helpGuides";

export default function AiutoPage() {
  const { role } = useRole();
  const [search, setSearch] = useState("");

  // Determine if user is a_chiamata from localStorage or default false
  // The layout passes this via sidebar, but here we approximate based on role
  const isAChiamata = typeof window !== "undefined" && localStorage.getItem("isAChiamata") === "true";
  const userRole = role || "staff";

  const modules = useMemo(() => getVisibleModules(userRole, isAChiamata), [userRole, isAChiamata]);
  const allGuides = useMemo(() => getAllGuides(userRole, isAChiamata), [userRole, isAChiamata]);

  const searchResults = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    return allGuides.filter(({ guide, module }) =>
      guide.title.toLowerCase().includes(q) ||
      guide.steps.some(s => s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)) ||
      module.label.toLowerCase().includes(q)
    );
  }, [search, allGuides]);

  return (
    <div style={{ maxWidth: "100%" }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, color: "#1F3326", margin: 0 }}>Centro assistenza</h1>
        <p style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 15, color: "#6C6B5D", margin: "6px 0 0" }}>
          Tutto quello che serve per usare il gestionale Le 4 Camere
        </p>
      </div>

      {/* Search bar */}
      <div style={{
        position: "relative", marginBottom: 32,
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6C6B5D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
          <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          type="text"
          placeholder="Cerca una guida..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: "100%", padding: "14px 16px 14px 48px", fontSize: 16,
            fontFamily: "'Albert Sans', sans-serif",
            border: "1px solid #D8CCB8", borderRadius: 12, background: "#fff",
            outline: "none", boxSizing: "border-box",
          }}
          onFocus={e => { e.currentTarget.style.borderColor = "#BFA762"; }}
          onBlur={e => { e.currentTarget.style.borderColor = "#D8CCB8"; }}
        />
      </div>

      {/* Search results */}
      {searchResults ? (
        <div>
          <p style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 14, color: "#6C6B5D", marginBottom: 16 }}>
            {searchResults.length} risultat{searchResults.length === 1 ? "o" : "i"} per &quot;{search}&quot;
          </p>
          {searchResults.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 24px", color: "#6C6B5D" }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#D8CCB8" strokeWidth="1.5" style={{ marginBottom: 12 }}>
                <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
              </svg>
              <p style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 15 }}>Nessuna guida trovata. Prova con parole diverse.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {searchResults.map(({ module, guide }) => (
                <Link
                  key={`${module.id}-${guide.id}`}
                  href={`/aiuto/${module.id}?guida=${guide.id}`}
                  style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
                    background: "#fff", border: "1px solid #D8CCB8", borderRadius: 12,
                    textDecoration: "none", transition: "border-color 0.15s, box-shadow 0.15s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "#BFA762"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "#D8CCB8"; e.currentTarget.style.boxShadow = "none"; }}
                >
                  <span style={{
                    width: 36, height: 36, borderRadius: 8, background: module.color + "18",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={module.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d={module.icon} />
                    </svg>
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 14, fontWeight: 600, color: "#1F3326" }}>{guide.title}</div>
                    <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 12, color: "#6C6B5D" }}>{module.label} &middot; {guide.steps.length} passaggi</div>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D8CCB8" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
                </Link>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Module cards grid */
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 16,
        }}>
          {modules.map(m => (
            <ModuleCard key={m.id} module={m} userRole={userRole} />
          ))}
        </div>
      )}
    </div>
  );
}

function ModuleCard({ module, userRole }: { module: HelpModule; userRole: string }) {
  const guideCount = module.guides.filter(g => !g.adminOnly || userRole === "admin").length;

  return (
    <Link
      href={`/aiuto/${module.id}`}
      style={{
        display: "block", padding: 24, background: "#fff",
        border: "1px solid #D8CCB8", borderRadius: 12,
        textDecoration: "none", transition: "border-color 0.15s, box-shadow 0.15s",
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "#BFA762"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "#D8CCB8"; e.currentTarget.style.boxShadow = "none"; }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12, background: module.color + "14",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={module.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d={module.icon} />
          </svg>
        </div>
        <div>
          <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 16, fontWeight: 700, color: "#1F3326" }}>{module.label}</div>
        </div>
      </div>
      <p style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 13, color: "#6C6B5D", margin: "0 0 14px", lineHeight: 1.5 }}>
        {module.description}
      </p>
      <span style={{
        display: "inline-block", padding: "4px 12px", borderRadius: 20,
        background: module.color + "14", color: module.color,
        fontSize: 12, fontWeight: 600, fontFamily: "'Albert Sans', sans-serif",
      }}>
        {guideCount} guid{guideCount === 1 ? "a" : "e"}
      </span>
    </Link>
  );
}
