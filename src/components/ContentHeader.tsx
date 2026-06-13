"use client";

import Link from "next/link";
import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type UserRole = "admin" | "manager" | "staff";

interface Notif { key: string; label: string; href: string; color: string }

interface DbNotif {
  id: string;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
}

interface SearchResult { category: string; icon: React.ReactNode; label: string; href: string }

const TYPE_COLORS: Record<string, string> = {
  doc_expiring: "#C77B4A",
  product_expiring: "#C77B4A",
  low_stock: "#9E3B2E",
  availability_missing: "#C77B4A",
  availability_reminder: "#4F7B8C",
  inventory_reminder: "#BFA762",
};

const TYPE_ICONS: Record<string, string> = {
  doc_expiring: "📄",
  product_expiring: "📦",
  low_stock: "⚠️",
  availability_missing: "📅",
  availability_reminder: "📅",
  inventory_reminder: "📋",
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

const ICONS: Record<string, React.ReactNode> = {
  magazzino: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>,
  personale: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0112 0v1"/></svg>,
  spese: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h10"/></svg>,
  documenti: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>,
  camere: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12l9-9 9 9"/><path d="M5 10v10h14V10"/></svg>,
};

export default function ContentHeader({
  userRole = "staff",
  notifications = [],
}: {
  userRole?: UserRole;
  notifications?: Notif[];
}) {
  const isAdmin = userRole === "admin";
  const isManager = userRole === "admin" || userRole === "manager";
  const router = useRouter();

  const [bellOpen, setBellOpen] = useState(false);
  const [dbNotifs, setDbNotifs] = useState<DbNotif[]>([]);
  const [legacyNotifs, setLegacyNotifs] = useState<Notif[]>(notifications);
  const bellRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setLegacyNotifs(notifications); }, [notifications]);

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
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAll: true }),
    });
  };

  const dismissLegacy = async (notif: Notif) => {
    setLegacyNotifs(prev => prev.filter(n => n.key !== notif.key));
    setBellOpen(false);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: prof } = await supabase.from("profiles").select("dismissed_alerts").eq("id", user.id).single();
      const current: string[] = Array.isArray(prof?.dismissed_alerts) ? prof.dismissed_alerts : [];
      if (!current.includes(notif.key)) {
        await supabase.from("profiles").update({ dismissed_alerts: [...current, notif.key] }).eq("id", user.id);
      }
    }
    router.push(notif.href);
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
    const supabase = createClient();
    const items: SearchResult[] = [];
    const term = `%${q}%`;

    const [stockRes, staffRes, expRes, docRes] = await Promise.all([
      Promise.resolve(supabase.from("stock_levels").select("id, name, barcode").or(`name.ilike.${term},barcode.ilike.${term}`).limit(3)),
      Promise.resolve(supabase.from("staff").select("id, name").ilike("name", term).limit(3)),
      Promise.resolve(supabase.from("expenses").select("id, description, vendor").or(`description.ilike.${term},vendor.ilike.${term}`).limit(3)),
      Promise.resolve(supabase.from("documents").select("id, title").ilike("title", term).limit(3)),
    ]);

    for (const p of (stockRes.data ?? []) as { id: string; name: string; barcode?: string }[]) {
      items.push({ category: "Magazzino", icon: ICONS.magazzino, label: p.name + (p.barcode ? ` (${p.barcode})` : ""), href: "/magazzino" });
    }
    for (const s of (staffRes.data ?? []) as { id: number; name: string }[]) {
      items.push({ category: "Personale", icon: ICONS.personale, label: s.name, href: "/personale" });
    }
    for (const e of (expRes.data ?? []) as { id: number; description: string; vendor?: string }[]) {
      items.push({ category: "Spese", icon: ICONS.spese, label: e.description + (e.vendor ? ` — ${e.vendor}` : ""), href: "/spese" });
    }
    for (const d of (docRes.data ?? []) as { id: number; title: string }[]) {
      items.push({ category: "Documenti", icon: ICONS.documenti, label: d.title, href: "/documenti" });
    }
    setResults(items);
    setSearching(false);
  }, []);

  const handleSearchInput = (val: string) => {
    setQuery(val);
    setSearchOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 300);
  };

  const grouped: Record<string, SearchResult[]> = {};
  for (const r of results) {
    if (!grouped[r.category]) grouped[r.category] = [];
    grouped[r.category].push(r);
  }

  const totalNotif = dbNotifs.length + (isAdmin ? legacyNotifs.length : 0);

  return (
    <div className="page-toolbar">
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
                {searching && <div className="search-empty">Ricerca...</div>}
                {!searching && results.length === 0 && <div className="search-empty">Nessun risultato per &ldquo;{query}&rdquo;</div>}
                {!searching && Object.entries(grouped).map(([cat, items]) => (
                  <div key={cat}>
                    <div className="search-cat">{cat}</div>
                    {items.map((r, i) => (
                      <Link key={i} href={r.href} className="search-item" onClick={() => { setSearchOpen(false); setQuery(""); setResults([]); }}>
                        <span className="search-item-icon">{r.icon}</span>
                        <span className="search-item-label">{r.label}</span>
                      </Link>
                    ))}
                  </div>
                ))}
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
                  {searching && <div className="search-empty">Ricerca...</div>}
                  {!searching && results.length === 0 && <div className="search-empty">Nessun risultato per &ldquo;{query}&rdquo;</div>}
                  {!searching && Object.entries(grouped).map(([cat, items]) => (
                    <div key={cat}>
                      <div className="search-cat">{cat}</div>
                      {items.map((r, i) => (
                        <Link key={i} href={r.href} className="search-item" onClick={() => { setSearchOpen(false); setQuery(""); setResults([]); }}>
                          <span className="search-item-icon">{r.icon}</span>
                          <span className="search-item-label">{r.label}</span>
                        </Link>
                      ))}
                    </div>
                  ))}
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
            {isAdmin && legacyNotifs.map(n => (
              <button key={n.key} className="bell-dropdown-item" onClick={() => dismissLegacy(n)}>
                <span className="bell-notif-icon">🔔</span>
                <div className="bell-notif-content">
                  <span className="bell-notif-label">{n.label}</span>
                </div>
                <span className="bell-notif-dot" style={{ background: n.color }} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
