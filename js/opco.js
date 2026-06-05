/* ─── OPCO pages ─── */
const OpcoPage = {

  CONFIG: {
    opco_commerce: {
      label: 'OPCO Commerce', shortLabel: 'Commerce', color: '#3B82F6',
      sectors: 'Commerce de détail, grande distribution, bricolage, jardinerie, e-commerce',
      deadline: 'Dossier à déposer AVANT le démarrage de la formation',
      ceiling: '15 à 25 €/h HT selon accord de branche',
      contact: 'opcominternational.fr', phone: 'Voir site opcominternational.fr',
      documents: [
        'Convention de formation signée (2 exemplaires)',
        'Programme détaillé de la formation',
        'Devis signé par l\'employeur',
        'Attestation Qualiopi en cours de validité',
        'RIB de l\'organisme de formation',
        'Fiche d\'adhésion de l\'entreprise à OPCO Commerce'
      ],
      alerts: [
        'Vérifier l\'adhésion de l\'entreprise à OPCO Commerce avant tout dossier',
        'La TVA n\'est pas prise en charge — facturer HT',
        'Certains accords de branche imposent des plafonds spécifiques'
      ]
    },
    opco_mobilite: {
      label: 'OPCO Mobilité', shortLabel: 'Mobilité', color: '#8B5CF6',
      sectors: 'Transport routier de voyageurs et de marchandises, automobile, location de véhicules, voyagistes',
      deadline: 'Dossier complet à soumettre minimum 15 jours avant le démarrage',
      ceiling: '25 à 40 €/h HT selon CPNE et type de formation',
      contact: 'opcoemobilite.fr', phone: 'Voir site opcoemobilite.fr',
      documents: [
        'Convention de formation signée',
        'Programme pédagogique détaillé',
        'Devis signé par l\'employeur',
        'Attestation Qualiopi valide',
        'Numéro SIRET de l\'entreprise (vérification adhésion)',
        'Liste nominative des salariés à former'
      ],
      alerts: [
        'Pour toute formation > 5 000 € : accord préalable OPCO Mobilité obligatoire',
        'Distinguer formations réglementaires (FCO, FIMO) et formations qualifiantes',
        'Respecter impérativement le délai de 15 jours — dossier refusé si tardif'
      ]
    },
    akto: {
      label: 'AKTO', shortLabel: 'AKTO', color: '#10B981',
      sectors: 'Hôtellerie, restauration, tourisme, sport, loisirs, services à la personne, propreté',
      deadline: 'Dossier complet à soumettre avant le démarrage de la formation',
      ceiling: '15 à 35 €/h HT selon type de formation et taille de l\'entreprise',
      contact: 'akto.fr', phone: '09 80 80 10 00',
      documents: [
        'Devis signé par le représentant légal',
        'Convention de formation (signée par les deux parties)',
        'Programme pédagogique détaillé',
        'Attestation Qualiopi en cours de validité',
        'Fiche de renseignements de l\'entreprise (adhérent AKTO)',
        'Liste nominative des salariés concernés avec intitulés de postes'
      ],
      alerts: [
        'Vérifier impérativement l\'adhésion AKTO — sinon refus automatique',
        'Les TPE (< 11 salariés) bénéficient de taux de prise en charge majorés',
        'Les formations en alternance relèvent d\'un circuit distinct — ne pas mélanger'
      ]
    },
    constructys: {
      label: 'Constructys', shortLabel: 'Constructys', color: '#F59E0B',
      sectors: 'Bâtiment, travaux publics, négoce de matériaux de construction',
      deadline: '1 mois avant le démarrage de la formation — délai strict',
      ceiling: '12 à 28 €/h HT selon type de formation',
      contact: 'constructys.fr', phone: '01 55 68 70 00',
      documents: [
        'Devis signé par l\'employeur',
        'Programme pédagogique détaillé',
        'Attestation Qualiopi valide',
        'KBIS de moins de 3 mois',
        'Convention de formation signée',
        'Attestation de présence à fournir après chaque session'
      ],
      alerts: [
        'KBIS de moins de 3 mois obligatoire — à demander en amont',
        'Les attestations de présence sont une condition sine qua non du paiement',
        'Respecter le délai d\'1 mois — refus systématique si tardif'
      ]
    },
    opco_ep: {
      label: 'OPCO EP', shortLabel: 'EP', color: '#EC4899',
      sectors: 'Coiffure, esthétique-cosmétique, fleuristes, pompes funèbres, pressing, cordonnerie',
      deadline: 'Dossier à soumettre avant le démarrage de la formation',
      ceiling: '10 à 25 €/h HT selon accord de branche et taille d\'entreprise',
      contact: 'opcoep.fr', phone: '01 53 32 53 40',
      documents: [
        'Devis signé par l\'employeur',
        'Programme de formation détaillé',
        'Convention de formation signée par les deux parties',
        'Attestation Qualiopi en cours de validité',
        'Numéro adhérent OPCO EP (ou vérification via le site)'
      ],
      alerts: [
        'Certaines formations nécessitent un accord préalable — se renseigner au cas par cas',
        'Niveaux de prise en charge très variables selon taille d\'entreprise',
        'Pour les très petites structures (1-2 salariés), vérifier l\'éligibilité au fonds TPE'
      ]
    }
  },

  STATUS_LABELS: {
    devis_fait:          'Devis fait',
    devis_envoye:        'Devis envoyé',
    devis_signe:         'Devis signé',
    accepte_opco:        'Accepté OPCO',
    formation_en_cours:  'En formation',
    paye:                'Payé'
  },

  currentOpco:     null,
  currentTab:      'clients',
  searchQuery:     '',
  filterStatus:    '',
  _cachedClients:  [],

  /* ── Render page ── */
  async render(opco) {
    this.currentOpco = opco;
    const cfg = this.CONFIG[opco];

    document.getElementById('pageTitle').textContent    = cfg.label;
    document.getElementById('pageSubtitle').textContent = cfg.sectors.split(',')[0];
    document.getElementById('pageHeaderRight').innerHTML = `
      <button class="btn btn-primary" id="addClientBtn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:16px;height:16px;">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Ajouter un client
      </button>`;

    Loading.show();

    try {
      this._cachedClients = await DataStore.getClients(opco);
    } catch (err) {
      document.getElementById('pageContent').innerHTML =
        `<div class="empty-state" style="padding:60px 0;"><div class="empty-icon">⚠️</div>
         <div style="color:var(--danger);font-weight:600;">Erreur : ${err.message}</div></div>`;
      return;
    }

    const clients = this._cachedClients;
    const active  = clients.filter(c => c.status !== 'paye').length;
    const totalCA = clients.reduce((s, c) => s + c.price, 0);
    const paid    = clients.filter(c => c.status === 'paye').length;

    document.getElementById('pageContent').innerHTML = `
      <div class="opco-stats-row">
        <div class="opco-stat"><div class="opco-stat-value">${clients.length}</div><div class="opco-stat-label">Total clients</div></div>
        <div class="opco-stat"><div class="opco-stat-value">${active}</div><div class="opco-stat-label">En cours</div></div>
        <div class="opco-stat"><div class="opco-stat-value">${paid}</div><div class="opco-stat-label">Payés</div></div>
        <div class="opco-stat"><div class="opco-stat-value">${_fmtEuro(totalCA)}</div><div class="opco-stat-label">CA total</div></div>
      </div>

      <div class="opco-sub-nav">
        <div class="sub-nav-item ${this.currentTab==='clients'?'active':''}" data-tab="clients">
          📋 Clients (${clients.length})
        </div>
        <div class="sub-nav-item ${this.currentTab==='process'?'active':''}" data-tab="process">
          📌 Fiche OPCO
        </div>
      </div>

      <div id="tabContent"></div>`;

    document.querySelectorAll('.sub-nav-item').forEach(el => {
      el.addEventListener('click', () => {
        this.currentTab = el.dataset.tab;
        this.render(opco);
      });
    });

    if (this.currentTab === 'clients') this._renderClientsTab(opco);
    else this._renderProcessTab(opco);

    document.getElementById('addClientBtn')?.addEventListener('click', () => this.openClientForm(opco));
  },

  /* ── Clients tab ── */
  _renderClientsTab(opco) {
    document.getElementById('tabContent').innerHTML = `
      <div class="toolbar">
        <div class="search-input-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" class="search-input" id="searchInput"
            placeholder="Rechercher entreprise, salarié, sujet…" value="${esc(this.searchQuery)}" />
        </div>
        <select class="filter-select" id="statusFilter">
          <option value="">Tous les statuts</option>
          ${Object.entries(this.STATUS_LABELS).map(([k,v]) =>
            `<option value="${k}" ${this.filterStatus===k?'selected':''}>${v}</option>`
          ).join('')}
        </select>
      </div>
      <div id="clientTable"></div>`;

    document.getElementById('searchInput').addEventListener('input', e => {
      this.searchQuery = e.target.value;
      this._renderTable(opco);
    });
    document.getElementById('statusFilter').addEventListener('change', e => {
      this.filterStatus = e.target.value;
      this._renderTable(opco);
    });

    this._renderTable(opco);
  },

  _renderTable(opco) {
    let clients = this._cachedClients || [];
    const q = this.searchQuery.toLowerCase();
    if (q) clients = clients.filter(c =>
      c.companyName.toLowerCase().includes(q) ||
      c.trainingSubject.toLowerCase().includes(q) ||
      (c.trainees||[]).some(t => `${t.firstName} ${t.lastName}`.toLowerCase().includes(q))
    );
    if (this.filterStatus) clients = clients.filter(c => c.status === this.filterStatus);

    const el = document.getElementById('clientTable');

    if (!clients.length) {
      el.innerHTML = `
        <div class="table-wrap">
          <div class="empty-table">
            <div class="empty-table-icon">${this.searchQuery||this.filterStatus?'🔍':'📂'}</div>
            <div class="empty-table-title">${this.searchQuery||this.filterStatus?'Aucun résultat':'Aucun client'}</div>
            <div class="empty-table-sub">${this.searchQuery||this.filterStatus?'Modifiez vos critères':'Cliquez sur « Ajouter un client » pour commencer'}</div>
          </div>
        </div>`;
      return;
    }

    el.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Entreprise</th><th>Salarié(s)</th><th>Formation</th>
            <th>Date(s)</th><th>Prix HT</th><th>Statut</th><th></th>
          </tr></thead>
          <tbody>${clients.map(c => this._clientRow(c)).join('')}</tbody>
        </table>
      </div>`;

    el.querySelectorAll('[data-action="view"]').forEach(btn =>
      btn.addEventListener('click', () => this.openDetail(opco, btn.dataset.id)));
    el.querySelectorAll('[data-action="edit"]').forEach(btn =>
      btn.addEventListener('click', () => this.openClientForm(opco, btn.dataset.id)));
    el.querySelectorAll('[data-action="delete"]').forEach(btn =>
      btn.addEventListener('click', () => this.confirmDelete(opco, btn.dataset.id)));
    el.querySelectorAll('[data-action="status"]').forEach(btn =>
      btn.addEventListener('click', () => this.quickStatus(opco, btn.dataset.id)));
  },

  _clientRow(c) {
    const traineesStr = (c.trainees||[]).map(t => `${t.firstName} ${t.lastName}`).join(', ') || '—';
    const nd = (c.trainingDates||[]).find(d => d.start);
    const dateStr = nd ? _fmtDate(nd.start) + (nd.end&&nd.end!==nd.start?` → ${_fmtDate(nd.end)}`:'') : '—';
    return `
      <tr>
        <td>
          <div class="td-company">${esc(c.companyName)}</div>
          ${c.email?`<div class="td-company-email">${esc(c.email)}</div>`:''}
        </td>
        <td>${traineesStr.length>40?traineesStr.slice(0,40)+'…':esc(traineesStr)}</td>
        <td style="max-width:200px;"><div class="truncate">${esc(c.trainingSubject)||'—'}</div></td>
        <td class="td-dates">${dateStr}</td>
        <td class="td-price">${_fmtEuro(c.price)}</td>
        <td>
          <span class="badge badge-${c.status}" style="cursor:pointer;"
            data-action="status" data-id="${c.id}" title="Changer le statut">
            ${this.STATUS_LABELS[c.status]||c.status}
          </span>
        </td>
        <td>
          <div class="actions-cell">
            <button class="btn-icon" data-action="view" data-id="${c.id}" title="Voir">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </button>
            <button class="btn-icon" data-action="edit" data-id="${c.id}" title="Modifier">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="btn-icon danger" data-action="delete" data-id="${c.id}" title="Supprimer">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6"/><path d="M14 11v6"/>
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
            </button>
          </div>
        </td>
      </tr>`;
  },

  /* ── Process sheet ── */
  _renderProcessTab(opco) {
    const cfg = this.CONFIG[opco];
    document.getElementById('tabContent').innerHTML = `
      <div class="process-sheet">
        <div class="process-section">
          <div class="process-section-header"><span class="process-section-icon">🏢</span>
            <div class="process-section-title">Informations générales</div></div>
          <div class="process-section-body">
            <div class="process-grid">
              <div class="process-item"><div class="process-item-label">Secteurs</div><div class="process-item-value">${cfg.sectors}</div></div>
              <div class="process-item"><div class="process-item-label">Site web</div><div class="process-item-value" style="color:var(--primary);">${cfg.contact}</div></div>
              <div class="process-item"><div class="process-item-label">Téléphone</div><div class="process-item-value">${cfg.phone}</div></div>
              <div class="process-item"><div class="process-item-label">Plafond horaire</div><div class="process-item-value">${cfg.ceiling}</div></div>
            </div>
          </div>
        </div>
        <div class="process-section">
          <div class="process-section-header"><span class="process-section-icon">⏱️</span>
            <div class="process-section-title">Délais de dépôt</div></div>
          <div class="process-section-body">
            <div style="font-size:15px;font-weight:600;color:var(--navy);padding:8px 12px;background:var(--primary-light);border-radius:var(--radius);border-left:4px solid var(--primary);">
              ${cfg.deadline}
            </div>
          </div>
        </div>
        <div class="process-section">
          <div class="process-section-header"><span class="process-section-icon">📄</span>
            <div class="process-section-title">Documents requis</div></div>
          <div class="process-section-body">
            <div class="doc-list">
              ${cfg.documents.map(doc => `
                <div class="doc-item"><div class="doc-check">✓</div>${doc}</div>`).join('')}
            </div>
          </div>
        </div>
        <div class="process-section">
          <div class="process-section-header"><span class="process-section-icon">⚠️</span>
            <div class="process-section-title">Points d'attention</div></div>
          <div class="process-section-body" style="display:flex;flex-direction:column;gap:10px;">
            ${cfg.alerts.map(a => `
              <div class="alert-note"><div class="alert-note-icon">💡</div><div>${a}</div></div>`).join('')}
          </div>
        </div>
      </div>`;
  },

  /* ── Add / Edit form ── */
  openClientForm(opco, id = null) {
    const c    = id ? (this._cachedClients||[]).find(cl => cl.id === id) : null;
    const cfg  = this.CONFIG[opco];
    const isEdit = !!c;

    Modal.open(
      isEdit ? `Modifier — ${c.companyName}` : `Nouveau client — ${cfg.label}`,
      this._buildForm(c),
      [
        { label: 'Annuler',  cls: 'btn btn-secondary', action: () => Modal.close() },
        { label: isEdit ? 'Enregistrer' : 'Ajouter', cls: 'btn btn-primary',
          action: () => this._submitForm(opco, id) }
      ],
      'modal-lg'
    );
    this._initFormEvents();
  },

  _buildForm(c) {
    const trainees = c?.trainees?.length ? c.trainees : [{ firstName:'', lastName:'' }];
    const dates    = c?.trainingDates?.length ? c.trainingDates : [{ start:'', end:'' }];
    return `
      <form id="clientForm" novalidate>
        <div class="form-section">
          <div class="form-section-title">🏢 Coordonnées de l'entreprise</div>
          <div class="form-grid">
            <div class="field form-col-full"><label>Nom de l'entreprise *</label>
              <input type="text" name="companyName" value="${esc(c?.companyName)}" placeholder="Raison sociale" required /></div>
            <div class="field form-col-full"><label>Adresse</label>
              <input type="text" name="address" value="${esc(c?.address)}" placeholder="Adresse complète" /></div>
            <div class="field"><label>Téléphone</label>
              <input type="tel" name="phone" value="${esc(c?.phone)}" placeholder="01 23 45 67 89" /></div>
            <div class="field"><label>Email</label>
              <input type="email" name="email" value="${esc(c?.email)}" placeholder="rh@entreprise.fr" /></div>
            <div class="field"><label>SIRET</label>
              <input type="text" name="siret" value="${esc(c?.siret)}" placeholder="Ex. 12345678901234" maxlength="14" /></div>
            <div class="field"><label>Nombre de salariés</label>
              <input type="number" name="employees" value="${c?.employees||''}" placeholder="Ex. 12" min="1" /></div>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section-title">👤 Salarié(s) formé(s)</div>
          <div class="dynamic-list" id="traineeList">
            ${trainees.map((t,i) => this._traineeRow(t.firstName,t.lastName,i)).join('')}
          </div>
          <button type="button" class="btn-add-row" id="addTrainee">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Ajouter un salarié
          </button>
        </div>

        <div class="form-section">
          <div class="form-section-title">📚 Formation</div>
          <div class="form-grid">
            <div class="field form-col-full"><label>Sujet de la formation *</label>
              <input type="text" name="trainingSubject" value="${esc(c?.trainingSubject)}"
                placeholder="Ex. Management d'équipe, Excel avancé…" required /></div>
            <div class="field"><label>Prix (€ HT) *</label>
              <input type="number" name="price" value="${c?.price||''}" placeholder="Ex. 1500" min="0" step="0.01" required /></div>
          </div>
          <div style="margin-top:12px;">
            <div style="font-size:12.5px;font-weight:500;color:var(--text-muted);margin-bottom:8px;">Date(s) de formation</div>
            <div class="dynamic-list" id="dateList">
              ${dates.map((d,i) => this._dateRow(d.start,d.end,i)).join('')}
            </div>
            <button type="button" class="btn-add-row" id="addDate">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Ajouter une période
            </button>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section-title">🏷️ Statut du dossier</div>
          <div class="status-select-wrap" id="statusSelect">
            ${Object.entries(this.STATUS_LABELS).map(([k,v]) =>
              `<div class="status-option badge badge-${k} ${(c?.status||'devis_fait')===k?'selected':''}"
                    data-status="${k}">${v}</div>`
            ).join('')}
          </div>
          <input type="hidden" name="status" id="statusHidden" value="${c?.status||'devis_fait'}" />
        </div>

        <div class="form-section" style="margin-bottom:0;">
          <div class="form-section-title">📝 Notes</div>
          <div class="field">
            <textarea name="notes" placeholder="Informations complémentaires…">${esc(c?.notes)}</textarea>
          </div>
        </div>
      </form>`;
  },

  _traineeRow(fn='', ln='', idx) {
    return `<div class="dynamic-row" data-trainee="${idx}">
      <input type="text" placeholder="Prénom" data-field="firstName" value="${esc(fn)}" />
      <input type="text" placeholder="Nom"    data-field="lastName"  value="${esc(ln)}" />
      <button type="button" class="btn-remove-row">×</button>
    </div>`;
  },

  _dateRow(start='', end='', idx) {
    return `<div class="dynamic-row" data-date="${idx}">
      <input type="date" data-field="start" value="${start}" style="flex:1;" />
      <span style="font-size:13px;color:var(--text-muted);flex-shrink:0;">→</span>
      <input type="date" data-field="end"   value="${end}"   style="flex:1;" />
      <button type="button" class="btn-remove-row">×</button>
    </div>`;
  },

  _initFormEvents() {
    let traineeCount = document.querySelectorAll('#traineeList .dynamic-row').length;
    let dateCount    = document.querySelectorAll('#dateList .dynamic-row').length;

    document.getElementById('addTrainee')?.addEventListener('click', () => {
      document.getElementById('traineeList').insertAdjacentHTML('beforeend', this._traineeRow('','',traineeCount++));
      this._bindRemoveRows();
    });
    document.getElementById('addDate')?.addEventListener('click', () => {
      document.getElementById('dateList').insertAdjacentHTML('beforeend', this._dateRow('','',dateCount++));
      this._bindRemoveRows();
    });

    document.querySelectorAll('.status-option').forEach(opt => {
      opt.addEventListener('click', () => {
        document.querySelectorAll('.status-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        document.getElementById('statusHidden').value = opt.dataset.status;
      });
    });

    this._bindRemoveRows();
  },

  _bindRemoveRows() {
    document.querySelectorAll('.btn-remove-row').forEach(btn => {
      btn.onclick = () => {
        const row = btn.closest('.dynamic-row');
        if (row.parentElement.querySelectorAll('.dynamic-row').length > 1) row.remove();
      };
    });
  },

  async _submitForm(opco, id) {
    const form = document.getElementById('clientForm');
    const companyName     = form.querySelector('[name="companyName"]').value.trim();
    const trainingSubject = form.querySelector('[name="trainingSubject"]').value.trim();
    const price           = form.querySelector('[name="price"]').value;

    if (!companyName)     { Toast.show('Le nom de l\'entreprise est requis', 'error'); return; }
    if (!trainingSubject) { Toast.show('Le sujet de la formation est requis', 'error'); return; }

    const trainees = [];
    form.querySelectorAll('#traineeList .dynamic-row').forEach(row => {
      const fn = row.querySelector('[data-field="firstName"]').value.trim();
      const ln = row.querySelector('[data-field="lastName"]').value.trim();
      if (fn || ln) trainees.push({ firstName: fn, lastName: ln });
    });

    const trainingDates = [];
    form.querySelectorAll('#dateList .dynamic-row').forEach(row => {
      const start = row.querySelector('[data-field="start"]').value;
      const end   = row.querySelector('[data-field="end"]').value;
      if (start) trainingDates.push({ start, end });
    });

    const data = {
      companyName, trainingSubject, price, trainees, trainingDates,
      siret:   form.querySelector('[name="siret"]').value.trim(),
      address: form.querySelector('[name="address"]').value.trim(),
      phone:   form.querySelector('[name="phone"]').value.trim(),
      email:   form.querySelector('[name="email"]').value.trim(),
      employees: form.querySelector('[name="employees"]').value,
      status:  form.querySelector('[name="status"]').value,
      notes:   form.querySelector('[name="notes"]').value.trim()
    };

    // Disable save button during submit
    const saveBtn = document.getElementById('modalAction1');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Enregistrement…'; }

    try {
      if (id) {
        await DataStore.updateClient(opco, id, data);
        Toast.show('Dossier mis à jour', 'success');
      } else {
        await DataStore.addClient(opco, data);
        Toast.show('Client ajouté', 'success');
      }
      Modal.close();
      await this.render(opco);
      updateNavDots();
    } catch (err) {
      console.error(err);
      Toast.show('Erreur lors de la sauvegarde : ' + err.message, 'error');
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = id ? 'Enregistrer' : 'Ajouter'; }
    }
  },

  /* ── Detail modal ── */
  openDetail(opco, id) {
    const c = (this._cachedClients||[]).find(cl => cl.id === id);
    if (!c) return;
    const cfg = this.CONFIG[opco];

    Modal.open(`Fiche client — ${c.companyName}`, `
      <div>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;flex-wrap:wrap;">
          <span class="badge badge-${c.status}">${this.STATUS_LABELS[c.status]}</span>
          <span style="font-size:12px;color:var(--text-muted);">
            Créé le ${new Date(c.createdAt).toLocaleDateString('fr-FR')} —
            Modifié le ${new Date(c.updatedAt).toLocaleDateString('fr-FR')}
          </span>
        </div>
        <div class="detail-section-title">🏢 Entreprise</div>
        <div class="detail-grid">
          <div class="detail-item"><div class="detail-label">Raison sociale</div><div class="detail-value">${esc(c.companyName)}</div></div>
          <div class="detail-item"><div class="detail-label">SIRET</div><div class="detail-value">${esc(c.siret)||'—'}</div></div>
          <div class="detail-item"><div class="detail-label">Salariés</div><div class="detail-value">${c.employees||'—'}</div></div>
          <div class="detail-item"><div class="detail-label">Adresse</div><div class="detail-value">${esc(c.address)||'—'}</div></div>
          <div class="detail-item"><div class="detail-label">Téléphone</div><div class="detail-value">${esc(c.phone)||'—'}</div></div>
          <div class="detail-item"><div class="detail-label">Email</div><div class="detail-value">${esc(c.email)||'—'}</div></div>
          <div class="detail-item"><div class="detail-label">OPCO</div><div class="detail-value" style="color:${cfg.color};font-weight:600;">${cfg.label}</div></div>
        </div>
        <div class="detail-section-title">👤 Salarié(s) formé(s)</div>
        <div style="margin-bottom:16px;">
          ${(c.trainees||[]).length
            ? c.trainees.map(t => `<span class="trainee-chip">👤 ${esc(t.firstName)} ${esc(t.lastName)}</span>`).join('')
            : '<span style="color:var(--text-muted);font-size:13px;">Aucun salarié renseigné</span>'}
        </div>
        <div class="detail-section-title">📚 Formation</div>
        <div class="detail-grid">
          <div class="detail-item" style="grid-column:1/-1;"><div class="detail-label">Sujet</div>
            <div class="detail-value" style="font-size:15px;">${esc(c.trainingSubject)||'—'}</div></div>
          <div class="detail-item"><div class="detail-label">Prix HT</div>
            <div class="detail-value" style="font-size:18px;font-weight:700;color:var(--navy);">${_fmtEuro(c.price)}</div></div>
        </div>
        <div style="margin-bottom:16px;">
          ${(c.trainingDates||[]).length
            ? c.trainingDates.map(d => `<span class="date-chip">📅 ${_fmtDate(d.start)}${d.end&&d.end!==d.start?` → ${_fmtDate(d.end)}`:''}</span>`).join('')
            : '<span style="color:var(--text-muted);font-size:13px;">Aucune date renseignée</span>'}
        </div>
        ${c.notes?`<div class="detail-section-title">📝 Notes</div>
          <div style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;font-size:13.5px;line-height:1.6;">
            ${esc(c.notes).replace(/\n/g,'<br>')}
          </div>`:''}

        <!-- ── Section Documents ── -->
        <div class="detail-section-title" style="margin-top:20px;">📄 Générer un document</div>
        <div class="doc-gen-grid" id="docGenGrid">
          <button class="doc-gen-btn" data-doc="devis">
            <span class="doc-gen-icon">📋</span>
            <span class="doc-gen-label">Devis</span>
            <span class="doc-gen-sub">Devis à envoyer</span>
          </button>
          <button class="doc-gen-btn" data-doc="convention">
            <span class="doc-gen-icon">📃</span>
            <span class="doc-gen-label">Convention</span>
            <span class="doc-gen-sub">Convention de formation</span>
          </button>
          <button class="doc-gen-btn" data-doc="presence">
            <span class="doc-gen-icon">✍️</span>
            <span class="doc-gen-label">Présences</span>
            <span class="doc-gen-sub">Feuilles d'émargement</span>
          </button>
          <button class="doc-gen-btn" data-doc="facture">
            <span class="doc-gen-icon">🧾</span>
            <span class="doc-gen-label">Facture</span>
            <span class="doc-gen-sub">Facture à l'OPCO</span>
          </button>
        </div>
      </div>`,
      [
        { label:'Fermer',   cls:'btn btn-secondary', action: () => Modal.close() },
        { label:'Modifier', cls:'btn btn-primary',   action: () => { Modal.close(); this.openClientForm(opco, id); } }
      ],
      'modal-lg'
    );

    // Bind document generation buttons
    setTimeout(() => {
      document.getElementById('docGenGrid')?.addEventListener('click', async e => {
        const btn = e.target.closest('[data-doc]');
        if (!btn) return;
        btn.disabled = true;
        btn.style.opacity = '0.6';
        try {
          switch (btn.dataset.doc) {
            case 'devis':      await Documents.genererDevis(c);            break;
            case 'convention': await Documents.genererConvention(c);       break;
            case 'presence':   await Documents.genererFeuillesPresence(c); break;
            case 'facture':    await Documents.genererFacture(c);          break;
          }
        } catch (err) {
          console.error(err);
          Toast.show('Erreur lors de la génération : ' + err.message, 'error');
        }
        btn.disabled = false;
        btn.style.opacity = '1';
      });
    }, 50);
  },

  /* ── Quick status change ── */
  quickStatus(opco, id) {
    const c = (this._cachedClients||[]).find(cl => cl.id === id);
    if (!c) return;
    const statuses = Object.keys(this.STATUS_LABELS);

    Modal.open('Changer le statut', `
      <div style="margin-bottom:8px;font-weight:600;">${esc(c.companyName)}</div>
      <div style="margin-bottom:16px;color:var(--text-muted);font-size:13px;">Sélectionnez le nouveau statut :</div>
      <div class="status-select-wrap" id="quickWrap">
        ${statuses.map(k => `
          <div class="status-option badge badge-${k} ${c.status===k?'selected':''}" data-status="${k}">
            ${this.STATUS_LABELS[k]}
          </div>`).join('')}
      </div>
      <input type="hidden" id="quickVal" value="${c.status}" />`,
      [
        { label: 'Annuler', cls: 'btn btn-secondary', action: () => Modal.close() },
        { label: 'Valider', cls: 'btn btn-primary', action: async () => {
          const newStatus = document.getElementById('quickVal').value;
          try {
            await DataStore.updateDossierStatus(id, newStatus);
            Toast.show(`Statut : ${this.STATUS_LABELS[newStatus]}`, 'success');
            Modal.close();
            await this.render(opco);
          } catch { Toast.show('Erreur', 'error'); }
        }}
      ],
      'modal-sm'
    );

    setTimeout(() => {
      document.querySelectorAll('#quickWrap .status-option').forEach(opt => {
        opt.addEventListener('click', () => {
          document.querySelectorAll('#quickWrap .status-option').forEach(o => o.classList.remove('selected'));
          opt.classList.add('selected');
          document.getElementById('quickVal').value = opt.dataset.status;
        });
      });
    }, 50);
  },

  /* ── Delete ── */
  confirmDelete(opco, id) {
    const c = (this._cachedClients||[]).find(cl => cl.id === id);
    if (!c) return;
    Modal.open('Confirmer la suppression', `
      <div style="text-align:center;padding:12px 0;">
        <div style="font-size:36px;margin-bottom:12px;">🗑️</div>
        <div style="font-size:16px;font-weight:600;color:var(--navy);margin-bottom:8px;">${esc(c.companyName)}</div>
        <div style="font-size:14px;color:var(--text-muted);">Cette action est irréversible.<br>Le dossier sera définitivement supprimé.</div>
      </div>`,
      [
        { label: 'Annuler',    cls: 'btn btn-secondary', action: () => Modal.close() },
        { label: 'Supprimer', cls: 'btn btn-danger', action: async () => {
          try {
            await DataStore.deleteClient(opco, id);
            Toast.show('Client supprimé', 'success');
            Modal.close();
            await this.render(opco);
            updateNavDots();
          } catch { Toast.show('Erreur lors de la suppression', 'error'); }
        }}
      ],
      'modal-sm'
    );
  },

  _fmtEuro(n) { return _fmtEuro(n); },
  _fmtDate(s) { return _fmtDate(s); }
};

/* ── Helper global ── */
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/"/g,'&quot;')
    .replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
