# Le 4 Camere · Gestione Spese

Dashboard finanziaria standalone per l'albergo **Le 4 Camere**: registrazione spese (scontrini, fatture, bolle), foto dei documenti con **lettura automatica via AI (OCR)**, multi-utente, report e export per il commercialista. Mobile-first.

## Cosa fa la v1

- **Login multi-utente** (staff) — tutti inseriscono liberamente, nessun workflow di approvazione.
- **Nuova spesa**: importo, data, fornitore, categoria, tipo documento, pagamento, stato (pagato / da pagare + scadenza), centro di costo, note.
- **Foto documento** (scatto da telefono o upload) salvata su Supabase Storage privato.
- **OCR AI**: la foto viene letta da Claude Haiku 4.5 che precompila importo, data, fornitore, tipo e categoria. *L'utente verifica sempre prima di salvare.*
- **Dashboard**: totale mese / anno, da pagare, spese per categoria, ultime spese.
- **Registro** con ricerca, filtri per mese/categoria, apertura documento, eliminazione, **export CSV** (formato `;` + BOM, si apre pulito in Excel italiano).

## Stack (versioni verificate al build)

- Next.js 15.5 (App Router) · React 19 · TypeScript
- `@supabase/ssr` 0.5.2 + `@supabase/supabase-js` 2.107 (Auth + Postgres + Storage)
- Claude API (Haiku 4.5) per l'OCR, chiamata **solo lato server**
- CSS puro con design tokens (nessun Tailwind: zero rischi di config/versione)

> Nota onesta: ho fatto girare `next build` (compila e supera il type-check), ma **non l'ho eseguito end-to-end** contro un'istanza Supabase reale. Prima di andare in produzione provalo localmente con il tuo progetto Supabase.

---

## Setup in locale

### 1. Crea il progetto Supabase
- Vai su supabase.com → New project.
- **SQL Editor** → lancia `supabase/migrations/0001_init.sql` (spese: tabelle, RLS, bucket `documenti`, categorie).
- Poi lancia `supabase/migrations/0002_turni.sql` (turni: personale, fasce, copertura, turni, assenze + seed).

### 2. Variabili d'ambiente
Crea `.env.local` (vedi `.env.example`):
```
NEXT_PUBLIC_SUPABASE_URL=https://<tuo-progetto>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key o anon key>
ANTHROPIC_API_KEY=sk-ant-...
```
Le trovi in **Project Settings → API**. La `ANTHROPIC_API_KEY` non ha il prefisso `NEXT_PUBLIC_` apposta: resta sul server.

### 3. Auth (importante)
- In **Authentication → Providers → Email**: per uso interno con lo staff puoi **disattivare "Confirm email"** così la registrazione è immediata.
- Se invece lasci la conferma attiva, in **Authentication → URL Configuration** imposta il *Site URL* e aggiungi `http://localhost:3000/auth/callback` (e in produzione `https://spese.le4camere.com/auth/callback`) tra i Redirect URLs. La rotta `/auth/callback` è già pronta.

### 4. Avvia
```
npm install
npm run dev
```
Apri http://localhost:3000 → registra il primo utente → inizia.

---

## Deploy su Vercel + dominio

1. Push del repo su GitHub → importa su Vercel.
2. In Vercel → **Settings → Environment Variables**: aggiungi le tre variabili sopra.
3. **Domains**: aggiungi `spese.le4camere.com` e crea il record DNS CNAME che Vercel ti indica (consigliato il sottodominio, non il dominio principale dell'hotel).
4. Aggiorna i Redirect URLs in Supabase con il dominio di produzione.

### Icone PWA
Per l'installazione su telefono aggiungi due immagini in `public/`: `icon-192.png` e `icon-512.png`. Il `manifest.webmanifest` è già collegato.

---

## Note tecniche

- **Sicurezza sessione**: lato server si usa `supabase.auth.getUser()` (verifica il token con il server di auth), non `getSession()`.
- **Warning "Edge Runtime / process.version"** al build: arriva da `supabase-js` dentro il middleware. È un avviso noto del pattern ufficiale Supabase+Next e non blocca il funzionamento. Se preferisci eliminarlo del tutto si può spostare il middleware al runtime Node.
- **RLS**: tutte le policy danno accesso pieno agli utenti autenticati (scelta "tutti inseriscono"). Se in futuro vorrai distinguere admin/staff, si stringono le policy su `expenses` e `storage.objects`.

## Avvertenze (precisione)

- L'**OCR non è accurato al 100%**: è pensato per precompilare e farti risparmiare digitazione, ma i campi vanno sempre verificati prima del salvataggio.
- Le **regole fiscali italiane** (fattura elettronica, imposta di soggiorno, deducibilità IVA) cambiano: conferma sempre con il tuo commercialista. Questa app registra le spese, non sostituisce la contabilità.

## Modulo Turni (personale)

Secondo modulo, stessa app e stesso login.

- **Staff** (`/personale`): anagrafica con tipo contratto (dipendente / a chiamata), ore e giorni a settimana, attivo/sospeso.
- **Copertura** (`/turni/copertura`): per ogni giorno della settimana imposti quante persone servono per ogni fascia (es. reception mattino ×1, notte ×1). È la base su cui lavora il generatore.
- **Turni** (`/turni`): navighi tra le settimane, premi **Genera bozza**, correggi a mano dalle tendine, salvi. In fondo vedi il riepilogo ore per persona.
- **Stampa** (`/turni/stampa`): foglio settimanale pulito (fasce × giorni) per la bacheca o in PDF.

### Come ragiona il generatore

È un **generatore a regole** che produce una **bozza** (non un ottimizzatore "magico", come concordato). Garanzie sui vincoli — *mai violati: se non riesce, lascia un buco evidenziato anziché sforare*:

- riposo di **11h** tra fine turno e inizio del successivo (D.Lgs 66/2003);
- almeno **1 giorno libero** nella settimana (max 6 giorni, e rispetta i giorni/settimana del contratto);
- **ore di contratto** dei dipendenti non superate;
- un solo turno per persona al giorno;
- gli **a chiamata** usati solo per coprire i buchi lasciati dai dipendenti;
- una **riserva di capacità** distribuisce i giorni sulla settimana, così il weekend non resta scoperto.

Quando i buchi restano, di solito significa che **manca personale** per quella copertura: il tool te lo dice con un avviso, invece di forzare turni illegali.

La logica è stata collaudata con uno scenario reale: `npx tsx scripts/test-scheduler.ts` stampa la tabella e verifica che non ci siano violazioni di vincolo.

> Onestà, di nuovo: i **paletti di legge** sono quelli generali del D.Lgs 66/2003 (verificati). Pause, maggiorazioni e deroghe specifiche del **CCNL Turismo** vanno confermate con il tuo consulente del lavoro prima di usare i turni per scopi contrattuali.



- Modulo dedicato **imposta di soggiorno** (incassata vs versata) e **commissioni OTA**.
- **Spese ricorrenti** automatiche (utenze, abbonamenti).
- **Budget vs consuntivo** e grafici di trend / confronto anno su anno.
- **Anagrafica fornitori** con scheda e storico.
- **Query in linguaggio naturale** ("quanto ho speso in pulizie a marzo?").
- Ruoli (admin / staff / commercialista in sola lettura) via RLS.
- PWA offline per cattura scontrini senza rete.
