"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { eur, fmtDate } from "@/lib/format";
import Link from "next/link";
import NuovoArrivo from "./NuovoArrivo";
import { useRole } from "@/lib/useRole";
import { useToast } from "@/lib/useToast";
import { Toast } from "@/components/Toast";

type Supplier = {
  id: string; name: string; contact_person: string | null; phone: string | null;
  email: string | null; address: string | null; iban: string | null;
  payment_terms: string | null; category: string | null; notes: string | null;
  active: boolean; created_at: string;
};
type Delivery = {
  id: string; supplier_id: string; delivery_date: string; total_amount: number;
};

const CATEGORIES = ["Alimentari", "Bevande", "Pulizia", "Biancheria", "Manutenzione", "Altro"];
const CAT_COLORS: Record<string, { bg: string; fg: string }> = {
  Alimentari: { bg: "rgba(45,90,61,.1)", fg: "#2D5A3D" },
  Bevande: { bg: "rgba(191,167,98,.12)", fg: "#96832E" },
  Pulizia: { bg: "rgba(79,123,140,.1)", fg: "#4A6FA5" },
  Biancheria: { bg: "rgba(122,106,140,.1)", fg: "#7A6A8C" },
  Manutenzione: { bg: "rgba(168,85,47,.1)", fg: "#A8552F" },
  Altro: { bg: "rgba(108,107,93,.08)", fg: "#6C6B5D" },
};

const EMPTY_SUPPLIER = {
  name: "", contact_person: "", phone: "", email: "", address: "",
  iban: "", payment_terms: "", category: "Alimentari", notes: "",
};

export default function FornitoriPage() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const { role } = useRole();
  const isStaff = role === "staff";

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "spent" | "recent">("name");

  const [showModal, setShowModal] = useState(false);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);
  const [sf, setSf] = useState({ ...EMPTY_SUPPLIER });

  const [showArrivo, setShowArrivo] = useState(searchParams.get("arrivo") === "1");
  const [arrivoSupplierId, setArrivoSupplierId] = useState<string | null>(null);

  const { toast, showToast } = useToast();

  async function load() {
    setLoading(true);
    const [{ data: s }, { data: d }] = await Promise.all([
      supabase.from("suppliers").select("*").eq("active", true).order("name"),
      supabase.from("supplier_deliveries").select("id, supplier_id, delivery_date, total_amount").order("delivery_date", { ascending: false }),
    ]);
    setSuppliers((s ?? []) as Supplier[]);
    setDeliveries((d ?? []) as Delivery[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const yearStart = `${now.getFullYear()}-01-01`;

  const monthDeliveries = deliveries.filter(d => d.delivery_date >= monthStart);
  const yearDeliveries = deliveries.filter(d => d.delivery_date >= yearStart);
  const spentMonth = monthDeliveries.reduce((s, d) => s + d.total_amount, 0);
  const spentYear = yearDeliveries.reduce((s, d) => s + d.total_amount, 0);

  const lastDeliveryMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const d of deliveries) { if (!m[d.supplier_id]) m[d.supplier_id] = d.delivery_date; }
    return m;
  }, [deliveries]);

  const monthSpentMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of monthDeliveries) { m[d.supplier_id] = (m[d.supplier_id] ?? 0) + d.total_amount; }
    return m;
  }, [monthDeliveries]);

  const filtered = useMemo(() => {
    let list = suppliers;
    if (search) { const q = search.toLowerCase(); list = list.filter(s => s.name.toLowerCase().includes(q) || (s.category ?? "").toLowerCase().includes(q)); }
    return [...list].sort((a, b) => {
      if (sortBy === "spent") return (monthSpentMap[b.id] ?? 0) - (monthSpentMap[a.id] ?? 0);
      if (sortBy === "recent") return (lastDeliveryMap[b.id] ?? "") > (lastDeliveryMap[a.id] ?? "") ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
  }, [suppliers, search, sortBy, monthSpentMap, lastDeliveryMap]);

  function openNew() { setEditSupplier(null); setSf({ ...EMPTY_SUPPLIER }); setShowModal(true); }
  function openEdit(s: Supplier) {
    setEditSupplier(s);
    setSf({
      name: s.name, contact_person: s.contact_person ?? "", phone: s.phone ?? "",
      email: s.email ?? "", address: s.address ?? "", iban: s.iban ?? "",
      payment_terms: s.payment_terms ?? "", category: s.category ?? "Altro", notes: s.notes ?? "",
    });
    setShowModal(true);
  }

  async function saveSupplier() {
    if (!sf.name.trim()) return alert("Inserisci il nome del fornitore.");
    const payload = {
      name: sf.name.trim(), contact_person: sf.contact_person.trim() || null,
      phone: sf.phone.trim() || null, email: sf.email.trim() || null,
      address: sf.address.trim() || null, iban: sf.iban.trim() || null,
      payment_terms: sf.payment_terms.trim() || null, category: sf.category || null,
      notes: sf.notes.trim() || null, active: true,
    };
    if (editSupplier) {
      const { error } = await supabase.from("suppliers").update(payload).eq("id", editSupplier.id);
      if (error) return alert("Errore: " + error.message);
      showToast("Fornitore aggiornato");
    } else {
      const { error } = await supabase.from("suppliers").insert(payload);
      if (error) return alert("Errore: " + error.message);
      showToast("Fornitore creato");
    }
    setShowModal(false); load();
  }

  function openArrivo(supplierId?: string) {
    setArrivoSupplierId(supplierId ?? null);
    setShowArrivo(true);
  }

  const catStyle = (cat: string | null) => {
    const c = CAT_COLORS[cat ?? ""] ?? CAT_COLORS.Altro;
    return { background: c.bg, color: c.fg };
  };

  if (showArrivo) {
    return (
      <NuovoArrivo
        suppliers={suppliers}
        preSelectedSupplierId={arrivoSupplierId}
        onClose={() => setShowArrivo(false)}
        onDone={() => { setShowArrivo(false); load(); showToast("Arrivo registrato con successo"); }}
      />
    );
  }

  return (
    <>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 className="serif" style={{ fontSize: 24, fontWeight: 500 }}>Fornitori</h1>
          <p className="muted" style={{ marginTop: 4 }}>Gestisci i fornitori e gli arrivi merce</p>
        </div>
        {!isStaff && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-primary" onClick={openNew}>+ Nuovo fornitore</button>
            <button className="btn btn-ghost" style={{ fontWeight: 700 }} onClick={() => openArrivo()}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
                <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" /><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" />
              </svg>
              Nuovo arrivo merce
            </button>
          </div>
        )}
      </div>

      {/* KPI */}
      <div className="cards cards-4">
        <div className="card">
          <div className="label">Fornitori attivi</div>
          <div className="value tabular">{suppliers.length}</div>
        </div>
        <div className="card">
          <div className="label">Consegne questo mese</div>
          <div className="value tabular">{monthDeliveries.length}</div>
        </div>
        <div className="card accent">
          <div className="label">Speso questo mese</div>
          <div className="value tabular">{eur(spentMonth)}</div>
        </div>
        <div className="card">
          <div className="label">Speso quest&apos;anno</div>
          <div className="value tabular">{eur(spentYear)}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="section" style={{ marginBottom: 0 }}>
        <div className="section-body filters" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <input placeholder="Cerca fornitore..." value={search} onChange={e => setSearch(e.target.value)} style={{ flex: "1 1 200px", minWidth: 160 }} />
          <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)} style={{ minWidth: 150 }}>
            <option value="name">Ordina: Nome</option>
            <option value="spent">Ordina: Spesa mese</option>
            <option value="recent">Ordina: Ultimo arrivo</option>
          </select>
        </div>
      </div>

      {/* Supplier List */}
      <div className="section">
        <div className="section-head"><h2>Fornitori ({filtered.length})</h2></div>
        <div className="section-body" style={{ padding: 0 }}>
          {loading ? <div className="empty">Caricamento...</div> : filtered.length === 0 ? (
            <div className="empty">
              <div className="serif" style={{ fontSize: 18, marginBottom: 6 }}>Nessun fornitore</div>
              <div>{suppliers.length > 0 ? "Nessun risultato per la ricerca." : "Aggiungi il primo fornitore."}</div>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="fornitori-table-wrap">
                <table className="tbl" style={{ minWidth: 700 }}>
                  <thead><tr>
                    <th>Fornitore</th>
                    <th>Categoria</th>
                    <th>Contatto</th>
                    <th>Ultimo arrivo</th>
                    <th style={{ textAlign: "right" }}>Speso a {new Date().toLocaleDateString("it-IT", { month: "long" })}</th>
                    <th></th>
                  </tr></thead>
                  <tbody>
                    {filtered.map(s => (
                      <tr key={s.id}>
                        <td>
                          <Link href={`/fornitori/${s.id}`} style={{ fontWeight: 700, color: "#1F3326", textDecoration: "none", fontSize: 14 }}>{s.name}</Link>
                        </td>
                        <td><span className="badge" style={catStyle(s.category)}>{s.category ?? "—"}</span></td>
                        <td className="muted" style={{ fontSize: 13 }}>{s.phone ?? s.email ?? "—"}</td>
                        <td style={{ fontSize: 13 }}>{lastDeliveryMap[s.id] ? fmtDate(lastDeliveryMap[s.id]) : <span className="muted">Mai</span>}</td>
                        <td style={{ textAlign: "right", fontWeight: 600 }}>{monthSpentMap[s.id] ? eur(monthSpentMap[s.id]) : <span className="muted">—</span>}</td>
                        <td>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            {!isStaff && <button className="btn-ghost" style={{ padding: "5px 10px", borderRadius: 8, fontSize: 12 }} onClick={() => openEdit(s)}>Modifica</button>}
                            {!isStaff && <button className="btn-ghost" style={{ padding: "5px 10px", borderRadius: 8, fontSize: 12, color: "#2D5A3D", fontWeight: 700 }} onClick={() => openArrivo(s.id)}>Nuovo arrivo</button>}
                            <Link href={`/fornitori/${s.id}`} className="btn-ghost" style={{ padding: "5px 10px", borderRadius: 8, fontSize: 12, textDecoration: "none" }}>Dettaglio</Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="fornitori-cards-wrap">
                {filtered.map(s => (
                  <div key={s.id} className="fornitore-card">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <Link href={`/fornitori/${s.id}`} style={{ fontWeight: 700, fontSize: 16, color: "#1F3326", textDecoration: "none" }}>{s.name}</Link>
                      <span className="badge" style={catStyle(s.category)}>{s.category ?? "—"}</span>
                    </div>
                    {s.phone && <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>Tel: {s.phone}</div>}
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 13 }}>
                      <span className="muted">Ultimo arrivo: {lastDeliveryMap[s.id] ? fmtDate(lastDeliveryMap[s.id]) : "Mai"}</span>
                      <span style={{ fontWeight: 600 }}>
                        {monthSpentMap[s.id] ? `Speso: ${eur(monthSpentMap[s.id])}` : ""}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                      {!isStaff && (
                        <button className="btn btn-ghost" style={{ flex: 1, fontSize: 13, padding: "8px 12px" }} onClick={() => openArrivo(s.id)}>Nuovo arrivo</button>
                      )}
                      <Link href={`/fornitori/${s.id}`} className="btn btn-ghost" style={{ flex: 1, fontSize: 13, padding: "8px 12px", textDecoration: "none", textAlign: "center" }}>Dettaglio</Link>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Supplier Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="section-head" style={{ padding: "20px 24px", borderBottom: "1px solid var(--line)" }}>
              <h2>{editSupplier ? "Modifica fornitore" : "Nuovo fornitore"}</h2>
              <button className="btn-ghost" style={{ padding: "4px 10px", borderRadius: 8 }} onClick={() => setShowModal(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, maxHeight: "70vh", overflowY: "auto" }}>
              <div className="field"><label>Nome *</label><input value={sf.name} onChange={e => setSf({ ...sf, name: e.target.value })} placeholder="Es. Eurospin, Metro..." /></div>
              <div className="field">
                <label>Categoria</label>
                <select value={sf.category} onChange={e => setSf({ ...sf, category: e.target.value })}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="grid2">
                <div className="field"><label>Referente</label><input value={sf.contact_person} onChange={e => setSf({ ...sf, contact_person: e.target.value })} placeholder="Nome contatto" /></div>
                <div className="field"><label>Telefono</label><input value={sf.phone} onChange={e => setSf({ ...sf, phone: e.target.value })} placeholder="045 123456" /></div>
              </div>
              <div className="grid2">
                <div className="field"><label>Email</label><input type="email" value={sf.email} onChange={e => setSf({ ...sf, email: e.target.value })} placeholder="info@fornitore.it" /></div>
                <div className="field"><label>Indirizzo</label><input value={sf.address} onChange={e => setSf({ ...sf, address: e.target.value })} placeholder="Via..." /></div>
              </div>
              <div className="grid2">
                <div className="field"><label>IBAN</label><input value={sf.iban} onChange={e => setSf({ ...sf, iban: e.target.value })} placeholder="IT..." style={{ fontFamily: "'Courier New', monospace", letterSpacing: 1, fontSize: 13 }} /></div>
                <div className="field"><label>Condizioni pagamento</label><input value={sf.payment_terms} onChange={e => setSf({ ...sf, payment_terms: e.target.value })} placeholder="Es. 30gg fine mese" /></div>
              </div>
              <div className="field"><label>Note</label><textarea value={sf.notes} onChange={e => setSf({ ...sf, notes: e.target.value })} placeholder="Note opzionali..." /></div>
              <button className="btn btn-primary" style={{ width: "100%", padding: "14px 22px", fontSize: 15 }} onClick={saveSupplier}>
                {editSupplier ? "Salva modifiche" : "Salva fornitore"}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast toast={toast} />
    </>
  );
}
