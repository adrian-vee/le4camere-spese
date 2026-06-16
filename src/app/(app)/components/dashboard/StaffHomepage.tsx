"use client";

import Link from "next/link";

/* ── Types ── */
interface ShiftInfo {
  name: string;
  start: string;
  end: string;
  color: string;
}

interface NextShift {
  date: string;
  name: string;
  start: string;
  end: string;
  color: string;
}

interface LowStockItem {
  product_id: string;
  name: string;
  current_stock: number;
  min_stock: number;
  unit: string;
}

interface SwapRequest {
  id: string;
  request_date: string;
  request_shift: string | null;
  note: string | null;
  requester_id: string;
  profiles: { full_name: string } | null;
}

interface StaffHomepageProps {
  greeting: string;
  firstName: string;
  greetingDate: string;
  isAChiamata: boolean;
  todayShiftInfo: ShiftInfo[];
  nextShifts: NextShift[];
  cassaOpen: boolean;
  lowStockItems: LowStockItem[];
  pendingSwaps: SwapRequest[];
  monthAvailSubmitted: boolean;
  availSubmittedAt: string | null;
  nextMonthLabelCap: string;
  isPastAvailDeadline: boolean;
  isAvailUrgent: boolean;
  daysUntilAvailDeadline: number;
}

export default function StaffHomepage({
  greeting,
  firstName,
  greetingDate,
  isAChiamata,
  todayShiftInfo,
  nextShifts,
  cassaOpen,
  lowStockItems,
  pendingSwaps,
  monthAvailSubmitted,
  availSubmittedAt,
  nextMonthLabelCap,
  isPastAvailDeadline,
  isAvailUrgent,
  daysUntilAvailDeadline,
}: StaffHomepageProps) {
  return (
    <>
      {/* ── Greeting ── */}
      <div className="dash-greeting">
        <h1 className="serif">{greeting}, {firstName}</h1>
        <div className="date">{greetingDate}</div>
      </div>

      {/* ── Quick actions ── */}
      <div className="dash-actions">
        <Link href="/cassa">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M12 12h.01" /><path d="M17 12h.01" /><path d="M7 12h.01" /></svg>
          <span className="dash-label-long">Cassa</span>
          <span className="dash-label-short">Cassa</span>
        </Link>
        <Link href="/turni">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" /></svg>
          <span className="dash-label-long">Turni</span>
          <span className="dash-label-short">Turni</span>
        </Link>
        <Link href="/magazzino">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></svg>
          <span className="dash-label-long">Magazzino</span>
          <span className="dash-label-short">Magaz.</span>
        </Link>
        <Link href="/drink-lab" style={{ background: "rgba(191,167,98,.12)", color: "#BFA762" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2h8l-2 18H10L8 2Z" /><path d="M4 9h16" /></svg>
          <span className="dash-label-long">Drink Lab</span>
          <span className="dash-label-short">Drink</span>
        </Link>
        {isAChiamata && (
          <Link href="/disponibilita" style={{ background: "rgba(45,90,61,.12)", color: "#2D5A3D" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
            <span className="dash-label-long">Disponibilità</span>
            <span className="dash-label-short">Disp.</span>
          </Link>
        )}
      </div>

      {/* ── Staff cards ── */}
      <div className="cards">
        {/* Il mio turno oggi */}
        <div className="card" style={{ borderLeft: `4px solid ${todayShiftInfo.length > 0 ? "#2D5A3D" : "#BFA762"}` }}>
          <div className="label">IL MIO TURNO OGGI</div>
          {todayShiftInfo.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
              {todayShiftInfo.map((s, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="dot" style={{ background: s.color }} />
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{s.name}</span>
                  <span className="muted" style={{ fontSize: 13 }}>{s.start}–{s.end}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="value" style={{ fontSize: 15, fontWeight: 600, color: "var(--ink-soft)" }}>
              Nessun turno oggi
            </div>
          )}
        </div>

        {/* Cassa */}
        <div className="card">
          <div className="label">CASSA</div>
          <div className="value" style={{ fontSize: 15 }}>
            {cassaOpen ? (
              <Link href="/cassa" style={{ color: "var(--ok)", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--ok)", display: "inline-block" }} />
                Cassa aperta
              </Link>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ color: "var(--ink-soft)", fontWeight: 600 }}>Cassa chiusa</span>
                <Link
                  href="/cassa"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#1F3326",
                    background: "var(--surface-2)",
                    padding: "5px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--line)",
                    width: "fit-content",
                  }}
                >
                  Apri cassa →
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Disponibilità mensile (solo a chiamata) */}
        {isAChiamata && (
          <div className="card" style={{ borderTop: `3px solid ${monthAvailSubmitted ? "#2D5A3D" : isPastAvailDeadline ? "#9E3B2E" : "#C77B4A"}` }}>
            <div className="label">Disponibilità {nextMonthLabelCap}</div>
            {monthAvailSubmitted ? (
              <>
                <div className="value" style={{ fontSize: 15, fontWeight: 700, color: "#2D5A3D", display: "flex", alignItems: "center", gap: 6 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                  Inviata
                </div>
                {availSubmittedAt && (
                  <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                    il {new Date(availSubmittedAt).toLocaleDateString("it-IT", { day: "2-digit", month: "long" })}
                  </div>
                )}
                <Link href="/disponibilita" className="muted" style={{ fontSize: 12, fontWeight: 600, marginTop: 4, display: "inline-block" }}>Modifica →</Link>
              </>
            ) : (
              <>
                <div className="value" style={{ fontSize: 15, fontWeight: 700, color: isPastAvailDeadline ? "#C4453C" : "#BFA762" }}>
                  {isPastAvailDeadline ? "Non inviata" : "Da inviare"}
                </div>
                {isAvailUrgent && (
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#9E3B2E", marginTop: 2 }}>
                    Scade tra {daysUntilAvailDeadline} {daysUntilAvailDeadline === 1 ? "giorno" : "giorni"}
                  </div>
                )}
                <Link href="/disponibilita" style={{ fontSize: 12, fontWeight: 700, color: isPastAvailDeadline ? "#9E3B2E" : "#BFA762", marginTop: 4, display: "inline-block" }}>Compila ora →</Link>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Low stock ── */}
      {lowStockItems.length > 0 && (
        <div className="section" style={{ borderLeft: "3px solid #9E3B2E" }}>
          <div className="section-head">
            <h2>Scorte basse</h2>
            <Link href="/magazzino" className="muted" style={{ fontSize: 13, fontWeight: 700 }}>Vai al magazzino →</Link>
          </div>
          <div className="section-body">
            {lowStockItems.slice(0, 6).map(p => (
              <div key={p.product_id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</span>
                <span className="muted" style={{ fontSize: 13 }}>
                  <strong style={{ color: "var(--danger)" }}>{p.current_stock} {p.unit}</strong> / min {p.min_stock}
                </span>
              </div>
            ))}
            {lowStockItems.length > 6 && (
              <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>+{lowStockItems.length - 6} altri prodotti sotto scorta</div>
            )}
          </div>
        </div>
      )}

      {/* ── Swap requests ── */}
      {pendingSwaps.length > 0 && (
        <div className="section" style={{ borderLeft: "3px solid #BFA762" }}>
          <div className="section-head">
            <h2>Richieste cambio turno</h2>
            <span className="muted">{pendingSwaps.length} in sospeso</span>
          </div>
          <div className="section-body">
            {pendingSwaps.map(r => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--line)", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{r.profiles?.full_name ?? "?"}</div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    Vuole scambiare il turno del {new Date(r.request_date + "T00:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "long" })}
                    {r.request_shift ? ` (${r.request_shift})` : ""}
                  </div>
                </div>
                <Link href="/turni" style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)" }}>Vai ai turni →</Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Prossimi turni ── */}
      <div className="section">
        <div className="section-head">
          <h2>I miei prossimi turni</h2>
          <span className="muted">Prossimi 7 giorni</span>
        </div>
        <div className="section-body">
          {nextShifts.length === 0 ? (
            <p className="muted">Nessun turno programmato nei prossimi giorni.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {nextShifts.map((s, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 14px", borderRadius: 10,
                  background: "var(--surface)", border: "1px solid var(--line)",
                }}>
                  <span className="dot" style={{ background: s.color }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{s.name}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{s.start}–{s.end}</div>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink-soft)" }}>
                    {s.date}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
