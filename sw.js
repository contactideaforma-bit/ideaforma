/* ─────────────────────────────────────────────────────────────────────────────
   IDEAFORMA — Service worker
   Trois rôles :
     1. rendre l'application installable (PWA) et utilisable hors connexion
        pour la coquille (HTML/CSS/JS) ;
     2. recevoir les notifications poussées par /api/rappels ;
     3. ouvrir la bonne page quand on tape sur la notification.

   ⚠ Changer CACHE_VERSION à chaque mise en ligne, sinon les anciens fichiers
     restent servis depuis le cache.
───────────────────────────────────────────────────────────────────────────── */

const CACHE_VERSION = 'ideaforma-v54';
const COQUILLE = [
  '/app.html',
  '/index.html',
  '/css/styles.css',
  '/css/vie.css',
  '/css/bujo.css',
  '/css/crystal.css',
  '/js/icones.js',
  '/js/supabase.js',
  '/js/auth.js',
  '/js/data.js',
  '/js/vie.js',
  '/js/dashboard.js',
  '/js/journee.js',
  '/js/opco.js',
  '/js/documents.js',
  '/js/ai.js',
  '/js/notifications.js',
  '/js/hub.js',
  '/js/parcours.js',
  '/js/taches.js',
  '/js/agenda.js',
  '/js/notes.js',
  '/js/coffre.js',
  '/js/mail.js',
  '/js/sms.js',
  '/js/assistant.js',
  '/js/app.js',
  '/js/install.js',
  '/logo-ideaforma.png',
  '/logomymy.png',
  '/icons/icon-192.png',
  '/manifest.webmanifest'
];

/* ── Installation : on précharge la coquille ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      // addAll échoue en bloc si un seul fichier manque : on tolère les absents
      .then(cache => Promise.allSettled(COQUILLE.map(url => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

/* ── Activation : on jette les anciens caches ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(noms => Promise.all(
        noms.filter(n => n !== CACHE_VERSION).map(n => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

/* ── Requêtes ──
   v53 — deux régimes, pour que l'ouverture soit instantanée SANS servir une
   vieille version :
     • Les pages HTML : réseau d'abord (cache seulement hors connexion).
       C'est en rechargeant la page que le navigateur revérifie sw.js ; une
       nouvelle CACHE_VERSION entraîne un nouveau cache et un rechargement
       (voir Notifs.initServiceWorker → controllerchange).
     • JS, CSS, images : cache d'abord. Ces fichiers sont préchargés à
       l'installation et n'évoluent qu'avec la version : les relire sur le
       réseau à chaque ouverture (25 requêtes) est ce qui rendait l'app lente,
       surtout sur téléphone. En cas d'absence du cache, réseau puis mise en
       cache.
   Supabase et /api ne passent jamais par ici. */
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  const estPage = req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/' || url.pathname === '/app';

  if (estPage) {
    event.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then(res => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copie = res.clone();
            caches.open(CACHE_VERSION).then(c => c.put(req, copie));
          }
          return res;
        })
        .catch(() => caches.match(req).then(hit => hit || caches.match('/app.html')))
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_VERSION).then(cache =>
      cache.match(req).then(hit => {
        if (hit) return hit;
        return fetch(req).then(res => {
          if (res && res.status === 200 && res.type === 'basic') cache.put(req, res.clone());
          return res;
        });
      })
    ).catch(() => fetch(req))
  );
});

/* ── Réception d'une notification ── */
self.addEventListener('push', event => {
  let charge = {};
  try { charge = event.data ? event.data.json() : {}; }
  catch { charge = { titre: 'IDEAFORMA', corps: event.data ? event.data.text() : '' }; }

  const titre = charge.titre || 'IDEAFORMA';
  const options = {
    body:    charge.corps || '',
    icon:    '/icons/icon-192.png',
    badge:   '/icons/badge-96.png',
    tag:     charge.tag || ('ideaforma-' + Date.now()),
    renotify: true,
    requireInteraction: charge.persistant !== false,   // reste affichée jusqu'à action
    vibrate: [200, 100, 200],
    timestamp: Date.now(),
    data:    { url: charge.url || '/app.html' },
    actions: [
      { action: 'ouvrir',  title: 'Ouvrir' },
      { action: 'plus_tard', title: 'Plus tard' }
    ]
  };

  event.waitUntil(self.registration.showNotification(titre, options));
});

/* ── Clic sur la notification ── */
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'plus_tard') return;

  const cible = event.notification.data?.url || '/app.html';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(fenetres => {
      // Une fenêtre de l'app est déjà ouverte : on la réutilise
      for (const f of fenetres) {
        if (f.url.includes('/app.html') && 'focus' in f) {
          f.navigate?.(cible);
          return f.focus();
        }
      }
      return self.clients.openWindow(cible);
    })
  );
});

/* ── Abonnement push renouvelé par le navigateur ──
   On prévient les onglets ouverts : c'est l'application qui réenregistrera
   le nouvel abonnement dans Supabase (le service worker n'a pas la session). */
self.addEventListener('pushsubscriptionchange', event => {
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(fenetres => fenetres.forEach(f => f.postMessage({ type: 'RESOUSCRIRE_PUSH' })))
  );
});

/* ── Message venu de la page ── */
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
