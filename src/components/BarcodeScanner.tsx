"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface BarcodeScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
}

export default function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scannerRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);

  const stopScanner = useCallback(async () => {
    try {
      if (scannerRef.current) {
        await scannerRef.current.stop();
        scannerRef.current = null;
      }
    } catch {
      // ignore
    }
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function startScanner() {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
        if (cancelled) return;

        const scanner = new Html5Qrcode("barcode-reader-region", {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
          ],
          verbose: false,
        });
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 20,
            qrbox: { width: 300, height: 120 },
            aspectRatio: 1.777,
            videoConstraints: {
              facingMode: "environment",
              width: { ideal: 1920, min: 1280 },
              height: { ideal: 1080, min: 720 },
            },
          },
          (decodedText) => {
            if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
            try {
              const ctx = new AudioContext();
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.connect(gain);
              gain.connect(ctx.destination);
              osc.frequency.value = 1200;
              gain.gain.value = 0.3;
              osc.start();
              osc.stop(ctx.currentTime + 0.1);
            } catch {
              // audio not available
            }
            onScan(decodedText);
            stopScanner();
            onClose();
          },
          () => {}
        );

        if (cancelled) {
          await scanner.stop();
          return;
        }

        // Check torch capability
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const videoElement = document.querySelector("#barcode-reader-region video") as any;
        if (videoElement?.srcObject) {
          const stream = videoElement.srcObject as MediaStream;
          streamRef.current = stream;
          const track = stream.getVideoTracks()[0];
          if (track) {
            const caps = track.getCapabilities?.() as { torch?: boolean } | undefined;
            if (caps?.torch) setTorchAvailable(true);
          }
        }

        setStarting(false);
      } catch {
        if (!cancelled) {
          setError("Permesso fotocamera necessario per la scansione");
          setStarting(false);
        }
      }
    }

    startScanner();

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [onScan, onClose, stopScanner]);

  async function toggleTorch() {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      // torch not supported
    }
  }

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
          <button className="camera-scanner-close" onClick={handleClose} aria-label="Chiudi">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="camera-scanner-viewfinder">
          <div id="barcode-reader-region" style={{ width: "100%" }} />

          {!starting && !error && (
            <div className="scanner-target-overlay">
              <div className="scanner-target-box">
                <div className="scanner-corner tl" />
                <div className="scanner-corner tr" />
                <div className="scanner-corner bl" />
                <div className="scanner-corner br" />
                <div className="scanner-line" />
              </div>
            </div>
          )}

          {starting && !error && (
            <div className="camera-scanner-loading">
              <div className="scanner-spinner" />
              <div style={{ fontSize: 14, color: "rgba(250,249,245,.8)", marginTop: 12 }}>Avvio fotocamera...</div>
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

        <div className="camera-scanner-controls">
          {torchAvailable && (
            <button
              className={`scanner-torch-btn${torchOn ? " active" : ""}`}
              onClick={toggleTorch}
              aria-label="Torcia"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill={torchOn ? "#BFA762" : "none"} stroke={torchOn ? "#BFA762" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
                <path d="M9 18h6" /><path d="M10 22h4" />
              </svg>
            </button>
          )}
        </div>

        <div className="camera-scanner-hint">
          Inquadra il barcode · Tieni fermo
        </div>
      </div>
    </div>
  );
}
