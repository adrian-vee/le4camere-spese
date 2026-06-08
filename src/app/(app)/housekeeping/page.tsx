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

type Room = { id: string; number: number; type: string; floor: number };
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
};

const isoToday = () => new Date().toISOString().slice(0, 10);

function fmtTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

function durationMin(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
}

export default function HousekeepingPage() {
  const supabase = createClient();
  const [date, setDate] = useState(isoToday());
  const [rooms, setRooms] = useState<Room[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const photoTaskRef = useRef<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  async function load() {
    const [{ data: r }, { data: t }, { data: s }] = await Promise.all([
      supabase.from("rooms").select("*").eq("active", true).order("floor").order("number"),
      supabase.from("housekeeping_tasks").select("*").eq("task_date", date),
      supabase.from("staff").select("id, name").eq("active", true).order("name"),
    ]);
    setRooms((r ?? []) as Room[]);
    setTasks((t ?? []) as Task[]);
    setStaff((s ?? []) as Staff[]);
    setLoading(false);
  }

  useEffect(() => {
    setLoading(true);
    setExpanded(null);
    load();
    // eslint-disable-next-line
  }, [date]);

  /* ── Actions ── */

  async function generateDay() {
    if (tasks.length > 0) { showToast("Giornata già generata"); return; }
    const inserts = rooms.map((r) => ({
      room_id: r.id,
      task_date: date,
      status: "da_pulire" as const,
      checklist: defaultChecklist(),
    }));
    const { error } = await supabase.from("housekeeping_tasks").insert(inserts);
    if (error) { showToast("Errore: " + error.message); return; }
    showToast(`Giornata generata per ${rooms.length} camere`);
    load();
  }

  async function autoAssign() {
    if (tasks.length === 0) { showToast("Genera prima la giornata"); return; }
    const { data: stData } = await supabase.from("shift_types").select("id, name").order("sort");
    const morning = (stData ?? []).find((t) => t.name.toLowerCase().includes("mattin"));
    if (!morning) { showToast("Turno 'Mattina' non trovato"); return; }

    const { data: shData } = await supabase
      .from("shifts")
      .select("staff_id")
      .eq("shift_date", date)
      .eq("shift_type_id", morning.id);
    const staffIds = [...new Set((shData ?? []).map((s) => s.staff_id).filter(Boolean))] as string[];
    if (staffIds.length === 0) { showToast("Nessuno staff al turno Mattina"); return; }

    const sorted = [...rooms].sort((a, b) => a.floor - b.floor || a.number - b.number);
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
        if (error) { showToast("Errore upload: " + error.message); return; }
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

  if (loading) return <div className="empty">Caricamento…</div>;

  return (
    <>
      {/* ── Header ── */}
      <div style={{ marginBottom: 20 }}>
        <h2 className="serif" style={{ fontSize: 22, fontWeight: 500, marginBottom: 8 }}>Housekeeping</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-ghost" style={{ padding: "8px 14px", fontSize: 13 }} onClick={() => shiftDate(-1)}>← Ieri</button>
          <button className="btn btn-ghost" style={{ padding: "8px 14px", fontSize: 13, fontWeight: 700 }} onClick={() => setDate(isoToday())}>Oggi</button>
          <button className="btn btn-ghost" style={{ padding: "8px 14px", fontSize: 13 }} onClick={() => shiftDate(1)}>Domani →</button>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-soft)", marginLeft: 4 }}>
            {dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}
          </span>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          <button className="btn btn-primary" style={{ padding: "10px 18px", fontSize: 14 }} onClick={generateDay}>
            Genera giornata
          </button>
          <button className="btn btn-ghost" style={{ padding: "10px 18px", fontSize: 14 }} onClick={autoAssign} disabled={tasks.length === 0}>
            Assegna automatico
          </button>
        </div>
      </div>

      {/* ── Progress ── */}
      {tasks.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>{doneCount}/{tasks.length} camere completate</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: progressColor }}>{Math.round(progress * 100)}%</span>
          </div>
          <div style={{ height: 10, borderRadius: 5, background: "#E8E0D0", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${progress * 100}%`, background: progressColor, borderRadius: 5, transition: "width .3s" }} />
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
            {(["da_pulire", "in_corso", "pulita", "ispezionata"] as HkStatus[]).map((s) => (
              <span key={s} style={{
                fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 20,
                background: `${STATUS_COLORS[s]}18`, color: STATUS_COLORS[s],
              }}>
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

      {/* ── Room grid ── */}
      {tasks.length === 0 ? (
        <div className="empty" style={{ padding: "60px 20px" }}>
          <div className="serif" style={{ marginBottom: 6 }}>Nessuna task per questa data</div>
          <div>Premi &quot;Genera giornata&quot; per creare le task.</div>
        </div>
      ) : (
        <div className="hk-grid">
          {rooms.map((room) => {
            const task = tasks.find((t) => t.room_id === room.id);
            if (!task) return null;
            const checked = task.checklist.filter((c) => c.checked).length;
            const total = task.checklist.length;
            const isExp = expanded === room.id;
            const aName = staffName(task.assigned_to);
            const allChecked = checked === total;
            const dur = durationMin(task.started_at, task.completed_at);

            return (
              <Fragment key={room.id}>
                <div
                  className="hk-card"
                  style={{ borderLeftColor: STATUS_COLORS[task.status] }}
                  onClick={() => setExpanded(isExp ? null : room.id)}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <span className="hk-room-num serif">Camera {room.number}</span>
                    <span className="hk-room-badge">{room.type}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 10 }}>Piano {room.floor}</div>
                  <div className="hk-status" style={{ background: STATUS_COLORS[task.status] }}>
                    {STATUS_LABELS[task.status]}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
                    {aName ?? <span style={{ color: "var(--ink-soft)" }}>Non assegnata</span>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <div className="hk-bar"><div style={{ width: `${total > 0 ? (checked / total) * 100 : 0}%`, background: STATUS_COLORS[task.status] }} /></div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-soft)", minWidth: 32, textAlign: "right" }}>{checked}/{total}</span>
                  </div>
                  <button
                    className="hk-open"
                    onClick={(e) => { e.stopPropagation(); setExpanded(isExp ? null : room.id); }}
                  >
                    {isExp ? "Chiudi" : "Apri"}
                  </button>
                </div>

                {isExp && (
                  <div className="hk-detail">
                    <div className="hk-detail-pad">
                      {/* Head */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
                        <div>
                          <h3 className="serif" style={{ fontSize: 18, fontWeight: 500 }}>Camera {room.number}</h3>
                          <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>{room.type} · Piano {room.floor}</span>
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
                        <div style={{ display: "flex", gap: 16, marginBottom: 16, fontSize: 13, color: "var(--ink-soft)", flexWrap: "wrap" }}>
                          {task.started_at && <span>Iniziata alle <strong>{fmtTime(task.started_at)}</strong></span>}
                          {task.completed_at && <span>Completata alle <strong>{fmtTime(task.completed_at)}</strong></span>}
                          {dur !== null && <span>Durata: <strong>{dur} min</strong></span>}
                        </div>
                      )}

                      {/* Checklist */}
                      <div className="hk-checks">
                        {task.checklist.map((item) => (
                          <label key={item.id} className="hk-chk-row">
                            <input
                              type="checkbox"
                              checked={item.checked}
                              onChange={() => toggleCheck(task.id, item.id)}
                              className="hk-chk"
                            />
                            <span className={item.checked ? "hk-chk-done" : ""}>{item.label}</span>
                          </label>
                        ))}
                      </div>

                      {/* Status buttons */}
                      <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
                        {task.status === "da_pulire" && (
                          <button
                            className="btn hk-action"
                            style={{ background: STATUS_COLORS.in_corso, color: "#fff" }}
                            onClick={() => changeStatus(task.id, "in_corso")}
                          >
                            Inizia pulizia
                          </button>
                        )}
                        {task.status === "in_corso" && (
                          <button
                            className="btn hk-action"
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
                            className="btn hk-action"
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
                          placeholder="Es. rubinetto gocciola, macchia sul tappeto…"
                          style={{ minHeight: 60, fontSize: 14 }}
                        />
                      </div>

                      {/* Photo */}
                      <div style={{ marginTop: 8 }}>
                        <button className="btn btn-ghost" style={{ fontSize: 13, padding: "8px 14px" }} onClick={() => triggerPhoto(task.id)}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline", verticalAlign: "-2px", marginRight: 6 }}>
                            <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                            <circle cx="12" cy="13" r="4" />
                          </svg>
                          Scatta foto problema
                        </button>
                        {task.photo_path && (
                          <div style={{ marginTop: 8, fontSize: 12, color: "var(--ok)", fontWeight: 600 }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline", verticalAlign: "-2px", marginRight: 4 }}><path d="M20 6L9 17l-5-5" /></svg>
                            Foto caricata
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>
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
                    <strong>Camera {r?.number}</strong>
                    <span style={{ color: "var(--ink-soft)" }}>{t.notes}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: "var(--ink)", color: "#FAF9F5", padding: "12px 24px", borderRadius: 12,
          fontSize: 14, fontWeight: 600, zIndex: 200, boxShadow: "0 8px 24px rgba(31,51,38,.2)",
        }}>
          {toast}
        </div>
      )}

      <style>{`
        .hk-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px}
        .hk-card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:16px 18px;
          border-left:4px solid;cursor:pointer;transition:box-shadow .15s;box-shadow:var(--shadow)}
        .hk-card:hover{box-shadow:0 2px 8px rgba(31,51,38,.1)}
        .hk-room-num{font-size:17px;font-weight:500}
        .hk-room-badge{font-size:11px;font-weight:700;padding:3px 8px;border-radius:20px;background:var(--surface-2);color:var(--ink-soft)}
        .hk-status{display:inline-block;font-size:11.5px;font-weight:700;color:#fff;padding:4px 12px;border-radius:20px;margin-bottom:10px}
        .hk-bar{flex:1;height:6px;border-radius:3px;background:#E8E0D0;overflow:hidden}
        .hk-bar>div{height:100%;border-radius:3px;transition:width .3s}
        .hk-open{width:100%;padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--surface-2);
          font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;color:var(--ink);transition:.15s}
        .hk-open:hover{border-color:var(--ink);background:var(--surface)}
        .hk-detail{grid-column:1/-1;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);
          box-shadow:var(--shadow);overflow:hidden;animation:hkSlide .2s ease}
        .hk-detail-pad{padding:24px}
        .hk-checks{display:flex;flex-direction:column;gap:2px}
        .hk-chk-row{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:10px;cursor:pointer;
          font-size:15px;font-weight:500;transition:background .1s;user-select:none}
        .hk-chk-row:hover{background:var(--surface-2)}
        .hk-chk-done{text-decoration:line-through;color:var(--ink-soft)}
        .hk-chk{width:24px;height:24px;min-width:24px;accent-color:var(--ok);cursor:pointer;flex-shrink:0}
        .hk-action{padding:12px 22px;font-size:15px}
        @keyframes hkSlide{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
        @media(max-width:1023px){.hk-grid{grid-template-columns:1fr 1fr}}
        @media(max-width:600px){
          .hk-grid{grid-template-columns:1fr}
          .hk-detail-pad{padding:16px}
          .hk-chk-row{padding:12px 10px;font-size:16px}
          .hk-chk{width:28px;height:28px;min-width:28px}
          .hk-action{width:100%;padding:14px;font-size:16px}
        }
      `}</style>
    </>
  );
}
