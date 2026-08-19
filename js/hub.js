/* ─────────────────────────────────────────────────────────────────────────────
   IDEAFORMA — Tableau de bord

   Le tableau de bord d'origine, en blocs, habillé en carnet : mêmes repères
   qu'avant, mais avec la grammaire du bullet journal.

     •  tâche à faire   ✕  faite   ›  repoussée   ~  abandonnée
     ○  rendez-vous     —  note    ★  priorité

   Il est PERSONNEL : rien qui touche aux dossiers OPCO n'y figure. Les
   échéances de formation vivent sur « Ma journée ».
───────────────────────────────────────────────────────────────────────────── */

const Hub = {

  _resume:     null,
  _etiquettes: [],
  _listes:     [],

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
      [r, this._etiquettes, this._listes] = await Promise.all([
        DataStore.getResumeJour(),
        DataStore.getEtiquettes(),
        DataStore.getListes()
      ]);
      this._resume = r;
    } catch (err) { peindreErreur(err); return; }

    document.getElementById('pageContent').innerHTML = `
      <div class="hub">
        ${this._barreSaisie()}
        ${this._tuiles(r)}

        <div class="hub-grid">
          <div class="hub-col">
            ${this._blocAgenda(r)}
            ${this._blocTaches(r)}
          </div>
          <div class="hub-col">
            ${this._blocRaccourcis()}
            ${this._blocNotes(r)}
            ${this._blocExpirations(r)}
          </div>
        </div>
      </div>`;

    this._bind();
  },

  _rafraichir() { return this.render(); },

  _salutation() {
    const h = new Date().getHours();
    if (h < 6)  return 'Bonne nuit';
    if (h < 12) return 'Bonjour';
    if (h < 18) return 'Bon après-midi';
    return 'Bonsoir';
  },

  /* ══ Saisie rapide + création directe ══════════════════════════════════
     « Rappeler le comptable demain 14h » devient une tâche datée, avec son
     rappel. On analyse le texte dans le navigateur ; l'IA n'est là que pour
     les tournures que QuickParse ne sait pas lire. */
  _barreSaisie() {
    return `
      <div class="hub-saisie">
        <div class="hub-saisie-ligne">
          <span class="hub-saisie-puce">•</span>
          <input id="quickInput" autocomplete="off"
                 placeholder="Noter vite…  •  tâche   ○  rendez-vous   —  note" />
          <select id="quickEtiq" class="hub-saisie-etiq" aria-label="Étiquette">
            <option value="">Étiquette</option>
            ${this._etiquettes.map(e =>
              `<option value="${e.id}">${e.icone} ${esc(e.nom)}</option>`).join('')}
          </select>
          <button class="btn btn-primary btn-sm" id="quickAdd">Ajouter</button>
        </div>
        <div class="hub-saisie-indice" id="quickHint"></div>
        <div class="hub-creer">
          <button class="hub-creer-btn" data-creer="tache">
            <span class="hub-creer-sym">•</span> Tâche</button>
          <button class="hub-creer-btn" data-creer="evenement">
            <span class="hub-creer-sym">○</span> Rendez-vous</button>
          <button class="hub-creer-btn" data-creer="note">
            <span class="hub-creer-sym">—</span> Note</button>
        </div>
      </div>`;
  },

  _tuiles(r) {
    const t = (val, label, teinteNom, page) => `
      <button class="hub-tuile hub-tuile-${teinteNom}" data-goto="${page}">
        <span class="hub-tuile-val">${val}</span>
        <span class="hub-tuile-lbl">${label}</span>
      </button>`;

    return `
      <div class="hub-tuiles">
        ${t(r.agendaAujourdhui.filter(a => !a.termine).length, "aujourd'hui", 'rose',  'agenda')}
        ${t(r.tachesEnRetard.length,                            'en retard',   'rouge', 'taches')}
        ${t(r.tachesDuJour.length,                              'à faire',     'or',    'taches')}
      </div>`;
  },

  /* ══ Rendez-vous du jour ══ */
  _blocAgenda(r) {
    const finJour = new Date(); finJour.setHours(23, 59, 59, 999);
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
      <section class="section-card">
        <header class="section-card-header">
          <h2 class="section-card-title">Aujourd'hui</h2>
          <button class="btn btn-sm btn-secondary" data-goto="agenda">Agenda</button>
        </header>
        <div class="section-card-body">
          ${r.agendaAujourdhui.length
            ? `<div class="log">${r.agendaAujourdhui.map(a => ligne(a)).join('')}</div>`
            : `<p class="hub-vide">Rien de programmé aujourd'hui.</p>`}

          ${suite.length ? `
            <h3 class="hub-sous-titre">À venir cette semaine</h3>
            <div class="log">${suite.map(a => ligne(a, true)).join('')}</div>` : ''}
        </div>
      </section>`;
  },

  /* ══ Tâches ══ */
  _blocTaches(r) {
    const hui   = Dates.aujourdhui();
    const dans7 = Dates.iso(new Date(Date.now() + 7 * 86400000));

    const groupes = [
      { titre: 'En retard',     cls: 'rouge', items: r.taches.filter(t => t.echeance && t.echeance < hui) },
      { titre: "Aujourd'hui",   cls: 'or',    items: r.taches.filter(t => t.echeance === hui) },
      { titre: 'Cette semaine', cls: 'rose',  items: r.taches.filter(t => t.echeance > hui && t.echeance <= dans7) },
      { titre: 'Sans date',     cls: 'pale',  items: r.taches.filter(t => !t.echeance).slice(0, 6) }
    ].filter(g => g.items.length);

    return `
      <section class="section-card">
        <header class="section-card-header">
          <h2 class="section-card-title">Mes tâches</h2>
          <button class="btn btn-sm btn-secondary" data-goto="taches">Toutes</button>
        </header>
        <div class="section-card-body">
          ${groupes.length ? groupes.map(g => `
            <h3 class="hub-sous-titre hub-sous-titre-${g.cls}">
              ${g.titre}<span class="hub-compteur">${g.items.length}</span>
            </h3>
            <div class="log">${g.items.slice(0, 8).map(t => this.ligneTache(t)).join('')}</div>
          `).join('')
          : `<p class="hub-vide">Aucune tâche en attente. Profitez-en.</p>`}
        </div>
      </section>`;
  },

  /** Une tâche, dans la grammaire du carnet. Réutilisée par la page Tâches. */
  ligneTache(t) {
    const hui     = Dates.aujourdhui();
    const retard  = t.echeance && !t.fait && t.echeance < hui;
    const symbole = t.fait ? '✕' : t.abandonnee ? '~' : '•';
    const classe  = t.fait ? 'puce-fait' : t.abandonnee ? 'puce-abandonnee' : 'puce-tache';

    return `
      <div class="entree ${t.fait ? 'est-fait' : ''} ${t.abandonnee ? 'est-abandonne' : ''}">
        <button class="puce ${classe}" data-tache-id="${t.id}"
                aria-label="${t.fait ? 'Rouvrir' : 'Marquer comme fait'}">${symbole}</button>
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
          <button class="entree-outil" data-migrer="${t.id}" title="Repousser à demain">›</button>
          <button class="entree-outil" data-editer-tache="${t.id}" title="Modifier">✎</button>
        </span>
      </div>`;
  },

  /* ══ Raccourcis ══ */
  _blocRaccourcis() {
    const r = (page, icone, label) =>
      `<button class="hub-raccourci" data-goto="${page}">
         <span class="hub-raccourci-ic">${icone}</span>${label}</button>`;
    return `
      <section class="section-card">
        <div class="section-card-body hub-raccourcis">
          ${r('assistant', '🤖', 'Assistant')}
          ${r('agenda',    '📅', 'Agenda')}
          ${r('taches',    '✓',  'Tâches')}
          ${r('notes',     '📝', 'Pense-bête')}
          ${r('coffre',    '🗄️', 'Coffre')}
          ${r('journee',   '🎓', 'Ma journée')}
        </div>
      </section>`;
  },

  /* ══ Pense-bête ══ */
  _blocNotes(r) {
    const notes = (r.notesEpinglees.length ? r.notesEpinglees : r.notes).slice(0, 4);
    return `
      <section class="section-card">
        <header class="section-card-header">
          <h2 class="section-card-title">Pense-bête</h2>
          <button class="btn btn-sm btn-secondary" data-goto="notes">Tout voir</button>
        </header>
        <div class="section-card-body">
          ${notes.length ? `
            <div class="notes-mini">
              ${notes.map(n => `
                <button class="note-mini" style="background:${esc(n.couleur)}"
                        data-note-id="${n.id}">
                  ${n.epinglee ? '<span class="note-mini-pin">📌</span>' : ''}
                  ${n.titre ? `<span class="note-mini-titre">${esc(n.titre)}</span>` : ''}
                  <span class="note-mini-corps">${esc((n.contenu || '').slice(0, 150))}</span>
                </button>`).join('')}
            </div>`
            : `<p class="hub-vide">Aucune note pour l'instant.</p>`}
        </div>
      </section>`;
  },

  /* ══ Documents qui expirent ══ */
  _blocExpirations(r) {
    if (!r.expirations.length) return '';
    return `
      <section class="section-card">
        <header class="section-card-header">
          <h2 class="section-card-title">À renouveler</h2>
          <button class="btn btn-sm btn-secondary" data-goto="coffre">Coffre</button>
        </header>
        <div class="section-card-body">
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
          </div>
        </div>
      </section>`;
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

      const check = cible('.puce[data-tache-id]');
      if (check) {
        const t = await DataStore.getTache(check.dataset.tacheId);
        await DataStore.setTacheFait(t.id, !t.fait);
        await this._rafraichir();
        updateJourneeBadge();
        return;
      }

      const migrer = cible('[data-migrer]');
      if (migrer) {
        const demain = new Date(Date.now() + 86400000);
        try {
          await DataStore.migrerTache(migrer.dataset.migrer, Dates.iso(demain));
          Toast.show('Repoussée à demain', 'info');
          await this._rafraichir();
          updateJourneeBadge();
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

    /* ── Saisie rapide ── */
    const input  = document.getElementById('quickInput');
    const indice = document.getElementById('quickHint');

    const apercu = () => {
      const texte = input.value.trim();
      if (!texte) { indice.textContent = ''; return; }
      const p = this._lire(texte);
      indice.textContent =
        p.type === 'note'      ? `— note « ${p.titre} »`
      : p.type === 'evenement' ? `○ rendez-vous « ${p.titre} » · ${Dates.longue(p.date)} à ${Dates.heure(p.date)}`
      : `• tâche « ${p.titre} »` +
        (p.echeance ? ` · ${Dates.relative(p.echeance)}${p.heure ? ' à ' + p.heure : ''}` : ' · sans date') +
        (p.priorite === 'haute' ? ' · priorité' : '');
    };

    input.addEventListener('input', apercu);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); this._ajoutRapide(); }
    });
    document.getElementById('quickAdd').addEventListener('click', () => this._ajoutRapide());

    if (this._reprendreFocus) { input.focus(); this._reprendreFocus = false; }
  },

  /* ── Lecture d'une ligne de saisie ──
     Les symboles du carnet priment sur l'analyse automatique :
       •  force une tâche    ○  force un rendez-vous    —  force une note
     Un préfixe alphabétique n'est reconnu que suivi d'une espace, sinon
     « organiser le placard » deviendrait un rendez-vous. */
  _lire(texte) {
    const brut  = texte.trim();
    const isole = c => brut[0] === c && (brut.length === 1 || brut[1] === ' ');

    if (isole('—') || isole('–') || isole('-')) {
      return { type: 'note', titre: brut.slice(1).trim() };
    }
    if (brut[0] === '○' || isole('o') || isole('O')) {
      const p = QuickParse.analyser(brut.slice(1).trim());
      const d = p.type === 'evenement'
        ? p.date
        : Dates.combiner(p.echeance || Dates.aujourdhui(), p.heure || '09:00');
      return { type: 'evenement', titre: p.titre, date: d };
    }
    if (brut[0] === '•' || isole('*')) {
      const p = QuickParse.analyser(brut.slice(1).trim());
      return { type: 'tache', titre: p.titre,
               echeance: p.echeance || (p.date ? Dates.iso(p.date) : null),
               heure:    p.heure    || (p.date ? Dates.heure(p.date) : null),
               priorite: p.priorite || 'normale' };
    }

    const p = QuickParse.analyser(brut);
    if (p.type === 'evenement') return { type: 'evenement', titre: p.titre, date: p.date };
    return { type: 'tache', titre: p.titre, echeance: p.echeance,
             heure: p.heure, priorite: p.priorite };
  },

  async _ajoutRapide() {
    const input = document.getElementById('quickInput');
    const texte = input.value.trim();
    if (!texte) return;

    const etiquetteId = document.getElementById('quickEtiq').value || null;
    const p = this._lire(texte);

    try {
      if (p.type === 'note') {
        await DataStore.addNote({ contenu: p.titre, etiquetteId, couleur: '#FCE7F1' });
        Toast.show('Note ajoutée', 'success');
      } else if (p.type === 'evenement') {
        await DataStore.addEvenement({
          titre:   p.titre,
          debut:   p.date.toISOString(),
          fin:     new Date(p.date.getTime() + 3600000).toISOString(),
          etiquetteId,
          rappels: [15]
        });
        Toast.show('Rendez-vous ajouté · rappel 15 min avant', 'success');
      } else {
        await DataStore.addTacheComplete({
          description:   p.titre,
          echeance:      p.echeance || null,
          heure:         p.heure    || null,
          rappelMinutes: p.heure ? 15 : null,
          priorite:      p.priorite,
          etiquetteId
        });
        Toast.show('Tâche ajoutée', 'success');
      }
      input.value = '';
      this._reprendreFocus = true;
      await this._rafraichir();
      updateJourneeBadge();
    } catch (err) {
      Toast.show('Erreur : ' + esc(err.message), 'error');
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
   QuickParse — comprendre « RDV dentiste vendredi 9h30 » sans appeler l'IA
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
