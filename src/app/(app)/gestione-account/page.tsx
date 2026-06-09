"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRole, type Role } from "@/lib/useRole";

interface AccountRow {
  id: string;
  full_name: string | null;
  role: Role;
  avatar_url: string | null;
  email?: string;
}

const ROLE_LABELS: Record<Role, string> = { admin: "Admin", manager: "Manager", staff: "Staff" };
const ROLE_COLORS: Record<Role, string> = { admin: "#9E3B2E", manager: "#BFA762", staff: "#4F7B8C" };

export default function GestioneAccountPage() {
  const supabase = createClient();
  const { isAdmin, loading: roleLoading } = useRole();

  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  // New account form
  const [showNew, setShowNew] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<Role>("staff");
  const [newPw, setNewPw] = useState("");
  const [creating, setCreating] = useState(false);

  function showToastMsg(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function loadAccounts() {
    setLoading(true);
    const { data } = await supabase.from("profiles").select("id, full_name, role, avatar_url").order("full_name");
    setAccounts((data ?? []) as AccountRow[]);
    setLoading(false);
  }

  useEffect(() => { loadAccounts(); /* eslint-disable-next-line */ }, []);

  async function changeRole(id: string, role: Role) {
    const { error } = await supabase.from("profiles").update({ role }).eq("id", id);
    if (error) return alert("Errore: " + error.message);
    setAccounts(prev => prev.map(a => a.id === id ? { ...a, role } : a));
    showToastMsg(`Ruolo aggiornato a ${ROLE_LABELS[role]}`);
  }

  async function createAccount() {
    if (!newEmail || !newPw || !newName) return alert("Compila tutti i campi.");
    if (newPw.length < 6) return alert("La password deve avere almeno 6 caratteri.");
    setCreating(true);

    // Use Supabase admin API via edge function or direct signUp
    // Since we can't use admin API from client, we use signUp + set role after
    const { data, error } = await supabase.auth.signUp({
      email: newEmail,
      password: newPw,
      options: { data: { full_name: newName } },
    });

    if (error) {
      alert("Errore creazione: " + error.message);
      setCreating(false);
      return;
    }

    // Set role on the new profile
    if (data.user) {
      // Wait a bit for the trigger to create the profile
      await new Promise(r => setTimeout(r, 1000));
      await supabase.from("profiles").update({ role: newRole, full_name: newName }).eq("id", data.user.id);
    }

    showToastMsg(`Account ${newEmail} creato con ruolo ${ROLE_LABELS[newRole]}`);
    setNewEmail(""); setNewName(""); setNewPw(""); setNewRole("staff"); setShowNew(false);
    setCreating(false);
    loadAccounts();
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
            <div className="grid2">
              <div className="field">
                <label>Password iniziale</label>
                <input type="text" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Almeno 6 caratteri" />
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
            </div>
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
                    <span className="muted" style={{ fontSize: 12 }}>
                      ID: {a.id.slice(0, 8)}…
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: "#2D5A3D", color: "#FAF9F5", padding: "12px 24px", borderRadius: 10,
          fontSize: 14, fontWeight: 600, zIndex: 200, boxShadow: "0 4px 20px rgba(0,0,0,.25)",
        }}>
          {toast}
        </div>
      )}
    </>
  );
}
