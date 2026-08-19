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

  async render() {
    document.getElementById('pageTitle').textContent    = 'Tâches';
    document.getElementById('pageSubtitle').textContent = 'Tout ce qu\'il y a à faire, pro et perso';
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
  },

  async _charger() {
    this._taches = await DataStore.getTachesFiltrees({
      listeId:     this.listeActive,
      etiquetteId: this.etiqActive,
      fait:        this.voirFaites ? undefined : false,
      inclureAbandonnees: this.voirFaites,
      recherche:   this.recherche || undefined
    });
    this._peindre();
  },

  _peindre() {
    const hui   = Dates.aujourdhui();
    const dans7 = Dates.iso(new Date(Date.now() + 7 * 86400000));

    const enCours = this._taches.filter(t => !t.fait && !t.abandonnee);
    const faites  = this._taches.filter(t => t.fait || t.abandonnee);

    const groupes = [
      { titre: 'En retard',     couleur: 'var(--encre-rouge)',  items: enCours.filter(t => t.echeance && t.echeance < hui) },
      { titre: "Aujourd'hui",   couleur: 'var(--encre-or)',     items: enCours.filter(t => t.echeance === hui) },
      { titre: 'Cette semaine', couleur: 'var(--encre-rose)',   items: enCours.filter(t => t.echeance > hui && t.echeance <= dans7) },
      { titre: 'Plus tard',     couleur: 'var(--encre-prune)',  items: enCours.filter(t => t.echeance > dans7) },
      { titre: 'Sans date',     couleur: 'var(--encre-pale)',   items: enCours.filter(t => !t.echeance) }
    ].filter(g => g.items.length);

    document.getElementById('pageContent').innerHTML = `
      <div class="taches-page">

        <!-- ── Listes ── -->
        <div class="listes-barre">
          <button class="liste-chip ${!this.listeActive ? 'active' : ''}" data-liste="">
            ${Icone('taches', { taille: 16 })} Tout
            <span class="hub-compteur">${enCours.length}</span>
          </button>
          ${this._listes.map(l => `
            <button class="liste-chip ${this.listeActive === l.id ? 'active' : ''}"
                    data-liste="${l.id}">
              ${Icone(l.icone, { taille: 16, defaut: 'liste' })} ${esc(l.nom)}
            </button>`).join('')}
          <button class="liste-chip liste-chip-plus" id="btnNouvelleListe"
                  >${Icone('plus', { taille: 16 })} Liste</button>
        </div>

        <!-- ── Ajout en une ligne ──
             Placé haut : sur téléphone, écrire une tâche est le geste le plus
             fréquent, il ne doit pas demander de faire défiler la page. -->
        <div class="tache-ajout">
          <input id="tacheFlash" autocomplete="off" enterkeyhint="done"
                 placeholder="Nouvelle tâche…" />
        </div>

        <!-- ── Filtres ── -->
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
            <button class="liste-chip liste-chip-plus" id="btnGererEtiquettes"
                    title="Créer une étiquette"
                    >${Icone('plus', { taille: 16 })} Étiquette</button>
            <button class="liste-chip ${this.voirFaites ? 'active' : ''}" id="tacheVoirFaites"
                    aria-pressed="${this.voirFaites ? 'true' : 'false'}"
                    title="Afficher aussi les tâches terminées et abandonnées"
                    >${Icone('check', { taille: 16 })} Terminées</button>
          </div>
        </div>

        <!-- ── Groupes ──
             Une seule feuille pour tous les groupes : une fiche par groupe
             multipliait les cadres et donnait une page en accordéon où l'on
             ne voyait plus la liste, seulement des bordures. -->
        ${groupes.length ? `
          <div class="feuille taches-feuille">
            ${groupes.map(g => `
              <h2 class="hub-sous-titre" style="color:${g.couleur}">
                ${g.titre}<span class="hub-compteur">${g.items.length}</span>
              </h2>
              <div class="log">${g.items.map(t => this.ligne(t)).join('')}</div>
            `).join('')}
          </div>`
          : `<div class="feuille taches-feuille">
               <div class="empty-state"><div class="empty-icon">${Icone('check', { taille: 34 })}</div>
                 Rien à faire ici. Profitez-en.</div></div>`}

        ${this.voirFaites && faites.length ? `
          <div class="feuille taches-feuille">
            <h2 class="hub-sous-titre hub-sous-titre-pale">
              Terminées et abandonnées<span class="hub-compteur">${faites.length}</span>
              <button class="btn btn-sm btn-secondary" id="btnPurger">Nettoyer</button>
            </h2>
            <div class="log">${faites.slice(0, 100).map(t => this.ligne(t)).join('')}</div>
          </div>` : ''}
      </div>`;

    this._bind();
  },

  _bind() {
    // On écoute sur le conteneur recréé à chaque peinture : sans cela les
    // écouteurs s'empileraient sur #pageContent à chaque rafraîchissement.
    const page = document.querySelector('.taches-page');

    page.addEventListener('click', async e => {
      if (e.target.closest('#tacheVoirFaites')) {
        this.voirFaites = !this.voirFaites;
        await this._charger();
        return;
      }

      const chip = e.target.closest('[data-liste]');
      if (chip) {
        // Second clic sur la liste déjà active : on ouvre ses réglages.
        // C'est le même geste que dans le coffre, pour les catégories.
        if (this.listeActive === chip.dataset.liste && chip.dataset.liste) {
          const l = this._listes.find(x => x.id === chip.dataset.liste);
          if (l) { this._formListe(null, l); return; }
        }
        this.listeActive = chip.dataset.liste || null;
        await this._charger();
        return;
      }

      if (e.target.closest('#btnGererEtiquettes')) {
        SettingsPage._formEtiquette(null, async () => {
          this._etiquettes = await DataStore.getEtiquettes(true);
          await this._charger();
        });
        return;
      }

      if (e.target.closest('#btnNouvelleListe')) { this._formListe(); return; }

      const check = e.target.closest('.case[data-tache-id]');
      if (check) {
        const id = check.dataset.tacheId;
        const t  = this._taches.find(x => x.id === id);
        const coche = !t?.fait;
        // Retour visuel avant l'aller-retour réseau : cocher doit être
        // instantané, c'est le geste le plus fréquent de la page.
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

      const migrer = e.target.closest('[data-migrer]');
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

      const abandon = e.target.closest('[data-abandon]');
      if (abandon) {
        const t = this._taches.find(x => x.id === abandon.dataset.abandon);
        await DataStore.abandonnerTache(abandon.dataset.abandon, !t?.abandonnee);
        await this._charger();
        updateJourneeBadge();
        return;
      }

      const del = e.target.closest('[data-tache-del]');
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

      const open = e.target.closest('[data-tache-open]');
      if (open) {
        const t = this._taches.find(x => x.id === open.dataset.tacheOpen);
        if (t) this.ouvrirForm(t);
        return;
      }

      if (e.target.closest('#btnPurger')) {
        const faites = this._taches.filter(t => t.fait);
        Modal.open(`Supprimer ${faites.length} tâche(s) terminée(s) ?`,
          '<p style="font-size:14px;color:var(--text-muted);">Cette action est définitive.</p>',
          [
            { label: 'Annuler',   cls: 'btn btn-secondary', action: () => Modal.close() },
            { label: 'Supprimer', cls: 'btn btn-danger', action: async () => {
                for (const t of faites) await DataStore.deleteTache(t.id);
                Modal.close(); await this._charger();
              } }
          ], 'modal-sm');
      }
    });

    document.getElementById('tacheEtiq').addEventListener('change', async e => {
      this.etiqActive = e.target.value || null;
      await this._charger();
    });

    let minuteur;
    document.getElementById('tacheSearch').addEventListener('input', e => {
      clearTimeout(minuteur);
      this.recherche = e.target.value;
      minuteur = setTimeout(async () => { await this._charger(); rendreFocus('tacheSearch'); }, 320);
    });

    const flash = document.getElementById('tacheFlash');
    flash.addEventListener('keydown', async e => {
      if (e.key !== 'Enter' || !flash.value.trim()) return;
      const p = QuickParse.analyser(flash.value);
      await DataStore.addTacheComplete({
        description:   p.type === 'evenement' ? p.titre : p.titre,
        echeance:      p.type === 'evenement' ? Dates.iso(p.date) : p.echeance,
        heure:         p.type === 'evenement' ? Dates.heure(p.date) : p.heure,
        rappelMinutes: (p.type === 'evenement' || p.heure) ? 15 : null,
        priorite:      p.priorite || 'normale',
        listeId:       this.listeActive,
        etiquetteId:   this.etiqActive
      });
      flash.value = '';
      await this._charger();
      updateJourneeBadge();
    });
  },

  /* ══ Formulaire complet ══ */
  /** `apres` permet d'ouvrir ce formulaire depuis une autre page (le carnet)
      sans qu'il repeigne la page Tâches par-dessus. */
  ouvrirForm(t = null, apres = null) {
    const edition = !!t;
    const corps = `
      <div class="form-grid">
        <div class="field form-col-full">
          <label>Intitulé *</label>
          <input id="fTitre" value="${esc(t?.description)}" placeholder="Ex. Relancer AKTO sur le dossier Dupont" />
        </div>
        <div class="field form-col-full">
          <label>Notes</label>
          <textarea id="fNotes" rows="3" placeholder="Détails, contexte, numéro de dossier…">${esc(t?.notes)}</textarea>
        </div>
        <div class="field">
          <label>Liste</label>
          <select id="fListe">
            <option value="">Sans liste</option>
            ${this._listes.map(l => `<option value="${l.id}" ${t?.liste_id === l.id ? 'selected' : ''}>
              ${esc(l.nom)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Étiquette</label>
          <div class="champ-plus">
            <select id="fEtiq">
              <option value="">Aucune</option>
              ${this._etiquettes.map(x => `<option value="${x.id}" ${t?.etiquette_id === x.id ? 'selected' : ''}>
                ${esc(x.nom)}</option>`).join('')}
            </select>
            <button type="button" class="champ-plus-btn" id="fEtiqPlus"
                    title="Créer une étiquette" aria-label="Créer une étiquette"
                    >${Icone('plus', { taille: 18 })}</button>
          </div>
          <!-- Création sur place : ouvrir une seconde modale par-dessus
               celle-ci perdrait tout ce qui vient d'être saisi. -->
          <div class="etiq-express" id="fEtiqNouvelle" hidden>
            <input id="fEtiqNom" placeholder="Nom de la nouvelle étiquette" maxlength="40" />
            ${grilleIcones('fEtiqIcone', CHOIX_ETIQUETTE, 'etiquette')}
            <div class="etiq-express-ligne">
              <input type="color" id="fEtiqCouleur" value="#9E3057" aria-label="Couleur de l'étiquette" />
              <button type="button" class="btn btn-sm btn-primary" id="fEtiqCreer">Créer l'étiquette</button>
            </div>
          </div>
        </div>
        <div class="field">
          <label>Échéance</label>
          <input type="date" id="fDate" value="${t?.echeance || ''}" />
        </div>
        <div class="field">
          <label>Heure</label>
          <input type="time" id="fHeure" value="${t?.heure ? t.heure.slice(0, 5) : ''}" />
        </div>
        <div class="field">
          <label>Priorité</label>
          <select id="fPrio">
            <option value="basse"   ${t?.priorite === 'basse'   ? 'selected' : ''}>Basse</option>
            <option value="normale" ${!t || t.priorite === 'normale' ? 'selected' : ''}>Normale</option>
            <option value="haute"   ${t?.priorite === 'haute'   ? 'selected' : ''}>Haute</option>
          </select>
        </div>
        <div class="field">
          <label>Me le rappeler</label>
          <select id="fRappel">
            <option value="">Pas de rappel</option>
            ${[[0, "à l'heure dite"], [15, '15 min avant'], [30, '30 min avant'],
               [60, '1 h avant'], [180, '3 h avant'], [1440, 'la veille']]
              .map(([v, l]) => `<option value="${v}" ${String(t?.rappel_minutes) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="alert-note" style="margin-top:12px;">
        <span class="alert-note-icon">${Icone('cloche', { taille: 17 })}</span>
        <span>Un rappel n'est envoyé que si une <strong>échéance</strong> est renseignée.
        Sans heure précise, il part à 9 h.</span>
      </div>`;

    Modal.open(edition ? 'Modifier la tâche' : 'Nouvelle tâche', corps, [
      { label: 'Annuler', cls: 'btn btn-secondary', action: () => Modal.close() },
      { label: edition ? 'Enregistrer' : 'Créer', cls: 'btn btn-primary', action: async () => {
          const d = {
            description:   document.getElementById('fTitre').value.trim(),
            notes:         document.getElementById('fNotes').value.trim(),
            listeId:       document.getElementById('fListe').value || null,
            etiquetteId:   document.getElementById('fEtiq').value  || null,
            echeance:      document.getElementById('fDate').value  || null,
            heure:         document.getElementById('fHeure').value || null,
            priorite:      document.getElementById('fPrio').value,
            rappelMinutes: document.getElementById('fRappel').value === ''
                             ? null : parseInt(document.getElementById('fRappel').value, 10)
          };
          if (!d.description) { Toast.show('Un intitulé est nécessaire', 'error'); return; }
          try {
            if (edition) await DataStore.updateTache(t.id, d);
            else         await DataStore.addTacheComplete(d);
            Modal.close();
            if (apres) await apres(); else await this._charger();
            updateJourneeBadge();
            Toast.show(edition ? 'Tâche modifiée' : 'Tâche créée', 'success');
          } catch (err) { Toast.show('Erreur : ' + esc(err.message), 'error'); }
        } }
    ]);

    /* ── Création d'une étiquette sans quitter le formulaire ── */
    brancherGrilleIcones(document.getElementById('modalBody'));
    const zone = document.getElementById('fEtiqNouvelle');
    const sel  = document.getElementById('fEtiq');

    document.getElementById('fEtiqPlus').addEventListener('click', () => {
      zone.hidden = !zone.hidden;
      if (!zone.hidden) document.getElementById('fEtiqNom').focus();
    });

    document.getElementById('fEtiqCreer').addEventListener('click', async () => {
      const nom = document.getElementById('fEtiqNom').value.trim();
      if (!nom) { Toast.show('Donnez un nom à l\'étiquette', 'error'); return; }
      try {
        const nouvelle = await DataStore.addEtiquette({
          nom,
          icone:   document.getElementById('fEtiqIcone').value,
          couleur: document.getElementById('fEtiqCouleur').value
        });
        this._etiquettes = await DataStore.getEtiquettes(true);

        const opt = document.createElement('option');
        opt.value = nouvelle.id;
        opt.textContent = nouvelle.nom;
        sel.appendChild(opt);
        sel.value = nouvelle.id;          // on la choisit : c'est pour ça qu'on l'a créée

        document.getElementById('fEtiqNom').value = '';
        zone.hidden = true;
        Toast.show('Étiquette créée', 'success');
      } catch (err) { Toast.show('Erreur : ' + esc(err.message), 'error'); }
    });

    document.getElementById('fEtiqNom').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); document.getElementById('fEtiqCreer').click(); }
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
