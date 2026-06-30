"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { useRole } from "@/lib/useRole";
import { canAccess, type Role } from "@/lib/permissions";
import { useToast } from "@/lib/useToast";
import { Toast } from "@/components/Toast";
import { logClientActivity } from "@/lib/activityLog";

interface AccountRow {
  id: string;
  full_name: string | null;
  email: string | null;
  role: Role;
  avatar_url: string | null;
}

const ROLE_LABELS: Record<Role, string> = { admin: "Admin", manager: "Manager", staff: "Staff" };
const ROLE_COLORS: Record<Role, string> = { admin: "#9E3B2E", manager: "#BFA762", staff: "#4F7B8C" };

const PW_WORDS = [
  "Hotel", "Camera", "Mare", "Sole", "Luna", "Stella", "Rosa", "Verde",
  "Lago", "Monte", "Fiume", "Porto", "Torre", "Ponte", "Parco", "Cielo",
  "Vento", "Fiore", "Bosco", "Campo", "Prato", "Corte", "Villa", "Perla",
];

function generatePassword(): string {
  const pick = () => PW_WORDS[Math.floor(Math.random() * PW_WORDS.length)];
  let w1 = pick(), w2 = pick();
  while (w2 === w1) w2 = pick();
  const num = Math.floor(Math.random() * 90) + 10;
  return `${w1}-${w2}-${num}`;
}

export default function GestioneAccountPage() {
  const supabase = createClient();
  const router = useRouter();
  const { role, loading: roleLoading } = useRole();

  useEffect(() => {
    if (!roleLoading && !canAccess(role, "/gestione-account")) {
      router.replace("/");
    }
  }, [roleLoading, role, router]);

  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast, showToast } = useToast();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // New account form
  const [showNew, setShowNew] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<Role>("staff");
  const [creating, setCreating] = useState(false);

  // Credentials modal
  const [credModal, setCredModal] = useState<{ email: string; password: string; name: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);

  // Edit modal
  const [editModal, setEditModal] = useState<AccountRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<Role>("staff");
  const [saving, setSaving] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<AccountRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id);
    });
  }, [supabase]);

  async function loadAccounts() {
    setLoading(true);
    try {
      const resp = await fetch("/api/admin/list-users");
      const result = await resp.json();
      if (!resp.ok) { console.error("loadAccounts error:", result.error); setAccounts([]); }
      else setAccounts((result.data ?? []) as AccountRow[]);
    } catch (err) { console.error("loadAccounts fetch error:", err); setAccounts([]); }
    setLoading(false);
  }

  useEffect(() => { loadAccounts(); /* eslint-disable-next-line */ }, []);

  async function createAccount() {
    if (!newEmail || !newName) return alert("Compila tutti i campi.");
    setCreating(true);
    const pw = generatePassword();
    const resp = await fetch("/api/admin/create-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: newEmail, password: pw, full_name: newName, role: newRole }),
    });
    const result = await resp.json();
    if (!resp.ok) {
      alert("Errore creazione: " + (result.error || "Errore sconosciuto"));
      setCreating(false);
      return;
    }
    setCredModal({ email: newEmail, password: pw, name: newName });
    logClientActivity("create", "account", `Account creato: ${newName} (${newEmail}) con ruolo ${ROLE_LABELS[newRole]}`, { email: newEmail, role: newRole });
    showToast(`Account ${newEmail} creato con ruolo ${ROLE_LABELS[newRole]}`);
    setNewEmail(""); setNewName(""); setNewRole("staff"); setShowNew(false);
    setCreating(false);
    loadAccounts();
  }

  // Edit modal handlers
  function openEdit(a: AccountRow) {
    setEditModal(a);
    setEditName(a.full_name || "");
    setEditRole(a.role);
  }

  async function saveEdit() {
    if (!editModal) return;
    setSaving(true);
    // Update profile via service role API
    const resp = await fetch("/api/admin/update-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: editModal.id, full_name: editName, role: editRole }),
    });
    const result = await resp.json();
    setSaving(false);
    if (!resp.ok) {
      showToast("Errore: " + (result.error || ""), "error");
      return;
    }
    logClientActivity("update", "account", `Profilo aggiornato: ${editName} → ruolo ${ROLE_LABELS[editRole]}`, { targetId: editModal.id });
    showToast("Profilo aggiornato");
    setEditModal(null);
    loadAccounts();
  }

  // Reset password
  async function resetPassword(a: AccountRow) {
    const pw = generatePassword();
    const resp = await fetch("/api/admin/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: a.id, password: pw }),
    });
    const result = await resp.json();
    if (!resp.ok) {
      showToast("Errore reset: " + (result.error || ""), "error");
      return;
    }
    logClientActivity("update", "account", `Password resettata per ${a.full_name || a.email}`, { targetId: a.id });
    setCredModal({ email: a.email || "", password: pw, name: a.full_name || "Utente" });
  }

  // Delete account
  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const resp = await fetch("/api/admin/delete-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: deleteTarget.id }),
    });
    const result = await resp.json();
    setDeleting(false);
    if (!resp.ok) {
      showToast("Errore eliminazione: " + (result.error || ""), "error");
      setDeleteTarget(null);
      return;
    }
    logClientActivity("delete", "account", `Account eliminato: ${deleteTarget.full_name || deleteTarget.email}`, { targetId: deleteTarget.id });
    showToast("Account eliminato");
    setDeleteTarget(null);
    loadAccounts();
  }

  // Send credentials
  async function sendCredentials(email: string, name: string, password: string) {
    setSending(true);
    const resp = await fetch("/api/admin/send-credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, password }),
    });
    const result = await resp.json();
    setSending(false);
    if (result.noSmtp) {
      setCredModal({ email, name, password });
      return;
    }
    if (!resp.ok) {
      showToast("Errore invio email: " + (result.error || ""), "error");
      return;
    }
    showToast(`Credenziali inviate a ${email}`);
  }

  function copyCredentials() {
    if (!credModal) return;
    const text = `Credenziali accesso Gestionale Le 4 Camere\n\nLink: https://my.le4camere.com\nEmail: ${credModal.email}\nPassword: ${credModal.password}\n\nCambia la password al primo accesso.`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (roleLoading || loading) return <div className="empty">Caricamento...</div>;
  if (!canAccess(role, "/gestione-account")) return (
    <div className="empty">
      <div className="serif" style={{ fontSize: 22, marginBottom: 8 }}>Accesso negato</div>
      <div>Solo gli amministratori possono gestire gli account.</div>
    </div>
  );

  const btnStyle = (variant: "default" | "danger" = "default"): React.CSSProperties => ({
    padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
    border: variant === "danger" ? "1px solid #9E3B2E40" : "1px solid #D8CCB8",
    background: variant === "danger" ? "#9E3B2E10" : "transparent",
    color: variant === "danger" ? "#9E3B2E" : "#1F3326",
    cursor: "pointer",
  });

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <h1 className="serif" style={{ fontSize: 24, fontWeight: 500 }}>Gestione account</h1>
        <button className="btn btn-primary" onClick={() => setShowNew(!showNew)}>
          {showNew ? "Annulla" : "+ Nuovo account"}
        </button>
      </div>

      {/* New account form */}
      {showNew && (
        <div className="section" style={{ marginBottom: 24 }}>
          <div className="section-head"><h2>Crea nuovo account</h2></div>
          <div className="section-body" style={{ padding: 24 }}>
            <div className="grid2">
              <div className="field">
                <label>Nome completo</label>
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Mario Rossi" />
              </div>
              <div className="field">
                <label>Email</label>
                <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="mario@le4camere.com" />
              </div>
            </div>
            <div className="field">
              <label>Ruolo</label>
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                {(["staff", "manager", "admin"] as Role[]).map(r => (
                  <button key={r} type="button"
                    className={`contract-pill${newRole === r ? " active" : ""}`}
                    style={newRole === r ? { background: ROLE_COLORS[r] + "20", borderColor: ROLE_COLORS[r], color: ROLE_COLORS[r] } : {}}
                    onClick={() => setNewRole(r)}>
                    {ROLE_LABELS[r]}
                  </button>
                ))}
              </div>
            </div>
            <p style={{ fontSize: 13, color: "#6C6B5D", marginTop: 4 }}>
              La password viene generata automaticamente e mostrata dopo la creazione.
            </p>
            <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={createAccount} disabled={creating}>
              {creating ? "Creazione..." : "Crea account"}
            </button>
          </div>
        </div>
      )}

      {/* Accounts list */}
      <div className="section">
        <div className="section-head"><h2>Account attivi ({accounts.length})</h2></div>
        <div className="section-body" style={{ padding: 0 }}>
          {accounts.map(a => (
            <div key={a.id} style={{
              display: "flex", alignItems: "center", gap: 12, padding: "14px 20px",
              borderBottom: "1px solid #F3EBDD", flexWrap: "wrap",
            }}>
              {/* Avatar + name */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "1 1 200px", minWidth: 0 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: "50%", overflow: "hidden",
                  background: "#F3EBDD", display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0, border: "1px solid #D8CCB8", position: "relative",
                }}>
                  {a.avatar_url ? (
                    <Image src={a.avatar_url} alt="" fill unoptimized style={{ objectFit: "cover" }} />
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6C6B5D" strokeWidth="1.5">
                      <circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0112 0v1" />
                    </svg>
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {a.full_name || "Senza nome"}
                  </div>
                  {a.email && (
                    <div style={{ fontSize: 12, color: "#6C6B5D", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {a.email}
                    </div>
                  )}
                </div>
              </div>

              {/* Role badge */}
              <div style={{ flexShrink: 0 }}>
                <span style={{
                  display: "inline-block", padding: "4px 12px", borderRadius: 8,
                  fontSize: 12, fontWeight: 700,
                  background: ROLE_COLORS[a.role] + "15", color: ROLE_COLORS[a.role],
                  border: `1px solid ${ROLE_COLORS[a.role]}40`,
                }}>
                  {ROLE_LABELS[a.role]}
                </span>
              </div>

              {/* Action buttons */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginLeft: "auto" }}>
                <button style={btnStyle()} onClick={() => openEdit(a)}>Modifica</button>
                <button style={btnStyle()} onClick={() => resetPassword(a)}>Reset password</button>
                <button style={btnStyle()} onClick={() => {
                  if (!a.email) return showToast("Nessuna email per questo utente", "error");
                  const pw = prompt("Password da inviare:");
                  if (!pw) return;
                  setCredModal({ email: a.email, name: a.full_name || "Utente", password: pw });
                }}>Invia credenziali</button>
                {a.id !== currentUserId && (
                  <button style={btnStyle("danger")} onClick={() => setDeleteTarget(a)}>Elimina</button>
                )}
              </div>
            </div>
          ))}
          {accounts.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", color: "#6C6B5D", fontSize: 14 }}>Nessun account trovato.</div>
          )}
        </div>
      </div>

      {/* ── Edit modal ── */}
      {editModal && (
        <div className="modal-overlay" onClick={() => setEditModal(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ padding: 28, maxWidth: 460 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20, color: "#1F3326" }}>Modifica account</h3>
            <div className="field" style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#6C6B5D" }}>
                Nome completo
              </label>
              <input value={editName} onChange={e => setEditName(e.target.value)} style={{ marginTop: 4 }} />
            </div>
            <div className="field" style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#6C6B5D" }}>
                Email
              </label>
              <input value={editModal.email || ""} disabled style={{ marginTop: 4, background: "#F3EBDD", color: "#6C6B5D" }} />
            </div>
            <div className="field" style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#6C6B5D" }}>
                Ruolo
              </label>
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                {(["staff", "manager", "admin"] as Role[]).map(r => (
                  <button key={r} type="button"
                    style={{
                      padding: "6px 16px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer",
                      border: `1px solid ${editRole === r ? ROLE_COLORS[r] : "#D8CCB8"}`,
                      background: editRole === r ? ROLE_COLORS[r] + "20" : "transparent",
                      color: editRole === r ? ROLE_COLORS[r] : "#6C6B5D",
                    }}
                    onClick={() => setEditRole(r)}>
                    {ROLE_LABELS[r]}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-primary" style={{ flex: 1, padding: 12 }} onClick={saveEdit} disabled={saving}>
                {saving ? "Salvataggio..." : "Salva modifiche"}
              </button>
              <button className="btn-ghost" style={{ padding: "12px 16px", borderRadius: 8 }} onClick={() => setEditModal(null)}>
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm modal ── */}
      {deleteTarget && (
        <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ padding: 28, maxWidth: 420 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12, color: "#9E3B2E" }}>Elimina account</h3>
            <p style={{ fontSize: 14, color: "#1F3326", marginBottom: 20, lineHeight: 1.5 }}>
              Sei sicuro di voler eliminare l&apos;account di <strong>{deleteTarget.full_name || deleteTarget.email}</strong>?
              <br />Questa azione è irreversibile.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                style={{
                  flex: 1, padding: 12, borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer",
                  background: "#9E3B2E", color: "#FAF9F5", border: "none",
                }}
                onClick={confirmDelete}
                disabled={deleting}
              >
                {deleting ? "Eliminazione..." : "Elimina definitivamente"}
              </button>
              <button className="btn-ghost" style={{ padding: "12px 16px", borderRadius: 8 }} onClick={() => setDeleteTarget(null)}>
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Credentials modal ── */}
      {credModal && (
        <div className="modal-overlay" onClick={() => { setCredModal(null); setCopied(false); }}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ padding: 28, maxWidth: 460 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: "#1F3326" }}>Credenziali account</h3>
            <p style={{ fontSize: 14, color: "#6C6B5D", marginBottom: 16 }}>
              Condividi queste credenziali con <strong>{credModal.name}</strong>.<br />
              <span style={{ fontSize: 12 }}>Al primo accesso verr&agrave; richiesto il cambio password.</span>
            </p>
            <div style={{ background: "#F3EBDD", borderRadius: 10, padding: 20, marginBottom: 20, fontFamily: "monospace", fontSize: 14, lineHeight: 2 }}>
              <div><strong>Link:</strong> https://my.le4camere.com</div>
              <div><strong>Email:</strong> {credModal.email}</div>
              <div><strong>Password:</strong> {credModal.password}</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-primary" style={{ flex: 1, padding: 12 }} onClick={copyCredentials}>
                {copied ? "Copiato!" : "Copia tutto"}
              </button>
              <button className="btn-ghost" style={{ flex: 1, padding: 12, borderRadius: 8 }}
                onClick={() => sendCredentials(credModal.email, credModal.name, credModal.password)}>
                {sending ? "Invio..." : "Invia via email"}
              </button>
              <button className="btn-ghost" style={{ padding: "12px 16px", borderRadius: 8 }}
                onClick={() => { setCredModal(null); setCopied(false); }}>
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast toast={toast} />
    </>
  );
}
