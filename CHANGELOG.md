# Versioni di Appuntamenti

La versione si trova in due punti, da cambiare sempre insieme:
`APP_VERSION` in `index.html` e `VERSIONE` in `sw.js` (che dà anche il nome alla cache, `appuntamenti-<versione>`).
`manifest.json` non ha un numero di versione.

| Versione | Stato | Contenuto |
|---|---|---|
| 2.18.1 | Sostituita il 13/11/2026 (backup completo in project-files) | PIN obbligatorio, promemoria push, riepilogo del mattino. |
| 2.19.0 | Versione di riferimento protetta (backup del 13/11/2026), richiesta #36, non pubblicata | Restyling grafico "Premium Business". Solo aspetto: funzioni invariate. |
| 2.19.1 | Candidata verificata, non pubblicata | Correzione dell'assistente senza IA (vedi sotto). Parte dalla 2.19.0. |
| 2.19.2 | Verificata, sostituita dalla 2.19.3 | Avvio di Gmail affidabile e stato reale (vedi sotto). Parte dalla 2.19.1. |
| 2.19.3 | Pubblicata il 13/11/2026 (richiesta #37), sostituita dalla 2.19.4 | Assistente senza IA: «con» dentro il motivo non diventa un nome. Parte dalla 2.19.2. |
| 2.19.4 | Pubblicata in precedenza, sostituita il 16/11/2026 dalla 2.19.5 | Nuova Agenda "a colpo d'occhio" e colori meno scuri (vedi sotto). Parte dalla 2.19.3. |
| 2.19.5 | Pubblicata il 16/11/2026, sostituita in giornata dalla 2.19.6 | Restyling grafico mobile-first, solo CSS (vedi sotto). Parte dalla 2.19.4. |
| 2.19.6 | Pubblicata il 16/11/2026, sostituita dalla 2.19.7 | Sito web del contatto, pulsante Web e ricerca del sito con AI (vedi sotto). Parte dalla 2.19.5. |
| 2.19.7 | Pubblicata il 17/11/2026, sostituita dalla 2.20.0 | Ricerca sito AI: aziende rappresentate e recupero dagli errori 429 (vedi sotto). Parte dalla 2.19.6. |
| 2.20.0 | Pubblicata il 17/11/2026, sostituita dalla 2.21.0 | Restyling strutturale Agenda & Card (vedi sotto). Parte dalla 2.19.7. |
| 2.21.0 | Pubblicata il 17/11/2026, sostituita dalla 2.21.1 | Backup completo e ripristino (richiesta #32, vedi sotto). Parte dalla 2.20.0. |
| 2.21.1 | Pubblicata il 19/11/2026 | Assegni che pagano più fatture insieme e abbinamento con appuntamento già "pagato" (vedi sotto). Parte dalla 2.21.0. |
| 2.21.2 | Candidata, non pubblicata | Importi sempre con il punto delle migliaia (1.006,65 €), anche nelle notifiche push (vedi sotto). Parte dalla 2.21.1. |

## 2.21.2

- Tutti gli importi mostrati usano il formato italiano con il punto delle migliaia e la virgola dei decimali, anche sotto i 10.000 (prima alcuni browser mostravano `1006,65 €`, ora `1.006,65 €`): agenda, dettaglio, rate, situazione Atlantis, assegni, riepiloghi.
- Anche i campi importo nei moduli di modifica si aprono già formattati (`1.006,65`); quello che si scrive si legge come prima.
- Notifiche push (`scripts/push-promemoria.mjs`): stesso formato.
- Agenda: la colonna degli orari è più larga, così l'ora (es. `16:30`) non finisce più sotto la barra colorata; il nome dell'azienda rappresentata va a capo invece di essere tagliato.
- Nessun cambiamento ai dati salvati.

## 2.21.1

**Assegni che pagano più fatture insieme** (caso Progettomateria 19/11/2026: FT 260575 + 260613, due assegni BPPB che coprono il totale)

- `numeriFattureApp` (prima `numeroFatturaApp`): il campo "N. fattura" o il titolo possono contenere più fatture ("260575, 260613", "3064/3166/3425", "FT 1016 + 1235", "2960 e 3017"). Prima l'app leggeva tutto come un unico numero e nessuna delle fatture risultava coperta dall'appuntamento, quindi restavano in "Da pagare senza assegno". "123/2026": l'anno dopo la barra viene ignorato.
- `verificaSenzaAssegno`: oltre al controllo fattura per fattura, toglie dal riquadro un gruppo di fatture della stessa azienda (prima quelle di uno stesso appuntamento, poi tutte quelle rimaste) quando gli assegni emessi liberi fanno esattamente il loro totale.

**Abbinamento assegni con appuntamento segnato "pagato" senza rate** (caso Antonucci 19/11/2026)

- `abbinaAssegniApp`: un appuntamento recente (ultimi 60 giorni) segnato "pagato" a mano, senza rate e con modalità assegno o non indicata, prende gli assegni dell'azienda che fanno esattamente il suo importo, anche già incassati, da un mese prima dell'appuntamento in poi. Ogni rata segue lo stato del suo assegno (incassato = pagata), quindi il pagamento può tornare "da saldare" o "acconto" finché gli assegni non sono incassati. Con bonifico, contanti, carta, RiBa o altro non cambia nulla.

## 2.21.0

**Backup completo e ripristino (Altro › Dati)**

- "Scarica backup completo": file `mirisa-backup-AAAA-MM-GG-HHMM.json` con `app`, `formato: 1`, `version`, `exportedAt`, `counts`, `contatti`, `appuntamenti`. I dati sono copiati così come sono in `users/{uid}/contatti` e `users/{uid}/appuntamenti` (compreso `atlantis`), senza correzioni. Non contiene l'UID né le preferenze locali (chiave Gemini, PIN, tema, impronta, notifiche).
- Stesso controllo per export e import, con quattro categorie: errori bloccanti (regole di `firebase.rules.json`, limiti di Firebase, tipi sbagliati), record orfani (contatto senza `nome`, appuntamento con `contattoId` assente dal file), campi sconosciuti (fuori whitelist, segnalati e mai eliminati), avvisi non bloccanti (lunghezze oltre i `maxlength` dei moduli, formati dell'app). Un backup è "ripristinabile" solo senza bloccanti, orfani e campi sconosciuti.
- Whitelist dai campi scritti dall'app e da `scripts/atlantis-sync.mjs`. Contatto: `nome`, `telefono`, `email`, `note`, `sito`, `tipo`, `mandanti`, `creato`, `aggiornato`, `atlantis`. Appuntamento: `contattoId`, `data`, `ora`, `stato`, `durata`, `importo`, `acconto`, `movimento`, `pagamento`, `modalita`, `fattura`, `dataFattura`, `azienda`, `luogo`, `motivo`, `note`, `promemoria`, `rinvii`, `creato`, `aggiornato`, `pagamentoAggiornato`, `assegno`, `rate`, `confermaEmail`, `storico`.
- "Ripristina da backup": file `.json` fino a 10 MB, controllo completo e anteprima dei numeri prima di qualsiasi scrittura. Formati accettati: `1`; rifiutati i backup di una versione più nuova dell'app. Nessuna migrazione automatica.
- **Unisci / Aggiorna**: un solo `update()` multi-percorso per tutti i record del file; aggiunge i nuovi e sostituisce con la versione del file quelli con lo stesso ID; non elimina nulla.
- **Sostituzione completa**: backup preventivo scaricato su richiesta e obbligatorio (un errore di download blocca il flusso), casella di presa visione, digitazione di `RIPRISTINA`, poi un solo `update()` atomico su `users/{uid}/contatti` e `users/{uid}/appuntamenti` (`null` per un nodo vuoto, mai `{}`). Se i dati cambiano dopo il backup preventivo, ne serve uno nuovo. Gli altri nodi (`impostazioni`, `push`…) non vengono toccati.
- Sicurezza: export e ripristino solo con sessione valida (`auth.currentUser.uid === S.user.uid`) e con contatti e appuntamenti già caricati (`S.caricati`); un'operazione alla volta, pulsanti disattivati durante l'esecuzione; limite di 8 MB per scrittura, 5.000 contatti e 20.000 appuntamenti, controllati prima di chiamare Firebase. Un errore di Firebase viene mostrato per intero, senza messaggi di successo parziali.
- Contatti orfani (senza `nome`): nascosti dagli elenchi, segnalati in Altro › Dati e nel referto del backup; restano nei dati.
- `scripts/atlantis-sync.mjs scrivi`: il riepilogo si scrive riscrivendo l'intero `contatti/{cid}` con una richiesta condizionata (`X-Firebase-ETag` + `if-match`). Se il contatto è stato eliminato o modificato dopo la lettura, Firebase risponde 412: lo script rilegge (al massimo 3 tentativi), salta i contatti eliminati o senza nome e segnala i conflitti persistenti, senza scrivere. Non ricrea più contatti cancellati e non sovrascrive modifiche dell'app.
- Firma del contatto (`scripts/atlantis-sync.mjs`, documentata in `scripts/ATLANTIS.md`): `elenco` aggiunge a ogni voce `firma = "v1:" + SHA-256` di `creato`, `nome`, `tipo`, `telefono`, `email`, `mandanti`; `scrivi` la ricalcola a ogni lettura, anche dopo un 412, e scrive solo se coincide, insieme al controllo ETag su `contatti/{cid}`. Un contatto eliminato e ricreato con lo stesso ID, o modificato nei campi della firma, non riceve i dati Atlantis del soggetto precedente. Contatti senza `creato` (identità incerta) e voci senza `firma` non vengono scritti.
- Codici di uscita di `scrivi`: `0` tutti i riepiloghi scritti, `3` sincronizzazione incompleta (contatti saltati o in conflitto, nessun errore), `1` errori (file non valido, rete, Firebase). Gli errori di un contatto non fermano gli altri.
- ID riservati: le chiavi `__proto__`, `constructor` e `prototype` (come ID, `contattoId` o chiavi annidate) sono errori bloccanti, con il percorso indicato.
- Controllo finale prima di scrivere: `eseguiUnione` e `scriviRipristino` ricontrollano da soli sessione, validità del file, dimensione e percorsi (solo `users/{uid}/contatti` e `users/{uid}/appuntamenti`).
- Offline: con lo stato di `.info/connected`, una schermata persistente "Scrittura in attesa" resta visibile finché Firebase non conferma; nessun timeout né esito anticipato, operazioni di backup bloccate nel frattempo, avviso del browser se si chiude la pagina con una scrittura in coda.

## 2.20.0

**Restyling strutturale Agenda & Card ("Showroom Bento & Azione Rapida")**

- Testata dell'Agenda compatta e fissa in alto (sticky) con selettore dei giorni e pillola "Oggi" sempre visibile.
- Settimana Lun–Sab con giorni più ampi; la domenica compare da sola se ha appuntamenti nella settimana mostrata o se è il giorno selezionato.
- Striscia KPI cliccabile (Impegni, Da incassare, Da pagare): filtra l'elenco del giorno, il riquadro attivo è evidenziato; ritoccandolo o cambiando giorno si torna alla vista completa.
- Card dell'Agenda a tre fasce: orario grande con barra colorata per stato, nome del contatto con categoria e azienda rappresentata (`mandantiDi`, solo lettura), oggetto e importo, barra di azioni rapide Chiama / WhatsApp / Naviga / Web (Web da `sitoDi`, bordo tratteggiato se dal dominio email).
- Scheda dettaglio: pulsanti di cambio stato in alto come pillole (stessa azione `stato` di prima), azioni del contatto da 48 px.
- Barra inferiore: stesse 5 voci, indicatore attivo più contrastato, aree di tocco da 48 px.
- Nuovo blocco CSS `/* v2.20.0 */` con variabili `--v220-*` per tema scuro e chiaro. Nessun cambiamento a salvataggi, schema Firebase, ricerca AI, Google, parser locale, Assegni e Atlantis.

## 2.19.7

**Ricerca del sito con AI: aziende rappresentate ed errori 429**

- Aziende rappresentate: per i contatti di tipo Rappresentante la ricerca usa tutte le aziende del campo "Aziende rappresentate" (`mandanti`, solo in lettura), con priorità sul nome della persona. Con più aziende si chiede a Gemini il sito di ciascuna e i risultati riportano l'azienda a cui si riferiscono. Anche "Cerca su Google" cerca le aziende (`"Azienda A" OR "Azienda B" sito ufficiale`). Senza aziende resta la ricerca per nome di prima. Nessun cambiamento ai dati salvati.
- Errori 429 con Google Search: attesa di 1500 ms e passaggio al modello di riserva successivo, una sola volta per modello (404 e 5xx come prima). L'attesa scatta solo se c'è un altro tentativo da fare: una sola attesa prima della seconda fase, nessuna dopo l'ultimo tentativo. Se tutti i modelli rispondono 429, Gemini viene richiamato senza Google Search: si accettano solo homepage `https://` valide, mostrate come "Suggerimento AI · verifica prima di salvare" accanto ad "Apri" e mai salvate in automatico.
- Messaggi di errore distinti per la seconda fase: 429 (troppe richieste, riprova tra un minuto), 400/401/403 (richiesta o chiave API non valida), 5xx (servizio Gemini temporaneamente non disponibile), errore di rete (impossibile contattare Gemini) e risposta illeggibile. Un 429 seguito da un altro errore non avvia la seconda fase. Resta sempre il link "Cerca su Google" precompilato con le aziende.
- `chiediGemini()` non è cambiata: la ricerca del sito usa una funzione propria.

## 2.19.6

**Sito web del contatto con ricerca e verifica AI**

- Nuovo campo facoltativo "Sito web" nel modulo contatto (creazione e modifica), salvato solo in `users/{uid}/contatti` come `sito`. Senza protocollo si aggiunge `https://`; sono ammessi solo indirizzi http/https (rifiutati `javascript:`, `data:`, `file:` e simili).
- Pulsante "Cerca sito con AI" (modulo e scheda contatto, solo se il sito è vuoto): Gemini con Google Search (`tools: [{ google_search: {} }]`). Gli indirizzi proposti vengono solo dalle fonti della ricerca (`groundingMetadata.groundingChunks`), con titolo, indirizzo, link "Apri" e "Fonte". Il dominio dell'email aziendale è mostrato a parte come "non verificato". "Usa" compila il campo: si salva solo con "Salva".
- Domini email generici esclusi anche come sottodominio: gmail, googlemail, libero, pec, hotmail, outlook, live, yahoo, alice, virgilio, tim, icloud.
- Senza chiave Gemini: dominio dell'email aziendale (non verificato) e link "Cerca su Google". Errori, limite di richieste e assenza di fonti hanno un messaggio dedicato.
- Pulsante "Web" tra le azioni del contatto (prima di Email), con sito salvato oppure dominio email aziendale (bordo tratteggiato = non verificato). Si apre in una nuova scheda.

## 2.19.5

**Restyling mobile-first (solo CSS: HTML, JavaScript, dati Firebase e collegamenti invariati)**

- Blocco `/* v2.19.5 */` in fondo allo stile di `index.html`, con variabili `--v219-*` per tema chiaro e scuro (blu ardesia).
- Fascia blu dell'Agenda più compatta: titolo a 24px, giorni della settimana più bassi.
- Riepilogo Oggi / Da incassare / Da pagare su card con micro-icone (calendario, freccia in entrata, freccia in uscita).
- Schede della timeline con bordo sinistro colorato per stato (programmato blu, confermato azzurro, completato verde, annullato grigio, in ritardo rosso).
- Riquadro "Prossimo" con barra in alto blu e pulsanti da 48px.
- Scheda dettaglio: barra superiore piena, Data / Ora / Fine in tre riquadri separati, pulsanti di contatto più comodi.

## 2.19.4

**Agenda a colpo d'occhio (solo aspetto, funzioni e dati invariati)**

- Fascia blu in alto con data e settimana.
- Riquadro "Prossimo" (solo per oggi): quanto manca, ora, cliente, importo e pulsanti grandi Chiama, WhatsApp, Naviga.
- Riepilogo del giorno in tre caselle: appuntamenti, da incassare (verde), da pagare (arancione).
- Schede con iniziali del cliente, importo grande, sfondo verde per gli incassi e arancione per i pagamenti, linea che unisce gli orari.
- Pulsante "+ Nuovo" con la scritta.
- Tema scuro meno scuro (blu ardesia invece di blu notte); fascia dell'Agenda più chiara nel tema chiaro.

## 2.19.3

**Assistente senza chiave IA: «con» nel motivo**

- Prima: "… per riunione con architetto" metteva come nome "architetto" e toglieva la parola dal motivo.
- Adesso dopo «con» c'è un nome solo se ha l'iniziale maiuscola o se è un contatto della rubrica
  (anche scritto in minuscolo). Altrimenti tutto resta nel motivo: "riunione con architetto", "pranzo con fornitori".
- Invariati: "con Marco Rossi …", "per Marco Rossi …", "per controllo caldaia", il luogo dopo il nome, tutti gli altri comandi.
- Conseguenza voluta: un nome scritto in minuscolo a metà frase dopo «con» e assente dalla rubrica
  ("sopralluogo con mario verdi") resta nel motivo. Il nome subito dopo "nuovo appuntamento con" è riconosciuto come prima.

## 2.19.2

**Gmail "non configurato" al primo avvio (c'era anche nella 2.18.1)**

- Causa 1, ordine di caricamento: la libreria Google era un tag `<script async onload="initGoogle()">` messo prima
  dello script principale. Se la libreria arrivava prima (in cache, rete lenta, telefono occupato), chiamava
  `initGoogle` quando non esisteva ancora: errore, Gmail mai inizializzato fino al ricaricamento.
- Causa 2, errori temporanei: se la libreria non si scaricava (rete assente o instabile) non c'era nessun nuovo tentativo.
- Causa 3, messaggio sbagliato: in entrambi i casi il pulsante diceva "Gmail non configurato: manca GOOGLE_CLIENT_ID",
  anche se il client ID c'è.
- Correzione: la libreria si carica dallo script principale (`caricaGoogle`), quindi `initGoogle` esiste sempre;
  se non si scarica riprova da sola (2, 4, 8, 16, 30 secondi e quando torna la rete).
- Stato reale in Impostazioni › Gmail: "Avvio in corso…", "Non collegato", "Collegato per questa sessione",
  "Servizio Google non disponibile: riprovo da solo".
- Se Gmail risponde 401 (accesso scaduto o revocato) lo stato torna "Non collegato" invece di restare "Collegato".
- Invariato: il collegamento resta valido solo per la sessione (il token non viene salvato), come prima.

## 2.19.1

**Assistente senza chiave IA (riconoscimento locale, sul telefono)**

- Riconosce il nome sia con "con" sia con "per":
  "Nuovo appuntamento per Marco Rossi venerdì alle 9" e "Nuovo appuntamento con Marco Rossi venerdì alle 9"
  danno entrambe nome Marco Rossi, venerdì, 09:00, motivo vuoto.
- "per" è il nome se è scritto con le iniziali maiuscole o se corrisponde a un contatto della rubrica;
  altrimenti resta il motivo ("per controllo caldaia").
- Il motivo non contiene più data e ora ("per controllo caldaia domani alle 10" → motivo "controllo caldaia").
- Riconosce il motivo scritto prima del nome ("domani alle 11:30 sopralluogo con Mario Verdi")
  e il luogo dopo il nome ("… per Marco Rossi a Roma" → luogo Roma).
- Il testo di aiuto sotto il campo dice cosa si capisce senza chiave e cosa solo con la chiave.
- Invariati: comandi sposta, chiama, cerca, agenda; percorso con chiave Gemini; tutto il resto dell'app.

**Funzioni locali e funzioni IA**

| Funzione | Senza chiave (locale) | Con chiave Gemini |
|---|---|---|
| Data, ora | Sì | Sì |
| Nome del contatto | Sì, dopo "con" o "per" o a inizio frase | Sì |
| Motivo, luogo | Sì (frasi semplici) | Sì |
| Importo, acconto, pagamento, telefono, email | No | Sì |
| Comandi sposta / chiama / cerca / agenda | Sì | Sì (locale) |
| Scansione assegni da foto/PDF | No | Sì |
