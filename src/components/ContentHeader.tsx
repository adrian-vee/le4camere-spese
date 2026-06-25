"use client";

import Link from "next/link";
import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";

type UserRole = "admin" | "manager" | "staff";

interface DbNotif {
  id: string;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
}

interface SearchResult { category: string; icon: React.ReactNode; label: string; sub?: string; href: string }

/* ── Static pages for instant search ── */
const PAGES: { label: string; sub: string; href: string; keywords: string[] }[] = [
  { label: "Panoramica", sub: "Dashboard principale", href: "/", keywords: ["panoramica", "dashboard", "home"] },
  { label: "Cassa", sub: "Sessioni e movimenti cassa", href: "/cassa", keywords: ["cassa", "contanti", "sessione"] },
  { label: "Turni", sub: "Calendario turni staff", href: "/turni", keywords: ["turni", "calendario", "orari"] },
  { label: "Magazzino", sub: "Prodotti e scorte", href: "/magazzino", keywords: ["magazzino", "scorte", "stock"] },
  { label: "Fornitori", sub: "Anagrafica fornitori", href: "/fornitori", keywords: ["fornitori", "fornitore"] },
  { label: "Inventario", sub: "Sessioni inventario", href: "/inventario", keywords: ["inventario", "conteggio"] },
  { label: "Spese", sub: "Registro spese", href: "/spese", keywords: ["spese", "costi", "fatture"] },
  { label: "POS Bar", sub: "Punto vendita bar", href: "/bar-admin", keywords: ["pos", "bar", "vendita", "punto vendita"] },
  { label: "Conti Camera", sub: "Addebiti su camera", href: "/bar-conti-camera", keywords: ["conti", "camera", "addebito"] },
  { label: "Storico Vendite", sub: "Archivio vendite bar", href: "/bar-storico", keywords: ["storico", "vendite", "archivio"] },
  { label: "Personale", sub: "Gestione staff", href: "/personale", keywords: ["personale", "staff", "dipendenti"] },
  { label: "Documenti", sub: "Archivio documenti", href: "/documenti", keywords: ["documenti", "file", "archivio"] },
  { label: "Utenze", sub: "Bollette e contratti", href: "/utenze", keywords: ["utenze", "bollette", "contratti", "luce", "gas", "acqua"] },
  { label: "Report", sub: "Report e analisi", href: "/report", keywords: ["report", "analisi"] },
  { label: "Statistiche", sub: "Grafici e KPI", href: "/statistiche", keywords: ["statistiche", "grafici", "kpi"] },
  { label: "Drink Lab", sub: "Ricette cocktail", href: "/drink-lab", keywords: ["drink", "lab", "cocktail", "ricette"] },
  { label: "Housekeeping", sub: "Pulizia camere", href: "/housekeeping", keywords: ["housekeeping", "pulizia", "camere"] },
  { label: "Impostazioni", sub: "Impostazioni account", href: "/impostazioni", keywords: ["impostazioni", "settings", "profilo"] },
];

const SEARCH_ICONS = {
  page: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 3v18M3 9h6"/></svg>,
  product: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>,
  supplier: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12h5l3-9 4 18 3-9h5"/></svg>,
  staff: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0112 0v1"/></svg>,
  expense: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>,
};

const TYPE_COLORS: Record<string, string> = {
  doc_expiring: "#C77B4A",
  product_expiring: "#C77B4A",
  low_stock: "#9E3B2E",
  availability_missing: "#C77B4A",
  availability_reminder: "#4F7B8C",
  inventory_reminder: "#BFA762",
  cassa_alert: "#BFA762",
};

const TYPE_ICONS: Record<string, string> = {
  doc_expiring: "📄",
  product_expiring: "📦",
  low_stock: "⚠️",
  availability_missing: "📅",
  availability_reminder: "📅",
  inventory_reminder: "📋",
  cassa_alert: "💰",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ora";
  if (mins < 60) return `${mins} min fa`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "ora" : "ore"} fa`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "giorno" : "giorni"} fa`;
}

function searchPages(q: string): SearchResult[] {
  const lower = q.toLowerCase();
  return PAGES
    .filter(p => p.label.toLowerCase().includes(lower) || p.keywords.some(k => k.includes(lower)))
    .slice(0, 3)
    .map(p => ({ category: "PAGINE", icon: SEARCH_ICONS.page, label: p.label, sub: p.sub, href: p.href }));
}

export default function ContentHeader({
  userRole = "staff",
  userName,
}: {
  userRole?: UserRole;
  userName?: string;
}) {
  const isManager = userRole === "admin" || userRole === "manager";
  const router = useRouter();
  const pathname = usePathname();
  const isDashboard = pathname === "/";

  const firstName = userName?.split(" ")[0] || "Utente";
  const now = new Date();
  const hour = now.getHours();
  const greetingText = hour < 14 ? "Buongiorno" : hour < 18 ? "Buon pomeriggio" : "Buonasera";
  const rawDate = now.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const greetingDate = rawDate.charAt(0).toUpperCase() + rawDate.slice(1);

  const [bellOpen, setBellOpen] = useState(false);
  const [dbNotifs, setDbNotifs] = useState<DbNotif[]>([]);
  const bellRef = useRef<HTMLDivElement>(null);

  const fetchNotifs = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setDbNotifs(data.notifications ?? []);
      }
    } catch { /* ignore */ }
  }, []);

  const triggerCheck = useCallback(async () => {
    const lastCheck = localStorage.getItem("notif_last_check");
    const now = Date.now();
    if (lastCheck && now - parseInt(lastCheck) < 30 * 60 * 1000) return;
    localStorage.setItem("notif_last_check", String(now));
    try {
      await fetch("/api/notifications/check", { method: "POST" });
      await fetchNotifs();
    } catch { /* ignore */ }
  }, [fetchNotifs]);

  useEffect(() => {
    fetchNotifs();
    triggerCheck();
    const interval = setInterval(fetchNotifs, 60000);
    return () => clearInterval(interval);
  }, [fetchNotifs, triggerCheck]);

  const markAsRead = async (notif: DbNotif) => {
    setDbNotifs(prev => prev.filter(n => n.id !== notif.id));
    setBellOpen(false);
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: notif.id }),
    });
    if (notif.link) router.push(notif.link);
  };

  const markAllRead = async () => {
    setDbNotifs([]);
    const res = await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAll: true }),
    });
    if (!res.ok) await fetchNotifs();
  };

  // Search
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false);
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
        setQuery("");
        setResults([]);
      }
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === "Escape") {
        setBellOpen(false);
        setSearchOpen(false);
        setQuery("");
        setResults([]);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setSearching(true);

    const pageResults = searchPages(q);

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      const items: SearchResult[] = [...pageResults];

      for (const p of data.products ?? []) {
        items.push({ category: "PRODOTTI", icon: SEARCH_ICONS.product, label: p.name, sub: [p.category, p.unit].filter(Boolean).join(" · "), href: "/magazzino" });
      }
      for (const s of data.suppliers ?? []) {
        items.push({ category: "FORNITORI", icon: SEARCH_ICONS.supplier, label: s.name, sub: s.category || undefined, href: `/fornitori` });
      }
      for (const s of data.staff ?? []) {
        items.push({ category: "STAFF", icon: SEARCH_ICONS.staff, label: s.full_name, sub: s.role, href: "/personale" });
      }
      for (const e of data.expenses ?? []) {
        const sub = [e.vendor, e.date].filter(Boolean).join(" · ");
        items.push({ category: "SPESE", icon: SEARCH_ICONS.expense, label: e.description || e.vendor || "Spesa", sub: sub || undefined, href: "/spese" });
      }
      setResults(items);
    } catch {
      setResults(pageResults);
    }
    setSearching(false);
  }, []);

  const handleSearchInput = (val: string) => {
    setQuery(val);
    setSearchOpen(true);
    if (val.length >= 2) {
      setResults(searchPages(val));
      setSearching(true);
    } else {
      setResults([]);
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 300);
  };

  const grouped: Record<string, SearchResult[]> = {};
  for (const r of results) {
    if (!grouped[r.category]) grouped[r.category] = [];
    grouped[r.category].push(r);
  }

  const totalNotif = dbNotifs.length;

  return (
    <div className="page-toolbar">
      {isDashboard && isManager && (
        <div className="toolbar-greeting" suppressHydrationWarning>
          <span className="toolbar-greeting-text serif">{greetingText}, {firstName}</span>
          <span className="toolbar-greeting-date">{greetingDate}</span>
        </div>
      )}
      {isManager && (
        <>
          <div ref={searchRef} className="search-wrapper">
            <div className="search-bar" onClick={() => { setSearchOpen(true); inputRef.current?.focus(); }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6C6B5D" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <input
                ref={inputRef}
                type="text"
                placeholder="Cerca nel gestionale..."
                value={query}
                onChange={e => handleSearchInput(e.target.value)}
                onFocus={() => setSearchOpen(true)}
              />
              <kbd className="search-shortcut">&#8984;K</kbd>
            </div>
            {searchOpen && query.length >= 2 && (
              <div className="search-dropdown">
                {!searching && results.length === 0 && <div className="search-empty">Nessun risultato per &ldquo;{query}&rdquo;</div>}
                {Object.entries(grouped).map(([cat, items]) => (
                  <div key={cat}>
                    <div className="search-cat">{cat}</div>
                    {items.slice(0, 3).map((r, i) => (
                      <Link key={i} href={r.href} className="search-item" onClick={() => { setSearchOpen(false); setQuery(""); setResults([]); }}>
                        <span className="search-item-icon">{r.icon}</span>
                        <div className="search-item-text">
                          <span className="search-item-label">{r.label}</span>
                          {r.sub && <span className="search-item-sub">{r.sub}</span>}
                        </div>
                      </Link>
                    ))}
                    {items.length > 3 && (
                      <Link href={items[0].href} className="search-see-all" onClick={() => { setSearchOpen(false); setQuery(""); setResults([]); }}>
                        Vedi tutti &rarr;
                      </Link>
                    )}
                  </div>
                ))}
                {searching && results.length > 0 && <div className="search-loading-bar" />}
              </div>
            )}
          </div>
          <button className="search-mobile-btn" onClick={() => { setSearchOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1F3326" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          </button>
          {searchOpen && (
            <div className="search-overlay" ref={searchRef}>
              <div className="search-overlay-bar">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6C6B5D" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                <input
                  autoFocus
                  type="text"
                  placeholder="Cerca nel gestionale..."
                  value={query}
                  onChange={e => handleSearchInput(e.target.value)}
                />
                <button onClick={() => { setSearchOpen(false); setQuery(""); setResults([]); }}>&#x2715;</button>
              </div>
              {query.length >= 2 && (
                <div className="search-overlay-results">
                  {!searching && results.length === 0 && <div className="search-empty">Nessun risultato per &ldquo;{query}&rdquo;</div>}
                  {Object.entries(grouped).map(([cat, items]) => (
                    <div key={cat}>
                      <div className="search-cat">{cat}</div>
                      {items.slice(0, 3).map((r, i) => (
                        <Link key={i} href={r.href} className="search-item" onClick={() => { setSearchOpen(false); setQuery(""); setResults([]); }}>
                          <span className="search-item-icon">{r.icon}</span>
                          <div className="search-item-text">
                            <span className="search-item-label">{r.label}</span>
                            {r.sub && <span className="search-item-sub">{r.sub}</span>}
                          </div>
                        </Link>
                      ))}
                      {items.length > 3 && (
                        <Link href={items[0].href} className="search-see-all" onClick={() => { setSearchOpen(false); setQuery(""); setResults([]); }}>
                          Vedi tutti &rarr;
                        </Link>
                      )}
                    </div>
                  ))}
                  {searching && results.length > 0 && <div className="search-loading-bar" />}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <div ref={bellRef} className="bell-wrapper">
        <button className="bell-btn" onClick={() => setBellOpen(!bellOpen)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1F3326" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>
          </svg>
          {totalNotif > 0 && <span className="bell-badge">{totalNotif > 99 ? "99+" : totalNotif}</span>}
        </button>
        {bellOpen && (
          <div className="bell-dropdown">
            <div className="bell-dropdown-head">
              <span>Notifiche</span>
              {totalNotif > 0 && (
                <button className="bell-mark-all" onClick={markAllRead}>Segna tutte come lette</button>
              )}
            </div>
            {totalNotif === 0 && (
              <div className="bell-dropdown-empty">Nessuna notifica</div>
            )}
            {dbNotifs.map(n => (
              <button key={n.id} className="bell-dropdown-item" onClick={() => markAsRead(n)}>
                <span className="bell-notif-icon">{TYPE_ICONS[n.type] || "🔔"}</span>
                <div className="bell-notif-content">
                  <span className="bell-notif-label">{n.message || n.title}</span>
                  <span className="bell-notif-time">{timeAgo(n.created_at)}</span>
                </div>
                <span className="bell-notif-dot" style={{ background: TYPE_COLORS[n.type] || "#BFA762" }} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
