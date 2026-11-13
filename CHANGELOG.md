# Versioni di Appuntamenti

La versione si trova in due punti, da cambiare sempre insieme:
`APP_VERSION` in `index.html` e `VERSIONE` in `sw.js` (che dà anche il nome alla cache, `appuntamenti-<versione>`).
`manifest.json` non ha un numero di versione.

| Versione | Stato | Contenuto |
|---|---|---|
| 2.18.1 | Online (ramo main) | PIN obbligatorio, promemoria push, riepilogo del mattino. |
| 2.19.0 | Versione di riferimento protetta (backup del 13/11/2026), richiesta #36, non pubblicata | Restyling grafico "Premium Business". Solo aspetto: funzioni invariate. |
| 2.19.1 | Candidata verificata, non pubblicata | Correzione dell'assistente senza IA (vedi sotto). Parte dalla 2.19.0. |
| 2.19.2 | Verificata, sostituita dalla 2.19.3 | Avvio di Gmail affidabile e stato reale (vedi sotto). Parte dalla 2.19.1. |
| 2.19.3 | Candidata alla pubblicazione, non pubblicata | Assistente senza IA: «con» dentro il motivo non diventa un nome. Parte dalla 2.19.2. |
| 2.20.0 | Proposta | Backup completo e ripristino (richiesta #32, oggi numerata 2.19.0): va rinumerata 2.20.0 e unita dopo la 2.19.3. |

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
