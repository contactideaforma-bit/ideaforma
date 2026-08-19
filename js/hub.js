/* ─────────────────────────────────────────────────────────────────────────────
   IDEAFORMA — Tableau de bord polyvalent
   Une seule page pour la journée : agenda, tâches, notes épinglées, dossiers
   OPCO qui réclament une action, documents qui expirent, et une barre de
   saisie rapide qui devine ce qu'on lui donne.
───────────────────────────────────────────────────────────────────────────── */

const Hub = {

  _resume: null,

  async render() {
    document.getElementById('pageTitle').textContent    = this._salutation();
    document.getElementById('pageSubtitle').textContent = Dates.longue(new Date());
    document.getElementById('pageHeaderRight').innerHTML = `
      <button class="btn btn-sm btn-secondary" id="hubRefresh" title="Rafraîchir">↻</button>`;
    Loading.show();

    let r;
    try {
      r = this._resume = await DataStore.getResumeJour();
    } catch (err) {
      document.getElementById('pageContent').innerHTML = `
        <div class="section-card"><div class="section-card-body">
          <div class="empty-state">
            <div class="empty-icon">⚠️</div>
            Impossible de charger le tableau de bord.<br>
            <small style="color:var(--text-muted)">${esc(err.message)}</small><br><br>
            <small>Si le message parle d'une table ou d'une vue absente, la migration
            <strong>setup_update8.sql</strong> n'a pas encore été jouée dans Supabase.</small>
          </div>
        </div></div>`;
      return;
    }

    const etiquettes = await DataStore.getEtiquettes().catch(() => []);

    document.getElementById('pageContent').innerHTML = `
      <div class="hub">

        ${this._barreSaisie(etiquettes)}
        ${this._tuiles(r)}

        <div class="hub-grid">
          <div class="hub-col">
            ${this._blocAgenda(r)}
            ${this._blocTaches(r)}
          </div>
          <div class="hub-col">
            ${this._blocRaccourcis()}
            ${this._blocNotes(r)}
            ${this._blocOpco(r)}
            ${this._blocExpirations(r)}
          </div>
        </div>
      </div>`;

    this._bind(etiquettes);
  },

  _salutation() {
    const h = new Date().getHours();
    if (h < 6)  return 'Bonne nuit';
    if (h < 12) return 'Bonjour';
    if (h < 18) return 'Bon après-midi';
    return 'Bonsoir';
  },

  /* ══ Barre de saisie rapide ══════════════════════════════════════════════
     « Appeler AKTO demain 10h » → tâche datée. On analyse le texte côté
     navigateur (rapide, gratuit) et on laisse l'IA pour les cas tordus. */
  _barreSaisie(etiquettes) {
    return `
      <div class="hub-quick">
        <input id="quickInput" class="hub-quick-input" autocomplete="off"
               placeholder="Ajouter vite : « Rappeler le comptable demain 14h », « Acheter du café », « RDV dentiste vendredi 9h30 »" />
        <select id="quickEtiq" class="hub-quick-etiq" title="Étiquette">
          <option value="">Sans étiquette</option>
          ${etiquettes.map(e => `<option value="${e.id}">${e.icone} ${esc(e.nom)}</option>`).join('')}
        </select>
        <button class="btn btn-primary btn-sm" id="quickAdd">Ajouter</button>
      </div>
      <div class="hub-quick-hint" id="quickHint"></div>`;
  },

  _tuiles(r) {
    const t = (val, label, couleur, page) => `
      <div class="hub-tuile" data-goto="${page}" style="--c:${couleur}">
        <div class="hub-tuile-val">${val}</div>
        <div class="hub-tuile-lbl">${label}</div>
      </div>`;

    return `
      <div class="hub-tuiles">
        ${t(r.agendaAujourdhui.filter(a => !a.termine).length, "aujourd'hui", '#3B82F6', 'agenda')}
        ${t(r.tachesEnRetard.length, 'en retard', r.tachesEnRetard.length ? '#EF4444' : '#94A3B8', 'taches')}
        ${t(r.tachesDuJour.length, 'tâches du jour', '#F59E0B', 'taches')}
        ${t(r.actionsOpco.length, 'actions OPCO', r.actionsOpco.length ? '#8B5CF6' : '#94A3B8', 'journee')}
      </div>`;
  },

  /* ══ Agenda du jour ══ */
  _blocAgenda(r) {
    const finJour = new Date(); finJour.setHours(23, 59, 59, 999);
    const auj = r.agendaAujourdhui;
    const suite = r.agendaSemaine
      .filter(a => new Date(a.debut) > finJour && !a.termine)
      .slice(0, 5);

    const ligne = a => {
      const d = new Date(a.debut);
      const passe = d < new Date() && !a.journee_entiere;
      return `
        <div class="hub-item ${a.termine || passe ? 'hub-item-passe' : ''}"
             data-agenda-type="${a.type}" data-agenda-id="${a.id}">
          <div class="hub-item-heure" style="color:${a.couleur}">
            ${a.journee_entiere ? '—' : Dates.heure(d)}
          </div>
          <div class="hub-item-barre" style="background:${a.couleur}"></div>
          <div class="hub-item-corps">
            <div class="hub-item-titre">${esc(a.titre)}</div>
            <div class="hub-item-sous">
              ${this._typeLabel(a.type)}${a.lieu ? ' · ' + esc(a.lieu) : ''}
            </div>
          </div>
        </div>`;
    };

    return `
      <div class="section-card">
        <div class="section-card-header">
          <div class="section-card-title">📅 Aujourd'hui</div>
          <button class="btn btn-sm btn-secondary" data-goto="agenda">Ouvrir l'agenda</button>
        </div>
        <div class="section-card-body">
          ${auj.length
            ? `<div class="hub-liste">${auj.map(ligne).join('')}</div>`
            : `<div class="empty-state"><div class="empty-icon">🌤️</div>
                 Rien de programmé aujourd'hui.</div>`}

          ${suite.length ? `
            <div class="hub-sous-titre">À venir cette semaine</div>
            <div class="hub-liste">${suite.map(a => `
              <div class="hub-item hub-item-compact" data-agenda-type="${a.type}" data-agenda-id="${a.id}">
                <div class="hub-item-heure" style="color:${a.couleur}">${Dates.relative(a.debut)}</div>
                <div class="hub-item-barre" style="background:${a.couleur}"></div>
                <div class="hub-item-corps">
                  <div class="hub-item-titre">${esc(a.titre)}</div>
                  <div class="hub-item-sous">${Dates.heure(a.debut)} · ${this._typeLabel(a.type)}</div>
                </div>
              </div>`).join('')}
            </div>` : ''}
        </div>
      </div>`;
  },

  _typeLabel(type) {
    return { evenement: 'Rendez-vous', session: 'Formation',
             tache: 'Tâche', echeance: 'Échéance OPCO' }[type] || type;
  },

  /* ══ Tâches ══ */
  _blocTaches(r) {
    const hui  = Dates.aujourdhui();
    const dans7 = Dates.iso(new Date(Date.now() + 7 * 86400000));

    const groupes = [
      { titre: 'En retard',    couleur: '#EF4444',
        items: r.taches.filter(t => t.echeance && t.echeance < hui) },
      { titre: "Aujourd'hui",  couleur: '#F59E0B',
        items: r.taches.filter(t => t.echeance === hui) },
      { titre: 'Cette semaine', couleur: '#3B82F6',
        items: r.taches.filter(t => t.echeance > hui && t.echeance <= dans7) },
      { titre: 'Sans date',    couleur: '#94A3B8',
        items: r.taches.filter(t => !t.echeance).slice(0, 6) }
    ].filter(g => g.items.length);

    return `
      <div class="section-card">
        <div class="section-card-header">
          <div class="section-card-title">✅ Mes tâches</div>
          <button class="btn btn-sm btn-secondary" data-goto="taches">Toutes les listes</button>
        </div>
        <div class="section-card-body">
          ${groupes.length ? groupes.map(g => `
            <div class="hub-sous-titre" style="color:${g.couleur}">
              ${g.titre} <span class="hub-compteur">${g.items.length}</span>
            </div>
            <div class="hub-liste">
              ${g.items.slice(0, 8).map(t => Taches.ligne(t)).join('')}
            </div>`).join('')
            : `<div class="empty-state"><div class="empty-icon">🎉</div>
                 Aucune tâche en attente.</div>`}
        </div>
      </div>`;
  },

  /* ══ Raccourcis ══ */
  _blocRaccourcis() {
    const r = (page, icone, label) =>
      `<button class="hub-raccourci" data-goto="${page}">
         <span class="hub-raccourci-ic">${icone}</span>${label}</button>`;
    return `
      <div class="section-card">
        <div class="section-card-body hub-raccourcis">
          ${r('assistant', '🤖', 'Assistant')}
          ${r('agenda',    '📅', 'Agenda')}
          ${r('taches',    '✅', 'Tâches')}
          ${r('notes',     '📝', 'Pense-bête')}
          ${r('coffre',    '🗄️', 'Coffre')}
          ${r('journee',   '🎓', 'Ma journée')}
        </div>
      </div>`;
  },

  /* ══ Notes épinglées ══ */
  _blocNotes(r) {
    const notes = r.notesEpinglees.slice(0, 4);
    return `
      <div class="section-card">
        <div class="section-card-header">
          <div class="section-card-title">📝 Pense-bête</div>
          <button class="btn btn-sm btn-secondary" data-goto="notes">Tout voir</button>
        </div>
        <div class="section-card-body">
          ${notes.length ? `
            <div class="notes-mini">
              ${notes.map(n => `
                <div class="note-mini" style="background:${n.couleur}" data-note-id="${n.id}">
                  ${n.titre ? `<div class="note-mini-titre">${esc(n.titre)}</div>` : ''}
                  <div class="note-mini-corps">${esc((n.contenu || '').slice(0, 160))}</div>
                </div>`).join('')}
            </div>`
            : `<div class="empty-state" style="padding:18px 0;">
                 <div class="empty-icon">📌</div>Aucune note épinglée.</div>`}
        </div>
      </div>`;
  },

  /* ══ Dossiers OPCO qui réclament une action ══ */
  _blocOpco(r) {
    const items = r.actionsOpco.slice(0, 5);
    if (!items.length) return '';
    return `
      <div class="section-card">
        <div class="section-card-header">
          <div class="section-card-title">🎓 Dossiers à traiter</div>
          <button class="btn btn-sm btn-secondary" data-goto="journee">Ma journée</button>
        </div>
        <div class="section-card-body">
          <div class="hub-liste">
            ${items.map(a => `
              <div class="hub-item hub-item-compact">
                <div class="hub-item-heure" style="color:${a.criticite === 'bloquante' ? '#DC2626' : '#F97316'}">
                  ${Dates.relative(a.date_echeance)}
                </div>
                <div class="hub-item-barre" style="background:${a.criticite === 'bloquante' ? '#DC2626' : '#F97316'}"></div>
                <div class="hub-item-corps">
                  <div class="hub-item-titre">${esc(a.libelle)}</div>
                  <div class="hub-item-sous">${esc(a.nom_entreprise || '')}</div>
                </div>
              </div>`).join('')}
          </div>
        </div>
      </div>`;
  },

  /* ══ Documents qui expirent ══ */
  _blocExpirations(r) {
    if (!r.expirations.length) return '';
    return `
      <div class="section-card">
        <div class="section-card-header">
          <div class="section-card-title">⏳ Documents à renouveler</div>
        </div>
        <div class="section-card-body">
          <div class="hub-liste">
            ${r.expirations.slice(0, 5).map(d => `
              <div class="hub-item hub-item-compact" data-goto="coffre">
                <div class="hub-item-heure" style="color:#EF4444">${Dates.relative(d.date_expiration)}</div>
                <div class="hub-item-barre" style="background:#EF4444"></div>
                <div class="hub-item-corps">
                  <div class="hub-item-titre">${esc(d.titre)}</div>
                  <div class="hub-item-sous">expire le ${Dates.courte(d.date_expiration)}</div>
                </div>
              </div>`).join('')}
          </div>
        </div>
      </div>`;
  },

  /* ══ Interactions ══ */
  _bind(etiquettes) {
    document.getElementById('hubRefresh')?.addEventListener('click', () => this.render());

    // Conteneur recréé à chaque rendu : pas d'empilement d'écouteurs.
    document.querySelector('.hub').addEventListener('click', async e => {
      const nav = e.target.closest('[data-goto]');
      if (nav) { Router.navigate(nav.dataset.goto); return; }

      const note = e.target.closest('[data-note-id]');
      if (note) { Router.navigate('notes'); return; }

      // Cocher une tâche depuis le hub
      const check = e.target.closest('.tache-check[data-tache-id]');
      if (check) {
        const id = check.dataset.tacheId;
        await DataStore.setTacheFait(id, !check.classList.contains('coche'));
        this.render();
        updateJourneeBadge();
        return;
      }

      // Les autres commandes de la ligne de tâche n'ont de sens que sur la
      // page Tâches : on y renvoie plutôt que de laisser un bouton mort.
      if (e.target.closest('[data-tache-open]') || e.target.closest('[data-tache-del]')) {
        Router.navigate('taches');
      }
    });

    const input = document.getElementById('quickInput');
    const hint  = document.getElementById('quickHint');

    const apercu = () => {
      const p = QuickParse.analyser(input.value);
      hint.innerHTML = !input.value.trim() ? '' :
        p.type === 'evenement'
          ? `→ <strong>Rendez-vous</strong> « ${esc(p.titre)} » le ${Dates.longue(p.date)} à ${Dates.heure(p.date)}`
          : `→ <strong>Tâche</strong> « ${esc(p.titre)} »` +
            (p.echeance ? ` · ${Dates.relative(p.echeance)}${p.heure ? ' à ' + p.heure : ''}` : ' · sans date');
    };

    input.addEventListener('input', apercu);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') this._ajoutRapide(); });
    document.getElementById('quickAdd').addEventListener('click', () => this._ajoutRapide());
  },

  async _ajoutRapide() {
    const input = document.getElementById('quickInput');
    const texte = input.value.trim();
    if (!texte) return;

    const etiquetteId = document.getElementById('quickEtiq').value || null;
    const p = QuickParse.analyser(texte);

    try {
      if (p.type === 'evenement') {
        await DataStore.addEvenement({
          titre: p.titre,
          debut: p.date.toISOString(),
          fin:   new Date(p.date.getTime() + 3600000).toISOString(),
          etiquetteId,
          rappels: [15]
        });
        Toast.show(`Rendez-vous ajouté · rappel 15 min avant`, 'success');
      } else {
        await DataStore.addTacheComplete({
          description: p.titre,
          echeance:    p.echeance || null,
          heure:       p.heure    || null,
          rappelMinutes: p.heure ? 15 : null,
          priorite:    p.priorite,
          etiquetteId
        });
        Toast.show('Tâche ajoutée', 'success');
      }
      input.value = '';
      document.getElementById('quickHint').innerHTML = '';
      this.render();
      updateJourneeBadge();
    } catch (err) {
      Toast.show('Erreur : ' + esc(err.message), 'error');
    }
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
