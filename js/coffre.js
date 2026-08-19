/* ─────────────────────────────────────────────────────────────────────────────
   IDEAFORMA — Coffre à documents
   Les papiers importants, rangés par catégorie, avec une date d'expiration
   facultative : une carte d'identité ou une attestation d'assurance prévient
   d'elle-même quand elle arrive à échéance.

   Les fichiers vont dans le bucket privé « documents », sous <uid>/coffre/.
   Aucun lien permanent : chaque ouverture crée une URL signée de 5 minutes.
───────────────────────────────────────────────────────────────────────────── */

const Coffre = {

  _docs:       [],
  _etiquettes: [],
  categorie:   null,
  recherche:   '',

  async render() {
    document.getElementById('pageTitle').textContent    = 'Coffre';
    document.getElementById('pageSubtitle').textContent = 'Documents importants, pro et perso';
    document.getElementById('pageHeaderRight').innerHTML = `
      <button class="btn btn-sm btn-primary" id="btnAjoutDoc">+ Document</button>`;
    Loading.show();

    this._etiquettes = await DataStore.getEtiquettes().catch(() => []);
    try { await this._charger(); }
    catch (err) { peindreErreur(err); return; }

    document.getElementById('btnAjoutDoc').addEventListener('click', () => this._formAjout());
  },

  async _charger() {
    this._docs = await DataStore.getCoffre({
      categorie: this.categorie,
      recherche: this.recherche
    });
    this._peindre();
  },

  _peindre() {
    const cats = DataStore.CATEGORIES_COFFRE;
    const compte = c => this._docs.filter(d => d.categorie === c).length;
    const hui = Dates.aujourdhui();

    const carte = d => {
      const cat = cats.find(c => c.code === d.categorie) || cats[cats.length - 1];
      const expire  = d.date_expiration && d.date_expiration < hui;
      const bientot = d.date_expiration && !expire &&
        d.date_expiration <= Dates.iso(new Date(Date.now() + 60 * 86400000));
      return `
        <div class="doc-carte" data-doc="${d.id}">
          <div class="doc-icone">${cat.icone}</div>
          <div class="doc-corps">
            <div class="doc-titre">
              ${d.favori ? '⭐ ' : ''}${esc(d.titre)}
            </div>
            <div class="doc-meta">
              <span>${cat.label}</span>
              <span>${this._taille(d.taille)}</span>
              ${d.date_document ? `<span>du ${Dates.courte(d.date_document)}</span>` : ''}
              ${d.etiquettes ? pucePastille(d.etiquettes) : ''}
            </div>
            ${d.date_expiration ? `
              <div class="doc-expire ${expire ? 'perime' : bientot ? 'bientot' : ''}">
                ${expire ? '⚠️ Périmé depuis le' : bientot ? '⏳ Expire le' : 'Valable jusqu\'au'}
                ${Dates.courte(d.date_expiration)}
              </div>` : ''}
          </div>
          <div class="doc-actions">
            <button class="btn-icon" data-doc-ouvrir="${d.id}" title="Ouvrir">👁</button>
            <button class="btn-icon" data-doc-editer="${d.id}" title="Modifier">✎</button>
            <button class="btn-icon danger" data-doc-suppr="${d.id}" title="Supprimer">✕</button>
          </div>
        </div>`;
    };

    document.getElementById('pageContent').innerHTML = `
      <div class="coffre-page">
        <div class="listes-barre">
          <button class="liste-chip ${!this.categorie ? 'active' : ''}" data-cat="">
            🗄️ Tout <span class="hub-compteur">${this._docs.length}</span>
          </button>
          ${cats.map(c => `
            <button class="liste-chip ${this.categorie === c.code ? 'active' : ''}" data-cat="${c.code}">
              ${c.icone} ${c.label}${!this.categorie && compte(c.code)
                ? ` <span class="hub-compteur">${compte(c.code)}</span>` : ''}
            </button>`).join('')}
        </div>

        <div class="taches-filtres">
          <div class="search-input-wrap" style="flex:1;min-width:180px;">
            <input class="search-input" id="docSearch" placeholder="Rechercher un document…"
                   value="${esc(this.recherche)}" />
          </div>
          <div class="coffre-depot" id="coffreDepot">
            Glissez un fichier ici, ou <strong>cliquez</strong>
          </div>
          <input type="file" id="coffreFile" style="display:none" />
        </div>

        ${this._docs.length
          ? `<div class="docs-liste">${this._docs.map(carte).join('')}</div>`
          : `<div class="section-card"><div class="section-card-body">
               <div class="empty-state"><div class="empty-icon">🗄️</div>
                 ${this.recherche || this.categorie
                   ? 'Aucun document ici.'
                   : 'Le coffre est vide. Déposez un premier document.'}
               </div></div></div>`}
      </div>`;

    this._bind();
  },

  _taille(o) {
    if (!o) return '';
    if (o < 1024) return o + ' o';
    if (o < 1048576) return Math.round(o / 1024) + ' Ko';
    return (o / 1048576).toFixed(1) + ' Mo';
  },

  _bind() {
    const page = document.querySelector('.coffre-page');

    page.addEventListener('click', async e => {
      const cat = e.target.closest('[data-cat]');
      if (cat) { this.categorie = cat.dataset.cat || null; await this._charger(); return; }

      const ouvrir = e.target.closest('[data-doc-ouvrir]');
      if (ouvrir) { await this._ouvrirFichier(ouvrir.dataset.docOuvrir); return; }

      const editer = e.target.closest('[data-doc-editer]');
      if (editer) {
        const d = this._docs.find(x => x.id === editer.dataset.docEditer);
        if (d) this._formEdition(d);
        return;
      }

      const suppr = e.target.closest('[data-doc-suppr]');
      if (suppr) { this._confirmerSuppression(suppr.dataset.docSuppr); return; }

      const carte = e.target.closest('[data-doc]');
      if (carte) await this._ouvrirFichier(carte.dataset.doc);
    });

    let minuteur;
    document.getElementById('docSearch').addEventListener('input', e => {
      clearTimeout(minuteur);
      this.recherche = e.target.value;
      minuteur = setTimeout(async () => { await this._charger(); rendreFocus('docSearch'); }, 320);
    });

    /* Dépôt de fichier */
    const zone  = document.getElementById('coffreDepot');
    const input = document.getElementById('coffreFile');
    zone.addEventListener('click', () => input.click());
    input.addEventListener('change', e => {
      if (e.target.files[0]) this._formAjout(e.target.files[0]);
      input.value = '';
    });
    ['dragenter', 'dragover'].forEach(ev =>
      zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.add('survol'); }));
    ['dragleave', 'drop'].forEach(ev =>
      zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.remove('survol'); }));
    zone.addEventListener('drop', e => {
      const f = e.dataTransfer.files[0];
      if (f) this._formAjout(f);
    });
  },

  async _ouvrirFichier(id) {
    const d = this._docs.find(x => x.id === id);
    if (!d) return;
    try {
      const url = await DataStore.getPieceUrl(d.storage_path, 300);
      if (url) window.open(url, '_blank', 'noopener');
      else Toast.show('Lien indisponible', 'error');
    } catch (err) {
      Toast.show('Impossible d\'ouvrir : ' + esc(err.message), 'error');
    }
  },

  _champs(d = {}, fichier = null) {
    const cats = DataStore.CATEGORIES_COFFRE;
    return `
      ${fichier ? `<div class="alert-note" style="margin-bottom:12px;">
        <span class="alert-note-icon">📎</span>
        <span><strong>${esc(fichier.name)}</strong> · ${this._taille(fichier.size)}</span>
      </div>` : ''}
      <div class="form-grid">
        <div class="field form-col-full">
          <label>Titre *</label>
          <input id="dTitre" value="${esc(d.titre || fichier?.name || '')}" />
        </div>
        <div class="field">
          <label>Catégorie</label>
          <select id="dCat">
            ${cats.map(c => `<option value="${c.code}" ${d.categorie === c.code ? 'selected' : ''}>
              ${c.icone} ${c.label}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Étiquette</label>
          <select id="dEtiq">
            <option value="">Aucune</option>
            ${this._etiquettes.map(x => `<option value="${x.id}" ${d.etiquette_id === x.id ? 'selected' : ''}>
              ${x.icone} ${esc(x.nom)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Date du document</label>
          <input type="date" id="dDate" value="${d.date_document || ''}" />
        </div>
        <div class="field">
          <label>Expire le</label>
          <input type="date" id="dExpire" value="${d.date_expiration || ''}" />
        </div>
        <div class="field form-col-full">
          <label>Description</label>
          <textarea id="dDesc" rows="2" placeholder="Numéro, organisme, à quoi ça sert…">${esc(d.description)}</textarea>
        </div>
        <div class="field form-col-full">
          <label class="taches-switch">
            <input type="checkbox" id="dFavori" ${d.favori ? 'checked' : ''} /> Mettre en favori
          </label>
        </div>
      </div>
      <div class="alert-note" style="margin-top:12px;">
        <span class="alert-note-icon">⏳</span>
        <span>Une date d'expiration fait apparaître le document dans
        « Documents à renouveler » sur le tableau de bord, 60 jours avant l'échéance.</span>
      </div>`;
  },

  _lireChamps() {
    return {
      titre:          document.getElementById('dTitre').value.trim(),
      categorie:      document.getElementById('dCat').value,
      etiquetteId:    document.getElementById('dEtiq').value || null,
      dateDocument:   document.getElementById('dDate').value || null,
      dateExpiration: document.getElementById('dExpire').value || null,
      description:    document.getElementById('dDesc').value.trim(),
      favori:         document.getElementById('dFavori').checked
    };
  },

  _formAjout(fichier = null) {
    if (!fichier) {
      document.getElementById('coffreFile')?.click();
      return;
    }
    if (fichier.size > 25 * 1024 * 1024) {
      Toast.show('Fichier trop lourd (25 Mo maximum)', 'error');
      return;
    }

    Modal.open('Ajouter au coffre', this._champs({}, fichier), [
      { label: 'Annuler', cls: 'btn btn-secondary', action: () => Modal.close() },
      { label: 'Ajouter', cls: 'btn btn-primary', action: async e => {
          const meta = this._lireChamps();
          if (!meta.titre) { Toast.show('Un titre est nécessaire', 'error'); return; }
          const btn = document.getElementById('modalAction1');
          btn.disabled = true; btn.textContent = 'Envoi…';
          try {
            await DataStore.uploadCoffre(fichier, meta);
            Modal.close(); await this._charger();
            Toast.show('Document ajouté au coffre ✓', 'success');
          } catch (err) {
            btn.disabled = false; btn.textContent = 'Ajouter';
            Toast.show(
              /mime|type/i.test(err.message)
                ? 'Ce format de fichier n\'est pas accepté.'
                : 'Envoi impossible : ' + esc(err.message), 'error');
          }
        } }
    ]);
  },

  _formEdition(d) {
    Modal.open('Modifier le document', this._champs(d), [
      { label: 'Annuler',     cls: 'btn btn-secondary', action: () => Modal.close() },
      { label: 'Enregistrer', cls: 'btn btn-primary', action: async () => {
          const meta = this._lireChamps();
          if (!meta.titre) { Toast.show('Un titre est nécessaire', 'error'); return; }
          await DataStore.updateCoffre(d.id, meta);
          Modal.close(); await this._charger();
          Toast.show('Document mis à jour', 'success');
        } }
    ]);
  },

  _confirmerSuppression(id) {
    const d = this._docs.find(x => x.id === id);
    Modal.open('Supprimer ce document ?', `
      <p style="font-size:14px;color:var(--text-muted);line-height:1.6;">
        <strong>${esc(d?.titre)}</strong> sera retiré du coffre et le fichier
        effacé du stockage. Cette action est définitive.
      </p>`, [
      { label: 'Annuler',   cls: 'btn btn-secondary', action: () => Modal.close() },
      { label: 'Supprimer', cls: 'btn btn-danger', action: async () => {
          await DataStore.deleteCoffre(id);
          Modal.close(); await this._charger();
          Toast.show('Document supprimé', 'info');
        } }
    ], 'modal-sm');
  }
};
