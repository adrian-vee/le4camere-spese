"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/utils/supabase/client";
import { useRole } from "@/lib/useRole";
import { useToast } from "@/lib/useToast";
import { Toast } from "@/components/Toast";

export default function ImpostazioniPage() {
  const supabase = createClient();
  const router = useRouter();
  const { role, loading: roleLoading } = useRole();

  useEffect(() => {
    if (!roleLoading && role === "manager") {
      router.replace("/");
    }
  }, [roleLoading, role, router]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast, showToast } = useToast();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [mustChangePw, setMustChangePw] = useState(false);

  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwSaving, setPwSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email ?? "");
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, avatar_url, must_change_password")
        .eq("id", user.id)
        .single();
      if (profile) {
        setFullName(profile.full_name ?? "");
        setAvatarUrl(profile.avatar_url ?? null);
        setMustChangePw(profile.must_change_password ?? false);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line
  }, []);

  async function saveProfile() {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const { error: profErr } = await supabase
      .from("profiles")
      .update({ full_name: fullName.trim() })
      .eq("id", user.id);
    if (profErr) { showToast("Errore: " + profErr.message, "error"); setSaving(false); return; }

    if (email !== user.email) {
      const { error: emailErr } = await supabase.auth.updateUser({ email });
      if (emailErr) { showToast("Errore email: " + emailErr.message, "error"); setSaving(false); return; }
      showToast("Profilo aggiornato. Controlla la nuova email per conferma.");
    } else {
      showToast("Profilo aggiornato");
    }
    setSaving(false);
  }

  async function changePassword() {
    if (!oldPw || !newPw) return showToast("Compila tutti i campi password", "error");
    if (newPw !== confirmPw) return showToast("Le password non coincidono", "error");
    if (newPw.length < 6) return showToast("La password deve avere almeno 6 caratteri", "error");
    setPwSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) { setPwSaving(false); return; }

    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: oldPw,
    });
    if (signInErr) { showToast("Password attuale errata", "error"); setPwSaving(false); return; }

    const { error } = await supabase.auth.updateUser({ password: newPw });
    if (error) { showToast("Errore: " + error.message, "error"); setPwSaving(false); return; }

    // Clear must_change_password flag
    const wasForcedChange = mustChangePw;
    if (wasForcedChange) {
      await supabase.from("profiles").update({ must_change_password: false }).eq("id", user.id);
      setMustChangePw(false);
    }

    showToast("Password aggiornata");
    setOldPw(""); setNewPw(""); setConfirmPw("");
    setPwSaving(false);

    // If was forced, redirect to home (full reload to refresh server-side layout)
    if (wasForcedChange) {
      setTimeout(() => { window.location.href = "/"; }, 500);
    }
  }

  async function uploadAvatar(file: File) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return showToast("Immagine troppo grande (max 2MB)", "error");
    setUploading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setUploading(false); return; }

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const path = `avatars/${user.id}.${ext}`;

    const { error: upErr } = await supabase.storage.from("documenti").upload(path, file, { upsert: true });
    if (upErr) { showToast("Errore upload: " + upErr.message, "error"); setUploading(false); return; }

    const { data: { publicUrl } } = supabase.storage.from("documenti").getPublicUrl(path);
    await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", user.id);
    setAvatarUrl(publicUrl + "?t=" + Date.now());
    showToast("Foto profilo aggiornata");
    setUploading(false);
  }

  if (roleLoading || role === "manager" || loading) return <div className="empty">Caricamento...</div>;

  return (
    <>
      {mustChangePw && (
        <div style={{
          padding: "16px 20px", borderRadius: 12, marginBottom: 20,
          background: "rgba(158,59,46,.06)", border: "1px solid rgba(158,59,46,.25)",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9E3B2E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <path d="M12 9v4M12 17h.01" />
          </svg>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#9E3B2E" }}>Cambio password obbligatorio</div>
            <div style={{ fontSize: 13, color: "#9E3B2E", opacity: 0.8 }}>Devi cambiare la password prima di poter utilizzare il gestionale.</div>
          </div>
        </div>
      )}
      <h1 className="serif" style={{ fontSize: 24, fontWeight: 500, marginBottom: 24 }}>Impostazioni profilo</h1>

      <div className="imp-grid">
        {/* ── Profile Section ── */}
        <div className="section">
          <div className="section-head"><h2>Dati personali</h2></div>
          <div className="section-body" style={{ display: "flex", flexDirection: "column", gap: 18, padding: 24 }}>
            {/* Avatar */}
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <div
                onClick={() => fileRef.current?.click()}
                style={{
                  width: 72, height: 72, borderRadius: "50%", overflow: "hidden",
                  border: "2px solid var(--line)", cursor: "pointer", flexShrink: 0,
                  background: "var(--surface-2)", display: "flex", alignItems: "center", justifyContent: "center",
                  position: "relative",
                }}
              >
                {avatarUrl ? (
                  <Image src={avatarUrl} alt="Avatar" fill unoptimized style={{ objectFit: "cover" }} />
                ) : (
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="1.5">
                    <circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0112 0v1" />
                  </svg>
                )}
              </div>
              <div>
                <button className="btn btn-ghost" style={{ fontSize: 13, padding: "8px 14px" }}
                  onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? "Caricamento..." : "Cambia foto"}
                </button>
                <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4 }}>JPG, PNG - max 2MB</div>
              </div>
              <input ref={fileRef} type="file" accept="image/*" hidden
                onChange={e => { if (e.target.files?.[0]) uploadAvatar(e.target.files[0]); }} />
            </div>

            <div className="field">
              <label>Nome completo</label>
              <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Mario Rossi" />
            </div>

            <div className="field">
              <label>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@esempio.it" />
            </div>

            <button className="btn btn-primary" style={{ width: "100%", padding: "13px 22px", fontSize: 15 }}
              onClick={saveProfile} disabled={saving}>
              {saving ? "Salvataggio..." : "Salva modifiche"}
            </button>
          </div>
        </div>

        {/* ── Password Section ── */}
        <div className="section" style={{ alignSelf: "start" }}>
          <div className="section-head"><h2>Cambia password</h2></div>
          <div className="section-body" style={{ display: "flex", flexDirection: "column", gap: 18, padding: 24 }}>
            <div className="field">
              <label>Password attuale</label>
              <input type="password" value={oldPw} onChange={e => setOldPw(e.target.value)} placeholder="Inserisci password attuale" />
            </div>
            <div className="field">
              <label>Nuova password</label>
              <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Almeno 6 caratteri" />
            </div>
            <div className="field">
              <label>Conferma nuova password</label>
              <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Ripeti la nuova password" />
            </div>
            <button className="btn btn-primary" style={{ width: "100%", padding: "13px 22px", fontSize: 15 }}
              onClick={changePassword} disabled={pwSaving}>
              {pwSaving ? "Aggiornamento..." : "Aggiorna password"}
            </button>
          </div>
        </div>
      </div>

      <Toast toast={toast} />

      <style>{`
        .imp-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}
        @media (max-width: 820px) {
          .imp-grid{grid-template-columns:1fr}
        }
      `}</style>
    </>
  );
}
