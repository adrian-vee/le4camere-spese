"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { useRole } from "@/lib/useRole";
import { useToast } from "@/lib/useToast";
import { Toast } from "@/components/Toast";
import { ALLERGENI, ALLERGENE_MAP, BREAKFAST_CATEGORIES, getAllergeneSvgPath } from "@/lib/allergeni";
import QRCode from "qrcode";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export const dynamic = "force-dynamic";

type Product = {
  id: string;
  name: string;
  name_en: string | null;
  name_de: string | null;
  category: string;
  allergens: string[];
  may_contain: string[];
  is_on_buffet: boolean;
  notes: string | null;
  created_at: string;
};

function AllergenIcon({ slug, size = 20, active = false, dashed = false }: { slug: string; size?: number; active?: boolean; dashed?: boolean }) {
  const a = ALLERGENE_MAP.get(slug);
  if (!a) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={active ? a.color : "#D8CCB8"}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={dashed ? "3 2" : undefined}
      style={{ transition: "all .2s" }}
    >
      <path d={getAllergeneSvgPath(slug)} />
    </svg>
  );
}

async function renderAllergenIconsToPng(sizePx = 64): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const pad = Math.round(sizePx * 0.12);
  for (const a of ALLERGENI) {
    const svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${sizePx}" height="${sizePx}"`,
      ` viewBox="0 0 24 24" fill="none" stroke="${a.color}"`,
      ` stroke-width="2" stroke-linecap="round" stroke-linejoin="round">`,
      `<path d="${getAllergeneSvgPath(a.slug)}"/></svg>`,
    ].join("");
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const c = document.createElement("canvas");
    c.width = sizePx;
    c.height = sizePx;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.arc(sizePx / 2, sizePx / 2, sizePx / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.drawImage(img, pad, pad, sizePx - pad * 2, sizePx - pad * 2);
    result.set(a.slug, c.toDataURL("image/png"));
    URL.revokeObjectURL(url);
  }
  return result;
}

const emptyForm = {
  name: "",
  name_en: "",
  name_de: "",
  category: "altro",
  allergens: [] as string[],
  may_contain: [] as string[],
  is_on_buffet: true,
  notes: "",
};

export default function AllergeniPage() {
  const { isAdmin, isManager, loading: roleLoading } = useRole();
  const router = useRouter();
  const supabase = createClient();
  const { toast, showToast } = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const [showQR, setShowQR] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  const [matrixFilter, setMatrixFilter] = useState<string | null>(null);
  const [buffetOnly, setBuffetOnly] = useState(true);

  const [safeMode, setSafeMode] = useState(false);
  const [guestAllergens, setGuestAllergens] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!roleLoading && !isManager) router.replace("/");
  }, [roleLoading, isManager, router]);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("breakfast_products")
      .select("*")
      .order("category")
      .order("name");
    setProducts((data ?? []) as Product[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const displayProducts = buffetOnly ? products.filter((p) => p.is_on_buffet) : products;

  /* ── KPI ── */
  const totalProducts = products.length;
  const onBuffet = products.filter((p) => p.is_on_buffet).length;
  const glutenFree = products.filter((p) => p.is_on_buffet && !p.allergens.includes("glutine")).length;
  const lactoseFree = products.filter((p) => p.is_on_buffet && !p.allergens.includes("latte")).length;
  const allergensPresent = new Set(products.filter((p) => p.is_on_buffet).flatMap((p) => p.allergens)).size;

  /* ── Save ── */
  async function save() {
    if (!form.name.trim()) { showToast("Il nome è obbligatorio", "warn"); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        name_en: form.name_en.trim() || null,
        name_de: form.name_de.trim() || null,
        category: form.category,
        allergens: form.allergens,
        may_contain: form.may_contain,
        is_on_buffet: form.is_on_buffet,
        notes: form.notes.trim() || null,
        updated_at: new Date().toISOString(),
      };
      if (editId) {
        const { error } = await supabase.from("breakfast_products").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("breakfast_products").insert(payload);
        if (error) throw error;
      }
      showToast(editId ? "Prodotto aggiornato" : "Prodotto creato");
      closeModal();
      load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Errore", "error");
    } finally { setSaving(false); }
  }

  async function del(id: string) {
    if (!confirm("Eliminare questo prodotto?")) return;
    const { error } = await supabase.from("breakfast_products").delete().eq("id", id);
    if (error) { showToast("Errore eliminazione", "error"); return; }
    setProducts((prev) => prev.filter((p) => p.id !== id));
    showToast("Prodotto eliminato");
  }

  async function toggleBuffet(id: string, current: boolean) {
    const { error } = await supabase.from("breakfast_products").update({ is_on_buffet: !current }).eq("id", id);
    if (error) { showToast("Errore", "error"); return; }
    setProducts((prev) => prev.map((p) => p.id === id ? { ...p, is_on_buffet: !current } : p));
  }

  function openNew() { setEditId(null); setForm({ ...emptyForm }); setShowModal(true); }
  function openEdit(p: Product) {
    setEditId(p.id);
    setForm({ name: p.name, name_en: p.name_en ?? "", name_de: p.name_de ?? "", category: p.category, allergens: [...p.allergens], may_contain: [...p.may_contain], is_on_buffet: p.is_on_buffet, notes: p.notes ?? "" });
    setShowModal(true);
  }
  function closeModal() { setShowModal(false); setEditId(null); setForm({ ...emptyForm }); }

  function toggleFormAllergen(slug: string, field: "allergens" | "may_contain") {
    setForm((prev) => {
      const arr = prev[field];
      return { ...prev, [field]: arr.includes(slug) ? arr.filter((s) => s !== slug) : [...arr, slug] };
    });
  }

  function toggleGuestAllergen(slug: string) {
    setGuestAllergens((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug); else next.add(slug);
      return next;
    });
  }

  /* ── QR ── */
  async function generateQR() {
    const origin = window.location.origin;
    const { data } = await supabase.from("allergen_guest_tokens").select("token").eq("active", true).limit(1).single();
    const token = data?.token ?? "public";
    const url = `${origin}/menu-allergeni?token=${token}`;
    const dataUrl = await QRCode.toDataURL(url, { width: 400, margin: 2, color: { dark: "#1F3326", light: "#FAF9F5" } });
    setQrDataUrl(dataUrl);
    setShowQR(true);
  }

  /* ── PDF Ufficiale ── */
  async function generateOfficialPDF() {
    const icons = await renderAllergenIconsToPng(64);
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const margin = 12;
    const pageW = 297;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor("#1F3326");
    doc.text("LE 4 CAMERE HOTEL ***", margin, margin + 6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text("Registro Allergeni -- Colazione", margin + 75, margin + 6);

    doc.setFontSize(9);
    doc.setTextColor("#6C6B5D");
    doc.text("Conforme al Regolamento UE 1169/2011", margin, margin + 12);
    doc.text(`Generato il ${new Date().toLocaleDateString("it-IT")}`, pageW - margin, margin + 12, { align: "right" });

    doc.setDrawColor("#BFA762");
    doc.setLineWidth(0.5);
    doc.line(margin, margin + 15, pageW - margin, margin + 15);

    const buffetProducts = products.filter((p) => p.is_on_buffet);
    const allergenCols = ALLERGENI.map((a) => a.it.substring(0, 6));
    const head = [["Prodotto", "Cat.", ...allergenCols]];

    const cellStatus: (string | null)[][] = [];
    const body = buffetProducts.map((p) => {
      const row = ALLERGENI.map((a) => {
        if (p.allergens.includes(a.slug)) return "contains";
        if (p.may_contain.includes(a.slug)) return "traces";
        return null;
      });
      cellStatus.push(row);
      return [
        p.name,
        BREAKFAST_CATEGORIES.find((c) => c.value === p.category)?.label ?? p.category,
        ...ALLERGENI.map(() => ""),
      ];
    });

    autoTable(doc, {
      startY: margin + 18,
      margin: { left: margin, right: margin },
      head,
      body,
      styles: { fontSize: 7, cellPadding: 2, lineColor: "#D8CCB8", lineWidth: 0.15, font: "helvetica", halign: "center" },
      headStyles: { fillColor: "#1F3326", textColor: "#FAF9F5", fontStyle: "bold", fontSize: 6, cellPadding: { top: 7, bottom: 2, left: 1, right: 1 } },
      columnStyles: { 0: { halign: "left", cellWidth: 35, fontStyle: "bold" }, 1: { cellWidth: 15 } },
      alternateRowStyles: { fillColor: "#FAFAF7" },
      didDrawCell(hookData) {
        if (hookData.section === "head" && hookData.column.index >= 2) {
          const aIdx = hookData.column.index - 2;
          const iconData = icons.get(ALLERGENI[aIdx].slug);
          if (iconData) {
            const iS = 4;
            const iX = hookData.cell.x + (hookData.cell.width - iS) / 2;
            const iY = hookData.cell.y + 1.5;
            doc.addImage(iconData, "PNG", iX, iY, iS, iS);
          }
        }
        if (hookData.section === "body" && hookData.column.index >= 2) {
          const rIdx = hookData.row.index;
          const cIdx = hookData.column.index - 2;
          const status = cellStatus[rIdx]?.[cIdx];
          if (status) {
            const cx = hookData.cell.x + hookData.cell.width / 2;
            const cy = hookData.cell.y + hookData.cell.height / 2;
            const allergen = ALLERGENI[cIdx];
            if (status === "contains") {
              doc.setFillColor(allergen.color);
              doc.circle(cx, cy, 1.6, "F");
            } else {
              doc.setDrawColor(allergen.color);
              doc.setLineWidth(0.4);
              doc.circle(cx, cy, 1.4, "S");
            }
          }
        }
      },
    });

    const finalY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    doc.setFontSize(8);
    doc.setTextColor("#6C6B5D");

    doc.setFillColor("#C4453C");
    doc.circle(margin + 2, finalY - 0.8, 1.4, "F");
    doc.text("= Contiene", margin + 5, finalY);

    doc.setDrawColor("#BFA762");
    doc.setLineWidth(0.4);
    doc.circle(margin + 32, finalY - 0.8, 1.2, "S");
    doc.text("= Tracce possibili", margin + 35, finalY);

    doc.text("Documento conforme al Regolamento UE 1169/2011", margin, finalY + 5);

    doc.save("registro-allergeni-colazione.pdf");
    showToast("PDF registro generato");
  }

  /* ── Cartellini Buffet PDF ── */
  async function generateBuffetCards() {
    const icons = await renderAllergenIconsToPng(64);
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const buffetProducts = products.filter((p) => p.is_on_buffet);
    const cardW = 85;
    const cardH = 55;
    const marginX = 20;
    const marginY = 15;
    const cols = 2;
    const gap = 5;

    buffetProducts.forEach((p, idx) => {
      if (idx > 0 && idx % 8 === 0) doc.addPage();
      const pageIdx = idx % 8;
      const col = pageIdx % cols;
      const row = Math.floor(pageIdx / cols);
      const x = marginX + col * (cardW + gap);
      const y = marginY + row * (cardH + gap);

      doc.setDrawColor("#BFA762");
      doc.setLineWidth(0.8);
      doc.setFillColor("#FAF9F5");
      doc.roundedRect(x, y, cardW, cardH, 3, 3, "FD");

      doc.setDrawColor("#BFA762");
      doc.setLineWidth(0.3);
      doc.line(x + 3, y + 15, x + cardW - 3, y + 15);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor("#1F3326");
      doc.text(p.name, x + cardW / 2, y + 10, { align: "center", maxWidth: cardW - 8 });

      if (p.name_en || p.name_de) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor("#6C6B5D");
        const intl = [p.name_en, p.name_de].filter(Boolean).join(" / ");
        doc.text(intl, x + cardW / 2, y + 14, { align: "center", maxWidth: cardW - 8 });
      }

      if (p.allergens.length > 0) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor("#C4453C");
        doc.text("CONTIENE:", x + 4, y + 20);

        const icoS = 3.8;
        const icoGap = 0.8;
        let icoX = x + 4;
        for (const slug of p.allergens) {
          const iconData = icons.get(slug);
          if (iconData && icoX + icoS < x + cardW - 4) {
            doc.addImage(iconData, "PNG", icoX, y + 22, icoS, icoS);
            icoX += icoS + icoGap;
          }
        }

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor("#1F3326");
        const allergenNames = p.allergens.map((s) => ALLERGENE_MAP.get(s)?.it ?? s).join(", ");
        const lines = doc.splitTextToSize(allergenNames, cardW - 8);
        doc.text(lines.slice(0, 2), x + 4, y + 30);
      } else {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor("#2d6a4f");
        doc.text("SENZA ALLERGENI", x + cardW / 2, y + 25, { align: "center" });
      }

      if (p.may_contain.length > 0) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(6.5);
        doc.setTextColor("#BFA762");
        const traces = p.may_contain.map((s) => ALLERGENE_MAP.get(s)?.it ?? s).join(", ");
        doc.text(`Tracce: ${traces}`, x + 4, y + cardH - 7, { maxWidth: cardW - 8 });
      }

      doc.setFont("helvetica", "normal");
      doc.setFontSize(5.5);
      doc.setTextColor("#D8CCB8");
      doc.text("Le 4 Camere Hotel ***", x + cardW / 2, y + cardH - 2, { align: "center" });
    });

    doc.save("cartellini-buffet-allergeni.pdf");
    showToast("Cartellini buffet generati");
  }

  /* ── Safe mode results ── */
  const safeProducts = products.filter((p) => p.is_on_buffet && !p.allergens.some((a) => guestAllergens.has(a)));
  const unsafeProducts = products.filter((p) => p.is_on_buffet && p.allergens.some((a) => guestAllergens.has(a)));
  const traceProducts = products.filter((p) => p.is_on_buffet && !p.allergens.some((a) => guestAllergens.has(a)) && p.may_contain.some((a) => guestAllergens.has(a)));

  if (roleLoading || !isManager) {
    return <div style={{ padding: 40, textAlign: "center", color: "#6C6B5D", fontFamily: "'Albert Sans', sans-serif" }}>Caricamento...</div>;
  }

  return (
    <>
      {/* ── Header ── */}
      <div className="al-header">
        <div className="al-header-top">
          <div>
            <h1 className="al-title">Allergeni Colazione</h1>
            <p className="al-subtitle">Gestione allergeni conforme al Reg. UE 1169/2011</p>
          </div>
          <div className="al-header-actions">
            <button className="al-btn al-btn-primary" onClick={openNew}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
              Nuovo prodotto
            </button>
            <button className="al-btn al-btn-outline" onClick={generateQR}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/><path d="M21 14h-3v3M21 17v4h-4"/></svg>
              QR Ospiti
            </button>
            <button className="al-btn al-btn-outline" onClick={generateOfficialPDF}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7z"/><path d="M14 2v4a2 2 0 002 2h4"/></svg>
              PDF ufficiale
            </button>
            <button className="al-btn al-btn-outline" onClick={generateBuffetCards}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
              Cartellini buffet
            </button>
          </div>
        </div>
      </div>

      {/* ── KPI ── */}
      <div className="al-kpi-row">
        {[
          { label: "Prodotti colazione", value: totalProducts, borderColor: "#1F3326", iconBg: "rgba(31,51,38,0.08)", icon: <path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>, iconStroke: "#1F3326" },
          { label: "Sul buffet", value: onBuffet, borderColor: "#BFA762", iconBg: "rgba(191,167,98,0.12)", icon: <><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 2v5M8 2v5M2 12h20"/></>, iconStroke: "#BFA762" },
          { label: "Senza glutine", value: glutenFree, borderColor: "#2d6a4f", iconBg: "rgba(45,106,79,0.10)", icon: <path d={getAllergeneSvgPath("glutine")}/>, iconStroke: "#2d6a4f", badge: true },
          { label: "Senza lattosio", value: lactoseFree, borderColor: "#3b82f6", iconBg: "rgba(59,130,246,0.10)", icon: <path d={getAllergeneSvgPath("latte")}/>, iconStroke: "#3b82f6" },
          { label: "Allergeni presenti", value: `${allergensPresent}/14`, borderColor: "#C4453C", iconBg: "rgba(196,69,60,0.10)", icon: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></>, iconStroke: "#C4453C" },
        ].map((kpi) => (
          <div key={kpi.label} className="al-kpi" style={{ borderTopColor: kpi.borderColor }}>
            <div className="al-kpi-icon" style={{ background: kpi.iconBg }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={kpi.iconStroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{kpi.icon}</svg>
            </div>
            <div className="al-kpi-num">{kpi.value}</div>
            <div className="al-kpi-label">{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* ── Matrice Interattiva ── */}
      <div className="al-section">
        <div className="al-section-header">
          <h2 className="al-section-title">Matrice Allergeni</h2>
          <div className="al-matrix-controls">
            <label className="al-toggle-label">
              <input type="checkbox" checked={buffetOnly} onChange={() => setBuffetOnly(!buffetOnly)} />
              <span>Solo buffet attivo</span>
            </label>
          </div>
        </div>

        <div className="al-filter-pills">
          <button className={`al-pill ${matrixFilter === null ? "active" : ""}`} onClick={() => setMatrixFilter(null)}>Tutti</button>
          {ALLERGENI.filter((a) => products.some((p) => p.allergens.includes(a.slug))).map((a) => (
            <button key={a.slug} className={`al-pill ${matrixFilter === a.slug ? "active" : ""}`} onClick={() => setMatrixFilter(matrixFilter === a.slug ? null : a.slug)} style={matrixFilter === a.slug ? { background: a.color, borderColor: a.color, color: "#fff" } : undefined}>
              <AllergenIcon slug={a.slug} size={14} active />
              {a.it}
            </button>
          ))}
        </div>

        <div className="al-matrix-wrap">
          <table className="al-matrix">
            <thead>
              <tr>
                <th className="al-matrix-th-name">Prodotto</th>
                {ALLERGENI.map((a) => (
                  <th key={a.slug} className="al-matrix-th-allergen" title={a.it}>
                    <div className="al-matrix-th-icon">
                      <AllergenIcon slug={a.slug} size={18} active />
                    </div>
                    <span className="al-matrix-th-label">{a.it.substring(0, 5)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayProducts.map((p, i) => {
                const dimmed = matrixFilter !== null && !p.allergens.includes(matrixFilter) && !p.may_contain.includes(matrixFilter);
                return (
                  <tr key={p.id} className={`al-matrix-row ${dimmed ? "dimmed" : ""}`} style={{ animationDelay: `${i * 0.02}s` }} onClick={() => openEdit(p)}>
                    <td className="al-matrix-td-name">
                      <span className="al-matrix-pname">{p.name}</span>
                      {!p.is_on_buffet && <span className="al-off-badge">OFF</span>}
                    </td>
                    {ALLERGENI.map((a) => {
                      const has = p.allergens.includes(a.slug);
                      const trace = p.may_contain.includes(a.slug);
                      return (
                        <td key={a.slug} className="al-matrix-td-cell">
                          {has ? (
                            <span className="al-cell-dot" style={{ background: a.color }} title={`Contiene ${a.it}`} />
                          ) : trace ? (
                            <span className="al-cell-trace" style={{ borderColor: "#BFA762" }} title={`Può contenere ${a.it}`} />
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="al-matrix-legend">
          <span><span className="al-cell-dot" style={{ background: "#1F3326", display: "inline-block" }} /> Contiene</span>
          <span><span className="al-cell-trace" style={{ borderColor: "#BFA762", display: "inline-block" }} /> Può contenere tracce</span>
        </div>
      </div>

      {/* ── Menu Sicuro ── */}
      <div className="al-section">
        <div className="al-section-header">
          <h2 className="al-section-title">Menu Sicuro</h2>
          <button className={`al-btn al-btn-outline ${safeMode ? "al-active" : ""}`} onClick={() => setSafeMode(!safeMode)} style={{ fontSize: 12, padding: "6px 14px" }}>
            {safeMode ? "Chiudi" : "Apri filtro ospite"}
          </button>
        </div>

        {safeMode && (
          <div className="al-safe-panel">
            <p className="al-safe-desc">Seleziona gli allergeni dell'ospite per vedere i prodotti sicuri</p>
            <div className="al-safe-grid">
              {ALLERGENI.map((a) => (
                <button key={a.slug} className={`al-safe-allergen ${guestAllergens.has(a.slug) ? "selected" : ""}`} onClick={() => toggleGuestAllergen(a.slug)} style={guestAllergens.has(a.slug) ? { borderColor: a.color, background: `${a.color}12` } : undefined}>
                  <AllergenIcon slug={a.slug} size={22} active={guestAllergens.has(a.slug)} />
                  <span>{a.it}</span>
                </button>
              ))}
            </div>

            {guestAllergens.size > 0 && (
              <div className="al-safe-results">
                <div className="al-safe-section al-safe-ok">
                  <div className="al-safe-section-head">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2d6a4f" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
                    <span>Può mangiare in sicurezza ({safeProducts.length})</span>
                  </div>
                  <div className="al-safe-list">
                    {safeProducts.map((p) => (
                      <span key={p.id} className="al-safe-item al-safe-item-ok">{p.name}</span>
                    ))}
                  </div>
                </div>
                {unsafeProducts.length > 0 && (
                  <div className="al-safe-section al-safe-no">
                    <div className="al-safe-section-head">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C4453C" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                      <span>Da evitare ({unsafeProducts.length})</span>
                    </div>
                    <div className="al-safe-list">
                      {unsafeProducts.map((p) => (
                        <span key={p.id} className="al-safe-item al-safe-item-no">
                          {p.name}
                          <span className="al-safe-item-why">
                            {p.allergens.filter((a) => guestAllergens.has(a)).map((a) => ALLERGENE_MAP.get(a)?.it).join(", ")}
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {traceProducts.length > 0 && (
                  <div className="al-safe-section al-safe-warn">
                    <div className="al-safe-section-head">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#BFA762" strokeWidth="2" strokeLinecap="round"><path d="m21.73 18-8-14a2 2 0 00-3.48 0l-8 14A2 2 0 004 21h16a2 2 0 001.73-3z"/><path d="M12 9v4M12 17h.01"/></svg>
                      <span>Attenzione — tracce ({traceProducts.length})</span>
                    </div>
                    <div className="al-safe-list">
                      {traceProducts.map((p) => (
                        <span key={p.id} className="al-safe-item al-safe-item-warn">{p.name}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Prodotti Grid ── */}
      <div className="al-section">
        <div className="al-section-header">
          <h2 className="al-section-title">Prodotti Colazione</h2>
          <span className="al-section-count">{products.length} prodotti</span>
        </div>
        {loading ? (
          <div className="al-empty">Caricamento...</div>
        ) : (
          <div className="al-products-grid">
            {products.map((p) => (
              <div key={p.id} className={`al-product-card ${!p.is_on_buffet ? "al-product-off" : ""}`}>
                <div className="al-product-top">
                  <div>
                    <div className="al-product-name">{p.name}</div>
                    {(p.name_en || p.name_de) && (
                      <div className="al-product-intl">{[p.name_en, p.name_de].filter(Boolean).join(" · ")}</div>
                    )}
                  </div>
                  <span className="al-product-cat">{BREAKFAST_CATEGORIES.find((c) => c.value === p.category)?.label ?? p.category}</span>
                </div>
                <div className="al-product-allergens">
                  {p.allergens.length === 0 && p.may_contain.length === 0 ? (
                    <span className="al-product-free">Senza allergeni</span>
                  ) : (
                    <>
                      {p.allergens.map((s) => <AllergenIcon key={s} slug={s} size={18} active />)}
                      {p.may_contain.map((s) => <AllergenIcon key={`t-${s}`} slug={s} size={16} active dashed />)}
                    </>
                  )}
                </div>
                <div className="al-product-footer">
                  <button className={`al-buffet-toggle ${p.is_on_buffet ? "on" : "off"}`} onClick={() => toggleBuffet(p.id, p.is_on_buffet)}>
                    {p.is_on_buffet ? "Sul buffet" : "Non attivo"}
                  </button>
                  <div className="al-product-actions">
                    <button className="al-act-btn" onClick={() => openEdit(p)} title="Modifica">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 3a2.85 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5z"/></svg>
                    </button>
                    <button className="al-act-btn al-act-danger" onClick={() => del(p.id)} title="Elimina">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── New/Edit Modal ── */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-card al-modal" onClick={(e) => e.stopPropagation()}>
            <div className="al-modal-header">
              <h2>{editId ? "Modifica prodotto" : "Nuovo prodotto"}</h2>
              <button className="al-btn al-btn-outline" style={{ padding: "6px 14px", fontSize: 13 }} onClick={closeModal}>Chiudi</button>
            </div>
            <div className="al-modal-body">
              <div className="al-modal-grid">
                <div className="field">
                  <label className="al-label">Nome IT *</label>
                  <input className="al-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Es. Cornetto..." />
                </div>
                <div className="field">
                  <label className="al-label">Nome EN</label>
                  <input className="al-input" value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} placeholder="Croissant..." />
                </div>
                <div className="field">
                  <label className="al-label">Nome DE</label>
                  <input className="al-input" value={form.name_de} onChange={(e) => setForm({ ...form, name_de: e.target.value })} placeholder="Croissant..." />
                </div>
                <div className="field">
                  <label className="al-label">Categoria</label>
                  <select className="al-input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                    {BREAKFAST_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="al-modal-section">
                <label className="al-label">Allergeni presenti</label>
                <div className="al-allergen-grid">
                  {ALLERGENI.map((a) => {
                    const sel = form.allergens.includes(a.slug);
                    return (
                      <button key={a.slug} type="button" className={`al-allergen-btn ${sel ? "selected" : ""}`} onClick={() => toggleFormAllergen(a.slug, "allergens")} style={sel ? { borderColor: a.color, background: `${a.color}15`, boxShadow: `0 0 12px ${a.color}30` } : undefined}>
                        <AllergenIcon slug={a.slug} size={22} active={sel} />
                        <span className="al-allergen-btn-label">{a.it}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="al-modal-section">
                <label className="al-label">Può contenere tracce di</label>
                <div className="al-allergen-grid">
                  {ALLERGENI.map((a) => {
                    const sel = form.may_contain.includes(a.slug);
                    return (
                      <button key={a.slug} type="button" className={`al-allergen-btn al-trace-btn ${sel ? "selected" : ""}`} onClick={() => toggleFormAllergen(a.slug, "may_contain")} style={sel ? { borderColor: "#BFA762", background: "rgba(191,167,98,0.08)" } : undefined}>
                        <AllergenIcon slug={a.slug} size={20} active={sel} dashed />
                        <span className="al-allergen-btn-label">{a.it}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="al-modal-grid" style={{ marginTop: 16 }}>
                <label className="al-toggle-label">
                  <input type="checkbox" checked={form.is_on_buffet} onChange={() => setForm({ ...form, is_on_buffet: !form.is_on_buffet })} />
                  <span>Attualmente sul buffet</span>
                </label>
                <div className="field" style={{ gridColumn: "1/-1" }}>
                  <label className="al-label">Note</label>
                  <textarea className="al-input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Note aggiuntive..." />
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                <button className="al-btn al-btn-primary" onClick={save} disabled={saving} style={{ padding: "12px 28px" }}>
                  {saving ? "Salvataggio..." : editId ? "Aggiorna" : "Salva prodotto"}
                </button>
                <button className="al-btn al-btn-outline" onClick={closeModal} style={{ padding: "12px 28px" }}>Annulla</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── QR Modal ── */}
      {showQR && (
        <div className="modal-overlay" onClick={() => setShowQR(false)}>
          <div className="modal-card al-qr-modal" onClick={(e) => e.stopPropagation()}>
            <div className="al-modal-header">
              <h2>QR Code Ospiti</h2>
              <button className="al-btn al-btn-outline" style={{ padding: "6px 14px", fontSize: 13 }} onClick={() => setShowQR(false)}>Chiudi</button>
            </div>
            <div className="al-qr-body">
              <p className="al-qr-desc">Stampa questo QR e posizionalo sul buffet. Gli ospiti possono scansionarlo per visualizzare gli allergeni nella loro lingua.</p>
              {qrDataUrl && (
                <div className="al-qr-img-wrap">
                  <img src={qrDataUrl} alt="QR Code allergeni" className="al-qr-img" />
                  <div className="al-qr-hotel">Le 4 Camere Hotel ★★★</div>
                  <div className="al-qr-label">Informazioni Allergeni Colazione</div>
                </div>
              )}
              <div className="al-qr-actions">
                <button className="al-btn al-btn-primary" onClick={() => {
                  const a = document.createElement("a");
                  a.href = qrDataUrl;
                  a.download = "qr-allergeni-colazione.png";
                  a.click();
                }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Scarica QR
                </button>
                <button className="al-btn al-btn-outline" onClick={() => {
                  const w = window.open();
                  if (w) {
                    w.document.write(`<html><head><title>QR Allergeni</title><style>body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:serif;background:#FAF9F5}img{width:300px}h2{color:#1F3326;margin:20px 0 4px}p{color:#6C6B5D;font-size:14px}</style></head><body><h2>Le 4 Camere Hotel ★★★</h2><p>Informazioni Allergeni Colazione</p><img src="${qrDataUrl}" /><p style="margin-top:20px;font-size:12px">Scansiona il QR code</p></body></html>`);
                    w.document.close();
                    w.print();
                  }
                }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                  Stampa QR
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <canvas ref={qrCanvasRef} style={{ display: "none" }} />
      <Toast toast={toast} />

      <style>{`
        .wrap:has(.al-header){max-width:none;padding-left:24px;padding-right:24px}
        @media(min-width:1024px){.wrap:has(.al-header){padding-left:32px;padding-right:32px}}

        .al-header{margin-bottom:28px}
        .al-header-top{display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:16px}
        .al-title{font-family:'Fraunces',serif;font-size:28px;font-weight:500;color:#1F3326;margin:0;letter-spacing:-0.3px}
        .al-subtitle{font-size:14px;color:#888;margin:6px 0 0;font-family:'Albert Sans',sans-serif}
        .al-header-actions{display:flex;gap:8px;flex-wrap:wrap}

        .al-btn{display:inline-flex;align-items:center;gap:6px;font-family:'Albert Sans',sans-serif;font-size:13px;font-weight:600;border-radius:8px;padding:9px 16px;cursor:pointer;transition:all .2s;border:none}
        .al-btn-primary{background:#1F3326;color:#fff}
        .al-btn-primary:hover{background:#2a4535;transform:translateY(-1px);box-shadow:0 4px 12px rgba(31,51,38,0.18)}
        .al-btn-primary:disabled{opacity:.6;cursor:not-allowed;transform:none}
        .al-btn-outline{background:#fff;color:#1F3326;border:1px solid #D8CCB8}
        .al-btn-outline:hover{background:#F3EBDD;border-color:#BFA762}
        .al-btn-outline.al-active{background:#F3EBDD;border-color:#BFA762}

        .al-kpi-row{display:grid;grid-template-columns:repeat(5,1fr);gap:14px;margin-bottom:24px}
        .al-kpi{background:#fff;border-radius:16px;padding:18px;border-top:3px solid;box-shadow:0 1px 3px rgba(31,51,38,0.04),0 4px 12px rgba(31,51,38,0.03);transition:transform .25s,box-shadow .25s}
        .al-kpi:hover{transform:translateY(-3px);box-shadow:0 4px 8px rgba(31,51,38,0.06),0 12px 28px rgba(31,51,38,0.08)}
        .al-kpi-icon{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:10px;margin-bottom:8px}
        .al-kpi-num{font-family:'Fraunces',serif;font-size:28px;font-weight:600;color:#1F3326;line-height:1.1}
        .al-kpi-label{font-family:'Albert Sans',sans-serif;font-size:11px;font-weight:600;color:#6C6B5D;margin-top:4px;text-transform:uppercase;letter-spacing:.5px}

        .al-section{background:#fff;border-radius:16px;padding:20px;margin-bottom:20px;box-shadow:0 1px 3px rgba(31,51,38,0.04),0 4px 12px rgba(31,51,38,0.03)}
        .al-section-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px}
        .al-section-title{font-family:'Fraunces',serif;font-size:20px;font-weight:500;color:#1F3326;margin:0}
        .al-section-count{font-family:'Albert Sans',sans-serif;font-size:13px;color:#6C6B5D;font-weight:600}

        .al-toggle-label{display:flex;align-items:center;gap:8px;font-family:'Albert Sans',sans-serif;font-size:13px;color:#1F3326;cursor:pointer}
        .al-toggle-label input{accent-color:#1F3326;width:16px;height:16px}

        /* ── Filter pills ── */
        .al-filter-pills{display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap}
        .al-pill{display:inline-flex;align-items:center;gap:5px;padding:6px 12px;border-radius:20px;border:1px solid #D8CCB8;background:#fff;font-family:'Albert Sans',sans-serif;font-size:12px;font-weight:600;color:#1F3326;cursor:pointer;transition:all .15s}
        .al-pill:hover{background:#F3EBDD;border-color:#BFA762}
        .al-pill.active{background:#1F3326;border-color:#1F3326;color:#fff}

        /* ── Matrix ── */
        .al-matrix-wrap{overflow-x:auto;border-radius:12px;border:1px solid #eee}
        .al-matrix{width:100%;border-collapse:collapse;font-family:'Albert Sans',sans-serif}
        .al-matrix thead{position:sticky;top:0;z-index:2}
        .al-matrix-th-name{text-align:left;padding:10px 14px;background:#F3EBDD;font-size:12px;font-weight:700;color:#6C6B5D;text-transform:uppercase;letter-spacing:.5px;min-width:160px;position:sticky;left:0;z-index:3}
        .al-matrix-th-allergen{padding:8px 4px;background:#F3EBDD;text-align:center;min-width:44px;vertical-align:bottom}
        .al-matrix-th-icon{display:flex;justify-content:center;margin-bottom:4px}
        .al-matrix-th-label{font-size:8px;font-weight:700;color:#6C6B5D;text-transform:uppercase;letter-spacing:.3px}
        .al-matrix-row{transition:opacity .25s,background .12s;animation:alFadeRow .3s ease both;cursor:pointer}
        .al-matrix-row:hover{background:#FAFAF7}
        .al-matrix-row.dimmed{opacity:.2}
        .al-matrix-td-name{padding:10px 14px;font-size:13px;font-weight:500;color:#1F3326;border-bottom:1px solid #f0ede8;white-space:nowrap;position:sticky;left:0;background:#fff;z-index:1}
        .al-matrix-row:hover .al-matrix-td-name{background:#FAFAF7}
        .al-matrix-pname{font-weight:600}
        .al-off-badge{display:inline-block;margin-left:6px;font-size:9px;font-weight:700;padding:2px 6px;border-radius:10px;background:#f0ede8;color:#6C6B5D}
        .al-matrix-td-cell{padding:8px 4px;text-align:center;border-bottom:1px solid #f0ede8}
        .al-cell-dot{width:14px;height:14px;border-radius:50%;display:inline-block;transition:transform .2s}
        .al-matrix-row:hover .al-cell-dot{transform:scale(1.2)}
        .al-cell-trace{width:12px;height:12px;border-radius:50%;display:inline-block;border:2px dashed;background:transparent}
        .al-matrix-legend{display:flex;gap:20px;margin-top:12px;font-family:'Albert Sans',sans-serif;font-size:12px;color:#6C6B5D;align-items:center}
        .al-matrix-legend .al-cell-dot{width:10px;height:10px;margin-right:4px;vertical-align:middle}
        .al-matrix-legend .al-cell-trace{width:10px;height:10px;margin-right:4px;vertical-align:middle}

        /* ── Safe mode ── */
        .al-safe-panel{padding:16px 0 0}
        .al-safe-desc{font-family:'Albert Sans',sans-serif;font-size:13px;color:#6C6B5D;margin:0 0 14px}
        .al-safe-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;margin-bottom:20px}
        .al-safe-allergen{display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:10px;border:2px solid #eee;background:#fff;font-family:'Albert Sans',sans-serif;font-size:12px;font-weight:500;color:#1F3326;cursor:pointer;transition:all .2s}
        .al-safe-allergen:hover{border-color:#D8CCB8}
        .al-safe-allergen.selected{border-width:2px;font-weight:700}
        .al-safe-results{display:flex;flex-direction:column;gap:12px}
        .al-safe-section{border-radius:12px;padding:14px;border-left:4px solid}
        .al-safe-ok{background:#f0fdf4;border-left-color:#2d6a4f}
        .al-safe-no{background:#FDF2F2;border-left-color:#C4453C}
        .al-safe-warn{background:#FDF8EC;border-left-color:#BFA762}
        .al-safe-section-head{display:flex;align-items:center;gap:8px;font-family:'Albert Sans',sans-serif;font-size:14px;font-weight:700;color:#1F3326;margin-bottom:10px}
        .al-safe-list{display:flex;flex-wrap:wrap;gap:6px}
        .al-safe-item{display:inline-flex;align-items:center;gap:4px;padding:5px 12px;border-radius:20px;font-family:'Albert Sans',sans-serif;font-size:12px;font-weight:600}
        .al-safe-item-ok{background:#dcfce7;color:#166534}
        .al-safe-item-no{background:#fecaca;color:#991b1b;flex-direction:column;align-items:flex-start;gap:2px}
        .al-safe-item-warn{background:#fef3c7;color:#92400e}
        .al-safe-item-why{font-size:10px;font-weight:400;opacity:.8}

        /* ── Products Grid ── */
        .al-products-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px}
        .al-product-card{background:#fff;border:1px solid #eee;border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:10px;transition:transform .2s,box-shadow .2s;box-shadow:0 2px 8px rgba(31,51,38,0.04)}
        .al-product-card:hover{transform:translateY(-2px);box-shadow:0 4px 16px rgba(31,51,38,0.08)}
        .al-product-off{opacity:.6}
        .al-product-top{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}
        .al-product-name{font-family:'Albert Sans',sans-serif;font-size:15px;font-weight:600;color:#1F3326}
        .al-product-intl{font-size:11px;color:#6C6B5D;margin-top:2px}
        .al-product-cat{font-size:10px;font-weight:700;padding:3px 10px;border-radius:20px;background:#F3EBDD;color:#6C6B5D;text-transform:uppercase;letter-spacing:.3px;white-space:nowrap}
        .al-product-allergens{display:flex;gap:4px;flex-wrap:wrap;align-items:center;min-height:24px}
        .al-product-free{font-size:11px;font-weight:700;color:#2d6a4f;background:#dcfce7;padding:3px 10px;border-radius:20px}
        .al-product-footer{display:flex;align-items:center;justify-content:space-between}
        .al-buffet-toggle{border:none;padding:4px 12px;border-radius:16px;font-family:'Albert Sans',sans-serif;font-size:11px;font-weight:700;cursor:pointer;transition:all .15s}
        .al-buffet-toggle.on{background:#dcfce7;color:#166534}
        .al-buffet-toggle.off{background:#f0ede8;color:#6C6B5D}
        .al-product-actions{display:flex;gap:4px}
        .al-act-btn{display:flex;align-items:center;justify-content:center;width:30px;height:30px;border:none;background:transparent;border-radius:8px;cursor:pointer;color:#6C6B5D;transition:all .12s}
        .al-act-btn:hover{background:#F3EBDD;color:#1F3326}
        .al-act-danger:hover{background:#FDF2F2;color:#C4453C}
        .al-empty{padding:40px;text-align:center;color:#6C6B5D;font-family:'Albert Sans',sans-serif}

        /* ── Modal ── */
        .al-modal{border-radius:16px;max-width:700px;max-height:90vh;overflow-y:auto}
        .al-modal-header{display:flex;align-items:center;justify-content:space-between;padding:20px 24px;border-bottom:1px solid #D8CCB8}
        .al-modal-header h2{font-family:'Fraunces',serif;font-size:20px;color:#1F3326;margin:0}
        .al-modal-body{padding:24px}
        .al-modal-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
        .al-modal-section{margin-top:20px}
        .al-label{display:block;font-family:'Albert Sans',sans-serif;font-size:12px;font-weight:700;color:#1F3326;margin-bottom:6px;text-transform:uppercase;letter-spacing:.3px}
        .al-input{width:100%;padding:10px 12px;border:1px solid #D8CCB8;border-radius:8px;font-family:'Albert Sans',sans-serif;font-size:14px;color:#1F3326;transition:border-color .2s;background:#fff;box-sizing:border-box}
        .al-input:focus{outline:none;border-color:#BFA762;box-shadow:0 0 0 3px rgba(191,167,98,0.12)}
        .al-allergen-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:6px}
        .al-allergen-btn{display:flex;align-items:center;gap:6px;padding:8px 10px;border-radius:10px;border:2px solid #eee;background:#fff;cursor:pointer;transition:all .2s;font-family:'Albert Sans',sans-serif}
        .al-allergen-btn:hover{border-color:#D8CCB8}
        .al-allergen-btn.selected{transform:scale(1.02)}
        .al-allergen-btn-label{font-size:11px;font-weight:600;color:#1F3326}

        /* ── QR Modal ── */
        .al-qr-modal{border-radius:16px;max-width:420px}
        .al-qr-body{padding:24px;text-align:center}
        .al-qr-desc{font-family:'Albert Sans',sans-serif;font-size:13px;color:#6C6B5D;margin:0 0 20px;line-height:1.5}
        .al-qr-img-wrap{background:#FAF9F5;border:2px solid #BFA762;border-radius:16px;padding:24px;display:inline-block;margin-bottom:20px}
        .al-qr-img{width:240px;height:240px;display:block;margin:0 auto}
        .al-qr-hotel{font-family:'Fraunces',serif;font-size:16px;color:#1F3326;margin-top:12px;font-weight:500}
        .al-qr-label{font-family:'Albert Sans',sans-serif;font-size:11px;color:#6C6B5D;margin-top:4px;text-transform:uppercase;letter-spacing:1px}
        .al-qr-actions{display:flex;gap:10px;justify-content:center}

        @keyframes alFadeRow{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}

        @media(max-width:1023px){
          .al-kpi-row{grid-template-columns:repeat(3,1fr)}
          .al-header-top{flex-direction:column}
        }
        @media(max-width:600px){
          .al-kpi-row{grid-template-columns:repeat(2,1fr);gap:10px}
          .al-products-grid{grid-template-columns:1fr}
          .al-header-actions{width:100%}
          .al-header-actions .al-btn{flex:1;justify-content:center;font-size:12px;padding:8px 10px}
          .al-allergen-grid{grid-template-columns:repeat(auto-fill,minmax(100px,1fr))}
          .al-modal-grid{grid-template-columns:1fr}
          .al-safe-grid{grid-template-columns:repeat(auto-fill,minmax(120px,1fr))}
        }
      `}</style>
    </>
  );
}
