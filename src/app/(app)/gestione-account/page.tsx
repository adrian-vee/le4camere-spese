"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRole, type Role } from "@/lib/useRole";
import { logClientActivity } from "@/lib/activityLog";

interface AccountRow {
  id: string;
  full_name: string | null;
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
  const { isAdmin, loading: roleLoading } = useRole();

  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "error" } | null>(null);

  // New account form
  const [showNew, setShowNew] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<Role>("staff");
  const [creating, setCreating] = useState(false);

  // Credentials modal (after creation or manual view)
  const [credModal, setCredModal] = useState<{ email: string; password: string; name: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);

  function showToastMsg(msg: string, type: "ok" | "error" = "ok") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

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

  async function changeRole(id: string, role: Role) {
    const { error } = await supabase.from("profiles").update({ role }).eq("id", id);
    if (error) return alert("Errore: " + error.message);
    const target = accounts.find(a => a.id === id);
    setAccounts(prev => prev.map(a => a.id === id ? { ...a, role } : a));
    logClientActivity("update", "account", `Ruolo di ${target?.full_name || "?"} cambiato a ${ROLE_LABELS[role]}`, { targetId: id, newRole: role });
    showToastMsg(`Ruolo aggiornato a ${ROLE_LABELS[role]}`);
  }

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

    // Show credentials modal
    setCredModal({ email: newEmail, password: pw, name: newName });

    logClientActivity("create", "account", `Account creato: ${newName} (${newEmail}) con ruolo ${ROLE_LABELS[newRole]}`, { email: newEmail, role: newRole });
    const emailMsg = result.emailSent ? " — email inviata automaticamente" : "";
    showToastMsg(`Account ${newEmail} creato con ruolo ${ROLE_LABELS[newRole]}${emailMsg}`);
    setNewEmail(""); setNewName(""); setNewRole("staff"); setShowNew(false);
    setCreating(false);
    loadAccounts();
  }

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
      // SMTP not configured — show credentials modal instead
      setCredModal({ email, name, password });
      return;
    }

    if (!resp.ok) {
      showToastMsg("Errore invio email: " + (result.error || ""), "error");
      return;
    }

    showToastMsg(`Credenziali inviate a ${email}`);
  }

  function copyCredentials() {
    if (!credModal) return;
    const text = `Credenziali accesso Gestionale Le 4 Camere\n\nLink: https://le4camere-spese.vercel.app\nEmail: ${credModal.email}\nPassword: ${credModal.password}\n\nCambia la password al primo accesso.`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (roleLoading || loading) return <div className="empty">Caricamento...</div>;
  if (!isAdmin) return (
    <div className="empty">
      <div className="serif" style={{ fontSize: 22, marginBottom: 8 }}>Accesso negato</div>
      <div>Solo gli amministratori possono gestire gli account.</div>
    </div>
  );

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
          <table className="tbl">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Ruolo</th>
                <th style={{ textAlign: "right" }}>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map(a => (
                <tr key={a.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: "50%", overflow: "hidden",
                        background: "#F3EBDD", display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0, border: "1px solid #D8CCB8",
                      }}>
                        {a.avatar_url ? (
                          <img src={a.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6C6B5D" strokeWidth="1.5">
                            <circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0112 0v1" />
                          </svg>
                        )}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{a.full_name || "Senza nome"}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <select
                      value={a.role}
                      onChange={e => changeRole(a.id, e.target.value as Role)}
                      style={{
                        background: ROLE_COLORS[a.role] + "15",
                        color: ROLE_COLORS[a.role],
                        border: `1px solid ${ROLE_COLORS[a.role]}40`,
                        borderRadius: 8,
                        padding: "6px 12px",
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: "pointer",
                      }}
                    >
                      <option value="staff">Staff</option>
                      <option value="manager">Manager</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button className="btn-ghost" style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12 }}
                      onClick={() => {
                        const em = prompt("Email dell'utente " + (a.full_name || "") + ":");
                        if (!em) return;
                        const pw = prompt("Password temporanea da inviare:");
                        if (!pw) return;
                        setCredModal({ email: em, name: a.full_name || "Utente", password: pw });
                      }}>
                      Invia credenziali
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Credentials modal */}
      {credModal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 300,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        }} onClick={() => { setCredModal(null); setCopied(false); }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: "#FFFFFF", borderRadius: 12, padding: 28, maxWidth: 460, width: "100%",
            boxShadow: "0 8px 32px rgba(0,0,0,.15)",
          }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: "#1F3326" }}>Credenziali account</h3>
            <p style={{ fontSize: 14, color: "#6C6B5D", marginBottom: 16 }}>
              Condividi queste credenziali con <strong>{credModal.name}</strong>.<br />
              <span style={{ fontSize: 12 }}>Al primo accesso verr&agrave; richiesto il cambio password.</span>
            </p>
            <div style={{ background: "#F3EBDD", borderRadius: 10, padding: 20, marginBottom: 20, fontFamily: "monospace", fontSize: 14, lineHeight: 2 }}>
              <div><strong>Link:</strong> https://le4camere-spese.vercel.app</div>
              <div><strong>Email:</strong> {credModal.email}</div>
              <div><strong>Password:</strong> {credModal.password}</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-primary" style={{ flex: 1, padding: 12 }} onClick={copyCredentials}>
                {copied ? "Copiato!" : "Copia tutto"}
              </button>
              <button className="btn-ghost" style={{ flex: 1, padding: 12, borderRadius: 8 }}
                onClick={() => {
                  sendCredentials(credModal.email, credModal.name, credModal.password);
                }}>
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

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: toast.type === "ok" ? "#2D5A3D" : "#9E3B2E", color: "#FAF9F5",
          padding: "12px 24px", borderRadius: 10, fontSize: 14, fontWeight: 600,
          zIndex: 400, boxShadow: "0 4px 20px rgba(0,0,0,.25)",
        }}>
          {toast.msg}
        </div>
      )}
    </>
  );
}
