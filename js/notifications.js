/* ─────────────────────────────────────────────────────────────────────────────
   IDEAFORMA — Notifications
   Trois niveaux, du plus fiable au plus dégradé :
     1. Push serveur : /api/rappels envoie la notification à l'heure dite,
        même application fermée. Nécessite l'autorisation du navigateur et,
        sur iPhone, l'ajout de l'application à l'écran d'accueil.
     2. Rappel local : tant que l'onglet est ouvert, une vérification toutes
        les 45 s attrape les rappels que le serveur aurait manqués.
     3. Bandeau dans l'application, toujours visible sur « Ma journée ».
───────────────────────────────────────────────────────────────────────────── */

const Notifs = {

  _sw:        null,
  _clePublique: null,
  _timer:     null,
  _dejaVus:   new Set(),

  /* ── État courant, pour l'affichage dans les paramètres ── */
  etat() {
    if (!('serviceWorker' in navigator))  return 'non_supporte';
    if (!('PushManager' in window))       return 'non_supporte';
    if (!('Notification' in window))      return 'non_supporte';
    if (Notification.permission === 'denied')  return 'refuse';
    if (Notification.permission === 'default') return 'a_demander';
    return 'accorde';
  },

  /** iPhone / iPad : le push n'existe que si l'app est lancée depuis
      l'écran d'accueil (mode standalone), à partir d'iOS 16.4. */
  estIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  },

  estInstallee() {
    return window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone === true;
  },

  /* ── Enregistrement du service worker ── */
  async initServiceWorker() {
    if (!('serviceWorker' in navigator)) return null;
    try {
      this._sw = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;

      // Le service worker demande un réabonnement (clé expirée côté navigateur)
      navigator.serviceWorker.addEventListener('message', ev => {
        if (ev.data?.type === 'RESOUSCRIRE_PUSH') this.activer(true);
      });

      return this._sw;
    } catch (err) {
      console.warn('[Notifs] service worker non enregistré', err);
      return null;
    }
  },

  /* ── Clé publique VAPID ── */
  async _cle() {
    if (this._clePublique) return this._clePublique;
    const res = await fetch('/api/push-config');
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || 'Configuration des notifications indisponible');
    }
    const { publicKey } = await res.json();
    this._clePublique = publicKey;
    return publicKey;
  },

  _base64UrlVersUint8(base64) {
    const pad  = '='.repeat((4 - base64.length % 4) % 4);
    const brut = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from([...brut].map(c => c.charCodeAt(0)));
  },

  /* ── Activation : demande la permission puis abonne l'appareil ── */
  async activer(silencieux = false) {
    if (this.etat() === 'non_supporte') {
      throw new Error('Ce navigateur ne gère pas les notifications.');
    }
    if (this.estIOS() && !this.estInstallee()) {
      throw new Error(
        "Sur iPhone, il faut d'abord ajouter IDEAFORMA à l'écran d'accueil : " +
        "bouton Partager → « Sur l'écran d'accueil », puis rouvrir l'app depuis l'icône."
      );
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      throw new Error('Notifications refusées. À réactiver dans les réglages du navigateur.');
    }

    const sw  = this._sw || await this.initServiceWorker();
    if (!sw) throw new Error('Service worker indisponible.');

    const cle = await this._cle();
    let sub = await sw.pushManager.getSubscription();

    // Si la clé serveur a changé, l'ancien abonnement ne vaut plus rien
    if (sub?.options?.applicationServerKey) {
      // Certains navigateurs n'exposent pas la clé : dans ce cas on garde
      // l'abonnement tel quel plutôt que de le recréer à chaque activation.
      const ancienne = btoa(String.fromCharCode(...new Uint8Array(sub.options.applicationServerKey)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      if (ancienne !== cle) { await sub.unsubscribe(); sub = null; }
    }

    if (!sub) {
      sub = await sw.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this._base64UrlVersUint8(cle)
      });
    }

    await DataStore.savePushSubscription(sub, this._nomAppareil());
    if (!silencieux) Toast.show('Notifications activées sur cet appareil ✓', 'success');
    return sub;
  },

  async desactiver() {
    const sw  = this._sw || await navigator.serviceWorker?.getRegistration();
    const sub = await sw?.pushManager.getSubscription();
    if (sub) {
      await DataStore.deletePushSubscription(sub.endpoint);
      await sub.unsubscribe();
    }
    Toast.show('Notifications désactivées sur cet appareil', 'info');
  },

  _nomAppareil() {
    const ua = navigator.userAgent;
    const os = /iPhone/.test(ua) ? 'iPhone'
             : /iPad/.test(ua) ? 'iPad'
             : /Android/.test(ua) ? 'Android'
             : /Mac/.test(ua) ? 'Mac'
             : /Windows/.test(ua) ? 'Windows' : 'Appareil';
    const nav = /Edg/.test(ua) ? 'Edge'
              : /Chrome/.test(ua) ? 'Chrome'
              : /Firefox/.test(ua) ? 'Firefox'
              : /Safari/.test(ua) ? 'Safari' : 'navigateur';
    return `${os} · ${nav}${this.estInstallee() ? ' · installée' : ''}`;
  },

  /* ── Notification de test ── */
  async tester() {
    if (Notification.permission !== 'granted') {
      throw new Error("Autorisez d'abord les notifications.");
    }
    const sw = this._sw || await navigator.serviceWorker.getRegistration();
    await sw.showNotification('IDEAFORMA — test', {
      body:  'Si vous lisez ceci, les notifications fonctionnent sur cet appareil.',
      icon:  '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag:   'test',
      data:  { url: '/app.html' }
    });
  },

  /** Rappel programmé côté serveur, dans 1 minute : vérifie toute la chaîne
      (pg_cron → /api/rappels → web-push → appareil). */
  async testerChaineComplete() {
    const dans = new Date(Date.now() + 65000);
    await DataStore.addRappelManuel(
      'IDEAFORMA — test de la chaîne',
      'Cette notification vient du serveur : tout fonctionne.',
      dans.toISOString()
    );
    return dans;
  },

  /* ══════════════════════════════════════════════
     FILET DE SÉCURITÉ CÔTÉ NAVIGATEUR
     Tant que l'onglet est ouvert, on regarde toutes les 45 s si un rendez-vous
     commence dans les 2 minutes. Utile si le cron a du retard ou si l'appareil
     n'est pas abonné au push.
  ══════════════════════════════════════════════ */
  demarrerVeille() {
    if (this._timer) clearInterval(this._timer);
    this._verifier();
    this._timer = setInterval(() => this._verifier(), 45000);
  },

  async _verifier() {
    try {
      const maintenant = Date.now();
      const debut = new Date(maintenant - 60000).toISOString();
      const fin   = new Date(maintenant + 120000).toISOString();
      const items = await DataStore.getAgenda(debut, fin);

      items.filter(i => !i.termine && !this._dejaVus.has(i.id)).forEach(i => {
        this._dejaVus.add(i.id);
        const quand = new Date(i.debut);
        const dans  = Math.round((quand - maintenant) / 60000);

        // Bandeau interne systématique
        Toast.show(
          `<strong>${esc(i.titre)}</strong><br>` +
          (dans <= 0 ? "c'est maintenant" : `dans ${dans} min`) +
          (i.lieu ? ` · ${esc(i.lieu)}` : ''),
          'warning', 9000
        );

        // Notification système si l'onglet est en arrière-plan
        if (document.hidden && Notification.permission === 'granted') {
          navigator.serviceWorker.getRegistration().then(sw =>
            sw?.showNotification(i.titre, {
              body:  (dans <= 0 ? "C'est maintenant" : `Dans ${dans} min`) +
                     (i.lieu ? ` · ${i.lieu}` : ''),
              icon:  '/icons/icon-192.png',
              badge: '/icons/badge-96.png',
              tag:   `local-${i.id}`,
              data:  { url: '/app.html#agenda' }
            })
          );
        }
      });

      // On purge la mémoire une fois par heure pour ne pas la laisser gonfler
      if (this._dejaVus.size > 300) this._dejaVus.clear();
    } catch { /* hors ligne : on réessaiera dans 45 s */ }
  }
};
