#!/usr/bin/env node
// Ponte tra l'app Appuntamenti (Firebase Realtime Database) e il gestionale Atlantis.
// Lo usa l'aggiornamento automatico del mattino: Claude legge Atlantis e questo script
// legge gli appuntamenti e scrive il riepilogo nei contatti (users/<uid>/contatti/<id>/atlantis).
//
//   node scripts/atlantis-sync.mjs elenco [giorni]   contatti con appuntamenti nei prossimi giorni + tutti i rappresentanti (JSON)
//   node scripts/atlantis-sync.mjs scrivi <file>     scrive i riepiloghi preparati in <file> (JSON)
//
// Serve la variabile d'ambiente FIREBASE_DB_SECRET (Secret del database di Firebase).
// Le richieste passano da curl, che usa il proxy dell'ambiente cloud.
import { execFileSync } from 'node:child_process';
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

const isoOggi = (k = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + k);
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
};

function elenco(giorni) {
  const utenti = richiesta('GET', 'users') || {};
  const da = isoOggi(0), a = isoOggi(giorni);
  const out = [];
  for (const [uid, u] of Object.entries(utenti)) {
    const contatti = u.contatti || {};
    const perContatto = {};
    for (const [aid, app] of Object.entries(u.appuntamenti || {})) {
      if (!app || app.stato === 'annullato' || app.data < da || app.data > a) continue;
      (perContatto[app.contattoId] ||= []).push({ aid, data: app.data, ora: app.ora, motivo: app.motivo || '', azienda: app.azienda || '' });
    }
    // I rappresentanti ci sono sempre, anche senza appuntamenti: nell'app si tocca un'azienda
    // rappresentata e si vede la sua situazione, che quindi va aggiornata ogni mattina.
    for (const [cid, c] of Object.entries(contatti)) {
      if (c?.tipo === 'rappresentante' && Array.isArray(c.mandanti) && c.mandanti.some(Boolean)) perContatto[cid] ||= [];
    }
    for (const [cid, apps] of Object.entries(perContatto)) {
      const c = contatti[cid];
      if (!c) continue;
      out.push({
        uid, cid, nome: c.nome || '', tipo: c.tipo || 'cliente', telefono: c.telefono || '', email: c.email || '',
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
}

const num = v => Math.round((Number(v) || 0) * 100) / 100;

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
  let n = 0;
  for (const v of voci) {
    if (!/^[\w-]+$/.test(v.uid || '') || !/^[\w-]+$/.test(v.cid || '')) esci('uid o cid non validi: ' + JSON.stringify(v).slice(0, 120));
    richiesta('PUT', `users/${v.uid}/contatti/${v.cid}/atlantis`, pulisci(v.atlantis || {}));
    n++;
  }
  console.log(`Scritti ${n} riepiloghi Atlantis`);
}

const [cmd, arg] = process.argv.slice(2);
if (!SECRET && cmd) esci('Manca FIREBASE_DB_SECRET nelle variabili dell\'ambiente');
if (cmd === 'elenco') elenco(Number(arg) || 7);
else if (cmd === 'scrivi' && arg) scrivi(arg);
else esci('Uso: node scripts/atlantis-sync.mjs elenco [giorni] | scrivi <file.json>');
