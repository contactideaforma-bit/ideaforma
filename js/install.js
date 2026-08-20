/* ─────────────────────────────────────────────────────────────────────────────
   IDEAFORMA — Installation de l'application (PWA)

   Safari ne propose aucun bouton d'installation : la manipulation est cachée
   dans le menu Partager (iPhone/iPad) ou dans le menu Fichier (Mac). Ce module
   ajoute donc un bouton « Installer » dans l'application :

     • Chrome / Edge / Android  → déclenche la vraie boîte d'installation du
       navigateur (événement `beforeinstallprompt`), installation en un clic ;
     • Safari (iPhone, iPad, Mac) → ouvre une fiche qui montre la manipulation
       exacte, illustrée, en trois étapes ;
     • Firefox et autres → explique comment faire, ou d'ouvrir dans Safari.

   Le bouton disparaît de lui-même dès que l'application est installée
   (elle tourne alors en mode « standalone », sans barre d'adresse).

   Aucune dépendance : ce fichier injecte son propre CSS et fonctionne aussi
   bien sur `index.html` (page de connexion) que sur `app.html`.
───────────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════════════════════
     1. DÉTECTION
  ═══════════════════════════════════════════════════════════════════════ */

  const UA = navigator.userAgent;

  /* iPadOS 13+ se fait passer pour un Mac : on le démasque avec maxTouchPoints */
  const EST_IOS =
    /iPad|iPhone|iPod/.test(UA) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  const EST_MAC = /Macintosh/.test(UA) && !EST_IOS;

  /* Sur iOS tous les navigateurs utilisent WebKit ; seul le vrai Safari
     affiche « Sur l'écran d'accueil » de façon fiable. */
  const EST_SAFARI =
    /Safari/.test(UA) && !/Chrome|Chromium|CriOS|FxiOS|EdgiOS|OPiOS|Edg\//.test(UA);

  const EST_FIREFOX = /Firefox|FxiOS/.test(UA);

  /* L'application tourne-t-elle déjà en mode application ? */
  function estInstallee() {
    return (
      window.navigator.standalone === true ||
      ['standalone', 'fullscreen', 'minimal-ui'].some(
        mode => window.matchMedia('(display-mode: ' + mode + ')').matches
      )
    );
  }

  /* Rien à faire si on est déjà dans l'application installée */
  if (estInstallee()) return;

  /* Prompt natif mis de côté (Chrome, Edge, Android, Samsung Internet…) */
  let promptNatif = null;

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();          // on empêche la mini-barre auto du navigateur
    promptNatif = e;
    majBouton();
  });

  window.addEventListener('appinstalled', () => {
    promptNatif = null;
    document.querySelectorAll('.pwa-install-btn, .pwa-install-link')
      .forEach(el => el.remove());
    fermerFiche();
    if (window.App && typeof App.toast === 'function') {
      App.toast('Application installée. Vous pouvez l\'ouvrir depuis votre écran d\'accueil.', 'success');
    }
  });

  /* ═══════════════════════════════════════════════════════════════════════
     2. STYLES
  ═══════════════════════════════════════════════════════════════════════ */

  const CSS = `
  .pwa-install-btn {
    width: 36px; height: 36px;
    border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    color: var(--text-muted, #64748B);
    background: transparent;
    border: 1px solid var(--border, #E2E8F0);
    cursor: pointer;
    transition: all .18s ease;
    flex-shrink: 0;
    padding: 0;
  }
  .pwa-install-btn svg { width: 17px; height: 17px; }
  .pwa-install-btn:hover {
    background: var(--primary-light, rgba(59,130,246,.08));
    color: var(--primary, #3B82F6);
    border-color: var(--primary-border, rgba(59,130,246,.18));
  }

  .pwa-install-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin: 14px auto 0;
    padding: 8px 14px;
    border-radius: 100px;
    border: 1px solid var(--primary-border, rgba(59,130,246,.18));
    background: var(--primary-light, rgba(59,130,246,.08));
    color: var(--primary, #3B82F6);
    font-size: 12.5px;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    transition: all .18s ease;
  }
  .pwa-install-link:hover { filter: brightness(.95); }
  .pwa-install-link svg { width: 14px; height: 14px; }
  .pwa-install-wrap { text-align: center; }

  /* ── Fiche d'explication ── */
  .pwa-sheet-overlay {
    position: fixed; inset: 0;
    background: rgba(15,23,42,.55);
    backdrop-filter: blur(3px);
    display: flex; align-items: center; justify-content: center;
    padding: 20px;
    z-index: 4000;
    opacity: 0;
    transition: opacity .18s ease;
  }
  .pwa-sheet-overlay.visible { opacity: 1; }

  .pwa-sheet {
    background: var(--white, #fff);
    color: var(--text, #1E293B);
    border-radius: var(--radius-xl, 20px);
    box-shadow: 0 20px 50px rgba(0,0,0,.28);
    width: 100%;
    max-width: 430px;
    max-height: 88vh;
    overflow-y: auto;
    padding: 26px 26px 22px;
    transform: scale(.96) translateY(10px);
    transition: transform .2s ease;
    font-family: inherit;
  }
  .pwa-sheet-overlay.visible .pwa-sheet { transform: none; }

  .pwa-sheet-head {
    display: flex; align-items: flex-start; gap: 12px;
    margin-bottom: 18px;
  }
  .pwa-sheet-icon {
    width: 42px; height: 42px; border-radius: 11px;
    flex-shrink: 0;
    background: var(--primary-light, rgba(59,130,246,.08));
    border: 1px solid var(--primary-border, rgba(59,130,246,.18));
    display: flex; align-items: center; justify-content: center;
    color: var(--primary, #3B82F6);
  }
  .pwa-sheet-icon svg { width: 21px; height: 21px; }
  .pwa-sheet-title { font-size: 16.5px; font-weight: 700; line-height: 1.3; }
  .pwa-sheet-sub {
    font-size: 12.5px; color: var(--text-muted, #64748B);
    margin-top: 3px; line-height: 1.5;
  }
  .pwa-sheet-close {
    margin-left: auto;
    width: 30px; height: 30px; border-radius: 8px;
    border: none; background: transparent; cursor: pointer;
    color: var(--text-muted, #64748B);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .pwa-sheet-close:hover { background: var(--border-light, #F1F5F9); }
  .pwa-sheet-close svg { width: 17px; height: 17px; }

  .pwa-steps { list-style: none; margin: 0; padding: 0; }
  .pwa-steps li {
    display: flex; gap: 12px;
    padding: 11px 0;
    border-top: 1px solid var(--border-light, #F1F5F9);
    font-size: 13.5px; line-height: 1.55;
  }
  .pwa-steps li:first-child { border-top: none; }
  .pwa-num {
    width: 22px; height: 22px; border-radius: 50%;
    flex-shrink: 0; margin-top: 1px;
    background: var(--primary, #3B82F6);
    color: #fff;
    font-size: 11.5px; font-weight: 700;
    display: flex; align-items: center; justify-content: center;
  }
  .pwa-glyph {
    display: inline-flex; align-items: center; justify-content: center;
    vertical-align: -4px;
    width: 21px; height: 21px;
    margin: 0 2px;
    border-radius: 5px;
    background: var(--primary-light, rgba(59,130,246,.08));
    color: var(--primary, #3B82F6);
  }
  .pwa-glyph svg { width: 13px; height: 13px; }
  .pwa-kbd {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 5px;
    border: 1px solid var(--border, #E2E8F0);
    background: var(--border-light, #F1F5F9);
    color: var(--text, #1E293B);
    font-size: 12px; font-weight: 600;
  }
  .pwa-note {
    margin-top: 16px;
    padding: 11px 13px;
    border-radius: 10px;
    background: var(--primary-lighter, rgba(59,130,246,.04));
    border: 1px solid var(--primary-border, rgba(59,130,246,.18));
    font-size: 12px; line-height: 1.55;
    color: var(--text-muted, #64748B);
  }
  .pwa-sheet-actions { margin-top: 18px; display: flex; gap: 9px; }
  .pwa-btn {
    flex: 1;
    padding: 11px 14px;
    border-radius: var(--radius, 10px);
    font-size: 13.5px; font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    border: 1px solid var(--border, #E2E8F0);
    background: transparent;
    color: var(--text, #1E293B);
    transition: all .18s ease;
  }
  .pwa-btn:hover { background: var(--border-light, #F1F5F9); }
  .pwa-btn-primary {
    background: var(--primary, #3B82F6);
    border-color: var(--primary, #3B82F6);
    color: #fff;
  }
  .pwa-btn-primary:hover { background: var(--primary-hover, #2563EB); }

  @media (max-width: 520px) {
    .pwa-sheet { padding: 22px 18px 18px; border-radius: 16px; }
  }
  `;

  function injecterCss() {
    if (document.getElementById('pwa-install-css')) return;
    const s = document.createElement('style');
    s.id = 'pwa-install-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     3. ICÔNES
  ═══════════════════════════════════════════════════════════════════════ */

  const SVG_INSTALL =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
    '<polyline points="7 10 12 15 17 10"/>' +
    '<line x1="12" y1="15" x2="12" y2="3"/></svg>';

  /* Icône « Partager » d'iOS : carré ouvert avec une flèche vers le haut */
  const SVG_PARTAGE =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M8 7H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2"/>' +
    '<polyline points="8 6 12 2 16 6"/>' +
    '<line x1="12" y1="2" x2="12" y2="15"/></svg>';

  /* Icône « + carré » du menu Partager */
  const SVG_PLUS =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="3" y="3" width="18" height="18" rx="4"/>' +
    '<line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>';

  const SVG_CROIX =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" aria-hidden="true">' +
    '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  function glyphe(svg) {
    return '<span class="pwa-glyph">' + svg + '</span>';
  }

  /* ═══════════════════════════════════════════════════════════════════════
     4. CONTENU DE LA FICHE, SELON LE NAVIGATEUR
  ═══════════════════════════════════════════════════════════════════════ */

  const NOTE_IPHONE =
    'Une fois installée, l\'application s\'ouvre en plein écran, sans barre ' +
    'd\'adresse — et c\'est la seule façon, sur iPhone, de recevoir les ' +
    'notifications de rappel.';

  function contenu() {
    /* ── iPhone / iPad, Safari ── */
    if (EST_IOS && EST_SAFARI) {
      return {
        titre: 'Installer Mymy sur votre iPhone',
        sous: 'Trois secondes, depuis le menu Partager de Safari.',
        etapes: [
          'Touchez le bouton <strong>Partager</strong> ' + glyphe(SVG_PARTAGE) +
            ' dans la barre en bas de Safari.',
          'Faites défiler la liste puis choisissez ' + glyphe(SVG_PLUS) +
            ' <strong>« Sur l\'écran d\'accueil »</strong>.',
          'Touchez <strong>Ajouter</strong> en haut à droite. L\'icône Mymy ' +
            'apparaît sur votre écran d\'accueil.'
        ],
        note: NOTE_IPHONE
      };
    }

    /* ── iPhone / iPad, autre navigateur ── */
    if (EST_IOS) {
      return {
        titre: 'Installer Mymy sur votre iPhone',
        sous: 'L\'installation passe obligatoirement par Safari sur iPhone.',
        etapes: [
          'Ouvrez cette page dans <strong>Safari</strong> (le navigateur bleu ' +
            'd\'Apple) plutôt que dans ce navigateur.',
          'Touchez le bouton <strong>Partager</strong> ' + glyphe(SVG_PARTAGE) +
            ' puis <strong>« Sur l\'écran d\'accueil »</strong>.',
          'Touchez <strong>Ajouter</strong>. L\'icône Mymy apparaît sur votre ' +
            'écran d\'accueil.'
        ],
        note: NOTE_IPHONE
      };
    }

    /* ── Mac, Safari 17+ ── */
    if (EST_MAC && EST_SAFARI) {
      return {
        titre: 'Ajouter Mymy au Dock',
        sous: 'Safari sur Mac installe l\'application en une ligne de menu.',
        etapes: [
          'Dans la barre de menus, ouvrez <span class="pwa-kbd">Fichier</span>.',
          'Choisissez <strong>« Ajouter au Dock… »</strong>' +
            ' <span style="color:var(--text-muted,#64748B)">' +
            '(ou le bouton Partager ' + glyphe(SVG_PARTAGE) +
            ' de la barre d\'outils → « Ajouter au Dock »)</span>.',
          'Confirmez avec <strong>Ajouter</strong>. Mymy s\'ouvre désormais ' +
            'dans sa propre fenêtre, sans barre d\'adresse.'
        ],
        note: 'Si l\'entrée « Ajouter au Dock » n\'apparaît pas, c\'est que ' +
              'votre Mac est en macOS Ventura ou antérieur : mettez à jour vers ' +
              'macOS Sonoma, ou utilisez Chrome.'
      };
    }

    /* ── Firefox ── */
    if (EST_FIREFOX) {
      return {
        titre: 'Installer Mymy',
        sous: 'Firefox n\'installe pas les applications web sur ordinateur.',
        etapes: [
          'Ouvrez cette page dans <strong>Safari</strong> ou ' +
            '<strong>Chrome</strong>.',
          'Le bouton « Installer » y déclenche l\'installation directement.',
          'Sur Android, Firefox propose « Installer » dans son menu ⋮.'
        ],
        note: ''
      };
    }

    /* ── Chrome / Edge / Android, mais sans prompt disponible ── */
    return {
      titre: 'Installer Mymy',
      sous: 'Depuis le menu de votre navigateur.',
      etapes: [
        'Ouvrez le menu du navigateur (<span class="pwa-kbd">⋮</span> ou ' +
          '<span class="pwa-kbd">…</span>, en haut à droite).',
        'Choisissez <strong>« Installer Mymy »</strong> ou ' +
          '<strong>« Ajouter à l\'écran d\'accueil »</strong>.',
        'Confirmez. L\'application s\'ouvre ensuite dans sa propre fenêtre.'
      ],
      note: 'Une icône ' + glyphe(SVG_INSTALL) + ' apparaît aussi parfois ' +
            'directement dans la barre d\'adresse.'
    };
  }

  /* ═══════════════════════════════════════════════════════════════════════
     5. LA FICHE
  ═══════════════════════════════════════════════════════════════════════ */

  let overlay = null;
  let dernierFocus = null;

  function fermerFiche() {
    if (!overlay) return;
    const o = overlay;
    overlay = null;
    o.classList.remove('visible');
    document.removeEventListener('keydown', surTouche);
    setTimeout(() => o.remove(), 200);
    if (dernierFocus && dernierFocus.isConnected) dernierFocus.focus();
  }

  function surTouche(e) {
    if (e.key === 'Escape') fermerFiche();
  }

  function ouvrirFiche() {
    if (overlay) return;
    injecterCss();
    dernierFocus = document.activeElement;

    const c = contenu();

    overlay = document.createElement('div');
    overlay.className = 'pwa-sheet-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', c.titre);

    overlay.innerHTML =
      '<div class="pwa-sheet">' +
        '<div class="pwa-sheet-head">' +
          '<div class="pwa-sheet-icon">' + SVG_INSTALL + '</div>' +
          '<div>' +
            '<div class="pwa-sheet-title">' + c.titre + '</div>' +
            '<div class="pwa-sheet-sub">' + c.sous + '</div>' +
          '</div>' +
          '<button class="pwa-sheet-close" type="button" aria-label="Fermer">' +
            SVG_CROIX +
          '</button>' +
        '</div>' +
        '<ol class="pwa-steps">' +
          c.etapes.map((t, i) =>
            '<li><span class="pwa-num">' + (i + 1) + '</span><span>' + t + '</span></li>'
          ).join('') +
        '</ol>' +
        (c.note ? '<div class="pwa-note">' + c.note + '</div>' : '') +
        '<div class="pwa-sheet-actions">' +
          '<button class="pwa-btn pwa-btn-primary" type="button" data-pwa="ok">' +
            'J\'ai compris' +
          '</button>' +
        '</div>' +
      '</div>';

    overlay.addEventListener('click', e => {
      if (e.target === overlay) fermerFiche();
    });
    overlay.querySelector('.pwa-sheet-close').addEventListener('click', fermerFiche);
    overlay.querySelector('[data-pwa="ok"]').addEventListener('click', fermerFiche);

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));
    document.addEventListener('keydown', surTouche);
    overlay.querySelector('[data-pwa="ok"]').focus();
  }

  /* ═══════════════════════════════════════════════════════════════════════
     6. LE CLIC
  ═══════════════════════════════════════════════════════════════════════ */

  async function installer() {
    /* Chrome, Edge, Android : la vraie boîte du navigateur */
    if (promptNatif) {
      try {
        promptNatif.prompt();
        const res = await promptNatif.userChoice;
        promptNatif = null;               // un prompt ne sert qu'une fois
        if (res && res.outcome === 'accepted') return;
        majBouton();
        return;
      } catch (err) {
        console.warn('[install]', err);
        promptNatif = null;
      }
    }
    /* Safari et les autres : on montre la marche à suivre */
    ouvrirFiche();
  }

  /* ═══════════════════════════════════════════════════════════════════════
     7. LES BOUTONS
  ═══════════════════════════════════════════════════════════════════════ */

  function libelle() {
    if (promptNatif) return 'Installer l\'application';
    if (EST_IOS)     return 'Installer sur l\'écran d\'accueil';
    if (EST_MAC)     return 'Ajouter l\'application au Dock';
    return 'Installer l\'application';
  }

  function majBouton() {
    document.querySelectorAll('.pwa-install-btn').forEach(b => {
      b.title = libelle();
      b.setAttribute('aria-label', libelle());
    });
    const l = document.querySelector('.pwa-install-link span');
    if (l) l.textContent = libelle();
  }

  /* Bouton icône dans l'en-tête de l'application (app.html) */
  function monterEnTete() {
    const zone = document.querySelector('.header-end');
    if (!zone || zone.querySelector('.pwa-install-btn')) return false;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pwa-install-btn';
    btn.title = libelle();
    btn.setAttribute('aria-label', libelle());
    btn.innerHTML = SVG_INSTALL;
    btn.addEventListener('click', installer);

    const sombre = zone.querySelector('#darkToggle');
    if (sombre) zone.insertBefore(btn, sombre);
    else zone.appendChild(btn);
    return true;
  }

  /* Pastille discrète sur la page de connexion (index.html) */
  function monterConnexion() {
    const carte = document.querySelector('.login-card');
    if (!carte || carte.querySelector('.pwa-install-link')) return false;

    const wrap = document.createElement('div');
    wrap.className = 'pwa-install-wrap';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pwa-install-link';
    btn.innerHTML = SVG_INSTALL + '<span>' + libelle() + '</span>';
    btn.addEventListener('click', installer);

    wrap.appendChild(btn);
    carte.appendChild(wrap);
    return true;
  }

  function monter() {
    injecterCss();
    monterEnTete();
    monterConnexion();
    majBouton();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', monter);
  } else {
    monter();
  }

  /* L'en-tête de app.html est parfois reconstruit au changement de page :
     on remet le bouton en place si quelqu'un l'a effacé. */
  const observateur = new MutationObserver(() => {
    if (estInstallee()) {
      document.querySelectorAll('.pwa-install-btn, .pwa-install-link')
        .forEach(el => el.remove());
      observateur.disconnect();
      return;
    }
    if (!document.querySelector('.pwa-install-btn')) monterEnTete();
  });
  if (document.body) {
    observateur.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', () =>
      observateur.observe(document.body, { childList: true, subtree: true })
    );
  }

  /* Accessible depuis la console ou depuis Paramètres si besoin */
  window.Install = { ouvrir: installer, estInstallee: estInstallee };
})();
