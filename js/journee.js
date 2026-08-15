/* ─── Ma journée — récapitulatif quotidien ─────────────────────────────────
   Reprend ce que contenait le mail de rappel, directement dans l'application.
   Source : v_actions_du_jour (rétroplanning OPCO), v_dossiers_360 (complétude
   des pièces) et v_sessions_calendrier (formations en cours).
──────────────────────────────────────────────────────────────────────────── */

const JourneePage = {

  CRITICITE_COULEUR: {
    bloquante: 'var(--danger)',
    haute:     'var(--warning)',
    normale:   'var(--primary)',
    basse:     'var(--text-light)'
  },

  CRITICITE_LABEL: {
    bloquante: 'Bloquant', haute: 'Important', normale: 'À faire', basse: 'Quand possible'
  },

  async render() {
    const aujourdhui = new Date().toLocaleDateString('fr-FR',
      { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    document.getElementById('pageTitle').textContent    = 'Ma journée';
    document.getElementById('pageSubtitle').textContent = aujourdhui.charAt(0).toUpperCase() + aujourdhui.slice(1);
    document.getElementById('pageHeaderRight').innerHTML =
      `<button class="btn btn-sm btn-secondary" id="journeeRefresh">↻ Actualiser</button>`;
    document.getElementById('journeeRefresh')?.addEventListener('click', () => this.render());

    Loading.show();

    const iso    = d => d.toISOString().split('T')[0];
    const today  = iso(new Date());
    const dans7  = iso(new Date(Date.now() + 7 * 86400000));

    let actions = [], dossiers = [], sessions = [];
    try {
      [actions, dossiers, sessions] = await Promise.all([
        DataStore.getActionsDuJour(),
        DataStore.getDossiers360(),
        DataStore.getSessionsCalendrier(today, dans7)
      ]);
    } catch (err) {
      document.getElementById('pageContent').innerHTML = `
        <div class="empty-state" style="padding:60px 0;">
          <div class="empty-icon">⚠️</div>
          <div style="font-size:15px;font-weight:600;color:var(--danger);margin-bottom:6px;">Erreur de chargement</div>
          <div>${err.message || 'Vérifiez votre connexion et réessayez.'}</div>
        </div>`;
      return;
    }

    const j          = a => Number(a.jours_restants);
    const enRetard   = actions.filter(a => j(a) <  0);
    const dujour     = actions.filter(a => j(a) === 0);
    const semaine    = actions.filter(a => j(a) >  0 && j(a) <= 7);
    const plusTard   = actions.filter(a => j(a) >  7);
    const bloquantes = actions.filter(a => a.criticite === 'bloquante' && j(a) <= 7);

    const sessionsJour = sessions.filter(s => s.date_session === today);

    /* Dossiers dont le dépôt approche alors que les pièces manquent */
    const aCompleter = dossiers
      .filter(d => !d.pieces_completes
                && ['a_deposer', 'a_completer'].includes(d.statut_opco)
                && d.jours_avant_depot_limite !== null
                && Number(d.jours_avant_depot_limite) <= 30)
      .sort((a, b) => Number(a.jours_avant_depot_limite) - Number(b.jours_avant_depot_limite));

    document.getElementById('pageContent').innerHTML = `
      ${this._bandeau(bloquantes, enRetard)}

      <div class="stats-grid">
        ${this._tuile(enRetard.length, 'En retard',      'var(--danger)',  'à traiter en priorité')}
        ${this._tuile(dujour.length,   "Aujourd'hui",    'var(--warning)', 'échéance du jour')}
        ${this._tuile(semaine.length,  'Cette semaine',  'var(--primary)', 'sous 7 jours')}
        ${this._tuile(sessionsJour.length, 'Formations', 'var(--success, #10B981)',
                      sessionsJour.length ? 'en cours aujourd’hui' : 'aucune aujourd’hui')}
      </div>

      <div class="dashboard-grid" style="margin-top:20px;">

        <div style="display:flex;flex-direction:column;gap:20px;">
          ${this._bloc('🔴 En retard',      enRetard,  'Rien en retard — tout est à jour')}
          ${this._bloc("🟠 Aujourd'hui",    dujour,    'Aucune échéance aujourd’hui')}
          ${this._bloc('🔵 Cette semaine',  semaine,   'Rien sous 7 jours')}
          ${plusTard.length ? this._bloc('⚪ Plus tard', plusTard, '', true) : ''}
        </div>

        <div style="display:flex;flex-direction:column;gap:20px;">
          ${this._blocSessions(sessionsJour, sessions.filter(s => s.date_session > today))}
          ${this._blocPieces(aCompleter)}
        </div>

      </div>`;

    this._bind();
  },

  /* ── Bandeau d'alerte ── */
  _bandeau(bloquantes, enRetard) {
    if (!bloquantes.length && !enRetard.length) {
      return `
        <div style="background:rgba(16,185,129,.08);border-left:3px solid #10B981;padding:14px 16px;border-radius:8px;margin-bottom:20px;">
          <div style="font-size:14px;font-weight:600;color:#047857;">Rien d'urgent aujourd'hui</div>
          <div style="font-size:12.5px;color:var(--text-muted);margin-top:3px;">
            Aucun dépôt OPCO ni relance en attente. Bonne journée.
          </div>
        </div>`;
    }
    if (!bloquantes.length) return '';

    return `
      <div style="background:rgba(220,38,38,.07);border-left:3px solid var(--danger);padding:14px 16px;border-radius:8px;margin-bottom:20px;">
        <div style="font-size:14px;font-weight:700;color:var(--danger);">
          ${bloquantes.length} échéance${bloquantes.length > 1 ? 's' : ''} bloquante${bloquantes.length > 1 ? 's' : ''} sous 7 jours
        </div>
        <div style="font-size:12.5px;color:var(--text-muted);margin-top:3px;">
          Un délai de dépôt OPCO dépassé entraîne un refus systématique du dossier.
        </div>
        <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;">
          ${bloquantes.slice(0, 4).map(b => `
            <span style="font-size:11.5px;font-weight:600;background:var(--danger);color:#fff;padding:3px 9px;border-radius:12px;">
              ${esc(b.nom_entreprise || '')} — ${this._delai(Number(b.jours_restants))}
            </span>`).join('')}
        </div>
      </div>`;
  },

  /* ── Tuile de compteur ── */
  _tuile(valeur, label, couleur, sous) {
    return `
      <div class="stat-card">
        <div class="stat-content">
          <div class="stat-value" style="color:${valeur > 0 ? couleur : 'var(--text-light)'};">${valeur}</div>
          <div class="stat-label">${label}</div>
          <div class="stat-sub">${sous}</div>
        </div>
      </div>`;
  },

  _delai(j) {
    if (j < 0)  return `${Math.abs(j)} j de retard`;
    if (j === 0) return "aujourd'hui";
    return `dans ${j} j`;
  },

  /* ── Bloc d'échéances ── */
  _bloc(titre, items, vide, replie = false) {
    if (!items.length && !vide) return '';

    const corps = items.length
      ? `<div class="tache-list">${items.map(a => this._ligne(a)).join('')}</div>`
      : `<div class="empty-state" style="padding:22px 0;"><div class="empty-icon">✅</div>${vide}</div>`;

    return `
      <div class="section-card">
        <div class="section-card-header">
          <div class="section-card-title">${titre}</div>
          ${items.length ? `<span style="font-size:12px;color:var(--text-muted);">${items.length}</span>` : ''}
        </div>
        <div class="section-card-body">
          ${replie && items.length > 5
            ? `${items.slice(0, 5).map(a => this._ligne(a)).join('')}
               <div style="font-size:12px;color:var(--text-muted);padding-top:10px;text-align:center;">
                 + ${items.length - 5} autre${items.length - 5 > 1 ? 's' : ''}
               </div>`
            : corps}
        </div>
      </div>`;
  },

  _ligne(a) {
    const jours   = Number(a.jours_restants);
    const couleur = jours < 0 ? 'var(--danger)' : (this.CRITICITE_COULEUR[a.criticite] || 'var(--text)');

    return `
      <div class="tache-item" data-id="${a.id}">
        <button class="tache-check" data-action="faire-echeance" data-id="${a.id}" title="Marquer comme traité">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </button>
        <div style="flex:1;min-width:0;">
          <div style="font-size:13.5px;font-weight:600;color:var(--text);">${esc(a.libelle || '')}</div>
          <div style="font-size:11.5px;color:var(--text-muted);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            ${esc(a.nom_entreprise || '')}${a.sujet_formation ? ` · ${esc(a.sujet_formation)}` : ''}${a.opco_label ? ` · ${esc(a.opco_label)}` : ''}
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div style="font-size:12px;font-weight:700;color:${couleur};">${this._delai(jours)}</div>
          <div style="font-size:11px;color:var(--text-muted);">${_fmtDate(a.date_echeance)}</div>
        </div>
      </div>`;
  },

  /* ── Formations ── */
  _blocSessions(dujour, aVenir) {
    const ligne = (s, badge) => `
      <div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--border-light);">
        <div style="width:4px;height:38px;border-radius:2px;background:${s.opco_couleur || 'var(--primary)'};flex-shrink:0;"></div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:600;color:var(--navy);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(s.nom_entreprise || '')}</div>
          <div style="font-size:11.5px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            ${esc(s.sujet_formation || '')}${Number(s.nb_stagiaires) ? ` · ${s.nb_stagiaires} pers.` : ''}
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0;font-size:11.5px;color:var(--text-muted);">${badge}</div>
      </div>`;

    const heure = s => `${String(s.heure_debut).slice(0, 5)} – ${String(s.heure_fin).slice(0, 5)}`;

    return `
      <div class="section-card">
        <div class="section-card-header">
          <div class="section-card-title">📚 Formations</div>
        </div>
        <div class="section-card-body">
          ${dujour.length
            ? `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--text-light);margin-bottom:4px;">Aujourd'hui</div>
               ${dujour.map(s => ligne(s, heure(s))).join('')}`
            : `<div style="font-size:13px;color:var(--text-muted);padding:4px 0 10px;">Aucune session aujourd'hui.</div>`}

          ${aVenir.length
            ? `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--text-light);margin:14px 0 4px;">Sous 7 jours</div>
               ${aVenir.slice(0, 5).map(s => ligne(s, _fmtDate(s.date_session))).join('')}`
            : ''}
        </div>
      </div>`;
  },

  /* ── Pièces manquantes ── */
  _blocPieces(dossiers) {
    if (!dossiers.length) {
      return `
        <div class="section-card">
          <div class="section-card-header">
            <div class="section-card-title">📎 Pièces à réunir</div>
          </div>
          <div class="section-card-body">
            <div class="empty-state" style="padding:22px 0;"><div class="empty-icon">✅</div>Tous les dossiers à déposer sont complets</div>
          </div>
        </div>`;
    }

    return `
      <div class="section-card">
        <div class="section-card-header">
          <div class="section-card-title">📎 Pièces à réunir</div>
          <span style="font-size:12px;color:var(--text-muted);">${dossiers.length} dossier${dossiers.length > 1 ? 's' : ''}</span>
        </div>
        <div class="section-card-body">
          ${dossiers.slice(0, 6).map(d => {
            const jours   = Number(d.jours_avant_depot_limite);
            const couleur = jours < 0 ? 'var(--danger)' : jours <= 7 ? 'var(--warning)' : 'var(--text-muted)';
            const total   = Number(d.pieces_total) || 0;
            const ok      = Number(d.pieces_ok)    || 0;
            const pct     = total ? Math.round((ok / total) * 100) : 0;
            return `
              <div style="padding:10px 0;border-bottom:1px solid var(--border-light);">
                <div style="display:flex;justify-content:space-between;gap:10px;">
                  <div style="min-width:0;">
                    <div style="font-size:13px;font-weight:600;color:var(--navy);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(d.nom_entreprise || '')}</div>
                    <div style="font-size:11.5px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(d.sujet_formation || '')} · ${esc(d.opco_label || '')}</div>
                  </div>
                  <div style="text-align:right;flex-shrink:0;">
                    <div style="font-size:12px;font-weight:700;color:${couleur};">
                      ${jours < 0 ? `dépôt dépassé` : `dépôt ${this._delai(jours)}`}
                    </div>
                    <div style="font-size:11px;color:var(--text-muted);">${ok}/${total} pièces</div>
                  </div>
                </div>
                <div style="height:5px;background:var(--border);border-radius:3px;overflow:hidden;margin-top:7px;">
                  <div style="height:100%;width:${pct}%;background:${pct === 100 ? '#10B981' : couleur};border-radius:3px;transition:width .5s;"></div>
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>`;
  },

  _bind() {
    document.getElementById('pageContent')?.addEventListener('click', async e => {
      const btn = e.target.closest('[data-action="faire-echeance"]');
      if (!btn) return;
      btn.disabled = true;
      try {
        await DataStore.faireEcheance(btn.dataset.id);
        Toast.show('Action traitée', 'success');
        await this.render();
        updateJourneeBadge();
      } catch {
        btn.disabled = false;
        Toast.show('Erreur', 'error');
      }
    });
  }
};
