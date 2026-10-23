// Service worker: rende l'app installabile, la apre anche offline e gestisce i clic sulle notifiche.
// Aggiornare VERSIONE insieme ad APP_VERSION in index.html a ogni rilascio.
const VERSIONE = '2.1.0';
const CACHE = 'appuntamenti-' + VERSIONE;
const FILE = ['./', 'index.html', 'manifest.json', 'icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(chiavi => Promise.all(chiavi.filter(k => k.startsWith('appuntamenti-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
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
