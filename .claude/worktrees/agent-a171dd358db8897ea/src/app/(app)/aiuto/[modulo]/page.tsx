"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useRole } from "@/lib/useRole";
import { HELP_MODULES, type Guide } from "@/lib/helpGuides";

export default function ModuloGuidaPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const { role } = useRole();
  const userRole = role || "staff";
  const moduloId = params.modulo as string;
  const guidaParam = searchParams.get("guida");

  const modulo = HELP_MODULES.find(m => m.id === moduloId);
  const guides = useMemo(
    () => (modulo?.guides ?? []).filter(g => !g.adminOnly || userRole === "admin"),
    [modulo, userRole]
  );

  const [activeGuide, setActiveGuide] = useState<Guide | null>(null);
  const [feedback, setFeedback] = useState<Record<string, "up" | "down">>({});

  // Load feedback from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("help_feedback");
      if (stored) setFeedback(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  // Open guide from URL param
  useEffect(() => {
    if (guidaParam && guides.length) {
      const g = guides.find(g => g.id === guidaParam);
      if (g) setActiveGuide(g);
    }
  }, [guidaParam, guides]);

  const saveFeedback = (guideId: string, value: "up" | "down") => {
    const next = { ...feedback, [guideId]: value };
    setFeedback(next);
    try { localStorage.setItem("help_feedback", JSON.stringify(next)); } catch { /* ignore */ }
  };

  if (!modulo) {
    return (
      <div style={{ textAlign: "center", padding: "64px 24px" }}>
        <h2 style={{ fontFamily: "'Fraunces', serif", color: "#1F3326" }}>Modulo non trovato</h2>
        <Link href="/aiuto" style={{ color: "#BFA762", fontFamily: "'Albert Sans', sans-serif" }}>Torna al centro assistenza</Link>
      </div>
    );
  }

  // Detail view for a single guide
  if (activeGuide) {
    return (
      <div style={{ maxWidth: "100%" }}>
        {/* Breadcrumb */}
        <nav style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 24, fontFamily: "'Albert Sans', sans-serif", fontSize: 13, color: "#6C6B5D" }}>
          <Link href="/aiuto" style={{ color: "#BFA762", textDecoration: "none" }}>Aiuto</Link>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#D8CCB8" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
          <button onClick={() => setActiveGuide(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#BFA762", fontFamily: "inherit", fontSize: "inherit", padding: 0 }}>{modulo.label}</button>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#D8CCB8" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
          <span style={{ color: "#1F3326" }}>{activeGuide.title}</span>
        </nav>

        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 24, color: "#1F3326", margin: "0 0 6px" }}>{activeGuide.title}</h1>
        <p style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 13, color: "#6C6B5D", margin: "0 0 28px" }}>
          {activeGuide.steps.length} passaggi
        </p>

        {/* Steps */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 28 }}>
          {activeGuide.steps.map((step, i) => (
            <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%", background: "#1F3326", color: "#FAF9F5",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                fontFamily: "'Albert Sans', sans-serif", fontSize: 14, fontWeight: 700,
              }}>{i + 1}</div>
              <div style={{ paddingTop: 4 }}>
                <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 15, fontWeight: 600, color: "#1F3326", marginBottom: 4 }}>{step.title}</div>
                <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 14, color: "#6C6B5D", lineHeight: 1.5 }}>{step.description}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Tip box */}
        <div style={{
          background: "#F3EBDD", borderLeft: "4px solid #BFA762", borderRadius: "0 8px 8px 0",
          padding: "14px 18px", marginBottom: 24,
        }}>
          <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 13, fontWeight: 700, color: "#1F3326", marginBottom: 4 }}>Suggerimento</div>
          <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 14, color: "#6C6B5D", lineHeight: 1.5 }}>{activeGuide.tip}</div>
        </div>

        {/* Feedback */}
        <div style={{
          background: "#fff", border: "1px solid #D8CCB8", borderRadius: 12, padding: "16px 20px",
          display: "flex", alignItems: "center", gap: 12, marginBottom: 24,
        }}>
          <span style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 14, color: "#6C6B5D" }}>Questa guida ti e stata utile?</span>
          <button
            onClick={() => saveFeedback(activeGuide.id, "up")}
            style={{
              background: feedback[activeGuide.id] === "up" ? "#2D5A3D" : "#F3EBDD",
              color: feedback[activeGuide.id] === "up" ? "#fff" : "#1F3326",
              border: "none", borderRadius: 8, padding: "6px 14px", cursor: "pointer",
              fontFamily: "'Albert Sans', sans-serif", fontSize: 14, transition: "all 0.15s",
            }}
          >
            Si
          </button>
          <button
            onClick={() => saveFeedback(activeGuide.id, "down")}
            style={{
              background: feedback[activeGuide.id] === "down" ? "#9E3B2E" : "#F3EBDD",
              color: feedback[activeGuide.id] === "down" ? "#fff" : "#1F3326",
              border: "none", borderRadius: 8, padding: "6px 14px", cursor: "pointer",
              fontFamily: "'Albert Sans', sans-serif", fontSize: 14, transition: "all 0.15s",
            }}
          >
            No
          </button>
        </div>

        {/* Contact */}
        <p style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 13, color: "#6C6B5D" }}>
          Non trovi quello che cerchi? Contatta <strong>Adrian</strong>
        </p>
      </div>
    );
  }

  // Module overview — list of guides
  return (
    <div style={{ maxWidth: "100%" }}>
      {/* Breadcrumb */}
      <nav style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 24, fontFamily: "'Albert Sans', sans-serif", fontSize: 13, color: "#6C6B5D" }}>
        <Link href="/aiuto" style={{ color: "#BFA762", textDecoration: "none" }}>Aiuto</Link>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#D8CCB8" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
        <span style={{ color: "#1F3326" }}>{modulo.label}</span>
      </nav>

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12, background: modulo.color + "14",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={modulo.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d={modulo.icon} />
          </svg>
        </div>
        <div>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 24, color: "#1F3326", margin: 0 }}>{modulo.label}</h1>
          <p style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 14, color: "#6C6B5D", margin: "2px 0 0" }}>{modulo.description}</p>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {guides.map(guide => (
          <button
            key={guide.id}
            onClick={() => setActiveGuide(guide)}
            style={{
              display: "flex", alignItems: "center", gap: 14, padding: "16px 18px",
              background: "#fff", border: "1px solid #D8CCB8", borderRadius: 12,
              cursor: "pointer", textAlign: "left", transition: "border-color 0.15s, box-shadow 0.15s",
              width: "100%",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#BFA762"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#D8CCB8"; e.currentTarget.style.boxShadow = "none"; }}
          >
            <div style={{
              width: 36, height: 36, borderRadius: 10, background: modulo.color + "14",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              fontFamily: "'Albert Sans', sans-serif", fontSize: 14, fontWeight: 700, color: modulo.color,
            }}>
              {guide.steps.length}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 15, fontWeight: 600, color: "#1F3326" }}>{guide.title}</div>
              <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 12, color: "#6C6B5D", marginTop: 2 }}>{guide.steps.length} passaggi</div>
            </div>
            {guide.adminOnly && (
              <span style={{
                padding: "2px 8px", borderRadius: 12, background: "#BFA76220", color: "#BFA762",
                fontSize: 11, fontWeight: 600, fontFamily: "'Albert Sans', sans-serif",
              }}>Admin</span>
            )}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D8CCB8" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
          </button>
        ))}
      </div>
    </div>
  );
}
