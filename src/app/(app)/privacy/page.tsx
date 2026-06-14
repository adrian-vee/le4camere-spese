"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRole } from "@/lib/useRole";
import { useSettings } from "@/lib/useSettings";
import { generateConsentPdf } from "@/lib/pdf";

type StaffConsent = {
  staff_id: string;
  staff_name: string;
  staff_type: string;
  consent_given: boolean;
  consent_date: string | null;
  accepted_via: string | null;
  email_sent_at: string | null;
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
  const hotelPhone = get<string>("hotel_phone") || "";

  // User stats
  const [stats, setStats] = useState({ shifts: 0, hours: 0, leaves: { permesso: 0, ferie: 0, malattia: 0 }, cashMoves: 0, lastLogin: "", profileName: "", profileEmail: "", profileRole: "", createdAt: "" });
  const [downloading, setDownloading] = useState(false);
  const [consents, setConsents] = useState<StaffConsent[]>([]);
  const [savingConsent, setSavingConsent] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);
  const [signedModal, setSignedModal] = useState<{ staffId: string; staffName: string } | null>(null);
  const [signedDate, setSignedDate] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [adminStaffId, setAdminStaffId] = useState<string | null>(null);
  const [adminAcceptChecked, setAdminAcceptChecked] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [{ data: profile }, { data: staffLink }] = await Promise.all([
        supabase.from("profiles").select("full_name, role, created_at").eq("id", user.id).single(),
        supabase.from("staff").select("id").eq("profile_id", user.id).eq("active", true).maybeSingle(),
      ]);

      const staffId = (staffLink as { id: string } | null)?.id;
      setAdminStaffId(staffId ?? null);

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
  const loadConsents = useCallback(async () => {
    if (!isAdmin) return;
    const [{ data: staff }, { data: consentData }] = await Promise.all([
      supabase.from("staff").select("id, name, type").eq("active", true).order("name"),
      supabase.from("privacy_consents").select("staff_id, consent_given, consent_date, accepted_via, email_sent_at"),
    ]);
    type ConsentRow = { staff_id: string; consent_given: boolean; consent_date: string | null; accepted_via: string | null; email_sent_at: string | null };
    const consentMap = new Map<string, ConsentRow>();
    for (const c of (consentData ?? []) as ConsentRow[]) {
      consentMap.set(c.staff_id, c);
    }
    setConsents(
      ((staff ?? []) as { id: string; name: string; type: string }[]).map(s => ({
        staff_id: s.id,
        staff_name: s.name,
        staff_type: s.type === "a_chiamata" ? "A chiamata" : "Dipendente",
        consent_given: consentMap.get(s.id)?.consent_given ?? false,
        consent_date: consentMap.get(s.id)?.consent_date ?? null,
        accepted_via: consentMap.get(s.id)?.accepted_via ?? null,
        email_sent_at: consentMap.get(s.id)?.email_sent_at ?? null,
      }))
    );
  }, [isAdmin, supabase]);

  useEffect(() => { loadConsents(); }, [loadConsents]);

  // Get admin email for test
  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) setUserEmail(user.email);
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

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3500); }

  const saveSignedConsent = async () => {
    if (!signedModal) return;
    setSavingConsent(signedModal.staffId);
    const consentDate = signedDate ? new Date(signedDate).toISOString() : new Date().toISOString();
    const { error } = await supabase.from("privacy_consents").upsert(
      { staff_id: signedModal.staffId, consent_given: true, consent_date: consentDate, accepted_via: "carta", updated_at: new Date().toISOString() },
      { onConflict: "staff_id" }
    );
    setSavingConsent(null);
    if (error) { showToast("Errore salvataggio consenso"); return; }
    showToast(`Consenso firmato registrato per ${signedModal.staffName}`);
    setSignedModal(null);
    setSignedDate("");
    loadConsents();
  };

  const adminHasConsent = adminStaffId ? consents.find(c => c.staff_id === adminStaffId)?.consent_given ?? false : false;

  const acceptAdminConsent = async () => {
    if (!adminStaffId) return;
    setSavingConsent("admin");
    const { error } = await supabase.from("privacy_consents").upsert(
      { staff_id: adminStaffId, consent_given: true, consent_date: new Date().toISOString(), accepted_via: "diretto", updated_at: new Date().toISOString() },
      { onConflict: "staff_id" }
    );
    setSavingConsent(null);
    if (error) { showToast("Errore salvataggio consenso"); return; }
    showToast("Il tuo consenso privacy e stato registrato");
    setAdminAcceptChecked(false);
    loadConsents();
  };

  const downloadConsentPdf = (c: StaffConsent) => {
    const doc = generateConsentPdf([{
      staffName: c.staff_name, hotelName, hotelAddress, hotelEmail, hotelPhone,
      consentGiven: c.consent_given, consentDate: c.consent_date ?? undefined, acceptedVia: c.accepted_via ?? undefined,
    }]);
    doc.save(`consenso-privacy-${c.staff_name.replace(/\s+/g, "-").toLowerCase()}.pdf`);
  };

  const downloadAllConsentsPdf = () => {
    const entries = consents.filter(c => !c.consent_given).map(c => ({
      staffName: c.staff_name, hotelName, hotelAddress, hotelEmail, hotelPhone,
    }));
    if (entries.length === 0) { showToast("Tutti hanno già dato il consenso"); return; }
    const doc = generateConsentPdf(entries);
    doc.save("consensi-privacy-tutti.pdf");
  };

  const sendConsentEmail = async (staffIds: string[]) => {
    const id = staffIds.length === 1 ? staffIds[0] : "bulk";
    setSendingEmail(id);
    try {
      const res = await fetch("/api/privacy/send-consent-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staff_ids: staffIds }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.noSmtp ? "SMTP non configurato. Configura nelle Impostazioni." : (data.error || "Errore invio"));
        setSendingEmail(null);
        return;
      }
      const msg = data.sent === 1 ? "Email consenso inviata" : `${data.sent} email inviate`;
      showToast(data.errors?.length ? `${msg} (${data.errors.length} errori)` : msg);
      loadConsents();
    } catch { showToast("Errore di connessione"); }
    setSendingEmail(null);
  };

  const sendTestEmail = async () => {
    if (!userEmail) return;
    setSendingEmail("test");
    try {
      const res = await fetch("/api/privacy/send-consent-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test_email: userEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.noSmtp ? "SMTP non configurato" : (data.error || "Errore invio"));
      } else {
        showToast(`Email di prova inviata a ${userEmail}`);
      }
    } catch { showToast("Errore di connessione"); }
    setSendingEmail(null);
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

          {/* Admin self-consent banner */}
          {adminStaffId && !adminHasConsent && (
            <div style={{
              ...cardStyle, borderLeft: "4px solid #C77B4A", background: "#FFF8F0",
              marginBottom: 20,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <span style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 15, fontWeight: 700, color: "#1F3326" }}>
                  Non hai ancora firmato l&apos;informativa privacy
                </span>
              </div>
              <p style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 14, color: "#6C6B5D", margin: "0 0 16px", lineHeight: 1.5 }}>
                Come amministratore, devi anche tu confermare la presa visione dell&apos;informativa privacy.
              </p>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 16, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={adminAcceptChecked}
                  onChange={e => setAdminAcceptChecked(e.target.checked)}
                  style={{ width: 18, height: 18, marginTop: 2, accentColor: "#1F3326" }}
                />
                <span style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 14, color: "#1F3326", lineHeight: 1.5 }}>
                  Confermo di aver letto e compreso l&apos;informativa privacy
                </span>
              </label>
              <button
                onClick={acceptAdminConsent}
                disabled={!adminAcceptChecked || savingConsent === "admin"}
                style={{
                  padding: "10px 20px", background: adminAcceptChecked ? "#2D5A3D" : "#ccc", color: "#FAF9F5",
                  border: "none", borderRadius: 8, fontFamily: "'Albert Sans', sans-serif", fontSize: 14,
                  fontWeight: 600, cursor: adminAcceptChecked && savingConsent !== "admin" ? "pointer" : "not-allowed",
                  opacity: savingConsent === "admin" ? 0.6 : 1,
                }}
              >
                {savingConsent === "admin" ? "Salvataggio..." : "Accetta informativa"}
              </button>
            </div>
          )}

          {!adminStaffId && (
            <div style={{
              ...cardStyle, borderLeft: "4px solid #4F7B8C", background: "#F0F6F8",
              marginBottom: 20,
            }}>
              <p style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 14, color: "#6C6B5D", margin: 0, lineHeight: 1.5 }}>
                Per firmare il consenso privacy, aggiungi te stesso come membro dello staff nella sezione Personale.
              </p>
            </div>
          )}

          {/* Action bar */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
            <button
              onClick={sendTestEmail}
              disabled={sendingEmail === "test" || !userEmail}
              style={{
                background: "#FFFFFF", border: "1px solid #D8CCB8", borderRadius: 8, padding: "8px 16px",
                fontFamily: "'Albert Sans', sans-serif", fontSize: 13, fontWeight: 600, color: "#1F3326",
                cursor: sendingEmail === "test" ? "wait" : "pointer", opacity: sendingEmail === "test" ? 0.6 : 1,
                display: "inline-flex", alignItems: "center", gap: 6,
              }}
            >
              📧 {sendingEmail === "test" ? "Invio..." : "Invia email di prova a me"}
            </button>
            {(() => {
              const noConsent = consents.filter(c => !c.consent_given);
              if (noConsent.length === 0) return null;
              return (
                <>
                  <button
                    onClick={() => sendConsentEmail(noConsent.map(c => c.staff_id))}
                    disabled={sendingEmail === "bulk"}
                    style={{
                      background: "#1F3326", border: "none", borderRadius: 8, padding: "8px 16px",
                      fontFamily: "'Albert Sans', sans-serif", fontSize: 13, fontWeight: 600, color: "#FAF9F5",
                      cursor: sendingEmail === "bulk" ? "wait" : "pointer", opacity: sendingEmail === "bulk" ? 0.6 : 1,
                      display: "inline-flex", alignItems: "center", gap: 6,
                    }}
                  >
                    📧 {sendingEmail === "bulk" ? "Invio..." : `Invia a tutti senza consenso (${noConsent.length})`}
                  </button>
                  <button
                    onClick={downloadAllConsentsPdf}
                    style={{
                      background: "#FFFFFF", border: "1px solid #D8CCB8", borderRadius: 8, padding: "8px 16px",
                      fontFamily: "'Albert Sans', sans-serif", fontSize: 13, fontWeight: 600, color: "#1F3326",
                      cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
                    }}
                  >
                    📄 Stampa tutti i consensi ({noConsent.length})
                  </button>
                </>
              );
            })()}
          </div>

          {consents.length === 0 ? (
            <div style={{ ...cardStyle, textAlign: "center", color: "#6C6B5D", padding: 32 }}>
              <p style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 14 }}>
                Nessun membro dello staff trovato.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {consents.map(c => {
                const accepted = c.consent_given;
                const emailSent = !!c.email_sent_at && !accepted;
                return (
                  <div key={c.staff_id} style={{
                    ...cardStyle,
                    borderLeft: `4px solid ${accepted ? "#2D5A3D" : emailSent ? "#C77B4A" : "#9E3B2E"}`,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <span style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 16, fontWeight: 700, color: "#1F3326" }}>{c.staff_name}</span>
                      <span style={{
                        fontFamily: "'Albert Sans', sans-serif", fontSize: 12, fontWeight: 600, padding: "3px 10px",
                        borderRadius: 20, background: "#F3EBDD", color: "#6C6B5D",
                      }}>{c.staff_type}</span>
                    </div>
                    <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 14, color: "#6C6B5D", marginBottom: 12 }}>
                      {accepted ? (
                        <span style={{ color: "#2D5A3D" }}>
                          ✅ Accettato il {c.consent_date ? new Date(c.consent_date).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" }) : "—"}
                          {c.accepted_via ? ` (via ${c.accepted_via === "carta" ? "firma cartacea" : c.accepted_via})` : ""}
                        </span>
                      ) : emailSent ? (
                        <span style={{ color: "#C77B4A" }}>
                          ⏳ Email inviata il {new Date(c.email_sent_at!).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })} — In attesa
                        </span>
                      ) : (
                        <span style={{ color: "#9E3B2E" }}>❌ Non inviata</span>
                      )}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      <button
                        onClick={() => sendConsentEmail([c.staff_id])}
                        disabled={sendingEmail === c.staff_id}
                        style={{
                          background: "#FFFFFF", border: "1px solid #D8CCB8", borderRadius: 8, padding: "6px 14px",
                          fontFamily: "'Albert Sans', sans-serif", fontSize: 12, fontWeight: 600, color: "#1F3326",
                          cursor: sendingEmail === c.staff_id ? "wait" : "pointer", opacity: sendingEmail === c.staff_id ? 0.6 : 1,
                        }}
                      >
                        📧 {accepted || emailSent ? "Rinvia email" : "Invia email consenso"}
                      </button>
                      <button
                        onClick={() => downloadConsentPdf(c)}
                        style={{
                          background: "#FFFFFF", border: "1px solid #D8CCB8", borderRadius: 8, padding: "6px 14px",
                          fontFamily: "'Albert Sans', sans-serif", fontSize: 12, fontWeight: 600, color: "#1F3326", cursor: "pointer",
                        }}
                      >
                        📄 Stampa consenso
                      </button>
                      {!accepted && (
                        <button
                          onClick={() => { setSignedModal({ staffId: c.staff_id, staffName: c.staff_name }); setSignedDate(new Date().toISOString().slice(0, 10)); }}
                          style={{
                            background: "#FFFFFF", border: "1px solid #D8CCB8", borderRadius: 8, padding: "6px 14px",
                            fontFamily: "'Albert Sans', sans-serif", fontSize: 12, fontWeight: 600, color: "#2D5A3D", cursor: "pointer",
                          }}
                        >
                          ✓ Consenso firmato
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Signed consent modal */}
          {signedModal && (
            <div className="modal-overlay" onClick={() => setSignedModal(null)}>
              <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 440, padding: "20px 24px", paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 18, color: "#1F3326", margin: 0 }}>Registra consenso firmato</h3>
                  <button onClick={() => setSignedModal(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#6C6B5D" }}>×</button>
                </div>
                <p style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 14, color: "#6C6B5D", margin: "0 0 16px" }}>
                  Conferma che <strong>{signedModal.staffName}</strong> ha firmato il modulo cartaceo di presa visione dell&apos;informativa privacy.
                </p>
                <label style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 13, fontWeight: 600, color: "#1F3326", display: "block", marginBottom: 6 }}>
                  Data della firma
                </label>
                <input
                  type="date"
                  value={signedDate}
                  onChange={e => setSignedDate(e.target.value)}
                  style={{
                    width: "100%", padding: "8px 12px", border: "1px solid #D8CCB8", borderRadius: 8,
                    fontFamily: "'Albert Sans', sans-serif", fontSize: 14, marginBottom: 20, boxSizing: "border-box",
                  }}
                />
                <button
                  onClick={saveSignedConsent}
                  disabled={savingConsent === signedModal.staffId}
                  style={{
                    width: "100%", padding: "12px 20px", background: "#2D5A3D", color: "#FAF9F5", border: "none",
                    borderRadius: 8, fontFamily: "'Albert Sans', sans-serif", fontSize: 15, fontWeight: 600,
                    cursor: savingConsent ? "wait" : "pointer", opacity: savingConsent ? 0.6 : 1,
                  }}
                >
                  {savingConsent ? "Salvataggio..." : "Conferma consenso firmato"}
                </button>
              </div>
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
          <strong>Disclaimer:</strong> Questa informativa è un modello indicativo basato sul GDPR. Si raccomanda di farla verificare da un consulente legale o del lavoro prima dell&apos;utilizzo ufficiale.
        </p>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: "#1F3326", color: "#FAF9F5", padding: "12px 24px", borderRadius: 10,
          fontFamily: "'Albert Sans', sans-serif", fontSize: 14, fontWeight: 600,
          boxShadow: "0 4px 20px rgba(0,0,0,.15)", zIndex: 9999, maxWidth: "calc(100vw - 48px)",
          textAlign: "center", animation: "fadeIn .2s ease",
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}
