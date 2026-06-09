"use client";

import { useEffect, useRef, useState } from "react";

interface BarcodeScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
}

export default function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scannerRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function startScanner() {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;

        const scanner = new Html5Qrcode("barcode-reader-region");
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 280, height: 120 },
            aspectRatio: 1.777,
          },
          (decodedText) => {
            // Vibrate on success
            if (navigator.vibrate) navigator.vibrate(100);
            onScan(decodedText);
            stopScanner();
            onClose();
          },
          () => {
            // Ignore scan failures (no barcode found yet)
          }
        );

        if (cancelled) {
          await scanner.stop();
          return;
        }
        setStarting(false);
      } catch (err) {
        if (!cancelled) {
          setError("Permesso fotocamera necessario per la scansione");
          setStarting(false);
        }
      }
    }

    async function stopScanner() {
      try {
        if (scannerRef.current) {
          await scannerRef.current.stop();
          scannerRef.current = null;
        }
      } catch {
        // ignore
      }
    }

    startScanner();

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, []);

  function handleClose() {
    if (scannerRef.current) {
      scannerRef.current.stop().catch(() => {}).finally(() => {
        scannerRef.current = null;
        onClose();
      });
    } else {
      onClose();
    }
  }

  return (
    <div className="camera-scanner-overlay">
      <div className="camera-scanner-container">
        <div className="camera-scanner-header">
          <span style={{ fontWeight: 600, fontSize: 16 }}>Scansione barcode</span>
          <button className="camera-scanner-close" onClick={handleClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="camera-scanner-viewfinder">
          <div id="barcode-reader-region" style={{ width: "100%" }} />
          {starting && !error && (
            <div className="camera-scanner-loading">
              <div style={{ fontSize: 14, color: "rgba(250,249,245,.8)" }}>Avvio fotocamera...</div>
            </div>
          )}
          {error && (
            <div className="camera-scanner-error">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#F5C882" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
              </svg>
              <div style={{ marginTop: 8, fontSize: 14 }}>{error}</div>
            </div>
          )}
        </div>

        <div className="camera-scanner-hint">
          Inquadra il barcode del prodotto
        </div>
      </div>
    </div>
  );
}
