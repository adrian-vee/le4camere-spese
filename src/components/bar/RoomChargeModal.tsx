"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { Modal } from "@/components/ui/Modal";
import { fmtDate } from "@/lib/format";

type RoomData = {
  roomNumber: string;
  roomName: string | null;
  guestName: string;
  checkIn: string;
  checkOut: string;
};

type RoomChargeModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (roomNumber: string, guestName: string) => void;
};

export default function RoomChargeModal({ isOpen, onClose, onSelect }: RoomChargeModalProps) {
  const [rooms, setRooms] = useState<RoomData[]>([]);
  const [loading, setLoading] = useState(false);

  const loadRooms = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const today = new Date().toISOString().slice(0, 10);

    const { data } = await supabase
      .from("housekeeping_tasks")
      .select("room_id, guest_name, check_in_date, check_out_date, rooms!inner(number, name)")
      .eq("task_date", today)
      .in("occupancy_status", ["stayover", "checkout"]);

    if (data) {
      const mapped: RoomData[] = data.map((row: Record<string, unknown>) => {
        const room = row.rooms as { number: number; name: string | null } | null;
        return {
          roomNumber: String(room?.number ?? ""),
          roomName: room?.name ?? null,
          guestName: (row.guest_name as string) ?? "",
          checkIn: (row.check_in_date as string) ?? "",
          checkOut: (row.check_out_date as string) ?? "",
        };
      });
      setRooms(mapped);
    } else {
      setRooms([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadRooms();
    }
  }, [isOpen, loadRooms]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Addebita camera" maxWidth={440}>
      {loading ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 40,
            color: "#6C6B5D",
            fontFamily: "'Albert Sans', sans-serif",
            fontSize: 14,
          }}
        >
          Caricamento camere...
        </div>
      ) : rooms.length === 0 ? (
        <div
          style={{
            padding: "32px 16px",
            textAlign: "center",
            color: "#6C6B5D",
            fontFamily: "'Albert Sans', sans-serif",
            fontSize: 14,
          }}
        >
          Nessuna camera occupata
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rooms.map((room) => (
            <button
              key={room.roomNumber}
              type="button"
              onClick={() => onSelect(room.roomNumber, room.guestName)}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                padding: "14px 16px",
                background: "#F3EBDD",
                border: "1px solid #D8CCB8",
                borderRadius: 10,
                cursor: "pointer",
                textAlign: "left",
                fontFamily: "'Albert Sans', sans-serif",
                transition: "background 150ms",
                touchAction: "manipulation",
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 15, color: "#1F3326" }}>
                  Camera {room.roomNumber}
                </span>
                {room.roomName && (
                  <span style={{ fontSize: 13, color: "#6C6B5D" }}>
                    {room.roomName}
                  </span>
                )}
              </div>
              <span style={{ fontSize: 14, color: "#1F3326", fontWeight: 500 }}>
                {room.guestName}
              </span>
              <span style={{ fontSize: 12, color: "#6C6B5D" }}>
                {fmtDate(room.checkIn)} &mdash; {fmtDate(room.checkOut)}
              </span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
