import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Le 4 Camere · Gestione Spese",
  description: "Dashboard spese, scontrini e fatture dell'albergo Le 4 Camere",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#1F3326",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
