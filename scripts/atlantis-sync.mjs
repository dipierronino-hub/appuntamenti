#!/usr/bin/env node
// Ponte tra l'app Appuntamenti (Firebase Realtime Database) e il gestionale Atlantis.
// Lo usa l'aggiornamento automatico del mattino: Claude legge Atlantis e questo script
// legge gli appuntamenti e scrive il riepilogo nei contatti (users/<uid>/contatti/<id>/atlantis).
//
//   node scripts/atlantis-sync.mjs elenco [giorni]   contatti con appuntamenti nei prossimi giorni + tutti i rappresentanti (JSON)
//   node scripts/atlantis-sync.mjs nuovi [giorni]    solo i contatti con appuntamenti nuovi o modificati dall'ultimo aggiornamento (JSON)
//   node scripts/atlantis-sync.mjs scrivi <file>     scrive i riepiloghi preparati in <file> (JSON)
//
// Codici di uscita di "scrivi" (v2.21.0): 0 = tutti i riepiloghi scritti; 3 = nessun errore ma
// sincronizzazione incompleta (contatti saltati o in conflitto); 1 = errori (file, rete o Firebase).
//
// Serve la variabile d'ambiente FIREBASE_DB_SECRET (Secret del database di Firebase).
// Le richieste passano da curl, che usa il proxy dell'ambiente cloud.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const DB = 'https://appuntamenti-511913-default-rtdb.europe-west1.firebasedatabase.app';
const SECRET = process.env.FIREBASE_DB_SECRET;

function esci(msg) {
  console.error(msg);
  process.exit(1);
}

function richiesta(metodo, percorso, corpo) {
  const url = `${DB}/${percorso}.json?auth=${encodeURIComponent(SECRET)}`;
  const args = ['-sS', '--fail-with-body', '-X', metodo, url];
  if (corpo !== undefined) args.push('-H', 'Content-Type: application/json', '--data-binary', '@-');
  try {
    const out = execFileSync('curl', args, { input: corpo !== undefined ? JSON.stringify(corpo) : undefined, encoding: 'utf8' });
    return out ? JSON.parse(out) : null;
  } catch (e) {
    // Il messaggio di curl non contiene il secret: lo ripuliamo comunque per sicurezza.
    esci(`Errore Firebase (${metodo} ${percorso}): ${String(e.stdout || e.message).split(SECRET).join('***')}`);
  }
}

// Firma dell'identità di un contatto (v2.21.0). "elenco" la calcola, la routine la copia nel file di
// "scrivi", "scrivi" la ricalcola a ogni lettura (anche dopo un 412): se non coincide, il contatto è un
// altro soggetto oppure è stato modificato dopo la ricerca in Atlantis, e non si scrive nulla.
// Deterministica: stessi valori salvati = stessa firma. Senza `creato` numerico l'identità è incerta
// e la firma è null: quel contatto non riceve scritture (si risolve aprendo e salvando il contatto nell'app).
const CAMPI_FIRMA = ['creato', 'nome', 'tipo', 'telefono', 'email', 'mandanti'];
function firmaContatto(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
  if (typeof c.creato !== 'number' || !Number.isFinite(c.creato)) return null;
  const valori = CAMPI_FIRMA.map(k => (c[k] === undefined ? null : c[k]));
  return 'v1:' + createHash('sha256').update(JSON.stringify(valori)).digest('hex');
}

// Richiesta che restituisce anche stato HTTP ed ETag (richieste condizionate di Firebase, v2.21.0).
// Non usa --fail-with-body: il 412 (conflitto) è una risposta attesa, la gestisce chi chiama.
// Un errore di rete lancia un'eccezione (senza il Secret): la gestisce chi chiama, contatto per contatto.
function richiestaEtag(metodo, percorso, corpo, intestazioni = {}) {
  const url = `${DB}/${percorso}.json?auth=${encodeURIComponent(SECRET)}`;
  const args = ['-sS', '-i', '-X', metodo, url];
  for (const [k, v] of Object.entries(intestazioni)) args.push('-H', `${k}: ${v}`);
  if (corpo !== undefined) args.push('-H', 'Content-Type: application/json', '--data-binary', '@-');
  let out;
  try {
    out = execFileSync('curl', args, { input: corpo !== undefined ? JSON.stringify(corpo) : undefined, encoding: 'utf8' });
  } catch (e) {
    throw new Error(`errore di rete (${metodo}): ${String(e.stderr || e.message).split(SECRET).join('***').trim().slice(0, 300)}`);
  }
  // Con un proxy curl può mostrare più blocchi di intestazioni (es. "200 Connection established"): vale l'ultimo.
  let testa = '', resto = out;
  while (/^HTTP\/\S+ \d{3}/.test(resto)) {
    const fine = /\r?\n\r?\n/.exec(resto);
    if (!fine) { testa = resto; resto = ''; break; }
    testa = resto.slice(0, fine.index);
    resto = resto.slice(fine.index + fine[0].length);
  }
  const stato = Number(/^HTTP\/\S+ (\d{3})/.exec(testa)?.[1] || 0);
  const etag = /^etag:[ \t]*(.+?)[ \t]*$/im.exec(testa)?.[1] || '';
  let dati = null;
  try { dati = resto.trim() ? JSON.parse(resto) : null; } catch (e) { dati = resto; }
  return { stato, etag, dati };
}

// Scrive il riepilogo Atlantis riscrivendo l'intero contatto con una richiesta condizionata (ETag):
// Firebase accetta il PUT solo se contatti/<cid> è identico a quando è stato letto. A ogni lettura, prima
// del PUT, la firma del contatto deve coincidere con quella calcolata da "elenco": così i dati Atlantis di
// un soggetto non finiscono mai su un soggetto diverso con lo stesso ID, nemmeno dopo un 412.
// Su 412 rilegge, ricontrolla la firma e riprova, al massimo TENTATIVI_ETAG volte.
// Esito { esito, motivo }: 'scritto' | 'assente' | 'senzaCreato' | 'diverso' | 'conflitto' | 'errore'.
const TENTATIVI_ETAG = 3;
function scriviAtlantisProtetto(uid, cid, firma, atlantis) {
  const percorso = `users/${uid}/contatti/${cid}`;
  try {
    for (let t = 1; t <= TENTATIVI_ETAG; t++) {
      const letto = richiestaEtag('GET', percorso, undefined, { 'X-Firebase-ETag': 'true' });
      if (letto.stato !== 200 || !letto.etag) return { esito: 'errore', motivo: `lettura: HTTP ${letto.stato}${letto.etag ? '' : ', ETag mancante'}` };
      const c = letto.dati;
      if (!c || typeof c !== 'object' || Array.isArray(c) || typeof c.nome !== 'string' || !c.nome) return { esito: 'assente', motivo: 'contatto eliminato o senza nome' };
      const attuale = firmaContatto(c);
      if (!attuale) return { esito: 'senzaCreato', motivo: 'manca "creato": identità incerta' };
      if (attuale !== firma) return { esito: 'diverso', motivo: `firma diversa da quella di "elenco" (tentativo ${t}): altro soggetto con lo stesso ID o contatto modificato` };
      const scritto = richiestaEtag('PUT', percorso, { ...c, atlantis }, { 'if-match': letto.etag });
      if (scritto.stato === 200) return { esito: 'scritto', motivo: t > 1 ? `dopo ${t - 1} conflitti` : '' };
      if (scritto.stato !== 412) return { esito: 'errore', motivo: `scrittura: HTTP ${scritto.stato} ${JSON.stringify(scritto.dati).slice(0, 200)}` };
      console.error(`Conflitto su ${cid} (tentativo ${t} di ${TENTATIVI_ETAG}): il contatto è cambiato dopo la lettura, rileggo e ricontrollo la firma`);
    }
    return { esito: 'conflitto', motivo: `${TENTATIVI_ETAG} conflitti consecutivi` };
  } catch (e) {
    return { esito: 'errore', motivo: String(e.message || e) };
  }
}

const isoOggi = (k = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + k);
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
};

// soloNuovi: solo i contatti con appuntamenti futuri creati o modificati dopo l'ultimo aggiornamento Atlantis
// (o mai aggiornati). Lo usa il controllo di ogni ora: se l'elenco è vuoto non c'è niente da fare.
function elenco(giorni, soloNuovi = false) {
  const utenti = richiesta('GET', 'users') || {};
  const da = isoOggi(0), a = isoOggi(giorni);
  const out = [], senzaFirma = [];
  for (const [uid, u] of Object.entries(utenti)) {
    const contatti = u.contatti || {};
    const perContatto = {};
    for (const [aid, app] of Object.entries(u.appuntamenti || {})) {
      if (!app || app.stato === 'annullato' || app.data < da || app.data > a) continue;
      if (soloNuovi) {
        const visto = Date.parse(contatti[app.contattoId]?.atlantis?.aggiornato || '') || 0;
        if (Math.max(Number(app.creato) || 0, Number(app.aggiornato) || 0) <= visto) continue;
      }
      (perContatto[app.contattoId] ||= []).push({ aid, data: app.data, ora: app.ora, motivo: app.motivo || '', azienda: app.azienda || '' });
    }
    // I rappresentanti ci sono sempre, anche senza appuntamenti: nell'app si tocca un'azienda
    // rappresentata e si vede la sua situazione, che quindi va aggiornata ogni mattina.
    for (const [cid, c] of Object.entries(soloNuovi ? {} : contatti)) {
      if (c?.tipo === 'rappresentante' && Array.isArray(c.mandanti) && c.mandanti.some(Boolean)) perContatto[cid] ||= [];
    }
    for (const [cid, apps] of Object.entries(perContatto)) {
      const c = contatti[cid];
      if (!c) continue;
      // Senza firma (manca "creato") "scrivi" non potrebbe scrivere: il contatto non entra nell'elenco.
      const firma = firmaContatto(c);
      if (!firma) { senzaFirma.push(cid); continue; }
      out.push({
        uid, cid, firma, nome: c.nome || '', tipo: c.tipo || 'cliente', telefono: c.telefono || '', email: c.email || '',
        aziende: [...new Set(apps.map(x => x.azienda).filter(Boolean))],
        codiceAttuale: c.atlantis?.codice || '',
        // Solo per i rappresentanti: le aziende che rappresentano e i codici Atlantis già abbinati.
        mandanti: c.tipo === 'rappresentante' && Array.isArray(c.mandanti) ? c.mandanti.filter(Boolean) : [],
        codiciMandanti: Object.fromEntries((c.atlantis?.mandanti || []).filter(m => m?.codice).map(m => [m.azienda, m.codice])),
        appuntamenti: apps.sort((x, y) => (x.data + x.ora).localeCompare(y.data + y.ora))
      });
    }
  }
  console.log(JSON.stringify(out, null, 2));
  // Su stderr, così l'output resta JSON valido.
  if (senzaFirma.length) console.error(`Esclusi ${senzaFirma.length} contatti senza "creato" (identità incerta: aprirli e salvarli nell'app): ${senzaFirma.join(', ')}`);
}

const num =v => Math.round((Number(v) || 0) * 100) / 100;

// Tiene solo i campi attesi dall'app, così un dato sbagliato non rompe la schermata.
const lato = x => (x ? { aperto: num(x.aperto), scaduto: num(x.scaduto), n: Math.max(0, Math.trunc(Number(x.n) || 0)) } : undefined);

function soggetto(at) {
  return {
    codice: String(at.codice || ''),
    ragione: String(at.ragione || '').slice(0, 160),
    nota: String(at.nota || '').slice(0, 160),
    cliente: lato(at.cliente),
    fornitore: lato(at.fornitore),
    prossime: (Array.isArray(at.prossime) ? at.prossime : []).slice(0, 6).map(x => ({
      data: String(x.data || '').slice(0, 10),
      importo: num(x.importo),
      ruolo: x.ruolo === 'fornitore' ? 'fornitore' : 'cliente',
      rif: String(x.rif || '').slice(0, 80),
      fattura: String(x.fattura || '').slice(0, 30),
      dataFattura: String(x.dataFattura || '').slice(0, 10),
      tipo: String(x.tipo || '').slice(0, 40)
    })),
    // Note di credito a nostro favore (saldo positivo): l'app le mostra e le scala dal totale da pagare.
    crediti: (Array.isArray(at.crediti) ? at.crediti : []).slice(0, 20).map(x => ({
      numero: String(x.numero || '').replace(/^0+/, '').slice(0, 30),
      data: String(x.data || '').slice(0, 10),
      importo: num(x.importo),
      tipo: String(x.tipo || '').slice(0, 40)
    })),
    // Fatture con scadenze aperte: l'app toglie gli assegni emessi e mostra quanto resta da chiudere.
    fatture: (Array.isArray(at.fatture) ? at.fatture : []).slice(0, 20).map(f => ({
      numero: String(f.numero || '').replace(/^0+/, '').slice(0, 30),
      data: String(f.data || '').slice(0, 10),
      ruolo: f.ruolo === 'cliente' ? 'cliente' : 'fornitore',
      totale: num(f.totale),
      aperto: num(f.aperto),
      tipo: String(f.tipo || '').slice(0, 40),
      nota: String(f.nota || '').slice(0, 120),
      rate: (Array.isArray(f.rate) ? f.rate : []).slice(0, 12).map(r => ({ data: String(r.data || '').slice(0, 10), importo: num(r.importo) }))
    }))
  };
}

function pulisci(at) {
  const r = { ...soggetto(at), aggiornato: new Date().toISOString() };
  // Rappresentante: un soggetto Atlantis per ogni azienda rappresentata.
  if (Array.isArray(at.mandanti) && at.mandanti.length) {
    r.mandanti = at.mandanti.slice(0, 20).map(m => ({ azienda: String(m.azienda || '').slice(0, 120), ...soggetto(m) }));
  }
  return JSON.parse(JSON.stringify(r));
}

function scrivi(file) {
  const voci = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(voci)) esci('Il file deve contenere un elenco JSON');
  for (const v of voci) {
    if (!/^[\w-]+$/.test(v.uid || '') || !/^[\w-]+$/.test(v.cid || '')) esci('uid o cid non validi: ' + JSON.stringify(v).slice(0, 120));
  }
  const esiti = { scritto: [], firmaMancante: [], assente: [], senzaCreato: [], diverso: [], conflitto: [], errore: [] };
  for (const v of voci) {
    // Voce senza firma (file preparato senza copiare "firma" da elenco): identità non verificabile, si salta.
    const r = typeof v.firma === 'string' && v.firma.startsWith('v1:')
      ? scriviAtlantisProtetto(v.uid, v.cid, v.firma, pulisci(v.atlantis || {}))
      : { esito: 'firmaMancante', motivo: 'voce senza "firma" copiata da elenco' };
    esiti[r.esito].push(`${v.cid}${r.motivo ? ` (${r.motivo})` : ''}`);
  }
  const etichette = {
    scritto: 'Scritti', firmaMancante: 'Saltati: firma mancante nel file', assente: 'Saltati: contatto eliminato o senza nome',
    senzaCreato: 'Saltati: identità incerta (manca "creato")', diverso: 'Saltati: firma diversa (altro soggetto o contatto modificato)',
    conflitto: 'Non scritti: conflitti ripetuti', errore: 'ERRORI'
  };
  console.log(`Scritti ${esiti.scritto.length} riepiloghi Atlantis su ${voci.length}`);
  for (const [k, lista] of Object.entries(esiti)) if (k !== 'scritto' && lista.length) console.log(`${etichette[k]} (${lista.length}): ${lista.join('; ')}`);
  // Nessuna esecuzione incompleta risulta "riuscita": 1 con errori, 3 con contatti non aggiornati.
  const nonScritti = voci.length - esiti.scritto.length;
  if (esiti.errore.length) { console.error('Sincronizzazione con errori: vedi ERRORI'); process.exitCode = 1; }
  else if (nonScritti) { console.error(`Sincronizzazione incompleta: ${nonScritti} contatti non aggiornati (nessun dato scritto su di loro)`); process.exitCode = 3; }
}

const [cmd, arg] = process.argv.slice(2);
if (!SECRET && cmd) esci('Manca FIREBASE_DB_SECRET nelle variabili dell\'ambiente');
if (cmd === 'elenco') elenco(Number(arg) || 7);
else if (cmd === 'nuovi') elenco(Number(arg) || 60, true);
else if (cmd === 'scrivi' && arg) scrivi(arg);
else esci('Uso: node scripts/atlantis-sync.mjs elenco [giorni] | nuovi [giorni] | scrivi <file.json>');
