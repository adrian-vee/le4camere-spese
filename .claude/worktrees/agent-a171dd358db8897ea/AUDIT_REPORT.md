# AUDIT REPORT — Le 4 Camere Hub Gestionale Alberghiero

## Data: 15 giugno 2026
## Versione: b74d8cf (fix: centra logo e GESTIONALE ALBERGHIERO nella sidebar desktop)
## Metodologia: 6 subagenti paralleli (struttura, qualita codice, database/sicurezza, moduli A-J, moduli K-U, UI/UX)

---

## RIEPILOGO ESECUTIVO

| Categoria | Conteggio |
|-----------|-----------|
| Problemi CRITICI | 8 |
| Problemi IMPORTANTI | 42 |
| Problemi MINORI | 35+ |
| Moduli analizzati | 21 |
| File analizzati | 80+ |
| Build | OK (zero errori) |

### Problemi sistemici trasversali (ricorrono in OGNI modulo)
1. **Nessuna transazione database** — ogni operazione multi-step usa chiamate Supabase sequenziali. Un fallimento a meta lascia il DB inconsistente.
2. **Autorizzazione solo client-side** — `useRole()` nasconde pulsanti, ma nessun controllo server-side. La sicurezza dipende interamente da RLS (non verificabile nel repo).
3. **Error handling mancante sulle mutazioni** — `{ error }` da `.insert()`, `.update()`, `.delete()` ignorato nella grande maggioranza delle chiamate.
4. **Bug timezone `toISOString().slice(0,10)`** — usato ovunque per date. In Italia (UTC+1/+2), le date vicine a mezzanotte sono sbagliate di un giorno. Esiste `localIso()` in `turni.ts` ma non e usato coerentemente.
5. **Nessuna validazione file upload** — documenti, personale, utenze, fornitori accettano upload senza restrizioni tipo/dimensione.
6. **File enormi** — 6 file superano 1000 righe (max 1752), difficili da mantenere.

---

## PROBLEMI CRITICI

### C01. Cassa — Dead code rilevamento sessioni non chiuse
- **File:** `src/app/(app)/cassa/page.tsx:469-477`
- **Problema:** `anyOpen = sess.find(s => s.status === "open")` dentro `if (!open)`. Siccome `open` e stato trovato con la stessa logica alla riga 463, nel blocco `if (!open)` `anyOpen` e sempre `null`. Il warning per sessioni aperte precedenti non viene MAI mostrato.
- **Impatto:** L'utente non sa mai se c'e una sessione aperta dimenticata.

### C02. Turni — DELETE-then-INSERT non atomico per i turni del mese
- **File:** `src/app/(app)/turni/page.tsx:333-339`
- **Problema:** Auto-save fa DELETE di tutti i turni del mese, poi INSERT dei nuovi. Se il browser si chiude o la rete cade tra le due operazioni, un intero mese di turni viene cancellato senza reinserimento.
- **Impatto:** Perdita completa dati turni mese.

### C03. Fornitori NuovoArrivo — 7+ mutazioni sequenziali senza transazione
- **File:** `src/app/(app)/fornitori/NuovoArrivo.tsx:127-214`
- **Problema:** Inserimento consegna, items, N movimenti stock, N lotti, N aggiornamenti prodotto, creazione spesa, aggiornamento consegna — tutto sequenziale. Qualsiasi fallimento a meta lascia record orfani su 6 tabelle.
- **Impatto:** Dati finanziari e magazzino inconsistenti.

### C04. Utenze — Salvataggio bolletta+spesa non atomico
- **File:** `src/app/(app)/utenze/page.tsx:253-304`
- **Problema:** Inserimento bolletta, upload file, aggiornamento bolletta, creazione spesa, aggiornamento bolletta — senza transazione. Se la creazione spesa fallisce, toast dice "spesa creata" ugualmente.
- **Impatto:** Utente ingannato su record finanziario non creato.

### C05. N+1 Query — notifications/check/route.ts
- **File:** `src/app/api/notifications/check/route.ts:90-163`
- **Problema:** Loop per ogni documento in scadenza chiama `getAdminManagerIds()` + `insertIfNew()` (SELECT + INSERT per ogni doc x ogni admin). Con 10 documenti e 3 admin = 60+ query individuali.
- **Impatto:** Timeout API, performance degradata.

### C06. N+1 Query — drink-lab/deduct/route.ts
- **File:** `src/app/api/drink-lab/deduct/route.ts:19-91`
- **Problema:** Loop per ogni ingrediente esegue 2-4 query (SELECT, SELECT, UPDATE, INSERT). Con 5 ingredienti = 10-20 query sequenziali.
- **Impatto:** Lentezza nell'ordinare cocktail, possibile timeout.

### C07. N+1 Query — privacy/send-consent-email/route.ts
- **File:** `src/app/api/privacy/send-consent-email/route.ts:109-189`
- **Problema:** Per ogni profile_id singoli `getUserById()`, `upsert`, `sendMail`. Con 20 staff = 60+ query + chiamate SMTP sequenziali.
- **Impatto:** Timeout funzione Vercel, email non inviate.

### C08. Privacy accept-consent — API pubblica con service role key
- **File:** `src/app/api/privacy/accept-consent/route.ts:3-73`
- **Problema:** Route non autenticata usa `SUPABASE_SERVICE_ROLE_KEY` (bypassa RLS). Chiunque con un UUID token valido/brute-forced puo leggere nomi staff e marcare consenso. Nessun rate limiting.
- **Impatto:** Rischio privacy/compliance GDPR.

---

## PROBLEMI IMPORTANTI

### Sicurezza

| # | Problema | File | Note |
|---|---------|------|------|
| I01 | Open redirect in auth callback | `auth/callback/route.ts:7` | `next` param non validato, `//evil.com` redirecta fuori |
| I02 | Open redirect in login form | `login/LoginForm.tsx:101` | `redirect` param non validato |
| I03 | Nessun security header (CSP, HSTS, X-Frame-Options, etc.) | `next.config.mjs` | Solo `X-Robots-Tag` configurato |
| I04 | Nessun rate limiting su tutte le 20 API routes | Tutte le route | `create-user`, `reset-password`, `scan-receipt` vulnerabili |
| I05 | Nessuna protezione CSRF | Tutte le route POST | Dipendono solo da cookie sessione |
| I06 | Debug data esposto in produzione | `list-availability/route.ts:81-95` | Oggetto `debug` con dati interni nella response |
| I07 | Service role key senza check esistenza | `send-consent-email/route.ts:10` | `process.env.SUPABASE_SERVICE_ROLE_KEY!` senza validazione |
| I08 | Nessuna validazione password strength server-side | `create-user/route.ts` | Solo client-side min 6 caratteri |
| I09 | Smoobu API senza role check | `smoobu/apartments` e `sync` | Qualsiasi utente autenticato accede |
| I10 | HTML injection in email template | `src/lib/mailer.ts:66-103` | `name`, `hotelName` interpolati senza escape |

### Database e Query

| # | Problema | File | Note |
|---|---------|------|------|
| I11 | Query senza paginazione — spese | `spese/page.tsx:96` | Carica TUTTE le spese senza LIMIT |
| I12 | Query senza paginazione — dashboard | `page.tsx:63-78` | 16 query parallele, molte senza limite |
| I13 | Query senza paginazione — list-availability | `list-availability/route.ts:25-27` | 3 SELECT * senza filtri, filtra in JS |
| I14 | Module-level cache stale | `notifications/check/route.ts:293` | Cache admin/manager persiste tra invocazioni serverless |
| I15 | N+1 — NuovoArrivo items | `NuovoArrivo.tsx:161-188` | 3-5 call per item, 20 items = 100 HTTP requests |
| I16 | N+1 — housekeeping room mapping | `housekeeping/page.tsx:189-190` | Loop con singoli update, 20 stanze = 20 requests |
| I17 | N+1 — inventario align stock | `inventario/page.tsx:382-462` | Query individuali per discrepanza |
| I18 | Layout: 9 query DB per pagina per admin | `layout.tsx:17-81` | Server component blocca rendering |

### Qualita Codice

| # | Problema | File | Note |
|---|---------|------|------|
| I19 | `eur()` duplicato 3 volte (implementazioni diverse) | `format.ts:28`, `cassa:103`, `admin/panoramica:7` | `Intl.NumberFormat` vs `toLocaleString` |
| I20 | `fmtDate()` duplicato 3 volte | `format.ts:31`, `cassa:109`, `turni/copertura:181` | |
| I21 | `dateUtils.ts` completamente inutilizzato | `src/lib/dateUtils.ts` | 0 import, definisce utility gia duplicate |
| I22 | `showToast()` duplicato in 16 file | Ogni page component | Dovrebbe essere un hook condiviso |
| I23 | Errori Supabase ignorati silenziosamente (write) | `housekeeping` (6 punti), `spese` (4), `inventario` (3), `fornitori` (3+) | |
| I24 | Errori Supabase ignorati (bulk load) | `page.tsx:61-78`, `housekeeping:102`, `cassa:399` | `Promise.all` senza check `error` |
| I25 | 28 `eslint-disable react-hooks/exhaustive-deps` | Quasi ogni file pagina | Pattern migliorabile con `useCallback` |

### Moduli Funzionali

| # | Problema | File | Note |
|---|---------|------|------|
| I26 | Turni: race condition debounced save | `turni/page.tsx:319-345` | Cambio mese durante debounce cancella mese sbagliato |
| I27 | Turni: `today` non si aggiorna dopo mezzanotte | `turni/page.tsx:103` | Badge OGGI e blocchi stale |
| I28 | Turni: swap request approval e un no-op | `turni/page.tsx:144-151` | Aggiorna status ma non swappa turni |
| I29 | Turni: copertura e stampa senza role check | `turni/copertura/`, `turni/stampa/` | Qualsiasi utente accede |
| I30 | Disponibilita: race condition su edit_count | `save-availability:39-109` | Read-check-write senza lock |
| I31 | Fornitori: nessuna validazione quantita/prezzo | `NuovoArrivo.tsx:128,151-156` | qty 0 e price 0 passano |
| I32 | Inventario: race condition updateCount | `inventario/page.tsx:188-224` | Update ottimistico, DB write non awaited |
| I33 | Inventario: XSS in generatePDF | `inventario/page.tsx:467-510` | Nomi prodotto in HTML senza escape |
| I34 | Documenti: nessun controllo accesso | `documenti/page.tsx` | `useRole` mai importato, staff puo tutto |
| I35 | Personale: documenti con URL pubblico | `personale/page.tsx:179` | `getPublicUrl()` per contratti/documenti sensibili |
| I36 | Personale: delete-then-insert availability | `personale/page.tsx:123-129` | Se insert fallisce, dati persi |
| I37 | Utenze: filtro spese e un no-op | `utenze/page.tsx:130-133` | `expenses.filter(() => true)` |
| I38 | Spese: OCR non in questa pagina | `spese/page.tsx` | OCR e in `/nuova`, nessun link |
| I39 | Spese: nessuna paginazione lista | `spese/page.tsx` | Tutte le spese renderizzate |
| I40 | Drink Lab: fuzzy matching falsi positivi | `drink-lab/page.tsx:80-86` | "rum" matcha "drummer" |
| I41 | `--warn` colore sbagliato in CSS | `globals.css:18` | `#9E3B2E` (rosso) invece di `#C77B4A` (arancione) |
| I42 | Impostazioni-sistema: `window.location.href` durante render | `impostazioni-sistema/page.tsx:152-154` | Causa errore hydration |

---

## PROBLEMI MINORI

### Struttura e Codice

| # | Problema | File |
|---|---------|------|
| M01 | 6 file > 1000 righe: turni (1735), magazzino (1752), cassa (1675), homepage (1317), housekeeping (1171), inventario (1150) | Vari |
| M02 | `spiritsDatabase.ts` orfano (0 import) | `src/lib/spiritsDatabase.ts` |
| M03 | `sharp` in package.json ma 0 import nel codice | `package.json` |
| M04 | 5 `console.log` debug in produzione | `list-availability/route.ts:22,30,36,42,93` |
| M05 | Nessun `favicon.ico` | `public/` |
| M06 | `isoToday()` pattern ripetuto 20+ volte | Ogni pagina |
| M07 | Modal boilerplate identico in 12+ posti | Ogni pagina |
| M08 | `HOURLY_RATE = 8` hardcoded | `page.tsx:474` |
| M09 | Object URL mai revocati (memory leak) | `spese:151`, `admin/attivita:98`, `utenze:349` |
| M10 | `any` types per state | `turni:85`, `impostazioni-sistema:105`, `statistiche:133` |

### UI/UX

| # | Problema | File |
|---|---------|------|
| M11 | Sidebar + BottomNav: ~250 righe icone SVG duplicate | `Sidebar.tsx`, `BottomNav.tsx` |
| M12 | BottomNav drawer non mostra nome/ruolo utente | `BottomNav.tsx` |
| M13 | 5a KPI card nascosta su mobile senza avviso | `globals.css:618` |
| M14 | Statistiche: grid 2 colonne hardcoded, si schiacciano su mobile | `statistiche/page.tsx:187,239` |
| M15 | `alert()` invece di toast in fornitori e cassa | `fornitori:115,125`, `cassa:580,589` |
| M16 | Filtri persi al refresh (spese, magazzino, utenze) | Vari |
| M17 | `aiuto/page.tsx`: `isAChiamata` legge localStorage mai scritto | `aiuto/page.tsx:14` |
| M18 | Layout: matching nome staff fragile (solo primo nome) | `layout.tsx:29-32` |

### Formato e Localizzazione

| # | Problema | File |
|---|---------|------|
| M19 | 1 `type="date"` nativo rimasto | `privacy/page.tsx:641` |
| M20 | 9 tag `<img>` senza `next/image` | Vari (drink-lab, impostazioni, gestione-account, nuova, InstallBanner, NewProductModal, Sidebar) |

### PWA

| # | Problema | File |
|---|---------|------|
| M21 | Manifest manca `id` field (raccomandato per installabilita) | `public/manifest.json` |
| M22 | Service worker cache solo offline.html e icone — non caches risorse app | `public/sw.js` |
| M23 | Nessun `favicon.ico` (solo PNG icons) | `public/` |

### Accessibilita

| # | Problema | File |
|---|---------|------|
| M24 | Modal senza `aria-modal`, `role="dialog"`, focus trap, Escape handler | Tutti i modal |
| M25 | AvailabilityCalendar senza ARIA grid roles, no keyboard navigation | `AvailabilityCalendar.tsx:41-125` |
| M26 | Turni toast auto-dismiss 2s — errori spariscono troppo velocemente | `turni/page.tsx:110` |

### Altro

| # | Problema | File |
|---|---------|------|
| M27 | CSV export vulnerabile a formula injection | `utenze/page.tsx:332-352` |
| M28 | Documenti: CSV esporta tutti i documenti, ignora filtri attivi | `documenti/page.tsx:198-218` |
| M29 | Documenti: signed URL scade in 60s, troppo poco per connessioni lente | `documenti/page.tsx:169` |
| M30 | Housekeeping: delete-all-then-reinsert consumabili non atomico | `housekeeping/page.tsx:236` |
| M31 | Personale: file eliminato da DB ma non da storage | `personale/page.tsx:200-204` |
| M32 | Nessun button disabled/loading state su molte azioni — double-click crea duplicati | Vari |
| M33 | `report/page.tsx`: cast `lastAutoTable` non sicuro ripetuto 4 volte | `report/page.tsx:161,184,210,237` |
| M34 | Utenze: `window.open` senza `noopener` | `utenze/page.tsx:327-329` |
| M35 | Documenti: `window.open` senza `noopener` | `documenti/page.tsx:175` |

---

## MODULO PER MODULO

### Homepage / Panoramica
- **Stato:** ✅ Funzionante
- KPI corretti, greeting basato su 3 fasce orarie, tutti i widget presenti
- Minore: `HOURLY_RATE = 8` hardcoded, file 1317 righe

### Cassa
- **Stato:** ⚠️ Bug rilevamento sessioni aperte
- Fondo cassa, carry-over, quick buttons, chiusura, stampa, storico: OK
- **Critico:** Dead code `anyOpen` (C01) — warning sessioni non chiuse non funziona MAI
- Automazione Cassa→Spese: funzionante

### Spese
- **Stato:** ⚠️ Manca OCR e paginazione
- Filtri, ricorrenti, badge fornitore, CSV export: OK
- **Importante:** OCR e in `/nuova` non in `/spese`, nessun link. Nessuna paginazione.

### Turni
- **Stato:** ❌ Problemi critici
- **Critico:** DELETE-then-INSERT non atomico (C02)
- **Importante:** Race condition save, swap approval no-op, today stale, copertura/stampa senza role check
- Calendario, assenze, PDF: funzionanti nella struttura base

### Disponibilita
- **Stato:** ⚠️ Race condition edit limit
- Calendario, submit, vista admin: OK
- **Importante:** Race condition su edit_count, query senza filtri, debug data in prod

### Magazzino
- **Stato:** ✅ Modulo piu completo
- Card/table, paginazione, barcode, bottiglie, FIFO, shopping list, badge: tutto OK
- Minore: file 1752 righe

### Drink Lab
- **Stato:** ✅ Funzionante con riserva
- Ricette, immagini, prezzo editabile, filtri, ricerca: OK
- **Importante:** Fuzzy matching ingredienti puo dare falsi positivi

### Fornitori
- **Stato:** ❌ Problemi critici
- CRUD fornitori, dettaglio: OK
- **Critico:** NuovoArrivo 7+ mutazioni senza transazione (C03)
- **Importante:** N+1 pattern, nessuna validazione quantita/prezzo

### Inventario
- **Stato:** ⚠️ Race condition e errori ignorati
- Categoria, conta, bottiglie, report: funzionanti nella struttura
- **Importante:** Race condition update count, XSS in PDF, nessun auth check

### Utenze
- **Stato:** ❌ Problemi critici
- Lista, filtri, grafici: OK
- **Critico:** Salvataggio non atomico bolletta+spesa (C04)
- **Importante:** Silent failure auto-expense, filtro expenses no-op

### Documenti
- **Stato:** ⚠️ Nessun controllo accesso
- Upload, lista, scadenze, color coding: OK
- **Importante:** Nessun role check — staff puo eliminare documenti

### Personale
- **Stato:** ⚠️ Documenti sensibili esposti
- Lista, checklist, upload: OK
- **Importante:** `getPublicUrl()` per documenti sensibili (contratti, ID), delete non rimuove file da storage

### Gestione Account
- **Stato:** ✅ Funzionante
- CRUD completo, reset password, invio credenziali, activity log: OK
- Minore: usa `alert()` invece di toast

### Report
- **Stato:** ✅ Funzionante
- PDF multi-pagina con KPI, tabelle, grafici: OK
- Minore: cast `lastAutoTable` ripetuto

### Statistiche
- **Stato:** ✅ Funzionante
- Recharts, selettore periodo, KPI: OK
- Minore: grid 2 colonne non responsive

### Impostazioni
- **Stato:** ✅ Funzionante
- Profilo, password, avatar, sistema: OK
- **Importante:** `window.location.href` durante render (hydration error) in impostazioni-sistema

### Aiuto
- **Stato:** ✅ Funzionante
- Ricerca, card moduli, guide dettagliate, feedback: OK
- Minore: `isAChiamata` legge localStorage mai scritto

### Privacy
- **Stato:** ⚠️ Rischio GDPR
- Dashboard, download dati, gestione consensi: struttura OK
- **Critico:** accept-consent API pubblica con service role (C08)
- **Importante:** HTML injection email, nessun rate limiting

### Notifiche
- **Stato:** ⚠️ Performance
- Campanella, badge, dropdown, segna come lette: OK
- **Critico:** N+1 query nel check (C05)
- **Importante:** Cache stale module-level

### Ricerca Globale (Cmd+K)
- **Stato:** ❌ Non implementata
- Nessun componente CommandPalette/SearchModal trovato nel codice

### Housekeeping
- **Stato:** ⚠️ Errori ignorati
- Room generation, workflow status, checklist, foto, Smoobu sync: OK
- **Importante:** N+1 room mapping, errori mutation ignorati, delete-then-reinsert non atomico

### PWA
- **Stato:** ⚠️ Minimale
- Manifest presente e corretto, service worker registrato, icone OK
- Minore: SW caches solo offline.html, manca favicon.ico, manca `id` in manifest

---

## SICUREZZA — Riepilogo

| Area | Stato | Note |
|------|-------|------|
| Autenticazione middleware | ✅ OK | `getUser()` server-side, redirect corretto |
| RLS | ⚠️ Non verificabile | Nessun migration file nel repo |
| Auth su API routes | ✅ OK | Tutte verificano auth (tranne accept-consent by design) |
| Role check API admin | ✅ OK | Tutte le admin routes verificano ruolo |
| Role check pagine | ❌ | Solo client-side in molti moduli |
| Security headers | ❌ | Solo X-Robots-Tag, mancano CSP/HSTS/X-Frame |
| Rate limiting | ❌ | Nessuna route |
| CSRF | ❌ | Nessun token |
| Input validation API | ❌ | Nessun schema validation (Zod) |
| Open redirect | ❌ | 2 punti: auth/callback e login |
| Credenziali hardcoded | ✅ OK | Nessuna trovata, .env in .gitignore |
| dangerouslySetInnerHTML | ✅ OK | Solo per SW script statico |

---

## PERFORMANCE — Riepilogo

### Build
- **Stato:** ✅ Zero errori, zero warning
- Tutte le pagine dynamic (server-rendered)

### Bundle Size (First Load JS)

| Pagina | Size | Giudizio |
|--------|------|----------|
| /turni | 329 kB | ⚠️ Pesante (jsPDF incluso) |
| /privacy | 315 kB | ⚠️ Pesante (jsPDF incluso) |
| /turni/stampa | 309 kB | ⚠️ Pesante (jsPDF) |
| /report | 307 kB | ⚠️ Pesante (jsPDF) |
| /statistiche | 288 kB | ⚠️ Pesante (recharts) |
| /magazzino | 202 kB | OK |
| /cassa | 184 kB | OK |
| Shared | 102 kB | OK |

### Query Performance
- Dashboard admin: 16+ query parallele al caricamento
- Layout: fino a 9 query per ogni navigazione admin
- Nessuna paginazione su: spese, cash_sessions, utility_bills, absences
- 6 pattern N+1 identificati (vedi C05-C07, I15-I17)

### Immagini
- 9 tag `<img>` senza `next/image` — nessuna ottimizzazione automatica

---

## RACCOMANDAZIONI PRIORITARIE

### Priorita 1 — Sicurezza e Integrita Dati (Sprint immediato)
1. **Implementare transazioni DB** per tutte le operazioni multi-step (turni save, nuovo arrivo, bolletta+spesa, inventario align). Usare Supabase Edge Functions con transazioni PostgreSQL o RPC.
2. **Fixare open redirect** in `auth/callback/route.ts` e `LoginForm.tsx` — validare che `next`/`redirect` inizi con `/` e non con `//`.
3. **Aggiungere security headers** in `next.config.mjs` (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy).
4. **Aggiungere rate limiting** almeno su: `create-user`, `reset-password`, `scan-receipt`, `send-credentials`, `accept-consent`.
5. **Fixare accept-consent** — aggiungere rate limiting, expiry token, IP throttling.
6. **Sanitizzare HTML nelle email** (`mailer.ts`) — escape variabili interpolate.

### Priorita 2 — Bug Funzionali (Sprint successivo)
7. **Fixare dead code Cassa** `anyOpen` — il warning sessioni non chiuse non funziona.
8. **Fixare race condition turni save** — proteggere cambio mese durante debounce.
9. **Aggiungere paginazione** a spese, cash_sessions, utility_bills, absences.
10. **Fixare `--warn` colore** in `globals.css` — `#C77B4A` invece di `#9E3B2E`.
11. **Fixare fuzzy matching** Drink Lab — usare matching piu preciso.
12. **Aggiungere error handling** su tutte le mutazioni Supabase (almeno toast errore).

### Priorita 3 — Qualita e Manutenibilita
13. **Spezzare file grandi** — estrarre componenti da turni, magazzino, cassa, homepage, housekeeping, inventario.
14. **Unificare utility duplicate** — un solo `eur()`, `fmtDate()`, `showToast()` condiviso.
15. **Eliminare file orfani** — `dateUtils.ts`, `spiritsDatabase.ts`.
16. **Rimuovere `console.log`** da `list-availability/route.ts`.
17. **Aggiungere input validation** con Zod su tutte le API routes.
18. **Usare `next/image`** al posto di `<img>` per ottimizzazione automatica.
19. **Lazy loading jsPDF** — import dinamico per ridurre bundle turni/privacy/report.
20. **Implementare ricerca globale Cmd+K** — attualmente non esiste.

---

*Report generato il 15 giugno 2026 tramite audit automatizzato con 6 subagenti Claude.*
