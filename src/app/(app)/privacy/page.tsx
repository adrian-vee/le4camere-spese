"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRole } from "@/lib/useRole";
import { useSettings } from "@/lib/useSettings";

type StaffConsent = {
  staff_id: string;
  staff_name: string;
  consent_given: boolean;
  consent_date: string | null;
};

export default function PrivacyPage() {
  const supabase = createClient();
  const { role } = useRole();
  const { get, loading: settingsLoading } = useSettings();
  const userRole = role || "staff";
  const isAdmin = userRole === "admin";

  const hotelName = get<string>("hotel_name") || "[Da configurare nelle Impostazioni]";
  const hotelAddress = get<string>("hotel_address") || "[Da configurare nelle Impostazioni]";
  const hotelEmail = get<string>("hotel_email") || "[Da configurare nelle Impostazioni]";

  // User stats
  const [stats, setStats] = useState({ shifts: 0, hours: 0, leaves: { permesso: 0, ferie: 0, malattia: 0 }, cashMoves: 0, lastLogin: "", profileName: "", profileEmail: "", profileRole: "", createdAt: "" });
  const [downloading, setDownloading] = useState(false);
  const [consents, setConsents] = useState<StaffConsent[]>([]);
  const [savingConsent, setSavingConsent] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [{ data: profile }, { data: staffLink }] = await Promise.all([
        supabase.from("profiles").select("full_name, role, created_at").eq("id", user.id).single(),
        supabase.from("staff").select("id").eq("profile_id", user.id).eq("active", true).maybeSingle(),
      ]);

      const staffId = (staffLink as { id: string } | null)?.id;

      const [{ count: shiftCount }, { data: leavesData }, { count: cashCount }] = await Promise.all([
        staffId
          ? supabase.from("shift_assignments").select("id", { count: "exact", head: true }).eq("staff_id", staffId)
          : Promise.resolve({ count: 0 }),
        supabase.from("staff_leaves").select("type").eq("staff_id", user.id),
        supabase.from("cash_movements").select("id", { count: "exact", head: true }).eq("created_by", user.id),
      ]);

      const leaveStats = { permesso: 0, ferie: 0, malattia: 0 };
      for (const l of (leavesData ?? []) as { type: string }[]) {
        if (l.type in leaveStats) leaveStats[l.type as keyof typeof leaveStats]++;
      }

      setStats({
        shifts: shiftCount ?? 0,
        hours: (shiftCount ?? 0) * 8,
        leaves: leaveStats,
        cashMoves: cashCount ?? 0,
        lastLogin: user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString("it-IT") : "N/D",
        profileName: profile?.full_name ?? "",
        profileEmail: user.email ?? "",
        profileRole: profile?.role ?? "staff",
        createdAt: profile?.created_at ? new Date(profile.created_at).toLocaleDateString("it-IT") : "",
      });
    })();
  }, [supabase]);

  // Load consents for admin
  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const [{ data: staff }, { data: consentData }] = await Promise.all([
        supabase.from("staff").select("id, name").eq("active", true).order("name"),
        supabase.from("privacy_consents").select("staff_id, consent_given, consent_date"),
      ]);
      const consentMap = new Map<string, { consent_given: boolean; consent_date: string | null }>();
      for (const c of (consentData ?? []) as { staff_id: string; consent_given: boolean; consent_date: string | null }[]) {
        consentMap.set(c.staff_id, c);
      }
      setConsents(
        ((staff ?? []) as { id: string; name: string }[]).map(s => ({
          staff_id: s.id,
          staff_name: s.name,
          consent_given: consentMap.get(s.id)?.consent_given ?? false,
          consent_date: consentMap.get(s.id)?.consent_date ?? null,
        }))
      );
    })();
  }, [isAdmin, supabase]);

  const downloadMyData = useCallback(async () => {
    setDownloading(true);
    try {
      const res = await fetch("/api/privacy/my-data");
      if (!res.ok) throw new Error("Errore download");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `i-miei-dati-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Errore durante il download dei dati.");
    }
    setDownloading(false);
  }, []);

  const toggleConsent = async (staffId: string, value: boolean) => {
    setSavingConsent(staffId);
    const now = value ? new Date().toISOString() : null;
    await supabase.from("privacy_consents").upsert(
      { staff_id: staffId, consent_given: value, consent_date: now, updated_at: new Date().toISOString() },
      { onConflict: "staff_id" }
    );
    setConsents(prev => prev.map(c => c.staff_id === staffId ? { ...c, consent_given: value, consent_date: now } : c));
    setSavingConsent(null);
  };

  const cardStyle: React.CSSProperties = {
    background: "#fff", border: "1px solid #D8CCB8", borderRadius: 12, padding: "20px 24px",
  };

  const kpiStyle = (color: string): React.CSSProperties => ({
    ...cardStyle, borderTop: `3px solid ${color}`, textAlign: "center" as const,
  });

  const sectionTitle = (text: string) => (
    <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 20, color: "#1F3326", margin: "40px 0 16px" }}>{text}</h2>
  );

  if (settingsLoading) return <div style={{ padding: 32, fontFamily: "'Albert Sans', sans-serif", color: "#6C6B5D" }}>Caricamento...</div>;

  return (
    <div style={{ maxWidth: "100%" }}>
      <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, color: "#1F3326", margin: "0 0 6px" }}>Privacy e protezione dati</h1>
      <p style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 15, color: "#6C6B5D", margin: "0 0 32px" }}>
        I tuoi dati personali nel gestionale Le 4 Camere
      </p>

      {/* Section 1 — I tuoi dati */}
      {sectionTitle("I tuoi dati nel gestionale")}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14, marginBottom: 24 }}>
        <div style={kpiStyle("#1F3326")}>
          <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 12, color: "#6C6B5D", marginBottom: 4 }}>Profilo</div>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: "#1F3326" }}>{stats.profileName || "—"}</div>
          <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 11, color: "#6C6B5D" }}>{stats.profileEmail}</div>
          <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 11, color: "#6C6B5D", textTransform: "capitalize" }}>{stats.profileRole} &middot; dal {stats.createdAt}</div>
        </div>
        <div style={kpiStyle("#4F7B8C")}>
          <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 12, color: "#6C6B5D", marginBottom: 4 }}>Turni registrati</div>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: "#4F7B8C" }}>{stats.shifts}</div>
        </div>
        <div style={kpiStyle("#2D5A3D")}>
          <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 12, color: "#6C6B5D", marginBottom: 4 }}>Ore lavorate</div>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: "#2D5A3D" }}>{stats.hours}</div>
        </div>
        <div style={kpiStyle("#C77B4A")}>
          <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 12, color: "#6C6B5D", marginBottom: 4 }}>Assenze</div>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: "#C77B4A" }}>{stats.leaves.permesso + stats.leaves.ferie + stats.leaves.malattia}</div>
          <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 11, color: "#6C6B5D" }}>
            {stats.leaves.permesso} permessi &middot; {stats.leaves.ferie} ferie &middot; {stats.leaves.malattia} malattia
          </div>
        </div>
        <div style={kpiStyle("#BFA762")}>
          <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 12, color: "#6C6B5D", marginBottom: 4 }}>Movimenti cassa</div>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: "#BFA762" }}>{stats.cashMoves}</div>
        </div>
        <div style={kpiStyle("#6C6B5D")}>
          <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 12, color: "#6C6B5D", marginBottom: 4 }}>Ultimo accesso</div>
          <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 14, color: "#1F3326", fontWeight: 600, marginTop: 8 }}>{stats.lastLogin}</div>
        </div>
      </div>

      <button
        onClick={downloadMyData}
        disabled={downloading}
        style={{
          background: "#1F3326", color: "#FAF9F5", border: "none", borderRadius: 8,
          padding: "10px 20px", fontFamily: "'Albert Sans', sans-serif", fontSize: 14,
          fontWeight: 600, cursor: downloading ? "wait" : "pointer",
          display: "inline-flex", alignItems: "center", gap: 8, opacity: downloading ? 0.6 : 1,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        {downloading ? "Download in corso..." : "Scarica i miei dati"}
      </button>
      <p style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 12, color: "#6C6B5D", marginTop: 8 }}>
        Diritto di accesso ai dati — Art. 15 GDPR
      </p>

      {/* Section 2 — Come usiamo i tuoi dati */}
      {sectionTitle("Come usiamo i tuoi dati")}
      <p style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 14, color: "#6C6B5D", lineHeight: 1.6, marginBottom: 20 }}>
        Raccogliamo e utilizziamo i tuoi dati personali per le seguenti finalita:
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {[
          { title: "Gestione turni e presenze", desc: "Per organizzare i turni di lavoro e calcolare le ore lavorate.", data: "Nome, orari turno, presenze, assenze.", basis: "Esecuzione del contratto di lavoro (Art. 6.1.b GDPR)" },
          { title: "Gestione retribuzioni", desc: "Per calcolare compensi e costi del personale.", data: "Ore lavorate, costo orario, tipo contratto.", basis: "Obbligo legale del datore di lavoro (Art. 6.1.c GDPR)" },
          { title: "Operazioni di cassa", desc: "Per tracciare i movimenti contanti durante il tuo turno.", data: "Movimenti registrati, importi, orari.", basis: "Legittimo interesse aziendale (Art. 6.1.f GDPR)" },
          { title: "Gestione magazzino", desc: "Per registrare carichi e scarichi effettuati.", data: "Movimenti magazzino associati al tuo account.", basis: "Legittimo interesse aziendale (Art. 6.1.f GDPR)" },
          { title: "Sicurezza e accessi", desc: "Per proteggere il sistema e tracciare gli accessi.", data: "Data/ora di login, indirizzo IP.", basis: "Legittimo interesse aziendale (Art. 6.1.f GDPR)" },
        ].map((item, i) => (
          <div key={i} style={cardStyle}>
            <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 15, fontWeight: 600, color: "#1F3326", marginBottom: 6 }}>{item.title}</div>
            <p style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 14, color: "#6C6B5D", margin: "0 0 8px", lineHeight: 1.5 }}>{item.desc}</p>
            <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 13, color: "#6C6B5D" }}>
              <strong>Dati:</strong> {item.data}
            </div>
            <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 13, color: "#4F7B8C", marginTop: 4 }}>
              <strong>Base giuridica:</strong> {item.basis}
            </div>
          </div>
        ))}
      </div>

      {/* Section 3 — I tuoi diritti */}
      {sectionTitle("I tuoi diritti")}
      <div style={{ ...cardStyle, marginBottom: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {[
            { right: "Accedere ai tuoi dati", desc: "Usa il bottone \"Scarica i miei dati\" qui sopra." },
            { right: "Rettificare i tuoi dati", desc: "Contatta l'amministratore per correggere dati errati." },
            { right: "Opporti al trattamento", desc: "Per dati trattati su base di legittimo interesse." },
            { right: "Presentare reclamo", desc: "Al Garante per la protezione dei dati personali (www.garanteprivacy.it)." },
          ].map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2D5A3D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 2, flexShrink: 0 }}>
                <path d="M9 11l3 3L22 4" />
              </svg>
              <div>
                <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 14, fontWeight: 600, color: "#1F3326" }}>{item.right}</div>
                <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 13, color: "#6C6B5D" }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 14, color: "#6C6B5D", lineHeight: 1.6 }}>
        <strong>Titolare del trattamento:</strong> {hotelName} — {hotelAddress}<br />
        <strong>Contatto:</strong> {hotelEmail}
      </div>

      {/* Section 4 — Conservazione dati */}
      {sectionTitle("Conservazione dati")}
      <div style={cardStyle}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            "I dati del rapporto di lavoro vengono conservati per 5 anni dalla cessazione del rapporto, come previsto dalla normativa italiana.",
            "I log di accesso vengono conservati per 6 mesi.",
            "Puoi richiedere la cancellazione dei dati non piu necessari contattando l'amministratore.",
          ].map((text, i) => (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#BFA762", marginTop: 7, flexShrink: 0 }} />
              <span style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 14, color: "#6C6B5D", lineHeight: 1.5 }}>{text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Section 5 — Admin: Gestione consensi */}
      {isAdmin && (
        <>
          {sectionTitle("Gestione consensi")}
          <p style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 14, color: "#6C6B5D", marginBottom: 16, lineHeight: 1.5 }}>
            Gestisci lo stato dell&apos;informativa privacy per ogni membro dello staff.
          </p>

          {consents.length === 0 ? (
            <div style={{ ...cardStyle, textAlign: "center", color: "#6C6B5D", padding: 32 }}>
              <p style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 14 }}>
                Nessun membro dello staff trovato. La tabella privacy_consents potrebbe non essere stata creata.
              </p>
              <p style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 12, marginTop: 8, color: "#9E3B2E" }}>
                Esegui la migrazione SQL dal README per creare la tabella.
              </p>
            </div>
          ) : (
            <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'Albert Sans', sans-serif", fontSize: 14 }}>
                <thead>
                  <tr style={{ background: "#F3EBDD" }}>
                    <th style={{ textAlign: "left", padding: "10px 16px", fontWeight: 600, color: "#1F3326" }}>Staff</th>
                    <th style={{ textAlign: "center", padding: "10px 16px", fontWeight: 600, color: "#1F3326" }}>Informativa</th>
                    <th style={{ textAlign: "left", padding: "10px 16px", fontWeight: 600, color: "#1F3326" }}>Data</th>
                  </tr>
                </thead>
                <tbody>
                  {consents.map((c, i) => (
                    <tr key={c.staff_id} style={{ borderTop: i > 0 ? "1px solid #F3EBDD" : undefined }}>
                      <td style={{ padding: "10px 16px", color: "#1F3326" }}>{c.staff_name}</td>
                      <td style={{ padding: "10px 16px", textAlign: "center" }}>
                        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={c.consent_given}
                            disabled={savingConsent === c.staff_id}
                            onChange={e => toggleConsent(c.staff_id, e.target.checked)}
                            style={{ width: 16, height: 16, accentColor: "#2D5A3D" }}
                          />
                          <span style={{ fontSize: 12, color: c.consent_given ? "#2D5A3D" : "#9E3B2E", fontWeight: 600 }}>
                            {c.consent_given ? "Firmata" : "Da consegnare"}
                          </span>
                        </label>
                      </td>
                      <td style={{ padding: "10px 16px", color: "#6C6B5D", fontSize: 13 }}>
                        {c.consent_date ? new Date(c.consent_date).toLocaleDateString("it-IT") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Disclaimer */}
      <div style={{
        marginTop: 40, padding: "14px 18px", background: "#F3EBDD", borderRadius: 8,
        borderLeft: "4px solid #C77B4A",
      }}>
        <p style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 13, color: "#6C6B5D", margin: 0, lineHeight: 1.6 }}>
          <strong>Disclaimer:</strong> Questa informativa e stata generata come modello indicativo. Si raccomanda di farla verificare da un consulente legale o del lavoro prima dell&apos;utilizzo ufficiale.
        </p>
      </div>
    </div>
  );
}
