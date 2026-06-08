"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { WEEKDAYS, type ShiftTypeRow } from "@/lib/turni";

export default function CoperturaPage() {
  const supabase = createClient();
  const [types, setTypes] = useState<ShiftTypeRow[]>([]);
  const [matrix, setMatrix] = useState<Record<string, number>>({}); // `${weekday}|${typeId}` -> count
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  async function load() {
    setLoading(true);
    const [{ data: ty }, { data: cov }] = await Promise.all([
      supabase.from("shift_types").select("*").order("sort"),
      supabase.from("coverage_template").select("*"),
    ]);
    setTypes((ty ?? []) as ShiftTypeRow[]);
    const m: Record<string, number> = {};
    for (const c of (cov ?? []) as { weekday: number; shift_type_id: string; count: number }[]) {
      m[`${c.weekday}|${c.shift_type_id}`] = c.count;
    }
    setMatrix(m);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const get = (wd: number, id: string) => matrix[`${wd}|${id}`] ?? 0;
  function set(wd: number, id: string, v: number) {
    setMatrix((m) => ({ ...m, [`${wd}|${id}`]: Math.max(0, v) }));
    setSaved(false);
  }

  async function salva() {
    const rows: { weekday: number; shift_type_id: string; count: number }[] = [];
    for (let wd = 1; wd <= 7; wd++) for (const t of types) rows.push({ weekday: wd, shift_type_id: t.id, count: get(wd, t.id) });
    const { error } = await supabase.from("coverage_template").upsert(rows, { onConflict: "weekday,shift_type_id" });
    if (error) return alert("Errore: " + error.message);
    setSaved(true);
  }

  return (
    <div className="section">
      <div className="section-head">
        <h2>Copertura settimanale</h2>
        <Link href="/turni" className="muted" style={{ fontWeight: 600 }}>← Torna ai turni</Link>
      </div>
      <div className="section-body">
        <p className="muted" style={{ marginBottom: 16 }}>Imposta quante persone servono per ogni fascia, in ogni giorno della settimana. Il generatore userà questi numeri.</p>
        {loading ? <div className="empty">Caricamento…</div> : (
          <div style={{ overflowX: "auto" }}>
            <table className="tbl" style={{ minWidth: 540 }}>
              <thead><tr><th>Fascia</th>{WEEKDAYS.map((d) => <th key={d} style={{ textAlign: "center" }}>{d}</th>)}</tr></thead>
              <tbody>
                {types.map((t) => (
                  <tr key={t.id}>
                    <td><strong>{t.name}</strong><div className="muted">{t.start_time.slice(0, 5)}–{t.end_time.slice(0, 5)}</div></td>
                    {WEEKDAYS.map((_, i) => {
                      const wd = i + 1;
                      return (
                        <td key={wd} style={{ textAlign: "center" }}>
                          <input type="number" min="0" max="9" value={get(wd, t.id)} onChange={(e) => set(wd, t.id, Number(e.target.value))}
                            style={{ width: 52, textAlign: "center", fontFamily: "inherit", fontSize: 14, padding: "7px 6px", border: "1px solid var(--line)", borderRadius: 8 }} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <button className="btn btn-primary" style={{ marginTop: 18 }} onClick={salva} disabled={loading}>{saved ? "✓ Salvato" : "Salva copertura"}</button>
      </div>
    </div>
  );
}
