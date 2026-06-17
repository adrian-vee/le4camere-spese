"use client";

import type { ToastData } from "@/lib/useToast";

const BG: Record<string, string> = {
  ok: "#2D5A3D",
  warn: "#B68A3E",
  error: "#9E3B2E",
};

export function Toast({ toast }: { toast: ToastData | null }) {
  if (!toast) return null;
  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        background: BG[toast.type] ?? BG.ok,
        color: "#FAF9F5",
        padding: "12px 24px",
        borderRadius: 10,
        fontSize: 14,
        fontWeight: 600,
        zIndex: 400,
        boxShadow: "0 4px 20px rgba(0,0,0,.25)",
      }}
    >
      {toast.msg}
    </div>
  );
}
