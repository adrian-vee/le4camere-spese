"use client";

import Link from "next/link";
import { useState, useRef, useEffect, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";

type UserRole = "admin" | "manager" | "staff";

interface NotifItem { label: string; count: number; href: string; color: string }

interface SearchResult { category: string; icon: React.ReactNode; label: string; href: string }

const ICONS: Record<string, React.ReactNode> = {
  magazzino: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>,
  personale: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0112 0v1"/></svg>,
  spese: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h10"/></svg>,
  documenti: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>,
  camere: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12l9-9 9 9"/><path d="M5 10v10h14V10"/></svg>,
};

export default function ContentHeader({
  userName,
  userRole = "staff",
  lowStockCount = 0,
  cassaAlertCount = 0,
  adminNotifCount = 0,
}: {
  userName: string;
  userRole?: UserRole;
  lowStockCount?: number;
  cassaAlertCount?: number;
  adminNotifCount?: number;
}) {
  const isAdmin = userRole === "admin";
  const isManager = userRole === "admin" || userRole === "manager";

  // Bell
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  // Search
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Close on outside click
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

  // Cmd+K / Ctrl+K shortcut
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

    const [stockRes, staffRes, expRes, docRes, roomRes] = await Promise.all([
      Promise.resolve(supabase.from("stock_levels").select("id, name, barcode").or(`name.ilike.${term},barcode.ilike.${term}`).limit(3)),
      Promise.resolve(supabase.from("staff").select("id, name").ilike("name", term).limit(3)),
      Promise.resolve(supabase.from("expenses").select("id, description, vendor").or(`description.ilike.${term},vendor.ilike.${term}`).limit(3)),
      Promise.resolve(supabase.from("documents").select("id, title").ilike("title", term).limit(3)),
      Promise.resolve(supabase.from("rooms").select("id, name, room_number").or(`name.ilike.${term},room_number.ilike.${term}`).limit(3)),
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
    for (const r of (roomRes.data ?? []) as { id: number; name?: string; room_number?: string }[]) {
      items.push({ category: "Camere", icon: ICONS.camere, label: r.name || r.room_number || `Camera ${r.id}`, href: "/housekeeping" });
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

  const notifItems: NotifItem[] = [
    { label: "Alert cassa", count: cassaAlertCount, href: "/cassa", color: "#BFA762" },
    { label: "Scorte basse", count: lowStockCount, href: "/magazzino", color: "#9E3B2E" },
  ];
  const totalNotif = adminNotifCount;

  // Group results by category
  const grouped: Record<string, SearchResult[]> = {};
  for (const r of results) {
    if (!grouped[r.category]) grouped[r.category] = [];
    grouped[r.category].push(r);
  }

  return (
    <div className="content-header">
      <div className="content-header-left">
        <span className="content-header-greeting serif">Ciao, {userName}</span>
        <span className="content-header-role" style={{
          background: userRole === "admin" ? "#9E3B2E18" : userRole === "manager" ? "#BFA76218" : "#4F7B8C18",
          color: userRole === "admin" ? "#9E3B2E" : userRole === "manager" ? "#BFA762" : "#4F7B8C",
        }}>{userRole}</span>
      </div>
      <div className="content-header-right">
        {/* Search - admin & manager only */}
        {isManager && (
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
              <kbd className="search-shortcut hide-sm">⌘K</kbd>
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
        )}

        {/* Bell - admin only */}
        {isAdmin && (
          <div ref={bellRef} className="bell-wrapper">
            <button className="bell-btn" onClick={() => setBellOpen(!bellOpen)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1F3326" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>
              </svg>
              {totalNotif > 0 && <span className="bell-badge">{totalNotif}</span>}
            </button>
            {bellOpen && (
              <div className="bell-dropdown">
                <div className="bell-dropdown-head">Notifiche</div>
                {notifItems.filter(n => n.count > 0).map((n, i) => (
                  <Link key={i} href={n.href} onClick={() => setBellOpen(false)} className="bell-dropdown-item">
                    <span>{n.label}</span>
                    <span className="bell-dropdown-count" style={{ background: n.color + "18", color: n.color }}>{n.count}</span>
                  </Link>
                ))}
                {notifItems.every(n => n.count === 0) && (
                  <div className="bell-dropdown-empty">Tutto a posto</div>
                )}
                <Link href="/admin/panoramica" onClick={() => setBellOpen(false)} className="bell-dropdown-link">
                  Vai alla panoramica admin &rarr;
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
