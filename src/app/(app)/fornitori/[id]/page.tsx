"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { eur, fmtDate } from "@/lib/format";
import Link from "next/link";
import NuovoArrivo from "../NuovoArrivo";
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
  document_type: string; document_number: string | null; status: string;
  created_at: string;
  items?: DeliveryItem[];
};
type DeliveryItem = {
  id: string; product_name: string; quantity: number; unit_price: number; total_price: number;
};
type AssocProduct = {
  id: string; name: string; unit_cost: number; unit: string;
};

const CAT_COLORS: Record<string, { bg: string; fg: string }> = {
  Alimentari: { bg: "rgba(45,90,61,.1)", fg: "#2D5A3D" },
  Bevande: { bg: "rgba(191,167,98,.12)", fg: "#96832E" },
  Pulizia: { bg: "rgba(79,123,140,.1)", fg: "#4A6FA5" },
  Biancheria: { bg: "rgba(122,106,140,.1)", fg: "#7A6A8C" },
  Manutenzione: { bg: "rgba(168,85,47,.1)", fg: "#A8552F" },
  Altro: { bg: "rgba(108,107,93,.08)", fg: "#6C6B5D" },
};
const CATEGORIES = ["Alimentari", "Bevande", "Pulizia", "Biancheria", "Manutenzione", "Altro"];

export default function FornitoreDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();
  const { role, isManager, loading: roleLoading } = useRole();
  const isStaff = role === "staff";

  useEffect(() => {
    if (!roleLoading && !isManager) {
      router.replace("/");
    }
  }, [roleLoading, isManager, router]);

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [assocProducts, setAssocProducts] = useState<AssocProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const PER_PAGE = 10;

  const [showArrivo, setShowArrivo] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [sf, setSf] = useState({ name: "", contact_person: "", phone: "", email: "", address: "", iban: "", payment_terms: "", category: "Altro", notes: "" });
  const { toast, showToast } = useToast();
  const [showDetailDelivery, setShowDetailDelivery] = useState<Delivery | null>(null);


  async function load() {
    setLoading(true);
    const [{ data: s }, { data: d }, { data: prods }] = await Promise.all([
      supabase.from("suppliers").select("*").eq("id", id).single(),
      supabase.from("supplier_deliveries").select("*").eq("supplier_id", id).order("delivery_date", { ascending: false }),
      supabase.from("products").select("id, name, unit_cost, unit").eq("default_supplier_id", id).eq("active", true).order("name"),
    ]);
    if (s) {
      setSupplier(s as Supplier);
      setSf({
        name: s.name, contact_person: s.contact_person ?? "", phone: s.phone ?? "",
        email: s.email ?? "", address: s.address ?? "", iban: s.iban ?? "",
        payment_terms: s.payment_terms ?? "", category: s.category ?? "Altro", notes: s.notes ?? "",
      });
    }
    setDeliveries((d ?? []) as Delivery[]);
    setAssocProducts((prods ?? []) as AssocProduct[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, [id]);

  async function deleteSupplier() {
    if (!confirm("Eliminare questo fornitore? Tutte le consegne associate verranno eliminate.")) return;
    await supabase.from("suppliers").update({ active: false }).eq("id", id);
    router.push("/fornitori");
  }

  async function saveEdit() {
    if (!sf.name.trim()) return alert("Inserisci il nome.");
    const { error } = await supabase.from("suppliers").update({
      name: sf.name.trim(), contact_person: sf.contact_person.trim() || null,
      phone: sf.phone.trim() || null, email: sf.email.trim() || null,
      address: sf.address.trim() || null, iban: sf.iban.trim() || null,
      payment_terms: sf.payment_terms.trim() || null, category: sf.category || null,
      notes: sf.notes.trim() || null,
    }).eq("id", id);
    if (error) return alert("Errore: " + error.message);
    setShowEdit(false); load(); showToast("Fornitore aggiornato");
  }

  async function openDeliveryDetail(d: Delivery) {
    const { data: items } = await supabase.from("supplier_delivery_items").select("*").eq("delivery_id", d.id);
    setShowDetailDelivery({ ...d, items: (items ?? []) as DeliveryItem[] });
  }

  // Monthly stats for last 6 months
  const monthlyStats = useMemo(() => {
    const months: { key: string; label: string; total: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("it-IT", { month: "short" });
      const total = deliveries.filter(del => del.delivery_date.startsWith(key)).reduce((s, del) => s + del.total_amount, 0);
      months.push({ key, label, total });
    }
    return months;
  }, [deliveries]);
  const maxMonthly = Math.max(...monthlyStats.map(m => m.total), 1);

  const pagedDeliveries = deliveries.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const totalPages = Math.ceil(deliveries.length / PER_PAGE);

  const catStyle = (cat: string | null) => {
    const c = CAT_COLORS[cat ?? ""] ?? CAT_COLORS.Altro;
    return { background: c.bg, color: c.fg };
  };

  if (roleLoading || !isManager) {
    return <div style={{ padding: 40, textAlign: "center", color: "#6C6B5D", fontFamily: "'Albert Sans', sans-serif" }}>Caricamento...</div>;
  }

  if (loading) return <div className="empty" style={{ padding: 40 }}>Caricamento...</div>;
  if (!supplier) return <div className="empty" style={{ padding: 40 }}>Fornitore non trovato</div>;

  if (showArrivo) {
    return (
      <NuovoArrivo
        suppliers={[supplier]}
        preSelectedSupplierId={supplier.id}
        onClose={() => setShowArrivo(false)}
        onDone={() => { setShowArrivo(false); load(); showToast("Arrivo registrato"); }}
      />
    );
  }

  return (
    <>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <Link href="/fornitori" style={{ fontSize: 13, color: "var(--ink-soft)", textDecoration: "none" }}>← Fornitori</Link>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginTop: 8, flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <h1 className="serif" style={{ fontSize: 24, fontWeight: 500 }}>{supplier.name}</h1>
            <span className="badge" style={catStyle(supplier.category)}>{supplier.category ?? "—"}</span>
          </div>
          {!isStaff && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn btn-ghost" onClick={() => setShowEdit(true)}>Modifica</button>
              <button className="btn btn-primary" onClick={() => setShowArrivo(true)}>Nuovo arrivo</button>
              <button className="btn btn-ghost" style={{ color: "#9E3B2E" }} onClick={deleteSupplier}>Elimina</button>
            </div>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="section" style={{ marginBottom: 20 }}>
        <div className="section-head"><h2>Informazioni</h2></div>
        <div className="section-body">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 24px" }}>
            {supplier.contact_person && <div style={{ minWidth: 0 }}><div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>Referente</div><div style={{ fontWeight: 600, marginTop: 2, overflowWrap: "anywhere" }}>{supplier.contact_person}</div></div>}
            {supplier.phone && <div style={{ minWidth: 0 }}><div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>Telefono</div><div style={{ fontWeight: 600, marginTop: 2, overflowWrap: "anywhere" }}>{supplier.phone}</div></div>}
            {supplier.email && <div style={{ minWidth: 0 }}><div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>Email</div><div style={{ fontWeight: 600, marginTop: 2, overflowWrap: "anywhere" }}>{supplier.email}</div></div>}
            {supplier.address && <div style={{ minWidth: 0 }}><div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>Indirizzo</div><div style={{ fontWeight: 600, marginTop: 2, overflowWrap: "anywhere" }}>{supplier.address}</div></div>}
            {supplier.iban && <div style={{ minWidth: 0 }}><div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>IBAN</div><div style={{ fontWeight: 600, marginTop: 2, fontFamily: "'Courier New', monospace", fontSize: 13, letterSpacing: 1, overflowWrap: "anywhere" }}>{supplier.iban}</div></div>}
            {supplier.payment_terms && <div style={{ minWidth: 0 }}><div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>Condizioni pagamento</div><div style={{ fontWeight: 600, marginTop: 2, overflowWrap: "anywhere" }}>{supplier.payment_terms}</div></div>}
            {supplier.notes && <div style={{ gridColumn: "1 / -1", minWidth: 0 }}><div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>Note</div><div style={{ marginTop: 2, overflowWrap: "anywhere" }}>{supplier.notes}</div></div>}
          </div>
          {!supplier.contact_person && !supplier.phone && !supplier.email && !supplier.address && (
            <div className="muted" style={{ textAlign: "center", padding: 8 }}>Nessuna informazione di contatto</div>
          )}
        </div>
      </div>

      {/* Monthly stats */}
      <div className="section" style={{ marginBottom: 20 }}>
        <div className="section-head"><h2>Spesa ultimi 6 mesi</h2></div>
        <div className="section-body">
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 120 }}>
            {monthlyStats.map(m => (
              <div key={m.key} style={{ flex: 1, textAlign: "center" }}>
                <div style={{ background: m.total > 0 ? "#1F3326" : "#E8E3D8", borderRadius: 6, height: `${Math.max((m.total / maxMonthly) * 100, 4)}%`, minHeight: 4, transition: "height .3s" }} />
                <div style={{ fontSize: 10, marginTop: 6, color: "var(--ink-soft)", textTransform: "capitalize" }}>{m.label}</div>
                <div style={{ fontSize: 11, fontWeight: 600, marginTop: 2 }}>{m.total > 0 ? eur(m.total) : "—"}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Deliveries */}
      <div className="section" style={{ marginBottom: 20 }}>
        <div className="section-head"><h2>Storico consegne ({deliveries.length})</h2></div>
        <div className="section-body" style={{ padding: 0, overflowX: "auto" }}>
          {deliveries.length === 0 ? (
            <div className="empty">Nessuna consegna registrata</div>
          ) : (
            <>
              <table className="tbl" style={{ margin: 0 }}>
                <thead><tr>
                  <th>Data</th>
                  <th>Documento</th>
                  <th style={{ textAlign: "right" }}>Totale</th>
                  <th>Stato</th>
                  <th></th>
                </tr></thead>
                <tbody>
                  {pagedDeliveries.map(d => (
                    <tr key={d.id}>
                      <td style={{ whiteSpace: "nowrap" }}>{fmtDate(d.delivery_date)}</td>
                      <td>{d.document_type} {d.document_number ? `n. ${d.document_number}` : ""}</td>
                      <td style={{ textAlign: "right", fontWeight: 700 }}>{eur(d.total_amount)}</td>
                      <td><span className="badge" style={{ background: "#E3EEE4", color: "#2D5A3D" }}>{d.status}</span></td>
                      <td><button className="btn-ghost" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => openDeliveryDetail(d)}>Dettaglio</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {totalPages > 1 && (
                <div style={{ display: "flex", justifyContent: "center", gap: 8, padding: 12 }}>
                  <button className="btn btn-ghost" disabled={page === 0} onClick={() => setPage(page - 1)} style={{ fontSize: 12 }}>← Prec</button>
                  <span className="muted" style={{ lineHeight: "32px", fontSize: 13 }}>Pag {page + 1} di {totalPages}</span>
                  <button className="btn btn-ghost" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)} style={{ fontSize: 12 }}>Succ →</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Associated products */}
      {assocProducts.length > 0 && (
        <div className="section" style={{ marginBottom: 20 }}>
          <div className="section-head"><h2>Prodotti associati ({assocProducts.length})</h2></div>
          <div className="section-body" style={{ padding: 0, overflowX: "auto" }}>
            <table className="tbl" style={{ margin: 0 }}>
              <thead><tr>
                <th>Prodotto</th>
                <th style={{ textAlign: "right" }}>Ultimo prezzo</th>
                <th>Unità</th>
              </tr></thead>
              <tbody>
                {assocProducts.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.name}</td>
                    <td style={{ textAlign: "right" }}>{eur(p.unit_cost)}</td>
                    <td className="muted">{p.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {showEdit && (
        <div className="modal-overlay" onClick={() => setShowEdit(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="section-head" style={{ padding: "20px 24px", borderBottom: "1px solid var(--line)" }}>
              <h2>Modifica fornitore</h2>
              <button className="btn-ghost" style={{ padding: "4px 10px", borderRadius: 8 }} onClick={() => setShowEdit(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, maxHeight: "70vh", overflowY: "auto" }}>
              <div className="field"><label>Nome *</label><input value={sf.name} onChange={e => setSf({ ...sf, name: e.target.value })} /></div>
              <div className="field">
                <label>Categoria</label>
                <select value={sf.category} onChange={e => setSf({ ...sf, category: e.target.value })}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="grid2">
                <div className="field"><label>Referente</label><input value={sf.contact_person} onChange={e => setSf({ ...sf, contact_person: e.target.value })} /></div>
                <div className="field"><label>Telefono</label><input value={sf.phone} onChange={e => setSf({ ...sf, phone: e.target.value })} /></div>
              </div>
              <div className="grid2">
                <div className="field"><label>Email</label><input value={sf.email} onChange={e => setSf({ ...sf, email: e.target.value })} /></div>
                <div className="field"><label>Indirizzo</label><input value={sf.address} onChange={e => setSf({ ...sf, address: e.target.value })} /></div>
              </div>
              <div className="grid2">
                <div className="field"><label>IBAN</label><input value={sf.iban} onChange={e => setSf({ ...sf, iban: e.target.value })} style={{ fontFamily: "'Courier New', monospace", letterSpacing: 1, fontSize: 13 }} /></div>
                <div className="field"><label>Condizioni pagamento</label><input value={sf.payment_terms} onChange={e => setSf({ ...sf, payment_terms: e.target.value })} /></div>
              </div>
              <div className="field"><label>Note</label><textarea value={sf.notes} onChange={e => setSf({ ...sf, notes: e.target.value })} /></div>
              <button className="btn btn-primary" style={{ width: "100%", padding: "14px 22px", fontSize: 15 }} onClick={saveEdit}>Salva modifiche</button>
            </div>
          </div>
        </div>
      )}

      {/* Delivery detail modal */}
      {showDetailDelivery && (
        <div className="modal-overlay" onClick={() => setShowDetailDelivery(null)}>
          <div className="modal-card" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
            <div className="section-head" style={{ padding: "20px 24px", borderBottom: "1px solid var(--line)" }}>
              <h2>Dettaglio consegna</h2>
              <button className="btn-ghost" style={{ padding: "4px 10px", borderRadius: 8 }} onClick={() => setShowDetailDelivery(null)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>Data</div>
                  <div style={{ fontWeight: 600 }}>{fmtDate(showDetailDelivery.delivery_date)}</div>
                </div>
                <div>
                  <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>Documento</div>
                  <div style={{ fontWeight: 600 }}>{showDetailDelivery.document_type} {showDetailDelivery.document_number ? `n. ${showDetailDelivery.document_number}` : ""}</div>
                </div>
                <div>
                  <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>Totale</div>
                  <div style={{ fontWeight: 700, fontFamily: "'Fraunces', serif", fontSize: 20 }}>{eur(showDetailDelivery.total_amount)}</div>
                </div>
              </div>
              {showDetailDelivery.items && showDetailDelivery.items.length > 0 ? (
                <table className="tbl" style={{ margin: 0 }}>
                  <thead><tr>
                    <th>Prodotto</th>
                    <th style={{ textAlign: "center" }}>Qtà</th>
                    <th style={{ textAlign: "right" }}>Prezzo</th>
                    <th style={{ textAlign: "right" }}>Totale</th>
                  </tr></thead>
                  <tbody>
                    {showDetailDelivery.items.map(item => (
                      <tr key={item.id}>
                        <td style={{ fontWeight: 600 }}>{item.product_name}</td>
                        <td style={{ textAlign: "center" }}>{item.quantity}</td>
                        <td style={{ textAlign: "right" }}>{eur(item.unit_price)}</td>
                        <td style={{ textAlign: "right", fontWeight: 700 }}>{eur(item.total_price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="muted" style={{ textAlign: "center", padding: 16 }}>Dettaglio prodotti non disponibile</div>
              )}
            </div>
          </div>
        </div>
      )}

      <Toast toast={toast} />
    </>
  );
}
