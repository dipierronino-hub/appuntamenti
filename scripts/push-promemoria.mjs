#!/usr/bin/env node
// Invia le notifiche push dei promemoria, anche quando l'app sul telefono è chiusa.
// Lo esegue GitHub Actions ogni 5 minuti (.github/workflows/promemoria-push.yml).
//
//   node scripts/push-promemoria.mjs          invia i promemoria arrivati all'ora giusta
//   node scripts/push-promemoria.mjs --prova  mostra cosa invierebbe, senza inviare né scrivere
//
// Serve la variabile d'ambiente FIREBASE_DB_SECRET (Secret del database di Firebase) e il
// pacchetto web-push. Le chiavi VAPID stanno in /server/vapid, leggibile solo con il secret.
// Dati usati per ogni utente:
//   users/<uid>/push/<id>        iscrizioni dei dispositivi (le salva l'app)
//   users/<uid>/pushInviati/<id> firma "data ora anticipo" dei promemoria già inviati
//   users/<uid>/pushProva        richiesta di notifica di prova (la scrive l'app)
import { execFileSync } from 'node:child_process';
import webpush from 'web-push';

const DB = 'https://appuntamenti-511913-default-rtdb.europe-west1.firebasedatabase.app';
const SECRET = process.env.FIREBASE_DB_SECRET;
const PROVA = process.argv.includes('--prova');
const CHIUSI = ['completato', 'annullato'];
// Uguale a promemoriaPredefinito() nell'app: si usa solo per appuntamenti senza anticipo salvato.
const ANTICIPO_PREDEFINITO = 60;

function esci(msg) {
  console.error(msg);
  process.exit(1);
}
if (!SECRET) esci('Manca FIREBASE_DB_SECRET');

// Come in atlantis-sync.mjs: curl usa il proxy dell'ambiente, se c'è.
function richiesta(metodo, percorso, corpo) {
  const url = `${DB}/${percorso}.json?auth=${encodeURIComponent(SECRET)}`;
  const args = ['-sS', '--fail-with-body', '-X', metodo, url];
  if (corpo !== undefined) args.push('-H', 'Content-Type: application/json', '--data-binary', '@-');
  try {
    const out = execFileSync('curl', args, { input: corpo !== undefined ? JSON.stringify(corpo) : undefined, encoding: 'utf8' });
    return out ? JSON.parse(out) : null;
  } catch (e) {
    esci(`Errore Firebase (${metodo} ${percorso}): ${String(e.stdout || e.message).split(SECRET).join('***')}`);
  }
}

// Data e ora dell'appuntamento sono ora italiana: le converte in millisecondi UTC.
function istanteRoma(data, ora) {
  const [y, m, d] = data.split('-').map(Number);
  const [h, mi] = String(ora || '00:00').split(':').map(Number);
  const comeUtc = Date.UTC(y, m - 1, d, h, mi);
  const scarto = t => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Rome', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(t).map(x => [x.type, x.value]));
    return Date.UTC(+p.year, p.month - 1, +p.day, +p.hour, +p.minute) - t;
  };
  return comeUtc - scarto(comeUtc - scarto(comeUtc));
}

const anticipoDi = a => (Number.isInteger(a.promemoria) ? a.promemoria : ANTICIPO_PREDEFINITO);
const testoAnticipo = m => (m % 1440 === 0 ? (m === 1440 ? 'Domani' : `Tra ${m / 1440} giorni`) : m % 60 === 0 ? (m === 60 ? 'Tra 1 ora' : `Tra ${m / 60} ore`) : `Tra ${m} minuti`);

function messaggio(a, c) {
  return {
    titolo: `${a.ora} · ${[a.motivo, c?.nome].filter(Boolean).join(' · ') || 'Appuntamento'}`,
    corpo: [testoAnticipo(anticipoDi(a)), a.luogo].filter(Boolean).join(' · '),
    id: a.id
  };
}

// Invia a tutti i dispositivi dell'utente; toglie le iscrizioni scadute (il telefono le ha revocate).
async function inviaATutti(uid, iscrizioni, contenuto) {
  let ok = 0;
  for (const [sid, s] of Object.entries(iscrizioni)) {
    if (PROVA) { console.log(`  → ${sid}: ${contenuto.titolo} | ${contenuto.corpo}`); ok++; continue; }
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(contenuto), { TTL: 3600, urgency: 'high', topic: String(contenuto.id || 'prova').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) });
      ok++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) richiesta('DELETE', `users/${uid}/push/${sid}`);
      else console.error(`Invio non riuscito a ${sid}: ${e.statusCode || ''} ${e.body || e.message}`);
    }
  }
  return ok;
}

const vapid = richiesta('GET', 'server/vapid');
if (!vapid?.publicKey || !vapid?.privateKey) esci('Chiavi VAPID mancanti in /server/vapid');
webpush.setVapidDetails(vapid.soggetto || 'https://dipierronino-hub.github.io/appuntamenti/', vapid.publicKey, vapid.privateKey);

const ora = Date.now();
const utenti = richiesta('GET', 'users') || {};
let inviati = 0;
for (const [uid, u] of Object.entries(utenti)) {
  const iscrizioni = u.push || {};
  if (!Object.keys(iscrizioni).length) continue;
  const fatti = u.pushInviati || {};
  const aggiorna = {};

  if (u.pushProva) {
    inviati += await inviaATutti(uid, iscrizioni, { titolo: 'Notifica di prova', corpo: 'Le notifiche push funzionano anche ad app chiusa', id: '' });
    aggiorna.pushProva = null;
  }

  for (const [aid, a] of Object.entries(u.appuntamenti || {})) {
    if (!a?.data || CHIUSI.includes(a.stato)) continue;
    const anticipo = anticipoDi(a);
    if (!anticipo) continue;
    const inizio = istanteRoma(a.data, a.ora);
    const firma = `${a.data} ${a.ora} ${anticipo}`;
    if (ora >= inizio - anticipo * 60000 && ora < inizio && fatti[aid] !== firma) {
      inviati += await inviaATutti(uid, iscrizioni, messaggio({ ...a, id: aid }, u.contatti?.[a.contattoId]));
      aggiorna[`pushInviati/${aid}`] = firma;
    }
  }
  // Pulizia: dimentica i promemoria di appuntamenti cancellati o passati da più di un giorno.
  for (const aid of Object.keys(fatti)) {
    const a = u.appuntamenti?.[aid];
    if (!a || istanteRoma(a.data, a.ora) < ora - 86400000) aggiorna[`pushInviati/${aid}`] = null;
  }
  if (Object.keys(aggiorna).length && !PROVA) richiesta('PATCH', `users/${uid}`, aggiorna);
}
console.log(`${PROVA ? 'Da inviare' : 'Inviate'}: ${inviati} notifiche`);
