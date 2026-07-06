// Help guide data — all modules and their step-by-step guides

import { canAccess, type Role } from "@/lib/permissions";

export type GuideStep = { title: string; description: string; icon: string };
export type Guide = { id: string; title: string; steps: GuideStep[]; tip: string; adminOnly?: boolean };
export type HelpModule = {
  id: string;
  label: string;
  description: string;
  color: string;
  icon: string; // svg path(s) inside 24x24 viewBox
  guides: Guide[];
  /** Route this module corresponds to (used for permission check) */
  route?: string;
  aChiamataOnly?: boolean;
};

export const HELP_MODULES: HelpModule[] = [
  {
    id: "cassa",
    label: "Cassa",
    description: "Gestione entrate, uscite e chiusura turno cassa",
    color: "#BFA762",
    route: "/cassa",
    icon: "M2 4h20v16H2zM2 10h20",
    guides: [
      {
        id: "registrare-entrata",
        title: "Come registrare un'entrata contanti",
        steps: [
          { title: "Apri la pagina Cassa", description: "Dalla sidebar o dal menu in basso, tocca Cassa.", icon: "1" },
          { title: "Seleziona +Entrata", description: "Clicca sul bottone verde +Entrata in alto.", icon: "2" },
          { title: "Inserisci l'importo", description: "Digita l'importo ricevuto in euro (es. 15,00).", icon: "3" },
          { title: "Scegli la categoria", description: "Seleziona la categoria dal menu a tendina (Camera, Bar, Colazione...).", icon: "4" },
          { title: "Aggiungi una descrizione", description: "Scrivi una breve nota per ricordare il motivo (es. 'Camera 3 notte extra').", icon: "5" },
          { title: "Registra", description: "Clicca Registra per confermare. Il movimento appare nella lista.", icon: "6" },
        ],
        tip: "Se usi spesso gli stessi importi, prova i bottoni rapidi nella parte alta della pagina Cassa.",
      },
      {
        id: "registrare-uscita",
        title: "Come registrare un'uscita",
        steps: [
          { title: "Apri la pagina Cassa", description: "Dalla sidebar o dal menu in basso, tocca Cassa.", icon: "1" },
          { title: "Seleziona -Uscita", description: "Clicca sul bottone rosso -Uscita.", icon: "2" },
          { title: "Inserisci l'importo", description: "Digita l'importo speso.", icon: "3" },
          { title: "Scegli la categoria", description: "Seleziona la categoria (Spesa piccola, Fornitore, Fondo cassa dato...).", icon: "4" },
          { title: "Aggiungi una descrizione", description: "Descrivi brevemente l'uscita.", icon: "5" },
          { title: "Registra", description: "Conferma cliccando Registra.", icon: "6" },
        ],
        tip: "Per le spese piccole (caffe, acqua), usa i bottoni rapidi se disponibili.",
      },
      {
        id: "bottoni-rapidi",
        title: "Come usare i bottoni rapidi",
        steps: [
          { title: "Trova i bottoni rapidi", description: "Nella parte alta della pagina Cassa, trovi i bottoni configurati (Caffe, Acqua, Birra...).", icon: "1" },
          { title: "Clicca sul bottone", description: "Tocca il bottone dell'articolo venduto.", icon: "2" },
          { title: "Conferma l'importo", description: "Verifica che l'importo sia corretto e conferma.", icon: "3" },
          { title: "Movimento registrato", description: "Il movimento viene registrato automaticamente con la categoria giusta.", icon: "4" },
        ],
        tip: "I bottoni rapidi sono configurabili dall'amministratore in Impostazioni > Cassa.",
      },
      {
        id: "consegnare-fondo",
        title: "Come consegnare il fondo cassa",
        steps: [
          { title: "Seleziona -Uscita", description: "Apri la Cassa e clicca -Uscita.", icon: "1" },
          { title: "Scegli 'Fondo cassa dato'", description: "Come categoria, seleziona 'Fondo cassa dato'.", icon: "2" },
          { title: "Inserisci il nome del ricevente", description: "Nella descrizione, scrivi a chi stai consegnando il fondo (es. 'Consegnato a Adrian').", icon: "3" },
          { title: "Inserisci l'importo", description: "Digita l'importo che stai consegnando.", icon: "4" },
          { title: "Registra", description: "Conferma per registrare la consegna.", icon: "5" },
        ],
        tip: "Consegna il fondo quando il saldo supera i 50 EUR. Vedrai l'avviso 'Da consegnare' nella pagina Cassa.",
      },
      {
        id: "chiudere-cassa",
        title: "Come chiudere la cassa a fine turno",
        steps: [
          { title: "Clicca 'Chiudi cassa'", description: "In fondo alla pagina Cassa, clicca il bottone Chiudi cassa.", icon: "1" },
          { title: "Controlla il riepilogo", description: "Verifica entrate, uscite e saldo atteso del turno.", icon: "2" },
          { title: "Conta i contanti fisici", description: "Conta i soldi nel cassetto e inserisci il totale.", icon: "3" },
          { title: "Conferma la chiusura", description: "Clicca Conferma. La sessione viene chiusa e archiviata.", icon: "4" },
        ],
        tip: "Se c'e una differenza tra il saldo atteso e quello fisico, verra segnalata all'amministratore. E normale una piccola differenza di qualche centesimo.",
      },
      {
        id: "da-consegnare",
        title: "Cosa significa 'Da consegnare'",
        steps: [
          { title: "Il saldo supera il fondo", description: "Quando i contanti in cassa superano la soglia (di solito 50 EUR), il sistema mostra l'avviso 'Da consegnare'.", icon: "1" },
          { title: "L'importo da consegnare", description: "Il sistema calcola quanto va consegnato: tutto cio che supera il fondo cassa stabilito.", icon: "2" },
          { title: "Registra la consegna", description: "Segui la guida 'Come consegnare il fondo cassa' per registrare l'avvenuta consegna.", icon: "3" },
        ],
        tip: "La soglia del fondo cassa e configurata dall'amministratore. Se non sei sicuro dell'importo, chiedi prima di consegnare.",
      },
    ],
  },
  {
    id: "turni",
    label: "Turni",
    description: "Calendario turni, assegnazioni e permessi",
    color: "#4F7B8C",
    route: "/turni",
    icon: "M3 4h18v17H3zM3 9h18M8 2v4M16 2v4",
    guides: [
      {
        id: "leggere-calendario",
        title: "Come leggere il calendario turni",
        steps: [
          { title: "Apri la pagina Turni", description: "Dalla sidebar o dal menu, tocca Turni.", icon: "1" },
          { title: "Scegli la vista", description: "In alto puoi passare tra vista Mese e vista Settimana.", icon: "2" },
          { title: "Leggi le assegnazioni", description: "Ogni cella mostra il nome della persona assegnata al turno (mattina, pomeriggio, ecc.).", icon: "3" },
          { title: "I colori", description: "Ogni tipo di turno ha un colore diverso. Le celle vuote non hanno assegnazioni.", icon: "4" },
        ],
        tip: "Usa la vista Settimana per un dettaglio maggiore, la vista Mese per una panoramica rapida.",
      },
      {
        id: "richiedere-permesso",
        title: "Come richiedere un permesso o ferie",
        steps: [
          { title: "Contatta l'amministratore", description: "Per richiedere permessi, ferie o malattia, contatta Adrian o Daniela.", icon: "1" },
          { title: "Comunica le date", description: "Indica le date esatte e il tipo di assenza (permesso, ferie, malattia).", icon: "2" },
          { title: "Attendi conferma", description: "L'amministratore inserira l'assenza nel sistema e vedrai il turno aggiornato.", icon: "3" },
        ],
        tip: "Richiedi i permessi con il massimo anticipo possibile per facilitare l'organizzazione dei turni.",
      },
      {
        id: "vedere-turni",
        title: "Come vedere i propri turni",
        steps: [
          { title: "Apri Turni", description: "Vai alla pagina Turni dalla sidebar o dal menu.", icon: "1" },
          { title: "Cerca il tuo nome", description: "Scorri il calendario e cerca le celle con il tuo nome.", icon: "2" },
          { title: "Verifica mattina/pomeriggio", description: "Controlla a quale turno sei assegnato guardando la riga (mattina o pomeriggio).", icon: "3" },
        ],
        tip: "Controlla i turni regolarmente, soprattutto a inizio settimana, perche possono cambiare.",
      },
      {
        id: "assegnare-turni",
        title: "Come assegnare i turni",
        adminOnly: true,
        steps: [
          { title: "Apri Turni", description: "Vai alla pagina Turni.", icon: "1" },
          { title: "Clicca sulla cella", description: "Clicca sulla cella del giorno e turno che vuoi assegnare.", icon: "2" },
          { title: "Seleziona la persona", description: "Dal menu a tendina, scegli la persona da assegnare.", icon: "3" },
          { title: "Salva", description: "Clicca Salva per confermare tutte le modifiche.", icon: "4" },
        ],
        tip: "Il sistema blocca automaticamente l'assegnazione di persone in permesso/ferie/malattia.",
      },
      {
        id: "inserire-permesso",
        title: "Come inserire un permesso",
        adminOnly: true,
        steps: [
          { title: "Apri la sezione Assenze", description: "Nella pagina Turni, cerca la sezione Assenze/Permessi.", icon: "1" },
          { title: "Seleziona la persona", description: "Scegli il membro dello staff.", icon: "2" },
          { title: "Scegli il tipo", description: "Seleziona Permesso, Ferie o Malattia.", icon: "3" },
          { title: "Imposta le date", description: "Indica data inizio e fine, e il periodo (giornata intera, mattina o pomeriggio).", icon: "4" },
          { title: "Conferma", description: "Salva. La persona sara automaticamente bloccata dai turni in quelle date.", icon: "5" },
        ],
        tip: "Dopo aver inserito un permesso, controlla che i turni di quei giorni siano coperti.",
      },
    ],
  },
  {
    id: "spese",
    label: "Spese",
    description: "Registrazione e consultazione spese",
    color: "#6C6B5D",
    route: "/spese",
    icon: "M4 6h16M4 12h16M4 18h10",
    guides: [
      {
        id: "registrare-spesa",
        title: "Come registrare una nuova spesa",
        steps: [
          { title: "Vai su Nuova spesa", description: "Dalla sidebar o menu, tocca 'Nuova spesa'.", icon: "1" },
          { title: "Foto scontrino (opzionale)", description: "Se hai lo scontrino, scatta una foto. I dati verranno estratti automaticamente.", icon: "2" },
          { title: "Controlla i dati", description: "Verifica importo, descrizione, categoria. Correggi se necessario.", icon: "3" },
          { title: "Seleziona la categoria", description: "Scegli la categoria di spesa dal menu a tendina.", icon: "4" },
          { title: "Salva", description: "Clicca Salva per registrare la spesa.", icon: "5" },
        ],
        tip: "La scansione dello scontrino funziona meglio con foto nitide e ben illuminate. Controlla sempre i dati estratti.",
      },
      {
        id: "cercare-spesa",
        title: "Come cercare una spesa",
        steps: [
          { title: "Apri la pagina Spese", description: "Dalla sidebar, tocca Spese.", icon: "1" },
          { title: "Usa i filtri", description: "Filtra per mese, categoria o stato di pagamento.", icon: "2" },
          { title: "Scorri la lista", description: "Le spese sono ordinate per data, le piu recenti in alto.", icon: "3" },
        ],
        tip: "Usa il filtro categoria per trovare rapidamente spese di un tipo specifico.",
      },
      {
        id: "modificare-spesa",
        title: "Come modificare o eliminare una spesa",
        steps: [
          { title: "Trova la spesa", description: "Nella pagina Spese, trova la spesa da modificare.", icon: "1" },
          { title: "Clicca sulla riga", description: "Tocca la spesa per aprire il dettaglio.", icon: "2" },
          { title: "Modifica o elimina", description: "Usa i bottoni Modifica o Elimina per aggiornare o rimuovere la spesa.", icon: "3" },
        ],
        tip: "Solo gli amministratori possono eliminare le spese. Se non vedi il bottone, chiedi all'amministratore.",
      },
    ],
  },
  {
    id: "magazzino",
    label: "Magazzino",
    description: "Prodotti, carichi, scarichi e scanner barcode",
    color: "#2D5A3D",
    route: "/magazzino",
    icon: "M21 16V8l-9-5-9 5v8l9 5 9-5zM3.3 7L12 12l8.7-5M12 22V12",
    guides: [
      {
        id: "aggiungere-prodotto",
        title: "Come aggiungere un prodotto",
        steps: [
          { title: "Apri Magazzino", description: "Dalla sidebar, tocca Magazzino.", icon: "1" },
          { title: "Clicca + Nuovo prodotto", description: "Premi il bottone per aggiungere un prodotto.", icon: "2" },
          { title: "Compila il form", description: "Inserisci nome, categoria, unita di misura, scorta minima.", icon: "3" },
          { title: "Barcode (opzionale)", description: "Se il prodotto ha un codice a barre, scansionalo o digitalo.", icon: "4" },
          { title: "Salva", description: "Conferma per creare il prodotto.", icon: "5" },
        ],
        tip: "Imposta la scorta minima per ricevere un avviso quando il prodotto sta finendo.",
      },
      {
        id: "carico-merce",
        title: "Come fare un carico merce",
        steps: [
          { title: "Apri Magazzino", description: "Vai alla pagina Magazzino.", icon: "1" },
          { title: "Cerca il prodotto", description: "Usa la barra di ricerca o scorri la lista.", icon: "2" },
          { title: "Clicca Carico", description: "Premi il bottone Carico accanto al prodotto.", icon: "3" },
          { title: "Inserisci la quantita", description: "Digita la quantita ricevuta.", icon: "4" },
          { title: "Salva", description: "Conferma il carico. La giacenza si aggiorna automaticamente.", icon: "5" },
        ],
        tip: "Controlla sempre la bolla del fornitore prima di confermare il carico.",
      },
      {
        id: "scarico-merce",
        title: "Come fare uno scarico",
        steps: [
          { title: "Apri Magazzino", description: "Vai alla pagina Magazzino.", icon: "1" },
          { title: "Cerca il prodotto", description: "Trova il prodotto da scaricare.", icon: "2" },
          { title: "Clicca Scarico", description: "Premi il bottone Scarico.", icon: "3" },
          { title: "Inserisci la quantita", description: "Digita la quantita utilizzata o scartata.", icon: "4" },
          { title: "Salva", description: "Conferma lo scarico.", icon: "5" },
        ],
        tip: "Registra gli scarichi regolarmente per avere giacenze accurate.",
      },
      {
        id: "scanner-barcode",
        title: "Come usare lo scanner barcode con il telefono",
        steps: [
          { title: "Clicca l'icona fotocamera", description: "Nella barra di ricerca del Magazzino, tocca l'icona della fotocamera.", icon: "1" },
          { title: "Inquadra il codice a barre", description: "Punta la fotocamera sul codice a barre del prodotto.", icon: "2" },
          { title: "Attendi il beep", description: "Quando il codice viene letto, sentirai un suono di conferma.", icon: "3" },
          { title: "Conferma il prodotto", description: "Il sistema mostra il prodotto trovato. Procedi con carico o scarico.", icon: "4" },
        ],
        tip: "Lo scanner funziona meglio con buona illuminazione e tenendo il telefono a 15-20 cm dal codice a barre.",
      },
    ],
  },
  {
    id: "disponibilita",
    label: "Disponibilita",
    description: "Invio disponibilita mensile per staff a chiamata",
    color: "#C77B4A",
    route: "/disponibilita",
    aChiamataOnly: true,
    icon: "M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2M8 2h8v4H8zM9 14l2 2 4-4",
    guides: [
      {
        id: "inviare-disponibilita",
        title: "Come inviare le disponibilita",
        steps: [
          { title: "Apri Disponibilita", description: "Dalla sidebar o menu, tocca Disponibilita.", icon: "1" },
          { title: "Seleziona il mese", description: "Il calendario mostra il mese prossimo. Verifica che sia quello giusto.", icon: "2" },
          { title: "Clicca sugli slot", description: "Per ogni giorno, clicca su M (mattina) o P (pomeriggio) per indicare la tua disponibilita.", icon: "3" },
          { title: "Cicla tra le opzioni", description: "Ogni click cambia lo stato: disponibile, preferito, non disponibile.", icon: "4" },
          { title: "Invia", description: "Quando hai completato, clicca Invia disponibilita.", icon: "5" },
        ],
        tip: "Compila le disponibilita il prima possibile: aiuta l'amministratore a organizzare i turni con anticipo.",
      },
      {
        id: "significato-colori",
        title: "Cosa significano i colori",
        steps: [
          { title: "Verde = Disponibile", description: "Sei disponibile a lavorare in quello slot.", icon: "1" },
          { title: "Oro = Preferito", description: "Preferisci lavorare in quello slot (il sistema dara priorita).", icon: "2" },
          { title: "Rosso = Non disponibile", description: "Non puoi lavorare in quello slot.", icon: "3" },
          { title: "Grigio = Non specificato", description: "Non hai ancora indicato la tua disponibilita per quello slot.", icon: "4" },
        ],
        tip: "Usa 'Preferito' per i giorni in cui vorresti lavorare di piu: il sistema ne terra conto.",
      },
      {
        id: "modificare-disponibilita",
        title: "Quante volte posso modificare",
        steps: [
          { title: "Primo invio", description: "Puoi inviare le disponibilita una prima volta.", icon: "1" },
          { title: "Una modifica", description: "Dopo il primo invio, hai diritto a 1 modifica.", icon: "2" },
          { title: "Entro il 25 del mese", description: "Le modifiche devono essere fatte entro il 25 del mese corrente.", icon: "3" },
        ],
        tip: "Prenditi il tempo per compilare bene al primo invio, cosi non sprechi la modifica.",
      },
      {
        id: "dopo-scadenza",
        title: "Cosa succede dopo il 25",
        steps: [
          { title: "Chiusura invii", description: "Dopo il 25 del mese, non puoi piu inviare o modificare le disponibilita.", icon: "1" },
          { title: "L'admin organizza", description: "L'amministratore usa le disponibilita inviate per creare il calendario turni.", icon: "2" },
          { title: "Se non hai inviato", description: "Se non hai inviato le disponibilita, l'amministratore riceve un avviso e potrebbe contattarti.", icon: "3" },
        ],
        tip: "Se hai un imprevisto dopo il 25, contatta direttamente l'amministratore.",
      },
    ],
  },
  {
    id: "documenti",
    label: "Documenti",
    description: "Caricamento e gestione documenti con scadenze",
    color: "#4F7B8C",
    route: "/documenti",
    icon: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
    guides: [
      {
        id: "caricare-documento",
        title: "Come caricare un documento",
        steps: [
          { title: "Apri Documenti", description: "Dalla sidebar, tocca Documenti.", icon: "1" },
          { title: "Clicca + Nuovo documento", description: "Premi il bottone per caricare un nuovo file.", icon: "2" },
          { title: "Seleziona il file", description: "Scegli il file dal tuo dispositivo (PDF, immagine, ecc.).", icon: "3" },
          { title: "Compila i dettagli", description: "Inserisci nome, categoria e note.", icon: "4" },
          { title: "Salva", description: "Conferma il caricamento.", icon: "5" },
        ],
        tip: "Usa nomi descrittivi per i documenti: facilitano la ricerca futura.",
      },
      {
        id: "impostare-scadenza",
        title: "Come impostare una scadenza",
        steps: [
          { title: "Apri il documento", description: "Nella lista documenti, clicca sul documento.", icon: "1" },
          { title: "Imposta la scadenza", description: "Nel campo Data scadenza, seleziona la data.", icon: "2" },
          { title: "Salva", description: "Conferma. Riceverai un avviso quando la scadenza si avvicina.", icon: "3" },
        ],
        tip: "Il sistema avvisa 30 giorni e 7 giorni prima della scadenza. Controlla regolarmente.",
      },
    ],
  },
  {
    id: "inventario",
    label: "Inventario",
    description: "Conte inventariali e controllo giacenze",
    color: "#2D5A3D",
    route: "/inventario",
    icon: "M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11",
    guides: [
      {
        id: "iniziare-conta",
        title: "Come iniziare una conta inventario",
        steps: [
          { title: "Apri Inventario", description: "Dalla sidebar, tocca Inventario.", icon: "1" },
          { title: "Clicca Nuova conta", description: "Premi il bottone per avviare una nuova sessione.", icon: "2" },
          { title: "Seleziona le categorie", description: "Scegli quali categorie di prodotti contare.", icon: "3" },
          { title: "Inizia il conteggio", description: "Per ogni prodotto, inserisci la quantita contata fisicamente.", icon: "4" },
          { title: "Chiudi la sessione", description: "Quando hai finito, chiudi la sessione per salvare i risultati.", icon: "5" },
        ],
        tip: "Fai l'inventario con regolarita (almeno una volta al mese) per tenere le giacenze allineate.",
      },
      {
        id: "scanner-inventario",
        title: "Come usare lo scanner durante l'inventario",
        steps: [
          { title: "Apri lo scanner", description: "Durante la conta, tocca l'icona fotocamera.", icon: "1" },
          { title: "Scansiona il prodotto", description: "Inquadra il codice a barre. Il prodotto viene trovato automaticamente.", icon: "2" },
          { title: "Inserisci la quantita", description: "Digita quanti pezzi hai contato.", icon: "3" },
          { title: "Passa al prossimo", description: "Scansiona il prossimo prodotto e ripeti.", icon: "4" },
        ],
        tip: "Lo scanner velocizza molto l'inventario. Assicurati di avere buona luce.",
      },
    ],
  },
  {
    id: "utenze",
    label: "Utenze",
    description: "Registrazione e monitoraggio bollette",
    color: "#9E3B2E",
    route: "/utenze",
    icon: "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
    guides: [
      {
        id: "registrare-bolletta",
        title: "Come registrare una bolletta",
        steps: [
          { title: "Apri Utenze", description: "Dalla sidebar, tocca Utenze.", icon: "1" },
          { title: "Clicca + Nuova bolletta", description: "Premi il bottone per aggiungere una bolletta.", icon: "2" },
          { title: "Seleziona il tipo", description: "Scegli il tipo di utenza (elettricita, gas, acqua, internet...).", icon: "3" },
          { title: "Compila i dettagli", description: "Inserisci importo, periodo di riferimento, data scadenza.", icon: "4" },
          { title: "Carica il documento", description: "Opzionale: allega il PDF della bolletta.", icon: "5" },
          { title: "Salva", description: "Conferma per registrare la bolletta.", icon: "6" },
        ],
        tip: "Registra le bollette appena arrivano per non perdere le scadenze di pagamento.",
      },
    ],
  },
  {
    id: "controlli-analisi",
    label: "Controlli e Analisi",
    description: "Registro controlli di laboratorio, referti e scadenze",
    color: "#4F7B8C",
    route: "/controlli-analisi",
    icon: "M6 18h8M3 22h18M14 22a7 7 0 100-14h-1M9 14h2M9 12a2 2 0 01-2-2V6h6v4a2 2 0 01-2 2zM12 6V3a1 1 0 00-1-1H9a1 1 0 00-1 1v3",
    guides: [
      {
        id: "registrare-controllo",
        title: "Come registrare un nuovo controllo",
        steps: [
          { title: "Apri Controlli e Analisi", description: "Dalla sidebar o dal menu, tocca Controlli e Analisi.", icon: "1" },
          { title: "Clicca + Nuovo controllo", description: "Premi il bottone per aggiungere un controllo.", icon: "2" },
          { title: "Compila i dati", description: "Seleziona tipo, laboratorio, data prelievo, periodicita e esito.", icon: "3" },
          { title: "Aggiungi i punti di prelievo", description: "Per ogni punto, inserisci nome, esito e carica il referto PDF.", icon: "4" },
          { title: "Salva", description: "Conferma per registrare il controllo con tutti i punti.", icon: "5" },
        ],
        tip: "Aggiungi tutti i punti di prelievo in un'unica sessione. Puoi caricare i referti PDF per ogni punto.",
      },
      {
        id: "scadenze-controlli",
        title: "Come monitorare le scadenze",
        steps: [
          { title: "Controlla il banner", description: "In alto nella pagina vedrai un avviso se ci sono controlli scaduti o in scadenza.", icon: "1" },
          { title: "Verifica la colonna Prossimo", description: "Nella tabella, la colonna Prossimo controllo mostra la data evidenziata se scaduta.", icon: "2" },
          { title: "Programma il nuovo controllo", description: "Quando un controllo e in scadenza, contatta il laboratorio e registra il nuovo controllo.", icon: "3" },
        ],
        tip: "Imposta la periodicita in mesi per avere il calcolo automatico della prossima scadenza.",
      },
    ],
  },
  {
    id: "report",
    label: "Report",
    description: "Genera report mensili in PDF con riepilogo spese, cassa, utenze e magazzino.",
    color: "#4F7B8C",
    icon: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M8 13h8M8 17h8",
    route: "/report",
    guides: [
      {
        id: "generare-report",
        title: "Come generare un report mensile",
        steps: [
          { title: "Apri Report", description: "Dalla sidebar, tocca Report.", icon: "1" },
          { title: "Seleziona il mese", description: "Scegli il mese dal menu a tendina.", icon: "2" },
          { title: "Genera report", description: "Premi Genera report per caricare i dati.", icon: "3" },
          { title: "Scarica PDF", description: "Premi Scarica PDF per salvare il report.", icon: "4" },
        ],
        tip: "Genera il report a fine mese per avere un riepilogo completo da archiviare o condividere con il commercialista.",
      },
    ],
  },
  {
    id: "statistiche",
    label: "Statistiche",
    description: "Grafici annuali con andamento spese, flusso cassa e utenze.",
    color: "#2D5A3D",
    icon: "M18 20V10M12 20V4M6 20v-6",
    route: "/statistiche",
    guides: [
      {
        id: "consultare-statistiche",
        title: "Come consultare le statistiche",
        steps: [
          { title: "Apri Statistiche", description: "Dalla sidebar, tocca Statistiche.", icon: "1" },
          { title: "Naviga per anno", description: "Usa le frecce per cambiare anno.", icon: "2" },
          { title: "Analizza i grafici", description: "Spese mensili, categorie, flusso cassa, utenze — tutto in un colpo d'occhio.", icon: "3" },
        ],
        tip: "Confronta i mesi per individuare tendenze e anomalie di spesa.",
      },
    ],
  },
];

export function isModuleVisible(m: HelpModule, userRole: string, isAChiamata: boolean): boolean {
  if (m.route) return canAccess(userRole as Role, m.route, isAChiamata);
  return true;
}

// Get all guides as flat array (for search)
export function getAllGuides(userRole: string, isAChiamata: boolean): { module: HelpModule; guide: Guide }[] {
  return HELP_MODULES
    .filter(m => isModuleVisible(m, userRole, isAChiamata))
    .flatMap(m =>
      m.guides
        .filter(g => !g.adminOnly || userRole === "admin")
        .map(g => ({ module: m, guide: g }))
    );
}

// Get modules visible to user
export function getVisibleModules(userRole: string, isAChiamata: boolean): HelpModule[] {
  return HELP_MODULES.filter(m => isModuleVisible(m, userRole, isAChiamata));
}
