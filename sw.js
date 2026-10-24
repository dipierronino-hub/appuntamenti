// Service worker: rende l'app installabile, la apre anche offline e gestisce i clic sulle notifiche.
// Aggiornare VERSIONE insieme ad APP_VERSION in index.html a ogni rilascio.
const VERSIONE = '2.10.3';
const CACHE = 'appuntamenti-' + VERSIONE;
const FILE = ['./', 'index.html', 'manifest.json', 'icon.svg', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(chiavi => Promise.all(chiavi.filter(k => k.startsWith('appuntamenti-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Contatto condiviso dalla rubrica verso l'app (share_target del manifest): si conserva e si apre l'app.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'POST' || !url.pathname.endsWith('/condividi')) return;
  e.respondWith((async () => {
    try {
      const dati = await e.request.formData();
      const file = dati.get('contatto');
      const testo = file && typeof file.text === 'function' ? await file.text()
        : [dati.get('title'), dati.get('text'), dati.get('url')].filter(Boolean).join('\n');
      const cache = await caches.open('condivisi');
      await cache.put('ultimo', new Response(testo));
    } catch (err) { /* l'app avvisa che non è arrivato nulla */ }
    return Response.redirect('./?condiviso=1', 303);
  })());
});

// Rete prima, cache come riserva: solo per i file dell'app (Firebase e Google passano direttamente).
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(r => {
        if (r.ok) { const copia = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copia)); }
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./')))
  );
});

// Clic su un promemoria: porta in primo piano l'app e apre l'appuntamento.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const id = e.notification.data?.id;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(finestre => {
    const f = finestre[0];
    if (f) {
      if (id) f.postMessage({ apri: id });
      return f.focus();
    }
    return self.clients.openWindow(id ? './?app=' + encodeURIComponent(id) : './');
  }));
});

// Notifica push inviata da scripts/push-promemoria.mjs: arriva anche ad app chiusa.
self.addEventListener('push', e => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch (err) { m = { corpo: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(m.titolo || 'Promemoria appuntamento', {
    body: m.corpo || '',
    tag: m.id || 'prova',
    icon: 'icon.svg',
    badge: 'icon.svg',
    data: { id: m.id || '' }
  }));
});
