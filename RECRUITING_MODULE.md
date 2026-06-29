# Recruiting Module — Documentazione tecnica per il riuso

> Documentazione autosufficiente del modulo Recruiting (route `/onboarding`).
> Generata il 2026-06-29. Progetto sorgente: le4camere-spese.

---

## 1. Elenco file

| Percorso | Descrizione |
|---|---|
| `src/app/(app)/onboarding/page.tsx` | **Dashboard recruiting** — lista candidati con card, filtri, ricerca, ordinamento, tabs attivi/archivio, KPI stats, azioni rapide (cambio esito, download PDF, elimina) |
| `src/app/(app)/onboarding/[id]/page.tsx` | **Dettaglio candidato** — stepper 6 fasi (Anagrafici, Esperienza, Valutazione, Documenti, Privacy, Esito), form completo, date picker custom, chip select, star rating, firma su canvas, upload file, checklist documenti, follow-up interviews, conversione in personale, tabella valutazione live |
| `src/lib/recruitment-pdf.ts` | **Generazione PDF** — `generateSummaryPdf()` (riepilogo colloquio), `generatePrivacyFormPdf()` (modulo privacy), `computeScore()` (calcolo punteggio), export dei tipi `RecruitmentCandidate` e `ScoreBreakdown` |

### Dipendenze interne al gestionale (da replicare o sostituire)

| Percorso | Cosa fornisce | Come sostituire |
|---|---|---|
| `src/components/ui/Modal.tsx` | `Modal` — componente modale generico (`isOpen`, `onClose`, `title`, `children`, `maxWidth`) | Qualsiasi modale, es. radix-ui dialog |
| `src/lib/useRole.ts` | `useRole()` — hook che ritorna `{ isAdmin, isManager, loading, userId }` leggendo `profiles.role` | Reimplementare con la propria logica auth |
| `src/lib/useToast.ts` | `useToast()` — hook con `{ toast, showToast }`, tipi `ToastData`, `ToastType` | Qualsiasi sistema di notifiche (sonner, react-hot-toast) |
| `src/components/Toast.tsx` | `Toast` — componente render del toast | Va con il hook sopra |
| `src/utils/supabase/` | Client Supabase browser/server | Standard `@supabase/ssr` setup |

---

## 2. Schema database

SQL pronto da eseguire su un nuovo progetto Supabase. Include funzioni helper, tabelle, trigger, indici, RLS, storage bucket e settings.

```sql
-- ══════════════════════════════════════════════════════════════════
-- PREREQUISITI: funzioni helper per RLS
-- Se il tuo progetto ha già profiles + ruoli, adatta le query.
-- ══════════════════════════════════════════════════════════════════

-- profiles deve esistere con colonna `role` ('admin'|'manager'|'staff')
-- CREATE TABLE IF NOT EXISTS public.profiles (
--   id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
--   role text NOT NULL DEFAULT 'staff' CHECK (role IN ('admin','manager','staff')),
--   ...
-- );

-- Funzione: l'utente corrente è admin?
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Funzione: l'utente corrente è admin O manager?
CREATE OR REPLACE FUNCTION is_manager()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager')
  );
$$;

-- ══════════════════════════════════════════════════════════════════
-- TABELLA: recruitment_candidates
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.recruitment_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Phase 1: Anagrafici
  first_name text NOT NULL,
  last_name text NOT NULL,
  birth_date date,
  residence text,
  phone text,
  email text,
  has_car boolean NOT NULL DEFAULT false,
  distance_km numeric(6,1),

  -- Phase 2: Esperienza
  position_applied text,
  experience text,                    -- strutturato: "Nessuna"|"1-2 anni"|"3-5 anni"|"5+ anni"
  experience_details text,            -- testo libero, NON usato per il punteggio
  languages text,                     -- comma-separated
  availability text,                  -- comma-separated turni
  employment_type_sought text,        -- comma-separated tipi contratto
  can_start_date date,

  -- Phase 3: Valutazione
  interview_notes text,
  strengths text,
  weaknesses text,
  rating integer CHECK (rating IS NULL OR (rating >= 0 AND rating <= 5)),

  -- Phase 4: Documenti (checklist JSON)
  documents_checklist jsonb NOT NULL DEFAULT '[]',
  -- Formato: [{key, label, checked, notes}, ...]

  -- Phase 5: Privacy
  privacy_consent boolean NOT NULL DEFAULT false,
  privacy_consent_at timestamptz,
  signature_url text,
  signed_document_url text,

  -- Phase 6: Esito
  outcome text NOT NULL DEFAULT 'in_valutazione'
    CHECK (outcome IN ('da_richiamare','in_valutazione','idoneo','non_idoneo')),
  converted boolean NOT NULL DEFAULT false,
  converted_to text CHECK (converted_to IS NULL OR converted_to IN ('dipendente','a_chiamata')),
  converted_at timestamptz,
  onboarding_process_id uuid,

  -- Stepper state
  current_phase integer NOT NULL DEFAULT 1 CHECK (current_phase >= 1 AND current_phase <= 6),
  completed_phases integer[] NOT NULL DEFAULT '{}',

  -- Evaluation (calcolato dal frontend e salvato)
  evaluation_score integer,
  evaluation_breakdown jsonb,

  -- Follow-up interviews
  follow_up_interviews jsonb NOT NULL DEFAULT '[]',
  -- Formato: [{date, notes}, ...]

  -- Meta
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Trigger: auto-update updated_at
CREATE OR REPLACE FUNCTION trg_recruitment_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS set_recruitment_updated_at ON recruitment_candidates;
CREATE TRIGGER set_recruitment_updated_at
  BEFORE UPDATE ON recruitment_candidates
  FOR EACH ROW EXECUTE FUNCTION trg_recruitment_updated_at();

-- RLS
ALTER TABLE recruitment_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recruitment_candidates_select"
  ON recruitment_candidates FOR SELECT TO authenticated
  USING (is_manager());

CREATE POLICY "recruitment_candidates_insert"
  ON recruitment_candidates FOR INSERT TO authenticated
  WITH CHECK (is_manager());

CREATE POLICY "recruitment_candidates_update"
  ON recruitment_candidates FOR UPDATE TO authenticated
  USING (is_manager()) WITH CHECK (is_manager());

CREATE POLICY "recruitment_candidates_delete"
  ON recruitment_candidates FOR DELETE TO authenticated
  USING (is_admin());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_recruitment_candidates_outcome ON recruitment_candidates(outcome);
CREATE INDEX IF NOT EXISTS idx_recruitment_candidates_created ON recruitment_candidates(created_at DESC);

-- ══════════════════════════════════════════════════════════════════
-- TABELLA: recruitment_documents
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.recruitment_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES recruitment_candidates(id) ON DELETE CASCADE,
  doc_type text,
  file_url text NOT NULL,
  file_name text NOT NULL DEFAULT '',
  file_type text NOT NULL DEFAULT '',
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE recruitment_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recruitment_documents_select"
  ON recruitment_documents FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "recruitment_documents_insert"
  ON recruitment_documents FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "recruitment_documents_delete"
  ON recruitment_documents FOR DELETE TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_recruitment_documents_candidate ON recruitment_documents(candidate_id);

-- ══════════════════════════════════════════════════════════════════
-- STORAGE BUCKET
-- ══════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public)
VALUES ('recruitment-files', 'recruitment-files', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "recruitment_files_select" ON storage.objects;
CREATE POLICY "recruitment_files_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'recruitment-files');

DROP POLICY IF EXISTS "recruitment_files_insert" ON storage.objects;
CREATE POLICY "recruitment_files_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'recruitment-files');

DROP POLICY IF EXISTS "recruitment_files_delete" ON storage.objects;
CREATE POLICY "recruitment_files_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'recruitment-files');

-- ══════════════════════════════════════════════════════════════════
-- SETTINGS: testo informativa privacy (richiede tabella `settings`)
-- ══════════════════════════════════════════════════════════════════

-- Se non hai una tabella settings, creala:
-- CREATE TABLE IF NOT EXISTS public.settings (
--   key text PRIMARY KEY,
--   value jsonb NOT NULL DEFAULT '""',
--   updated_at timestamptz NOT NULL DEFAULT now()
-- );

INSERT INTO settings (key, value, updated_at)
VALUES ('recruitment_privacy_text', '"Informativa ai sensi del Regolamento UE 2016/679 (GDPR). I dati personali raccolti saranno trattati esclusivamente per le finalità di selezione del personale."'::jsonb, now())
ON CONFLICT (key) DO NOTHING;
```

---

## 3. Dipendenze

### Pacchetti npm

| Pacchetto | Versione | Uso nel modulo |
|---|---|---|
| `jspdf` | `^4.2.1` | Generazione PDF riepilogo e modulo privacy |
| `jspdf-autotable` | `^5.0.8` | Tabelle nei PDF |
| `@supabase/ssr` | `^0.5.2` | Client Supabase browser (SSR-ready) |
| `@supabase/supabase-js` | `^2.45.0` | SDK Supabase |
| `next` | `^15.0.0` | Framework (App Router) |
| `react` | `^19.0.0` | UI |

> **Non servono librerie esterne** per: date picker (custom inline), firma digitale (canvas nativo), chip select (custom).

### Variabili d'ambiente

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### Asset opzionale

Il PDF cerca `/le4camere-logo-bianco.svg` per il logo in testata. Se manca, stampa il nome hotel in testo. Puoi sostituire il path in `loadLogoPng()` dentro `recruitment-pdf.ts`.

---

## 4. Logica di valutazione (scoring)

La funzione `computeScore()` si trova in `src/lib/recruitment-pdf.ts` ed è esportata. Calcola un punteggio 0–100 basato su 5 criteri pesati:

```typescript
export function computeScore(c: RecruitmentCandidate): {
  total: number;
  breakdown: ScoreBreakdown[];
  summary: string;
}
```

### Criteri, pesi e regole

| # | Criterio | Peso | Max pts | Calcolo |
|---|---|---|---|---|
| 1 | **Rating colloquio** | 40% | 40 | `(rating / 5) * 40`, arrotondato. Es: 4/5 = 32, 3/5 = 24 |
| 2 | **Esperienza** | 25% | 25 | Mappa il valore del chip: `"5+ anni"` = 25, `"3-5 anni"` = 20, `"1-2 anni"` = 13, `"Nessuna"` = 0 |
| 3 | **Disponibilita turni** | 20% | 20 | `"Flessibile"` o 4+ turni = 20, 3 turni = 16, 2 = 12, 1 = 8, nessuno = 0 |
| 4 | **Automunito** | 10% | 10 | Si = 10, No = 0 |
| 5 | **Distanza hotel** | 5% | 5 | 0–20 km = 5, 21–40 km = 3, 40+ km = 1, non inserito = 3 (neutro) |

### Soglie di giudizio

| Range | Giudizio |
|---|---|
| 85–100 | Profilo molto forte |
| 70–84 | Buon profilo |
| 55–69 | Profilo discreto |
| < 55 | Profilo debole |

### Codice completo

```typescript
export interface ScoreBreakdown {
  label: string;
  value: string;
  points: number;
  max: number;
  weight: string;
  hint: string;
  note?: string;
}

export function computeScore(c: RecruitmentCandidate): {
  total: number;
  breakdown: ScoreBreakdown[];
  summary: string;
} {
  const breakdown: ScoreBreakdown[] = [];

  // 1. Rating colloquio — 40%
  const ratingMax = 40;
  const ratingPts = c.rating ? Math.round((c.rating / 5) * ratingMax) : 0;
  breakdown.push({
    label: "Rating colloquio",
    value: c.rating ? `${c.rating}/5` : "N/D",
    points: ratingPts, max: ratingMax, weight: "40%",
    hint: "Stelle assegnate / 5, proporzionale.",
  });

  // 2. Esperienza — 25%
  const expMax = 25;
  const EXP_SCORES: Record<string, number> = {
    "5+ anni": 1, "3-5 anni": 0.8, "1-2 anni": 0.5, "Nessuna": 0,
  };
  const expLevel = (c.experience || "").trim();
  const expFraction = EXP_SCORES[expLevel];
  const expPts = expFraction != null ? Math.round(expMax * expFraction) : 0;
  breakdown.push({
    label: "Esperienza",
    value: expLevel || "N/D",
    points: expPts, max: expMax, weight: "25%",
    hint: "5+ anni = 25, 3-5 anni = 20, 1-2 anni = 13, Nessuna = 0.",
  });

  // 3. Disponibilita — 20%
  const availMax = 20;
  let availPts = 0;
  const avail = (c.availability || "").toLowerCase();
  if (avail) {
    const items = avail.split(",").map(s => s.trim()).filter(Boolean);
    if (items.some(i => i === "flessibile")) availPts = availMax;
    else if (items.length >= 4) availPts = availMax;
    else if (items.length === 3) availPts = Math.round(availMax * 0.8);
    else if (items.length === 2) availPts = Math.round(availMax * 0.6);
    else if (items.length === 1) availPts = Math.round(availMax * 0.4);
  }
  breakdown.push({
    label: "Disponibilita turni",
    value: c.availability || "N/D",
    points: availPts, max: availMax, weight: "20%",
    hint: "Flessibile o 4+ turni = 20, 3 = 16, 2 = 12, 1 = 8, nessuno = 0.",
  });

  // 4. Automunito — 10%
  const carMax = 10;
  const carPts = c.has_car ? carMax : 0;
  breakdown.push({
    label: "Automunito",
    value: c.has_car ? "Si" : "No",
    points: carPts, max: carMax, weight: "10%",
    hint: "Si = 10, No = 0.",
  });

  // 5. Distanza — 5%
  const distMax = 5;
  let distPts: number;
  if (c.distance_km == null) distPts = Math.round(distMax * 0.5);
  else if (c.distance_km <= 20) distPts = distMax;
  else if (c.distance_km <= 40) distPts = Math.round(distMax * 0.5);
  else distPts = Math.round(distMax * 0.2);
  breakdown.push({
    label: "Distanza hotel",
    value: c.distance_km != null ? `${c.distance_km} km` : "N/D",
    points: distPts, max: distMax, weight: "5%",
    hint: "0-20 km = 5, 21-40 km = 3, 40+ km = 1, non inserito = 3.",
  });

  const total = breakdown.reduce((s, b) => s + b.points, 0);

  let summary: string;
  if (total >= 85) summary = `Profilo molto forte (${total}/100).`;
  else if (total >= 70) summary = `Buon profilo (${total}/100).`;
  else if (total >= 55) summary = `Profilo discreto (${total}/100).`;
  else summary = `Profilo debole (${total}/100).`;

  return { total, breakdown, summary };
}
```

---

## 5. Pattern di integrazione

### Client Supabase

Il modulo usa un **browser client** creato inline in ogni pagina:

```typescript
import { createBrowserClient } from "@supabase/ssr";
const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
```

Non usa nessun server component o server action — tutto e `"use client"`.

### Recupero utente e ruolo

```typescript
import { useRole } from "@/lib/useRole";
const { isAdmin, isManager, loading, userId } = useRole();
```

Il hook legge `profiles.role` per l'utente autenticato. Le policy RLS usano le funzioni SQL `is_admin()` e `is_manager()`.

### Sistema toast

```typescript
import { useToast } from "@/lib/useToast";
import { Toast } from "@/components/Toast";

const { toast, showToast } = useToast();
showToast("Messaggio", "ok");   // "ok" | "warn" | "error"
// nel JSX: <Toast toast={toast} />
```

### Modal

```typescript
import { Modal } from "@/components/ui/Modal";
<Modal isOpen={bool} onClose={fn} title="..." maxWidth={480}>
  {children}
</Modal>
```

### Sidebar/navigazione

La voce "Recruiting" va aggiunta alla sidebar desktop e al bottom nav mobile. La route è `/onboarding`. Il modulo non importa la sidebar — è il layout padre `(app)/layout.tsx` che la include.

### Storage

Bucket: `recruitment-files` (pubblico).
Path convention: `recruitment/{candidateId}/{docType}/{timestamp}.{ext}`

### Settings

Il testo dell'informativa privacy è salvato nella tabella `settings` con chiave `recruitment_privacy_text`. L'admin può modificarlo dalla UI nella fase Privacy.

---

## 6. Istruzioni di portabilita

### Passo 1 — Copia i file

```
src/app/(app)/onboarding/page.tsx         → src/app/(app)/onboarding/page.tsx
src/app/(app)/onboarding/[id]/page.tsx    → src/app/(app)/onboarding/[id]/page.tsx
src/lib/recruitment-pdf.ts                → src/lib/recruitment-pdf.ts
```

### Passo 2 — Installa le dipendenze

```bash
npm install jspdf jspdf-autotable @supabase/ssr @supabase/supabase-js
```

### Passo 3 — Esegui le migration SQL

Esegui il blocco SQL della sezione 2 nel SQL editor di Supabase. Assicurati che:
- La tabella `profiles` esista con colonna `role`
- Le funzioni `is_admin()` e `is_manager()` siano create
- La tabella `settings` esista (o creala)

### Passo 4 — Ricrea i componenti condivisi

Devi fornire questi moduli nel nuovo progetto (o sostituirli):

| Import | Cosa serve | Alternativa rapida |
|---|---|---|
| `@/components/ui/Modal` | Modal con `isOpen`, `onClose`, `title`, `children`, `maxWidth` | Qualsiasi dialog (radix, headless-ui) |
| `@/lib/useRole` | Hook: `{ isAdmin, isManager, loading, userId }` | Scrivi un hook che legge il ruolo dal tuo sistema auth |
| `@/lib/useToast` + `@/components/Toast` | Sistema notifiche | `sonner`, `react-hot-toast`, o qualsiasi |

### Passo 5 — Configura variabili d'ambiente

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

### Passo 6 — Logo PDF (opzionale)

Il PDF cerca `/le4camere-logo-bianco.svg` in `public/`. Sostituisci il path in `loadLogoPng()` in `recruitment-pdf.ts` con il logo del tuo progetto, oppure lascia il fallback testuale.

### Passo 7 — Aggiungi la route alla navigazione

Aggiungi un link a `/onboarding` nella sidebar/nav del nuovo progetto.

### Passo 8 — Personalizzazioni

- **Posizioni**: modifica l'array `POSITIONS` in `[id]/page.tsx`
- **Documenti checklist**: modifica `DEFAULT_DOCS` in `[id]/page.tsx`
- **Lingue**: modifica `LANG_OPTS` in `[id]/page.tsx`
- **Turni**: modifica `SHIFT_OPTS` in `[id]/page.tsx`
- **Tipi contratto**: modifica `CONTRACT_TYPES` in `[id]/page.tsx`
- **Pesi scoring**: modifica le costanti `ratingMax`, `expMax`, `availMax`, `carMax`, `distMax` in `computeScore()`
- **CSS**: tutto il CSS e inline nella costante `CSS` alla fine di ogni pagina — personalizza colori, font, spacing a piacere

### Cosa NON serve dal gestionale originale

Il modulo e completamente autocontenuto. Non dipende da: expenses, products, stock, housekeeping, turni, cassa, o qualsiasi altra tabella del gestionale alberghiero. Le uniche dipendenze esterne sono `profiles` (per i ruoli) e `settings` (per il testo privacy).
