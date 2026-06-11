"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";

// Default values for all settings
const DEFAULTS: Record<string, unknown> = {
  hotel_name: "Le 4 Camere",
  hotel_address: "",
  hotel_phone: "",
  hotel_email: "",
  site_url: "https://my.le4camere.com",
  cassa_fondo: 50,
  cassa_quick_buttons: [
    { label: "Caffè", amount: 1.5, category: "bar_bevande", type: "entrata", description: "Caffè" },
    { label: "Acqua", amount: 1.0, category: "bar_bevande", type: "entrata", description: "Acqua" },
    { label: "Birra", amount: 3.0, category: "bar_bevande", type: "entrata", description: "Birra" },
    { label: "Colazione", amount: 8.0, category: "colazione", type: "entrata", description: "Colazione" },
  ],
  cassa_categorie_entrata: ["Camera (contanti)", "Bar / Bevande", "Colazione", "Minibar", "Extra / Servizi", "Altro"],
  cassa_categorie_uscita: ["Fondo cassa dato", "Spesa piccola", "Fornitore pagato contanti", "Altro"],
  turni_mattina_inizio: "06:30",
  turni_mattina_fine: "14:30",
  turni_pomeriggio_inizio: "14:30",
  turni_pomeriggio_fine: "22:00",
  turni_riposo_minimo: 11,
  turni_giorno_libero: true,
  disponibilita_scadenza_giorno: 25,
  disponibilita_max_modifiche: 1,
  magazzino_categorie: ["Pulizia", "Colazione", "Biancheria", "Bagno/Toiletries", "Manutenzione", "Cancelleria", "Bar", "Cucina", "Minibar", "Bevande", "Alcolici", "Snack/Distributori", "Altro"],
  magazzino_unita_misura: ["pz", "bottiglie", "confezioni", "kg", "litri", "pacchi", "rotoli", "scatole"],
  magazzino_scorta_default: 5,
  magazzino_scadenza_warning: 30,
  magazzino_scadenza_urgente: 7,
  inventario_prossima_data: "",
  inventario_frequenza: "Mensile",
  inventario_frequenza_giorni: 30,
  inventario_promemoria_giorni: 3,
  inventario_tolleranza_percentuale: 5,
  inventario_categorie_incluse: [],
  inventario_note: "",
  documenti_scadenza_urgente: 7,
  documenti_scadenza_warning: 30,
  documenti_notifica_email: false,
  documenti_notifica_destinatari: "",
  notifiche_email_attive: false,
  notifiche_config: {},
};

export function getDefault<T>(key: string): T {
  return DEFAULTS[key] as T;
}

// Cache across hook instances
let _cache: Record<string, unknown> | null = null;
let _loading = false;
let _listeners: (() => void)[] = [];

export function useSettings() {
  const supabase = createClient();
  const [settings, setSettings] = useState<Record<string, unknown>>(_cache ?? {});
  const [loading, setLoading] = useState(!_cache);

  const load = useCallback(async () => {
    if (_loading) return;
    _loading = true;
    try {
      const { data } = await supabase.from("settings").select("key, value");
      const map: Record<string, unknown> = {};
      for (const row of (data ?? [])) {
        map[row.key] = row.value;
      }
      _cache = map;
      setSettings(map);
      _listeners.forEach(fn => fn());
    } catch {
      // settings table might not exist yet — use defaults
      _cache = {};
      setSettings({});
    }
    _loading = false;
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    if (!_cache) load();
    else { setSettings(_cache); setLoading(false); }
    const fn = () => { if (_cache) setSettings({ ..._cache }); };
    _listeners.push(fn);
    return () => { _listeners = _listeners.filter(f => f !== fn); };
  }, [load]);

  function get<T>(key: string): T {
    if (settings[key] !== undefined) return settings[key] as T;
    return DEFAULTS[key] as T;
  }

  async function set(key: string, value: unknown): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("settings").upsert(
      { key, value: JSON.stringify(value) === JSON.stringify(value) ? value : value, updated_at: new Date().toISOString(), updated_by: user?.id ?? null },
      { onConflict: "key" }
    );
    if (error) return false;
    if (_cache) _cache[key] = value;
    setSettings(prev => ({ ...prev, [key]: value }));
    _listeners.forEach(fn => fn());
    return true;
  }

  async function setMany(entries: Record<string, unknown>): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    const rows = Object.entries(entries).map(([key, value]) => ({
      key, value, updated_at: new Date().toISOString(), updated_by: user?.id ?? null,
    }));
    const { error } = await supabase.from("settings").upsert(rows, { onConflict: "key" });
    if (error) return false;
    for (const [k, v] of Object.entries(entries)) {
      if (_cache) _cache[k] = v;
    }
    setSettings(prev => ({ ...prev, ...entries }));
    _listeners.forEach(fn => fn());
    return true;
  }

  return { get, set, setMany, loading, reload: load };
}
