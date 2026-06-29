"use client";

import { useState } from "react";

type SyncDiag = {
  window: string;
  totalItems: number;
  pageCount: number;
  pagesFetched: number;
  bookingsFetched: number;
  bookingsWritten: number;
  batchErrors: number;
  elapsedSec: number;
};

type SyncResult = {
  ok: boolean;
  apartments: number;
  bookings: number;
  diag?: SyncDiag;
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
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div>
                Sync completata: <strong>{result.apartments}</strong> apartments,{" "}
                <strong>{result.bookings}</strong> prenotazioni scritte.
              </div>
              {result.diag && (
                <div style={{ fontSize: 12, color: "#6C6B5D", borderTop: "1px solid #c8e6c9", paddingTop: 6, marginTop: 4 }}>
                  <div><strong>Finestra:</strong> {result.diag.window}</div>
                  <div><strong>API total_items:</strong> {result.diag.totalItems}</div>
                  <div><strong>Pagine API:</strong> {result.diag.pagesFetched}/{result.diag.pageCount}</div>
                  <div><strong>Fetch:</strong> {result.diag.bookingsFetched} &rarr; <strong>DB:</strong> {result.diag.bookingsWritten}</div>
                  {result.diag.batchErrors > 0 && (
                    <div style={{ color: "#9E3B2E" }}><strong>Batch errors:</strong> {result.diag.batchErrors}</div>
                  )}
                  <div><strong>Tempo:</strong> {result.diag.elapsedSec}s</div>
                </div>
              )}
            </div>
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
