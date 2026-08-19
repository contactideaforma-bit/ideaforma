/* ─────────────────────────────────────────────────────────────────────────────
   IDEAFORMA — Le carnet (bullet journal)

   Quatre spreads, comme dans un vrai carnet :
     • Jour        — le log du jour : ce qui se passe, ce qui reste à faire
     • Mois        — le log mensuel : la colonne des jours, la liste des tâches
     • Futur       — le future log : six mois d'avance, en gros traits
     • Collections — l'index : les listes, les étiquettes, le reste

   Grammaire du rapid logging :
     •  tâche à faire   ✕  faite   >  migrée   ~  abandonnée
     ○  rendez-vous     —  note    ★  priorité

   Rien de ce qui touche aux dossiers OPCO n'apparaît ici : ce carnet est
   personnel. Les échéances de dossiers vivent sur la page « Ma journée ».
───────────────────────────────────────────────────────────────────────────── */

const Hub = {

  spread:      'jour',        // jour | mois | futur | collections
  curseur:     new Date(),    // la journée (ou le mois) affiché
  _etiquettes: [],
  _listes:     [],

  /* Conservé pour js/agenda.js, qui s'en sert pour nommer un type d'entrée. */
  _typeLabel(type) {
    return { evenement: 'Rendez-vous', session: 'Formation',
             tache: 'Tâche', echeance: 'Échéance OPCO', note: 'Note' }[type] || type;
  },

  /* ══════════════════════════════════════════════
     RENDU
  ══════════════════════════════════════════════ */
  async render() {
    document.getElementById('pageTitle').textContent    = 'Carnet';
    document.getElementById('pageSubtitle').textContent = this._sousTitre();
    document.getElementById('pageHeaderRight').innerHTML = `
      <button class="btn btn-sm btn-secondary" id="carnetAujourdhui">Aujourd'hui</button>`;
    Loading.show();

    try {
      [this._etiquettes, this._listes] = await Promise.all([
        DataStore.getEtiquettes(),
        DataStore.getListes()
      ]);
      await this._peindre();
    } catch (err) { peindreErreur(err); return; }

    document.getElementById('carnetAujourdhui').addEventListener('click', () => {
      this.curseur = new Date();
      this.render();
    });
  },

  _sousTitre() {
    return { jour: 'Log du jour', mois: 'Log mensuel',
             futur: 'Future log', collections: 'Index des collections' }[this.spread];
  },

  async _peindre() {
    const corps = this.spread === 'jour'  ? await this._spreadJour()
                : this.spread === 'mois'  ? await this._spreadMois()
                : this.spread === 'futur' ? await this._spreadFutur()
                :                           await this._spreadCollections();

    document.getElementById('pageContent').innerHTML = `
      <div class="carnet">
        <div class="marque-pages">
          ${[['jour', 'Jour'], ['mois', 'Mois'],
             ['futur', 'Futur'], ['collections', 'Collections']].map(([k, l]) => `
            <button class="marque-page ${this.spread === k ? 'active' : ''}"
                    data-spread="${k}">${l}</button>`).join('')}
        </div>
        ${corps}
      </div>`;

    document.getElementById('pageSubtitle').textContent = this._sousTitre();
    this._bind();
  },

  /* Recharge le spread courant sans repasser par render() */
  _rafraichir() { return this._peindre(); },

  /* ══════════════════════════════════════════════
     RENDU D'UNE ENTRÉE
  ══════════════════════════════════════════════ */
  _entree(e, { afficherJour = false } = {}) {
    const sym   = DataStore.symbole(e);
    const etiq  = this._etiquettes.find(x => x.id === e.etiquette_id);
    const fait  = e.etat === 'fait';
    const aband = e.etat === 'abandonnee';
    const retard = e.entree === 'tache' && !fait && !aband && e.jour < Dates.aujourdhui();

    const classeSym = e.entree === 'evenement' ? 'puce-evenement'
                    : e.entree === 'note'      ? 'puce-note'
                    : fait                     ? 'puce-fait'
                    : aband                    ? 'puce-abandonnee'
                    : 'puce-tache';

    const outils = e.entree === 'tache' ? `
        <button class="log-outil" data-migrer="${e.id}" title="Repousser à demain">›</button>
        <button class="log-outil" data-abandon="${e.id}"
                title="${aband ? 'Reprendre' : 'Abandonner'}">~</button>
        <button class="log-outil" data-editer-tache="${e.id}" title="Modifier">✎</button>`
      : e.entree === 'evenement' ? `
        <button class="log-outil" data-editer-ev="${e.id}" title="Modifier">✎</button>`
      : `
        <button class="log-outil" data-editer-note="${e.id}" title="Modifier">✎</button>`;

    return `
      <div class="log-entree ${fait ? 'est-fait' : ''} ${aband ? 'est-abandonne' : ''}">
        <button class="puce ${classeSym}" data-puce="${e.entree}" data-id="${e.id}"
                title="${e.entree === 'tache' ? (fait ? 'Rouvrir' : 'Marquer comme fait') : 'Ouvrir'}"
        >${sym}</button>

        ${e.heure ? `<span class="log-heure">${String(e.heure).slice(0, 5)}</span>` : ''}

        <div class="log-corps" data-ouvrir="${e.entree}" data-oid="${e.id}">
          <div class="log-texte">
            ${e.priorite === 'haute' && e.entree === 'tache'
              ? '<span class="log-signifiant">★</span>' : ''}
            ${esc(e.texte)}
          </div>
          ${(e.detail || etiq || retard || e.migrations > 0 || afficherJour) ? `
            <div class="log-meta">
              ${afficherJour ? `<span>${Dates.courte(e.jour)}</span>` : ''}
              ${retard ? `<span class="log-retard">en retard · ${Dates.relative(e.jour)}</span>` : ''}
              ${e.migrations > 0
                ? `<span class="log-migrations" title="Repoussée ${e.migrations} fois">
                     › ${e.migrations}</span>` : ''}
              ${etiq ? pucePastille(etiq) : ''}
              ${e.detail && e.entree !== 'tache'
                ? `<span>${esc(String(e.detail).slice(0, 70))}</span>` : ''}
            </div>` : ''}
        </div>

        <div class="log-outils">${outils}</div>
      </div>`;
  },

  _legende() {
    return `
      <div class="legende">
        ${[['•', 'tâche'], ['✕', 'faite'], ['›', 'repoussée'], ['~', 'abandonnée'],
           ['○', 'rendez-vous'], ['—', 'note'], ['★', 'priorité']].map(([s, l]) => `
          <span class="legende-item"><span class="legende-sym">${s}</span>${l}</span>`).join('')}
      </div>`;
  },

  _boutonsCreation() {
    return `
      <div class="log-creer">
        <button class="log-creer-btn" data-creer="tache">
          <span class="log-creer-sym">•</span> Tâche</button>
        <button class="log-creer-btn" data-creer="evenement">
          <span class="log-creer-sym">○</span> Rendez-vous</button>
        <button class="log-creer-btn" data-creer="note">
          <span class="log-creer-sym">—</span> Note</button>
      </div>`;
  },

  /* ══════════════════════════════════════════════
     SPREAD — LOG DU JOUR
  ══════════════════════════════════════════════ */
  async _spreadJour() {
    const jour   = Dates.iso(this.curseur);
    const estAuj = jour === Dates.aujourdhui();

    // Le jour affiché, plus le passé non traité si l'on est sur aujourd'hui
    const debut = estAuj ? Dates.iso(new Date(Date.now() - 60 * 86400000)) : jour;
    const brut  = await DataStore.getJournal(debut, jour);

    const duJour   = brut.filter(e => e.jour === jour);
    const enSouffrance = estAuj
      ? brut.filter(e => e.jour < jour && e.entree === 'tache' && e.etat === 'a_faire')
      : [];

    const rdv    = duJour.filter(e => e.entree === 'evenement');
    const taches = duJour.filter(e => e.entree === 'tache');
    const notes  = duJour.filter(e => e.entree === 'note');

    const section = (titre, items, options) => !items.length ? '' : `
      <div class="log-titre">${titre}
        <span class="log-titre-compte">${items.length}</span></div>
      <div class="log">${items.map(e => this._entree(e, options)).join('')}</div>`;

    return `
      <div class="spread-tete">
        <div>
          <div class="spread-titre">${this._titreJour()}</div>
          <div class="spread-soustitre">
            ${duJour.length
              ? `${duJour.length} entrée${duJour.length > 1 ? 's' : ''}${
                  taches.filter(t => t.etat === 'fait').length
                    ? ` · ${taches.filter(t => t.etat === 'fait').length} faite(s)` : ''}`
              : 'Page blanche'}
          </div>
        </div>
        <div class="spread-actions">
          <button class="btn-icon" data-jour="-1" title="Jour précédent">‹</button>
          <button class="btn-icon" data-jour="1" title="Jour suivant">›</button>
        </div>
      </div>

      <div class="log-entete">
        <div class="log-saisie">
          <span class="log-saisie-puce">•</span>
          <input id="logInput" autocomplete="off"
                 placeholder="Noter vite…  •  tâche   ○  rendez-vous   —  note" />
        </div>
        <div class="log-saisie-indice" id="logIndice"></div>
        ${this._boutonsCreation()}
      </div>

      ${section('Rendez-vous', rdv)}
      ${section('Tâches', taches)}
      ${section('Notes', notes)}

      ${enSouffrance.length ? `
        <div class="log-titre" style="color:var(--encre-rouge);">
          Restées en arrière
          <span class="log-titre-compte">${enSouffrance.length}</span>
        </div>
        <div class="spread-soustitre" style="margin:-2px 0 6px;">
          Le carnet vous les remet sous les yeux : traitez-les, repoussez-les avec ›,
          ou abandonnez-les avec ~.
        </div>
        <div class="log">
          ${enSouffrance.map(e => this._entree(e, { afficherJour: true })).join('')}
        </div>
        <div style="margin-top:10px;">
          <button class="btn btn-sm btn-secondary" id="migrerTout">
            › Tout repousser à ${estAuj ? "aujourd'hui" : 'ce jour'}
          </button>
        </div>` : ''}

      ${(!duJour.length && !enSouffrance.length) ? `
        <div class="empty-state" style="padding:34px 0;">
          <div class="empty-icon">✒️</div>
          Rien d'écrit sur cette page.
        </div>` : ''}

      ${this._legende()}`;
  },

  _titreJour() {
    const j = this.curseur;
    const hui = Dates.aujourdhui();
    const iso = Dates.iso(j);
    const prefixe = iso === hui ? "Aujourd'hui — "
                  : iso === Dates.iso(new Date(Date.now() + 86400000)) ? 'Demain — '
                  : iso === Dates.iso(new Date(Date.now() - 86400000)) ? 'Hier — ' : '';
    return prefixe + Dates.longue(j);
  },

  /* ══════════════════════════════════════════════
     SPREAD — LOG MENSUEL
  ══════════════════════════════════════════════ */
  async _spreadMois() {
    const c       = this.curseur;
    const premier = new Date(c.getFullYear(), c.getMonth(), 1);
    const dernier = new Date(c.getFullYear(), c.getMonth() + 1, 0);
    const entrees = await DataStore.getJournal(Dates.iso(premier), Dates.iso(dernier));

    const parJour = {};
    entrees.forEach(e => (parJour[e.jour] ||= []).push(e));

    const hui = Dates.aujourdhui();
    const LETTRES = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

    let lignes = '';
    for (let n = 1; n <= dernier.getDate(); n++) {
      const d   = new Date(c.getFullYear(), c.getMonth(), n);
      const iso = Dates.iso(d);
      const jour = d.getDay();
      const items = parJour[iso] || [];
      lignes += `
        <div class="mois-ligne ${jour === 0 || jour === 6 ? 'week-end' : ''}
                    ${iso === hui ? 'aujourdhui' : ''}" data-jour-mois="${iso}">
          <div class="mois-ligne-date">
            <span class="mois-ligne-num">${n}</span>
            <span class="mois-ligne-jour">${LETTRES[jour]}</span>
          </div>
          <div class="mois-ligne-contenu">
            ${items.map(e => `
              <span class="mois-puce ${e.etat === 'fait' ? 'fait' : ''}"
                    data-ouvrir="${e.entree}" data-oid="${e.id}" title="${esc(e.texte)}">
                <span class="mois-puce-sym">${DataStore.symbole(e)}</span>${esc(
                  e.texte.length > 30 ? e.texte.slice(0, 29) + '…' : e.texte)}
              </span>`).join('')}
          </div>
        </div>`;
    }

    const taches = entrees.filter(e => e.entree === 'tache');
    const aFaire = taches.filter(e => e.etat === 'a_faire');
    const faites = taches.filter(e => e.etat === 'fait');

    return `
      <div class="spread-tete">
        <div>
          <div class="spread-titre" style="text-transform:capitalize;">
            ${Dates.MOIS[c.getMonth()]} ${c.getFullYear()}
          </div>
          <div class="spread-soustitre">
            ${entrees.length} entrée${entrees.length > 1 ? 's' : ''} ·
            ${aFaire.length} tâche${aFaire.length > 1 ? 's' : ''} en attente
          </div>
        </div>
        <div class="spread-actions">
          <button class="btn-icon" data-mois="-1" title="Mois précédent">‹</button>
          <button class="btn-icon" data-mois="1" title="Mois suivant">›</button>
        </div>
      </div>

      <div class="mois-spread">
        <div class="mois-jours">${lignes}</div>

        <div>
          <div class="log-titre">Tâches du mois
            <span class="log-titre-compte">${aFaire.length}</span></div>
          ${aFaire.length
            ? `<div class="log">${aFaire.map(e =>
                 this._entree(e, { afficherJour: true })).join('')}</div>`
            : '<div class="futur-mois-vide">Aucune tâche en attente ce mois-ci.</div>'}

          ${faites.length ? `
            <div class="log-titre">Faites
              <span class="log-titre-compte">${faites.length}</span></div>
            <div class="log">${faites.map(e =>
              this._entree(e, { afficherJour: true })).join('')}</div>` : ''}

          <div style="margin-top:16px;">${this._boutonsCreation()}</div>
        </div>
      </div>

      ${this._legende()}`;
  },

  /* ══════════════════════════════════════════════
     SPREAD — FUTURE LOG
  ══════════════════════════════════════════════ */
  async _spreadFutur() {
    const depart = new Date(this.curseur.getFullYear(), this.curseur.getMonth() + 1, 1);
    const fin    = new Date(depart.getFullYear(), depart.getMonth() + 6, 0);
    const entrees = await DataStore.getJournal(Dates.iso(depart), Dates.iso(fin));

    const mois = Array.from({ length: 6 }, (_, i) => {
      const m = new Date(depart.getFullYear(), depart.getMonth() + i, 1);
      const cle = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
      return {
        date: m, cle,
        items: entrees.filter(e => String(e.jour).slice(0, 7) === cle)
      };
    });

    return `
      <div class="spread-tete">
        <div>
          <div class="spread-titre">Les six mois qui viennent</div>
          <div class="spread-soustitre">
            Ce qui est déjà posé, et ce qu'il faudra ramener dans un log mensuel
            le moment venu.
          </div>
        </div>
        <div class="spread-actions">
          <button class="btn-icon" data-mois="-1" title="Reculer d'un mois">‹</button>
          <button class="btn-icon" data-mois="1" title="Avancer d'un mois">›</button>
        </div>
      </div>

      <div class="futur-grille">
        ${mois.map(m => `
          <div class="futur-mois">
            <div class="futur-mois-titre" data-aller-mois="${m.cle}">
              ${Dates.MOIS[m.date.getMonth()]}
              ${m.date.getFullYear() !== new Date().getFullYear()
                ? ` <span style="font-size:14px;">${m.date.getFullYear()}</span>` : ''}
            </div>
            ${m.items.length
              ? m.items.slice(0, 12).map(e => `
                  <div class="futur-entree" data-ouvrir="${e.entree}" data-oid="${e.id}">
                    <span class="futur-jour">${String(e.jour).slice(8, 10)}</span>
                    <span>${DataStore.symbole(e)} ${esc(
                      e.texte.length > 38 ? e.texte.slice(0, 37) + '…' : e.texte)}</span>
                  </div>`).join('')
              : '<div class="futur-mois-vide">Rien de prévu.</div>'}
            ${m.items.length > 12
              ? `<div class="futur-mois-vide">+ ${m.items.length - 12} autres</div>` : ''}
            <div style="margin-top:auto;padding-top:10px;">
              <button class="log-creer-btn" data-futur-ajout="${m.cle}"
                      style="width:100%;justify-content:center;padding:6px;font-size:12px;">
                ＋ ajouter
              </button>
            </div>
          </div>`).join('')}
      </div>

      ${this._legende()}`;
  },

  /* ══════════════════════════════════════════════
     SPREAD — COLLECTIONS (l'index)
  ══════════════════════════════════════════════ */
  async _spreadCollections() {
    const [taches, notes] = await Promise.all([
      DataStore.getTachesFiltrees({ fait: false }),
      DataStore.getNotes({ archivees: false })
    ]);

    const parListe = id => taches.filter(t => t.liste_id === id);
    const sansListe = taches.filter(t => !t.liste_id);

    const carte = (id, icone, nom, couleur, items, action) => `
      <div class="collection" style="--c:${couleur}" ${action}>
        <div class="collection-tete">
          <span class="collection-icone">${icone}</span>
          <span class="collection-nom">${esc(nom)}</span>
          <span class="collection-compte">${items.length}</span>
        </div>
        ${items.length
          ? `<div class="collection-apercu">
               ${items.slice(0, 3).map(t =>
                 `<div class="collection-item">• ${esc(t.description || t.titre || '')}</div>`).join('')}
               ${items.length > 3
                 ? `<div class="collection-item">…</div>` : ''}
             </div>`
          : '<div class="collection-vide">Collection vide</div>'}
      </div>`;

    return `
      <div class="spread-tete">
        <div>
          <div class="spread-titre">Index</div>
          <div class="spread-soustitre">
            Les collections rassemblent ce qui n'appartient à aucune date.
          </div>
        </div>
      </div>

      <div class="log-titre">Listes</div>
      <div class="collections-grille">
        ${this._listes.map(l => carte(
          l.id, l.icone, l.nom, l.couleur, parListe(l.id),
          `data-collection="${l.id}"`)).join('')}
        ${sansListe.length
          ? carte('', '📥', 'Sans liste', 'var(--encre-douce)', sansListe, 'data-collection=""')
          : ''}
        <div class="collection collection-neuve" id="btnNouvelleCollection">
          ＋ Nouvelle collection
        </div>
      </div>

      <div class="log-titre">Pense-bête
        <span class="log-titre-compte">${notes.length}</span></div>
      <div class="collections-grille">
        ${carte('notes', '📝', 'Toutes les notes', 'var(--ruban-2)',
                notes, 'data-aller="notes"')}
        ${carte('epingle', '📌', 'Épinglées', 'var(--ruban-1)',
                notes.filter(n => n.epinglee), 'data-aller="notes"')}
      </div>

      <div class="log-titre">Étiquettes</div>
      <div class="listes-barre">
        ${this._etiquettes.map(e => `
          <span class="liste-chip" data-etiq-filtre="${e.id}"
                style="border-color:${e.couleur};color:${e.couleur};cursor:pointer;">
            ${e.icone} ${esc(e.nom)}
          </span>`).join('')}
        <button class="liste-chip liste-chip-plus" id="btnNouvelleEtiquette">＋ Étiquette</button>
      </div>

      <div class="log-titre">Ailleurs dans le carnet</div>
      <div class="collections-grille">
        <div class="collection" style="--c:var(--ruban-3)" data-aller="coffre">
          <div class="collection-tete">
            <span class="collection-icone">🗄️</span>
            <span class="collection-nom">Coffre à documents</span>
          </div>
          <div class="collection-vide">Papiers, contrats, diplômes.</div>
        </div>
        <div class="collection" style="--c:var(--ruban-4)" data-aller="assistant">
          <div class="collection-tete">
            <span class="collection-icone">🤖</span>
            <span class="collection-nom">Assistant</span>
          </div>
          <div class="collection-vide">Il lit le carnet et peut y écrire.</div>
        </div>
        <div class="collection" style="--c:var(--encre-douce)" data-aller="journee">
          <div class="collection-tete">
            <span class="collection-icone">🎓</span>
            <span class="collection-nom">Ma journée (OPCO)</span>
          </div>
          <div class="collection-vide">Les dossiers de formation, à part.</div>
        </div>
      </div>`;
  },

  /* ══════════════════════════════════════════════
     INTERACTIONS
  ══════════════════════════════════════════════ */
  _bind() {
    const zone = document.querySelector('.carnet');

    zone.addEventListener('click', async e => {
      const cible = sel => e.target.closest(sel);

      /* ── Navigation entre spreads ── */
      const onglet = cible('[data-spread]');
      if (onglet) { this.spread = onglet.dataset.spread; return this._peindre(); }

      const dj = cible('[data-jour]');
      if (dj) {
        this.curseur = new Date(this.curseur.getTime() + Number(dj.dataset.jour) * 86400000);
        return this._peindre();
      }

      const dm = cible('[data-mois]');
      if (dm) {
        const c = new Date(this.curseur);
        c.setDate(1);
        c.setMonth(c.getMonth() + Number(dm.dataset.mois));
        this.curseur = c;
        return this._peindre();
      }

      const versMois = cible('[data-aller-mois]');
      if (versMois) {
        const [a, m] = versMois.dataset.allerMois.split('-').map(Number);
        this.curseur = new Date(a, m - 1, 1);
        this.spread  = 'mois';
        return this._peindre();
      }

      const versJour = cible('[data-jour-mois]');
      if (versJour && !cible('[data-ouvrir]')) {
        this.curseur = new Date(versJour.dataset.jourMois + 'T12:00:00');
        this.spread  = 'jour';
        return this._peindre();
      }

      const ailleurs = cible('[data-aller]');
      if (ailleurs) return Router.navigate(ailleurs.dataset.aller);

      /* ── Rapid logging ── */
      const puce = cible('[data-puce]');
      if (puce) return this._actionPuce(puce.dataset.puce, puce.dataset.id);

      const migrer = cible('[data-migrer]');
      if (migrer) return this._migrer(migrer.dataset.migrer);

      const abandon = cible('[data-abandon]');
      if (abandon) return this._abandonner(abandon.dataset.abandon);

      if (cible('#migrerTout')) return this._migrerTout();

      /* ── Édition ── */
      const et = cible('[data-editer-tache]');
      if (et) return this._editerTache(et.dataset.editerTache);

      const ee = cible('[data-editer-ev]');
      if (ee) return this._editerEvenement(ee.dataset.editerEv);

      const en = cible('[data-editer-note]');
      if (en) return this._editerNote(en.dataset.editerNote);

      const ouvrir = cible('[data-ouvrir]');
      if (ouvrir) {
        const type = ouvrir.dataset.ouvrir, id = ouvrir.dataset.oid;
        if (type === 'tache')     return this._editerTache(id);
        if (type === 'evenement') return this._editerEvenement(id);
        if (type === 'note')      return this._editerNote(id);
      }

      /* ── Création ── */
      const creer = cible('[data-creer]');
      if (creer) return this._creer(creer.dataset.creer);

      const futurAjout = cible('[data-futur-ajout]');
      if (futurAjout) {
        const [a, m] = futurAjout.dataset.futurAjout.split('-').map(Number);
        return this._creer('tache', new Date(a, m - 1, 1));
      }

      /* ── Collections ── */
      const col = cible('[data-collection]');
      if (col) {
        Taches.listeActive = col.dataset.collection || null;
        return Router.navigate('taches');
      }

      const etiqF = cible('[data-etiq-filtre]');
      if (etiqF) {
        Taches.etiqActive = etiqF.dataset.etiqFiltre;
        return Router.navigate('taches');
      }

      if (cible('#btnNouvelleCollection')) {
        Taches._listes = this._listes;
        Taches._etiquettes = this._etiquettes;
        return Taches._formListe(async () => {
          this._listes = await DataStore.getListes();
          await this._rafraichir();
        });
      }

      if (cible('#btnNouvelleEtiquette')) {
        return SettingsPage._formEtiquette(null, async () => {
          this._etiquettes = await DataStore.getEtiquettes(true);
          await this._rafraichir();
        });
      }
    });

    /* ── Saisie rapide du log du jour ── */
    const input = document.getElementById('logInput');
    if (!input) return;

    const indice = document.getElementById('logIndice');
    const apercu = () => {
      const t = input.value.trim();
      if (!t) { indice.textContent = ''; return; }
      const p = this._lire(t);
      indice.textContent =
        p.type === 'note'      ? `— note du ${Dates.longue(this.curseur)}`
      : p.type === 'evenement' ? `○ rendez-vous · ${Dates.heure(p.date)}`
      : `• tâche${p.heure ? ' · ' + p.heure : ''}${
          p.priorite === 'haute' ? ' · priorité' : ''}`;
    };

    input.addEventListener('input', apercu);
    input.addEventListener('keydown', ev => {
      if (ev.key === 'Enter') { ev.preventDefault(); this._saisir(); }
    });
    // Focus rendu seulement après une saisie : sinon le clavier du téléphone
    // s'ouvrirait à chaque fois qu'on coche une case.
    if (this._reprendreFocus) { input.focus(); this._reprendreFocus = false; }
  },

  /* ── Lecture d'une ligne de saisie ──
     Les préfixes du carnet priment sur l'analyse automatique :
       •  force une tâche      ○  force un rendez-vous      —  force une note */
  _lire(texte) {
    const brut = texte.trim();
    const prefixe = brut[0];
    // Un préfixe alphabétique doit être suivi d'une espace, sinon « organiser
    // le placard » deviendrait un rendez-vous.
    const isole = c => brut[0] === c && (brut.length === 1 || brut[1] === ' ');

    if (isole('—') || isole('-') || isole('–')) {
      return { type: 'note', titre: brut.slice(1).trim() };
    }
    if (prefixe === '○' || isole('o') || isole('O')) {
      const p = QuickParse.analyser(brut.slice(1).trim());
      const d = p.type === 'evenement' ? p.date
              : Dates.combiner(Dates.iso(this.curseur), p.heure || '09:00');
      return { type: 'evenement', titre: p.titre, date: d };
    }
    if (prefixe === '•' || isole('*')) {
      const p = QuickParse.analyser(brut.slice(1).trim());
      return { type: 'tache', titre: p.titre,
               heure: p.heure || (p.date ? Dates.heure(p.date) : null),
               priorite: p.priorite || 'normale' };
    }

    const p = QuickParse.analyser(brut);
    if (p.type === 'evenement') return { type: 'evenement', titre: p.titre, date: p.date };
    return { type: 'tache', titre: p.titre, heure: p.heure, priorite: p.priorite };
  },

  async _saisir() {
    const input = document.getElementById('logInput');
    const texte = input.value.trim();
    if (!texte) return;

    const jour = Dates.iso(this.curseur);
    const p    = this._lire(texte);

    try {
      if (p.type === 'note') {
        await DataStore.addNote({ contenu: p.titre, dateJour: jour, couleur: '#FEF3C7' });
      } else if (p.type === 'evenement') {
        // La date analysée peut viser un autre jour ; sur le carnet, c'est la
        // page ouverte qui fait foi, on n'en garde que l'heure.
        const d = Dates.combiner(jour, Dates.heure(p.date));
        await DataStore.addEvenement({
          titre: p.titre,
          debut: d.toISOString(),
          fin:   new Date(d.getTime() + 3600000).toISOString(),
          rappels: [15]
        });
      } else {
        await DataStore.addTacheComplete({
          description:   p.titre,
          echeance:      jour,
          heure:         p.heure || null,
          rappelMinutes: p.heure ? 15 : null,
          priorite:      p.priorite || 'normale'
        });
      }
      input.value = '';
      document.getElementById('logIndice').textContent = '';
      this._reprendreFocus = true;
      await this._rafraichir();
      updateJourneeBadge();
    } catch (err) {
      Toast.show('Erreur : ' + esc(err.message), 'error');
    }
  },

  /* ── Actions de rapid logging ── */
  async _actionPuce(type, id) {
    if (type === 'tache') {
      const t = await DataStore.getTache(id);
      await DataStore.setTacheFait(id, !t?.fait);
      await this._rafraichir();
      updateJourneeBadge();
      return;
    }
    if (type === 'evenement') return this._editerEvenement(id);
    return this._editerNote(id);
  },

  async _migrer(id) {
    const demain = new Date(this.curseur.getTime() + 86400000);
    try {
      await DataStore.migrerTache(id, Dates.iso(demain));
      Toast.show(`Repoussée au ${Dates.longue(demain)}`, 'info');
      await this._rafraichir();
      updateJourneeBadge();
    } catch (err) { Toast.show('Erreur : ' + esc(err.message), 'error'); }
  },

  async _migrerTout() {
    const jour  = Dates.iso(this.curseur);
    const debut = Dates.iso(new Date(Date.now() - 60 * 86400000));
    const brut  = await DataStore.getJournal(debut, jour);
    const cibles = brut.filter(e =>
      e.entree === 'tache' && e.etat === 'a_faire' && e.jour < jour);

    if (!cibles.length) return;

    Modal.open(`Repousser ${cibles.length} tâche(s) ?`, `
      <p style="font-size:14px;color:var(--text-muted);line-height:1.6;">
        Elles seront datées du ${Dates.longue(this.curseur)}. Leur compteur de
        migrations augmentera : dans un bullet journal, une tâche repoussée
        trois fois mérite d'être découpée ou abandonnée.
      </p>`, [
      { label: 'Annuler', cls: 'btn btn-secondary', action: () => Modal.close() },
      { label: 'Repousser', cls: 'btn btn-primary', action: async () => {
          for (const t of cibles) {
            await DataStore.migrerTache(t.id, jour).catch(() => {});
          }
          Modal.close();
          await this._rafraichir();
          updateJourneeBadge();
          Toast.show(`${cibles.length} tâche(s) repoussée(s)`, 'success');
        } }
    ], 'modal-sm');
  },

  async _abandonner(id) {
    const t = await DataStore.getTache(id);
    await DataStore.abandonnerTache(id, !t?.abandonnee);
    await this._rafraichir();
    updateJourneeBadge();
  },

  /* ── Ouverture des formulaires, sans quitter le carnet ── */
  _preparer() {
    Taches._listes     = this._listes;
    Taches._etiquettes = this._etiquettes;
    Notes._etiquettes  = this._etiquettes;
    Agenda._etiquettes = this._etiquettes;
  },

  async _creer(type, dateForcee = null) {
    this._preparer();
    const jourObj = dateForcee || this.curseur;
    const jour    = Dates.iso(jourObj);
    const apres   = () => this._rafraichir();

    if (type === 'tache') {
      Taches.ouvrirForm(null, apres);
      // On pré-remplit la date du carnet une fois le formulaire monté
      const champ = document.getElementById('fDate');
      if (champ) champ.value = jour;
      return;
    }
    if (type === 'evenement') return Agenda.ouvrirForm(null, jour, apres);
    return Notes.ouvrir(null, apres, jour);
  },

  async _editerTache(id) {
    this._preparer();
    const t = await DataStore.getTache(id);
    if (t) Taches.ouvrirForm(t, () => this._rafraichir());
  },

  async _editerEvenement(id) {
    this._preparer();
    const ev = await DataStore.getEvenement(id).catch(() => null);
    if (ev) Agenda.ouvrirForm(ev, null, () => this._rafraichir());
  },

  async _editerNote(id) {
    this._preparer();
    const n = await DataStore.getNote(id).catch(() => null);
    if (n) Notes.ouvrir(n, () => this._rafraichir());
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
