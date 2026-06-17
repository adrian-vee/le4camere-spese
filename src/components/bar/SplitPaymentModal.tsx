"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { Modal } from "@/components/ui/Modal";
import { eur } from "@/lib/format";
import { fmtDate } from "@/lib/format";

type RoomData = {
  roomNumber: string;
  roomName: string | null;
  guestName: string;
};

type SplitResult = {
  cashAmount: number;
  secondMethod: "carta" | "camera";
  secondAmount: number;
  roomNumber?: string;
  guestName?: string;
};

type SplitPaymentModalProps = {
  isOpen: boolean;
  onClose: () => void;
  total: number;
  onConfirm: (split: SplitResult) => void;
};

export default function SplitPaymentModal({
  isOpen,
  onClose,
  total,
  onConfirm,
}: SplitPaymentModalProps) {
  const [cashAmount, setCashAmount] = useState("");
  const [secondMethod, setSecondMethod] = useState<"carta" | "camera">("carta");
  const [rooms, setRooms] = useState<RoomData[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<RoomData | null>(null);
  const [loadingRooms, setLoadingRooms] = useState(false);

  const cashNum = parseFloat(cashAmount) || 0;
  const remainder = Math.max(0, total - cashNum);
  const isValid = cashNum > 0 && cashNum < total && remainder > 0;

  useEffect(() => {
    if (isOpen) {
      setCashAmount("");
      setSecondMethod("carta");
      setSelectedRoom(null);
    }
  }, [isOpen]);

  const loadRooms = useCallback(async () => {
    setLoadingRooms(true);
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
        };
      });
      setRooms(mapped);
    }
    setLoadingRooms(false);
  }, []);

  useEffect(() => {
    if (secondMethod === "camera" && rooms.length === 0) {
      loadRooms();
    }
  }, [secondMethod, rooms.length, loadRooms]);

  function handleConfirm() {
    if (!isValid) return;
    if (secondMethod === "camera" && !selectedRoom) return;
    onConfirm({
      cashAmount: cashNum,
      secondMethod,
      secondAmount: remainder,
      roomNumber: selectedRoom?.roomNumber,
      guestName: selectedRoom?.guestName,
    });
  }

  const needsRoom = secondMethod === "camera" && !selectedRoom;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Pagamento misto" maxWidth={420}>
      <div style={{ fontFamily: "'Albert Sans', sans-serif", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Total display */}
        <div style={{
          background: "#F3EBDD", borderRadius: 10, padding: "14px 16px",
          display: "flex", justifyContent: "space-between", alignItems: "baseline",
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#1F3326" }}>Totale</span>
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: "#1F3326" }}>
            {eur(total)}
          </span>
        </div>

        {/* Cash input */}
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#6C6B5D", display: "block", marginBottom: 6 }}>
            Importo contanti
          </label>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            max={total - 0.01}
            value={cashAmount}
            onChange={(e) => setCashAmount(e.target.value)}
            placeholder="0,00"
            autoFocus
            style={{
              width: "100%", padding: "12px 14px", fontSize: 18, fontWeight: 700,
              border: "1px solid #D8CCB8", borderRadius: 8,
              fontFamily: "'Albert Sans', sans-serif", color: "#1F3326",
              background: "#fff", outline: "none", boxSizing: "border-box",
            }}
          />
        </div>

        {/* Remainder display */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "baseline",
          padding: "8px 0", borderBottom: "1px solid #D8CCB8",
        }}>
          <span style={{ fontSize: 14, color: "#6C6B5D" }}>Residuo</span>
          <span style={{ fontSize: 20, fontWeight: 700, color: remainder > 0 ? "#C77B4A" : "#2D5A3D" }}>
            {eur(remainder)}
          </span>
        </div>

        {/* Second method toggle */}
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#6C6B5D", display: "block", marginBottom: 6 }}>
            Secondo metodo
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => { setSecondMethod("carta"); setSelectedRoom(null); }}
              style={{
                flex: 1, padding: "10px 0", borderRadius: 8, fontSize: 14, fontWeight: 600,
                fontFamily: "'Albert Sans', sans-serif", cursor: "pointer",
                border: secondMethod === "carta" ? "2px solid #1F3326" : "1px solid #D8CCB8",
                background: secondMethod === "carta" ? "#1F3326" : "#fff",
                color: secondMethod === "carta" ? "#fff" : "#1F3326",
              }}
            >
              Carta
            </button>
            <button
              type="button"
              onClick={() => setSecondMethod("camera")}
              style={{
                flex: 1, padding: "10px 0", borderRadius: 8, fontSize: 14, fontWeight: 600,
                fontFamily: "'Albert Sans', sans-serif", cursor: "pointer",
                border: secondMethod === "camera" ? "2px solid #BFA762" : "1px solid #D8CCB8",
                background: secondMethod === "camera" ? "#BFA762" : "#fff",
                color: secondMethod === "camera" ? "#1F3326" : "#1F3326",
              }}
            >
              Camera
            </button>
          </div>
        </div>

        {/* Room selector when camera chosen */}
        {secondMethod === "camera" && (
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#6C6B5D", display: "block", marginBottom: 6 }}>
              Seleziona camera
            </label>
            {loadingRooms ? (
              <div style={{ padding: 16, textAlign: "center", color: "#6C6B5D", fontSize: 13 }}>
                Caricamento camere...
              </div>
            ) : rooms.length === 0 ? (
              <div style={{ padding: 16, textAlign: "center", color: "#6C6B5D", fontSize: 13 }}>
                Nessuna camera occupata
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 180, overflowY: "auto" }}>
                {rooms.map((room) => (
                  <button
                    key={room.roomNumber}
                    type="button"
                    onClick={() => setSelectedRoom(room)}
                    style={{
                      padding: "10px 14px", borderRadius: 8, textAlign: "left",
                      fontFamily: "'Albert Sans', sans-serif", cursor: "pointer",
                      border: selectedRoom?.roomNumber === room.roomNumber ? "2px solid #BFA762" : "1px solid #D8CCB8",
                      background: selectedRoom?.roomNumber === room.roomNumber ? "rgba(191,167,98,0.1)" : "#F3EBDD",
                      touchAction: "manipulation",
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#1F3326" }}>
                      Camera {room.roomNumber}
                    </div>
                    <div style={{ fontSize: 13, color: "#6C6B5D" }}>{room.guestName}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Confirm */}
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!isValid || needsRoom}
          style={{
            width: "100%", padding: "14px 0", borderRadius: 10, border: "none",
            background: !isValid || needsRoom ? "#a0a09a" : "#1F3326",
            color: "#fff", fontSize: 15, fontWeight: 700,
            fontFamily: "'Albert Sans', sans-serif", cursor: !isValid || needsRoom ? "default" : "pointer",
            opacity: !isValid || needsRoom ? 0.6 : 1,
            transition: "opacity 150ms",
          }}
        >
          Conferma pagamento misto
        </button>
      </div>
    </Modal>
  );
}
