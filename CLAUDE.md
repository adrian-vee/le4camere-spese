# Le 4 Camere — Gestionale Alberghiero

## Stack
- Next.js 15 (App Router), React 19, TypeScript
- Supabase (auth, database, storage bucket "documenti")
- Vercel deploy (main branch)
- No CSS framework — custom CSS in `src/app/globals.css`

## Design System Le 4 Camere

### Layout
- TUTTE le pagine usano full-width nel content area. Mai max-width sul contenuto principale.
- Padding laterale: 24-32px
- Le tabelle e le grid si espandono per riempire lo spazio disponibile
- Desktop-first con sidebar fissa sopra 1024px, bottom nav su mobile

### Palette colori
- Background: #FAF9F5
- Sidebar/header: #1F3326
- Card: #FFFFFF con border #D8CCB8
- Accent gold: #BFA762
- Secondary: #F3EBDD
- Text principale: #6C6B5D
- Text scuro: #1F3326
- Errore/rosso: #9E3B2E
- Warning/arancione: #C77B4A
- Successo/verde: #2D5A3D
- Info/blu: #4F7B8C

### Tipografia
- Titoli pagina e numeri grandi: Fraunces (serif)
- Body text, label, bottoni: Albert Sans
- Branding "GESTIONALE ALBERGHIERO": Bebas Neue
- Numeri KPI card: Bebas Neue
- Mai usare font di default del browser

### Componenti
- Card: background bianco, border 1px #D8CCB8, border-radius 12px, padding 20-24px
- Card KPI: border-top 3px colorato, numero grande in Bebas Neue, label piccola sotto
- Badge/pill: border-radius 20px, padding 4px 12px, font-size 12px, colore di sfondo chiaro con testo scuro della stessa famiglia colore
- Bottoni primary: background #1F3326, colore bianco, border-radius 8px
- Bottoni secondary: background bianco, border 1px #D8CCB8, colore #1F3326
- Input/select: font Albert Sans, font-size 14-15px, border 1px #D8CCB8, border-radius 8px, padding 8-12px. Mai stile browser di default.
- Tabelle: header leggero in #F3EBDD, righe alternate subtle, font Albert Sans
- Border-left colorato su card per indicare stato (come housekeeping)

### Sidebar
- Background: #1F3326
- Voci: Albert Sans, icone SVG o Lucide
- Voce attiva: background accent con border-radius
- Badge notifiche: cerchio rosso con numero bianco
- In basso: nome utente + icona impostazioni. Nessun logo esterno.

### Regole generali
- Nessun logo "Roverchiara" o loghi esterni nella sidebar
- Ogni pagina deve avere titolo in Fraunces + sottotitolo/data se rilevante
- Mobile responsive: grid 1 colonna sotto 768px
- Tutte le pagine full-width, nessun max-width

## Struttura progetto
- `src/app/(app)/` — pagine protette (dashboard, spese, magazzino, inventario, turni, utenze, housekeeping, documenti, personale, impostazioni)
- `src/app/(app)/layout.tsx` — layout con Sidebar + BottomNav, query server-side per user e low stock count
- `src/components/` — Sidebar, BottomNav
- `src/lib/format.ts` — helper eur(), fmtDate()
- `src/utils/supabase/` — client e server Supabase

## Database
- Tabelle principali: expenses, categories, profiles, products, stock_movements, suppliers, rooms, documents, recurring_expenses, utility_bills, inventory_sessions, inventory_counts
- View: stock_levels (prodotti attivi con current_stock calcolato)
- Storage bucket: "documenti" (ricevute, bolle, avatar, documenti)
- RLS abilitato su tutte le tabelle

## Convenzioni
- Pagine "use client" con fetch via supabase client
- Layout server component con auth check e redirect
- Toast per feedback utente (posizionato fixed bottom center)
- Modal con classe .modal-overlay + .modal-card
- Filtri con classe .filters (globals.css) o inline .doc-filters
- Commit format: tipo: descrizione (feat, fix, refactor, docs)
