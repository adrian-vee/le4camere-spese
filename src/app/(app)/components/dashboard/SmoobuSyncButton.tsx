"use client";

import { useState } from "react";

type SyncResult = {
  ok: boolean;
  apartments: number;
  bookings: number;
  error?: string;
};

export default function SmoobuSyncButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSync() {
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch("/api/smoobu/sync", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? `Errore HTTP ${res.status}`);
      } else {
        setResult(data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore di rete");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      padding: "16px 20px", background: "#fff", border: "1px solid #D8CCB8",
      borderRadius: 12, display: "flex", flexDirection: "column", gap: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#1F3326", fontFamily: "'Albert Sans', sans-serif" }}>
            Smoobu Sync
          </div>
          <div style={{ fontSize: 12, color: "#9C8E78" }}>
            Sincronizza apartments e prenotazioni da Smoobu
          </div>
        </div>
        <button
          onClick={handleSync}
          disabled={loading}
          style={{
            background: "#1F3326", color: "#fff", border: "none",
            borderRadius: 8, padding: "8px 18px", fontSize: 13,
            fontFamily: "'Albert Sans', sans-serif", fontWeight: 600,
            cursor: loading ? "wait" : "pointer", opacity: loading ? 0.7 : 1,
            whiteSpace: "nowrap",
          }}
        >
          {loading ? "Sincronizzando..." : "Sincronizza ora"}
        </button>
      </div>

      {result && (
        <div style={{
          padding: "10px 14px", borderRadius: 8,
          background: result.ok ? "#e8f5e9" : "#fbe9e7",
          fontSize: 13, color: result.ok ? "#2d5a3d" : "#9E3B2E",
          fontFamily: "'Albert Sans', sans-serif",
        }}>
          {result.ok ? (
            <>
              Sync completata: <strong>{result.apartments}</strong> apartments,{" "}
              <strong>{result.bookings}</strong> prenotazioni sincronizzate.
            </>
          ) : (
            <>Errore: {result.error}</>
          )}
        </div>
      )}

      {error && (
        <div style={{
          padding: "10px 14px", borderRadius: 8,
          background: "#fbe9e7", fontSize: 13, color: "#9E3B2E",
          fontFamily: "'Albert Sans', sans-serif",
        }}>
          {error}
        </div>
      )}
    </div>
  );
}
