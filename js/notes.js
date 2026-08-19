/* ─────────────────────────────────────────────────────────────────────────────
   IDEAFORMA — Pense-bête
   Des notes courtes, colorées, épinglables. Enregistrement automatique :
   ce qui est tapé est sauvé, sans bouton « enregistrer » à ne pas oublier.
───────────────────────────────────────────────────────────────────────────── */

const Notes = {

  COULEURS: [
    { hex: '#FEF3C7', nom: 'Jaune'  },
    { hex: '#DBEAFE', nom: 'Bleu'   },
    { hex: '#DCFCE7', nom: 'Vert'   },
    { hex: '#FCE7F3', nom: 'Rose'   },
    { hex: '#EDE9FE', nom: 'Violet' },
    { hex: '#FED7AA', nom: 'Orange' },
    { hex: '#F1F5F9', nom: 'Gris'   }
  ],

  _notes:      [],
  _etiquettes: [],
  _minuteur:   null,
  _enCours:    null,
  recherche:   '',
  etiqActive:  null,
  archivees:   false,

  async render() {
    document.getElementById('pageTitle').textContent    = 'Pense-bête';
    document.getElementById('pageSubtitle').textContent = 'Ce qu\'il ne faut pas oublier';
    document.getElementById('pageHeaderRight').innerHTML = `
      <button class="btn btn-sm btn-primary" id="btnNouvelleNote">+ Note</button>`;
    Loading.show();

    this._etiquettes = await DataStore.getEtiquettes().catch(() => []);
    try { await this._charger(); }
    catch (err) { peindreErreur(err); return; }

    document.getElementById('btnNouvelleNote').addEventListener('click', () => this.ouvrir());
  },

  async _charger() {
    this._notes = await DataStore.getNotes({
      archivees:   this.archivees,
      etiquetteId: this.etiqActive,
      recherche:   this.recherche
    });
    this._peindre();
  },

  _peindre() {
    const epinglees = this._notes.filter(n => n.epinglee);
    const autres    = this._notes.filter(n => !n.epinglee);

    const carte = n => `
      <div class="note-carte" data-note="${n.id}" style="background:${n.couleur}">
        <button class="note-pin ${n.epinglee ? 'on' : ''}" data-pin="${n.id}"
                title="${n.epinglee ? 'Désépingler' : 'Épingler'}">📌</button>
        ${n.titre ? `<div class="note-titre">${esc(n.titre)}</div>` : ''}
        <div class="note-corps">${esc(n.contenu).replace(/\n/g, '<br>')}</div>
        <div class="note-pied">
          ${n.etiquettes ? pucePastille(n.etiquettes) : '<span></span>'}
          <span class="note-date">${Dates.relative(n.modifie_le)}</span>
        </div>
      </div>`;

    document.getElementById('pageContent').innerHTML = `
      <div class="notes-page">
        <div class="taches-filtres">
          <div class="search-input-wrap" style="flex:1;min-width:180px;">
            <input class="search-input" id="noteSearch" placeholder="Rechercher dans les notes…"
                   value="${esc(this.recherche)}" />
          </div>
          <select class="filter-select" id="noteEtiq">
            <option value="">Toutes les étiquettes</option>
            ${this._etiquettes.map(e => `<option value="${e.id}" ${this.etiqActive === e.id ? 'selected' : ''}>
              ${e.icone} ${esc(e.nom)}</option>`).join('')}
          </select>
          <label class="taches-switch">
            <input type="checkbox" id="noteArchivees" ${this.archivees ? 'checked' : ''} />
            Archives
          </label>
        </div>

        ${!this._notes.length ? `
          <div class="section-card"><div class="section-card-body">
            <div class="empty-state"><div class="empty-icon">📝</div>
              ${this.recherche ? 'Aucune note ne correspond.' : 'Aucune note pour l\'instant.'}
            </div></div></div>` : ''}

        ${epinglees.length ? `
          <div class="notes-section-titre">📌 Épinglées</div>
          <div class="notes-grille">${epinglees.map(carte).join('')}</div>` : ''}

        ${autres.length ? `
          ${epinglees.length ? '<div class="notes-section-titre">Autres</div>' : ''}
          <div class="notes-grille">${autres.map(carte).join('')}</div>` : ''}
      </div>`;

    this._bind();
  },

  _bind() {
    const page = document.querySelector('.notes-page');

    page.addEventListener('click', async e => {
      const pin = e.target.closest('[data-pin]');
      if (pin) {
        e.stopPropagation();
        const n = this._notes.find(x => x.id === pin.dataset.pin);
        await DataStore.updateNote(n.id, { epinglee: !n.epinglee });
        await this._charger();
        return;
      }
      const c = e.target.closest('[data-note]');
      if (c) {
        const n = this._notes.find(x => x.id === c.dataset.note);
        if (n) this.ouvrir(n);
      }
    });

    document.getElementById('noteEtiq').addEventListener('change', async e => {
      this.etiqActive = e.target.value || null;
      await this._charger();
    });

    document.getElementById('noteArchivees').addEventListener('change', async e => {
      this.archivees = e.target.checked;
      await this._charger();
    });

    let minuteur;
    document.getElementById('noteSearch').addEventListener('input', e => {
      clearTimeout(minuteur);
      this.recherche = e.target.value;
      minuteur = setTimeout(async () => { await this._charger(); rendreFocus('noteSearch'); }, 320);
    });
  },

  /* ══ Éditeur ══ */
  ouvrir(n = null) {
    const edition = !!n;
    const couleur = n?.couleur || '#FEF3C7';

    Modal.open(edition ? 'Note' : 'Nouvelle note', `
      <div class="note-editeur" id="noteEditeur" style="background:${couleur}">
        <input id="nTitre" class="note-editeur-titre" placeholder="Titre (facultatif)"
               value="${esc(n?.titre)}" />
        <textarea id="nContenu" class="note-editeur-corps" rows="10"
                  placeholder="Votre note…">${esc(n?.contenu)}</textarea>
      </div>

      <div class="note-outils">
        <div class="note-couleurs">
          ${this.COULEURS.map(c => `
            <button class="note-couleur ${c.hex === couleur ? 'on' : ''}"
                    data-couleur="${c.hex}" style="background:${c.hex}"
                    title="${c.nom}"></button>`).join('')}
        </div>
        <select class="filter-select" id="nEtiq">
          <option value="">Sans étiquette</option>
          ${this._etiquettes.map(x => `<option value="${x.id}" ${n?.etiquette_id === x.id ? 'selected' : ''}>
            ${x.icone} ${esc(x.nom)}</option>`).join('')}
        </select>
        <label class="taches-switch">
          <input type="checkbox" id="nEpingle" ${n?.epinglee ? 'checked' : ''} /> Épingler
        </label>
      </div>
      <div class="note-etat" id="nEtat"></div>`, [
      ...(edition ? [
        { label: n.archivee ? 'Désarchiver' : 'Archiver', cls: 'btn btn-secondary', action: async () => {
            clearTimeout(this._minuteur);
            await DataStore.updateNote(n.id, { archivee: !n.archivee });
            Modal.close(); await this._charger();
          } },
        { label: 'Supprimer', cls: 'btn btn-danger', action: async () => {
            clearTimeout(this._minuteur);
            await DataStore.deleteNote(n.id);
            Modal.close(); await this._charger();
            Toast.show('Note supprimée', 'info');
          } }
      ] : []),
      { label: 'Fermer', cls: 'btn btn-primary', action: async () => {
          clearTimeout(this._minuteur);
          if (this._enCours) { n = await this._enCours; }
          await this._sauver(n);
          Modal.close();
          await this._charger();
        } }
    ], 'modal-lg');

    /* Couleurs */
    document.querySelectorAll('[data-couleur]').forEach(b =>
      b.addEventListener('click', () => {
        document.querySelectorAll('[data-couleur]').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        document.getElementById('noteEditeur').style.background = b.dataset.couleur;
      })
    );

    /* Enregistrement automatique : 900 ms après la dernière frappe.
       `_enCours` empêche deux enregistrements simultanés : sans lui, une
       première création lente pendant que l'on continue de taper produirait
       deux notes au lieu d'une. */
    clearTimeout(this._minuteur);
    this._enCours = null;

    const auto = () => {
      clearTimeout(this._minuteur);
      const etat = document.getElementById('nEtat');
      if (etat) etat.textContent = 'Modification…';
      this._minuteur = setTimeout(async () => {
        if (this._enCours) { await this._enCours; }
        this._enCours = this._sauver(n).then(res => { n = res; this._enCours = null; return res; });
        await this._enCours;
        const e2 = document.getElementById('nEtat');
        if (e2) e2.textContent = 'Enregistré ✓';
      }, 900);
    };
    document.getElementById('nTitre').addEventListener('input', auto);
    document.getElementById('nContenu').addEventListener('input', auto);
    document.getElementById('nEtiq').addEventListener('change', auto);
    document.getElementById('nEpingle').addEventListener('change', auto);
    setTimeout(() => document.getElementById('nContenu').focus(), 80);
  },

  /** Crée ou met à jour, et renvoie la note pour que l'auto-save suivant
      cible la bonne ligne. */
  async _sauver(n) {
    const titre    = document.getElementById('nTitre')?.value.trim()   ?? '';
    const contenu  = document.getElementById('nContenu')?.value        ?? '';
    const couleur  = document.querySelector('[data-couleur].on')?.dataset.couleur || '#FEF3C7';
    const etiq     = document.getElementById('nEtiq')?.value || null;
    const epinglee = document.getElementById('nEpingle')?.checked || false;

    if (!titre && !contenu.trim()) return n;   // note vide : rien à enregistrer

    const d = { titre: titre || null, contenu, couleur, etiquetteId: etiq, epinglee };

    try {
      if (n?.id) { await DataStore.updateNote(n.id, d); return n; }
      const cree = await DataStore.addNote(d);
      return cree;
    } catch (err) {
      Toast.show('Enregistrement impossible : ' + esc(err.message), 'error');
      return n;
    }
  }
};
