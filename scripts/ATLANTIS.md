# Aggiornamento "Situazione Atlantis"

Procedura che la routine del mattino esegue (connettore Atlantis Evo, sola lettura).
Serve `FIREBASE_DB_SECRET` nell'ambiente e l'accesso di rete a
`appuntamenti-511913-default-rtdb.europe-west1.firebasedatabase.app`.

1. `node scripts/atlantis-sync.mjs elenco 7` → contatti con appuntamenti nei prossimi 7 giorni e **tutti i
   rappresentanti** (anche senza appuntamenti, con `appuntamenti: []`): nell'app si tocca un'azienda
   rappresentata e si vede la sua situazione, quindi va aggiornata ogni mattina.
2. Per ogni contatto trova il soggetto in Atlantis con `cerca_soggetti`:
   - se `codiceAttuale` è presente, riusa quel codice;
   - altrimenti cerca per ognuna delle `aziende`, poi per telefono, email e nome;
   - `tipo` (cliente, fornitore, tecnico, rappresentante) aiuta a scegliere: un fornitore va cercato
     tra i fornitori, un cliente tra i clienti; tecnici e rappresentanti spesso non sono in Atlantis;
   - più risultati: preferisci quello con lo stesso telefono o email, poi quello con scadenze aperte;
     se resta ambiguo scegli il più probabile e metti `nota: "da verificare"`;
   - nessun risultato: scrivi solo `{ "nota": "Non trovato in Atlantis" }`.
   - **rappresentante** (`tipo: "rappresentante"`): il rappresentante di solito non è in Atlantis.
     Cerca invece ognuna delle `mandanti` (le aziende che rappresenta) tra i fornitori, riusando
     `codiciMandanti[azienda]` se c'è, e scrivi un elemento per ciascuna in `atlantis.mandanti`
     (vedi l'esempio sotto). Le regole su ambiguità e "Non trovato" valgono per ogni azienda.
3. Per il soggetto trovato leggi `scadenze_aperte` come `cliente` e/o `fornitore` (secondo `ATTR`),
   scorrendo tutte le pagine. Per ogni ruolo calcola:
   - `aperto`: totale ancora da pagare/incassare;
   - `scaduto`: parte con data di scadenza prima di oggi;
   - `n`: numero di scadenze aperte.
4. Prepara un file JSON (fuori dal repository) come questo e lancia
   `node scripts/atlantis-sync.mjs scrivi <file>`:

```json
[{ "uid": "...", "cid": "...", "atlantis": {
  "codice": "0002563", "ragione": "RAGIONE SOCIALE", "nota": "",
  "cliente": { "aperto": 0, "scaduto": 0, "n": 0 },
  "fornitore": { "aperto": 1200.5, "scaduto": 300, "n": 3 },
  "prossime": [{ "data": "2026-10-30", "importo": 300, "ruolo": "fornitore",
                 "fattura": "123", "dataFattura": "2026-09-30", "tipo": "Rimessa diretta", "rif": "rata 1/2" }]
}}]
```

Per un rappresentante:

```json
[{ "uid": "...", "cid": "...", "atlantis": { "mandanti": [
  { "azienda": "Nome scritto nell'app (copialo da mandanti, l'app abbina per nome)", "codice": "0001234", "ragione": "RAGIONE SOCIALE", "nota": "",
    "fornitore": { "aperto": 5000, "scaduto": 0, "n": 2 }, "prossime": [] },
  { "azienda": "Altra azienda", "nota": "Non trovato in Atlantis" }
]}}]
```

Per ogni scadenza in `prossime`: `data` = PAC_DTSCAD, `fattura` = PA_SERIEDOC/PA_NUMDOC (es. "2607"),
`dataFattura` = PA_DATDOC (le date di Atlantis sono millisecondi: convertile in AAAA-MM-GG con fuso Europe/Rome),
`tipo` = PG_DESCR in minuscolo con l'iniziale maiuscola, `rif` = eventuale "rata N/M" o "a nostro favore".

Solo per le aziende dei rappresentanti (`mandanti`), aggiungi anche `fatture`: una voce per ogni fattura
con scadenze aperte come fornitore (raggruppa le righe di `scadenze_aperte` per PA_CODICE), al massimo 20:

```json
"fatture": [{ "numero": "1044", "data": "2026-06-30", "ruolo": "fornitore", "totale": 7905.6,
              "aperto": 7905.6, "tipo": "Rimessa diretta", "nota": "", "rate": [{ "data": "2026-10-31", "importo": 3952.8 }] }]
```

`numero` = PA_NUMDOC senza zeri iniziali, `data` = PA_DATDOC, `totale` = PA_TOTDOC, `rate` = le righe aperte
(PAC_DTSCAD, importo). `aperto` = `totale` meno i pagamenti registrati per quella fattura nel `mastrino` del fornitore
(movimenti in dare che citano il numero nelle note, es. "ADD.BONIF.FT. N. 231"). Se la somma delle righe aperte è
diversa da `aperto`, scrivilo in `nota` (es. "in Atlantis le scadenze aperte sommano 7.458,40"): le righe a volte
vengono modificate a mano e non tornano con la fattura. L'app abbina gli assegni emessi che citano il
numero della fattura nella causale e mostra quanto resta da chiudere.

## Controllo di ogni ora (8-20)

Un secondo controllo gira ogni ora dalle 8 alle 20 per gli appuntamenti appena creati o modificati:
`node scripts/atlantis-sync.mjs nuovi` elenca solo i contatti con appuntamenti futuri (prossimi 60 giorni)
creati o modificati dopo l'ultimo aggiornamento Atlantis del contatto. Se stampa `[]` non c'è niente da fare:
fermati subito. Altrimenti segui i passi 2-4 qui sopra solo per quei contatti. `scrivi` aggiorna la data
`aggiornato`, quindi al giro successivo gli stessi contatti non ricompaiono.

Ometti `cliente` o `fornitore` se il soggetto non ha quel ruolo. `prossime`: al massimo 6 scadenze,
prima le scadute e poi le più vicine. Non inserire dati di Atlantis nel repository né nei log condivisi.
