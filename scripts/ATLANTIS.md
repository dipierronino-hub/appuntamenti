# Aggiornamento "Situazione Atlantis"

Procedura che la routine del mattino esegue (connettore Atlantis Evo, sola lettura).
Serve `FIREBASE_DB_SECRET` nell'ambiente e l'accesso di rete a
`appuntamenti-511913-default-rtdb.europe-west1.firebasedatabase.app`.

1. `node scripts/atlantis-sync.mjs elenco 7` → contatti con appuntamenti nei prossimi 7 giorni e **tutti i
   rappresentanti** (anche senza appuntamenti, con `appuntamenti: []`): nell'app si tocca un'azienda
   rappresentata e si vede la sua situazione, quindi va aggiornata ogni mattina.
   Ogni voce contiene `firma`: copiala **identica** nel file del passo 4 (vedi "Firma del contatto" sotto).
   I contatti senza `creato` non compaiono nell'elenco (avviso su stderr): vedi sotto.
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
   `node scripts/atlantis-sync.mjs scrivi <file>`. `uid`, `cid` e `firma` si copiano dalla voce di `elenco`
   (o `nuovi`) senza modificarli:

```json
[{ "uid": "...", "cid": "...", "firma": "v1:…copiata da elenco…", "atlantis": {
  "codice": "0002563", "ragione": "RAGIONE SOCIALE", "nota": "",
  "cliente": { "aperto": 0, "scaduto": 0, "n": 0 },
  "fornitore": { "aperto": 1200.5, "scaduto": 300, "n": 3 },
  "prossime": [{ "data": "2026-10-30", "importo": 300, "ruolo": "fornitore",
                 "fattura": "123", "dataFattura": "2026-09-30", "tipo": "Rimessa diretta", "rif": "rata 1/2" }]
}}]
```

Per un rappresentante:

```json
[{ "uid": "...", "cid": "...", "firma": "v1:…copiata da elenco…", "atlantis": { "mandanti": [
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

Note di credito: le righe di `scadenze_aperte` con PAC_SALDO positivo (credito a nostro favore) vanno anche in
`crediti`, una voce per ognuna (per tutti i soggetti, non solo i mandanti), anche se non entrano in `prossime`:

```json
"crediti": [{ "numero": "2258", "data": "2026-10-15", "importo": 228, "tipo": "Rimessa diretta a vista" }]
```

`numero` = PA_NUMDOC senza zeri iniziali, `data` = PA_DATDOC, `importo` = PAC_SALDO (positivo). L'app le mostra
nella scheda dell'azienda e le scala dal totale da chiudere.

## Controllo di ogni ora (8-20)

Un secondo controllo gira ogni ora dalle 8 alle 20 per gli appuntamenti appena creati o modificati:
`node scripts/atlantis-sync.mjs nuovi` elenca solo i contatti con appuntamenti futuri (prossimi 60 giorni)
creati o modificati dopo l'ultimo aggiornamento Atlantis del contatto. Se stampa `[]` non c'è niente da fare:
fermati subito. Altrimenti segui i passi 2-4 qui sopra solo per quei contatti. `scrivi` aggiorna la data
`aggiornato`, quindi al giro successivo gli stessi contatti non ricompaiono.

Ometti `cliente` o `fornitore` se il soggetto non ha quel ruolo. `prossime`: al massimo 6 scadenze,
prima le scadute e poi le più vicine. Non inserire dati di Atlantis nel repository né nei log condivisi.

Scrivi sempre tutte le scadenze aperte, anche quelle di fatture già gestite negli appuntamenti: è l'app a
nasconderle quando un appuntamento dello stesso contatto ha quella fattura (campo `fattura` o "FT 3138" nel
titolo) e il pagamento aggiornato (rate, assegni, acconto o saldo). Non modificare gli appuntamenti.

## Firma del contatto e scrittura protetta (dalla 2.21.0)

Tra `elenco` e `scrivi` passano diversi minuti: nel frattempo un contatto può essere modificato, eliminato
o sostituito (per esempio da un ripristino completo da backup) con un soggetto diverso che ha lo stesso ID.
Per non scrivere mai i dati Atlantis di un soggetto su un altro:

- **Firma**: `elenco` calcola per ogni contatto `firma = "v1:" + SHA-256` dei valori salvati di
  `creato`, `nome`, `tipo`, `telefono`, `email`, `mandanti` (un campo assente vale `null`). Stessi valori,
  stessa firma. `scrivi` legge il contatto, ricalcola la firma e scrive solo se coincide con quella del file.
- **ETag**: la scrittura riscrive l'intero `contatti/<cid>` (tutti i campi restano com'erano, cambia solo
  `atlantis`) con `if-match` sull'ETag letto: se il contatto cambia tra lettura e scrittura, Firebase
  risponde 412 e `scrivi` rilegge, **ricontrolla la firma** e riprova, al massimo 3 volte.
- **`creato` mancante**: l'identità è incerta, quindi nessuna scrittura (in `elenco` il contatto è escluso,
  in `scrivi` è saltato). Si risolve aprendo e salvando il contatto nell'app, che aggiunge `creato`.
- **Una modifica legittima** di nome, tipo, telefono, email o aziende rappresentate dopo `elenco` cambia la
  firma: il contatto viene saltato (la ricerca in Atlantis era basata sui dati vecchi) e ricompare al giro
  successivo, perché la sua data `atlantis.aggiornato` non cambia. Le modifiche ad altri campi (note, sito…)
  non cambiano la firma e non impediscono la scrittura.

Esiti stampati da `scrivi`, per ogni contatto non scritto con il motivo:
`firma mancante nel file`, `contatto eliminato o senza nome`, `identità incerta (manca "creato")`,
`firma diversa`, `conflitti ripetuti`, `ERRORI` (rete o HTTP: il contatto non è stato scritto, gli altri
vengono comunque elaborati).

Codici di uscita di `scrivi`:

| Codice | Significato | Cosa fare |
|---|---|---|
| 0 | Tutti i riepiloghi scritti | Niente. |
| 3 | Nessun errore, ma sincronizzazione incompleta: almeno un contatto saltato o in conflitto, senza scritture su di lui | Riportare l'elenco dei saltati nel resoconto della routine; non rilanciare subito: i contatti vengono ripresi al giro successivo. |
| 1 | Errori (file non valido, rete, Firebase) | Riportare l'errore; i contatti con errore non sono stati scritti. |

Un codice diverso da 0 fa risultare la routine come non completata: è voluto, perché un aggiornamento
parziale non deve passare per riuscito. Se il file manca della `firma` (procedura vecchia), tutti i
contatti vengono saltati con codice 3.
