"use client";

import { Fragment, useEffect, useState, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  STATUS_COLORS,
  STATUS_LABELS,
  defaultChecklist,
  type HkStatus,
  type ChecklistItem,
} from "@/lib/housekeeping";

type Room = { id: string; number: number; name: string | null; room_type: string; floor: string; smoobu_apartment_id: number | null };
type Staff = { id: string; name: string };
type Task = {
  id: string;
  room_id: string;
  task_date: string;
  status: HkStatus;
  assigned_to: string | null;
  checklist: ChecklistItem[];
  notes: string | null;
  photo_path: string | null;
  started_at: string | null;
  completed_at: string | null;
  inspected_by: string | null;
  guest_name: string | null;
  channel: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  nights: number | null;
  occupancy_status: "checkout" | "stayover" | "vacant" | null;
};
type Product = { product_id: string; name: string; current_stock: number; unit: string };
type RoomConsumable = { id: string; room_type: string; product_id: string; quantity: number };

const isoToday = () => new Date().toISOString().slice(0, 10);

function fmtTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

function durationMin(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
}

const FLOOR_ORDER: Record<string, number> = { "Piano terra": 0, "Primo piano": 1, "Secondo piano": 2 };

/** Display name: use room.name if set, otherwise "Camera {number}" */
const roomLabel = (room: Room) => room.name || `Camera ${room.number}`;
/** Short label for card header: use name if set, otherwise just the number */
const roomShort = (room: Room) => room.name || String(room.number);

const OCC_THEME = {
  checkout: { bg: "#FAECE7", text: "#712B13", border: "#D85A30", label: "Check-out", icon: "M17 16l4-4m0 0l-4-4m4 4H7" },
  stayover: { bg: "#E6F1FB", text: "#0C447C", border: "#378ADD", label: "In soggiorno", icon: "M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" },
  vacant: { bg: "#EAF3DE", text: "#27500A", border: "#639922", label: "Libera", icon: "M5 13l4 4L19 7" },
};

export default function HousekeepingPage() {
  const supabase = createClient();
  const [date, setDate] = useState(isoToday());
  const [rooms, setRooms] = useState<Room[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "warn" } | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const photoTaskRef = useRef<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Consumabili config
  const [showConsConfig, setShowConsConfig] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [roomConsumables, setRoomConsumables] = useState<RoomConsumable[]>([]);
  const [consForm, setConsForm] = useState<Record<string, { product_id: string; quantity: number }[]>>({});
  const [savingCons, setSavingCons] = useState(false);

  // Smoobu mapping modal
  const [showSmoobuMap, setShowSmoobuMap] = useState(false);
  const [smoobuApartments, setSmoobuApartments] = useState<{ id: number; name: string }[]>([]);
  const [mappingForm, setMappingForm] = useState<Record<string, number | null>>({});
  const [savingMap, setSavingMap] = useState(false);

  const ROOM_TYPES = [...new Set(rooms.map((r) => r.room_type))].sort();

  const showToast = (msg: string, type: "ok" | "warn" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  async function load() {
    const [{ data: r }, { data: t }, { data: s }, { data: p }, { data: rc }] = await Promise.all([
      supabase.from("rooms").select("id, number, name, room_type, floor, smoobu_apartment_id").eq("active", true).order("number"),
      supabase.from("housekeeping_tasks").select("*").eq("task_date", date),
      supabase.from("staff").select("id, name").eq("active", true).order("name"),
      supabase.from("stock_levels").select("product_id, name, current_stock, unit").eq("active", true).order("name"),
      supabase.from("room_consumables").select("*"),
    ]);
    setRooms((r ?? []) as Room[]);
    setTasks((t ?? []) as Task[]);
    setStaff((s ?? []) as Staff[]);
    setProducts((p ?? []) as Product[]);
    setRoomConsumables((rc ?? []) as RoomConsumable[]);
    setLoading(false);
  }

  useEffect(() => {
    setLoading(true);
    setExpanded(null);
    load();
    // eslint-disable-next-line
  }, [date]);

  /* ── Smoobu Sync ── */
  async function syncSmoobu() {
    setSyncing(true);
    try {
      const resp = await fetch("/api/smoobu/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        showToast(data.error || "Errore sincronizzazione", "warn");
        return;
      }
      showToast(`Sincronizzate ${data.synced} camere da Smoobu`);
      load();
    } catch {
      showToast("Errore connessione Smoobu", "warn");
    } finally {
      setSyncing(false);
    }
  }

  /* ── Smoobu Mapping ── */
  async function openSmoobuMapping() {
    try {
      const resp = await fetch("/api/smoobu/apartments");
      const data = await resp.json();
      if (!resp.ok) {
        showToast(data.error || "Errore caricamento appartamenti", "warn");
        return;
      }
      setSmoobuApartments(data.apartments ?? []);
      const form: Record<string, number | null> = {};
      for (const room of rooms) {
        form[room.id] = room.smoobu_apartment_id;
      }
      setMappingForm(form);
      setShowSmoobuMap(true);
    } catch {
      showToast("Errore connessione Smoobu", "warn");
    }
  }

  async function saveMapping() {
    setSavingMap(true);
    try {
      for (const [roomId, aptId] of Object.entries(mappingForm)) {
        await supabase.from("rooms").update({ smoobu_apartment_id: aptId || null }).eq("id", roomId);
      }
      showToast("Mappature Smoobu salvate");
      setShowSmoobuMap(false);
      load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Errore salvataggio", "warn");
    } finally {
      setSavingMap(false);
    }
  }

  /* ── Consumabili config ── */
  function openConsConfig() {
    const grouped: Record<string, { product_id: string; quantity: number }[]> = {};
    for (const rt of ROOM_TYPES) {
      const existing = roomConsumables.filter((rc) => rc.room_type === rt);
      grouped[rt] = existing.length > 0
        ? existing.map((rc) => ({ product_id: rc.product_id, quantity: rc.quantity }))
        : [{ product_id: "", quantity: 1 }];
    }
    setConsForm(grouped);
    setShowConsConfig(true);
  }

  function addConsRow(rt: string) {
    setConsForm((prev) => ({ ...prev, [rt]: [...(prev[rt] || []), { product_id: "", quantity: 1 }] }));
  }

  function removeConsRow(rt: string, idx: number) {
    setConsForm((prev) => ({
      ...prev,
      [rt]: (prev[rt] || []).filter((_, i) => i !== idx),
    }));
  }

  function updateConsRow(rt: string, idx: number, field: "product_id" | "quantity", val: string | number) {
    setConsForm((prev) => ({
      ...prev,
      [rt]: (prev[rt] || []).map((row, i) => (i === idx ? { ...row, [field]: val } : row)),
    }));
  }

  async function saveConsumables() {
    setSavingCons(true);
    try {
      await supabase.from("room_consumables").delete().neq("id", "00000000-0000-0000-0000-000000000000");

      const inserts: { room_type: string; product_id: string; quantity: number }[] = [];
      for (const [rt, rows] of Object.entries(consForm)) {
        for (const row of rows) {
          if (row.product_id && row.quantity > 0) {
            inserts.push({ room_type: rt, product_id: row.product_id, quantity: row.quantity });
          }
        }
      }

      if (inserts.length > 0) {
        const { error } = await supabase.from("room_consumables").insert(inserts);
        if (error) throw error;
      }

      showToast(`Consumabili salvati (${inserts.length} prodotti configurati)`);
      setShowConsConfig(false);
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Errore salvataggio consumabili");
    } finally {
      setSavingCons(false);
    }
  }

  /* ── Auto stock deduction ── */
  async function deductConsumables(room: Room, taskId: string) {
    const configured = roomConsumables.filter((rc) => rc.room_type === room.room_type);
    if (configured.length === 0) return;

    const { data: { user } } = await supabase.auth.getUser();
    const warnings: string[] = [];

    for (const cons of configured) {
      const { error } = await supabase.from("stock_movements").insert({
        product_id: cons.product_id,
        type: "out",
        quantity: cons.quantity,
        notes: `Pulizia ${roomLabel(room)}`,
        created_by: user?.id ?? null,
      });
      if (error) {
        warnings.push(`Errore scarico: ${error.message}`);
        continue;
      }

      const prod = products.find((p) => p.product_id === cons.product_id);
      if (prod && (prod.current_stock - cons.quantity) < 0) {
        warnings.push(`${prod.name} esaurito`);
      }
    }

    if (warnings.length > 0) {
      showToast(`Scaricati ${configured.length} consumabili per ${roomLabel(room)} — Attenzione: ${warnings.join(", ")}`, "warn");
    } else {
      showToast(`Scaricati ${configured.length} consumabili per ${roomLabel(room)}`);
    }
  }

  /* ── Actions ── */

  async function generateDay() {
    if (tasks.length > 0) { showToast("Giornata gia generata"); return; }
    const inserts = rooms.map((r) => ({
      room_id: r.id,
      task_date: date,
      status: "da_pulire" as const,
      checklist: defaultChecklist(),
    }));
    const { error } = await supabase.from("housekeeping_tasks").insert(inserts);
    if (error) { showToast("Errore: " + error.message, "warn"); return; }
    showToast(`Giornata generata per ${rooms.length} camere`);
    load();
  }

  async function autoAssign() {
    if (tasks.length === 0) { showToast("Genera prima la giornata", "warn"); return; }
    const { data: stData } = await supabase.from("shift_types").select("id, name").order("sort");
    const morning = (stData ?? []).find((t) => t.name.toLowerCase().includes("mattin"));
    if (!morning) { showToast("Turno 'Mattina' non trovato", "warn"); return; }

    const { data: shData } = await supabase
      .from("shifts")
      .select("staff_id")
      .eq("shift_date", date)
      .eq("shift_type_id", morning.id);
    const staffIds = [...new Set((shData ?? []).map((s) => s.staff_id).filter(Boolean))] as string[];
    if (staffIds.length === 0) { showToast("Nessuno staff al turno Mattina", "warn"); return; }

    const sorted = [...rooms].sort((a, b) => (FLOOR_ORDER[a.floor] ?? 99) - (FLOOR_ORDER[b.floor] ?? 99) || a.number - b.number);
    const perPerson = Math.ceil(sorted.length / staffIds.length);
    for (let i = 0; i < sorted.length; i++) {
      const sIdx = Math.min(Math.floor(i / perPerson), staffIds.length - 1);
      const task = tasks.find((t) => t.room_id === sorted[i].id);
      if (task) {
        await supabase.from("housekeeping_tasks").update({ assigned_to: staffIds[sIdx] }).eq("id", task.id);
      }
    }
    showToast(`Assegnate ${sorted.length} camere a ${staffIds.length} persone`);
    load();
  }

  async function toggleCheck(taskId: string, itemId: string) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const next = task.checklist.map((c) => (c.id === itemId ? { ...c, checked: !c.checked } : c));
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, checklist: next } : t)));
    await supabase.from("housekeeping_tasks").update({ checklist: next }).eq("id", taskId);
  }

  async function changeStatus(taskId: string, newStatus: HkStatus) {
    const patch: Record<string, unknown> = { status: newStatus };
    if (newStatus === "in_corso") patch.started_at = new Date().toISOString();
    if (newStatus === "pulita") patch.completed_at = new Date().toISOString();
    if (newStatus === "ispezionata") {
      const { data: { user } } = await supabase.auth.getUser();
      patch.inspected_by = user?.id ?? null;
    }
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...patch } as Task : t)));
    await supabase.from("housekeeping_tasks").update(patch).eq("id", taskId);

    if (newStatus === "pulita") {
      const task = tasks.find((t) => t.id === taskId);
      const room = task ? rooms.find((r) => r.id === task.room_id) : null;
      if (room) {
        await deductConsumables(room, taskId);
        return;
      }
    }

    showToast(STATUS_LABELS[newStatus]);
  }

  function setNotes(taskId: string, notes: string) {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, notes } : t)));
  }

  async function saveNotes(taskId: string, value: string) {
    await supabase.from("housekeeping_tasks").update({ notes: value.trim() || null }).eq("id", taskId);
  }

  async function assignStaff(taskId: string, staffId: string | null) {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, assigned_to: staffId } : t)));
    await supabase.from("housekeeping_tasks").update({ assigned_to: staffId }).eq("id", taskId);
  }

  function triggerPhoto(taskId: string) {
    photoTaskRef.current = taskId;
    photoRef.current?.click();
  }

  async function handlePhotoFile(file: File) {
    const taskId = photoTaskRef.current;
    if (!taskId) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = async () => {
        const maxd = 1200;
        let { width: w, height: h } = img;
        if (w > maxd || h > maxd) {
          const r = Math.min(maxd / w, maxd / h);
          w = Math.round(w * r);
          h = Math.round(h * r);
        }
        const cv = document.createElement("canvas");
        cv.width = w;
        cv.height = h;
        cv.getContext("2d")!.drawImage(img, 0, 0, w, h);
        const blob = await new Promise<Blob>((res) => cv.toBlob((b) => res(b!), "image/jpeg", 0.8));
        const path = `${date}/${taskId}/${crypto.randomUUID()}.jpg`;
        const { error } = await supabase.storage.from("housekeeping").upload(path, blob, { contentType: "image/jpeg" });
        if (error) { showToast("Errore upload: " + error.message, "warn"); return; }
        setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, photo_path: path } : t)));
        await supabase.from("housekeeping_tasks").update({ photo_path: path }).eq("id", taskId);
        showToast("Foto caricata");
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  function shiftDate(days: number) {
    const d = new Date(`${date}T00:00:00`);
    d.setDate(d.getDate() + days);
    setDate(d.toISOString().slice(0, 10));
  }

  /* ── Stats ── */
  const byStatus = (s: HkStatus) => tasks.filter((t) => t.status === s).length;
  const doneCount = byStatus("pulita") + byStatus("ispezionata");
  const progress = tasks.length > 0 ? doneCount / tasks.length : 0;
  const progressColor =
    progress === 1 ? STATUS_COLORS.ispezionata : progress > 0.5 ? STATUS_COLORS.pulita : STATUS_COLORS.in_corso;

  const staffName = (id: string | null) => (id ? staff.find((s) => s.id === id)?.name ?? "?" : null);

  // Occupancy stats
  const checkoutCount = tasks.filter((t) => t.occupancy_status === "checkout").length;
  const stayoverCount = tasks.filter((t) => t.occupancy_status === "stayover").length;
  const vacantCount = tasks.filter((t) => t.occupancy_status === "vacant").length;

  const staffStats: Record<string, { assigned: number; done: number; totalMin: number }> = {};
  for (const t of tasks) {
    if (!t.assigned_to) continue;
    if (!staffStats[t.assigned_to]) staffStats[t.assigned_to] = { assigned: 0, done: 0, totalMin: 0 };
    staffStats[t.assigned_to].assigned++;
    if (t.status === "pulita" || t.status === "ispezionata") {
      staffStats[t.assigned_to].done++;
      const dur = durationMin(t.started_at, t.completed_at);
      if (dur) staffStats[t.assigned_to].totalMin += dur;
    }
  }

  const issues = tasks.filter((t) => t.notes && t.notes.trim().length > 0);

  const dateLabel = new Date(`${date}T00:00:00`).toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const hasConsumables = (roomType: string) => roomConsumables.some((rc) => rc.room_type === roomType);

  // Group rooms by floor
  const floors = [...new Set(rooms.map((r) => r.floor))].sort((a, b) => (FLOOR_ORDER[a] ?? 99) - (FLOOR_ORDER[b] ?? 99));

  const getOccTheme = (task: Task) => {
    const occ = task.occupancy_status;
    if (occ && OCC_THEME[occ]) return OCC_THEME[occ];
    return null;
  };

  const initials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase();
  };

  if (loading) return <div className="empty">Caricamento...</div>;

  return (
    <>
      {/* ── Header ── */}
      <div className="hk-header">
        <div className="hk-header-top">
          <div>
            <h2 className="serif hk-title">Pulizie camere</h2>
            <p className="hk-subtitle">
              {dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}
            </p>
          </div>
          <div className="hk-header-actions">
            <button className="btn btn-ghost hk-btn-sm" onClick={openConsConfig}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg>
              Consumabili
            </button>
            <button className="btn btn-ghost hk-btn-sm" onClick={openSmoobuMapping}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0022 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>
              Mappature
            </button>
            <button
              className="btn hk-btn-smoobu"
              onClick={syncSmoobu}
              disabled={syncing}
            >
              {syncing ? (
                <span className="hk-spinner" />
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
              )}
              Sincronizza Smoobu
            </button>
          </div>
        </div>

        {/* Date nav + action buttons */}
        <div className="hk-nav-row">
          <div className="hk-date-nav">
            <button className="btn btn-ghost hk-btn-sm" onClick={() => shiftDate(-1)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <button className="btn btn-ghost hk-btn-sm hk-btn-today" onClick={() => setDate(isoToday())}>Oggi</button>
            <button className="btn btn-ghost hk-btn-sm" onClick={() => shiftDate(1)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>
          <div className="hk-action-btns">
            <button className="btn btn-primary hk-btn-sm" onClick={generateDay}>Genera giornata</button>
            <button className="btn btn-ghost hk-btn-sm" onClick={autoAssign} disabled={tasks.length === 0}>Assegna automatico</button>
          </div>
        </div>
      </div>

      {/* ── Stats Row ── */}
      {tasks.length > 0 && (
        <div className="hk-stats-row">
          <div className="hk-stat-card" style={{ borderTopColor: OCC_THEME.checkout.border }}>
            <div className="hk-stat-num" style={{ color: OCC_THEME.checkout.text }}>{checkoutCount}</div>
            <div className="hk-stat-label">Check-out</div>
          </div>
          <div className="hk-stat-card" style={{ borderTopColor: OCC_THEME.stayover.border }}>
            <div className="hk-stat-num" style={{ color: OCC_THEME.stayover.text }}>{stayoverCount}</div>
            <div className="hk-stat-label">In soggiorno</div>
          </div>
          <div className="hk-stat-card" style={{ borderTopColor: OCC_THEME.vacant.border }}>
            <div className="hk-stat-num" style={{ color: OCC_THEME.vacant.text }}>{vacantCount}</div>
            <div className="hk-stat-label">Libere</div>
          </div>
          <div className="hk-stat-card" style={{ borderTopColor: STATUS_COLORS.pulita }}>
            <div className="hk-stat-num" style={{ color: STATUS_COLORS.pulita }}>{doneCount}</div>
            <div className="hk-stat-label">Completate</div>
          </div>
        </div>
      )}

      {/* ── Progress bar ── */}
      {tasks.length > 0 && (
        <div className="hk-progress-wrap">
          <div className="hk-progress-info">
            <span>{doneCount}/{tasks.length} camere completate</span>
            <span style={{ color: progressColor, fontWeight: 700 }}>{Math.round(progress * 100)}%</span>
          </div>
          <div className="hk-progress-track">
            <div className="hk-progress-fill" style={{ width: `${progress * 100}%`, background: progressColor }} />
          </div>
          <div className="hk-status-tags">
            {(["da_pulire", "in_corso", "pulita", "ispezionata"] as HkStatus[]).map((s) => (
              <span key={s} className="hk-status-tag" style={{ background: `${STATUS_COLORS[s]}14`, color: STATUS_COLORS[s] }}>
                {STATUS_LABELS[s]}: {byStatus(s)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Hidden photo input ── */}
      <input
        ref={photoRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handlePhotoFile(f);
          e.target.value = "";
        }}
      />

      {/* ── Room grid grouped by floor ── */}
      {tasks.length === 0 ? (
        <div className="empty" style={{ padding: "60px 20px" }}>
          <div className="serif" style={{ marginBottom: 6 }}>Nessuna task per questa data</div>
          <div>Premi &quot;Genera giornata&quot; per creare le task.</div>
        </div>
      ) : (
        floors.map((floor) => {
          const floorRooms = rooms.filter((r) => r.floor === floor);
          if (floorRooms.length === 0) return null;

          return (
            <div key={floor} className="hk-floor-section">
              <div className="hk-floor-header">
                <h3 className="serif">{floor}</h3>
                <span className="hk-floor-count">{floorRooms.length} camere</span>
              </div>

              <div className="hk-grid">
                {floorRooms.map((room) => {
                  const task = tasks.find((t) => t.room_id === room.id);
                  if (!task) return null;
                  const checked = task.checklist.filter((c) => c.checked).length;
                  const total = task.checklist.length;
                  const isExp = expanded === room.id;
                  const aName = staffName(task.assigned_to);
                  const allChecked = checked === total;
                  const dur = durationMin(task.started_at, task.completed_at);
                  const hasCons = hasConsumables(room.room_type);
                  const occTheme = getOccTheme(task);
                  const isVacant = task.occupancy_status === "vacant";
                  const isSynced = room.smoobu_apartment_id != null;

                  return (
                    <Fragment key={room.id}>
                      <div
                        className={`hk-card ${isVacant ? "hk-card--vacant" : ""}`}
                        style={{
                          borderLeftColor: occTheme ? occTheme.border : STATUS_COLORS[task.status],
                          background: occTheme && !isVacant ? occTheme.bg : undefined,
                        }}
                        onClick={() => setExpanded(isExp ? null : room.id)}
                      >
                        {/* Card header */}
                        <div className="hk-card-head">
                          <span className="hk-room-num serif">
                            {roomShort(room)}
                          </span>
                          <div className="hk-card-badges">
                            {isSynced && (
                              <span className="hk-synced-badge" title="Sincronizzata con Smoobu">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
                              </span>
                            )}
                            <span className="hk-room-badge">{room.room_type}</span>
                          </div>
                        </div>

                        {/* Occupancy tag */}
                        {occTheme && (
                          <div
                            className="hk-occ-tag"
                            style={{ background: occTheme.border, color: "#fff" }}
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d={occTheme.icon} /></svg>
                            {occTheme.label}
                          </div>
                        )}

                        {/* Guest info from Smoobu */}
                        {task.guest_name && !isVacant && (
                          <div className="hk-guest-info">
                            <div className="hk-guest-name">{task.guest_name}</div>
                            <div className="hk-guest-meta">
                              {task.channel && <span className="hk-channel-tag">{task.channel}</span>}
                              {task.nights && <span>{task.nights}N</span>}
                            </div>
                          </div>
                        )}

                        {/* Status pill */}
                        <div className="hk-status-pill" style={{ background: STATUS_COLORS[task.status] }}>
                          {STATUS_LABELS[task.status]}
                        </div>

                        {/* Assigned staff */}
                        <div className="hk-assigned">
                          {aName ? (
                            <div className="hk-staff-chip">
                              <span className="hk-avatar">{initials(aName)}</span>
                              <span>{aName}</span>
                            </div>
                          ) : (
                            <span className="hk-unassigned">Non assegnata</span>
                          )}
                        </div>

                        {/* Checklist progress (only if not vacant) */}
                        {!isVacant && total > 0 && (
                          <div className="hk-check-progress">
                            <div className="hk-bar"><div style={{ width: `${(checked / total) * 100}%`, background: occTheme ? occTheme.border : STATUS_COLORS[task.status] }} /></div>
                            <span className="hk-check-count">{checked}/{total}</span>
                          </div>
                        )}

                        {/* Consumables badge */}
                        {!isVacant && (
                          <div className="hk-cons-badge">
                            {hasCons ? (
                              <span style={{ color: "var(--ok)" }}>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                                Auto-scarico
                              </span>
                            ) : null}
                          </div>
                        )}
                      </div>

                      {/* ── Expanded detail ── */}
                      {isExp && (
                        <div className="hk-detail">
                          <div className="hk-detail-pad">
                            {/* Head */}
                            <div className="hk-detail-head">
                              <div>
                                <h3 className="serif" style={{ fontSize: 18, fontWeight: 500 }}>{roomLabel(room)}</h3>
                                <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                                  {room.room_type} &middot; {room.floor}
                                </span>
                                {task.guest_name && (
                                  <div style={{ marginTop: 6, fontSize: 14 }}>
                                    <strong>{task.guest_name}</strong>
                                    {task.channel && <span className="hk-channel-tag" style={{ marginLeft: 8 }}>{task.channel}</span>}
                                    {task.check_in_date && task.check_out_date && (
                                      <span style={{ fontSize: 12, color: "var(--ink-soft)", marginLeft: 8 }}>
                                        {task.check_in_date} &rarr; {task.check_out_date}
                                        {task.nights && ` (${task.nights}N)`}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                              <div className="field" style={{ marginBottom: 0, minWidth: 160 }}>
                                <label>Assegnata a</label>
                                <select
                                  value={task.assigned_to ?? ""}
                                  onChange={(e) => assignStaff(task.id, e.target.value || null)}
                                  style={{ padding: "8px 10px", fontSize: 14 }}
                                >
                                  <option value="">— Non assegnata —</option>
                                  {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                              </div>
                            </div>

                            {/* Timestamps */}
                            {(task.started_at || task.completed_at) && (
                              <div className="hk-timestamps">
                                {task.started_at && <span>Iniziata <strong>{fmtTime(task.started_at)}</strong></span>}
                                {task.completed_at && <span>Completata <strong>{fmtTime(task.completed_at)}</strong></span>}
                                {dur !== null && <span>Durata: <strong>{dur} min</strong></span>}
                              </div>
                            )}

                            {/* Checklist as pills */}
                            {task.checklist.length > 0 && (
                              <div className="hk-pills">
                                {task.checklist.map((item) => (
                                  <button
                                    key={item.id}
                                    className={`hk-pill ${item.checked ? "hk-pill--done" : ""}`}
                                    onClick={(e) => { e.stopPropagation(); toggleCheck(task.id, item.id); }}
                                  >
                                    {item.checked && (
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                                    )}
                                    {item.label}
                                  </button>
                                ))}
                              </div>
                            )}

                            {/* Status buttons */}
                            <div className="hk-action-row">
                              {task.status === "da_pulire" && (
                                <button
                                  className="btn hk-action-btn"
                                  style={{ background: STATUS_COLORS.in_corso, color: "#fff" }}
                                  onClick={() => changeStatus(task.id, "in_corso")}
                                >
                                  Inizia pulizia
                                </button>
                              )}
                              {task.status === "in_corso" && (
                                <button
                                  className="btn hk-action-btn"
                                  style={{
                                    background: allChecked ? STATUS_COLORS.pulita : "var(--line)",
                                    color: allChecked ? "#fff" : "var(--ink-soft)",
                                  }}
                                  onClick={() => changeStatus(task.id, "pulita")}
                                  disabled={!allChecked}
                                >
                                  Pulizia completata
                                </button>
                              )}
                              {task.status === "pulita" && (
                                <button
                                  className="btn hk-action-btn"
                                  style={{ background: STATUS_COLORS.ispezionata, color: "#fff" }}
                                  onClick={() => changeStatus(task.id, "ispezionata")}
                                >
                                  Ispezionata
                                </button>
                              )}
                            </div>

                            {/* Notes */}
                            <div className="field" style={{ marginTop: 16 }}>
                              <label>Note / Segnalazioni</label>
                              <textarea
                                value={task.notes ?? ""}
                                onChange={(e) => setNotes(task.id, e.target.value)}
                                onBlur={(e) => saveNotes(task.id, e.target.value)}
                                placeholder="Es. rubinetto gocciola, macchia sul tappeto..."
                                style={{ minHeight: 60, fontSize: 14 }}
                              />
                            </div>

                            {/* Photo */}
                            <div style={{ marginTop: 8 }}>
                              <button className="btn btn-ghost hk-btn-sm" onClick={() => triggerPhoto(task.id)}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                                  <circle cx="12" cy="13" r="4" />
                                </svg>
                                Scatta foto
                              </button>
                              {task.photo_path && (
                                <span style={{ marginLeft: 10, fontSize: 12, color: "var(--ok)", fontWeight: 600 }}>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline", verticalAlign: "-2px", marginRight: 4 }}><path d="M20 6L9 17l-5-5" /></svg>
                                  Foto caricata
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </Fragment>
                  );
                })}
              </div>
            </div>
          );
        })
      )}

      {/* ── Summary ── */}
      {tasks.length > 0 && Object.keys(staffStats).length > 0 && (
        <div className="section" style={{ marginTop: 24 }}>
          <div className="section-head"><h2>Riepilogo</h2></div>
          <div className="section-body" style={{ padding: 0 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Cameriera</th>
                  <th style={{ textAlign: "center" }}>Assegnate</th>
                  <th style={{ textAlign: "center" }}>Completate</th>
                  <th style={{ textAlign: "right" }}>Tempo medio</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(staffStats).map(([sid, s]) => (
                  <tr key={sid}>
                    <td><strong>{staffName(sid)}</strong></td>
                    <td style={{ textAlign: "center" }}>{s.assigned}</td>
                    <td style={{ textAlign: "center" }}>{s.done}</td>
                    <td style={{ textAlign: "right" }}>{s.done > 0 ? `${Math.round(s.totalMin / s.done)} min` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Issues ── */}
      {issues.length > 0 && (
        <div className="section" style={{ marginTop: 16 }}>
          <div className="section-head">
            <h2>Segnalazioni</h2>
            <span className="badge warn">{issues.length}</span>
          </div>
          <div className="section-body">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {issues.map((t) => {
                const r = rooms.find((rm) => rm.id === t.room_id);
                return (
                  <div key={t.id} style={{ display: "flex", gap: 10, fontSize: 14, padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                    <strong>{r ? roomLabel(r) : "Camera ?"}</strong>
                    <span style={{ color: "var(--ink-soft)" }}>{t.notes}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Smoobu Mapping Modal ── */}
      {showSmoobuMap && (
        <div className="modal-overlay" onClick={() => setShowSmoobuMap(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="section-head" style={{ padding: "20px 24px", borderBottom: "1px solid var(--line)" }}>
              <h2>Mappature Smoobu</h2>
              <button className="btn-ghost" style={{ padding: "6px 10px", borderRadius: 8, fontSize: 18, lineHeight: 1 }} onClick={() => setShowSmoobuMap(false)}>&times;</button>
            </div>
            <div style={{ padding: 24, maxHeight: "60vh", overflowY: "auto" }}>
              {smoobuApartments.length === 0 ? (
                <p className="muted">Nessun appartamento trovato su Smoobu. Verifica la API key.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {rooms.map((room) => (
                    <div key={room.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontWeight: 700, fontSize: 14, minWidth: 100 }}>{roomLabel(room)}</span>
                      <select
                        value={mappingForm[room.id] ?? ""}
                        onChange={(e) => setMappingForm((prev) => ({ ...prev, [room.id]: e.target.value ? parseInt(e.target.value) : null }))}
                        style={{ flex: 1, padding: "8px 10px", fontSize: 13, border: "1px solid var(--line)", borderRadius: 8, fontFamily: "inherit" }}
                      >
                        <option value="">— Non mappata —</option>
                        {smoobuApartments.map((apt) => (
                          <option key={apt.id} value={apt.id}>{apt.name} (ID: {apt.id})</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ padding: "16px 24px", borderTop: "1px solid var(--line)", display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="btn btn-ghost" onClick={() => setShowSmoobuMap(false)}>Annulla</button>
              <button className="btn btn-primary" onClick={saveMapping} disabled={savingMap}>
                {savingMap ? "Salvataggio..." : "Salva mappature"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Consumabili Config Modal ── */}
      {showConsConfig && (
        <div className="modal-overlay" onClick={() => setShowConsConfig(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div className="section-head" style={{ padding: "20px 24px", borderBottom: "1px solid var(--line)" }}>
              <h2>Consumabili per tipo camera</h2>
              <button className="btn-ghost" style={{ padding: "6px 10px", borderRadius: 8, fontSize: 18, lineHeight: 1 }} onClick={() => setShowConsConfig(false)}>&times;</button>
            </div>
            <div style={{ padding: 24, maxHeight: "60vh", overflowY: "auto" }}>
              {ROOM_TYPES.length === 0 ? (
                <p className="muted">Nessuna camera trovata. Configura le camere prima.</p>
              ) : (
                ROOM_TYPES.map((rt) => (
                  <div key={rt} style={{ marginBottom: 24 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10, color: "var(--ink)" }}>{rt}</h3>
                    {(consForm[rt] || []).map((row, idx) => (
                      <div key={idx} style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
                        <select
                          value={row.product_id}
                          onChange={(e) => updateConsRow(rt, idx, "product_id", e.target.value)}
                          style={{ flex: 2, padding: "8px 10px", fontSize: 13, border: "1px solid var(--line)", borderRadius: 8, fontFamily: "inherit" }}
                        >
                          <option value="">Seleziona prodotto...</option>
                          {products.map((p) => <option key={p.product_id} value={p.product_id}>{p.name} ({p.current_stock} {p.unit})</option>)}
                        </select>
                        <input
                          type="number"
                          min="1"
                          value={row.quantity}
                          onChange={(e) => updateConsRow(rt, idx, "quantity", parseInt(e.target.value) || 1)}
                          style={{ width: 60, padding: "8px 10px", fontSize: 13, border: "1px solid var(--line)", borderRadius: 8, textAlign: "center", fontFamily: "inherit" }}
                        />
                        <button
                          onClick={() => removeConsRow(rt, idx)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)", fontSize: 18, fontWeight: 700, padding: "4px 8px" }}
                        >&times;</button>
                      </div>
                    ))}
                    <button
                      onClick={() => addConsRow(rt)}
                      style={{ background: "none", border: "1px dashed var(--line)", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "var(--ink-soft)", fontFamily: "inherit" }}
                    >
                      + Aggiungi prodotto
                    </button>
                  </div>
                ))
              )}
            </div>
            <div style={{ padding: "16px 24px", borderTop: "1px solid var(--line)", display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="btn btn-ghost" onClick={() => setShowConsConfig(false)}>Annulla</button>
              <button className="btn btn-primary" onClick={saveConsumables} disabled={savingCons}>
                {savingCons ? "Salvataggio..." : "Salva configurazione"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className="hk-toast" data-type={toast.type}>
          {toast.msg}
        </div>
      )}

      <style>{`
        /* ── Full width override ── */
        .wrap:has(.hk-header){max-width:none;padding-left:24px;padding-right:24px}
        @media(min-width:1024px){.wrap:has(.hk-header){padding-left:32px;padding-right:32px}}

        /* ── Layout ── */
        .hk-header{margin-bottom:24px}
        .hk-header-top{display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:14px}
        .hk-title{font-size:24px;font-weight:500;margin:0}
        .hk-subtitle{font-size:14px;color:var(--ink-soft);margin:4px 0 0;font-weight:500}
        .hk-header-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
        .hk-btn-sm{padding:8px 14px !important;font-size:13px !important;gap:6px;display:inline-flex;align-items:center}
        .hk-btn-today{font-weight:700 !important}
        .hk-nav-row{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px}
        .hk-date-nav{display:flex;align-items:center;gap:4px}
        .hk-action-btns{display:flex;gap:8px;flex-wrap:wrap}

        /* ── Smoobu button ── */
        .hk-btn-smoobu{background:#1a73e8;color:#fff;border:none;padding:8px 16px;border-radius:8px;
          font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:6px;
          transition:background .15s}
        .hk-btn-smoobu:hover{background:#1557b0}
        .hk-btn-smoobu:disabled{opacity:.6;cursor:not-allowed}
        .hk-spinner{width:15px;height:15px;border:2.5px solid rgba(255,255,255,.3);border-top-color:#fff;
          border-radius:50%;animation:hkSpin .6s linear infinite;display:inline-block}
        @keyframes hkSpin{to{transform:rotate(360deg)}}

        /* ── Stats row ── */
        .hk-stats-row{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
        .hk-stat-card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);
          padding:16px 18px;border-top:3px solid;text-align:center;box-shadow:var(--shadow)}
        .hk-stat-num{font-size:28px;font-weight:800;font-family:'Bebas Neue',sans-serif;line-height:1.1}
        .hk-stat-label{font-size:12px;font-weight:600;color:var(--ink-soft);margin-top:4px;text-transform:uppercase;letter-spacing:.5px}

        /* ── Progress ── */
        .hk-progress-wrap{margin-bottom:28px}
        .hk-progress-info{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;font-size:14px;font-weight:600}
        .hk-progress-track{height:10px;border-radius:5px;background:#E8E0D0;overflow:hidden}
        .hk-progress-fill{height:100%;border-radius:5px;transition:width .3s}
        .hk-status-tags{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
        .hk-status-tag{font-size:11.5px;font-weight:700;padding:4px 10px;border-radius:20px}

        /* ── Floor sections ── */
        .hk-floor-section{margin-bottom:32px}
        .hk-floor-header{display:flex;align-items:baseline;gap:10px;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid var(--line)}
        .hk-floor-header h3{font-size:17px;font-weight:500;margin:0}
        .hk-floor-count{font-size:12px;font-weight:600;color:var(--ink-soft)}

        /* ── Grid ── */
        .hk-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}

        /* ── Card ── */
        .hk-card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:16px 18px;
          border-left:4px solid;cursor:pointer;transition:box-shadow .15s,transform .15s;box-shadow:var(--shadow)}
        .hk-card:hover{box-shadow:0 4px 16px rgba(31,51,38,.1);transform:translateY(-1px)}
        .hk-card--vacant{opacity:.75}
        .hk-card-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
        .hk-card-badges{display:flex;align-items:center;gap:6px}
        .hk-room-num{font-size:22px;font-weight:600;line-height:1}
        .hk-room-badge{font-size:10px;font-weight:700;padding:3px 8px;border-radius:20px;background:var(--surface-2);color:var(--ink-soft);text-transform:uppercase;letter-spacing:.3px}
        .hk-synced-badge{display:flex;align-items:center;color:#1a73e8}

        /* ── Occupancy tag ── */
        .hk-occ-tag{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;
          padding:3px 10px;border-radius:20px;margin-bottom:8px;letter-spacing:.3px}

        /* ── Guest info ── */
        .hk-guest-info{margin-bottom:8px}
        .hk-guest-name{font-size:13px;font-weight:700;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .hk-guest-meta{display:flex;align-items:center;gap:6px;margin-top:2px;font-size:11px;color:var(--ink-soft);font-weight:600}
        .hk-channel-tag{display:inline-block;font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;
          background:rgba(26,115,232,.1);color:#1a73e8}

        /* ── Status pill ── */
        .hk-status-pill{display:inline-block;font-size:11px;font-weight:700;color:#fff;padding:3px 11px;border-radius:20px;margin-bottom:8px}

        /* ── Assigned ── */
        .hk-assigned{margin-bottom:8px}
        .hk-staff-chip{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600}
        .hk-avatar{width:22px;height:22px;border-radius:50%;background:var(--ink);color:var(--surface);
          display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;flex-shrink:0}
        .hk-unassigned{font-size:12px;color:var(--ink-soft)}

        /* ── Check progress ── */
        .hk-check-progress{display:flex;align-items:center;gap:8px;margin-bottom:6px}
        .hk-bar{flex:1;height:5px;border-radius:3px;background:#E8E0D0;overflow:hidden}
        .hk-bar>div{height:100%;border-radius:3px;transition:width .3s}
        .hk-check-count{font-size:11px;font-weight:700;color:var(--ink-soft);min-width:28px;text-align:right}

        /* ── Cons badge ── */
        .hk-cons-badge{font-size:11px;font-weight:600;min-height:16px}
        .hk-cons-badge svg{display:inline;vertical-align:-1px;margin-right:3px}

        /* ── Detail panel ── */
        .hk-detail{grid-column:1/-1;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);
          box-shadow:var(--shadow);overflow:hidden;animation:hkSlide .2s ease}
        .hk-detail-pad{padding:24px}
        .hk-detail-head{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px}
        .hk-timestamps{display:flex;gap:16px;margin-bottom:16px;font-size:13px;color:var(--ink-soft);flex-wrap:wrap}

        /* ── Checklist pills ── */
        .hk-pills{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px}
        .hk-pill{display:inline-flex;align-items:center;gap:5px;padding:8px 16px;border-radius:24px;border:1.5px solid var(--line);
          background:var(--surface);font-family:inherit;font-size:13.5px;font-weight:600;cursor:pointer;
          transition:all .15s;color:var(--ink);user-select:none}
        .hk-pill:hover{border-color:var(--ink-soft);background:var(--surface-2)}
        .hk-pill--done{background:#EAF3DE;border-color:#639922;color:#27500A}
        .hk-pill--done:hover{background:#dde9cd}

        /* ── Action buttons ── */
        .hk-action-row{display:flex;gap:10px;margin-top:16px;flex-wrap:wrap}
        .hk-action-btn{padding:12px 22px !important;font-size:15px !important}

        /* ── Toast ── */
        .hk-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
          padding:12px 24px;border-radius:12px;font-size:14px;font-weight:600;z-index:200;
          box-shadow:0 8px 24px rgba(31,51,38,.2);max-width:90vw;text-align:center;color:#FAF9F5;
          animation:hkToastIn .2s ease}
        .hk-toast[data-type="ok"]{background:#2D5A3D}
        .hk-toast[data-type="warn"]{background:#B68A3E}
        @keyframes hkToastIn{from{opacity:0;transform:translateX(-50%) translateY(10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}

        @keyframes hkSlide{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}

        /* ── Responsive ── */
        @media(max-width:1200px){
          .hk-grid{grid-template-columns:repeat(3,1fr)}
        }
        @media(max-width:1023px){
          .hk-grid{grid-template-columns:repeat(2,1fr)}
          .hk-stats-row{grid-template-columns:repeat(2,1fr)}
        }
        @media(max-width:600px){
          .hk-grid{grid-template-columns:1fr}
          .hk-stats-row{grid-template-columns:repeat(2,1fr)}
          .hk-detail-pad{padding:16px}
          .hk-pill{padding:10px 14px;font-size:14px}
          .hk-action-btn{width:100%;padding:14px !important;font-size:16px !important}
          .hk-header-top{flex-direction:column}
          .hk-header-actions{width:100%}
          .hk-btn-smoobu{flex:1;justify-content:center}
        }
      `}</style>
    </>
  );
}
