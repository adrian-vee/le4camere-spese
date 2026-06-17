"use client";

import { useCallback, useMemo } from "react";

const MESI = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

function daysInMonth(month: number, year: number): number {
  if (!month || !year) return 31;
  return new Date(year, month, 0).getDate();
}

const selectBase: React.CSSProperties = {
  border: "1px solid #D8CCB8",
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 14,
  fontFamily: "'Albert Sans', sans-serif",
  background: "#fff",
  color: "#1F3326",
  outline: "none",
  appearance: "none" as const,
  WebkitAppearance: "none" as const,
  backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236C6B5D' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 10px center",
  paddingRight: 28,
};

interface Props {
  value: string;
  onChange: (iso: string) => void;
  style?: React.CSSProperties;
  yearRange?: [number, number];
}

export default function DatePickerIT({ value, onChange, style, yearRange }: Props) {
  const now = new Date();
  const [minYear, maxYear] = yearRange ?? [now.getFullYear() - 1, now.getFullYear() + 5];

  const parsed = useMemo(() => {
    if (!value) return { day: 0, month: 0, year: 0 };
    const [y, m, d] = value.split("-").map(Number);
    return { day: d || 0, month: m || 0, year: y || 0 };
  }, [value]);

  const maxDays = daysInMonth(parsed.month, parsed.year || now.getFullYear());

  const emit = useCallback((day: number, month: number, year: number) => {
    if (!day && !month && !year) { onChange(""); return; }
    const now = new Date();
    const y = year || now.getFullYear();
    const m = month || (now.getMonth() + 1);
    const d = day || 1;
    const clamped = Math.min(d, daysInMonth(m, y));
    onChange(`${y}-${String(m).padStart(2, "0")}-${String(clamped).padStart(2, "0")}`);
  }, [onChange]);

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", ...style }}>
      <select
        value={parsed.day || ""}
        onChange={e => emit(Number(e.target.value), parsed.month, parsed.year)}
        style={{ ...selectBase, width: 72 }}
      >
        <option value="" disabled>gg</option>
        {Array.from({ length: maxDays }, (_, i) => i + 1).map(d => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>

      <select
        value={parsed.month || ""}
        onChange={e => emit(parsed.day, Number(e.target.value), parsed.year)}
        style={{ ...selectBase, width: 148 }}
      >
        <option value="" disabled>Mese</option>
        {MESI.map((m, i) => (
          <option key={i + 1} value={i + 1}>{m}</option>
        ))}
      </select>

      <select
        value={parsed.year || ""}
        onChange={e => emit(parsed.day, parsed.month, Number(e.target.value))}
        style={{ ...selectBase, width: 94 }}
      >
        <option value="" disabled>Anno</option>
        {Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i).map(y => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
    </div>
  );
}
