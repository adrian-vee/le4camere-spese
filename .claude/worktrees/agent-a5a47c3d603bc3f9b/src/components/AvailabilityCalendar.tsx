"use client";

import type { ShiftTypeRow } from "@/lib/turni";

export type AvailStatus = "unspecified" | "available" | "preferred" | "unavailable";

const SLOT_COLORS: Record<AvailStatus, { bg: string; text: string }> = {
  available:   { bg: "#2D5A3D", text: "#fff" },
  preferred:   { bg: "#BFA762", text: "#fff" },
  unavailable: { bg: "#C4453C", text: "#fff" },
  unspecified: { bg: "#E8E6E1", text: "#999" },
};

const STATUS_LABELS: Record<AvailStatus, string> = {
  available: "Disponibile",
  preferred: "Preferito",
  unavailable: "Non disponibile",
  unspecified: "Non specificato",
};

interface Props {
  calWeeks: (string | null)[][];
  shiftTypes: ShiftTypeRow[];
  todayIso: string;
  getStatus: (date: string, shiftTypeId: string) => AvailStatus;
  readOnly?: boolean;
  onToggleSlot?: (date: string, shiftTypeId: string) => void;
  onToggleDay?: (date: string) => void;
}

export default function AvailabilityCalendar({
  calWeeks, shiftTypes, todayIso, getStatus,
  readOnly = true, onToggleSlot, onToggleDay,
}: Props) {
  return (
    <div className="avail-cal-scroll" style={{ overflowX: "auto" }}>
      <div className="avail-cal-grid" style={{
        display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
        gap: 4, minWidth: 500,
      }}>
        {/* Header */}
        {["L", "M", "M", "G", "V", "S", "D"].map((d, i) => (
          <div key={i} style={{
            padding: "6px 0", fontSize: 13, fontWeight: 700,
            textAlign: "center", color: "#6C6B5D",
            textTransform: "uppercase", letterSpacing: "0.05em",
            fontFamily: "'Albert Sans', sans-serif",
          }}>
            {d}
          </div>
        ))}

        {/* Days */}
        {calWeeks.flatMap((wr, wi) =>
          wr.map((date, di) => {
            if (!date) return (
              <div key={`${wi}-${di}`} style={{
                minHeight: 90, borderRadius: 8,
                background: "transparent",
              }} />
            );
            const dayNum = parseInt(date.slice(8));
            const isToday = date === todayIso;
            const dow = new Date(date + "T00:00:00").getDay();
            const isWe = dow === 0 || dow === 6;

            return (
              <div
                key={`${wi}-${di}`}
                className="avail-cal-cell"
                onClick={() => !readOnly && onToggleDay?.(date)}
                style={{
                  minHeight: 90, borderRadius: 8,
                  border: isToday ? "2px solid #2D5A3D" : "1px solid #D8CCB8",
                  background: isToday ? "#E8F5EB" : isWe ? "#F3EBDD" : "#fff",
                  padding: "6px 6px 8px",
                  display: "flex", flexDirection: "column",
                  transition: "box-shadow .15s",
                  cursor: readOnly ? "default" : "pointer",
                }}
              >
                <div className="serif" style={{
                  fontSize: 16, fontWeight: isToday ? 700 : 600,
                  color: isToday ? "#2D5A3D" : "#1F3326",
                  marginBottom: 6, lineHeight: 1,
                }}>{dayNum}</div>

                <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
                  {shiftTypes.map((st, idx) => {
                    const status = getStatus(date, st.id);
                    const sc = SLOT_COLORS[status];
                    const slotIcon = idx === 0 ? "\u2600\uFE0E" : "\u{1F319}";
                    const slotLetter = st.name.charAt(0).toUpperCase();
                    return readOnly ? (
                      <div key={st.id} title={`${st.name}: ${STATUS_LABELS[status]}`} style={{
                        height: 28, borderRadius: 6,
                        background: sc.bg, color: sc.text,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        gap: 4, fontSize: 12, fontWeight: 700,
                        fontFamily: "'Albert Sans', sans-serif",
                      }}>
                        <span style={{ fontSize: 11 }}>{slotIcon}</span>
                        <span>{slotLetter}</span>
                      </div>
                    ) : (
                      <button key={st.id} type="button"
                        onClick={e => { e.stopPropagation(); onToggleSlot?.(date, st.id); }}
                        title={`${st.name}: ${STATUS_LABELS[status]}`}
                        style={{
                          height: 28, borderRadius: 6,
                          background: sc.bg, color: sc.text, border: "none",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          gap: 4, fontSize: 12, fontWeight: 700,
                          fontFamily: "'Albert Sans', sans-serif",
                          cursor: "pointer", transition: "all .12s",
                        }}>
                        <span style={{ fontSize: 11 }}>{slotIcon}</span>
                        <span>{slotLetter}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
