"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { isoToday } from "@/lib/format";
import { useRole } from "@/lib/useRole";
import { useSettings } from "@/lib/useSettings";
import { useToast } from "@/lib/useToast";
import { Toast } from "@/components/Toast";
import { generateConsentPdf, generateMyDataPdf, type MyDataPdfInput } from "@/lib/pdf";
import DatePickerIT from "@/components/ui/DatePickerIT";

type StaffConsent = {
  staff_id: string | null;
  profile_id: string | null;
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

  const [stats, setStats] = useState({ shifts: 0, hours: 0, leaves: { permesso: 0, ferie: 0, malattia: 0 }, cashMoves: 0, lastLogin: "", profileName: "", profileEmail: "", profileRole: "", createdAt: "" });
  const [downloading, setDownloading] = useState(false);
  const [consents, setConsents] = useState<StaffConsent[]>([]);
  const [savingConsent, setSavingConsent] = useState<string | null>(null);
  const { toast, showToast } = useToast();
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);
  const [signedModal, setSignedModal] = useState<{ staffId: string | null; profileId: string | null; staffName: string } | null>(null);
  const [signedDate, setSignedDate] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [adminStaffId, setAdminStaffId] = useState<string | null>(null);
  const [adminAcceptChecked, setAdminAcceptChecked] = useState(false);
  const [myProfileId, setMyProfileId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setMyProfileId(user.id);
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

  const loadConsents = useCallback(async () => {
    if (!isAdmin) return;
    const [{ data: staff }, { data: consentData }, { data: adminProfiles }] = await Promise.all([
      supabase.from("staff").select("id, name, type, profile_id").eq("active", true).order("name"),
      supabase.from("privacy_consents").select("staff_id, profile_id, consent_given, consent_date, accepted_via, email_sent_at"),
      supabase.from("profiles").select("id, full_name, role").in("role", ["admin", "manager"]),
    ]);
    type ConsentRow = { staff_id: string | null; profile_id: string | null; consent_given: boolean; consent_date: string | null; accepted_via: string | null; email_sent_at: string | null };
    const consentByStaff = new Map<string, ConsentRow>();
    const consentByProfile = new Map<string, ConsentRow>();
    for (const c of (consentData ?? []) as ConsentRow[]) {
      if (c.staff_id) consentByStaff.set(c.staff_id, c);
      if (c.profile_id) consentByProfile.set(c.profile_id, c);
    }
    const staffProfileIds = new Set<string>();
    const result: StaffConsent[] = [];
    for (const s of (staff ?? []) as { id: string; name: string; type: string; profile_id: string | null }[]) {
      if (s.profile_id) staffProfileIds.add(s.profile_id);
      const consent = consentByStaff.get(s.id);
      result.push({
        staff_id: s.id, profile_id: s.profile_id, staff_name: s.name,
        staff_type: s.type === "a_chiamata" ? "A chiamata" : "Dipendente",
        consent_given: consent?.consent_given ?? false, consent_date: consent?.consent_date ?? null,
        accepted_via: consent?.accepted_via ?? null, email_sent_at: consent?.email_sent_at ?? null,
      });
    }
    for (const p of (adminProfiles ?? []) as { id: string; full_name: string | null; role: string }[]) {
      if (staffProfileIds.has(p.id)) continue;
      const consent = consentByProfile.get(p.id);
      result.push({
        staff_id: null, profile_id: p.id, staff_name: p.full_name || "Admin",
        staff_type: p.role === "admin" ? "Admin" : "Manager",
        consent_given: consent?.consent_given ?? false, consent_date: consent?.consent_date ?? null,
        accepted_via: consent?.accepted_via ?? null, email_sent_at: consent?.email_sent_at ?? null,
      });
    }
    setConsents(result);
  }, [isAdmin, supabase]);

  useEffect(() => { loadConsents(); }, [loadConsents]);

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
      const data: MyDataPdfInput = await res.json();
      const doc = await generateMyDataPdf(data);
      doc.save(`i-miei-dati-${isoToday()}.pdf`);
    } catch {
      alert("Errore durante il download dei dati.");
    }
    setDownloading(false);
  }, []);

  const saveSignedConsent = async () => {
    if (!signedModal) return;
    const entryId = signedModal.staffId || signedModal.profileId || "saving";
    setSavingConsent(entryId);
    const consentDate = signedDate ? new Date(signedDate).toISOString() : new Date().toISOString();
    const now = new Date().toISOString();
    let saveOk = false;
    if (signedModal.staffId) {
      const { error } = await supabase.from("privacy_consents").upsert(
        { staff_id: signedModal.staffId, consent_given: true, consent_date: consentDate, accepted_via: "carta", updated_at: now },
        { onConflict: "staff_id" }
      );
      saveOk = !error;
      if (error) showToast("Errore salvataggio consenso");
    } else if (signedModal.profileId) {
      const { data: existing } = await supabase.from("privacy_consents").select("profile_id").eq("profile_id", signedModal.profileId).maybeSingle();
      if (existing) {
        const { error } = await supabase.from("privacy_consents").update(
          { consent_given: true, consent_date: consentDate, accepted_via: "carta", updated_at: now }
        ).eq("profile_id", signedModal.profileId);
        saveOk = !error;
      } else {
        const { error } = await supabase.from("privacy_consents").insert(
          { profile_id: signedModal.profileId, consent_given: true, consent_date: consentDate, accepted_via: "carta", updated_at: now }
        );
        saveOk = !error;
      }
      if (!saveOk) showToast("Errore salvataggio consenso");
    }
    setSavingConsent(null);
    if (saveOk) {
      showToast(`Consenso firmato registrato per ${signedModal.staffName}`);
      setSignedModal(null);
      setSignedDate("");
      loadConsents();
    }
  };

  const myConsentEntry = consents.find(c =>
    (adminStaffId && c.staff_id === adminStaffId) || (myProfileId && c.profile_id === myProfileId)
  );
  const adminHasConsent = myConsentEntry?.consent_given ?? false;

  const acceptAdminConsent = async () => {
    if (!myProfileId) return;
    setSavingConsent("admin");
    const now = new Date().toISOString();
    let saveOk = false;
    if (adminStaffId) {
      const { error } = await supabase.from("privacy_consents").upsert(
        { staff_id: adminStaffId, profile_id: myProfileId, consent_given: true, consent_date: now, accepted_via: "diretto", updated_at: now },
        { onConflict: "staff_id" }
      );
      saveOk = !error;
      if (error) showToast("Errore salvataggio consenso");
    } else {
      const { data: existing } = await supabase.from("privacy_consents").select("profile_id").eq("profile_id", myProfileId).maybeSingle();
      if (existing) {
        const { error } = await supabase.from("privacy_consents").update(
          { consent_given: true, consent_date: now, accepted_via: "diretto", updated_at: now }
        ).eq("profile_id", myProfileId);
        saveOk = !error;
      } else {
        const { error } = await supabase.from("privacy_consents").insert(
          { profile_id: myProfileId, consent_given: true, consent_date: now, accepted_via: "diretto", updated_at: now }
        );
        saveOk = !error;
      }
      if (!saveOk) showToast("Errore salvataggio consenso");
    }
    setSavingConsent(null);
    if (saveOk) {
      showToast("Il tuo consenso privacy e stato registrato");
      setAdminAcceptChecked(false);
      loadConsents();
    }
  };

  const downloadConsentPdf = async (c: StaffConsent) => {
    const doc = await generateConsentPdf([{
      staffName: c.staff_name, hotelName, hotelAddress, hotelEmail, hotelPhone,
      consentGiven: c.consent_given, consentDate: c.consent_date ?? undefined, acceptedVia: c.accepted_via ?? undefined,
    }]);
    doc.save(`consenso-privacy-${c.staff_name.replace(/\s+/g, "-").toLowerCase()}.pdf`);
  };

  const downloadAllConsentsPdf = async () => {
    const entries = consents.filter(c => !c.consent_given).map(c => ({
      staffName: c.staff_name, hotelName, hotelAddress, hotelEmail, hotelPhone,
    }));
    if (entries.length === 0) { showToast("Tutti hanno gia dato il consenso"); return; }
    const doc = await generateConsentPdf(entries);
    doc.save("consensi-privacy-tutti.pdf");
  };

  const sendConsentEmail = async (staffIds: string[], profileIds?: string[]) => {
    const id = staffIds.length === 1 && !profileIds?.length ? staffIds[0] : (profileIds?.length === 1 && !staffIds.length ? profileIds[0] : "bulk");
    setSendingEmail(id);
    try {
      const res = await fetch("/api/privacy/send-consent-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staff_ids: staffIds.length ? staffIds : undefined,
          profile_ids: profileIds?.length ? profileIds : undefined,
        }),
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

  if (settingsLoading) return <div style={{ padding: 32, fontFamily: "'Albert Sans', sans-serif", color: "#6C6B5D" }}>Caricamento...</div>;

  const totalLeaves = stats.leaves.permesso + stats.leaves.ferie + stats.leaves.malattia;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px" }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 26, color: "#1F3326", margin: "0 0 4px", fontWeight: 500 }}>
          Privacy e protezione dati
        </h1>
        <p style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 14, color: "#888", margin: "0 0 12px" }}>
          I tuoi dati personali nel gestionale Le 4 Camere
        </p>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "5px 14px", borderRadius: 20, border: "1px solid #2d6a4f",
          fontFamily: "'Albert Sans', sans-serif", fontSize: 12, fontWeight: 600, color: "#2d6a4f",
          background: "rgba(45,106,79,0.06)",
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2d6a4f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          GDPR Compliant
        </span>
      </div>

      {/* ── Section 1: I tuoi dati nel gestionale ── */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 18, color: "#1F3326", margin: "0 0 16px", fontWeight: 500 }}>
          I tuoi dati nel gestionale
        </h2>
        <div className="privacy-kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 16 }}>
          {/* Profilo */}
          <div style={{ background: "#fff", border: "1px solid #D8CCB8", borderRadius: 12, padding: 16, textAlign: "center" }}>
            <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 11, letterSpacing: "1px", textTransform: "uppercase", color: "#888", marginBottom: 6 }}>Profilo</div>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 600, color: "#1F3326", lineHeight: 1.2 }}>{stats.profileName || "\u2014"}</div>
            <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 11, color: "#888", marginTop: 4 }}>{stats.profileEmail}</div>
            <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 11, color: "#888", textTransform: "capitalize" }}>{stats.profileRole} &middot; dal {stats.createdAt}</div>
          </div>
          {/* Turni */}
          <div style={{ background: "#fff", border: "1px solid #D8CCB8", borderRadius: 12, padding: 16, textAlign: "center" }}>
            <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 11, letterSpacing: "1px", textTransform: "uppercase", color: "#888", marginBottom: 6 }}>Turni</div>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 600, color: "#4F7B8C" }}>{stats.shifts}</div>
            <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 11, color: "#888", marginTop: 4 }}>registrati</div>
          </div>
          {/* Ore */}
          <div style={{ background: "#fff", border: "1px solid #D8CCB8", borderRadius: 12, padding: 16, textAlign: "center" }}>
            <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 11, letterSpacing: "1px", textTransform: "uppercase", color: "#888", marginBottom: 6 }}>Ore lavorate</div>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 600, color: "#2D5A3D" }}>{stats.hours}</div>
            <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 11, color: "#888", marginTop: 4 }}>totali</div>
          </div>
          {/* Assenze */}
          <div style={{ background: "#fff", border: "1px solid #D8CCB8", borderRadius: 12, padding: 16, textAlign: "center" }}>
            <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 11, letterSpacing: "1px", textTransform: "uppercase", color: "#888", marginBottom: 6 }}>Assenze</div>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 600, color: "#C77B4A" }}>{totalLeaves}</div>
            <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 11, color: "#888", marginTop: 4 }}>
              {stats.leaves.permesso}P &middot; {stats.leaves.ferie}F &middot; {stats.leaves.malattia}M
            </div>
          </div>
          {/* Movimenti cassa */}
          <div style={{ background: "#fff", border: "1px solid #D8CCB8", borderRadius: 12, padding: 16, textAlign: "center" }}>
            <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 11, letterSpacing: "1px", textTransform: "uppercase", color: "#888", marginBottom: 6 }}>Movimenti cassa</div>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 600, color: "#BFA762" }}>{stats.cashMoves}</div>
            <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 11, color: "#888", marginTop: 4 }}>registrati</div>
          </div>
          {/* Ultimo accesso */}
          <div style={{ background: "#fff", border: "1px solid #D8CCB8", borderRadius: 12, padding: 16, textAlign: "center" }}>
            <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 11, letterSpacing: "1px", textTransform: "uppercase", color: "#888", marginBottom: 6 }}>Ultimo accesso</div>
            <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 14, fontWeight: 600, color: "#1F3326", marginTop: 8 }}>{stats.lastLogin}</div>
          </div>
        </div>
        <button
          onClick={downloadMyData}
          disabled={downloading}
          style={{
            background: "#1F3326", color: "#fff", border: "none", borderRadius: 10,
            padding: "10px 22px", fontFamily: "'Albert Sans', sans-serif", fontSize: 14,
            fontWeight: 600, cursor: downloading ? "wait" : "pointer",
            display: "inline-flex", alignItems: "center", gap: 8, opacity: downloading ? 0.6 : 1,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          {downloading ? "Download in corso..." : "Scarica i miei dati"}
        </button>
        <p style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 12, color: "#888", marginTop: 6 }}>
          Diritto di accesso ai dati — Art. 15 GDPR
        </p>
      </div>

      {/* ── Section 2: Come usiamo i tuoi dati ── */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 18, color: "#1F3326", margin: "0 0 16px", fontWeight: 500 }}>
          Come usiamo i tuoi dati
        </h2>
        <div className="privacy-usage-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
          {[
            { title: "Gestione turni", desc: "Organizzazione turni e calcolo ore lavorate.", basis: "Art. 6.1.b GDPR" },
            { title: "Gestione retribuzioni", desc: "Calcolo compensi e costi del personale.", basis: "Art. 6.1.c GDPR" },
            { title: "Operazioni cassa", desc: "Tracciamento movimenti contanti durante il turno.", basis: "Art. 6.1.f GDPR" },
            { title: "Sicurezza e accessi", desc: "Protezione sistema e tracciamento accessi.", basis: "Art. 6.1.f GDPR" },
          ].map((item, i) => (
            <div key={i} style={{ background: "#F3EBDD", borderRadius: 12, padding: 20 }}>
              <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 15, fontWeight: 600, color: "#1F3326", marginBottom: 6 }}>{item.title}</div>
              <p style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 13, color: "#555", margin: "0 0 10px", lineHeight: 1.5 }}>{item.desc}</p>
              <span style={{
                display: "inline-block", padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                background: "#FAF9F5", border: "1px solid #D8CCB8", color: "#6C6B5D",
                fontFamily: "'Albert Sans', sans-serif",
              }}>
                {item.basis}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Section 3: I tuoi diritti ── */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 18, color: "#1F3326", margin: "0 0 16px", fontWeight: 500 }}>
          I tuoi diritti
        </h2>
        <div className="privacy-rights-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
          {[
            { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1F3326" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>, title: "Accedere ai tuoi dati", desc: "Usa il bottone \"Scarica i miei dati\" qui sopra." },
            { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1F3326" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.85 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>, title: "Rettificare i tuoi dati", desc: "Contatta l'amministratore per correggere dati errati." },
            { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1F3326" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>, title: "Opporti al trattamento", desc: "Per dati trattati su base di legittimo interesse." },
            { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1F3326" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>, title: "Presentare reclamo", desc: "Al Garante per la protezione dei dati (garanteprivacy.it)." },
          ].map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div style={{
                width: 38, height: 38, borderRadius: "50%", background: "#F3EBDD",
                display: "grid", placeItems: "center", flexShrink: 0,
              }}>{item.icon}</div>
              <div>
                <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 14, fontWeight: 700, color: "#1F3326" }}>{item.title}</div>
                <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 13, color: "#888", lineHeight: 1.5 }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Section 4: Conservazione dati ── */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 18, color: "#1F3326", margin: "0 0 16px", fontWeight: 500 }}>
          Conservazione dati
        </h2>
        <div style={{ background: "#FAF9F5", borderRadius: 12, padding: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {[
              "Dati del rapporto di lavoro conservati per 5 anni dalla cessazione, come da normativa italiana.",
              "Log di accesso conservati per 6 mesi.",
              "Puoi richiedere la cancellazione dei dati non piu necessari contattando l'amministratore.",
            ].map((text, i) => (
              <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#BFA762" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 2, flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
                <span style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 14, color: "#555", lineHeight: 1.5 }}>{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Titolare del trattamento ── */}
      <div style={{
        background: "#1F3326", borderRadius: 12, padding: "20px 24px", marginBottom: 28,
      }}>
        <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 12, letterSpacing: "1px", textTransform: "uppercase", color: "rgba(255,255,255,0.5)", marginBottom: 8 }}>
          Titolare del trattamento
        </div>
        <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 4 }}>
          {hotelName}
        </div>
        <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 13, color: "rgba(255,255,255,0.6)", marginBottom: 2 }}>
          {hotelAddress}
        </div>
        <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 13, color: "#BFA762", fontWeight: 600 }}>
          {hotelEmail}{hotelPhone ? ` \u00B7 ${hotelPhone}` : ""}
        </div>
      </div>

      {/* ── Section 5: Admin — Gestione consensi ── */}
      {isAdmin && (
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 18, color: "#1F3326", margin: "0 0 16px", fontWeight: 500 }}>
            Gestione consensi
          </h2>
          <p style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 14, color: "#888", marginBottom: 16, lineHeight: 1.5 }}>
            Gestisci lo stato dell&apos;informativa privacy per ogni membro dello staff.
          </p>

          {/* Admin self-consent banner */}
          {!adminHasConsent && (
            <div style={{
              background: "#FFF8F0", border: "1px solid #D8CCB8", borderLeft: "4px solid #C77B4A",
              borderRadius: 12, padding: "16px 20px", marginBottom: 20,
            }}>
              <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 15, fontWeight: 700, color: "#1F3326", marginBottom: 8 }}>
                Non hai ancora firmato l&apos;informativa privacy
              </div>
              <p style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 14, color: "#6C6B5D", margin: "0 0 14px", lineHeight: 1.5 }}>
                Come amministratore, devi anche tu confermare la presa visione dell&apos;informativa privacy.
              </p>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 14, cursor: "pointer" }}>
                <input type="checkbox" checked={adminAcceptChecked} onChange={e => setAdminAcceptChecked(e.target.checked)}
                  style={{ width: 18, height: 18, marginTop: 2, accentColor: "#1F3326" }} />
                <span style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 14, color: "#1F3326", lineHeight: 1.5 }}>
                  Confermo di aver letto e compreso l&apos;informativa privacy
                </span>
              </label>
              <button onClick={acceptAdminConsent} disabled={!adminAcceptChecked || savingConsent === "admin"}
                style={{
                  padding: "10px 20px", background: adminAcceptChecked ? "#2D5A3D" : "#ccc", color: "#fff",
                  border: "none", borderRadius: 8, fontFamily: "'Albert Sans', sans-serif", fontSize: 14,
                  fontWeight: 600, cursor: adminAcceptChecked && savingConsent !== "admin" ? "pointer" : "not-allowed",
                  opacity: savingConsent === "admin" ? 0.6 : 1,
                }}>
                {savingConsent === "admin" ? "Salvataggio..." : "Accetta informativa"}
              </button>
            </div>
          )}

          {/* Action bar */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
            <button onClick={sendTestEmail} disabled={sendingEmail === "test" || !userEmail}
              style={{
                background: "#fff", border: "1px solid #D8CCB8", borderRadius: 8, padding: "8px 16px",
                fontFamily: "'Albert Sans', sans-serif", fontSize: 13, fontWeight: 600, color: "#1F3326",
                cursor: sendingEmail === "test" ? "wait" : "pointer", opacity: sendingEmail === "test" ? 0.6 : 1,
                display: "inline-flex", alignItems: "center", gap: 6,
              }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              {sendingEmail === "test" ? "Invio..." : "Invia email di prova a me"}
            </button>
            {(() => {
              const noConsent = consents.filter(c => !c.consent_given);
              if (noConsent.length === 0) return null;
              const noConsentStaffIds = noConsent.filter(c => c.staff_id).map(c => c.staff_id!);
              const noConsentProfileIds = noConsent.filter(c => !c.staff_id && c.profile_id).map(c => c.profile_id!);
              return (
                <>
                  <button onClick={() => sendConsentEmail(noConsentStaffIds, noConsentProfileIds)} disabled={sendingEmail === "bulk"}
                    style={{
                      background: "#1F3326", border: "none", borderRadius: 8, padding: "8px 16px",
                      fontFamily: "'Albert Sans', sans-serif", fontSize: 13, fontWeight: 600, color: "#fff",
                      cursor: sendingEmail === "bulk" ? "wait" : "pointer", opacity: sendingEmail === "bulk" ? 0.6 : 1,
                      display: "inline-flex", alignItems: "center", gap: 6,
                    }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                    {sendingEmail === "bulk" ? "Invio..." : `Invia a tutti senza consenso (${noConsent.length})`}
                  </button>
                  <button onClick={downloadAllConsentsPdf}
                    style={{
                      background: "#fff", border: "1px solid #D8CCB8", borderRadius: 8, padding: "8px 16px",
                      fontFamily: "'Albert Sans', sans-serif", fontSize: 13, fontWeight: 600, color: "#1F3326",
                      cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
                    }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    Stampa tutti i consensi ({noConsent.length})
                  </button>
                </>
              );
            })()}
          </div>

          {consents.length === 0 ? (
            <div style={{ background: "#fff", border: "1px solid #D8CCB8", borderRadius: 12, padding: 32, textAlign: "center" }}>
              <p style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 14, color: "#888" }}>
                Nessun membro dello staff trovato.
              </p>
            </div>
          ) : (
            <div className="privacy-consent-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
              {consents.map(c => {
                const accepted = c.consent_given;
                const emailSent = !!c.email_sent_at && !accepted;
                const entryKey = c.staff_id || c.profile_id || "";
                const statusColor = accepted ? "#2D5A3D" : emailSent ? "#C77B4A" : "#9E3B2E";
                return (
                  <div key={entryKey} style={{
                    background: "#fff", border: "1px solid #D8CCB8", borderRadius: 12, padding: "14px 18px",
                    borderLeft: `3px solid ${statusColor}`,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 15, fontWeight: 700, color: "#1F3326" }}>{c.staff_name}</span>
                      <span style={{
                        fontFamily: "'Albert Sans', sans-serif", fontSize: 11, fontWeight: 600, padding: "3px 10px",
                        borderRadius: 20, background: "#F3EBDD", color: "#6C6B5D",
                      }}>{c.staff_type}</span>
                    </div>
                    <div style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 13, color: statusColor, marginBottom: 10, fontWeight: 500 }}>
                      {accepted ? (
                        <>Accettato il {c.consent_date ? new Date(c.consent_date).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" }) : "\u2014"}{c.accepted_via ? ` (${c.accepted_via === "carta" ? "firma cartacea" : c.accepted_via})` : ""}</>
                      ) : emailSent ? (
                        <>Email inviata il {new Date(c.email_sent_at!).toLocaleDateString("it-IT", { day: "numeric", month: "short" })} \u2014 In attesa</>
                      ) : (
                        <>Non inviata</>
                      )}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      <button
                        onClick={() => c.staff_id ? sendConsentEmail([c.staff_id]) : c.profile_id ? sendConsentEmail([], [c.profile_id]) : undefined}
                        disabled={sendingEmail === entryKey}
                        style={{
                          background: "#fff", border: "1px solid #D8CCB8", borderRadius: 6, padding: "5px 12px",
                          fontFamily: "'Albert Sans', sans-serif", fontSize: 11, fontWeight: 600, color: "#1F3326",
                          cursor: sendingEmail === entryKey ? "wait" : "pointer", opacity: sendingEmail === entryKey ? 0.6 : 1,
                        }}>
                        {accepted || emailSent ? "Rinvia" : "Invia email"}
                      </button>
                      <button onClick={() => downloadConsentPdf(c)}
                        style={{
                          background: "#fff", border: "1px solid #D8CCB8", borderRadius: 6, padding: "5px 12px",
                          fontFamily: "'Albert Sans', sans-serif", fontSize: 11, fontWeight: 600, color: "#1F3326", cursor: "pointer",
                        }}>
                        Stampa
                      </button>
                      {!accepted && (
                        <button onClick={() => { setSignedModal({ staffId: c.staff_id, profileId: c.profile_id, staffName: c.staff_name }); setSignedDate(isoToday()); }}
                          style={{
                            background: "#fff", border: "1px solid #D8CCB8", borderRadius: 6, padding: "5px 12px",
                            fontFamily: "'Albert Sans', sans-serif", fontSize: 11, fontWeight: 600, color: "#2D5A3D", cursor: "pointer",
                          }}>
                          Firmato
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
                  <button onClick={() => setSignedModal(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#6C6B5D" }}>&times;</button>
                </div>
                <p style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 14, color: "#6C6B5D", margin: "0 0 16px" }}>
                  Conferma che <strong>{signedModal.staffName}</strong> ha firmato il modulo cartaceo.
                </p>
                <label style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 13, fontWeight: 600, color: "#1F3326", display: "block", marginBottom: 6 }}>
                  Data della firma
                </label>
                <DatePickerIT value={signedDate} onChange={v => setSignedDate(v)} style={{ marginBottom: 20 }} />
                <button onClick={saveSignedConsent}
                  disabled={savingConsent === (signedModal.staffId || signedModal.profileId || "saving")}
                  style={{
                    width: "100%", padding: "12px 20px", background: "#2D5A3D", color: "#fff", border: "none",
                    borderRadius: 8, fontFamily: "'Albert Sans', sans-serif", fontSize: 15, fontWeight: 600,
                    cursor: savingConsent ? "wait" : "pointer", opacity: savingConsent ? 0.6 : 1,
                  }}>
                  {savingConsent ? "Salvataggio..." : "Conferma consenso firmato"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Disclaimer */}
      <div style={{
        padding: "14px 18px", background: "#F3EBDD", borderRadius: 12,
        borderLeft: "4px solid #C77B4A", marginBottom: 28,
      }}>
        <p style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: 13, color: "#6C6B5D", margin: 0, lineHeight: 1.6 }}>
          <strong>Disclaimer:</strong> Questa informativa e un modello indicativo basato sul GDPR. Si raccomanda di farla verificare da un consulente legale o del lavoro prima dell&apos;utilizzo ufficiale.
        </p>
      </div>

      <Toast toast={toast} />

      {/* Responsive styles */}
      <style>{`
        @media(max-width:767px){
          .privacy-kpi-grid{grid-template-columns:1fr 1fr!important}
          .privacy-usage-grid{grid-template-columns:1fr!important}
          .privacy-rights-grid{grid-template-columns:1fr!important}
          .privacy-consent-grid{grid-template-columns:1fr!important}
        }
      `}</style>
    </div>
  );
}
