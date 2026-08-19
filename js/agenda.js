/* ─────────────────────────────────────────────────────────────────────────────
   IDEAFORMA — Agenda
   Trois vues (mois / semaine / jour) sur la même source : la vue v_agenda,
   qui réunit rendez-vous personnels, journées de formation, tâches datées et
   échéances OPCO. Seuls les rendez-vous sont modifiables ici ; le reste se
   modifie là où il est né.
───────────────────────────────────────────────────────────────────────────── */

const Agenda = {

  vue:        'mois',        // mois | semaine | jour
  curseur:    new Date(),    // date de référence de la vue
  _items:     [],
  _etiquettes: [],
  _filtres:   { evenement: true, session: true, tache: true, echeance: true },

  async render() {
    document.getElementById('pageTitle').textContent    = 'Agenda';
    document.getElementById('pageSubtitle').textContent = 'Rendez-vous, formations et échéances';
    document.getElementById('pageHeaderRight').innerHTML = `
      <button class="btn btn-sm btn-primary" id="btnNouveauRdv">${Icone('plus', { taille: 16 })} Rendez-vous</button>`;
    Loading.show();

    this._etiquettes = await DataStore.getEtiquettes().catch(() => []);
    try { await this._charger(); }
    catch (err) { peindreErreur(err); return; }

    document.getElementById('btnNouveauRdv').addEventListener('click', () => this.ouvrirForm());
  },

  /* ── Bornes de la fenêtre affichée ── */
  _bornes() {
    const c = new Date(this.curseur);
    if (this.vue === 'jour') {
      const d = new Date(c); d.setHours(0, 0, 0, 0);
      return [d, new Date(d.getTime() + 86400000)];
    }
    if (this.vue === 'semaine') {
      const d = Dates.lundi(c);
      return [d, new Date(d.getTime() + 7 * 86400000)];
    }
    // mois : on déborde sur les semaines incomplètes
    const premier = new Date(c.getFullYear(), c.getMonth(), 1);
    const debut   = Dates.lundi(premier);
    const fin     = new Date(debut); fin.setDate(fin.getDate() + 42);
    return [debut, fin];
  },

  async _charger() {
    const [debut, fin] = this._bornes();
    const bruts = await DataStore.getAgenda(debut.toISOString(), fin.toISOString());

    // Les récurrences ne sont stockées qu'une fois : on les déplie à l'affichage
    const evsRecurrents = await DataStore.getEvenementsRecurrents().catch(() => []);

    const occurrences = [];
    evsRecurrents
      .forEach(e => {
        DataStore.developperRecurrence(e, debut.toISOString(), fin.toISOString())
          .filter(o => o._occurrence)
          .forEach(o => occurrences.push({
            type: 'evenement', id: o.id, titre: o.titre, description: o.description,
            lieu: o.lieu, debut: o.debut, fin: o.fin,
            journee_entiere: o.journee_entiere, etiquette_id: o.etiquette_id,
            dossier_id: null, couleur: o.couleur || '#3B82F6', termine: false,
            _baseId: o._baseId
          }));
      });

    this._items = [...bruts, ...occurrences]
      .filter(i => this._filtres[i.type])
      .sort((a, b) => new Date(a.debut) - new Date(b.debut));

    this._peindre();
  },

  _peindre() {
    const html = this.vue === 'mois'    ? this._vueMois()
               : this.vue === 'semaine' ? this._vueSemaine()
               :                          this._vueJour();

    document.getElementById('pageContent').innerHTML = `
      <div class="agenda-page">
        <div class="agenda-barre">
          <div class="agenda-nav">
            <button class="btn-icon" id="agPrev" title="Précédent">‹</button>
            <button class="btn btn-sm btn-secondary" id="agToday">Aujourd'hui</button>
            <button class="btn-icon" id="agNext" title="Suivant">›</button>
            <div class="agenda-periode">${this._libellePeriode()}</div>
          </div>
          <div class="agenda-vues">
            ${['mois', 'semaine', 'jour'].map(v => `
              <button class="sub-nav-item ${this.vue === v ? 'active' : ''}" data-vue="${v}">
                ${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}
          </div>
        </div>

        <div class="agenda-filtres">
          ${[['evenement', 'Rendez-vous', 'var(--encre-prune)'],
             ['session',   'Formations',  'var(--encre-rose)'],
             ['tache',     'Tâches',      'var(--encre-or)'],
             ['echeance',  'Échéances',   'var(--encre-rouge)']].map(([k, l, c]) => `
            <button class="agenda-filtre ${this._filtres[k] ? 'on' : ''}" data-filtre="${k}"
                    style="--c:${c}"><span class="pastille"></span>${l}</button>`).join('')}
        </div>

        ${html}
      </div>`;

    this._bind();
  },

  _libellePeriode() {
    const c = this.curseur;
    if (this.vue === 'jour')  return Dates.longue(c);
    if (this.vue === 'semaine') {
      const l = Dates.lundi(c), d = new Date(l); d.setDate(d.getDate() + 6);
      return `${Dates.courte(l)} → ${Dates.courte(d)} ${d.getFullYear()}`;
    }
    return `${Dates.MOIS[c.getMonth()]} ${c.getFullYear()}`;
  },

  /* ══ Vue mois ══ */
  _vueMois() {
    const [debut] = this._bornes();
    const mois    = this.curseur.getMonth();
    const hui     = Dates.iso(new Date());

    const parJour = {};
    this._items.forEach(i => {
      const k = Dates.iso(new Date(i.debut));
      (parJour[k] ||= []).push(i);
    });

    let cases = '';
    for (let n = 0; n < 42; n++) {
      const d  = new Date(debut); d.setDate(d.getDate() + n);
      const k  = Dates.iso(d);
      const it = parJour[k] || [];
      cases += `
        <div class="mois-case ${d.getMonth() !== mois ? 'hors' : ''} ${k === hui ? 'aujourdhui' : ''}"
             data-jour="${k}">
          <div class="mois-num">${d.getDate()}</div>
          <div class="mois-items">
            ${it.slice(0, 4).map(i => `
              <span class="mois-pastille" style="background:${i.couleur}"
                    title="${esc(i.titre)}"></span>`).join('')}
            ${it.slice(0, 3).map(i => `
              <div class="mois-item ${i.termine ? 'fait' : ''}"
                   data-item-type="${i.type}" data-item-id="${i.id}"
                   style="background:${teinte(i.couleur, 0.18)};border-left:3px solid ${i.couleur};"
                   title="${esc(i.titre)}">
                ${i.journee_entiere ? '' : `<b>${Dates.heure(i.debut)}</b> `}${esc(i.titre)}
              </div>`).join('')}
            ${it.length > 3 ? `<div class="mois-plus">+ ${it.length - 3}</div>` : ''}
          </div>
        </div>`;
    }

    return `
      <div class="section-card">
        <div class="mois-entetes">
          ${['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
            .map(j => `<div>${j}</div>`).join('')}
        </div>
        <div class="mois-grille">${cases}</div>
      </div>
      ${this._aVenir()}`;
  },

  /* ══ Ce qui vient, sous la grille ══
     Une grille de mois répond à « quand ? », pas à « quoi ? ». Sur téléphone
     les cases ne portent que des pastilles : sans cette liste, la page ne
     dirait plus rien de ce qui arrive. */
  _aVenir(limite = 8) {
    const maintenant = new Date();
    const suite = this._items
      .filter(i => new Date(i.debut) >= maintenant && !i.termine)
      .slice(0, limite);

    if (!suite.length) {
      return `<div class="feuille agenda-suite">
                <h2 class="hub-sous-titre">Ce qui vient</h2>
                <p class="hub-vide">Rien de prévu sur cette période.</p>
              </div>`;
    }

    return `
      <div class="feuille agenda-suite">
        <h2 class="hub-sous-titre">Ce qui vient<span class="hub-compteur">${suite.length}</span></h2>
        <div class="log">
          ${suite.map(i => `
            <div class="entree" data-item-type="${i.type}" data-item-id="${i.id}">
              <span class="puce" style="color:${i.couleur}">${Icone('cercle', { taille: 16 })}</span>
              <span class="entree-heure">${Dates.relative(i.debut)}</span>
              <span class="entree-corps">
                <span class="entree-texte">${esc(i.titre)}</span>
                <span class="entree-meta">
                  <span>${i.journee_entiere ? 'journée entière' : Dates.heure(i.debut)}</span>
                  ${i.lieu ? `<span>${esc(i.lieu)}</span>` : ''}
                  <span>${Hub._typeLabel(i.type)}</span>
                </span>
              </span>
            </div>`).join('')}
        </div>
      </div>`;
  },

  /* ══ Vue semaine ══ */
  _vueSemaine() {
    const lundi = Dates.lundi(this.curseur);
    const hui   = Dates.iso(new Date());

    const colonnes = Array.from({ length: 7 }, (_, n) => {
      const d = new Date(lundi); d.setDate(d.getDate() + n);
      const k = Dates.iso(d);
      const items = this._items.filter(i => Dates.iso(new Date(i.debut)) === k);
      return `
        <div class="sem-col ${k === hui ? 'aujourdhui' : ''}" data-jour="${k}">
          <div class="sem-entete">
            <div class="sem-jour">${Dates.JOURS_COURT[n]}</div>
            <div class="sem-num">${d.getDate()}</div>
          </div>
          <div class="sem-items">
            ${items.length ? items.map(i => `
              <div class="sem-item ${i.termine ? 'fait' : ''}"
                   data-item-type="${i.type}" data-item-id="${i.id}"
                   style="border-left-color:${i.couleur};background:${teinte(i.couleur, 0.08)}">
                <div class="sem-item-h">${i.journee_entiere ? 'Journée' : Dates.heure(i.debut)}</div>
                <div class="sem-item-t">${esc(i.titre)}</div>
                ${i.lieu ? `<div class="sem-item-l">${esc(i.lieu)}</div>` : ''}
              </div>`).join('')
              : '<div class="sem-vide">—</div>'}
          </div>
        </div>`;
    }).join('');

    return `<div class="section-card"><div class="sem-grille">${colonnes}</div></div>`;
  },

  /* ══ Vue jour ══ */
  _vueJour() {
    const k = Dates.iso(this.curseur);
    const items = this._items.filter(i => Dates.iso(new Date(i.debut)) === k);

    if (!items.length) {
      return `<div class="section-card"><div class="section-card-body">
        <div class="empty-state"><div class="empty-icon">${Icone('agenda', { taille: 34 })}</div>
          Rien de prévu ce jour-là.</div></div></div>`;
    }

    return `
      <div class="section-card"><div class="section-card-body">
        <div class="jour-liste">
          ${items.map(i => `
            <div class="jour-item ${i.termine ? 'fait' : ''}"
                 data-item-type="${i.type}" data-item-id="${i.id}">
              <div class="jour-heure">
                <div class="jour-h1">${i.journee_entiere ? '—' : Dates.heure(i.debut)}</div>
                ${!i.journee_entiere && i.fin
                  ? `<div class="jour-h2">${Dates.heure(i.fin)}</div>` : ''}
              </div>
              <div class="jour-barre" style="background:${i.couleur}"></div>
              <div class="jour-corps">
                <div class="jour-titre">${esc(i.titre)}</div>
                <div class="jour-sous">
                  ${Hub._typeLabel(i.type)}${i.lieu ? ' · ' + esc(i.lieu) : ''}
                </div>
                ${i.description ? `<div class="jour-desc">${esc(i.description)}</div>` : ''}
              </div>
            </div>`).join('')}
        </div>
      </div></div>`;
  },

  /* ══ Interactions ══ */
  _bind() {
    const page = document.querySelector('.agenda-page');

    page.addEventListener('click', async e => {
      if (e.target.closest('#agPrev'))  { this._decaler(-1); return; }
      if (e.target.closest('#agNext'))  { this._decaler(1);  return; }
      if (e.target.closest('#agToday')) { this.curseur = new Date(); this._charger(); return; }

      const v = e.target.closest('[data-vue]');
      if (v) { this.vue = v.dataset.vue; this._charger(); return; }

      const f = e.target.closest('[data-filtre]');
      if (f) {
        this._filtres[f.dataset.filtre] = !this._filtres[f.dataset.filtre];
        this._charger();
        return;
      }

      const item = e.target.closest('[data-item-id]');
      if (item) { this._ouvrirItem(item.dataset.itemType, item.dataset.itemId); return; }

      // Clic sur une case vide de mois / colonne de semaine → nouveau RDV ce jour
      const jour = e.target.closest('[data-jour]');
      if (jour) {
        // Un seul appui suffit : le double-clic n'existe pas au doigt.
        if (this.vue === 'mois') {
          this.curseur = new Date(jour.dataset.jour + 'T12:00:00');
          this.vue = 'jour';
          this._charger();
        } else if (this.vue === 'semaine') {
          this.curseur = new Date(jour.dataset.jour + 'T12:00:00');
          this.vue = 'jour';
          this._charger();
        }
      }
    });
  },

  _decaler(sens) {
    const c = new Date(this.curseur);
    if (this.vue === 'mois')    c.setMonth(c.getMonth() + sens);
    if (this.vue === 'semaine') c.setDate(c.getDate() + 7 * sens);
    if (this.vue === 'jour')    c.setDate(c.getDate() + sens);
    this.curseur = c;
    this._charger();
  },

  async _ouvrirItem(type, id) {
    const item = this._items.find(i => i.id === id);
    if (!item) return;

    if (type === 'evenement') {
      const vraiId = item._baseId || id;
      const ev = await DataStore.getEvenement(vraiId).catch(() => null);
      if (ev) this.ouvrirForm(ev);
      return;
    }

    // Les autres types sont en lecture seule ici
    Modal.open(item.titre, `
      <div class="detail-grid">
        <div class="detail-item">
          <div class="detail-label">Type</div>
          <div class="detail-value">${Hub._typeLabel(type)}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Quand</div>
          <div class="detail-value">${Dates.longue(item.debut)}${
            item.journee_entiere ? '' : ' à ' + Dates.heure(item.debut)}</div>
        </div>
        ${item.lieu ? `<div class="detail-item">
          <div class="detail-label">Lieu</div><div class="detail-value">${esc(item.lieu)}</div></div>` : ''}
        ${item.description ? `<div class="detail-item" style="grid-column:1/-1;">
          <div class="detail-label">Détail</div><div class="detail-value">${esc(item.description)}</div></div>` : ''}
      </div>`, [
      ...(type === 'tache' ? [{
        label: 'Ouvrir dans les tâches', cls: 'btn btn-secondary',
        action: () => { Modal.close(); Router.navigate('taches'); }
      }] : []),
      ...(type === 'echeance' || type === 'session' ? [{
        label: 'Voir Ma journée', cls: 'btn btn-secondary',
        action: () => { Modal.close(); Router.navigate('journee'); }
      }] : []),
      { label: 'Fermer', cls: 'btn btn-primary', action: () => Modal.close() }
    ], 'modal-sm');
  },

  /* ══ Formulaire de rendez-vous ══ */
  /** `apres` : voir la remarque équivalente dans js/taches.js. */
  ouvrirForm(ev = null, jourPreselectionne = null, apres = null) {
    const edition = !!ev;
    const debut = ev ? new Date(ev.debut)
                     : (() => {
                         const d = jourPreselectionne
                           ? new Date(jourPreselectionne + 'T09:00:00') : new Date();
                         if (!jourPreselectionne) { d.setHours(d.getHours() + 1, 0, 0, 0); }
                         return d;
                       })();
    const fin = ev?.fin ? new Date(ev.fin) : new Date(debut.getTime() + 3600000);
    const rappelsActuels = ev?.rappels || [15];

    const OPTIONS_RAPPEL = [
      [0, "À l'heure dite"], [5, '5 min avant'], [15, '15 min avant'],
      [30, '30 min avant'], [60, '1 h avant'], [120, '2 h avant'],
      [1440, 'La veille'], [2880, '2 jours avant']
    ];

    Modal.open(edition ? 'Modifier le rendez-vous' : 'Nouveau rendez-vous', `
      <div class="form-grid">
        <div class="field form-col-full">
          <label>Titre *</label>
          <input id="eTitre" value="${esc(ev?.titre)}" placeholder="Ex. RDV dentiste, Point avec le comptable" />
        </div>
        <div class="field">
          <label>Date</label>
          <input type="date" id="eDate" value="${Dates.iso(debut)}" />
        </div>
        <div class="field">
          <label>Heure de début</label>
          <input type="time" id="eHeure" value="${Dates.heure(debut)}" />
        </div>
        <div class="field">
          <label>Durée</label>
          <select id="eDuree">
            ${[[15, '15 min'], [30, '30 min'], [45, '45 min'], [60, '1 h'],
               [90, '1 h 30'], [120, '2 h'], [180, '3 h'], [480, 'Journée']]
              .map(([v, l]) => {
                const d = Math.round((fin - debut) / 60000);
                return `<option value="${v}" ${d === v ? 'selected' : ''}>${l}</option>`;
              }).join('')}
          </select>
        </div>
        <div class="field">
          <label>Étiquette</label>
          <select id="eEtiq">
            <option value="">Aucune</option>
            ${this._etiquettes.map(x => `<option value="${x.id}" ${ev?.etiquette_id === x.id ? 'selected' : ''}>
              ${x.icone} ${esc(x.nom)}</option>`).join('')}
          </select>
        </div>
        <div class="field form-col-full">
          <label>Lieu</label>
          <input id="eLieu" value="${esc(ev?.lieu)}" placeholder="Adresse, visio, téléphone…" />
        </div>
        <div class="field form-col-full">
          <label>Notes</label>
          <textarea id="eDesc" rows="2">${esc(ev?.description)}</textarea>
        </div>
        <div class="field">
          <label>Répétition</label>
          <select id="eRecurrence">
            ${[['aucune', 'Pas de répétition'], ['quotidien', 'Chaque jour'],
               ['hebdomadaire', 'Chaque semaine'], ['mensuel', 'Chaque mois'],
               ['annuel', 'Chaque année']].map(([v, l]) =>
              `<option value="${v}" ${(ev?.recurrence || 'aucune') === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Couleur</label>
          <input type="color" id="eCouleur" value="${ev?.couleur || '#3B82F6'}" style="height:42px;padding:3px;" />
        </div>
        <div class="field form-col-full">
          <label>Me prévenir (plusieurs choix possibles)</label>
          <div class="rappels-choix" id="eRappels">
            ${OPTIONS_RAPPEL.map(([v, l]) => `
              <label class="rappel-case">
                <input type="checkbox" value="${v}" ${rappelsActuels.includes(v) ? 'checked' : ''} />
                ${l}
              </label>`).join('')}
          </div>
        </div>
      </div>

      <div class="alert-note" style="margin-top:12px;">
        <span class="alert-note-icon">${Icone('cloche', { taille: 17 })}</span>
        <span id="eEtatNotif">Vérification des notifications…</span>
      </div>`, [
      ...(edition ? [{
        label: 'Supprimer', cls: 'btn btn-danger', action: async () => {
          await DataStore.deleteEvenement(ev.id);
          Modal.close();
          if (apres) await apres(); else this._charger();
          Toast.show('Rendez-vous supprimé', 'info');
        }
      }] : []),
      { label: 'Annuler', cls: 'btn btn-secondary', action: () => Modal.close() },
      { label: edition ? 'Enregistrer' : 'Créer', cls: 'btn btn-primary', action: async () => {
          const titre = document.getElementById('eTitre').value.trim();
          if (!titre) { Toast.show('Un titre est nécessaire', 'error'); return; }

          const date  = document.getElementById('eDate').value;
          const heure = document.getElementById('eHeure').value || '09:00';
          const duree = parseInt(document.getElementById('eDuree').value, 10);
          const d0    = Dates.combiner(date, heure);
          const rappels = [...document.querySelectorAll('#eRappels input:checked')]
            .map(i => parseInt(i.value, 10));

          const charge = {
            titre,
            description: document.getElementById('eDesc').value.trim(),
            lieu:        document.getElementById('eLieu').value.trim(),
            debut:       d0.toISOString(),
            fin:         new Date(d0.getTime() + duree * 60000).toISOString(),
            etiquetteId: document.getElementById('eEtiq').value || null,
            couleur:     document.getElementById('eCouleur').value,
            recurrence:  document.getElementById('eRecurrence').value,
            rappels
          };

          try {
            if (edition) await DataStore.updateEvenement(ev.id, charge);
            else         await DataStore.addEvenement(charge);
            Modal.close();
            if (apres) await apres(); else this._charger();
            Toast.show(
              rappels.length
                ? `Rendez-vous enregistré · ${rappels.length} rappel(s) programmé(s)`
                : 'Rendez-vous enregistré',
              'success');
          } catch (err) { Toast.show('Erreur : ' + esc(err.message), 'error'); }
        } }
    ], 'modal-lg');

    /* État des notifications, affiché dans le formulaire */
    const zone = document.getElementById('eEtatNotif');
    const etat = Notifs.etat();
    if (etat === 'accorde') {
      zone.innerHTML = 'Les notifications sont actives sur cet appareil.';
    } else if (etat === 'non_supporte') {
      zone.innerHTML = 'Ce navigateur ne gère pas les notifications : le rappel ne s\'affichera que si l\'application est ouverte.';
    } else if (etat === 'refuse') {
      zone.innerHTML = 'Notifications bloquées par le navigateur — à réautoriser dans ses réglages, sinon le rappel restera interne à l\'application.';
    } else {
      zone.innerHTML = 'Notifications pas encore activées — <a href="#" id="lienActiverNotif" style="color:var(--primary);font-weight:600;">les activer maintenant</a>.';
      document.getElementById('lienActiverNotif')?.addEventListener('click', async e => {
        e.preventDefault();
        try { await Notifs.activer(); zone.innerHTML = 'Notifications actives.'; }
        catch (err) { zone.innerHTML = esc(err.message); }
      });
    }
  }
};
