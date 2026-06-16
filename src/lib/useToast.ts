"use client";
import { useState, useCallback } from "react";

export type ToastType = "ok" | "warn" | "error";

export interface ToastData {
  msg: string;
  type: ToastType;
}

const TYPE_DURATION: Record<ToastType, number> = { ok: 2500, warn: 4000, error: 5000 };

export function useToast() {
  const [toast, setToast] = useState<ToastData | null>(null);

  const showToast = useCallback(
    (msg: string, type: ToastType = "ok") => {
      setToast({ msg, type });
      setTimeout(() => setToast(null), TYPE_DURATION[type]);
    },
    [],
  );

  return { toast, showToast } as const;
}
