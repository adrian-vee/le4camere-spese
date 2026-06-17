"use client";

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINS = ["00", "15", "30", "45"];

const selectBase: React.CSSProperties = {
  border: "1px solid #D8CCB8",
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 15,
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
  onChange: (hhmm: string) => void;
  style?: React.CSSProperties;
}

export default function TimePickerIT({ value, onChange, style }: Props) {
  const [h, m] = (value || "00:00").split(":");
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center", ...style }}>
      <select value={h || "00"} onChange={e => onChange(`${e.target.value}:${m || "00"}`)}
        style={{ ...selectBase, width: 72, textAlign: "center" }}>
        {HOURS.map(hh => <option key={hh} value={hh}>{hh}</option>)}
      </select>
      <span style={{ fontSize: 18, fontWeight: 700, color: "#6C6B5D" }}>:</span>
      <select value={m || "00"} onChange={e => onChange(`${h || "00"}:${e.target.value}`)}
        style={{ ...selectBase, width: 72, textAlign: "center" }}>
        {MINS.map(mm => <option key={mm} value={mm}>{mm}</option>)}
      </select>
    </div>
  );
}
