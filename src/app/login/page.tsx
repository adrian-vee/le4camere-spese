"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/");
        router.refresh();
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: name } },
        });
        if (error) throw error;
        setInfo("Registrazione completata. Se richiesta, conferma la mail e poi accedi.");
        setMode("login");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore imprevisto";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="mark serif">4</div>
        <h1 className="serif">Le 4 Camere</h1>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontStyle: "italic", fontSize: 13, letterSpacing: 2, color: "#6C6B5D", marginTop: 2 }}>Gestionale alberghiero</div>

        {mode === "signup" && (
          <div className="field">
            <label>Nome</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. Adrian" />
          </div>
        )}
        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@le4camere.com" autoComplete="email" />
        </div>
        <div className="field">
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>

        <button className="btn btn-primary btn-block" onClick={submit} disabled={loading || !email || !password}>
          {loading ? "Attendere…" : mode === "login" ? "Accedi" : "Crea account"}
        </button>

        {error && <p className="error">{error}</p>}
        {info && <p className="muted" style={{ marginTop: 10, textAlign: "center" }}>{info}</p>}

        <p className="muted" style={{ marginTop: 20, textAlign: "center" }}>
          {mode === "login" ? "Nuovo membro dello staff? " : "Hai già un account? "}
          <a
            style={{ color: "var(--accent)", fontWeight: 700, cursor: "pointer" }}
            onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(null); setInfo(null); }}
          >
            {mode === "login" ? "Registrati" : "Accedi"}
          </a>
        </p>
      </div>
    </div>
  );
}
