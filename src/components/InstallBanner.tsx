"use client";

import { useState, useEffect, useCallback } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem("pwa_banner_dismissed")) return;

    const isStandalone = window.matchMedia("(display-mode: standalone)").matches
      || ("standalone" in navigator && (navigator as unknown as { standalone: boolean }).standalone);
    if (isStandalone) return;

    setDismissed(false);

    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (isIos) {
      setShowIosHint(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDismissed(true);
      localStorage.setItem("pwa_banner_dismissed", "1");
    }
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  const dismiss = () => {
    setDismissed(true);
    localStorage.setItem("pwa_banner_dismissed", "1");
  };

  if (dismissed) return null;
  if (!deferredPrompt && !showIosHint) return null;

  return (
    <div style={{
      position: "fixed", bottom: 72, left: 12, right: 12, zIndex: 1000,
      background: "#1F3326", color: "#FAF9F5", borderRadius: 12,
      padding: "14px 16px", display: "flex", alignItems: "center", gap: 12,
      boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
      fontFamily: "'Albert Sans', sans-serif",
    }}>
      <img src="/icon-192.png" alt="" width={40} height={40} style={{ borderRadius: 8, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Installa Le 4 Camere Hub</div>
        {showIosHint ? (
          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>
            Tocca <span style={{ display: "inline-flex", alignItems: "center", verticalAlign: "middle" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
              </svg>
            </span> Condividi poi &quot;Aggiungi a Home&quot;
          </div>
        ) : (
          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>Accedi rapidamente dal tuo telefono</div>
        )}
      </div>
      {!showIosHint && (
        <button onClick={install} style={{
          background: "#BFA762", color: "#1F3326", border: "none", borderRadius: 8,
          padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer",
          fontFamily: "inherit", flexShrink: 0,
        }}>
          Installa
        </button>
      )}
      <button onClick={dismiss} style={{
        background: "none", border: "none", color: "#FAF9F5", fontSize: 18,
        cursor: "pointer", padding: "0 2px", opacity: 0.6, lineHeight: 1,
      }}>
        &times;
      </button>
    </div>
  );
}
