# Aggiornamento "Situazione Atlantis"

Procedura che la routine del mattino esegue (connettore Atlantis Evo, sola lettura).
Serve `FIREBASE_DB_SECRET` nell'ambiente e l'accesso di rete a
`appuntamenti-511913-default-rtdb.europe-west1.firebasedatabase.app`.

1. `node scripts/atlantis-sync.mjs elenco 7` → contatti con appuntamenti nei prossimi 7 giorni.
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
  "prossime": [{ "data": "2026-10-30", "importo": 300, "ruolo": "fornitore", "rif": "Fatt. 123/2026" }]
}}]
```

Per un rappresentante:

```json
[{ "uid": "...", "cid": "...", "atlantis": { "mandanti": [
  { "azienda": "Nome scritto nell'app", "codice": "0001234", "ragione": "RAGIONE SOCIALE", "nota": "",
    "fornitore": { "aperto": 5000, "scaduto": 0, "n": 2 }, "prossime": [] },
  { "azienda": "Altra azienda", "nota": "Non trovato in Atlantis" }
]}}]
```

Ometti `cliente` o `fornitore` se il soggetto non ha quel ruolo. `prossime`: al massimo 6 scadenze,
prima le scadute e poi le più vicine. Non inserire dati di Atlantis nel repository né nei log condivisi.
