"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { ALLERGENI, ALLERGENE_MAP, BREAKFAST_CATEGORIES, getAllergeneSvgPath } from "@/lib/allergeni";

export const dynamic = "force-dynamic";

type Lang = "it" | "en" | "de";

type Product = {
  id: string;
  name: string;
  name_en: string | null;
  name_de: string | null;
  category: string;
  allergens: string[];
  may_contain: string[];
  is_on_buffet: boolean;
};

const T: Record<string, Record<Lang, string>> = {
  title: { it: "Colazione — Informazioni Allergeni", en: "Breakfast — Allergen Information", de: "Frühstück — Allergeninformationen" },
  subtitle: { it: "Seleziona i tuoi allergeni per scoprire cosa puoi mangiare in sicurezza", en: "Select your allergens to discover what you can safely eat", de: "Wählen Sie Ihre Allergene aus, um zu erfahren, was Sie sicher essen können" },
  selectLabel: { it: "I miei allergeni", en: "My allergens", de: "Meine Allergene" },
  safe: { it: "Puoi mangiare in sicurezza", en: "Safe to eat", de: "Sicher zu essen" },
  avoid: { it: "Da evitare", en: "Avoid", de: "Vermeiden" },
  traces: { it: "Attenzione — possibili tracce", en: "Caution — possible traces", de: "Vorsicht — mögliche Spuren" },
  contains: { it: "Contiene", en: "Contains", de: "Enthält" },
  noAllergens: { it: "Senza allergeni", en: "Allergen free", de: "Allergenfrei" },
  disclaimer: { it: "Le informazioni sono fornite a scopo informativo. Per allergie gravi, si prega di informare il personale di sala. Regolamento UE 1169/2011.", en: "Information provided for guidance. For severe allergies, please inform the dining staff. EU Regulation 1169/2011.", de: "Informationen dienen der Orientierung. Bei schweren Allergien informieren Sie bitte das Servicepersonal. EU-Verordnung 1169/2011." },
  allProducts: { it: "Tutti i prodotti del buffet", en: "All buffet products", de: "Alle Buffetprodukte" },
  category: { it: "Categoria", en: "Category", de: "Kategorie" },
};

function AllergenIcon({ slug, size = 20, active = false }: { slug: string; size?: number; active?: boolean }) {
  const a = ALLERGENE_MAP.get(slug);
  if (!a) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={active ? a.color : "#D8CCB8"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ transition: "all .25s" }}>
      <path d={getAllergeneSvgPath(slug)} />
    </svg>
  );
}

function getName(p: Product, lang: Lang): string {
  if (lang === "en" && p.name_en) return p.name_en;
  if (lang === "de" && p.name_de) return p.name_de;
  return p.name;
}

function getAllergenName(slug: string, lang: Lang): string {
  const a = ALLERGENE_MAP.get(slug);
  if (!a) return slug;
  return a[lang];
}

function getCatLabel(cat: string, lang: Lang): string {
  const c = BREAKFAST_CATEGORIES.find((b) => b.value === cat);
  if (!c) return cat;
  if (lang === "en") return c.labelEn;
  if (lang === "de") return c.labelDe;
  return c.label;
}

export default function MenuAllergeniPage() {
  const [lang, setLang] = useState<Lang>("it");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("breakfast_products")
      .select("id,name,name_en,name_de,category,allergens,may_contain,is_on_buffet")
      .eq("is_on_buffet", true)
      .order("category")
      .order("name")
      .then(({ data }) => {
        setProducts((data ?? []) as Product[]);
        setLoading(false);
      });
  }, []);

  function toggleAllergen(slug: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug); else next.add(slug);
      return next;
    });
  }

  const safeProducts = products.filter((p) => !p.allergens.some((a) => selected.has(a)));
  const unsafeProducts = products.filter((p) => p.allergens.some((a) => selected.has(a)));
  const traceProducts = products.filter((p) => !p.allergens.some((a) => selected.has(a)) && p.may_contain.some((a) => selected.has(a)));

  const hasSelection = selected.size > 0;

  return (
    <div className="ma-page">
      {/* ── Lang Selector ── */}
      <div className="ma-lang-bar">
        {(["it", "en", "de"] as Lang[]).map((l) => (
          <button key={l} className={`ma-lang-btn ${lang === l ? "active" : ""}`} onClick={() => setLang(l)}>
            {l.toUpperCase()}
          </button>
        ))}
      </div>

      {/* ── Header ── */}
      <header className="ma-header">
        <div className="ma-logo">Le 4 Camere</div>
        <div className="ma-stars">★★★</div>
        <h1 className="ma-title">{T.title[lang]}</h1>
        <p className="ma-subtitle">{T.subtitle[lang]}</p>
      </header>

      {loading ? (
        <div className="ma-loading">Loading...</div>
      ) : (
        <>
          {/* ── Allergen Selection ── */}
          <section className="ma-section">
            <h2 className="ma-section-title">{T.selectLabel[lang]}</h2>
            <div className="ma-allergen-select">
              {ALLERGENI.map((a) => {
                const sel = selected.has(a.slug);
                return (
                  <button key={a.slug} className={`ma-allergen-chip ${sel ? "selected" : ""}`} onClick={() => toggleAllergen(a.slug)} style={sel ? { borderColor: a.color, background: `${a.color}12`, boxShadow: `0 0 16px ${a.color}25` } : undefined}>
                    <AllergenIcon slug={a.slug} size={24} active={sel} />
                    <span>{getAllergenName(a.slug, lang)}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* ── Results ── */}
          {hasSelection ? (
            <div className="ma-results">
              {/* Safe */}
              <section className="ma-result-section ma-result-safe">
                <div className="ma-result-header">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2d6a4f" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
                  <h3>{T.safe[lang]} ({safeProducts.length})</h3>
                </div>
                <div className="ma-product-list">
                  {safeProducts.map((p) => (
                    <div key={p.id} className="ma-product-card ma-card-safe">
                      <div className="ma-card-name">{getName(p, lang)}</div>
                      <div className="ma-card-cat">{getCatLabel(p.category, lang)}</div>
                      {p.allergens.length === 0 ? (
                        <div className="ma-card-free">{T.noAllergens[lang]}</div>
                      ) : (
                        <div className="ma-card-icons">
                          {p.allergens.map((s) => <AllergenIcon key={s} slug={s} size={16} active />)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              {/* Traces */}
              {traceProducts.length > 0 && (
                <section className="ma-result-section ma-result-warn">
                  <div className="ma-result-header">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#BFA762" strokeWidth="2" strokeLinecap="round"><path d="m21.73 18-8-14a2 2 0 00-3.48 0l-8 14A2 2 0 004 21h16a2 2 0 001.73-3z"/><path d="M12 9v4M12 17h.01"/></svg>
                    <h3>{T.traces[lang]} ({traceProducts.length})</h3>
                  </div>
                  <div className="ma-product-list">
                    {traceProducts.map((p) => (
                      <div key={p.id} className="ma-product-card ma-card-warn">
                        <div className="ma-card-name">{getName(p, lang)}</div>
                        <div className="ma-card-allergen-list">
                          {p.may_contain.filter((a) => selected.has(a)).map((a) => (
                            <span key={a} className="ma-card-tag ma-tag-warn">{getAllergenName(a, lang)}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Unsafe */}
              {unsafeProducts.length > 0 && (
                <section className="ma-result-section ma-result-danger">
                  <div className="ma-result-header">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#C4453C" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    <h3>{T.avoid[lang]} ({unsafeProducts.length})</h3>
                  </div>
                  <div className="ma-product-list">
                    {unsafeProducts.map((p) => (
                      <div key={p.id} className="ma-product-card ma-card-danger">
                        <div className="ma-card-name">{getName(p, lang)}</div>
                        <div className="ma-card-allergen-list">
                          {p.allergens.filter((a) => selected.has(a)).map((a) => (
                            <span key={a} className="ma-card-tag ma-tag-danger">{getAllergenName(a, lang)}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          ) : (
            /* ── All Products ── */
            <section className="ma-section">
              <h2 className="ma-section-title">{T.allProducts[lang]}</h2>
              <div className="ma-product-list ma-product-list-all">
                {products.map((p) => (
                  <div key={p.id} className="ma-product-card">
                    <div className="ma-card-top">
                      <div className="ma-card-name">{getName(p, lang)}</div>
                      <div className="ma-card-cat">{getCatLabel(p.category, lang)}</div>
                    </div>
                    {p.allergens.length === 0 && p.may_contain.length === 0 ? (
                      <div className="ma-card-free">{T.noAllergens[lang]}</div>
                    ) : (
                      <div className="ma-card-allergen-list">
                        {p.allergens.map((s) => (
                          <span key={s} className="ma-card-tag ma-tag-contains">
                            <AllergenIcon slug={s} size={12} active />
                            {getAllergenName(s, lang)}
                          </span>
                        ))}
                        {p.may_contain.map((s) => (
                          <span key={`t-${s}`} className="ma-card-tag ma-tag-warn">
                            <AllergenIcon slug={s} size={12} active />
                            {getAllergenName(s, lang)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Disclaimer ── */}
          <footer className="ma-disclaimer">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#BFA762" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
            <p>{T.disclaimer[lang]}</p>
          </footer>
        </>
      )}

      <style>{`
        .ma-page{min-height:100vh;background:#FAF9F5;font-family:'Albert Sans',sans-serif;padding:0 0 40px}

        .ma-lang-bar{display:flex;justify-content:center;gap:4px;padding:12px 16px;background:#1F3326}
        .ma-lang-btn{border:1px solid rgba(250,249,245,0.2);background:transparent;color:rgba(250,249,245,0.6);
          font-family:'Albert Sans',sans-serif;font-size:13px;font-weight:700;padding:6px 18px;border-radius:20px;
          cursor:pointer;transition:all .2s;letter-spacing:1px}
        .ma-lang-btn:hover{background:rgba(250,249,245,0.1);color:#FAF9F5}
        .ma-lang-btn.active{background:#BFA762;color:#1F3326;border-color:#BFA762}

        .ma-header{text-align:center;padding:32px 20px 24px;background:linear-gradient(180deg,#1F3326 0%,#2a4535 100%);color:#FAF9F5}
        .ma-logo{font-family:'Fraunces',serif;font-size:28px;font-weight:500;letter-spacing:-0.5px}
        .ma-stars{color:#BFA762;font-size:16px;margin:4px 0 16px;letter-spacing:3px}
        .ma-title{font-family:'Fraunces',serif;font-size:22px;font-weight:400;margin:0;opacity:.95}
        .ma-subtitle{font-size:13px;opacity:.7;margin:8px 0 0;max-width:400px;margin-left:auto;margin-right:auto;line-height:1.5}

        .ma-loading{text-align:center;padding:60px;color:#6C6B5D}

        .ma-section{padding:20px 16px}
        .ma-section-title{font-family:'Fraunces',serif;font-size:18px;font-weight:500;color:#1F3326;margin:0 0 14px;text-align:center}

        .ma-allergen-select{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;max-width:600px;margin:0 auto}
        .ma-allergen-chip{display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:12px;
          border:2px solid #eee;background:#fff;font-size:12px;font-weight:500;color:#1F3326;cursor:pointer;
          transition:all .25s cubic-bezier(.4,0,.2,1)}
        .ma-allergen-chip:hover{border-color:#D8CCB8}
        .ma-allergen-chip.selected{font-weight:700;transform:scale(1.03)}

        .ma-results{padding:0 16px}
        .ma-result-section{margin-bottom:16px;border-radius:14px;padding:16px;border-left:4px solid}
        .ma-result-safe{background:#f0fdf4;border-left-color:#2d6a4f}
        .ma-result-warn{background:#FDF8EC;border-left-color:#BFA762}
        .ma-result-danger{background:#FDF2F2;border-left-color:#C4453C}
        .ma-result-header{display:flex;align-items:center;gap:8px;margin-bottom:12px}
        .ma-result-header h3{font-family:'Fraunces',serif;font-size:16px;font-weight:500;color:#1F3326;margin:0}

        .ma-product-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px}
        .ma-product-list-all{max-width:600px;margin:0 auto}
        .ma-product-card{background:#fff;border-radius:10px;padding:12px;box-shadow:0 1px 4px rgba(31,51,38,0.06);
          transition:transform .2s;display:flex;flex-direction:column;gap:6px}
        .ma-product-card:hover{transform:translateY(-1px)}
        .ma-card-safe{border:1px solid #bbf7d0}
        .ma-card-warn{border:1px solid #fde68a}
        .ma-card-danger{border:1px solid #fecaca}
        .ma-card-top{display:flex;justify-content:space-between;align-items:flex-start;gap:6px}
        .ma-card-name{font-size:14px;font-weight:600;color:#1F3326}
        .ma-card-cat{font-size:9px;font-weight:700;padding:2px 8px;border-radius:12px;background:#F3EBDD;color:#6C6B5D;text-transform:uppercase;white-space:nowrap}
        .ma-card-free{font-size:11px;font-weight:700;color:#2d6a4f;background:#dcfce7;padding:2px 8px;border-radius:10px;display:inline-block}
        .ma-card-icons{display:flex;gap:3px;flex-wrap:wrap}
        .ma-card-allergen-list{display:flex;gap:4px;flex-wrap:wrap}
        .ma-card-tag{display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px}
        .ma-tag-contains{background:#fee2e2;color:#991b1b}
        .ma-tag-warn{background:#fef3c7;color:#92400e}
        .ma-tag-danger{background:#fecaca;color:#991b1b}

        .ma-disclaimer{display:flex;align-items:flex-start;gap:10px;padding:20px;margin:24px 16px 0;
          background:#fff;border-radius:12px;border:1px solid #D8CCB8}
        .ma-disclaimer p{font-size:11px;color:#6C6B5D;margin:0;line-height:1.6}
        .ma-disclaimer svg{flex-shrink:0;margin-top:2px}

        @media(max-width:500px){
          .ma-allergen-select{grid-template-columns:repeat(2,1fr)}
          .ma-product-list{grid-template-columns:1fr}
          .ma-title{font-size:18px}
        }
      `}</style>
    </div>
  );
}
