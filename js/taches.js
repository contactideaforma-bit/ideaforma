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

  /* ── Ligne réutilisée par le hub et par cette page ── */
  ligne(t) {
    const enRetard = t.echeance && !t.fait && t.echeance < Dates.aujourdhui();
    const etiq = t.etiquettes;
    return `
      <div class="tache-row ${t.fait ? 'faite' : ''}" data-tache-row="${t.id}">
        <button class="tache-check ${t.fait ? 'coche' : ''}" data-tache-id="${t.id}"
                aria-label="${t.fait ? 'Rouvrir' : 'Terminer'}">${t.fait ? '✓' : ''}</button>
        <div class="tache-corps" data-tache-open="${t.id}">
          <div class="tache-titre">
            ${t.priorite === 'haute' ? '<span class="tache-prio">!</span>' : ''}
            ${esc(t.description)}
          </div>
          <div class="tache-meta">
            ${t.echeance ? `<span class="${enRetard ? 'tache-retard' : ''}">
                 📅 ${Dates.relative(t.echeance)}${t.heure ? ' · ' + t.heure.slice(0, 5) : ''}
               </span>` : ''}
            ${t.rappel_minutes != null ? '<span title="Rappel programmé">🔔</span>' : ''}
            ${t.listes ? `<span>${t.listes.icone} ${esc(t.listes.nom)}</span>` : ''}
            ${etiq ? pucePastille(etiq) : ''}
            ${t.dossier_id ? '<span title="Liée à un dossier">🎓</span>' : ''}
          </div>
        </div>
        <button class="btn-icon danger" data-tache-del="${t.id}" title="Supprimer">✕</button>
      </div>`;
  },

  async render() {
    document.getElementById('pageTitle').textContent    = 'Tâches';
    document.getElementById('pageSubtitle').textContent = 'Tout ce qu\'il y a à faire, pro et perso';
    document.getElementById('pageHeaderRight').innerHTML = `
      <button class="btn btn-sm btn-primary" id="btnNouvelleTache">+ Tâche</button>`;
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
      recherche:   this.recherche || undefined
    });
    this._peindre();
  },

  _peindre() {
    const hui   = Dates.aujourdhui();
    const dans7 = Dates.iso(new Date(Date.now() + 7 * 86400000));

    const enCours = this._taches.filter(t => !t.fait);
    const faites  = this._taches.filter(t => t.fait);

    const groupes = [
      { titre: 'En retard',     couleur: '#EF4444', items: enCours.filter(t => t.echeance && t.echeance < hui) },
      { titre: "Aujourd'hui",   couleur: '#F59E0B', items: enCours.filter(t => t.echeance === hui) },
      { titre: 'Cette semaine', couleur: '#3B82F6', items: enCours.filter(t => t.echeance > hui && t.echeance <= dans7) },
      { titre: 'Plus tard',     couleur: '#8B5CF6', items: enCours.filter(t => t.echeance > dans7) },
      { titre: 'Sans date',     couleur: '#94A3B8', items: enCours.filter(t => !t.echeance) }
    ].filter(g => g.items.length);

    document.getElementById('pageContent').innerHTML = `
      <div class="taches-page">

        <!-- ── Listes ── -->
        <div class="listes-barre">
          <button class="liste-chip ${!this.listeActive ? 'active' : ''}" data-liste="">
            📚 Tout <span class="hub-compteur">${enCours.length}</span>
          </button>
          ${this._listes.map(l => `
            <button class="liste-chip ${this.listeActive === l.id ? 'active' : ''}"
                    data-liste="${l.id}" style="--c:${l.couleur}">
              ${l.icone} ${esc(l.nom)}
            </button>`).join('')}
          <button class="liste-chip liste-chip-plus" id="btnNouvelleListe">＋ Liste</button>
        </div>

        <!-- ── Filtres ── -->
        <div class="taches-filtres">
          <div class="search-input-wrap" style="flex:1;min-width:180px;">
            <input class="search-input" id="tacheSearch" placeholder="Rechercher…"
                   value="${esc(this.recherche)}" />
          </div>
          <select class="filter-select" id="tacheEtiq">
            <option value="">Toutes les étiquettes</option>
            ${this._etiquettes.map(e => `
              <option value="${e.id}" ${this.etiqActive === e.id ? 'selected' : ''}>
                ${e.icone} ${esc(e.nom)}</option>`).join('')}
          </select>
          <label class="taches-switch">
            <input type="checkbox" id="tacheVoirFaites" ${this.voirFaites ? 'checked' : ''} />
            Voir les tâches terminées
          </label>
        </div>

        <!-- ── Ajout en une ligne ── -->
        <div class="tache-ajout">
          <input id="tacheFlash" placeholder="Nouvelle tâche… (Entrée pour valider)" autocomplete="off" />
        </div>

        <!-- ── Groupes ── -->
        ${groupes.length ? groupes.map(g => `
          <div class="section-card">
            <div class="section-card-header">
              <div class="section-card-title" style="color:${g.couleur}">
                ${g.titre} <span class="hub-compteur">${g.items.length}</span>
              </div>
            </div>
            <div class="section-card-body" style="padding:8px 12px;">
              ${g.items.map(t => this.ligne(t)).join('')}
            </div>
          </div>`).join('')
          : `<div class="section-card"><div class="section-card-body">
               <div class="empty-state"><div class="empty-icon">🎉</div>
                 Rien à faire ici. Profitez-en.</div></div></div>`}

        ${this.voirFaites && faites.length ? `
          <div class="section-card">
            <div class="section-card-header">
              <div class="section-card-title" style="color:var(--text-muted)">
                Terminées <span class="hub-compteur">${faites.length}</span>
              </div>
              <button class="btn btn-sm btn-secondary" id="btnPurger">Supprimer les terminées</button>
            </div>
            <div class="section-card-body" style="padding:8px 12px;">
              ${faites.slice(0, 100).map(t => this.ligne(t)).join('')}
            </div>
          </div>` : ''}
      </div>`;

    this._bind();
  },

  _bind() {
    // On écoute sur le conteneur recréé à chaque peinture : sans cela les
    // écouteurs s'empileraient sur #pageContent à chaque rafraîchissement.
    const page = document.querySelector('.taches-page');

    page.addEventListener('click', async e => {
      const chip = e.target.closest('[data-liste]');
      if (chip) {
        this.listeActive = chip.dataset.liste || null;
        await this._charger();
        return;
      }

      if (e.target.closest('#btnNouvelleListe')) { this._formListe(); return; }

      const check = e.target.closest('[data-tache-id]');
      if (check) {
        const id = check.dataset.tacheId;
        const t  = this._taches.find(x => x.id === id);
        await DataStore.setTacheFait(id, !t.fait);
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

    document.getElementById('tacheVoirFaites').addEventListener('change', async e => {
      this.voirFaites = e.target.checked;
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
  ouvrirForm(t = null) {
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
              ${l.icone} ${esc(l.nom)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Étiquette</label>
          <select id="fEtiq">
            <option value="">Aucune</option>
            ${this._etiquettes.map(x => `<option value="${x.id}" ${t?.etiquette_id === x.id ? 'selected' : ''}>
              ${x.icone} ${esc(x.nom)}</option>`).join('')}
          </select>
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
        <span class="alert-note-icon">🔔</span>
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
            await this._charger();
            updateJourneeBadge();
            Toast.show(edition ? 'Tâche modifiée' : 'Tâche créée', 'success');
          } catch (err) { Toast.show('Erreur : ' + esc(err.message), 'error'); }
        } }
    ]);
  },

  /* ══ Création d'une liste ══ */
  _formListe() {
    const icones = ['📋', '🛒', '💡', '🏠', '💼', '🎯', '📞', '🧾', '🎁', '✈️', '🔧', '📚'];
    Modal.open('Nouvelle liste', `
      <div class="form-grid">
        <div class="field form-col-full">
          <label>Nom de la liste *</label>
          <input id="lNom" placeholder="Ex. Courses, Maison, Prospection" />
        </div>
        <div class="field">
          <label>Icône</label>
          <select id="lIcone">${icones.map(i => `<option>${i}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label>Couleur</label>
          <input type="color" id="lCouleur" value="#3B82F6" style="height:42px;padding:3px;" />
        </div>
      </div>`, [
      { label: 'Annuler', cls: 'btn btn-secondary', action: () => Modal.close() },
      { label: 'Créer',   cls: 'btn btn-primary', action: async () => {
          const nom = document.getElementById('lNom').value.trim();
          if (!nom) { Toast.show('Un nom est nécessaire', 'error'); return; }
          await DataStore.addListe({
            nom,
            icone:   document.getElementById('lIcone').value,
            couleur: document.getElementById('lCouleur').value
          });
          Modal.close();
          this._listes = await DataStore.getListes();
          await this._charger();
          Toast.show('Liste créée', 'success');
        } }
    ], 'modal-sm');
  }
};
