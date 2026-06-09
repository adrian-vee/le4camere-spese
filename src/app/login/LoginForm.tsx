"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { logClientActivity } from "@/lib/activityLog";

export default function LoginForm() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      logClientActivity("login", "auth", `Login effettuato`, { email });
      router.push("/");
      router.refresh();
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
        <img
          src="/le4camere-logo-bianco.svg"
          alt="Le 4 Camere"
          style={{ width: 200, display: "block", margin: "0 auto", filter: "brightness(0)" }}
        />
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 14, letterSpacing: 3, color: "#6C6B5D", marginTop: 8, marginBottom: 24, textAlign: "center", textTransform: "uppercase" }}>GESTIONALE ALBERGHIERO</div>

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
            autoComplete="current-password"
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>

        <button className="btn btn-primary btn-block" onClick={submit} disabled={loading || !email || !password}>
          {loading ? "Attendere…" : "Accedi"}
        </button>

        {error && <p className="error">{error}</p>}

        <p className="muted" style={{ marginTop: 20, textAlign: "center", fontSize: 13 }}>
          Accesso riservato al personale autorizzato.<br />
          Contatta l&apos;amministratore per ottenere le credenziali.
        </p>
      </div>
    </div>
  );
}
