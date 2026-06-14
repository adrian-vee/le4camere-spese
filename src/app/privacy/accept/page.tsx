"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function AcceptConsentInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "ready" | "accepted" | "already" | "error">("loading");
  const [staffName, setStaffName] = useState("");
  const [acceptedAt, setAcceptedAt] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) { setStatus("error"); setErrorMsg("Link non valido. Nessun token trovato."); return; }
    (async () => {
      try {
        const res = await fetch(`/api/privacy/accept-consent?token=${token}`);
        if (!res.ok) {
          const data = await res.json();
          setStatus("error");
          setErrorMsg(data.error === "Token scaduto"
            ? "Questo link è scaduto. Contatta l'amministratore per ricevere un nuovo link."
            : "Link non valido o scaduto. Contatta l'amministratore.");
          return;
        }
        const data = await res.json();
        setStaffName(data.staff_name);
        if (data.already_accepted) {
          setStatus("already");
        } else {
          setStatus("ready");
        }
      } catch {
        setStatus("error");
        setErrorMsg("Errore di connessione. Riprova più tardi.");
      }
    })();
  }, [token]);

  const handleAccept = async () => {
    if (!checked || !token) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/privacy/accept-consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const data = await res.json();
        setStatus("error");
        setErrorMsg(data.error || "Errore durante la conferma.");
        return;
      }
      const data = await res.json();
      setAcceptedAt(new Date(data.accepted_at).toLocaleString("it-IT"));
      setStatus("accepted");
    } catch {
      setStatus("error");
      setErrorMsg("Errore di connessione. Riprova più tardi.");
    }
    setSubmitting(false);
  };

  const containerStyle: React.CSSProperties = {
    minHeight: "100vh", background: "#FAF9F5",
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: "24px 16px", fontFamily: "Arial, Helvetica, sans-serif",
  };

  const cardStyle: React.CSSProperties = {
    background: "#FFFFFF", borderRadius: 12, maxWidth: 520, width: "100%",
    boxShadow: "0 2px 16px rgba(0,0,0,0.08)", overflow: "hidden",
  };

  const headerStyle: React.CSSProperties = {
    background: "#1F3326", padding: "24px 32px", textAlign: "center",
  };

  const bodyStyle: React.CSSProperties = { padding: "32px" };

  if (status === "loading") {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={headerStyle}>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#FAF9F5", letterSpacing: 3 }}>LE 4 CAMERE HOTEL ★★★</div>
            <div style={{ fontSize: 11, letterSpacing: 4, color: "#BFA762", marginTop: 4, textTransform: "uppercase" }}>GESTIONALE ALBERGHIERO</div>
          </div>
          <div style={{ ...bodyStyle, textAlign: "center", color: "#6C6B5D" }}>
            <p>Caricamento...</p>
          </div>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={headerStyle}>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#FAF9F5", letterSpacing: 3 }}>LE 4 CAMERE HOTEL ★★★</div>
            <div style={{ fontSize: 11, letterSpacing: 4, color: "#BFA762", marginTop: 4, textTransform: "uppercase" }}>GESTIONALE ALBERGHIERO</div>
          </div>
          <div style={{ ...bodyStyle, textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <p style={{ fontSize: 16, color: "#9E3B2E", fontWeight: 600, margin: "0 0 12px" }}>Link non valido</p>
            <p style={{ fontSize: 14, color: "#6C6B5D", lineHeight: 1.6 }}>{errorMsg}</p>
          </div>
        </div>
      </div>
    );
  }

  if (status === "already") {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={headerStyle}>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#FAF9F5", letterSpacing: 3 }}>LE 4 CAMERE HOTEL ★★★</div>
            <div style={{ fontSize: 11, letterSpacing: 4, color: "#BFA762", marginTop: 4, textTransform: "uppercase" }}>GESTIONALE ALBERGHIERO</div>
          </div>
          <div style={{ ...bodyStyle, textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
            <p style={{ fontSize: 18, color: "#2D5A3D", fontWeight: 600, margin: "0 0 12px" }}>Consenso già registrato</p>
            <p style={{ fontSize: 14, color: "#6C6B5D", lineHeight: 1.6 }}>
              {staffName}, la tua conferma di presa visione è già stata registrata.<br />
              Puoi chiudere questa pagina.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status === "accepted") {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={headerStyle}>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#FAF9F5", letterSpacing: 3 }}>LE 4 CAMERE HOTEL ★★★</div>
            <div style={{ fontSize: 11, letterSpacing: 4, color: "#BFA762", marginTop: 4, textTransform: "uppercase" }}>GESTIONALE ALBERGHIERO</div>
          </div>
          <div style={{ ...bodyStyle, textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
            <p style={{ fontSize: 18, color: "#2D5A3D", fontWeight: 600, margin: "0 0 12px" }}>Grazie {staffName}!</p>
            <p style={{ fontSize: 14, color: "#6C6B5D", lineHeight: 1.6 }}>
              La tua conferma è stata registrata il {acceptedAt}.<br />
              Puoi chiudere questa pagina.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // status === "ready"
  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={headerStyle}>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#FAF9F5", letterSpacing: 3 }}>LE 4 CAMERE HOTEL ★★★</div>
          <div style={{ fontSize: 11, letterSpacing: 4, color: "#BFA762", marginTop: 4, textTransform: "uppercase" }}>GESTIONALE ALBERGHIERO</div>
        </div>
        <div style={bodyStyle}>
          <p style={{ fontSize: 17, color: "#1F3326", fontWeight: 600, margin: "0 0 16px" }}>
            Gentile {staffName},
          </p>
          <p style={{ fontSize: 14, color: "#333", lineHeight: 1.7, margin: "0 0 16px" }}>
            confermi di aver preso visione dell&apos;informativa privacy di Le 4 Camere Hotel?
          </p>
          <div style={{ background: "#F3EBDD", borderRadius: 8, padding: "16px 20px", marginBottom: 20 }}>
            <p style={{ fontSize: 13, color: "#1F3326", fontWeight: 600, margin: "0 0 8px" }}>I tuoi dati vengono utilizzati per:</p>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: "#333", lineHeight: 1.8 }}>
              <li>Gestione turni e presenze</li>
              <li>Calcolo ore lavorate e retribuzioni</li>
              <li>Operazioni di cassa durante il tuo turno</li>
              <li>Gestione magazzino e inventario</li>
            </ul>
          </div>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 24, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={checked}
              onChange={e => setChecked(e.target.checked)}
              style={{ width: 18, height: 18, marginTop: 2, accentColor: "#1F3326" }}
            />
            <span style={{ fontSize: 14, color: "#1F3326", lineHeight: 1.5 }}>
              Confermo di aver letto e compreso l&apos;informativa privacy
            </span>
          </label>
          <button
            onClick={handleAccept}
            disabled={!checked || submitting}
            style={{
              width: "100%", padding: "14px 24px",
              background: checked ? "#1F3326" : "#ccc", color: "#FAF9F5",
              border: "none", borderRadius: 8, fontSize: 16, fontWeight: 700,
              cursor: checked && !submitting ? "pointer" : "not-allowed",
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? "Conferma in corso..." : "Confermo la presa visione"}
          </button>
        </div>
        <div style={{ background: "#F3EBDD", padding: "16px 32px", textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 12, color: "#6C6B5D" }}>Le 4 Camere Hotel — Gestionale Alberghiero</p>
        </div>
      </div>
    </div>
  );
}

export default function AcceptConsentPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", background: "#FAF9F5", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Arial, sans-serif", color: "#6C6B5D" }}>
        Caricamento...
      </div>
    }>
      <AcceptConsentInner />
    </Suspense>
  );
}
