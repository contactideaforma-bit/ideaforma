/* ─────────────────────────────────────────────────────────────────────────────
   IDEAFORMA — Listes de choses à faire
   Les tâches liées aux dossiers OPCO et les tâches personnelles vivent dans la
   même table : on les distingue par la liste et par l'étiquette, pas par un
   second système.
───────────────────────────────────────────────────────────────────────────── */

const Taches = {

  _listes:     [],
  _etiquettes: [],
  _taches:     [],
  listeActive: null,     // null = toutes
  etiqActive:  null,
  voirFaites:  false,
  recherche:   '',

  /* ── Une ligne de tâche : case à cocher, texte, repères, outils.
       La case est le même composant que sur le tableau de bord : cocher se
       fait d'un seul geste, au même endroit, partout dans l'application. */
  ligne(t) {
    const retard = t.echeance && !t.fait && t.echeance < Dates.aujourdhui();
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
            ${t.dossier_id
               ? `<span title="Liée à un dossier de formation">${Icone('formation', { taille: 13 })}</span>` : ''}
          </span>
        </span>
        <span class="entree-outils">
          <button class="entree-outil" data-migrer="${t.id}"
                  title="Repousser à demain" aria-label="Repousser à demain"
                  >${Icone('migrer', { taille: 17 })}</button>
          <button class="entree-outil" data-abandon="${t.id}"
                  title="${t.abandonnee ? 'Reprendre la tâche' : 'Abandonner la tâche'}"
                  aria-label="${t.abandonnee ? 'Reprendre la tâche' : 'Abandonner la tâche'}"
                  >${Icone('abandonner', { taille: 17 })}</button>
          <button class="entree-outil danger" data-tache-del="${t.id}"
                  title="Supprimer" aria-label="Supprimer la tâche"
                  >${Icone('poubelle', { taille: 16 })}</button>
        </span>
      </div>`;
  },

  estMobile() { return window.matchMedia('(max-width: 760px)').matches; },

  /* Les listes, la plus récemment ouverte d'abord — même ordre que le
     carrousel du tableau de bord. */
  _listesTriees() {
    return [...this._listes].sort((a, b) =>
      String(b.utilisee_le || b.cree_le || '').localeCompare(
      String(a.utilisee_le || a.cree_le || ''))
      || (a.ordre ?? 0) - (b.ordre ?? 0));
  },

  async render() {
    document.getElementById('pageTitle').textContent    = 'Tâches';
    document.getElementById('pageSubtitle').textContent = 'Toutes vos listes, au même endroit';
    document.getElementById('pageHeaderRight').innerHTML = `
      <button class="btn btn-sm btn-primary" id="btnNouvelleTache"
              >${Icone('plus', { taille: 16 })} Tâche</button>`;
    Loading.show();

    try {
      [this._listes, this._etiquettes] = await Promise.all([
        DataStore.getListes(),
        DataStore.getEtiquettes()
      ]);
      await this._charger();
    } catch (err) { peindreErreur(err); return; }

    document.getElementById('btnNouvelleTache').addEventListener('click', () => this.ouvrirForm());

    // Au changement bureau ↔ téléphone, la page se redessine dans le bon mode
    if (!this._brancheEcran) {
      this._brancheEcran = true;
      window.matchMedia('(max-width: 760px)').addEventListener('change', () => {
        if (document.querySelector('.taches-page')) this._peindre();
      });
    }
  },

  async _charger() {
    this._taches = await DataStore.getTachesFiltrees({
      etiquetteId: this.etiqActive,
      fait:        this.voirFaites ? undefined : false,
      inclureAbandonnees: this.voirFaites,
      recherche:   this.recherche || undefined
    });
    this._peindre();
  },

  /* ── Une carte de liste, avec ses tâches dedans (bureau)
       ou en miniature (mosaïque du téléphone) ── */
  _tachesDe(id) {
    return this._taches.filter(t => (t.liste_id || 'sans') === id);
  },

  _carteBoard(l, id) {
    const toutes  = this._tachesDe(id);
    const enCours = toutes.filter(t => !t.fait && !t.abandonnee);
    const faites  = toutes.filter(t => t.fait || t.abandonnee);
    const sans    = id === 'sans';

    return `
      <section class="taches-liste-carte" style="--lc:${esc(l.couleur || '#9E3057')}">
        <header class="tlc-tete">
          <span class="tlc-titre" ${sans ? '' : `data-regler-liste="${id}"`}
                ${sans ? '' : 'title="Régler la liste (nom, couleur, pictogramme)"'}>
            ${Icone(l.icone, { taille: 17, defaut: 'liste' })}
            ${esc(l.nom)}
            <span class="hub-compteur">${enCours.length}</span>
          </span>
          <button class="btn-icon tlc-plus" data-ajout-liste="${id}"
                  title="Ajouter une tâche dans ${esc(l.nom)}"
                  aria-label="Ajouter une tâche dans ${esc(l.nom)}"
                  >${Icone('plus', { taille: 17 })}</button>
        </header>
        <div class="tlc-corps">
          ${enCours.length
            ? `<div class="log">${enCours.map(t => this.ligne(t)).join('')}</div>`
            : `<p class="hub-vide">Rien à faire ici.</p>`}
          ${this.voirFaites && faites.length ? `
            <div class="tlc-faites">${faites.slice(0, 30).map(t => this.ligne(t)).join('')}</div>` : ''}
        </div>
      </section>`;
  },

  _carteMini(l, id) {
    const enCours = this._tachesDe(id).filter(t => !t.fait && !t.abandonnee);
    const retard  = enCours.filter(t => t.echeance && t.echeance < Dates.aujourdhui()).length;
    return `
      <button class="liste-carte" data-focus-liste="${id}"
              style="--lc:${esc(l.couleur || '#9E3057')}"
              aria-label="Ouvrir la liste ${esc(l.nom)}">
        <span class="liste-carte-tete">
          <span class="liste-carte-ic">${Icone(l.icone, { taille: 20, defaut: 'liste' })}</span>
          <span class="liste-carte-nom">${esc(l.nom)}</span>
        </span>
        <span class="liste-carte-nb">${enCours.length ? `${enCours.length} à faire` : 'rien à faire'}</span>
        ${retard ? `<span class="liste-carte-retard">${Icone('alerte', { taille: 12 })} ${retard} en retard</span>` : ''}
        <span class="liste-carte-apercu">
          ${enCours.slice(0, 2).map(x => `<span>• ${esc(x.description)}</span>`).join('')}
        </span>
      </button>`;
  },

  _peindre() {
    const mobile = this.estMobile();
    if (mobile && this.listeActive) return this._peindreFocus();

    const listes  = this._listesTriees();
    const sans    = this._tachesDe('sans');
    const SANS    = { nom: 'Sans liste', couleur: '#8A8A86', icone: 'liste' };

    const filtres = `
      <div class="taches-filtres">
        <div class="search-input-wrap taches-filtre-recherche">
          <input class="search-input" id="tacheSearch" placeholder="Rechercher…"
                 value="${esc(this.recherche)}" />
        </div>
        <select class="filter-select taches-filtre-etiq" id="tacheEtiq">
          <option value="">Toutes les étiquettes</option>
          ${this._etiquettes.map(e => `
            <option value="${e.id}" ${this.etiqActive === e.id ? 'selected' : ''}>
              ${esc(e.nom)}</option>`).join('')}
        </select>
        <div class="taches-filtres-bas">
          <button class="liste-chip liste-chip-plus" id="btnNouvelleListe"
                  >${Icone('plus', { taille: 16 })} Liste</button>
          <button class="liste-chip liste-chip-plus" id="btnGererEtiquettes"
                  title="Créer, modifier ou supprimer des étiquettes"
                  >${Icone('etiquette', { taille: 16 })} Étiquettes</button>
          <button class="liste-chip ${this.voirFaites ? 'active' : ''}" id="tacheVoirFaites"
                  aria-pressed="${this.voirFaites ? 'true' : 'false'}"
                  title="Afficher aussi les tâches terminées et abandonnées"
                  >${Icone('check', { taille: 16 })} Terminées</button>
        </div>
      </div>`;

    const corps = mobile
      ? `<div class="taches-mosaique">
           ${listes.map(l => this._carteMini(l, l.id)).join('')}
           ${sans.length ? this._carteMini(SANS, 'sans') : ''}
           <button class="liste-carte liste-carte-plus" id="btnNouvelleListe2"
                   aria-label="Créer une nouvelle liste">
             ${Icone('plus', { taille: 24 })}<span>Nouvelle liste</span>
           </button>
         </div>`
      : `<div class="taches-board">
           ${listes.map(l => this._carteBoard(l, l.id)).join('')}
           ${sans.length ? this._carteBoard(SANS, 'sans') : ''}
         </div>`;

    document.getElementById('pageContent').innerHTML =
      `<div class="taches-page">${filtres}${corps}</div>`;

    this._bind();
  },

  /* ── Téléphone : une liste affichée en principal, retour vers la mosaïque ── */
  _peindreFocus() {
    const id   = this.listeActive;
    const sans = id === 'sans';
    const l    = sans ? { nom: 'Sans liste', couleur: '#8A8A86', icone: 'liste' }
                      : this._listes.find(x => x.id === id);
    if (!l) { this.listeActive = null; return this._peindre(); }

    const toutes  = this._tachesDe(id);
    const enCours = toutes.filter(t => !t.fait && !t.abandonnee);
    const faites  = toutes.filter(t => t.fait || t.abandonnee);

    document.getElementById('pageContent').innerHTML = `
      <div class="taches-page liste-vue" style="--lc:${esc(l.couleur || '#9E3057')}">
        <div class="liste-vue-tete">
          <button class="btn btn-secondary liste-vue-retour" data-retour-mosaique
                  aria-label="Revenir à la mosaïque des listes">
            ${Icone('chevron', { taille: 15 })} Retour
          </button>
          <span class="liste-vue-titre">
            ${Icone(l.icone, { taille: 20, defaut: 'liste' })}
            ${esc(l.nom)}
            <span class="hub-compteur">${enCours.length}</span>
          </span>
          <span class="liste-vue-outils">
            ${sans ? '' : `
              <button class="btn btn-sm btn-secondary" data-regler-liste="${id}"
                      >${Icone('crayon', { taille: 15 })} Régler</button>`}
            <button class="btn btn-sm ${this.voirFaites ? 'btn-primary' : 'btn-secondary'}"
                    id="tacheVoirFaites" aria-pressed="${this.voirFaites ? 'true' : 'false'}"
                    >${Icone('check', { taille: 15 })} Terminées</button>
            <button class="btn btn-sm btn-primary" data-ajout-liste="${id}"
                    >${Icone('plus', { taille: 15 })} Tâche</button>
          </span>
        </div>
        <div class="feuille liste-vue-feuille">
          ${enCours.length
            ? `<div class="log">${enCours.map(t => this.ligne(t)).join('')}</div>`
            : `<div class="empty-state">
                 <div class="empty-icon">${Icone('check', { taille: 34 })}</div>
                 Rien à faire dans cette liste. Profitez-en.
               </div>`}
          ${this.voirFaites && faites.length ? `
            <div class="liste-vue-faites">
              <div class="liste-vue-faites-titre">Terminées et abandonnées</div>
              <div class="log">${faites.slice(0, 100).map(t => this.ligne(t)).join('')}</div>
            </div>` : ''}
        </div>
      </div>`;

    this._bind();
  },

  _bind() {
    // Écouteur posé sur le conteneur recréé à chaque peinture : sans cela les
    // écouteurs s'empileraient sur #pageContent, qui, lui, survit.
    const page = document.querySelector('.taches-page');

    page.addEventListener('click', async e => {
      const cible = sel => e.target.closest(sel);

      if (cible('#tacheVoirFaites')) {
        this.voirFaites = !this.voirFaites;
        await this._charger();
        return;
      }

      if (cible('#btnGererEtiquettes')) { this._gererEtiquettes(); return; }

      if (cible('#btnNouvelleListe') || cible('#btnNouvelleListe2')) {
        this._formListe(async () => {
          this._listes = await DataStore.getListes();
          this._peindre();
        });
        return;
      }

      /* ── Mosaïque (téléphone) : ouvrir une liste en principal ── */
      const mini = cible('[data-focus-liste]');
      if (mini) {
        this.listeActive = mini.dataset.focusListe;
        if (this.listeActive !== 'sans') DataStore.toucherListe(this.listeActive);
        this._peindreFocus();
        return;
      }

      if (cible('[data-retour-mosaique]')) {
        this.listeActive = null;
        this._peindre();
        return;
      }

      /* ── Ajouter une tâche directement dans une liste ── */
      const ajout = cible('[data-ajout-liste]');
      if (ajout) {
        const id = ajout.dataset.ajoutListe;
        this.ouvrirForm({ liste_id: id === 'sans' ? null : id },
                        async () => { await this._charger(); });
        return;
      }

      /* ── Régler une liste (nom, couleur, pictogramme) ── */
      const regler = cible('[data-regler-liste]');
      if (regler) {
        const l = this._listes.find(x => x.id === regler.dataset.reglerListe);
        if (l) this._formListe(async () => {
          this._listes = await DataStore.getListes();
          if (this.listeActive && !this._listes.some(x => x.id === this.listeActive)) {
            this.listeActive = null;
          }
          await this._charger();
        }, l);
        return;
      }

      /* ── Cocher, avec retour visuel immédiat ── */
      const check = cible('.case[data-tache-id]');
      if (check) {
        const id = check.dataset.tacheId;
        const t  = this._taches.find(x => x.id === id);
        const coche = !t?.fait;
        check.classList.toggle('cochee', coche);
        check.setAttribute('aria-checked', coche ? 'true' : 'false');
        check.closest('.entree')?.classList.toggle('est-fait', coche);
        try {
          await DataStore.setTacheFait(id, coche);
          await this._charger();
          updateJourneeBadge();
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
          await this._charger();
          updateJourneeBadge();
        } catch (err) { Toast.show('Erreur : ' + esc(err.message), 'error'); }
        return;
      }

      const abandon = cible('[data-abandon]');
      if (abandon) {
        const t = this._taches.find(x => x.id === abandon.dataset.abandon);
        await DataStore.abandonnerTache(abandon.dataset.abandon, !t?.abandonnee);
        await this._charger();
        updateJourneeBadge();
        return;
      }

      const del = cible('[data-tache-del]');
      if (del) {
        const id = del.dataset.tacheDel;
        Modal.open('Supprimer cette tâche ?',
          '<p style="font-size:14px;color:var(--text-muted);">Cette action est définitive.</p>',
          [
            { label: 'Annuler',   cls: 'btn btn-secondary', action: () => Modal.close() },
            { label: 'Supprimer', cls: 'btn btn-danger', action: async () => {
                await DataStore.deleteTache(id);
                Modal.close(); await this._charger(); updateJourneeBadge();
              } }
          ], 'modal-sm');
        return;
      }

      const open = cible('[data-tache-open]');
      if (open) {
        const t = this._taches.find(x => x.id === open.dataset.tacheOpen);
        if (t) this.ouvrirForm(t, async () => { await this._charger(); });
        return;
      }
    });

    document.getElementById('tacheEtiq')?.addEventListener('change', async e => {
      this.etiqActive = e.target.value || null;
      await this._charger();
    });

    let minuteur;
    document.getElementById('tacheSearch')?.addEventListener('input', e => {
      clearTimeout(minuteur);
      this.recherche = e.target.value;
      minuteur = setTimeout(async () => { await this._charger(); rendreFocus('tacheSearch'); }, 320);
    });
  },

  /* ══ Formulaire simplifié (v13) ══
     L'essentiel d'abord : intitulé + note. Le reste se déplie à la demande :
     un bouton calendrier (date + heure), un bouton alertes (jusqu'à deux),
     un bouton Urgent. Créée depuis une liste, la tâche y va d'office ;
     sinon on choisit la liste dans le formulaire. */
  /** t : tâche à modifier, ou objet SANS id ({ liste_id }) pour préremplir
      une création. `apres` : rappel après enregistrement (autre page). */
  ouvrirForm(t = null, apres = null) {
    const edition     = !!(t && t.id);
    const listePreset = !edition && !!t && t.liste_id !== undefined;
    const listeFixe   = listePreset ? this._listes.find(l => l.id === t.liste_id) : null;

    const CHOIX_ALERTE = [['', 'Aucune'], [0, "À l'heure dite"], [15, '15 min avant'],
                          [30, '30 min avant'], [60, '1 h avant'], [180, '3 h avant'],
                          [1440, 'La veille']];
    const optAlerte = (id, val) => `
      <select id="${id}" class="tform-select-alerte" aria-label="Alerte">
        ${CHOIX_ALERTE.map(([v, l]) => `
          <option value="${v}" ${String(val ?? '') === String(v) ? 'selected' : ''}>${l}</option>`).join('')}
      </select>`;

    const aDate    = !!t?.echeance;
    const aAlerte  = t?.rappel_minutes != null || t?.rappel_minutes_2 != null;
    const urgent   = t?.priorite === 'haute';

    const corps = `
      <div class="tform">
        <input id="fTitre" class="tform-titre" placeholder="Que faut-il faire ?"
               value="${esc(t?.description)}" maxlength="300" autocomplete="off" />
        <textarea id="fNotes" class="tform-notes" rows="2"
                  placeholder="Note (facultatif)">${esc(t?.notes)}</textarea>

        ${listePreset
          ? (listeFixe ? `
            <div class="tform-liste-fixe" style="--lc:${esc(listeFixe.couleur || '#9E3057')}">
              ${Icone(listeFixe.icone, { taille: 15, defaut: 'liste' })}
              Dans « ${esc(listeFixe.nom)} »
            </div>` : '')
          : `
          <select id="fListe" class="tform-select" aria-label="Liste">
            <option value="">Choisir une liste…</option>
            ${this._listes.map(l => `
              <option value="${l.id}" ${t?.liste_id === l.id ? 'selected' : ''}>${esc(l.nom)}</option>`).join('')}
          </select>`}

        <div class="tform-boutons">
          <button type="button" class="tform-outil" id="fBtnCal"
                  aria-pressed="${aDate}" aria-controls="fZoneCal"
                  >${Icone('agenda', { taille: 16 })} Date &amp; heure</button>
          <button type="button" class="tform-outil" id="fBtnAlerte"
                  aria-pressed="${aAlerte}" aria-controls="fZoneAlerte"
                  >${Icone('cloche', { taille: 16 })} Alertes</button>
          <button type="button" class="tform-outil tform-outil-urgent" id="fBtnUrgent"
                  aria-pressed="${urgent}"
                  >${Icone('alerte', { taille: 16 })} Urgent</button>
        </div>

        <div class="tform-zone" id="fZoneCal" ${aDate ? '' : 'hidden'}>
          <input type="date" id="fDate" value="${t?.echeance || ''}" aria-label="Date" />
          <input type="time" id="fHeure" value="${t?.heure ? t.heure.slice(0, 5) : ''}" aria-label="Heure" />
        </div>

        <div class="tform-zone tform-zone-alertes" id="fZoneAlerte" ${aAlerte ? '' : 'hidden'}>
          ${optAlerte('fRappel1', t?.rappel_minutes)}
          ${optAlerte('fRappel2', t?.rappel_minutes_2)}
          <p class="tform-aide">Les alertes partent par rapport à la date
          (à 9 h si aucune heure n'est donnée).</p>
        </div>
      </div>`;

    Modal.open(edition ? 'Modifier la tâche' : 'Nouvelle tâche', corps, [
      { label: 'Annuler', cls: 'btn btn-secondary', action: () => Modal.close() },
      { label: edition ? 'Enregistrer' : 'Créer', cls: 'btn btn-primary', action: async () => {
          const val = id => document.getElementById(id)?.value ?? '';
          const zoneCal    = !document.getElementById('fZoneCal').hidden;
          const zoneAlerte = !document.getElementById('fZoneAlerte').hidden;
          const estUrgent  = document.getElementById('fBtnUrgent').getAttribute('aria-pressed') === 'true';

          const d = {
            description: val('fTitre').trim(),
            notes:       val('fNotes').trim(),
            echeance:    zoneCal ? (val('fDate') || null) : null,
            heure:       zoneCal ? (val('fHeure') || null) : null,
            rappelMinutes:  zoneAlerte && val('fRappel1') !== '' ? parseInt(val('fRappel1'), 10) : null,
            rappelMinutes2: zoneAlerte && val('fRappel2') !== '' ? parseInt(val('fRappel2'), 10) : null,
            // Urgent allumé = haute ; éteint = on ne touche pas à une
            // priorité basse existante, sinon normale.
            priorite: estUrgent ? 'haute'
                                : (edition && t.priorite === 'basse' ? 'basse' : 'normale')
          };
          if (listePreset) d.listeId = t.liste_id;
          else if (document.getElementById('fListe')) d.listeId = val('fListe') || null;

          if (!d.description) { Toast.show('Un intitulé est nécessaire', 'error'); return; }
          if ((d.rappelMinutes != null || d.rappelMinutes2 != null) && !d.echeance) {
            Toast.show('Une alerte a besoin d\'une date : ouvrez « Date & heure »', 'error');
            return;
          }
          try {
            if (edition) await DataStore.updateTache(t.id, d);
            else         await DataStore.addTacheComplete(d);
            Modal.close();
            if (apres) await apres(); else await this._charger();
            updateJourneeBadge();
            Toast.show(edition ? 'Tâche modifiée' : 'Tâche créée', 'success');
          } catch (err) { Toast.show('Erreur : ' + esc(err.message), 'error'); }
        } }
    ], 'modal-sm');

    /* ── Comportement des trois boutons ── */
    const basculer = (btn, zone) => {
      const b = document.getElementById(btn), z = document.getElementById(zone);
      b.addEventListener('click', () => {
        z.hidden = !z.hidden;
        b.setAttribute('aria-pressed', z.hidden ? 'false' : 'true');
        if (!z.hidden) z.querySelector('input, select')?.focus();
      });
    };
    basculer('fBtnCal', 'fZoneCal');
    basculer('fBtnAlerte', 'fZoneAlerte');

    const btnUrgent = document.getElementById('fBtnUrgent');
    btnUrgent.addEventListener('click', () => {
      const on = btnUrgent.getAttribute('aria-pressed') === 'true';
      btnUrgent.setAttribute('aria-pressed', on ? 'false' : 'true');
    });

    const titre = document.getElementById('fTitre');
    titre.focus();
    titre.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.querySelector('#modalFooter .btn-primary')?.click();
      }
    });
  },

  /* ══ Gestion des étiquettes, depuis la page Tâches ══
     Créer, renommer, recolorer, supprimer : le même formulaire que dans les
     Paramètres, sans avoir à y aller. */
  async _gererEtiquettes() {
    this._etiquettes = await DataStore.getEtiquettes(true);
    const rafraichir = async () => {
      this._etiquettes = await DataStore.getEtiquettes(true);
      if (this.etiqActive && !this._etiquettes.some(e => e.id === this.etiqActive)) this.etiqActive = null;
      await this._charger();
      this._gererEtiquettes();
    };

    Modal.open('Étiquettes', `
      <div class="etiq-gestion">
        ${this._etiquettes.length ? this._etiquettes.map(e => `
          <div class="etiq-ligne">
            <button class="etiq-ligne-corps" data-etiq-edit="${e.id}" title="Modifier">
              ${pucePastille(e)}
              ${e.systeme ? '<span class="etiq-ligne-sys">système</span>' : ''}
            </button>
            ${e.systeme ? '' : `
              <button class="btn-icon danger" data-etiq-del="${e.id}"
                      title="Supprimer" aria-label="Supprimer l'étiquette ${esc(e.nom)}"
                      >${Icone('poubelle', { taille: 16 })}</button>`}
          </div>`).join('')
          : '<div class="empty-state">Aucune étiquette pour l\'instant.</div>'}
      </div>`, [
      { label: 'Fermer', cls: 'btn btn-secondary', action: () => Modal.close() },
      { label: `${Icone('plus', { taille: 16 })} Nouvelle étiquette`, cls: 'btn btn-primary',
        action: () => SettingsPage._formEtiquette(null, rafraichir) }
    ], 'modal-sm');

    document.querySelector('.etiq-gestion').addEventListener('click', e => {
      const del = e.target.closest('[data-etiq-del]');
      if (del) {
        const et = this._etiquettes.find(x => x.id === del.dataset.etiqDel);
        Modal.open(`Supprimer « ${et?.nom || ''} » ?`,
          '<p style="font-size:14px;color:var(--text-muted);">Les tâches, notes et rendez-vous qui la portent sont conservés, simplement sans étiquette.</p>',
          [
            { label: 'Annuler',   cls: 'btn btn-secondary', action: () => this._gererEtiquettes() },
            { label: 'Supprimer', cls: 'btn btn-danger', action: async () => {
                try { await DataStore.deleteEtiquette(et.id); Toast.show('Étiquette supprimée', 'info'); }
                catch (err) { Toast.show('Erreur : ' + esc(err.message), 'error'); }
                await rafraichir();
              } }
          ], 'modal-sm');
        return;
      }
      const ed = e.target.closest('[data-etiq-edit]');
      if (ed) {
        const et = this._etiquettes.find(x => x.id === ed.dataset.etiqEdit);
        if (et) SettingsPage._formEtiquette(et, rafraichir);
      }
    });
  },

  /* ══ Création d'une liste ══ */
  _formListe(apres = null, l = null) {
    const edition = !!l;

    Modal.open(edition ? 'Modifier la liste' : 'Nouvelle liste', `
      <div class="form-grid">
        <div class="field form-col-full">
          <label>Nom de la liste *</label>
          <input id="lNom" value="${esc(l?.nom)}" placeholder="Ex. Courses, Maison, Prospection" />
        </div>
        <div class="field">
          <label>Couleur</label>
          <input type="color" id="lCouleur" value="${l?.couleur || '#9E3057'}"
                 style="height:42px;padding:3px;" />
        </div>
        <div class="field form-col-full">
          <label>Pictogramme</label>
          ${grilleIcones('lIcone', CHOIX_LISTE, l?.icone)}
        </div>
      </div>
      ${edition ? `
        <div class="alert-note" style="margin-top:12px;">
          <span class="alert-note-icon">${Icone('info', { taille: 17 })}</span>
          <span>Supprimer une liste ne supprime pas ses tâches : elles rejoignent
          « Sans liste ».</span>
        </div>` : ''}`, [
      ...(edition ? [{
        label: 'Supprimer', cls: 'btn btn-danger', action: async () => {
          await DataStore.deleteListe(l.id);
          Modal.close();
          this._listes = await DataStore.getListes();
          if (this.listeActive === l.id) this.listeActive = null;
          if (apres) await apres(); else await this._charger();
          Toast.show('Liste supprimée · tâches conservées', 'info');
        }
      }] : []),
      { label: 'Annuler', cls: 'btn btn-secondary', action: () => Modal.close() },
      { label: edition ? 'Enregistrer' : 'Créer', cls: 'btn btn-primary', action: async () => {
          const d = {
            nom:     document.getElementById('lNom').value.trim(),
            icone:   document.getElementById('lIcone').value,
            couleur: document.getElementById('lCouleur').value
          };
          if (!d.nom) { Toast.show('Un nom est nécessaire', 'error'); return; }
          if (edition) await DataStore.updateListe(l.id, d);
          else         await DataStore.addListe(d);
          Modal.close();
          this._listes = await DataStore.getListes();
          if (apres) await apres(); else await this._charger();
          Toast.show(edition ? 'Liste modifiée' : 'Liste créée', 'success');
        } }
    ], 'modal-sm');

    brancherGrilleIcones(document.getElementById('modalBody'));
  }
};
