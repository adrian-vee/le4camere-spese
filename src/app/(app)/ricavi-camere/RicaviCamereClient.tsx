"use client";

import { useState, useMemo } from "react";
import { eur } from "@/lib/format";

type Booking = {
  id: number;
  arrival: string;
  departure: string;
  nights: number;
  guest_name: string | null;
  channel_name: string | null;
  price: number;
  adults: number;
  children: number;
  is_cancelled: boolean;
  is_blocked: boolean;
  booking_type: string | null;
  apartment_name: string | null;
};

type SortKey = "arrival" | "departure" | "nights" | "price" | "channel_name" | "guest_name" | "apartment_name";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 20;

const CH_COLORS: Record<string, { bg: string; fg: string }> = {
  "Booking.com": { bg: "#E8EFF7", fg: "#003580" },
  "Airbnb": { bg: "#FEECEC", fg: "#FF5A5F" },
  "Direct booking": { bg: "#E8F5E9", fg: "#2D5A3D" },
  "Expedia": { bg: "#FFF8E1", fg: "#C77B4A" },
};

function fmtDateIT(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}

export default function RicaviCamereClient({
  bookings,
  channels,
  apartments,
}: {
  bookings: Booking[];
  channels: string[];
  apartments: string[];
}) {
  // ── Filter state ──
  const [channel, setChannel] = useState("");
  const [apartment, setApartment] = useState("");
  const [status, setStatus] = useState<"valid" | "cancelled" | "blocked" | "all">("valid");
  const [period, setPeriod] = useState<"future" | "past" | "all">("all");
  const [monthFilter, setMonthFilter] = useState("");
  const [search, setSearch] = useState("");

  // ── Sort state ──
  const [sortKey, setSortKey] = useState<SortKey>("arrival");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // ── Pagination ──
  const [page, setPage] = useState(1);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // ── Build month options from data ──
  const monthOptions = useMemo(() => {
    const set = new Set<string>();
    for (const b of bookings) {
      if (b.arrival) set.add(b.arrival.slice(0, 7));
    }
    return Array.from(set).sort().reverse();
  }, [bookings]);

  // ── Apply filters ──
  const filtered = useMemo(() => {
    let list = bookings;

    if (channel) list = list.filter(b => b.channel_name === channel);
    if (apartment) list = list.filter(b => b.apartment_name === apartment);
    if (monthFilter) list = list.filter(b => b.arrival?.slice(0, 7) === monthFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(b => (b.guest_name ?? "").toLowerCase().includes(q));
    }

    if (status === "valid") list = list.filter(b => !b.is_cancelled && !b.is_blocked);
    else if (status === "cancelled") list = list.filter(b => b.is_cancelled);
    else if (status === "blocked") list = list.filter(b => b.is_blocked);

    if (period === "future") list = list.filter(b => b.arrival >= today);
    else if (period === "past") list = list.filter(b => b.arrival < today);

    return list;
  }, [bookings, channel, apartment, status, period, monthFilter, search, today]);

  // ── Sort ──
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      if (sortKey === "nights" || sortKey === "price") {
        const diff = (Number(av) || 0) - (Number(bv) || 0);
        return sortDir === "asc" ? diff : -diff;
      }
      const cmp = String(av).localeCompare(String(bv), "it-IT");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  // ── Pagination ──
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const fromIdx = (safePage - 1) * PAGE_SIZE + 1;
  const toIdx = Math.min(safePage * PAGE_SIZE, sorted.length);

  // Reset page when filters change
  const resetPage = () => setPage(1);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return " ↕";
    return sortDir === "asc" ? " ↑" : " ↓";
  };

  const inputStyle: React.CSSProperties = {
    fontFamily: "'Albert Sans', sans-serif", fontSize: 13,
    border: "1px solid #D8CCB8", borderRadius: 8, padding: "6px 10px",
    background: "#fff", color: "#1F3326", minWidth: 0,
  };

  const thStyle: React.CSSProperties = {
    padding: "8px 12px", fontWeight: 600, color: "#1F3326",
    cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
    fontSize: 13,
  };

  return (
    <>
      {/* ── Filters ── */}
      <div style={{
        display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16,
        padding: "12px 16px", background: "#F3EBDD", borderRadius: 10,
      }}>
        <input
          type="text"
          placeholder="Cerca ospite..."
          value={search}
          onChange={e => { setSearch(e.target.value); resetPage(); }}
          style={{ ...inputStyle, flex: "1 1 160px" }}
        />
        <select value={channel} onChange={e => { setChannel(e.target.value); resetPage(); }} style={{ ...inputStyle, flex: "0 1 160px" }}>
          <option value="">Tutti i canali</option>
          {channels.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={apartment} onChange={e => { setApartment(e.target.value); resetPage(); }} style={{ ...inputStyle, flex: "0 1 160px" }}>
          <option value="">Tutte le camere</option>
          {apartments.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={monthFilter} onChange={e => { setMonthFilter(e.target.value); resetPage(); }} style={{ ...inputStyle, flex: "0 1 130px" }}>
          <option value="">Tutti i mesi</option>
          {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={status} onChange={e => { setStatus(e.target.value as typeof status); resetPage(); }} style={{ ...inputStyle, flex: "0 1 150px" }}>
          <option value="valid">Solo valide</option>
          <option value="cancelled">Solo cancellate</option>
          <option value="blocked">Solo bloccate</option>
          <option value="all">Tutte</option>
        </select>
        <select value={period} onChange={e => { setPeriod(e.target.value as typeof period); resetPage(); }} style={{ ...inputStyle, flex: "0 1 130px" }}>
          <option value="all">Tutte le date</option>
          <option value="future">Future</option>
          <option value="past">Passate</option>
        </select>
      </div>

      {/* ── Results count ── */}
      <div style={{ fontSize: 13, color: "#6C6B5D", fontFamily: "'Albert Sans', sans-serif", marginBottom: 8 }}>
        {sorted.length === 0 ? "Nessun risultato" : `${fromIdx}–${toIdx} di ${sorted.length} risultati`}
      </div>

      {/* ── Table ── */}
      <div style={{ overflowX: "auto" }}>
        <table className="data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: "'Albert Sans', sans-serif" }}>
          <thead>
            <tr style={{ background: "#F3EBDD", textAlign: "left" }}>
              <th style={thStyle} onClick={() => toggleSort("apartment_name")}>Camera{sortIcon("apartment_name")}</th>
              <th style={thStyle} onClick={() => toggleSort("guest_name")}>Ospite{sortIcon("guest_name")}</th>
              <th style={thStyle} onClick={() => toggleSort("arrival")}>Arrivo{sortIcon("arrival")}</th>
              <th style={thStyle} onClick={() => toggleSort("departure")}>Partenza{sortIcon("departure")}</th>
              <th style={{ ...thStyle, textAlign: "center" }} onClick={() => toggleSort("nights")}>Notti{sortIcon("nights")}</th>
              <th style={thStyle} onClick={() => toggleSort("channel_name")}>Canale{sortIcon("channel_name")}</th>
              <th style={{ ...thStyle, textAlign: "right" }} onClick={() => toggleSort("price")}>Prezzo{sortIcon("price")}</th>
              <th style={{ ...thStyle, textAlign: "center", cursor: "default" }}>Stato</th>
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: "16px 12px", color: "#9C8E78", textAlign: "center" }}>Nessuna prenotazione trovata.</td></tr>
            ) : paged.map((b, i) => {
              const chColor = CH_COLORS[b.channel_name ?? ""] ?? { bg: "#F3EBDD", fg: "#1F3326" };
              return (
                <tr key={b.id} style={{ borderBottom: "1px solid #E8E0D0", background: i % 2 === 0 ? "#fff" : "#FDFCF9" }}>
                  <td style={{ padding: "8px 12px", color: "#1F3326" }}>{b.apartment_name ?? "—"}</td>
                  <td style={{ padding: "8px 12px", color: "#6C6B5D" }}>{b.guest_name || "—"}</td>
                  <td style={{ padding: "8px 12px", color: "#6C6B5D" }}>{fmtDateIT(b.arrival)}</td>
                  <td style={{ padding: "8px 12px", color: "#6C6B5D" }}>{fmtDateIT(b.departure)}</td>
                  <td style={{ padding: "8px 12px", textAlign: "center", color: "#6C6B5D" }}>{b.nights || "—"}</td>
                  <td style={{ padding: "8px 12px" }}>
                    <span style={{
                      display: "inline-block", padding: "2px 10px", borderRadius: 20, fontSize: 12,
                      background: chColor.bg, color: chColor.fg,
                    }}>
                      {b.channel_name || "—"}
                    </span>
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: "#1F3326" }}>
                    {eur(Number(b.price) || 0)}
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "center" }}>
                    {b.is_cancelled ? (
                      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "#fbe9e7", color: "#9E3B2E" }}>Cancellata</span>
                    ) : b.is_blocked ? (
                      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "#E8E0D0", color: "#6C6B5D" }}>Blocco</span>
                    ) : (
                      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "#e8f5e9", color: "#2d5a3d" }}>Valida</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Pagination controls ── */}
      {totalPages > 1 && (
        <div style={{
          display: "flex", justifyContent: "center", alignItems: "center", gap: 12,
          marginTop: 16, fontFamily: "'Albert Sans', sans-serif", fontSize: 13,
        }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={safePage <= 1}
            style={{
              background: "#fff", border: "1px solid #D8CCB8", borderRadius: 8,
              padding: "6px 14px", cursor: safePage <= 1 ? "default" : "pointer",
              opacity: safePage <= 1 ? 0.4 : 1, color: "#1F3326", fontWeight: 600,
            }}
          >
            ← Precedente
          </button>
          <span style={{ color: "#6C6B5D" }}>
            Pagina {safePage} di {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
            style={{
              background: "#fff", border: "1px solid #D8CCB8", borderRadius: 8,
              padding: "6px 14px", cursor: safePage >= totalPages ? "default" : "pointer",
              opacity: safePage >= totalPages ? 0.4 : 1, color: "#1F3326", fontWeight: 600,
            }}
          >
            Successiva →
          </button>
        </div>
      )}
    </>
  );
}
