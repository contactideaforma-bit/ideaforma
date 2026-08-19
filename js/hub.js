/* ─────────────────────────────────────────────────────────────────────────────
   IDEAFORMA — Tableau de bord

   La page est du papier pointillé ; les blocs sont des post-it pastel dont on
   choisit la couleur (rangée dans profiles.preferences, donc identique sur le
   téléphone et sur l'ordinateur).

   Trois choses se font ici sans changer de page :
     – parler à l'assistant, au clavier ou à la voix ;
     – cocher une tâche ;
     – créer une tâche, un rendez-vous ou une note (bouton ＋ de chaque bloc).

   Le tableau de bord est PERSONNEL : rien qui touche aux dossiers OPCO n'y
   figure. Les échéances de formation vivent sur « Ma journée ».
───────────────────────────────────────────────────────────────────────────── */

const Hub = {

  _resume:     null,
  _etiquettes: [],
  _listes:     [],
  _prefs:      {},
  _iaOccupe:   false,
  _reco:       null,     // reconnaissance vocale en cours

  /* Les huit pastels, dans l'ordre où ils sont proposés. On enregistre la
     CLÉ et non la couleur : le thème sombre remplace la valeur derrière. */
  PASTELS: ['rose', 'peche', 'jaune', 'vert', 'menthe', 'ciel', 'lilas', 'gris'],
  NOM_PASTEL: {
    rose: 'Rose', peche: 'Pêche', jaune: 'Jaune', vert: 'Vert',
    menthe: 'Menthe', ciel: 'Ciel', lilas: 'Lilas', gris: 'Gris'
  },
  TEINTE_DEFAUT: {
    assistant: 'lilas', agenda: 'ciel', taches: 'vert',
    notes: 'jaune', raccourcis: 'gris', coffre: 'peche'
  },

  /* Utilisé aussi par js/agenda.js pour nommer un type d'entrée. */
  _typeLabel(type) {
    return { evenement: 'Rendez-vous', session: 'Formation',
             tache: 'Tâche', echeance: 'Échéance OPCO', note: 'Note' }[type] || type;
  },

  /* ══════════════════════════════════════════════
     RENDU
  ══════════════════════════════════════════════ */
  async render() {
    document.getElementById('pageTitle').textContent    = this._salutation();
    document.getElementById('pageSubtitle').textContent = Dates.longue(new Date());
    document.getElementById('pageHeaderRight').innerHTML = `
      <button class="btn-icon" id="hubRefresh" title="Rafraîchir"
              aria-label="Rafraîchir">↻</button>`;
    Loading.show();

    let r;
    try {
      [r, this._etiquettes, this._listes, this._prefs] = await Promise.all([
        DataStore.getResumeJour(),
        DataStore.getEtiquettes(),
        DataStore.getListes(),
        DataStore.getPreferences().catch(() => ({}))
      ]);
      this._resume = r;
    } catch (err) { peindreErreur(err); return; }

    document.getElementById('pageContent').innerHTML = `
      <div class="hub">
        <div class="hub-tuiles">${this._tuilesCorps(r)}</div>

        ${this._blocAssistant()}

        <div class="hub-grid">
          <div class="hub-col">
            ${this._blocAgenda(r)}
            ${this._blocTaches(r)}
          </div>
          <div class="hub-col">
            ${this._blocNotes(r)}
            ${this._blocRaccourcis()}
            ${this._blocExpirations(r)}
          </div>
        </div>
      </div>`;

    this._bind();
  },

  _salutation() {
    const h = new Date().getHours();
    if (h < 6)  return 'Bonne nuit';
    if (h < 12) return 'Bonjour';
    if (h < 18) return 'Bon après-midi';
    return 'Bonsoir';
  },

  /* ══════════════════════════════════════════════
     LE POST-IT — enveloppe commune à tous les blocs
  ══════════════════════════════════════════════ */
  _teinte(cle) {
    const choix = this._prefs?.blocs?.[cle];
    return this.PASTELS.includes(choix) ? choix : (this.TEINTE_DEFAUT[cle] || 'gris');
  },

  /** cle : identifiant du bloc — sert de clé de préférence ET de cible de
      rafraîchissement. outils : boutons posés dans l'en-tête. */
  _postit(cle, titre, outils, corps) {
    const t = this._teinte(cle);
    return `
      <section class="postit" data-bloc="${cle}" style="--pastel: var(--pastel-${t});">
        <header class="postit-tete">
          <h2 class="postit-titre">${titre}</h2>
          ${outils || ''}
          <button class="postit-btn" data-palette="${cle}"
                  title="Couleur du bloc" aria-label="Changer la couleur du bloc">🎨</button>
        </header>
        <div class="postit-corps">${corps}</div>
        <div class="postit-palette" data-palette-pour="${cle}" hidden>
          ${this.PASTELS.map(p => `
            <button class="postit-teinte ${p === t ? 'on' : ''}"
                    style="background: var(--pastel-${p});"
                    data-teinte="${p}" data-cle="${cle}"
                    title="${this.NOM_PASTEL[p]}"
                    aria-label="${this.NOM_PASTEL[p]}"></button>`).join('')}
        </div>
      </section>`;
  },

  _btn(attr, libelle, titre) {
    return `<button class="postit-btn" ${attr} title="${titre}" aria-label="${titre}">${libelle}</button>`;
  },
  _btnPlus(type, titre) {
    return `<button class="postit-btn postit-btn-plus" data-creer="${type}"
                    title="${titre}" aria-label="${titre}">＋</button>`;
  },

  /* ══════════════════════════════════════════════
     TUILES DE COMPTAGE
  ══════════════════════════════════════════════ */
  _tuilesCorps(r) {
    const t = (val, label, teinteNom, page) => `
      <button class="hub-tuile hub-tuile-${teinteNom}" data-goto="${page}">
        <span class="hub-tuile-val">${val}</span>
        <span class="hub-tuile-lbl">${label}</span>
      </button>`;

    return `
      ${t(r.agendaAujourdhui.filter(a => !a.termine).length, "aujourd'hui", 'rose',  'agenda')}
      ${t(r.tachesEnRetard.length,                            'en retard',   'rouge', 'taches')}
      ${t(r.tachesDuJour.length,                              'à faire',     'or',    'taches')}`;
  },

  /* ══════════════════════════════════════════════
     BLOC ASSISTANT
     Écrit ou dicté. La réponse s'affiche sur place ; si l'assistant a créé
     quelque chose, les autres blocs se remettent à jour sans effacer la
     conversation en cours.
  ══════════════════════════════════════════════ */
  _blocAssistant() {
    const exemples = [
      "Qu'est-ce que j'ai demain ?",
      'Rappelle-moi d’appeler le comptable jeudi 10h',
      'Mes tâches en retard'
    ];

    const corps = `
      <div class="ia-saisie">
        <textarea id="iaTexte" rows="1" enterkeyhint="send"
                  placeholder="Écrivez ou dictez…"></textarea>
        <button class="ia-bouton ia-bouton-micro" id="iaMicro" hidden
                title="Dicter" aria-label="Dicter la demande">🎤</button>
        <button class="ia-bouton ia-bouton-envoi" id="iaEnvoyer"
                title="Envoyer" aria-label="Envoyer la demande">➤</button>
      </div>
      <div class="ia-exemples">
        ${exemples.map(e => `<button class="ia-exemple">${esc(e)}</button>`).join('')}
      </div>
      <div class="ia-reponse" id="iaReponse" hidden></div>`;

    return this._postit('assistant', 'Assistant',
      this._btn('data-goto="assistant"', 'Discussion', 'Ouvrir la discussion complète'),
      corps);
  },

  /* ══════════════════════════════════════════════
     BLOC AGENDA
  ══════════════════════════════════════════════ */
  _blocAgenda(r) {
    return this._postit('agenda', "Aujourd'hui",
      this._btnPlus('evenement', 'Nouveau rendez-vous') +
      this._btn('data-goto="agenda"', 'Agenda', "Ouvrir l'agenda"),
      this._corpsAgenda(r));
  },

  _corpsAgenda(r) {
    const finJour    = new Date(); finJour.setHours(23, 59, 59, 999);
    const maintenant = new Date();
    const suite = r.agendaSemaine
      .filter(a => new Date(a.debut) > finJour && !a.termine)
      .slice(0, 4);

    const ligne = (a, relatif = false) => {
      const d = new Date(a.debut);
      const passe = d < maintenant && !a.journee_entiere;
      return `
        <div class="entree ${a.termine || passe ? 'entree-passee' : ''}"
             data-ouvrir-ev="${a.type === 'evenement' ? a.id : ''}"
             data-type="${a.type}">
          <span class="puce puce-evenement">○</span>
          <span class="entree-heure">
            ${relatif ? Dates.relative(a.debut)
                      : (a.journee_entiere ? 'journée' : Dates.heure(d))}
          </span>
          <span class="entree-corps">
            <span class="entree-texte">${esc(a.titre)}</span>
            <span class="entree-meta">
              ${relatif && !a.journee_entiere ? `<span>${Dates.heure(d)}</span>` : ''}
              ${a.lieu ? `<span>${esc(a.lieu)}</span>` : ''}
              ${a.type === 'session' ? '<span>formation</span>' : ''}
            </span>
          </span>
        </div>`;
    };

    return `
      ${r.agendaAujourdhui.length
        ? `<div class="log">${r.agendaAujourdhui.map(a => ligne(a)).join('')}</div>`
        : `<p class="hub-vide">Rien de programmé aujourd'hui.</p>`}
      ${suite.length ? `
        <h3 class="hub-sous-titre">Cette semaine</h3>
        <div class="log">${suite.map(a => ligne(a, true)).join('')}</div>` : ''}`;
  },

  /* ══════════════════════════════════════════════
     BLOC TÂCHES
  ══════════════════════════════════════════════ */
  _blocTaches(r) {
    return this._postit('taches', 'Mes tâches',
      this._btnPlus('tache', 'Nouvelle tâche') +
      this._btn('data-goto="taches"', 'Toutes', 'Voir toutes les tâches'),
      this._corpsTaches(r));
  },

  _corpsTaches(r) {
    const hui   = Dates.aujourdhui();
    const dans7 = Dates.iso(new Date(Date.now() + 7 * 86400000));

    const groupes = [
      { titre: 'En retard',     cls: 'rouge', items: r.taches.filter(t => t.echeance && t.echeance < hui) },
      { titre: "Aujourd'hui",   cls: 'or',    items: r.taches.filter(t => t.echeance === hui) },
      { titre: 'Cette semaine', cls: 'rose',  items: r.taches.filter(t => t.echeance > hui && t.echeance <= dans7) },
      { titre: 'Sans date',     cls: 'pale',  items: r.taches.filter(t => !t.echeance).slice(0, 6) }
    ].filter(g => g.items.length);

    if (!groupes.length) {
      return `<p class="hub-vide">Aucune tâche en attente. Profitez-en.</p>`;
    }
    return groupes.map(g => `
      <h3 class="hub-sous-titre hub-sous-titre-${g.cls}">
        ${g.titre}<span class="hub-compteur">${g.items.length}</span>
      </h3>
      <div class="log">${g.items.slice(0, 8).map(t => this.ligneTache(t)).join('')}</div>
    `).join('');
  },

  /** Une tâche : case à cocher, texte, repères. Réutilisée par la page Tâches. */
  ligneTache(t) {
    const hui    = Dates.aujourdhui();
    const retard = t.echeance && !t.fait && t.echeance < hui;

    const classeCase = t.abandonnee ? 'case case-abandon' : (t.fait ? 'case cochee' : 'case');
    const marque     = t.abandonnee ? '~' : '✓';

    return `
      <div class="entree ${t.fait ? 'est-fait' : ''} ${t.abandonnee ? 'est-abandonne' : ''}">
        <button class="${classeCase}" data-tache-id="${t.id}" role="checkbox"
                aria-checked="${t.fait ? 'true' : 'false'}"
                aria-label="${esc(t.description)}"
                title="${t.fait ? 'Rouvrir la tâche' : 'Marquer comme faite'}">${marque}</button>
        <span class="entree-corps" data-tache-open="${t.id}">
          <span class="entree-texte">
            ${t.priorite === 'haute' ? '<span class="entree-signifiant">★</span>' : ''}
            ${esc(t.description)}
          </span>
          <span class="entree-meta">
            ${t.echeance
              ? `<span class="${retard ? 'entree-retard' : ''}">${Dates.relative(t.echeance)}${
                  t.heure ? ' · ' + t.heure.slice(0, 5) : ''}</span>` : ''}
            ${t.rappel_minutes != null ? '<span title="Rappel programmé">🔔</span>' : ''}
            ${t.migrations > 0
              ? `<span class="entree-migrations" title="Repoussée ${t.migrations} fois">› ${t.migrations}</span>`
              : ''}
            ${t.listes ? `<span>${t.listes.icone} ${esc(t.listes.nom)}</span>` : ''}
            ${t.etiquettes ? pucePastille(t.etiquettes) : ''}
          </span>
        </span>
        <span class="entree-outils">
          <button class="entree-outil" data-migrer="${t.id}"
                  title="Repousser à demain" aria-label="Repousser à demain">›</button>
          <button class="entree-outil" data-editer-tache="${t.id}"
                  title="Modifier" aria-label="Modifier la tâche">✎</button>
        </span>
      </div>`;
  },

  /* ══════════════════════════════════════════════
     BLOC PENSE-BÊTE
  ══════════════════════════════════════════════ */
  _blocNotes(r) {
    return this._postit('notes', 'Pense-bête',
      this._btnPlus('note', 'Nouvelle note') +
      this._btn('data-goto="notes"', 'Tout voir', 'Voir toutes les notes'),
      this._corpsNotes(r));
  },

  _corpsNotes(r) {
    const notes = (r.notesEpinglees.length ? r.notesEpinglees : r.notes).slice(0, 4);
    if (!notes.length) return `<p class="hub-vide">Aucune note pour l'instant.</p>`;
    return `
      <div class="notes-mini">
        ${notes.map(n => `
          <button class="note-mini" style="background:${esc(n.couleur)}"
                  data-note-id="${n.id}">
            ${n.epinglee ? '<span class="note-mini-pin">📌</span>' : ''}
            ${n.titre ? `<span class="note-mini-titre">${esc(n.titre)}</span>` : ''}
            <span class="note-mini-corps">${esc((n.contenu || '').slice(0, 150))}</span>
          </button>`).join('')}
      </div>`;
  },

  /* ══════════════════════════════════════════════
     BLOC RACCOURCIS
  ══════════════════════════════════════════════ */
  _blocRaccourcis() {
    const r = (page, icone, label) =>
      `<button class="hub-raccourci" data-goto="${page}">
         <span class="hub-raccourci-ic">${icone}</span>${label}</button>`;
    return this._postit('raccourcis', 'Aller à', '',
      `<div class="hub-raccourcis">
         ${r('agenda',    '📅', 'Agenda')}
         ${r('taches',    '✓',  'Tâches')}
         ${r('notes',     '📝', 'Pense-bête')}
         ${r('coffre',    '🗄️', 'Coffre')}
         ${r('journee',   '🎓', 'Ma journée')}
         ${r('settings',  '⚙️', 'Réglages')}
       </div>`);
  },

  /* ══════════════════════════════════════════════
     BLOC « À RENOUVELER »
  ══════════════════════════════════════════════ */
  _blocExpirations(r) {
    if (!r.expirations.length) return '';
    return this._postit('coffre', 'À renouveler',
      this._btn('data-goto="coffre"', 'Coffre', 'Ouvrir le coffre'),
      this._corpsExpirations(r));
  },

  _corpsExpirations(r) {
    if (!r.expirations.length) return `<p class="hub-vide">Rien n'expire prochainement.</p>`;
    return `
      <div class="log">
        ${r.expirations.slice(0, 5).map(d => `
          <div class="entree" data-goto="coffre">
            <span class="puce puce-note">—</span>
            <span class="entree-heure entree-heure-alerte">${Dates.relative(d.date_expiration)}</span>
            <span class="entree-corps">
              <span class="entree-texte">${esc(d.titre)}</span>
              <span class="entree-meta">expire le ${Dates.courte(d.date_expiration)}</span>
            </span>
          </div>`).join('')}
      </div>`;
  },

  /* ══════════════════════════════════════════════
     MISE À JOUR PARTIELLE
     On ne repeint jamais la page entière depuis une action : la réponse de
     l'assistant et le texte en cours de saisie seraient effacés. On relit le
     résumé et on remplace le contenu des blocs concernés.
  ══════════════════════════════════════════════ */
  async _rafraichir() {
    const hub = document.querySelector('.hub');
    if (!hub) return;

    try { this._resume = await DataStore.getResumeJour(); }
    catch (err) { Toast.show('Actualisation impossible : ' + esc(err.message), 'error'); return; }

    const r = this._resume;
    const poser = (sel, html) => { const n = hub.querySelector(sel); if (n) n.innerHTML = html; };

    poser('.hub-tuiles',                       this._tuilesCorps(r));
    poser('[data-bloc="agenda"] .postit-corps', this._corpsAgenda(r));
    poser('[data-bloc="taches"] .postit-corps', this._corpsTaches(r));
    poser('[data-bloc="notes"]  .postit-corps', this._corpsNotes(r));
    poser('[data-bloc="coffre"] .postit-corps', this._corpsExpirations(r));

    updateJourneeBadge();
  },

  /* ══════════════════════════════════════════════
     INTERACTIONS
  ══════════════════════════════════════════════ */
  _bind() {
    document.getElementById('hubRefresh')?.addEventListener('click', () => this.render());

    // Écouteur posé sur le conteneur recréé à chaque rendu : sinon ils
    // s'empileraient sur #pageContent, qui, lui, survit.
    const zone = document.querySelector('.hub');

    zone.addEventListener('click', async e => {
      const cible = sel => e.target.closest(sel);

      /* ── Couleur du bloc ── */
      const teinte = cible('[data-teinte]');
      if (teinte) {
        const cle = teinte.dataset.cle, val = teinte.dataset.teinte;
        const bloc = zone.querySelector(`[data-bloc="${cle}"]`);
        // On repeint tout de suite, on enregistre ensuite : le choix d'une
        // couleur doit être instantané, même sur une connexion lente.
        bloc.style.setProperty('--pastel', `var(--pastel-${val})`);
        bloc.querySelectorAll('.postit-teinte')
            .forEach(b => b.classList.toggle('on', b.dataset.teinte === val));
        this._prefs.blocs = { ...(this._prefs.blocs || {}), [cle]: val };
        try { await DataStore.setPreference(`blocs.${cle}`, val); }
        catch { Toast.show('Couleur non enregistrée', 'warning'); }
        return;
      }

      const palette = cible('[data-palette]');
      if (palette) {
        const p = zone.querySelector(`[data-palette-pour="${palette.dataset.palette}"]`);
        if (p) p.hidden = !p.hidden;
        return;
      }

      /* ── Assistant ── */
      if (cible('#iaEnvoyer'))  return this._demander();
      if (cible('#iaMicro'))    return this._dicter();
      const exemple = cible('.ia-exemple');
      if (exemple) return this._demander(exemple.textContent.trim());

      /* ── Cocher une tâche ── */
      const check = cible('.case[data-tache-id]');
      if (check) {
        const id = check.dataset.tacheId;
        const coche = !check.classList.contains('cochee');
        // Retour visuel immédiat, avant même l'aller-retour réseau
        check.classList.toggle('cochee', coche);
        check.setAttribute('aria-checked', coche ? 'true' : 'false');
        check.closest('.entree')?.classList.toggle('est-fait', coche);
        try {
          await DataStore.setTacheFait(id, coche);
          await this._rafraichir();
        } catch (err) {
          check.classList.toggle('cochee', !coche);
          Toast.show('Erreur : ' + esc(err.message), 'error');
        }
        return;
      }

      const migrer = cible('[data-migrer]');
      if (migrer) {
        const demain = new Date(Date.now() + 86400000);
        try {
          await DataStore.migrerTache(migrer.dataset.migrer, Dates.iso(demain));
          Toast.show('Repoussée à demain', 'info');
          await this._rafraichir();
        } catch (err) { Toast.show('Erreur : ' + esc(err.message), 'error'); }
        return;
      }

      const editer = cible('[data-editer-tache]') || cible('[data-tache-open]');
      if (editer) {
        const id = editer.dataset.editerTache || editer.dataset.tacheOpen;
        this._preparer();
        const t = await DataStore.getTache(id);
        if (t) Taches.ouvrirForm(t, () => this._rafraichir());
        return;
      }

      const ev = cible('[data-ouvrir-ev]');
      if (ev && ev.dataset.ouvrirEv) {
        this._preparer();
        const e2 = await DataStore.getEvenement(ev.dataset.ouvrirEv).catch(() => null);
        if (e2) Agenda.ouvrirForm(e2, null, () => this._rafraichir());
        return;
      }

      const note = cible('[data-note-id]');
      if (note) {
        this._preparer();
        const n = await DataStore.getNote(note.dataset.noteId).catch(() => null);
        if (n) Notes.ouvrir(n, () => this._rafraichir());
        return;
      }

      const creer = cible('[data-creer]');
      if (creer) return this._creer(creer.dataset.creer);

      const nav = cible('[data-goto]');
      if (nav) return Router.navigate(nav.dataset.goto);
    });

    /* ── Champ de l'assistant : hauteur souple, Entrée envoie ── */
    const champ = document.getElementById('iaTexte');
    champ.addEventListener('input', () => {
      champ.style.height = 'auto';
      champ.style.height = Math.min(champ.scrollHeight, 120) + 'px';
    });
    champ.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._demander(); }
    });

    /* La dictée n'existe pas partout (Firefox notamment) : on n'affiche le
       micro que si le navigateur sait vraiment écouter. */
    if (window.SpeechRecognition || window.webkitSpeechRecognition) {
      document.getElementById('iaMicro').hidden = false;
    }
  },

  /* ══ Demande à l'assistant ══ */
  async _demander(texteDonne) {
    if (this._iaOccupe) return;
    const champ = document.getElementById('iaTexte');
    const texte = String(texteDonne ?? champ.value).trim();
    if (!texte) { champ.focus(); return; }

    const zone  = document.getElementById('iaReponse');
    const envoi = document.getElementById('iaEnvoyer');
    this._iaOccupe = true;
    envoi.disabled = true;
    champ.value = '';
    champ.style.height = 'auto';

    const entete = `<div class="ia-demande">« ${esc(texte)} »</div>`;
    zone.hidden = false;
    zone.innerHTML = entete + '<span class="ia-points"><i></i><i></i><i></i></span>';

    try {
      const r = await Assistant.demander(texte, {
        onEtape: libelle => {
          zone.innerHTML = entete +
            `<div class="ia-etape">${libelle}</div>` +
            '<span class="ia-points"><i></i><i></i><i></i></span>';
        }
      });

      zone.innerHTML = entete + Assistant._markdown(r.texte) +
        (r.actions.length
          ? `<div class="ia-actions">${r.actions.map(a => `<span class="ia-action">${a}</span>`).join('')}</div>`
          : '');

      // L'assistant a pu créer ou modifier quelque chose : on remet les
      // autres blocs à jour sans effacer sa réponse.
      if (r.actions.length) await this._rafraichir();

    } catch (err) {
      zone.innerHTML = entete +
        `<span class="ia-erreur">⚠️ ${esc(err.message)}</span>`;
    } finally {
      this._iaOccupe = false;
      const b = document.getElementById('iaEnvoyer');
      if (b) b.disabled = false;
    }
  },

  /* ══ Dictée ══
     Un appui lance l'écoute, un second l'arrête. Dès que le navigateur rend
     une phrase définitive, on envoie : dicter puis devoir appuyer sur
     « envoyer » n'aurait aucun intérêt par rapport au clavier. */
  _dicter() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const bouton = document.getElementById('iaMicro');
    if (!SR) { Toast.show("La dictée n'est pas disponible sur ce navigateur", 'warning'); return; }

    if (this._reco) { this._reco.stop(); return; }

    const champ = document.getElementById('iaTexte');
    const reco  = this._reco = new SR();
    reco.lang            = 'fr-FR';
    reco.interimResults  = true;
    reco.continuous      = false;
    reco.maxAlternatives = 1;

    const depart = champ.value.trim();
    let definitif = false;

    reco.onresult = e => {
      let dit = '';
      for (let i = 0; i < e.results.length; i++) {
        dit += e.results[i][0].transcript;
        if (e.results[i].isFinal) definitif = true;
      }
      champ.value = (depart ? depart + ' ' : '') + dit.trim();
    };

    reco.onerror = ev => {
      definitif = false;
      Toast.show(ev.error === 'not-allowed'
        ? 'Accès au micro refusé — autorisez-le dans les réglages du navigateur'
        : "La dictée s'est interrompue", 'warning');
    };

    reco.onend = () => {
      this._reco = null;
      bouton.classList.remove('ecoute');
      bouton.setAttribute('aria-label', 'Dicter la demande');
      if (definitif && champ.value.trim()) this._demander();
      else champ.focus();
    };

    try {
      reco.start();
      bouton.classList.add('ecoute');
      bouton.setAttribute('aria-label', "Arrêter la dictée");
    } catch {
      this._reco = null;
      Toast.show("La dictée n'a pas pu démarrer", 'warning');
    }
  },

  /* ── Ouverture des formulaires sans quitter le tableau de bord ── */
  _preparer() {
    Taches._listes     = this._listes;
    Taches._etiquettes = this._etiquettes;
    Notes._etiquettes  = this._etiquettes;
    Agenda._etiquettes = this._etiquettes;
  },

  _creer(type) {
    this._preparer();
    const apres = () => this._rafraichir();
    if (type === 'tache')     return Taches.ouvrirForm(null, apres);
    if (type === 'evenement') return Agenda.ouvrirForm(null, Dates.aujourdhui(), apres);
    return Notes.ouvrir(null, apres);
  }
};


/* ─────────────────────────────────────────────────────────────────────────────
   QuickParse — comprendre « RDV dentiste vendredi 9h30 » sans appeler l'IA.
   Utilisé par la saisie éclair de la page Tâches.
   Volontairement simple : ce qu'il ne comprend pas devient une tâche sans date,
   ce qui n'est jamais faux, juste incomplet.
───────────────────────────────────────────────────────────────────────────── */
const QuickParse = {

  MOTS_RDV: /\b(rdv|rendez-?vous|réunion|reunion|visio|appel avec|déjeuner|dejeuner|dîner|diner|consultation|entretien)\b/i,
  /* Verbes d'action : même avec une heure, c'est une tâche à faire, pas un
     créneau à bloquer dans l'agenda. */
  MOTS_TACHE: /\b(rappeler|appeler|relancer|payer|régler|regler|acheter|envoyer|déposer|deposer|préparer|preparer|penser à|penser a|commander|imprimer|signer|répondre|repondre|vérifier|verifier|finir|terminer)\b/i,
  MOTS_URGENT: /\b(urgent|important|asap|vite)\b/i,
  JOURS: { dimanche: 0, lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6 },

  analyser(texte) {
    let t = ' ' + texte.trim() + ' ';
    const base = new Date();
    base.setSeconds(0, 0);

    let jour = null, heure = null, minute = 0, trouveHeure = false;

    /* ── Heure : « 14h », « 14h30 », « 9:15 », « à 8 h » ── */
    const mH = t.match(/(?:\bà\s*|\bvers\s*)?(\d{1,2})\s*(?:h|:)\s*(\d{2})?\b/i);
    if (mH) {
      const h = parseInt(mH[1], 10);
      if (h >= 0 && h <= 23) {
        heure = h; minute = mH[2] ? parseInt(mH[2], 10) : 0;
        trouveHeure = true;
        t = t.replace(mH[0], ' ');
      }
    }

    /* ── Jour ── */
    if (/\baujourd'?hui\b/i.test(t)) {
      jour = new Date(base); t = t.replace(/\baujourd'?hui\b/i, ' ');
    } else if (/\bdemain\b/i.test(t)) {
      jour = new Date(base); jour.setDate(jour.getDate() + 1);
      t = t.replace(/\bdemain\b/i, ' ');
    } else if (/\baprès-?demain\b/i.test(t)) {
      jour = new Date(base); jour.setDate(jour.getDate() + 2);
      t = t.replace(/\baprès-?demain\b/i, ' ');
    } else {
      // « lundi », « lundi prochain »
      const mJ = t.match(/\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)(\s+prochain)?\b/i);
      if (mJ) {
        const cible = this.JOURS[mJ[1].toLowerCase()];
        jour = new Date(base);
        let delta = (cible - jour.getDay() + 7) % 7;
        if (delta === 0) delta = 7;                 // « mardi » un mardi = mardi prochain
        // « lundi prochain » désigne, dans l'usage courant, le lundi qui vient :
        // on ne rajoute donc pas une semaine.
        jour.setDate(jour.getDate() + delta);
        t = t.replace(mJ[0], ' ');
      } else {
        // « le 24/09 », « 24/09/2026 », « 24 septembre »
        const mD = t.match(/\b(?:le\s+)?(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
        const MOIS = ['janvier','février','fevrier','mars','avril','mai','juin','juillet',
                      'août','aout','septembre','octobre','novembre','décembre','decembre'];
        const mM = t.match(new RegExp(`\\b(?:le\\s+)?(\\d{1,2})\\s+(${MOIS.join('|')})\\b`, 'i'));
        if (mD) {
          const an = mD[3] ? (mD[3].length === 2 ? 2000 + +mD[3] : +mD[3]) : base.getFullYear();
          jour = new Date(an, +mD[2] - 1, +mD[1]);
          if (!mD[3] && jour < base) jour.setFullYear(an + 1);
          t = t.replace(mD[0], ' ');
        } else if (mM) {
          const idx = MOIS.indexOf(mM[2].toLowerCase());
          const mois = [0,1,1,2,3,4,5,6,7,7,8,9,10,11,11][idx];
          jour = new Date(base.getFullYear(), mois, +mM[1]);
          if (jour < base) jour.setFullYear(base.getFullYear() + 1);
          t = t.replace(mM[0], ' ');
        }
      }
    }

    const urgent = this.MOTS_URGENT.test(t);
    if (urgent) t = t.replace(this.MOTS_URGENT, ' ');

    const titre = t.replace(/\s+/g, ' ')
                   .replace(/\s+(à|a|vers|le|pour|avant|après|apres)\s*$/i, '')  // « réunion à » → « réunion »
                   .replace(/^\s*(le|la|les|à|a|de|du)\s+/i, '')
                   .replace(/^[\s:;,\-–—]+/, '')                                 // « urgent : relancer » → « relancer »
                   .replace(/[\s:;,\-–—]+$/, '')
                   .trim() || texte.trim();

    /* Rendez-vous si on a une heure précise, sauf si la phrase commence par
       un verbe d'action — « rappeler Paul demain 14h » reste une tâche, avec
       son rappel, plutôt qu'un créneau bloqué dans l'agenda. */
    const estRdv = trouveHeure
      && (jour !== null || this.MOTS_RDV.test(texte))
      && (this.MOTS_RDV.test(texte) || !this.MOTS_TACHE.test(texte));

    if (estRdv) {
      const d = jour ? new Date(jour) : new Date(base);
      d.setHours(heure, minute, 0, 0);
      if (!jour && d < base) d.setDate(d.getDate() + 1);   // « 9h » passé → demain
      return { type: 'evenement', titre, date: d };
    }

    return {
      type: 'tache',
      titre,
      echeance: jour ? Dates.iso(jour) : null,
      heure:    trouveHeure ? `${String(heure).padStart(2, '0')}:${String(minute).padStart(2, '0')}` : null,
      priorite: urgent ? 'haute' : 'normale'
    };
  }
};
