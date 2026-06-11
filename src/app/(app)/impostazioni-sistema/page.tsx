"use client";

import { useEffect, useState } from "react";
import { useRole } from "@/lib/useRole";
import { useSettings } from "@/lib/useSettings";
import DatePickerIT from "@/components/ui/DatePickerIT";

type Section = "generali" | "cassa" | "turni" | "disponibilita" | "magazzino" | "inventario" | "documenti" | "notifiche";

const SECTION_META: { key: Section; label: string; desc: string; icon: React.ReactNode }[] = [
  { key: "generali", label: "Generali", desc: "Informazioni hotel e configurazione base", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
  { key: "cassa", label: "Cassa", desc: "Fondo cassa, categorie e bottoni rapidi", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 10h20"/><path d="M6 14h.01M10 14h.01"/></svg> },
  { key: "turni", label: "Turni", desc: "Orari dei turni e regole di riposo", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
  { key: "disponibilita", label: "Disponibilità", desc: "Scadenze e limiti per lo staff a chiamata", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M9 16l2 2 4-4"/></svg> },
  { key: "magazzino", label: "Magazzino", desc: "Categorie prodotti, unità di misura e soglie", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/></svg> },
  { key: "inventario", label: "Inventario", desc: "Programmazione inventario e tolleranze", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg> },
  { key: "documenti", label: "Documenti", desc: "Preavviso scadenze e notifiche", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg> },
  { key: "notifiche", label: "Notifiche", desc: "Configurazione avvisi email", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg> },
];

// Hours/minutes options for 24h time pickers
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINS = ["00", "15", "30", "45"];

function TimePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [h, m] = (value || "00:00").split(":");
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      <select value={h} onChange={e => onChange(`${e.target.value}:${m}`)}
        style={{ flex: 1, padding: "10px 8px", border: "1px solid #D8CCB8", borderRadius: 8, fontSize: 15, fontFamily: "inherit" }}>
        {HOURS.map(hh => <option key={hh} value={hh}>{hh}</option>)}
      </select>
      <span style={{ fontSize: 18, fontWeight: 700, color: "#6C6B5D" }}>:</span>
      <select value={m} onChange={e => onChange(`${h}:${e.target.value}`)}
        style={{ flex: 1, padding: "10px 8px", border: "1px solid #D8CCB8", borderRadius: 8, fontSize: 15, fontFamily: "inherit" }}>
        {MINS.map(mm => <option key={mm} value={mm}>{mm}</option>)}
      </select>
    </div>
  );
}

function EditableList({ items, onChange, placeholder }: { items: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [newItem, setNewItem] = useState("");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {items.map((item, i) => (
        <div key={i} style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 16px", background: "#F3EBDD", borderRadius: 8,
        }}>
          <span style={{ flex: 1, fontSize: 14, color: "#1F3326" }}>{item}</span>
          <div style={{ display: "flex", gap: 2 }}>
            {i > 0 && <button type="button" className="btn-ghost" style={{ padding: "2px 6px", fontSize: 13, color: "#999" }} onClick={() => {
              const next = [...items]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; onChange(next);
            }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 15l-6-6-6 6"/></svg></button>}
            {i < items.length - 1 && <button type="button" className="btn-ghost" style={{ padding: "2px 6px", fontSize: 13, color: "#999" }} onClick={() => {
              const next = [...items]; [next[i], next[i + 1]] = [next[i + 1], next[i]]; onChange(next);
            }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6"/></svg></button>}
            <button type="button" className="btn-ghost" style={{ padding: "2px 6px", fontSize: 13, color: "#999" }}
              onClick={() => onChange(items.filter((_, idx) => idx !== i))}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <input value={newItem} onChange={e => setNewItem(e.target.value)} placeholder={placeholder || "Nuovo..."}
          style={{ flex: 1, padding: "10px 16px", border: "2px dashed #D8CCB8", borderRadius: 8, fontSize: 14, fontFamily: "inherit", background: "transparent" }}
          onKeyDown={e => { if (e.key === "Enter" && newItem.trim()) { onChange([...items, newItem.trim()]); setNewItem(""); } }} />
        <button type="button" style={{
          width: 38, height: 38, borderRadius: "50%", border: "none",
          background: "#1F3326", color: "#FAF9F5", fontSize: 18, fontWeight: 700,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}
          onClick={() => { if (newItem.trim()) { onChange([...items, newItem.trim()]); setNewItem(""); } }}>+</button>
      </div>
    </div>
  );
}

function SectionHeader({ title, desc }: { title: string; desc: string }) {
  return (
    <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid #D8CCB8" }}>
      <h2 className="serif" style={{ fontSize: 22, fontWeight: 500, color: "#1F3326", margin: 0 }}>{title}</h2>
      <p style={{ fontSize: 14, color: "#888", margin: "4px 0 0", fontFamily: "'Albert Sans', sans-serif" }}>{desc}</p>
    </div>
  );
}

function SaveButton({ saving, onClick }: { saving: boolean; onClick: () => void }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
      <button className="btn btn-primary" disabled={saving} onClick={onClick}
        style={{ padding: "12px 32px", fontSize: 14 }}>
        {saving ? "Salvataggio..." : "Salva"}
      </button>
    </div>
  );
}

export default function ImpostazioniSistemaPage() {
  const { isManager, loading: roleLoading } = useRole();
  const { get, setMany, loading: settingsLoading } = useSettings();
  const [section, setSection] = useState<Section>("generali");
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [gen, setGen] = useState({ hotel_name: "", hotel_address: "", hotel_phone: "", hotel_email: "", site_url: "" });
  const [cassa, setCassa] = useState({ fondo: 50, quick_buttons: [] as any[], cat_entrata: [] as string[], cat_uscita: [] as string[] });
  const [turni, setTurni] = useState({ mattina_inizio: "06:30", mattina_fine: "14:30", pomeriggio_inizio: "14:30", pomeriggio_fine: "22:00", riposo_minimo: 11, giorno_libero: true });
  const [disp, setDisp] = useState({ scadenza_giorno: 25, max_modifiche: 1 });
  const [mag, setMag] = useState({ categorie: [] as string[], unita_misura: [] as string[], scorta_default: 5, scadenza_warning: 30, scadenza_urgente: 7 });
  const [inv, setInv] = useState({ prossima_data: "", frequenza: "Mensile", frequenza_giorni: 30, promemoria_giorni: 3, tolleranza_percentuale: 5, categorie_incluse: [] as string[], note: "" });
  const [doc, setDoc] = useState({ scadenza_urgente: 7, scadenza_warning: 30, notifica_email: false, notifica_destinatari: "" });
  const [notif, setNotif] = useState({ email_attive: false, config: {} as Record<string, boolean> });

  useEffect(() => {
    if (settingsLoading) return;
    setGen({ hotel_name: get<string>("hotel_name"), hotel_address: get<string>("hotel_address"), hotel_phone: get<string>("hotel_phone"), hotel_email: get<string>("hotel_email"), site_url: get<string>("site_url") });
    setCassa({ fondo: get<number>("cassa_fondo"), quick_buttons: get<any[]>("cassa_quick_buttons"), cat_entrata: get<string[]>("cassa_categorie_entrata"), cat_uscita: get<string[]>("cassa_categorie_uscita") });
    setTurni({ mattina_inizio: get<string>("turni_mattina_inizio"), mattina_fine: get<string>("turni_mattina_fine"), pomeriggio_inizio: get<string>("turni_pomeriggio_inizio"), pomeriggio_fine: get<string>("turni_pomeriggio_fine"), riposo_minimo: get<number>("turni_riposo_minimo"), giorno_libero: get<boolean>("turni_giorno_libero") });
    setDisp({ scadenza_giorno: get<number>("disponibilita_scadenza_giorno"), max_modifiche: get<number>("disponibilita_max_modifiche") });
    setMag({ categorie: get<string[]>("magazzino_categorie"), unita_misura: get<string[]>("magazzino_unita_misura"), scorta_default: get<number>("magazzino_scorta_default"), scadenza_warning: get<number>("magazzino_scadenza_warning"), scadenza_urgente: get<number>("magazzino_scadenza_urgente") });
    setInv({ prossima_data: get<string>("inventario_prossima_data"), frequenza: get<string>("inventario_frequenza"), frequenza_giorni: get<number>("inventario_frequenza_giorni"), promemoria_giorni: get<number>("inventario_promemoria_giorni"), tolleranza_percentuale: get<number>("inventario_tolleranza_percentuale"), categorie_incluse: get<string[]>("inventario_categorie_incluse"), note: get<string>("inventario_note") });
    setDoc({ scadenza_urgente: get<number>("documenti_scadenza_urgente"), scadenza_warning: get<number>("documenti_scadenza_warning"), notifica_email: get<boolean>("documenti_notifica_email"), notifica_destinatari: get<string>("documenti_notifica_destinatari") });
    setNotif({ email_attive: get<boolean>("notifiche_email_attive"), config: get<Record<string, boolean>>("notifiche_config") });
    // eslint-disable-next-line
  }, [settingsLoading]);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000); }

  async function save(entries: Record<string, unknown>) {
    setSaving(true);
    const ok = await setMany(entries);
    setSaving(false);
    showToast(ok ? "Impostazioni salvate" : "Errore nel salvataggio");
  }

  if (roleLoading || settingsLoading) return <div className="empty">Caricamento...</div>;
  if (!isManager) {
    if (typeof window !== "undefined") window.location.href = "/";
    return <div className="empty">Accesso non autorizzato</div>;
  }

  const meta = SECTION_META.find(s => s.key === section)!;

  return (
    <>
      <h1 className="serif" style={{ fontSize: 24, fontWeight: 500, marginBottom: 24 }}>Impostazioni</h1>

      <div className="settings-layout">
        {/* Sidebar nav */}
        <nav className="settings-nav">
          {SECTION_META.map(s => (
            <button key={s.key} type="button"
              className={`settings-nav-btn${section === s.key ? " active" : ""}`}
              onClick={() => setSection(s.key)}>
              <span className="settings-nav-icon">{s.icon}</span>
              {s.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="settings-content">
          <SectionHeader title={meta.label} desc={meta.desc} />

          {/* GENERALI */}
          {section === "generali" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Nome hotel</label>
                <input value={gen.hotel_name} onChange={e => setGen({ ...gen, hotel_name: e.target.value })} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Indirizzo</label>
                <input value={gen.hotel_address} onChange={e => setGen({ ...gen, hotel_address: e.target.value })} />
              </div>
              <div className="grid2">
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Telefono</label>
                  <input value={gen.hotel_phone} onChange={e => setGen({ ...gen, hotel_phone: e.target.value })} />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Email hotel</label>
                  <input type="email" value={gen.hotel_email} onChange={e => setGen({ ...gen, hotel_email: e.target.value })} />
                </div>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>URL gestionale</label>
                <input value={gen.site_url} onChange={e => setGen({ ...gen, site_url: e.target.value })} />
                <span className="muted" style={{ fontSize: 12, marginTop: 4, display: "block" }}>Usato per link nelle email e nella creazione account staff</span>
              </div>
              <SaveButton saving={saving} onClick={() => save({
                hotel_name: gen.hotel_name, hotel_address: gen.hotel_address,
                hotel_phone: gen.hotel_phone, hotel_email: gen.hotel_email, site_url: gen.site_url,
              })} />
            </div>
          )}

          {/* CASSA */}
          {section === "cassa" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Fondo cassa fisso (EUR)</label>
                <input type="number" min="0" step="1" value={cassa.fondo} onChange={e => setCassa({ ...cassa, fondo: Number(e.target.value) })} />
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-soft)", display: "block", marginBottom: 8 }}>Categorie entrata</label>
                <EditableList items={cassa.cat_entrata} onChange={v => setCassa({ ...cassa, cat_entrata: v })} placeholder="Nuova categoria entrata..." />
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-soft)", display: "block", marginBottom: 8 }}>Categorie uscita</label>
                <EditableList items={cassa.cat_uscita} onChange={v => setCassa({ ...cassa, cat_uscita: v })} placeholder="Nuova categoria uscita..." />
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-soft)", display: "block", marginBottom: 8 }}>Bottoni rapidi</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {cassa.quick_buttons.map((qb: any, i: number) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "10px 16px", background: "#F3EBDD", borderRadius: 8,
                    }}>
                      <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "#1F3326" }}>{qb.label}</span>
                      <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, color: "#1F3326" }}>
                        {Number(qb.amount).toLocaleString("it-IT", { minimumFractionDigits: 2 })} €
                      </span>
                      <span style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 0.5 }}>
                        {qb.type === "entrata" ? "Entrata" : "Uscita"}
                      </span>
                      <button type="button" className="btn-ghost" style={{ padding: "2px 6px", color: "#999" }}
                        onClick={() => setCassa({ ...cassa, quick_buttons: cassa.quick_buttons.filter((_: any, idx: number) => idx !== i) })}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <SaveButton saving={saving} onClick={() => save({
                cassa_fondo: cassa.fondo, cassa_quick_buttons: cassa.quick_buttons,
                cassa_categorie_entrata: cassa.cat_entrata, cassa_categorie_uscita: cassa.cat_uscita,
              })} />
            </div>
          )}

          {/* TURNI */}
          {section === "turni" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-soft)", display: "block", marginBottom: 8 }}>Turno mattina</label>
                <div className="grid2">
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Inizio</label>
                    <TimePicker value={turni.mattina_inizio} onChange={v => setTurni({ ...turni, mattina_inizio: v })} />
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Fine</label>
                    <TimePicker value={turni.mattina_fine} onChange={v => setTurni({ ...turni, mattina_fine: v })} />
                  </div>
                </div>
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-soft)", display: "block", marginBottom: 8 }}>Turno pomeriggio</label>
                <div className="grid2">
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Inizio</label>
                    <TimePicker value={turni.pomeriggio_inizio} onChange={v => setTurni({ ...turni, pomeriggio_inizio: v })} />
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Fine</label>
                    <TimePicker value={turni.pomeriggio_fine} onChange={v => setTurni({ ...turni, pomeriggio_fine: v })} />
                  </div>
                </div>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Ore riposo minimo tra turni</label>
                <input type="number" min="0" max="24" value={turni.riposo_minimo} onChange={e => setTurni({ ...turni, riposo_minimo: Number(e.target.value) })} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input type="checkbox" id="giorno_libero" checked={turni.giorno_libero}
                  onChange={e => setTurni({ ...turni, giorno_libero: e.target.checked })}
                  style={{ width: 18, height: 18 }} />
                <label htmlFor="giorno_libero" style={{ fontSize: 14, cursor: "pointer" }}>Giorno libero settimanale obbligatorio</label>
              </div>
              <p className="muted" style={{ fontSize: 12, margin: 0 }}>Conforme al D.Lgs 66/2003</p>
              <SaveButton saving={saving} onClick={() => save({
                turni_mattina_inizio: turni.mattina_inizio, turni_mattina_fine: turni.mattina_fine,
                turni_pomeriggio_inizio: turni.pomeriggio_inizio, turni_pomeriggio_fine: turni.pomeriggio_fine,
                turni_riposo_minimo: turni.riposo_minimo, turni_giorno_libero: turni.giorno_libero,
              })} />
            </div>
          )}

          {/* DISPONIBILITA */}
          {section === "disponibilita" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Giorno scadenza invio (1-28)</label>
                <input type="number" min="1" max="28" value={disp.scadenza_giorno} onChange={e => setDisp({ ...disp, scadenza_giorno: Number(e.target.value) })} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Numero modifiche consentite dopo primo invio</label>
                <input type="number" min="0" max="10" value={disp.max_modifiche} onChange={e => setDisp({ ...disp, max_modifiche: Number(e.target.value) })} />
              </div>
              <p className="muted" style={{ fontSize: 12, margin: 0 }}>
                Lo staff può inviare le disponibilità per il mese successivo dal 1° al {disp.scadenza_giorno} del mese corrente
              </p>
              <SaveButton saving={saving} onClick={() => save({
                disponibilita_scadenza_giorno: disp.scadenza_giorno, disponibilita_max_modifiche: disp.max_modifiche,
              })} />
            </div>
          )}

          {/* MAGAZZINO */}
          {section === "magazzino" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-soft)", display: "block", marginBottom: 8 }}>Categorie prodotti</label>
                <EditableList items={mag.categorie} onChange={v => setMag({ ...mag, categorie: v })} placeholder="Nuova categoria..." />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-soft)", display: "block", marginBottom: 8 }}>Unità di misura</label>
                <EditableList items={mag.unita_misura} onChange={v => setMag({ ...mag, unita_misura: v })} placeholder="Nuova unità..." />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Scorta minima default</label>
                <input type="number" min="0" value={mag.scorta_default} onChange={e => setMag({ ...mag, scorta_default: Number(e.target.value) })} />
              </div>
              <div className="grid2">
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Warning scadenza (giorni)</label>
                  <input type="number" min="1" value={mag.scadenza_warning} onChange={e => setMag({ ...mag, scadenza_warning: Number(e.target.value) })} />
                  <span className="muted" style={{ fontSize: 11 }}>Badge arancione</span>
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Urgente scadenza (giorni)</label>
                  <input type="number" min="1" value={mag.scadenza_urgente} onChange={e => setMag({ ...mag, scadenza_urgente: Number(e.target.value) })} />
                  <span className="muted" style={{ fontSize: 11 }}>Badge rosso</span>
                </div>
              </div>
              <SaveButton saving={saving} onClick={() => save({
                magazzino_categorie: mag.categorie, magazzino_unita_misura: mag.unita_misura,
                magazzino_scorta_default: mag.scorta_default,
                magazzino_scadenza_warning: mag.scadenza_warning, magazzino_scadenza_urgente: mag.scadenza_urgente,
              })} />
            </div>
          )}

          {/* INVENTARIO */}
          {section === "inventario" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Data prossimo inventario</label>
                <DatePickerIT value={inv.prossima_data} onChange={v => setInv({ ...inv, prossima_data: v })} />
              </div>
              <div className="grid2">
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Frequenza</label>
                  <select value={inv.frequenza} onChange={e => setInv({ ...inv, frequenza: e.target.value })}>
                    <option>Mensile</option><option>Bimestrale</option><option>Trimestrale</option><option>Semestrale</option><option>Personalizzata</option>
                  </select>
                </div>
                {inv.frequenza === "Personalizzata" && (
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Ogni X giorni</label>
                    <input type="number" min="1" value={inv.frequenza_giorni} onChange={e => setInv({ ...inv, frequenza_giorni: Number(e.target.value) })} />
                  </div>
                )}
              </div>
              <div className="grid2">
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Promemoria (giorni prima)</label>
                  <input type="number" min="0" value={inv.promemoria_giorni} onChange={e => setInv({ ...inv, promemoria_giorni: Number(e.target.value) })} />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Tolleranza scarto (%)</label>
                  <input type="number" min="0" max="100" value={inv.tolleranza_percentuale} onChange={e => setInv({ ...inv, tolleranza_percentuale: Number(e.target.value) })} />
                </div>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Note inventario</label>
                <textarea value={inv.note} onChange={e => setInv({ ...inv, note: e.target.value })} rows={3}
                  placeholder="Es. Contare anche prodotti nel frigorifero bar"
                  style={{ width: "100%", resize: "vertical", fontFamily: "inherit", fontSize: 14, padding: "10px 16px", border: "1px solid #D8CCB8", borderRadius: 8 }} />
              </div>
              <SaveButton saving={saving} onClick={() => save({
                inventario_prossima_data: inv.prossima_data, inventario_frequenza: inv.frequenza,
                inventario_frequenza_giorni: inv.frequenza_giorni, inventario_promemoria_giorni: inv.promemoria_giorni,
                inventario_tolleranza_percentuale: inv.tolleranza_percentuale,
                inventario_categorie_incluse: inv.categorie_incluse, inventario_note: inv.note,
              })} />
            </div>
          )}

          {/* DOCUMENTI */}
          {section === "documenti" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="grid2">
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Urgente/rosso (giorni)</label>
                  <input type="number" min="1" value={doc.scadenza_urgente} onChange={e => setDoc({ ...doc, scadenza_urgente: Number(e.target.value) })} />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>In scadenza/arancione (giorni)</label>
                  <input type="number" min="1" value={doc.scadenza_warning} onChange={e => setDoc({ ...doc, scadenza_warning: Number(e.target.value) })} />
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input type="checkbox" id="doc_notifica" checked={doc.notifica_email}
                  onChange={e => setDoc({ ...doc, notifica_email: e.target.checked })}
                  style={{ width: 18, height: 18 }} />
                <label htmlFor="doc_notifica" style={{ fontSize: 14, cursor: "pointer" }}>Notifica email per documenti in scadenza</label>
              </div>
              {doc.notifica_email && (
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Destinatari (email separate da virgola)</label>
                  <input value={doc.notifica_destinatari} onChange={e => setDoc({ ...doc, notifica_destinatari: e.target.value })} placeholder="admin@hotel.com, manager@hotel.com" />
                </div>
              )}
              <SaveButton saving={saving} onClick={() => save({
                documenti_scadenza_urgente: doc.scadenza_urgente, documenti_scadenza_warning: doc.scadenza_warning,
                documenti_notifica_email: doc.notifica_email, documenti_notifica_destinatari: doc.notifica_destinatari,
              })} />
            </div>
          )}

          {/* NOTIFICHE */}
          {section === "notifiche" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input type="checkbox" id="notif_globale" checked={notif.email_attive}
                  onChange={e => setNotif({ ...notif, email_attive: e.target.checked })}
                  style={{ width: 18, height: 18 }} />
                <label htmlFor="notif_globale" style={{ fontSize: 14, cursor: "pointer", fontWeight: 600 }}>Notifiche email attive</label>
              </div>
              <p className="muted" style={{ fontSize: 13, margin: 0, padding: "10px 14px", background: "#F3EBDD", borderRadius: 8 }}>
                Le notifiche email verranno configurate in futuro
              </p>
              <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>
                {["Scadenza documenti", "Scadenza prodotti magazzino", "Promemoria inventario", "Disponibilità non inviate"].map(n => {
                  const key = n.toLowerCase().replace(/[^a-z]/g, "_");
                  return (
                    <div key={key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid #F3EBDD" }}>
                      <input type="checkbox" checked={notif.config[key] ?? false} disabled={!notif.email_attive}
                        onChange={e => setNotif({ ...notif, config: { ...notif.config, [key]: e.target.checked } })}
                        style={{ width: 16, height: 16 }} />
                      <span>{n}</span>
                    </div>
                  );
                })}
              </div>
              <SaveButton saving={saving} onClick={() => save({
                notifiche_email_attive: notif.email_attive, notifiche_config: notif.config,
              })} />
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: "#2D5A3D", color: "#FAF9F5", padding: "12px 24px", borderRadius: 10,
          fontSize: 14, fontWeight: 600, zIndex: 400, boxShadow: "0 4px 20px rgba(0,0,0,.25)",
        }}>
          {toast}
        </div>
      )}

      <style>{`
        .settings-layout{display:grid;grid-template-columns:220px 1fr;gap:32px;min-height:400px}
        .settings-nav{display:flex;flex-direction:column;gap:4px}
        .settings-nav-btn{display:flex;align-items:center;gap:10px;text-align:left;padding:10px 16px;border:none;background:transparent;cursor:pointer;font-family:inherit;font-size:14px;font-weight:500;color:#666;border-radius:8px;transition:all .15s}
        .settings-nav-btn:hover{background:#F3EBDD;color:#1F3326}
        .settings-nav-btn.active{background:#1F3326;color:#FAF9F5;font-weight:700}
        .settings-nav-btn.active svg{stroke:#FAF9F5}
        .settings-nav-icon{display:flex;align-items:center;flex-shrink:0}
        .settings-content{min-width:0}
        @media(max-width:768px){
          .settings-layout{grid-template-columns:1fr}
          .settings-nav{flex-direction:row;overflow-x:auto;gap:4px;padding-bottom:8px}
          .settings-nav-btn{white-space:nowrap;padding:8px 14px;font-size:13px}
          .settings-nav-icon{display:none}
        }
      `}</style>
    </>
  );
}
