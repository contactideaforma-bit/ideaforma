/* ─── Dashboard ─── */
const Dashboard = {
  calendarDate:  new Date(),
  _eventsByDate: {},

  async render() {
    document.getElementById('pageTitle').textContent   = 'Tableau de bord';
    document.getElementById('pageSubtitle').textContent = 'Vue d\'ensemble de votre activité';
    document.getElementById('pageHeaderRight').innerHTML = '';
    Loading.show();

    /* Les agrégats viennent désormais de Postgres (vues v_dossiers_360,
       v_actions_du_jour, v_sessions_calendrier) au lieu d'être recalculés
       ici sur des objets « client » qui ne portaient ni prix ni statut. */
    const bornes = d => d.toISOString().split('T')[0];
    const depuis = bornes(new Date(Date.now() - 365 * 86400000));
    const jusqua = bornes(new Date(Date.now() + 365 * 86400000));

    let dossiers = [], taches = [], actions = [], sessions = [], nbClients = 0;
    try {
      [dossiers, taches, actions, sessions, nbClients] = await Promise.all([
        DataStore.getDossiers360(),
        DataStore.getTaches(),
        DataStore.getActionsDuJour(30),
        DataStore.getSessionsCalendrier(depuis, jusqua),
        DataStore.countClients()
      ]);
    } catch (err) {
      document.getElementById('pageContent').innerHTML =
        `<div class="empty-state" style="padding:60px 0;">
          <div class="empty-icon">⚠️</div>
          <div style="font-size:15px;font-weight:600;color:var(--danger);margin-bottom:6px;">Erreur de chargement</div>
          <div>${err.message || 'Vérifiez votre connexion et réessayez.'}</div>
        </div>`;
      return;
    }

    const upcoming = this._prochaines(sessions, 30);

    const actifs = dossiers.filter(d =>
      d.statut_facturation !== 'payee' && !['perdu','annule'].includes(d.statut_commercial));
    const caSigne = dossiers
      .filter(d => d.statut_commercial === 'devis_signe')
      .reduce((s, d) => s + (Number(d.prix) || 0), 0);
    const aEncaisser = dossiers.reduce((s, d) => s + (Number(d.reste_a_encaisser) || 0), 0);
    const enRetard   = actions.filter(a => a.horizon === 'en_retard').length;
    const aujourdhui = actions.filter(a => a.horizon === 'aujourd_hui').length;

    document.getElementById('pageContent').innerHTML = `
      <div class="stats-grid">
        ${this._statCard('orange', iconClock(),    'Dossiers en cours', actifs.length,
                         `${nbClients} client${nbClients > 1 ? 's' : ''} · ${dossiers.length} dossier${dossiers.length > 1 ? 's' : ''}`)}
        ${this._statCard('green',  iconEuro(),     'CA signé',          _fmtEuro(caSigne),
                         `${upcoming.length} formation${upcoming.length > 1 ? 's' : ''} sous 30 j`)}
        ${this._statCard('blue',   iconEuro(),     'Reste à encaisser', _fmtEuro(aEncaisser),
                         'factures non soldées')}
        ${this._statCard(enRetard ? 'red' : 'violet', iconClock(), 'Actions en retard', enRetard,
                         aujourdhui ? `${aujourdhui} à traiter aujourd'hui` : "rien pour aujourd'hui")}
      </div>

      <div class="dashboard-grid">
        <!-- Colonne gauche -->
        <div style="display:flex;flex-direction:column;gap:20px;">

          <div class="section-card">
            <div class="section-card-header">
              <div class="section-card-title">📅 Calendrier des formations</div>
              <div class="calendar-nav">
                <button id="calPrev" title="Mois précédent">‹</button>
                <span class="calendar-month-label" id="calLabel"></span>
                <button id="calNext" title="Mois suivant">›</button>
              </div>
            </div>
            <div class="section-card-body">
              <div id="calendarContent"></div>
              <div class="cal-legend" id="calLegend"></div>
            </div>
          </div>

          <div class="section-card">
            <div class="section-card-header">
              <div class="section-card-title">Formations à venir — 30 jours</div>
            </div>
            <div class="section-card-body">
              ${this._renderUpcoming(upcoming)}
            </div>
          </div>

        </div>

        <!-- Colonne droite -->
        <div style="display:flex;flex-direction:column;gap:20px;">

          <div class="section-card">
            <div class="section-card-header">
              <div class="section-card-title">✅ Tâches prioritaires</div>
              <button class="btn btn-sm btn-primary" id="addTacheBtn">+ Tâche</button>
            </div>
            <div class="section-card-body" id="tachesBody">
              ${this._renderTaches(taches)}
            </div>
          </div>

          <div class="section-card">
            <div class="section-card-header">
              <div class="section-card-title">⚡ Actions du jour</div>
              <button class="btn btn-sm btn-secondary" id="voirJourneeBtn">Tout voir (${actions.length})</button>
            </div>
            <div class="section-card-body" id="actionsBody">
              ${this._renderActions(actions)}
            </div>
          </div>

          <div class="section-card">
            <div class="section-card-header">
              <div class="section-card-title">Répartition par OPCO</div>
            </div>
            <div class="section-card-body">
              ${this._renderOpcoBars(dossiers)}
            </div>
          </div>

          <div class="section-card">
            <div class="section-card-header">
              <div class="section-card-title">Statuts en cours</div>
            </div>
            <div class="section-card-body">
              ${this._renderStatusSummary(dossiers)}
            </div>
          </div>

        </div>
      </div>
    `;

    this._renderCalendar(sessions);

    document.getElementById('calPrev').addEventListener('click', () => {
      this.calendarDate = new Date(this.calendarDate.getFullYear(), this.calendarDate.getMonth() - 1, 1);
      this._renderCalendar(sessions);
    });
    document.getElementById('calNext').addEventListener('click', () => {
      this.calendarDate = new Date(this.calendarDate.getFullYear(), this.calendarDate.getMonth() + 1, 1);
      this._renderCalendar(sessions);
    });

    document.getElementById('addTacheBtn')?.addEventListener('click', () => this._openAddTache(taches));
    this._bindTacheActions(taches);
    this._bindActions();
    document.getElementById('voirJourneeBtn')?.addEventListener('click', () => Router.navigate('journee'));
  },

  /* ── Prochaines formations : une entrée par dossier ── */
  _prochaines(sessions, jours = 30) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const limite = new Date(today.getTime() + jours * 86400000);
    const parDossier = new Map();

    sessions
      .filter(s => {
        const d = new Date(s.date_session + 'T00:00:00');
        return d >= today && d <= limite;
      })
      .sort((a, b) => a.date_session.localeCompare(b.date_session))
      .forEach(s => { if (!parDossier.has(s.dossier_id)) parDossier.set(s.dossier_id, s); });

    return [...parDossier.values()];
  },

  /* ── Stats card ── */
  _statCard(color, icon, label, value, sub) {
    return `
      <div class="stat-card">
        <div class="stat-icon ${color}">${icon}</div>
        <div class="stat-content">
          <div class="stat-value">${value}</div>
          <div class="stat-label">${label}</div>
          <div class="stat-sub">${sub}</div>
        </div>
      </div>`;
  },

  /* ── Calendrier ──
     Alimenté par v_sessions_calendrier : une ligne = une journée de formation.
     Plus besoin de dérouler les périodes jsonb côté navigateur. */
  _renderCalendar(sessions) {
    const year  = this.calendarDate.getFullYear();
    const month = this.calendarDate.getMonth();

    document.getElementById('calLabel').textContent =
      new Date(year, month, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

    const OPCO_COLORS = {
      opco_commerce: '#3B82F6', opco_mobilite: '#8B5CF6',
      akto: '#10B981', constructys: '#F59E0B', opco_ep: '#EC4899'
    };

    // Index dateStr → sessions
    this._eventsByDate = {};
    (sessions || []).forEach(s => {
      const key = s.date_session;
      if (!key) return;
      (this._eventsByDate[key] ||= []).push(s);
    });

    const today      = new Date();
    let   startDow   = new Date(year, month, 1).getDay();
    startDow         = startDow === 0 ? 6 : startDow - 1;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    let html = '<div class="calendar-grid">';
    ['L','M','M','J','V','S','D'].forEach(h => { html += `<div class="cal-day-header">${h}</div>`; });
    for (let i = 0; i < startDow; i++) { html += `<div class="cal-day other-month"></div>`; }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr  = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const events   = this._eventsByDate[dateStr] || [];
      const isToday  = today.getFullYear()===year && today.getMonth()===month && today.getDate()===day;
      const hasEvent = events.length > 0;

      let cls = 'cal-day';
      if (isToday)       cls += ' today';
      else if (hasEvent) cls += ' has-event';

      const dots = hasEvent
        ? `<div class="cal-dots">${events.slice(0,3).map(e =>
            `<div class="cal-dot" style="background:${isToday?'white':(OPCO_COLORS[e.opco_code]||'var(--primary)')}"></div>`
          ).join('')}</div>` : '';

      html += `<div class="${cls}"${hasEvent?` data-date="${dateStr}"`:''}>${day}${dots}</div>`;
    }
    html += '</div>';

    const container = document.getElementById('calendarContent');
    container.innerHTML = html;
    container.onclick = e => {
      const cell = e.target.closest('[data-date]');
      if (!cell) return;
      const evts = this._eventsByDate[cell.dataset.date] || [];
      if (evts.length) this._showDayEvents(cell.dataset.date, evts, OPCO_COLORS);
    };

    // Légende (OPCOs visibles ce mois)
    const monthPfx    = `${year}-${String(month+1).padStart(2,'0')}`;
    const usedOpcos   = [...new Set(
      Object.entries(this._eventsByDate)
        .filter(([k]) => k.startsWith(monthPfx))
        .flatMap(([, evts]) => evts.map(e => e.opco_code))
    )];
    const OPCO_LABELS = { opco_commerce:'OPCO Commerce', opco_mobilite:'OPCO Mobilité',
      akto:'AKTO', constructys:'Constructys', opco_ep:'OPCO EP' };

    document.getElementById('calLegend').innerHTML = usedOpcos.length
      ? usedOpcos.map(op => `
          <div class="cal-legend-item">
            <div class="cal-legend-dot" style="background:${OPCO_COLORS[op]}"></div>
            ${OPCO_LABELS[op]||op}
          </div>`).join('')
      : `<span style="font-size:12px;color:var(--text-light);">Aucune formation ce mois</span>`;
  },

  _showDayEvents(dateStr, events, colors) {
    const OPCO_LABELS = { opco_commerce:'OPCO Commerce', opco_mobilite:'OPCO Mobilité',
      akto:'AKTO', constructys:'Constructys', opco_ep:'OPCO EP' };
    const label = new Date(dateStr+'T00:00:00').toLocaleDateString('fr-FR',
      { weekday:'long', day:'numeric', month:'long', year:'numeric' });

    Modal.open(`📅 ${label.charAt(0).toUpperCase()+label.slice(1)}`,
      `<div style="font-size:13px;color:var(--text-muted);margin-bottom:14px;">
        ${events.length} formation${events.length>1?'s':''} prévue${events.length>1?'s':''} ce jour
       </div>
       ${events.map(e => `
        <div style="display:flex;gap:12px;align-items:flex-start;padding:12px 0;border-bottom:1px solid var(--border-light);">
          <div style="width:4px;min-height:44px;border-radius:2px;background:${colors[e.opco_code]||'var(--primary)'};flex-shrink:0;margin-top:2px;"></div>
          <div>
            <div style="font-weight:600;font-size:14px;color:var(--navy);">${e.nom_entreprise}</div>
            <div style="font-size:13px;color:var(--text-muted);margin-top:3px;">${e.sujet_formation}</div>
            <div style="font-size:12px;font-weight:600;margin-top:5px;color:${colors[e.opco_code]||'var(--primary)'};">${e.opco_label||OPCO_LABELS[e.opco_code]||e.opco_code}</div>
          </div>
        </div>`).join('')}`,
      [{ label:'Fermer', cls:'btn btn-secondary', action: () => Modal.close() }],
      'modal-sm'
    );
  },

  /* ── Upcoming ── */
  _renderUpcoming(upcoming) {
    if (!upcoming.length)
      return `<div class="empty-state"><div class="empty-icon">📅</div>Aucune formation dans les 30 prochains jours</div>`;

    const colors = { opco_commerce:'#3B82F6', opco_mobilite:'#8B5CF6',
      akto:'#10B981', constructys:'#F59E0B', opco_ep:'#EC4899' };

    return upcoming.slice(0, 8).map(f => {
      const color    = f.opco_couleur || colors[f.opco_code] || 'var(--primary)';
      const daysLeft = Math.ceil((new Date(f.date_session+'T00:00:00') - new Date()) / 86400000);
      const urgentC  = daysLeft <= 3 ? 'var(--danger)' : daysLeft <= 7 ? 'var(--warning)' : 'var(--text)';
      const nb       = Number(f.nb_stagiaires) || 0;
      return `
        <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border-light);">
          <div style="width:4px;height:40px;border-radius:2px;background:${color};flex-shrink:0;"></div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;font-size:13px;color:var(--navy);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(f.nom_entreprise || '')}</div>
            <div style="font-size:12px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(f.sujet_formation || '')}${nb ? ` · ${nb} pers.` : ''}</div>
          </div>
          <div style="text-align:right;flex-shrink:0;">
            <div style="font-size:13px;font-weight:700;color:${urgentC};">${daysLeft <= 0 ? "Aujourd'hui" : 'J-' + daysLeft}</div>
            <div style="font-size:11px;color:var(--text-muted);">${_fmtDate(f.date_session)}</div>
          </div>
        </div>`;
    }).join('');
  },

  /* ── Actions du jour ──
     Alimenté par v_actions_du_jour : rétroplanning OPCO, relances, émargements,
     facturation. Remplace les deux règles d'alerte calculées côté navigateur. */
  _renderActions(actions) {
    if (!actions.length)
      return `<div class="empty-state"><div class="empty-icon">✅</div>Rien à traiter — tout est à jour</div>`;

    const couleur = {
      bloquante: 'var(--danger)', haute: 'var(--warning)',
      normale:   'var(--primary)', basse: 'var(--text-light)'
    };
    const echeanceLabel = j =>
      j < 0 ? `${Math.abs(j)} j de retard` : j === 0 ? "Aujourd'hui" : `J-${j}`;

    return `<div class="tache-list">
      ${actions.slice(0, 8).map(a => {
        const j       = Number(a.jours_restants);
        const retard  = j < 0;
        const couleurC = retard ? 'var(--danger)' : couleur[a.criticite] || 'var(--text)';
        return `
          <div class="tache-item" data-id="${a.id}">
            <button class="tache-check" data-action="faire-echeance" data-id="${a.id}" title="Marquer comme traité">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </button>
            <div style="flex:1;min-width:0;">
              <div style="font-size:13.5px;font-weight:500;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(a.libelle || '')}</div>
              <div style="font-size:11px;margin-top:2px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                ${esc(a.nom_entreprise || '')}${a.opco_label ? ` · ${esc(a.opco_label)}` : ''}
              </div>
            </div>
            <div style="text-align:right;flex-shrink:0;">
              <div style="font-size:12px;font-weight:700;color:${couleurC};">${echeanceLabel(j)}</div>
              <div style="font-size:11px;color:var(--text-muted);">${_fmtDate(a.date_echeance)}</div>
            </div>
          </div>`;
      }).join('')}
    </div>`;
  },

  _bindActions() {
    document.getElementById('actionsBody')?.addEventListener('click', async e => {
      const btn = e.target.closest('[data-action="faire-echeance"]');
      if (!btn) return;
      try {
        await DataStore.faireEcheance(btn.dataset.id);
        const fraiches = await DataStore.getActionsDuJour(30);
        document.getElementById('actionsBody').innerHTML = this._renderActions(fraiches);
        updateJourneeBadge();
        Toast.show('Action traitée', 'success');
      } catch { Toast.show('Erreur', 'error'); }
    });
  },

  /* ── Tâches ── */
  _renderTaches(taches) {
    const pending = taches.filter(t => !t.fait);
    if (!pending.length)
      return `<div class="empty-state"><div class="empty-icon">✅</div>Aucune tâche en cours</div>`;

    const priColor = { haute: 'var(--danger)', normale: 'var(--warning)', basse: 'var(--text-light)' };
    const priLabel = { haute: '●', normale: '●', basse: '●' };

    return `<div class="tache-list">
      ${pending.slice(0,10).map(t => {
        const overdue  = t.echeance && new Date(t.echeance+'T00:00:00') < new Date();
        const dateStr  = t.echeance ? _fmtDate(t.echeance) : '';
        return `
          <div class="tache-item" data-id="${t.id}">
            <button class="tache-check" data-action="toggle" data-id="${t.id}" title="Marquer comme fait">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </button>
            <div style="flex:1;min-width:0;">
              <div style="font-size:13.5px;font-weight:500;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${t.description}</div>
              ${dateStr ? `<div style="font-size:11px;margin-top:2px;color:${overdue?'var(--danger)':'var(--text-muted)'};">${overdue?'⚠ En retard — ':''}${dateStr}</div>` : ''}
            </div>
            <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
              <span style="color:${priColor[t.priorite]};font-size:16px;" title="${t.priorite}">${priLabel[t.priorite]}</span>
              <button class="btn-icon danger" data-action="delete-tache" data-id="${t.id}" title="Supprimer">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                </svg>
              </button>
            </div>
          </div>`;
      }).join('')}
    </div>`;
  },

  _bindTacheActions(taches) {
    document.getElementById('tachesBody')?.addEventListener('click', async e => {
      const btn  = e.target.closest('[data-action]');
      if (!btn) return;
      const id   = btn.dataset.id;
      const action = btn.dataset.action;

      if (action === 'toggle') {
        try {
          await DataStore.toggleTache(id);
          const fresh = await DataStore.getTaches();
          document.getElementById('tachesBody').innerHTML = this._renderTaches(fresh);
          this._bindTacheActions(fresh);
        } catch { Toast.show('Erreur', 'error'); }
      }
      if (action === 'delete-tache') {
        try {
          await DataStore.deleteTache(id);
          const fresh = await DataStore.getTaches();
          document.getElementById('tachesBody').innerHTML = this._renderTaches(fresh);
          this._bindTacheActions(fresh);
        } catch { Toast.show('Erreur', 'error'); }
      }
    });
  },

  _openAddTache(existingTaches) {
    Modal.open('Nouvelle tâche', `
      <div class="form-grid">
        <div class="field form-col-full">
          <label>Description *</label>
          <input type="text" id="tDesc" placeholder="Ex. Relancer OPCO Commerce pour accord…" />
        </div>
        <div class="field">
          <label>Priorité</label>
          <select id="tPrio">
            <option value="haute">🔴 Haute</option>
            <option value="normale" selected>🟡 Normale</option>
            <option value="basse">⚪ Basse</option>
          </select>
        </div>
        <div class="field">
          <label>Échéance</label>
          <input type="date" id="tDate" />
        </div>
      </div>`,
      [
        { label: 'Annuler',  cls: 'btn btn-secondary', action: () => Modal.close() },
        { label: 'Ajouter', cls: 'btn btn-primary', action: async () => {
          const desc = document.getElementById('tDesc').value.trim();
          if (!desc) { Toast.show('La description est requise', 'error'); return; }
          try {
            await DataStore.addTache({
              description: desc,
              priorite:    document.getElementById('tPrio').value,
              echeance:    document.getElementById('tDate').value || null
            });
            Toast.show('Tâche ajoutée', 'success');
            Modal.close();
            // Refresh taches section only
            const fresh = await DataStore.getTaches();
            document.getElementById('tachesBody').innerHTML = this._renderTaches(fresh);
            this._bindTacheActions(fresh);
          } catch { Toast.show('Erreur lors de l\'ajout', 'error'); }
        }}
      ]
    );
  },

  /* ── OPCO bars ──
     Compte les dossiers (et non les clients) et somme les prix réels. */
  _renderOpcoBars(dossiers) {
    const labels = { opco_commerce:'OPCO Commerce', opco_mobilite:'OPCO Mobilité',
      akto:'AKTO', constructys:'Constructys', opco_ep:'OPCO EP' };
    const colors = { opco_commerce:'#3B82F6', opco_mobilite:'#8B5CF6',
      akto:'#10B981', constructys:'#F59E0B', opco_ep:'#EC4899' };

    const rows = DataStore.OPCOS.map(op => {
      const lot = dossiers.filter(d => d.opco_code === op);
      return {
        opco:  op,
        label: lot[0]?.opco_label || labels[op] || op,
        count: lot.length,
        ca:    lot.reduce((s, d) => s + (Number(d.prix) || 0), 0)
      };
    });
    const max = Math.max(...rows.map(r => r.count), 1);

    return rows.map(({ opco, label, count, ca }) => `
      <div style="margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <span style="font-size:13px;font-weight:500;color:var(--text);">${label}</span>
          <span style="font-size:12px;color:var(--text-muted);">${count} dossier${count!==1?'s':''} — ${_fmtEuro(ca)}</span>
        </div>
        <div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden;">
          <div style="height:100%;width:${count===0?0:Math.max(4,(count/max)*100)}%;background:${colors[opco]};border-radius:3px;transition:width 0.6s;"></div>
        </div>
      </div>`).join('');
  },

  /* ── Statuts ──
     Lit les 4 axes de la migration v5 : un dossier peut être « formation
     terminée » et « facture impayée » en même temps, ce que l'ancien
     statut unique ne savait pas montrer. */
  _renderStatusSummary(dossiers) {
    if (!dossiers.length)
      return `<div class="empty-state"><div class="empty-icon">📋</div>Aucun dossier</div>`;

    const axes = [
      { titre: 'Commercial', champ: 'statut_commercial', valeurs: {
          brouillon:'Devis à faire', devis_envoye:'Devis envoyé', devis_signe:'Devis signé',
          perdu:'Perdu', annule:'Annulé' } },
      { titre: 'OPCO', champ: 'statut_opco', valeurs: {
          a_deposer:'À déposer', depose:'Déposé', en_instruction:'En instruction',
          accepte:'Accepté', refuse:'Refusé', a_completer:'À compléter', non_requis:'Non requis' } },
      { titre: 'Pédagogique', champ: 'statut_pedagogique', valeurs: {
          a_planifier:'À planifier', planifiee:'Planifiée', en_cours:'En cours',
          terminee:'Terminée', abandonnee:'Abandonnée' } },
      { titre: 'Facturation', champ: 'statut_facturation', valeurs: {
          non_facturable:'Pas encore', a_facturer:'À facturer', facturee:'Facturée',
          payee_partiel:'Payée en partie', payee:'Payée', impayee:'Impayée' } }
    ];

    const alerte = { a_completer:true, refuse:true, impayee:true, perdu:true };

    return axes.map(axe => {
      const lignes = Object.entries(axe.valeurs)
        .map(([cle, label]) => ({
          cle, label,
          n: dossiers.filter(d => d[axe.champ] === cle).length
        }))
        .filter(l => l.n > 0);

      if (!lignes.length) return '';

      return `
        <div style="margin-bottom:14px;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--text-light);margin-bottom:6px;">${axe.titre}</div>
          ${lignes.map(l => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border-light);">
              <span style="font-size:13px;color:${alerte[l.cle] ? 'var(--danger)' : 'var(--text)'};">${l.label}</span>
              <span style="font-size:14px;font-weight:700;color:var(--navy);">${l.n}</span>
            </div>`).join('')}
        </div>`;
    }).join('');
  }
};

/* ── Global helpers ── */
function _fmtEuro(n) {
  return new Intl.NumberFormat('fr-FR', { style:'currency', currency:'EUR', maximumFractionDigits:0 }).format(n||0);
}
function _fmtDate(str) {
  if (!str) return '';
  return new Date(str+'T00:00:00').toLocaleDateString('fr-FR', { day:'numeric', month:'short', year:'numeric' });
}

/* ── SVG icons ── */
function iconGrid() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
    <rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>
  </svg>`;
}
function iconClock() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>`;
}
function iconCalendar() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <rect x="3" y="4" width="18" height="18" rx="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
  </svg>`;
}
function iconEuro() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <line x1="12" y1="1" x2="12" y2="23"/>
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
  </svg>`;
}
