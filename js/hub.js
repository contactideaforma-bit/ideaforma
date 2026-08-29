/* ─────────────────────────────────────────────────────────────────────────────
   IDEAFORMA — Tableau de bord

   La page est du papier pointillé ; les blocs sont des post-it pastel dont on
   choisit la couleur (rangée dans profiles.preferences, donc identique sur le
   téléphone et sur l'ordinateur).

   Deux choses se font ici sans changer de page :
     – cocher une tâche ;
     – créer une tâche, un rendez-vous ou une note (bouton + de chaque bloc).
   L'assistant, lui, vit dans le bouton flottant en bas à droite (assistant.js).

   Le tableau de bord est PERSONNEL : rien qui touche aux dossiers OPCO n'y
   figure. Les échéances de formation vivent sur « Ma journée ».
───────────────────────────────────────────────────────────────────────────── */

const Hub = {

  _resume:     null,
  _etiquettes: [],
  _listes:     [],
  _prefs:      {},
  listeOuverte:     null,    // id de liste, 'sans', ou null = carrousel
  _voirFaitesListe: false,

  /* Les huit pastels, dans l'ordre où ils sont proposés. On enregistre la
     CLÉ et non la couleur : le thème sombre remplace la valeur derrière. */
  PASTELS: ['rose', 'peche', 'jaune', 'vert', 'menthe', 'ciel', 'lilas', 'gris'],
  NOM_PASTEL: {
    rose: 'Rose', peche: 'Pêche', jaune: 'Jaune', vert: 'Vert',
    menthe: 'Menthe', ciel: 'Ciel', lilas: 'Lilas', gris: 'Gris'
  },
  TEINTE_DEFAUT: {
    assistant: 'lilas', agenda: 'ciel', taches: 'vert',
    notes: 'jaune', raccourcis: 'gris', coffre: 'peche', urgent: 'rose'
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
              aria-label="Rafraîchir">${Icone('rafraichir')}</button>`;
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

    // Une liste était ouverte en pleine largeur : on y retourne telle quelle.
    if (this.listeOuverte) return this._peindreListe();

    document.getElementById('pageContent').innerHTML = `
      <div class="hub">
        <div class="hub-tuiles">${this._tuilesCorps(r)}</div>

        <div class="hub-grid">
          <div class="hub-col">
            ${this._blocUrgent(r)}
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
    // Demandé le 29/08/2026 : « La King » la journée, Vincent le soir.
    const h = new Date().getHours();
    if (h < 6)  return 'Bonne nuit Vincent';
    if (h < 18) return 'Bonjour La King';
    return 'Bonsoir Vincent';
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
          <button class="postit-btn postit-btn-icone" data-palette="${cle}"
                  title="Couleur du bloc" aria-label="Changer la couleur du bloc"
                  >${Icone('palette', { taille: 18 })}</button>
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
    return `<button class="postit-btn postit-btn-icone" data-creer="${type}"
                    title="${titre}" aria-label="${titre}">${Icone('plus', { taille: 19 })}</button>`;
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
      ${t(r.tachesDuJour.length,                              'à faire',     'or',    'taches')}
      <button class="hub-urgence" id="hubUrgence"
              title="Créer une tâche urgente : priorité haute, échéance aujourd'hui">
        ${Icone('alerte', { taille: 22 })}
        <span class="hub-urgence-lbl">Urgence</span>
      </button>`;
  },

  /* ══════════════════════════════════════════════
     LE GROUPE À BANDEAU — partagé avec la page Tâches
     Un bandeau coloré (pictogramme, titre, nombre, chevron) au-dessus d'une
     liste de lignes. Même dessin partout, pour qu'on s'y retrouve.
     g : { cle, titre, cls (rouge|or|rose|prune|bleu|pale), icone, items }
  ══════════════════════════════════════════════ */
  groupe(g, corps, replie = false) {
    return `
      <section class="hub-groupe hub-groupe-${g.cls}" ${replie ? 'data-replie="1"' : ''}>
        <button class="hub-groupe-bande" data-groupe="${g.cle}" aria-expanded="${replie ? 'false' : 'true'}">
          <span class="hub-groupe-ic">${Icone(g.icone, { taille: 15 })}</span>
          <span class="hub-groupe-titre">${g.titre}</span>
          ${g.items ? `<span class="hub-groupe-nb">${g.items.length}</span>` : ''}
          <span class="hub-groupe-chevron">${Icone('chevron', { taille: 15 })}</span>
        </button>
        <div class="hub-groupe-log">${corps}</div>
      </section>`;
  },

  /* Repli / dépli d'un bandeau — appelé par les écouteurs des deux pages */
  basculerGroupe(bande) {
    const sec = bande.closest('.hub-groupe');
    const replie = sec.hasAttribute('data-replie');
    if (replie) sec.removeAttribute('data-replie'); else sec.setAttribute('data-replie', '1');
    bande.setAttribute('aria-expanded', replie ? 'true' : 'false');
  },

  /* ══════════════════════════════════════════════
     BLOC URGENT — tout ce qui est en priorité haute et pas fait.
     Invisible quand il n'y a rien d'urgent : pas d'alarme pour rien.
  ══════════════════════════════════════════════ */
  _tachesUrgentes(r) {
    return r.taches
      .filter(t => t.priorite === 'haute' && !t.fait && !t.abandonnee)
      .sort((a, b) => String(a.echeance || '9999').localeCompare(String(b.echeance || '9999')));
  },

  _blocUrgent(r) {
    if (!this._tachesUrgentes(r).length) return '';
    return this._postit('urgent', 'Urgent',
      this._btn('data-nouvelle-urgence', `${Icone('plus', { taille: 15 })} Urgence`, 'Créer une tâche urgente'),
      this._corpsUrgent(r));
  },

  _corpsUrgent(r) {
    const urgentes = this._tachesUrgentes(r);
    if (!urgentes.length) {
      return `<p class="hub-vide">Plus rien d'urgent. Respirez.</p>`;
    }
    return `
      <div class="log">${urgentes.slice(0, 8).map(t => this.ligneTache(t)).join('')}</div>
      <p class="hub-urgent-note">Une tâche de la liste « Urgent » non cochée
      est relancée chaque jour à 10 h et 15 h.</p>`;
  },

  /* ══════════════════════════════════════════════
     BLOC AGENDA
  ══════════════════════════════════════════════ */
  _blocAgenda(r) {
    return this._postit('agenda', 'Agenda',
      this._btnPlus('evenement', 'Nouveau rendez-vous') +
      this._btn('data-goto="agenda"', 'Tout voir', "Ouvrir l'agenda"),
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
          <span class="puce puce-evenement">${Icone('cercle', { taille: 17 })}</span>
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

    const auj = r.agendaAujourdhui;
    return `
      ${this.groupe({ cle: 'auj', titre: "Aujourd'hui", cls: 'bleu', icone: 'horloge', items: auj },
        auj.length ? `<div class="log">${auj.map(a => ligne(a)).join('')}</div>`
                   : `<p class="hub-vide">Rien de programmé aujourd'hui.</p>`)}
      ${this.groupe({ cle: 'sem', titre: 'Cette semaine', cls: 'prune', icone: 'agenda', items: suite },
        suite.length ? `<div class="log">${suite.map(a => ligne(a, true)).join('')}</div>`
                     : `<p class="hub-vide">Rien d'autre cette semaine.</p>`)}`;
  },

  /* ══════════════════════════════════════════════
     BLOC LISTES — le carrousel (v12)
     Chaque liste est une carte à sa couleur, la plus récemment ouverte en
     tête. Choisir une carte ouvre la liste en pleine largeur (_peindreListe).
  ══════════════════════════════════════════════ */
  _blocTaches(r) {
    return this._postit('taches', 'Mes listes',
      this._btnPlus('tache', 'Nouvelle tâche') +
      this._btn('data-goto="taches"', 'Toutes', 'Voir toutes les tâches'),
      this._corpsTaches(r));
  },

  _corpsTaches(r) {
    const hui   = Dates.aujourdhui();
    const dans7 = Dates.iso(new Date(Date.now() + 7 * 86400000));
    const t     = r.taches;                       // les tâches non faites

    const pilule = (n, titre, cls) => `
      <span class="hub-taches-pilule hub-taches-pilule-${cls} ${n ? '' : 'vide'}">
        <b>${n}</b> ${titre}
      </span>`;

    /* La liste « Urgent » d'abord, puis la plus récemment ouverte. */
    const urg = l => (l.nom || '').toLowerCase() === 'urgent' ? 0 : 1;
    const listes = [...this._listes].sort((a, b) =>
      urg(a) - urg(b)
      || String(b.utilisee_le || b.cree_le || '').localeCompare(
         String(a.utilisee_le || a.cree_le || ''))
      || (a.ordre ?? 0) - (b.ordre ?? 0));

    const carte = (l, id, cls = '') => {
      const propres = t.filter(x => (x.liste_id || 'sans') === id);
      const retard  = propres.filter(x => x.echeance && x.echeance < hui).length;
      return `
        <button class="liste-carte ${cls}" data-ouvrir-liste="${id}"
                style="--lc:${esc(l.couleur || '#9E3057')}"
                aria-label="Ouvrir la liste ${esc(l.nom)}">
          <span class="liste-carte-tete">
            <span class="liste-carte-ic">${Icone(l.icone, { taille: 20, defaut: 'liste' })}</span>
            <span class="liste-carte-nom">${esc(l.nom)}</span>
          </span>
          <span class="liste-carte-nb">${propres.length ? `${propres.length} à faire` : 'rien à faire'}</span>
          ${retard ? `<span class="liste-carte-retard">${Icone('alerte', { taille: 12 })} ${retard} en retard</span>` : ''}
          <span class="liste-carte-apercu">
            ${propres.slice(0, 2).map(x => `<span>• ${esc(x.description)}</span>`).join('')}
          </span>
        </button>`;
    };

    const sans = t.filter(x => !x.liste_id).length;

    return `
      <div class="hub-taches-resume">
        ${pilule(t.filter(x => x.echeance && x.echeance < hui).length, 'en retard', 'rouge')}
        ${pilule(t.filter(x => x.echeance === hui).length, "aujourd'hui", 'or')}
        ${pilule(t.filter(x => x.echeance > hui && x.echeance <= dans7).length, 'cette semaine', 'rose')}
      </div>
      <div class="hub-carrousel">
        ${listes.map(l => carte(l, l.id)).join('')}
        ${sans ? carte({ nom: 'Sans liste', couleur: '#8A8A86', icone: 'liste' }, 'sans', 'liste-carte-sans') : ''}
        <button class="liste-carte liste-carte-plus" data-nouvelle-liste
                aria-label="Créer une nouvelle liste">
          ${Icone('plus', { taille: 24 })}
          <span>Nouvelle liste</span>
        </button>
      </div>`;
  },

  /* ══════════════════════════════════════════════
     LA LISTE OUVERTE — pleine largeur, bouton retour
  ══════════════════════════════════════════════ */
  async ouvrirListe(id) {
    this.listeOuverte     = id;
    this._voirFaitesListe = false;
    if (id !== 'sans') DataStore.toucherListe(id);   // ordonne le carrousel
    await this._peindreListe();
  },

  async _peindreListe() {
    const id   = this.listeOuverte;
    const sans = id === 'sans';
    const l    = sans ? { nom: 'Sans liste', couleur: '#8A8A86', icone: 'liste' }
                      : this._listes.find(x => x.id === id);
    if (!l) { this.listeOuverte = null; return this.render(); }

    document.getElementById('pageTitle').textContent    = l.nom;
    document.getElementById('pageSubtitle').textContent = 'Liste de tâches';
    document.getElementById('pageHeaderRight').innerHTML = '';

    let taches;
    try {
      if (!this._etiquettes.length) this._etiquettes = await DataStore.getEtiquettes();
      taches = await DataStore.getTachesFiltrees({
        listeId:            sans ? undefined : id,
        sansListe:          sans,
        fait:               this._voirFaitesListe ? undefined : false,
        inclureAbandonnees: this._voirFaitesListe
      });
    } catch (err) { peindreErreur(err); return; }

    const enCours = taches.filter(t => !t.fait && !t.abandonnee);
    const faites  = taches.filter(t => t.fait || t.abandonnee);

    document.getElementById('pageContent').innerHTML = `
      <div class="hub liste-vue" style="--lc:${esc(l.couleur || '#9E3057')}">
        <div class="liste-vue-tete">
          <button class="btn btn-secondary liste-vue-retour" data-retour-carrousel
                  aria-label="Revenir au tableau de bord">
            ${Icone('chevron', { taille: 15 })} Retour
          </button>
          <span class="liste-vue-titre">
            ${Icone(l.icone, { taille: 20, defaut: 'liste' })}
            ${esc(l.nom)}
            <span class="hub-compteur">${enCours.length}</span>
          </span>
          <span class="liste-vue-outils">
            ${sans ? '' : `
              <button class="btn btn-sm btn-secondary" data-regler-liste
                      title="Nom, couleur et pictogramme de la liste"
                      >${Icone('crayon', { taille: 15 })} Régler</button>`}
            <button class="btn btn-sm ${this._voirFaitesListe ? 'btn-primary' : 'btn-secondary'}"
                    data-voir-faites aria-pressed="${this._voirFaitesListe ? 'true' : 'false'}"
                    title="Afficher aussi les tâches terminées et abandonnées"
                    >${Icone('check', { taille: 15 })} Terminées</button>
            <button class="btn btn-sm btn-primary" data-ajouter-tache
                    >${Icone('plus', { taille: 15 })} Tâche</button>
          </span>
        </div>

        <div class="feuille liste-vue-feuille">
          ${enCours.length
            ? `<div class="log">${enCours.map(t => this.ligneTache(t)).join('')}</div>`
            : `<div class="empty-state">
                 <div class="empty-icon">${Icone('check', { taille: 34 })}</div>
                 Rien à faire dans cette liste. Profitez-en.
               </div>`}
          ${this._voirFaitesListe && faites.length ? `
            <div class="liste-vue-faites">
              <div class="liste-vue-faites-titre">Terminées et abandonnées</div>
              <div class="log">${faites.slice(0, 100).map(t => this.ligneTache(t)).join('')}</div>
            </div>` : ''}
        </div>
      </div>`;

    this._bindListe(l);
  },

  _bindListe(l) {
    const zone = document.querySelector('.liste-vue');
    const repeindre = () => this._peindreListe();

    zone.addEventListener('click', async e => {
      const cible = sel => e.target.closest(sel);

      if (cible('[data-retour-carrousel]')) {
        this.listeOuverte = null;
        return this.render();
      }

      if (cible('[data-voir-faites]')) {
        this._voirFaitesListe = !this._voirFaitesListe;
        return repeindre();
      }

      if (cible('[data-ajouter-tache]')) {
        this._preparer();
        // Un objet sans id : le formulaire s'ouvre en CRÉATION, la liste
        // courante déjà choisie (Taches.ouvrirForm regarde t.liste_id).
        return Taches.ouvrirForm(
          this.listeOuverte === 'sans' ? null : { liste_id: this.listeOuverte },
          repeindre);
      }

      if (cible('[data-regler-liste]')) {
        this._preparer();
        return Taches._formListe(async () => {
          this._listes = await DataStore.getListes();
          if (!this._listes.some(x => x.id === this.listeOuverte)) this.listeOuverte = null;
          if (this.listeOuverte) await this._peindreListe(); else await this.render();
        }, l);
      }

      /* ── Cocher / décocher, avec retour visuel immédiat ── */
      const check = cible('.case[data-tache-id]');
      if (check) {
        const id    = check.dataset.tacheId;
        const coche = !check.classList.contains('cochee');
        check.classList.toggle('cochee', coche);
        check.setAttribute('aria-checked', coche ? 'true' : 'false');
        check.closest('.entree')?.classList.toggle('est-fait', coche);
        try {
          await DataStore.setTacheFait(id, coche);
          updateJourneeBadge();
          await repeindre();
        } catch (err) {
          check.classList.toggle('cochee', !coche);
          Toast.show('Erreur : ' + esc(err.message), 'error');
        }
        return;
      }

      const migrer = cible('[data-migrer]');
      if (migrer) {
        try {
          await DataStore.migrerTache(migrer.dataset.migrer,
                                      Dates.iso(new Date(Date.now() + 86400000)));
          Toast.show('Repoussée à demain', 'info');
          updateJourneeBadge();
          await repeindre();
        } catch (err) { Toast.show('Erreur : ' + esc(err.message), 'error'); }
        return;
      }

      /* ── Modifier : toucher la ligne ou le crayon ── */
      const editer = cible('[data-editer-tache]') || cible('[data-tache-open]');
      if (editer) {
        const id = editer.dataset.editerTache || editer.dataset.tacheOpen;
        this._preparer();
        const t = await DataStore.getTache(id);
        if (t) Taches.ouvrirForm(t, repeindre);
        return;
      }
    });
  },

  /* ══════════════════════════════════════════════
     BOUTON D'URGENCE — une tâche prioritaire en un geste
  ══════════════════════════════════════════════ */
  _urgence() {
    Modal.open('Tâche urgente', `
      <div class="field">
        <label>Qu'y a-t-il d'urgent ? *</label>
        <input id="uTitre" placeholder="Ex. Rappeler l'OPCO avant midi" maxlength="200" />
      </div>
      <p style="font-size:13px;color:var(--text-muted);margin-top:10px;">
        La tâche est créée en <strong>priorité haute</strong> avec pour échéance
        <strong>aujourd'hui</strong> : elle remonte en tête partout.
      </p>`, [
      { label: 'Annuler', cls: 'btn btn-secondary', action: () => Modal.close() },
      { label: 'Créer l\'urgence', cls: 'btn btn-danger', action: async () => {
          const titre = document.getElementById('uTitre').value.trim();
          if (!titre) { Toast.show('Dites au moins de quoi il s\'agit', 'error'); return; }
          try {
            const lu = await DataStore.getListeUrgente(true);
            await DataStore.addTacheComplete({
              description: titre, priorite: 'haute',
              echeance: Dates.aujourdhui(), listeId: lu?.id || null
            });
            Modal.close();
            Toast.show('Tâche urgente créée — relances à 10 h et 15 h tant qu\'elle n\'est pas cochée', 'success', 5000);
            updateJourneeBadge();
            this._listes = await DataStore.getListes();
            if (this.listeOuverte) await this._peindreListe();
            else                   await this.render();
          } catch (err) { Toast.show('Erreur : ' + esc(err.message), 'error'); }
        } }
    ], 'modal-sm');

    const champ = document.getElementById('uTitre');
    champ.focus();
    champ.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.querySelector('#modalFooter .btn-danger')?.click();
      }
    });
  },

  /** Une tâche : case à cocher, texte, repères. Réutilisée par la page Tâches. */
  ligneTache(t) {
    const hui    = Dates.aujourdhui();
    const retard = t.echeance && !t.fait && t.echeance < hui;

    const classeCase = t.abandonnee ? 'case case-abandon' : (t.fait ? 'case cochee' : 'case');
    const marque     = t.abandonnee ? Icone('abandonner', { taille: 15 })
                                    : Icone('check', { taille: 15, trait: 2.6 });

    return `
      <div class="entree ${t.fait ? 'est-fait' : ''} ${t.abandonnee ? 'est-abandonne' : ''}">
        <button class="${classeCase}" data-tache-id="${t.id}" role="checkbox"
                aria-checked="${t.fait ? 'true' : 'false'}"
                aria-label="${esc(t.description)}"
                title="${t.fait ? 'Rouvrir la tâche' : 'Marquer comme faite'}">${marque}</button>
        <span class="entree-corps" data-tache-open="${t.id}">
          <span class="entree-texte">
            ${t.priorite === 'haute'
               ? `<span class="entree-signifiant" title="Priorité haute">${Icone('etoile', { taille: 14 })}</span>`
               : ''}
            ${esc(t.description)}
          </span>
          <span class="entree-meta">
            ${t.echeance
              ? `<span class="${retard ? 'entree-retard' : ''}">${Dates.relative(t.echeance)}${
                  t.heure ? ' · ' + t.heure.slice(0, 5) : ''}</span>` : ''}
            ${t.rappel_minutes != null
               ? `<span title="Rappel programmé">${Icone('cloche', { taille: 13 })}</span>` : ''}
            ${t.migrations > 0
              ? `<span class="entree-migrations" title="Repoussée ${t.migrations} fois">${t.migrations}×</span>`
              : ''}
            ${t.listes
               ? `<span>${Icone(t.listes.icone, { taille: 13, defaut: 'liste' })} ${esc(t.listes.nom)}</span>` : ''}
            ${t.etiquettes ? pucePastille(t.etiquettes) : ''}
          </span>
        </span>
        <span class="entree-outils">
          <button class="entree-outil" data-migrer="${t.id}"
                  title="Repousser à demain" aria-label="Repousser à demain"
                  >${Icone('migrer', { taille: 17 })}</button>
          <button class="entree-outil" data-editer-tache="${t.id}"
                  title="Modifier" aria-label="Modifier la tâche"
                  >${Icone('crayon', { taille: 16 })}</button>
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
            ${n.epinglee ? `<span class="note-mini-pin">${Icone('epingle', { taille: 14 })}</span>` : ''}
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
         ${Icone(icone, { taille: 22 })}${label}</button>`;
    return this._postit('raccourcis', 'Aller à', '',
      `<div class="hub-raccourcis">
         ${r('agenda',   'agenda',    'Agenda')}
         ${r('taches',   'taches',    'Tâches')}
         ${r('notes',    'notes',     'Pense-bête')}
         ${r('coffre',   'coffre',    'Coffre')}
         ${r('journee',  'formation', 'Ma journée')}
         ${r('settings', 'reglages',  'Réglages')}
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
            <span class="puce puce-note">${Icone('sablier', { taille: 17 })}</span>
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
    if (this.listeOuverte) return this._peindreListe();
    const hub = document.querySelector('.hub');
    if (!hub) return;

    try { this._resume = await DataStore.getResumeJour(); }
    catch (err) { Toast.show('Actualisation impossible : ' + esc(err.message), 'error'); return; }

    const r = this._resume;
    const poser = (sel, html) => { const n = hub.querySelector(sel); if (n) n.innerHTML = html; };

    poser('.hub-tuiles',                       this._tuilesCorps(r));
    poser('[data-bloc="urgent"] .postit-corps', this._corpsUrgent(r));
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

      /* ── Replier / déplier un groupe de tâches ── */
      const bande = cible('[data-groupe]');
      if (bande) { this.basculerGroupe(bande); return; }

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

      if (cible('#hubUrgence') || cible('[data-nouvelle-urgence]')) return this._urgence();

      /* ── Une carte du carrousel : la liste s'ouvre en pleine largeur ── */
      const carteListe = cible('[data-ouvrir-liste]');
      if (carteListe) return this.ouvrirListe(carteListe.dataset.ouvrirListe);

      if (cible('[data-nouvelle-liste]')) {
        this._preparer();
        return Taches._formListe(async () => {
          this._listes = await DataStore.getListes();
          await this._rafraichir();
        });
      }

      const creer = cible('[data-creer]');
      if (creer) return this._creer(creer.dataset.creer);

      const nav = cible('[data-goto]');
      if (nav) return Router.navigate(nav.dataset.goto);
    });

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
