"use client";
import { useState, useCallback } from "react";

export type ToastType = "ok" | "warn" | "error";

export interface ToastData {
  msg: string;
  type: ToastType;
}

export function useToast(duration = 3500) {
  const [toast, setToast] = useState<ToastData | null>(null);

  const showToast = useCallback(
    (msg: string, type: ToastType = "ok") => {
      setToast({ msg, type });
      setTimeout(() => setToast(null), duration);
    },
    [duration],
  );

  return { toast, showToast } as const;
}
