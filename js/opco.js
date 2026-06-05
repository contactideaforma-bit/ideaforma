/* ─── OPCO pages v2 — clients + formations séparés ─── */

const OpcoPage = {

  CONFIG: {
    opco_commerce: {
      label:'OPCO Commerce', shortLabel:'Commerce', color:'#3B82F6',
      sectors:'Commerce de détail, grande distribution, e-commerce, bricolage, jardinerie, sport',
      deadline:'Dossier à déposer AVANT le démarrage de la formation',
      ceiling:'15 à 25 €/h HT selon accord de branche',
      website:'https://www.opcominternational.fr',
      contact:'opcominternational.fr',
      phone:'09 69 32 99 08',
      documents:['Convention de formation signée (2 exemplaires)','Programme pédagogique détaillé','Devis signé par l\'employeur','Attestation Qualiopi en cours de validité','RIB de l\'organisme de formation','Fiche d\'adhésion de l\'entreprise à OPCO Commerce'],
      alerts:['Vérifier l\'adhésion de l\'entreprise à OPCO Commerce avant tout dossier','La TVA n\'est pas prise en charge — facturer HT uniquement','Certains accords de branche imposent des plafonds spécifiques par niveau'],
      tips:[
        '📌 Vérifier l\'adhésion sur le portail OPCO Commerce avant de signer quoi que ce soit — un non-adhérent = dossier refusé.',
        '💡 Les formations liées à la transition numérique, RSE et management sont prioritaires et souvent mieux financées.',
        '⚡ Pour la grande distribution (Leclerc, Carrefour…) : des accords d\'entreprise spécifiques existent — se renseigner auprès du contact RH.',
        '📝 L\'attestation de présence signée est indispensable pour déclencher le paiement — la préparer dès la création du dossier.',
        '🔄 Depuis 2024 : les dossiers CPF co-financés par l\'OPCO suivent un circuit distinct — ne pas mélanger avec les dossiers plan de développement.'
      ],
      thresholds:[
        'TPE < 11 salariés : taux de prise en charge bonifiés sur certains accords',
        'Plan de développement des compétences : 15-25€/h selon accord de branche',
        'Formations > 10 000 € HT : accord préalable recommandé',
        'Alternance et Pro-A : circuit et financements séparés'
      ],
      plafonds:[
        { type:'Plan de développement des compétences', taille:'TPE < 11 salariés', taux:'25 €/h', plafond:'1 500 € / formation', note:'Taux bonifiés selon accord de branche' },
        { type:'Plan de développement des compétences', taille:'PME 11–49 salariés', taux:'18 €/h', plafond:'1 000 € / formation', note:'' },
        { type:'Plan de développement des compétences', taille:'ETI / GE ≥ 50 salariés', taux:'15 €/h', plafond:'Sur devis', note:'Accord préalable recommandé > 10 000 €' },
        { type:'Pro-A (reconversion / promotion)', taille:'Tous effectifs', taux:'Jusqu\'à 30 €/h', plafond:'Selon accord de branche', note:'Circuit et dossier spécifiques' },
        { type:'Formations numérique & RSE (prioritaires)', taille:'TPE < 11 salariés', taux:'25 €/h', plafond:'2 000 € / formation', note:'Enveloppe dédiée 2024-2025' },
        { type:'Alternance / Apprentissage', taille:'Tous effectifs', taux:'NPEC branche', plafond:'Selon diplôme préparé', note:'Circuit dédié — conseillers spécialisés' }
      ]
    },
    opco_mobilite: {
      label:'OPCO Mobilité', shortLabel:'Mobilité', color:'#8B5CF6',
      sectors:'Transport routier (voyageurs, marchandises), déménagement, automobile, location, voyagistes, logistique urbaine',
      deadline:'Dossier complet à soumettre minimum 15 jours avant le démarrage',
      ceiling:'25 à 40 €/h HT selon CPNE et type de formation',
      website:'https://www.opcoemobilite.fr',
      contact:'opcoemobilite.fr',
      phone:'0970 816 816',
      documents:['Convention de formation signée','Programme pédagogique détaillé','Devis signé par l\'employeur','Attestation Qualiopi valide','Numéro SIRET de l\'entreprise (vérification adhésion)','Liste nominative des salariés à former'],
      alerts:['Pour toute formation > 5 000 € : accord préalable OPCO Mobilité obligatoire','Distinguer formations réglementaires (FCO, FIMO) et formations qualifiantes','Respecter impérativement le délai de 15 jours — dossier refusé si tardif'],
      tips:[
        '📌 Le délai de 15 jours est strict et non négociable — intégrer ce délai dès la planification avec le client.',
        '🚛 Distinguer les formations réglementaires (FCO, FIMO, ADR…) des formations qualifiantes : circuits et plafonds différents.',
        '💡 Les formations à la conduite économique et écologique (éco-conduite) sont très soutenues depuis la loi LOM.',
        '⚡ Pour les formations > 5 000 € : demander l\'accord préalable DÈS la signature du devis, pas après.',
        '📱 Le portail Extranet MyOPCO permet de suivre l\'état d\'avancement des dossiers en temps réel.'
      ],
      thresholds:[
        'Petites entreprises (< 50 salariés) : accès au fonds TPE-PME avec taux majorés',
        'FCO Marchandises/Voyageurs : prise en charge jusqu\'à 300€/jour/stagiaire',
        'Formations > 5 000 € : accord préalable obligatoire avant tout démarrage',
        'Pro-A et alternance : circuits dédiés avec conseillers spécialisés'
      ],
      plafonds:[
        { type:'FCO Marchandises (réglementaire)', taille:'Tous effectifs', taux:'300 €/j/stagiaire', plafond:'300 €/j/stagiaire', note:'Formation obligatoire — prise en charge prioritaire' },
        { type:'FCO Voyageurs (réglementaire)', taille:'Tous effectifs', taux:'300 €/j/stagiaire', plafond:'300 €/j/stagiaire', note:'Formation obligatoire — prise en charge prioritaire' },
        { type:'Plan de développement des compétences', taille:'TPE < 50 salariés', taux:'30–40 €/h', plafond:'Fonds TPE-PME dédié', note:'Délai dépôt : 15 j avant démarrage' },
        { type:'Plan de développement des compétences', taille:'PME 50–249 salariés', taux:'25–30 €/h', plafond:'Sur enveloppe annuelle', note:'Accord préalable obligatoire > 5 000 €' },
        { type:'Éco-conduite / Loi LOM', taille:'Tous effectifs', taux:'Financement majoré', plafond:'Selon dossier', note:'Formations très soutenues depuis 2023' },
        { type:'Pro-A & Alternance', taille:'Tous effectifs', taux:'NPEC CPNE', plafond:'Selon diplôme / CQP', note:'Circuit dédié — conseillers spécialisés' }
      ]
    },
    akto: {
      label:'AKTO', shortLabel:'AKTO', color:'#10B981',
      sectors:'Hôtellerie-restauration, tourisme, sport & loisirs, services à la personne, propreté, sécurité privée',
      deadline:'Dossier complet à soumettre avant le démarrage de la formation',
      ceiling:'15 à 35 €/h HT selon type de formation et taille de l\'entreprise',
      website:'https://www.akto.fr',
      contact:'akto.fr',
      phone:'09 80 80 10 00',
      documents:['Devis signé par le représentant légal','Convention de formation (signée par les deux parties)','Programme pédagogique détaillé','Attestation Qualiopi en cours de validité','Fiche de renseignements de l\'entreprise (adhérent AKTO)','Liste nominative des salariés avec intitulés de postes'],
      alerts:['Vérifier impérativement l\'adhésion AKTO — sinon refus automatique','Les TPE (< 11 salariés) bénéficient de taux de prise en charge majorés','Les formations en alternance relèvent d\'un circuit distinct'],
      tips:[
        '📌 L\'adhésion à AKTO est vérifiable directement sur akto.fr/adherents — toujours vérifier avant de signer.',
        '🍽️ Pour la restauration et l\'hôtellerie : des formations certifiantes (HACCP, hygiène alimentaire) bénéficient de financements spécifiques.',
        '💡 Les TPE de moins de 11 salariés ont accès à des enveloppes dédiées avec des taux nettement supérieurs.',
        '⚡ AKTO propose des "Kits formation" sectoriels prêts à l\'emploi — les référencer dans les objectifs facilite l\'instruction.',
        '🔄 La plateforme AKTO Connect permet la dématérialisation complète des dossiers — fortement recommandé pour accélérer les délais.'
      ],
      thresholds:[
        'TPE < 11 salariés : enveloppe dédiée, taux pouvant atteindre 35€/h',
        'PME 11-49 salariés : plan de développement standard 15-25€/h',
        'Formations certifiantes (HACCP, CQP) : financements bonifiés',
        'Alternance : prise en charge selon NPEC défini par la branche'
      ],
      plafonds:[
        { type:'Plan de développement des compétences', taille:'TPE < 11 salariés', taux:'35 €/h', plafond:'Enveloppe dédiée TPE', note:'Taux les plus élevés — à prioriser' },
        { type:'Plan de développement des compétences', taille:'PME 11–49 salariés', taux:'15–25 €/h', plafond:'1 200 € / formation', note:'' },
        { type:'Plan de développement des compétences', taille:'≥ 50 salariés', taux:'15 €/h', plafond:'Sur enveloppe annuelle', note:'' },
        { type:'HACCP / Hygiène alimentaire (certifiant)', taille:'Tous effectifs', taux:'Financement bonifié', plafond:'Jusqu\'à 100% du coût', note:'Formations certifiantes prioritaires 2024-2025' },
        { type:'CQP (Certificat de qualification professionnelle)', taille:'Tous effectifs', taux:'NPEC branche', plafond:'Selon CQP visé', note:'Circuit AKTO Connect — dématérialisé' },
        { type:'Alternance / Pro-A', taille:'Tous effectifs', taux:'NPEC branche', plafond:'Selon diplôme préparé', note:'Circuit dédié — distinct du plan de développement' }
      ]
    },
    constructys: {
      label:'Constructys', shortLabel:'Constructys', color:'#F59E0B',
      sectors:'Bâtiment, travaux publics, négoce de matériaux, génie civil, menuiserie, plomberie, électricité du bâtiment',
      deadline:'1 mois avant le démarrage de la formation — délai strict',
      ceiling:'12 à 28 €/h HT selon type de formation',
      website:'https://www.constructys.fr',
      contact:'constructys.fr',
      phone:'01 55 68 70 00',
      documents:['Devis signé par l\'employeur','Programme pédagogique détaillé','Attestation Qualiopi valide','KBIS de moins de 3 mois','Convention de formation signée','Attestation de présence à fournir après chaque session'],
      alerts:['KBIS de moins de 3 mois obligatoire — à demander en amont','Les attestations de présence sont une condition sine qua non du paiement','Respecter le délai d\'1 mois — refus systématique si tardif'],
      tips:[
        '📌 Demander le KBIS DÈS la signature du devis — délai de 3 mois très souvent oublié et cause de rejets.',
        '🏗️ Les formations habilitations (travaux en hauteur, CACES, électrique) sont hautement prioritaires et bien financées.',
        '💡 Constructys publie chaque année ses "thèmes prioritaires" — aligner les intitulés de formation dessus optimise les prises en charge.',
        '⚡ L\'attestation de présence doit être signée à chaque demi-journée — informer le client dès la création du dossier.',
        '🔄 Pour les chantiers multi-entreprises : chaque entreprise doit faire son propre dossier, même pour les mêmes salariés.'
      ],
      thresholds:[
        'Très petites entreprises (< 10 salariés) : fonds mutualisés spécifiques',
        'Formations sécurité (CACES, habilitations) : jusqu\'à 28€/h',
        'Plan de développement : 12-20€/h selon accord de branche BTP',
        'Alternance BTP : prise en charge NPEC variable selon diplôme préparé'
      ],
      plafonds:[
        { type:'Formations sécurité réglementaires (CACES, habilitations, travail en hauteur)', taille:'Tous effectifs', taux:'Jusqu\'à 28 €/h', plafond:'Thèmes prioritaires Constructys', note:'Toujours bien financées — à aligner sur thèmes annuels' },
        { type:'Plan de développement des compétences', taille:'TPE < 10 salariés', taux:'20–28 €/h', plafond:'Fonds mutualisés BTP', note:'KBIS < 3 mois obligatoire' },
        { type:'Plan de développement des compétences', taille:'PME 10–49 salariés', taux:'14–20 €/h', plafond:'Sur enveloppe annuelle', note:'Dépôt 1 mois avant démarrage' },
        { type:'Plan de développement des compétences', taille:'≥ 50 salariés', taux:'12–15 €/h', plafond:'Sur accord préalable', note:'' },
        { type:'Habilitations électriques (B0, H0, BR…)', taille:'Tous effectifs', taux:'Jusqu\'à 25 €/h', plafond:'Thèmes prioritaires', note:'Vérifier liste thèmes prioritaires annuels' },
        { type:'Alternance BTP', taille:'Tous effectifs', taux:'NPEC branche', plafond:'Selon diplôme préparé', note:'Chaque entreprise = dossier séparé' }
      ]
    },
    opco_ep: {
      label:'OPCO EP', shortLabel:'EP', color:'#EC4899',
      sectors:'Coiffure, esthétique-cosmétique, fleuristes, pompes funèbres, pressing, cordonnerie, blanchisserie',
      deadline:'Dossier à soumettre avant le démarrage de la formation',
      ceiling:'10 à 25 €/h HT selon accord de branche et taille d\'entreprise',
      website:'https://www.opcoep.fr',
      contact:'opcoep.fr',
      phone:'01 53 32 53 40',
      documents:['Devis signé par l\'employeur','Programme de formation détaillé','Convention de formation signée','Attestation Qualiopi en cours de validité','Numéro adhérent OPCO EP (ou vérification via le site)'],
      alerts:['Certaines formations nécessitent un accord préalable — se renseigner cas par cas','Niveaux de prise en charge très variables selon taille d\'entreprise','Pour les très petites structures (1-2 salariés), vérifier l\'éligibilité au fonds TPE'],
      tips:[
        '📌 Pour les structures de 1-2 salariés (très fréquent en coiffure/esthétique) : le fonds TPE est dédié avec des règles spécifiques.',
        '💅 Les formations BP Coiffure, CAP Esthétique et CQP ont des prises en charge NPEC dédiées — les prioriser dans les intitulés.',
        '💡 OPCO EP dispose de conseillers formation sectoriels — les contacter AVANT de monter un dossier complexe.',
        '⚡ Les formations liées à l\'hygiène et à la désinfection (post-COVID) restent bien financées en coiffure/esthétique.',
        '🔄 Le portail Mon Compte Formation permet aux salariés de cofinancer via CPF — option à proposer systématiquement.'
      ],
      thresholds:[
        'Micro-entreprises (1-2 salariés) : fonds TPE spécifique OPCO EP',
        'TPE < 11 salariés : taux bonifiés selon accord de branche',
        'BP Coiffure, CAP Esthétique, CQP : NPEC défini par branche professionnelle',
        'Formations > 3 000 € : accord préalable recommandé pour éviter les refus'
      ],
      plafonds:[
        { type:'Plan de développement des compétences', taille:'Micro (1–2 salariés)', taux:'Fonds TPE OPCO EP', plafond:'Enveloppe dédiée', note:'Règles spécifiques — contacter conseiller avant dossier' },
        { type:'Plan de développement des compétences', taille:'TPE < 11 salariés', taux:'25 €/h', plafond:'Taux bonifiés branche', note:'Vérifier adhésion OPCO EP avant tout dossier' },
        { type:'Plan de développement des compétences', taille:'PME 11–49 salariés', taux:'10–18 €/h', plafond:'1 000 € / formation', note:'' },
        { type:'BP Coiffure / CAP Esthétique', taille:'Tous effectifs', taux:'NPEC branche', plafond:'Selon diplôme préparé', note:'Prioriser ces intitulés dans les dossiers' },
        { type:'CQP sectoriels (coiffure, esthétique…)', taille:'Tous effectifs', taux:'NPEC branche', plafond:'Selon CQP visé', note:'Financements bonifiés — circuits dédiés' },
        { type:'Hygiène & désinfection', taille:'Tous effectifs', taux:'Financement bonifié', plafond:'Jusqu\'à 100% du coût', note:'Toujours bien financé en coiffure/esthétique' }
      ]
    }
  },

  STATUS_LABELS: {
    devis_fait:'Devis fait', devis_envoye:'Devis envoyé', devis_signe:'Devis signé',
    accepte_opco:'Accepté OPCO', formation_en_cours:'En formation', paye:'Payé'
  },

  MODALITE_LABELS: { presentiel:'Présentiel', distanciel:'Distanciel', mixte:'Mixte' },

  currentOpco:       null,
  currentTab:        'clients',
  searchQuery:       '',
  _cachedClients:    [],
  _expandedClients:  new Set(),

  /* ══════════════════════════════════════════════
     RENDER PAGE
  ══════════════════════════════════════════════ */
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
        Nouveau client
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

    const clients  = this._cachedClients;
    const allDoss  = clients.flatMap(c => c.dossiers || []);
    const active   = allDoss.filter(d => d.status !== 'paye').length;
    const totalCA  = allDoss.reduce((s, d) => s + d.price, 0);
    const paid     = allDoss.filter(d => d.status === 'paye').length;

    document.getElementById('pageContent').innerHTML = `
      <div class="opco-stats-row">
        <div class="opco-stat"><div class="opco-stat-value">${clients.length}</div><div class="opco-stat-label">Clients</div></div>
        <div class="opco-stat"><div class="opco-stat-value">${allDoss.length}</div><div class="opco-stat-label">Formations</div></div>
        <div class="opco-stat"><div class="opco-stat-value">${active}</div><div class="opco-stat-label">En cours</div></div>
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

    document.querySelectorAll('.sub-nav-item').forEach(el =>
      el.addEventListener('click', () => { this.currentTab = el.dataset.tab; this.render(opco); })
    );

    if (this.currentTab === 'clients') this._renderClientsTab(opco);
    else this._renderProcessTab(opco);

    document.getElementById('addClientBtn')?.addEventListener('click', () => this.openClientForm(opco));
  },

  /* ══════════════════════════════════════════════
     CLIENTS TAB
  ══════════════════════════════════════════════ */
  _renderClientsTab(opco) {
    document.getElementById('tabContent').innerHTML = `
      <div class="toolbar">
        <div class="search-input-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" class="search-input" id="searchInput"
            placeholder="Rechercher client, gérant, IDCC…" value="${esc(this.searchQuery)}" />
        </div>
      </div>
      <div id="clientList"></div>`;

    document.getElementById('searchInput').addEventListener('input', e => {
      this.searchQuery = e.target.value;
      this._renderClientList(opco);
    });

    this._renderClientList(opco);
  },

  _renderClientList(opco) {
    let clients = this._cachedClients || [];
    const q = this.searchQuery.toLowerCase();
    if (q) clients = clients.filter(c =>
      c.companyName.toLowerCase().includes(q) ||
      c.nomGerant.toLowerCase().includes(q) ||
      c.idcc.toLowerCase().includes(q) ||
      (c.dossiers||[]).some(d => d.trainingSubject.toLowerCase().includes(q))
    );

    const el = document.getElementById('clientList');
    if (!clients.length) {
      el.innerHTML = `
        <div class="table-wrap">
          <div class="empty-table">
            <div class="empty-table-icon">${this.searchQuery ? '🔍' : '🏢'}</div>
            <div class="empty-table-title">${this.searchQuery ? 'Aucun résultat' : 'Aucun client'}</div>
            <div class="empty-table-sub">${this.searchQuery ? 'Modifiez vos critères' : 'Cliquez sur « Nouveau client » pour commencer'}</div>
          </div>
        </div>`;
      return;
    }

    el.innerHTML = clients.map(c => this._clientCard(c)).join('');
    this._bindClientEvents(opco);
  },

  _clientCard(c) {
    const cfg       = this.CONFIG[c.opco] || this.CONFIG['opco_commerce'];
    const nbDoss    = (c.dossiers || []).length;
    const enCours   = (c.dossiers || []).filter(d => d.status !== 'paye').length;
    const totalCA   = (c.dossiers || []).reduce((s, d) => s + d.price, 0);
    const expanded  = this._expandedClients.has(c.id);

    return `
      <div class="client-card" data-client-id="${c.id}">
        <div class="client-card-header">
          <div class="client-card-main">
            <div class="client-card-name">${esc(c.companyName)}</div>
            <div class="client-card-meta">
              ${c.nomGerant ? `<span>👤 ${esc(c.nomGerant)}</span>` : ''}
              ${c.siret     ? `<span>🏛 ${esc(c.siret)}</span>` : ''}
              ${c.idcc      ? `<span>📋 IDCC ${esc(c.idcc)}</span>` : ''}
              ${c.employees ? `<span>👥 ${c.employees} sal.</span>` : ''}
              ${c.phone     ? `<span>📞 ${esc(c.phone)}</span>` : ''}
              ${c.email     ? `<span>✉️ ${esc(c.email)}</span>` : ''}
            </div>
          </div>
          <div class="client-card-stats">
            <div class="client-stat">
              <div class="client-stat-val" style="color:var(--primary)">${nbDoss}</div>
              <div class="client-stat-lbl">formation${nbDoss!==1?'s':''}</div>
            </div>
            <div class="client-stat">
              <div class="client-stat-val" style="color:var(--warning)">${enCours}</div>
              <div class="client-stat-lbl">en cours</div>
            </div>
            <div class="client-stat">
              <div class="client-stat-val" style="color:var(--success);font-size:13px;">${_fmtEuro(totalCA)}</div>
              <div class="client-stat-lbl">CA</div>
            </div>
          </div>
          <div class="client-card-actions">
            <button class="btn btn-sm btn-primary" data-action="add-dossier" data-id="${c.id}" title="Ajouter une formation">
              + Formation
            </button>
            <button class="btn-icon" data-action="edit-client" data-id="${c.id}" title="Modifier le client">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="btn-icon danger" data-action="delete-client" data-id="${c.id}" title="Supprimer">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6"/><path d="M14 11v6"/>
              </svg>
            </button>
            <button class="btn-icon toggle-dossiers ${expanded?'expanded':''}" data-action="toggle" data-id="${c.id}" title="${expanded?'Réduire':'Voir formations'}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="transition:transform 0.2s;transform:rotate(${expanded?'180':'0'}deg)">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="client-dossiers ${expanded?'open':''}" id="dossiers-${c.id}">
          ${this._renderDossiersList(c)}
        </div>
      </div>`;
  },

  _renderDossiersList(c) {
    if (!(c.dossiers||[]).length) {
      return `<div class="dossiers-empty">Aucune formation — cliquez sur <strong>+ Formation</strong> pour commencer</div>`;
    }
    return (c.dossiers || []).map(d => this._dossierRow(d, c)).join('');
  },

  _dossierRow(d, c) {
    const nd      = (d.trainingDates||[]).find(dt => dt.start);
    const dateStr = nd ? _fmtDate(nd.start) + (nd.end&&nd.end!==nd.start?` → ${_fmtDate(nd.end)}`:'') : '—';
    const nbSal   = (d.trainees||[]).length;
    const modaliteLabel = this.MODALITE_LABELS[d.modalite] || d.modalite;

    return `
      <div class="dossier-row">
        <div class="dossier-row-info">
          <div class="dossier-subject">${esc(d.trainingSubject)||'—'}</div>
          <div class="dossier-meta">
            <span>📅 ${dateStr}</span>
            <span>👤 ${nbSal} participant${nbSal!==1?'s':''}</span>
            <span>🎓 ${modaliteLabel}</span>
            <span class="td-price">${_fmtEuro(d.price)}</span>
          </div>
        </div>
        <div class="dossier-row-right">
          <span class="badge badge-${d.status}" style="cursor:pointer;"
            data-action="status-dossier" data-dossier-id="${d.id}" data-client-id="${c.id}">
            ${this.STATUS_LABELS[d.status]||d.status}
          </span>
          <div class="actions-cell">
            <button class="btn-icon" data-action="gen-docs" data-dossier-id="${d.id}" data-client-id="${c.id}" title="Générer documents">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
            </button>
            <button class="btn-icon" data-action="edit-dossier" data-dossier-id="${d.id}" data-client-id="${c.id}" title="Modifier">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="btn-icon danger" data-action="delete-dossier" data-dossier-id="${d.id}" data-client-id="${c.id}" title="Supprimer">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              </svg>
            </button>
          </div>
        </div>
      </div>`;
  },

  _bindClientEvents(opco) {
    const list = document.getElementById('clientList');
    if (!list) return;

    list.addEventListener('click', async e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action    = btn.dataset.action;
      const clientId  = btn.dataset.id || btn.dataset.clientId;
      const dossierId = btn.dataset.dossierId;

      switch (action) {
        case 'toggle': {
          if (this._expandedClients.has(clientId)) this._expandedClients.delete(clientId);
          else this._expandedClients.add(clientId);
          // Toggle animation
          const panel = document.getElementById(`dossiers-${clientId}`);
          const svg   = btn.querySelector('svg');
          if (panel) panel.classList.toggle('open');
          if (svg)   svg.style.transform = this._expandedClients.has(clientId) ? 'rotate(180deg)' : 'rotate(0deg)';
          break;
        }
        case 'add-dossier':
          this.openDossierForm(opco, clientId);
          break;
        case 'edit-client':
          this.openClientForm(opco, clientId);
          break;
        case 'delete-client':
          this.confirmDeleteClient(opco, clientId);
          break;
        case 'edit-dossier':
          this.openDossierForm(opco, clientId, dossierId);
          break;
        case 'delete-dossier':
          this.confirmDeleteDossier(opco, clientId, dossierId);
          break;
        case 'gen-docs':
          this.openDocMenu(opco, clientId, dossierId);
          break;
        case 'status-dossier':
          this.quickStatus(opco, clientId, dossierId);
          break;
      }
    });
  },

  /* ══════════════════════════════════════════════
     FORMULAIRE CLIENT
  ══════════════════════════════════════════════ */
  openClientForm(opco, id = null) {
    const c      = id ? (this._cachedClients||[]).find(cl => cl.id === id) : null;
    const cfg    = this.CONFIG[opco];
    const isEdit = !!c;

    Modal.open(
      isEdit ? `Modifier — ${c.companyName}` : `Nouveau client — ${cfg.label}`,
      this._buildClientForm(c),
      [
        { label:'Annuler',  cls:'btn btn-secondary', action: () => Modal.close() },
        { label: isEdit ? 'Enregistrer' : 'Créer le client', cls:'btn btn-primary',
          action: () => this._submitClientForm(opco, id) }
      ],
      'modal-lg'
    );
    this._initSalariesEvents();
  },

  _buildClientForm(c) {
    const salaries = c?.salaries?.length ? c.salaries : [{ firstName:'', lastName:'', poste:'' }];
    return `
      <form id="clientForm" novalidate>
        <div class="form-section">
          <div class="form-section-title">🏢 Coordonnées de l'entreprise</div>
          <div class="form-grid">
            <div class="field form-col-full"><label>Raison sociale *</label>
              <input type="text" name="companyName" value="${esc(c?.companyName)}" placeholder="Nom de la société" required /></div>
            <div class="field"><label>SIRET</label>
              <input type="text" name="siret" value="${esc(c?.siret)}" placeholder="14 chiffres" maxlength="14" /></div>
            <div class="field"><label>IDCC</label>
              <input type="text" name="idcc" value="${esc(c?.idcc)}" placeholder="Ex. 1979" /></div>
            <div class="field form-col-full"><label>Adresse</label>
              <input type="text" name="address" value="${esc(c?.address)}" placeholder="Adresse complète" /></div>
            <div class="field"><label>Téléphone</label>
              <input type="tel" name="phone" value="${esc(c?.phone)}" placeholder="01 23 45 67 89" /></div>
            <div class="field"><label>Email</label>
              <input type="email" name="email" value="${esc(c?.email)}" placeholder="contact@entreprise.fr" /></div>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section-title">👤 Représentant légal / Gérant</div>
          <div class="form-grid">
            <div class="field"><label>Nom du gérant *</label>
              <input type="text" name="nomGerant" value="${esc(c?.nomGerant)}" placeholder="Prénom Nom" /></div>
            <div class="field"><label>Nombre de salariés</label>
              <input type="number" name="employees" value="${c?.employees||''}" placeholder="Ex. 12" min="1" /></div>
          </div>
        </div>

        <div class="form-section" style="margin-bottom:0;">
          <div class="form-section-title">👥 Salariés de l'entreprise</div>
          <div class="dynamic-list" id="salaryList">
            ${salaries.map((s,i) => this._salaryRow(s.firstName, s.lastName, s.poste||'', i)).join('')}
          </div>
          <button type="button" class="btn-add-row" id="addSalary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Ajouter un salarié
          </button>
        </div>
      </form>`;
  },

  _salaryRow(fn='', ln='', poste='', idx) {
    return `<div class="dynamic-row" data-salary="${idx}">
      <input type="text" placeholder="Prénom"  data-field="firstName" value="${esc(fn)}" style="flex:1;" />
      <input type="text" placeholder="Nom"     data-field="lastName"  value="${esc(ln)}" style="flex:1;" />
      <input type="text" placeholder="Poste"   data-field="poste"     value="${esc(poste)}" style="flex:1.5;" />
      <button type="button" class="btn-remove-row">×</button>
    </div>`;
  },

  _initSalariesEvents() {
    let count = document.querySelectorAll('#salaryList .dynamic-row').length;
    document.getElementById('addSalary')?.addEventListener('click', () => {
      document.getElementById('salaryList').insertAdjacentHTML('beforeend', this._salaryRow('','','',count++));
      this._bindRemoveRows();
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

  async _submitClientForm(opco, id) {
    const form = document.getElementById('clientForm');
    const companyName = form.querySelector('[name="companyName"]').value.trim();
    if (!companyName) { Toast.show('La raison sociale est requise', 'error'); return; }

    const salaries = [];
    form.querySelectorAll('#salaryList .dynamic-row').forEach(row => {
      const fn    = row.querySelector('[data-field="firstName"]').value.trim();
      const ln    = row.querySelector('[data-field="lastName"]').value.trim();
      const poste = row.querySelector('[data-field="poste"]').value.trim();
      if (fn || ln) salaries.push({ firstName: fn, lastName: ln, poste });
    });

    const data = {
      companyName,
      siret:     form.querySelector('[name="siret"]').value.trim(),
      idcc:      form.querySelector('[name="idcc"]').value.trim(),
      address:   form.querySelector('[name="address"]').value.trim(),
      phone:     form.querySelector('[name="phone"]').value.trim(),
      email:     form.querySelector('[name="email"]').value.trim(),
      nomGerant: form.querySelector('[name="nomGerant"]').value.trim(),
      employees: form.querySelector('[name="employees"]').value,
      salaries
    };

    const btn = document.getElementById('modalAction1');
    if (btn) { btn.disabled = true; btn.textContent = 'Enregistrement…'; }

    try {
      if (id) { await DataStore.updateClient(id, data); Toast.show('Client mis à jour ✓', 'success'); }
      else    { await DataStore.addClient(opco, data);  Toast.show('Client créé ✓', 'success'); }
      Modal.close();
      await this.render(opco);
      updateNavDots();
    } catch (err) {
      Toast.show('Erreur : ' + err.message, 'error');
      if (btn) { btn.disabled = false; btn.textContent = id ? 'Enregistrer' : 'Créer le client'; }
    }
  },

  /* ══════════════════════════════════════════════
     FORMULAIRE DOSSIER (FORMATION)
  ══════════════════════════════════════════════ */
  openDossierForm(opco, clientId, dossierId = null) {
    const c = (this._cachedClients||[]).find(cl => cl.id === clientId);
    if (!c) return;
    const d      = dossierId ? (c.dossiers||[]).find(dos => dos.id === dossierId) : null;
    const isEdit = !!d;

    Modal.open(
      isEdit ? `Modifier formation — ${c.companyName}` : `Nouvelle formation — ${c.companyName}`,
      this._buildDossierForm(c, d),
      [
        { label:'Annuler', cls:'btn btn-secondary', action: () => Modal.close() },
        { label: isEdit ? 'Enregistrer' : 'Créer et générer documents', cls:'btn btn-primary',
          action: () => this._submitDossierForm(opco, clientId, dossierId) }
      ],
      'modal-lg'
    );
    this._initDossierFormEvents(c, d);
  },

  _buildDossierForm(c, d = null) {
    const trainees = d?.trainees?.length ? d.trainees : (c.salaries?.length ? c.salaries : [{ firstName:'', lastName:'' }]);
    const dates    = d?.trainingDates?.length ? d.trainingDates : [{ start:'', end:'' }];

    return `
      <form id="dossierForm" novalidate>

        <div class="form-section">
          <div class="form-section-title">👥 Participants à cette formation</div>
          <div class="dynamic-list" id="traineeList">
            ${trainees.map((t,i) => this._traineeRow(t.firstName, t.lastName, i)).join('')}
          </div>
          <button type="button" class="btn-add-row" id="addTrainee">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Ajouter un participant
          </button>
        </div>

        <div class="form-section">
          <div class="form-section-title" style="display:flex;align-items:center;justify-content:space-between;">
            <span>📚 Formation</span>
            <button type="button" class="btn-ai" id="aiAssistBtn">
              ✨ Assistance IA
            </button>
          </div>
          <div id="aiStatus" style="display:none;margin-bottom:10px;"></div>
          <div class="form-grid">
            <div class="field form-col-full"><label>Intitulé de la formation *</label>
              <input type="text" name="trainingSubject" id="trainingSubjectInput" value="${esc(d?.trainingSubject)}"
                placeholder="Ex. Management d'équipe, Excel avancé…" required /></div>
            <div class="field form-col-full">
              <label style="display:flex;align-items:center;justify-content:space-between;">
                Objectifs pédagogiques
                <button type="button" class="btn-reformuler" data-field="objectifs">↺ Reformuler</button>
              </label>
              <textarea name="objectifs" id="fieldObjectifs" rows="4"
                placeholder="À l'issue de la formation, le stagiaire sera capable de…">${esc(d?.objectifs)}</textarea></div>
            <div class="field form-col-full">
              <label style="display:flex;align-items:center;justify-content:space-between;">
                Programme / Contenu des modules
                <button type="button" class="btn-reformuler" data-field="contenu">↺ Reformuler</button>
              </label>
              <textarea name="contenu" id="fieldContenu" rows="5"
                placeholder="Module 1 : …&#10;Module 2 : …&#10;Module 3 : …">${esc(d?.contenu)}</textarea></div>
            <div class="field"><label>Modalité pédagogique</label>
              <select name="modalite">
                <option value="presentiel" ${(d?.modalite||'presentiel')==='presentiel'?'selected':''}>Présentiel</option>
                <option value="distanciel" ${d?.modalite==='distanciel'?'selected':''}>Distanciel</option>
                <option value="mixte"      ${d?.modalite==='mixte'?'selected':''}>Mixte (présentiel + distanciel)</option>
              </select></div>
            <div class="field">
              <label style="display:flex;align-items:center;justify-content:space-between;">
                Modalité d'évaluation
                <button type="button" class="btn-reformuler" data-field="evaluation">↺ Reformuler</button>
              </label>
              <input type="text" name="evaluation" id="fieldEvaluation" value="${esc(d?.evaluation)}"
                placeholder="Ex. QCM, mise en situation, entretien…" /></div>
            <div class="field form-col-full"><label>Prérequis</label>
              <input type="text" name="prerequis" id="fieldPrerequis" value="${esc(d?.prerequis)}"
                placeholder="Ex. Aucun prérequis / Maîtrise de base du français…" /></div>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section-title">📅 Dates et tarification</div>
          <div class="form-grid">
            <div class="field"><label>Prix HT (€) *</label>
              <input type="number" name="price" value="${d?.price||''}"
                placeholder="Ex. 1500" min="0" step="0.01" required /></div>
          </div>
          <div style="margin-top:10px;">
            <div style="font-size:12.5px;font-weight:500;color:var(--text-muted);margin-bottom:8px;">Dates de formation</div>
            <div class="dynamic-list" id="dateList">
              ${dates.map((dt,i) => this._dateRow(dt.start, dt.end, i)).join('')}
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
          <div class="form-section-title">🏷️ Statut</div>
          <div class="status-select-wrap" id="statusSelect">
            ${Object.entries(this.STATUS_LABELS).map(([k,v]) =>
              `<div class="status-option badge badge-${k} ${(d?.status||'devis_fait')===k?'selected':''}"
                    data-status="${k}">${v}</div>`
            ).join('')}
          </div>
          <input type="hidden" name="status" id="statusHidden" value="${d?.status||'devis_fait'}" />
        </div>

        <div class="form-section" style="margin-bottom:0;">
          <div class="form-section-title">📝 Notes internes</div>
          <div class="field">
            <textarea name="notes" rows="2" placeholder="Notes internes…">${esc(d?.notes)}</textarea>
          </div>
        </div>

        ${!d ? `
        <div class="form-section" style="margin-bottom:0;background:var(--primary-light);border-radius:var(--radius);padding:14px 16px;">
          <div class="form-section-title" style="margin-bottom:10px;">📄 Documents à générer automatiquement</div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <label style="display:flex;align-items:center;gap:8px;font-size:13.5px;cursor:pointer;">
              <input type="checkbox" name="genDevis" checked style="width:16px;height:16px;"> Devis
            </label>
            <label style="display:flex;align-items:center;gap:8px;font-size:13.5px;cursor:pointer;">
              <input type="checkbox" name="genProgramme" checked style="width:16px;height:16px;"> Programme pédagogique
            </label>
            <label style="display:flex;align-items:center;gap:8px;font-size:13.5px;cursor:pointer;">
              <input type="checkbox" name="genConvention" checked style="width:16px;height:16px;"> Convention de formation
            </label>
          </div>
        </div>` : ''}
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

  _initDossierFormEvents(c, d) {
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

    /* ── Assistance IA ── */
    document.getElementById('aiAssistBtn')?.addEventListener('click', async () => {
      const btn     = document.getElementById('aiAssistBtn');
      const subject = document.getElementById('trainingSubjectInput')?.value.trim();
      const status  = document.getElementById('aiStatus');

      if (!subject) { Toast.show('Renseignez d\'abord l\'intitulé de la formation', 'warning'); return; }

      btn.disabled = true;
      btn.textContent = '⏳ Génération…';
      if (status) {
        status.style.display = 'block';
        status.innerHTML = `<div class="ai-loading">
          <span class="ai-spinner"></span>
          <span>L'IA génère le contenu en tenant compte des exigences <strong>${this.CONFIG[this.currentOpco]?.label || 'OPCO'}</strong>…</span>
        </div>`;
      }

      try {
        const result = await AI.genererFormation(this.currentOpco, subject, c);
        if (result.objectifs)  document.getElementById('fieldObjectifs').value = result.objectifs;
        if (result.contenu)    document.getElementById('fieldContenu').value   = result.contenu;
        if (result.evaluation) document.getElementById('fieldEvaluation').value = result.evaluation;
        if (result.prerequis)  document.getElementById('fieldPrerequis').value  = result.prerequis;
        if (status) {
          status.innerHTML = `<div class="ai-success">
            ✅ Contenu généré par IA${result.duree ? ` — Durée suggérée : <strong>${result.duree}</strong>` : ''}.
            Vérifiez et ajustez si nécessaire.
          </div>`;
        }
        Toast.show('Contenu généré ✓', 'success');
      } catch (err) {
        if (status) {
          status.innerHTML = `<div class="ai-error">⚠️ ${err.message}</div>`;
        }
        Toast.show('Erreur IA : ' + err.message, 'error');
      }
      btn.disabled = false;
      btn.textContent = '✨ Assistance IA';
    });

    /* ── Boutons Reformuler ── */
    document.querySelectorAll('.btn-reformuler').forEach(btn => {
      btn.addEventListener('click', async () => {
        const field   = btn.dataset.field;
        const ids     = { objectifs:'fieldObjectifs', contenu:'fieldContenu', evaluation:'fieldEvaluation' };
        const el      = document.getElementById(ids[field]);
        const subject = document.getElementById('trainingSubjectInput')?.value.trim() || '';
        if (!el || !el.value.trim()) { Toast.show('Champ vide à reformuler', 'warning'); return; }

        btn.disabled = true; btn.textContent = '⏳…';
        try {
          const result = await AI.reformuler(field, el.value, this.currentOpco, subject);
          el.value = result;
          Toast.show('Reformulé ✓', 'success');
        } catch (err) { Toast.show('Erreur : ' + err.message, 'error'); }
        btn.disabled = false; btn.textContent = '↺ Reformuler';
      });
    });
  },

  async _submitDossierForm(opco, clientId, dossierId) {
    const c    = (this._cachedClients||[]).find(cl => cl.id === clientId);
    const form = document.getElementById('dossierForm');
    const trainingSubject = form.querySelector('[name="trainingSubject"]').value.trim();
    if (!trainingSubject) { Toast.show('L\'intitulé est requis', 'error'); return; }

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
      trainingSubject,
      trainees, trainingDates,
      price:      form.querySelector('[name="price"]').value,
      objectifs:  form.querySelector('[name="objectifs"]').value.trim(),
      contenu:    form.querySelector('[name="contenu"]').value.trim(),
      modalite:   form.querySelector('[name="modalite"]').value,
      evaluation: form.querySelector('[name="evaluation"]').value.trim(),
      prerequis:  form.querySelector('[name="prerequis"]').value.trim(),
      status:     form.querySelector('[name="status"]').value,
      notes:      form.querySelector('[name="notes"]').value.trim()
    };

    // Documents à générer (création seulement)
    const genDevis      = !dossierId && form.querySelector('[name="genDevis"]')?.checked;
    const genProgramme  = !dossierId && form.querySelector('[name="genProgramme"]')?.checked;
    const genConvention = !dossierId && form.querySelector('[name="genConvention"]')?.checked;

    const btn = document.getElementById('modalAction1');
    if (btn) { btn.disabled = true; btn.textContent = 'Enregistrement…'; }

    try {
      let dossier;
      if (dossierId) {
        dossier = await DataStore.updateDossier(dossierId, data);
        Toast.show('Formation mise à jour ✓', 'success');
      } else {
        dossier = await DataStore.addDossier(clientId, data);
        Toast.show('Formation créée ✓', 'success');
      }
      Modal.close();
      await this.render(opco);

      // Générer les documents automatiquement si demandé
      if (dossier && c) {
        const docData = { ...dossier, ...data, companyName: c.companyName, siret: c.siret,
          address: c.address, phone: c.phone, email: c.email,
          nomGerant: c.nomGerant, idcc: c.idcc, opco };

        if (genDevis)      await Documents.genererDevis(docData);
        if (genProgramme)  await Documents.genererProgramme(docData);
        if (genConvention) await Documents.genererConvention(docData);
      }

      updateNavDots();
    } catch (err) {
      console.error(err);
      Toast.show('Erreur : ' + err.message, 'error');
      if (btn) { btn.disabled = false; btn.textContent = dossierId ? 'Enregistrer' : 'Créer et générer documents'; }
    }
  },

  /* ══════════════════════════════════════════════
     MENU DOCUMENTS
  ══════════════════════════════════════════════ */
  openDocMenu(opco, clientId, dossierId) {
    const c = (this._cachedClients||[]).find(cl => cl.id === clientId);
    const d = c ? (c.dossiers||[]).find(dos => dos.id === dossierId) : null;
    if (!c || !d) return;

    const docData = { ...d, companyName: c.companyName, siret: c.siret,
      address: c.address, phone: c.phone, email: c.email,
      nomGerant: c.nomGerant, idcc: c.idcc, opco };

    Modal.open(`📄 Documents — ${esc(d.trainingSubject)}`, `
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px;">
        Cliquez pour télécharger le PDF correspondant.
      </p>
      <div class="doc-gen-grid">
        <button class="doc-gen-btn" data-doc="devis">
          <span class="doc-gen-icon">📋</span>
          <span class="doc-gen-label">Devis</span>
          <span class="doc-gen-sub">Devis à envoyer</span>
        </button>
        <button class="doc-gen-btn" data-doc="programme">
          <span class="doc-gen-icon">📖</span>
          <span class="doc-gen-label">Programme</span>
          <span class="doc-gen-sub">Programme pédagogique</span>
        </button>
        <button class="doc-gen-btn" data-doc="convention">
          <span class="doc-gen-icon">📃</span>
          <span class="doc-gen-label">Convention</span>
          <span class="doc-gen-sub">Convention de formation</span>
        </button>
        <button class="doc-gen-btn" data-doc="facture">
          <span class="doc-gen-icon">🧾</span>
          <span class="doc-gen-label">Facture</span>
          <span class="doc-gen-sub">Facture à l'OPCO</span>
        </button>
      </div>`,
      [{ label:'Fermer', cls:'btn btn-secondary', action: () => Modal.close() }],
      'modal-sm'
    );

    setTimeout(() => {
      document.querySelectorAll('.doc-gen-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          btn.disabled = true; btn.style.opacity = '0.6';
          try {
            switch (btn.dataset.doc) {
              case 'devis':      await Documents.genererDevis(docData);      break;
              case 'programme':  await Documents.genererProgramme(docData);  break;
              case 'convention': await Documents.genererConvention(docData); break;
              case 'facture':    await Documents.genererFacture(docData);    break;
            }
          } catch (err) { Toast.show('Erreur : ' + err.message, 'error'); }
          btn.disabled = false; btn.style.opacity = '1';
        });
      });
    }, 50);
  },

  /* ══════════════════════════════════════════════
     STATUT RAPIDE
  ══════════════════════════════════════════════ */
  quickStatus(opco, clientId, dossierId) {
    const c = (this._cachedClients||[]).find(cl => cl.id === clientId);
    const d = c ? (c.dossiers||[]).find(dos => dos.id === dossierId) : null;
    if (!d) return;

    Modal.open('Changer le statut', `
      <div style="margin-bottom:8px;font-weight:600;">${esc(c.companyName)} — ${esc(d.trainingSubject)}</div>
      <div style="margin-bottom:16px;color:var(--text-muted);font-size:13px;">Sélectionnez le nouveau statut :</div>
      <div class="status-select-wrap" id="quickWrap">
        ${Object.entries(this.STATUS_LABELS).map(([k,v]) =>
          `<div class="status-option badge badge-${k} ${d.status===k?'selected':''}" data-status="${k}">${v}</div>`
        ).join('')}
      </div>
      <input type="hidden" id="quickVal" value="${d.status}" />`,
      [
        { label:'Annuler', cls:'btn btn-secondary', action: () => Modal.close() },
        { label:'Valider', cls:'btn btn-primary', action: async () => {
          const newStatus = document.getElementById('quickVal').value;
          try {
            await DataStore.updateDossierStatus(dossierId, newStatus);
            Toast.show(`Statut : ${this.STATUS_LABELS[newStatus]}`, 'success');
            Modal.close();
            await this.render(opco);
          } catch { Toast.show('Erreur', 'error'); }
        }}
      ], 'modal-sm'
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

  /* ══════════════════════════════════════════════
     SUPPRESSIONS
  ══════════════════════════════════════════════ */
  confirmDeleteClient(opco, id) {
    const c = (this._cachedClients||[]).find(cl => cl.id === id);
    if (!c) return;
    const nbDoss = (c.dossiers||[]).length;
    Modal.open('Supprimer le client', `
      <div style="text-align:center;padding:12px 0;">
        <div style="font-size:36px;margin-bottom:12px;">🗑️</div>
        <div style="font-size:16px;font-weight:600;color:var(--navy);margin-bottom:8px;">${esc(c.companyName)}</div>
        <div style="font-size:14px;color:var(--text-muted);">
          ${nbDoss > 0 ? `<strong style="color:var(--danger)">${nbDoss} formation${nbDoss>1?'s':''} seront également supprimées.</strong><br>` : ''}
          Cette action est irréversible.
        </div>
      </div>`,
      [
        { label:'Annuler', cls:'btn btn-secondary', action: () => Modal.close() },
        { label:'Supprimer', cls:'btn btn-danger', action: async () => {
          try {
            await DataStore.deleteClient(id);
            Toast.show('Client supprimé', 'success');
            Modal.close();
            await this.render(opco);
            updateNavDots();
          } catch { Toast.show('Erreur lors de la suppression', 'error'); }
        }}
      ], 'modal-sm'
    );
  },

  confirmDeleteDossier(opco, clientId, dossierId) {
    const c = (this._cachedClients||[]).find(cl => cl.id === clientId);
    const d = c ? (c.dossiers||[]).find(dos => dos.id === dossierId) : null;
    if (!d) return;
    Modal.open('Supprimer la formation', `
      <div style="text-align:center;padding:12px 0;">
        <div style="font-size:36px;margin-bottom:12px;">🗑️</div>
        <div style="font-size:15px;font-weight:600;color:var(--navy);margin-bottom:6px;">${esc(d.trainingSubject)}</div>
        <div style="font-size:13px;color:var(--text-muted);">${esc(c.companyName)}<br>Cette action est irréversible.</div>
      </div>`,
      [
        { label:'Annuler', cls:'btn btn-secondary', action: () => Modal.close() },
        { label:'Supprimer', cls:'btn btn-danger', action: async () => {
          try {
            await DataStore.deleteDossier(dossierId);
            Toast.show('Formation supprimée', 'success');
            Modal.close();
            await this.render(opco);
            updateNavDots();
          } catch { Toast.show('Erreur lors de la suppression', 'error'); }
        }}
      ], 'modal-sm'
    );
  },

  /* ══════════════════════════════════════════════
     FICHE OPCO
  ══════════════════════════════════════════════ */
  _renderProcessTab(opco) {
    const cfg      = this.CONFIG[opco];
    const notesKey = `opco_notes_${opco}`;
    const savedNotes = localStorage.getItem(notesKey) || '';

    /* ── Tableau de plafonds ── */
    const plafondSection = cfg.plafonds?.length ? `
      <div class="process-section">
        <div class="process-section-header">
          <span class="process-section-icon">💶</span>
          <div class="process-section-title">Tableau des plafonds de prise en charge</div>
        </div>
        <div class="process-section-body" style="padding:0;">
          <div class="plafonds-table-wrap">
            <table class="plafonds-table">
              <thead>
                <tr>
                  <th>Type de formation</th>
                  <th>Taille entreprise</th>
                  <th>Taux horaire</th>
                  <th>Plafond / engagement</th>
                  <th>Remarque</th>
                </tr>
              </thead>
              <tbody>
                ${cfg.plafonds.map(p => `
                  <tr>
                    <td>${p.type}</td>
                    <td>${p.taille}</td>
                    <td><span class="plafonds-taux">${p.taux}</span></td>
                    <td><span class="plafonds-max">${p.plafond}</span></td>
                    <td>${p.note ? `<span class="plafonds-note">${p.note}</span>` : '—'}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
          <div style="padding:10px 16px;font-size:11.5px;color:var(--text-muted);">
            ℹ️ Plafonds indicatifs 2024-2025 — se référer aux accords de branche en vigueur et confirmer avec votre conseiller OPCO.
          </div>
        </div>
      </div>` : `
      <div class="process-section">
        <div class="process-section-header"><span class="process-section-icon">💶</span>
          <div class="process-section-title">Seuils & plafonds de prise en charge</div></div>
        <div class="process-section-body">
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px;">
            ${cfg.thresholds.map(t => `
              <div style="padding:10px 12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;font-size:12.5px;color:var(--text);">
                ${t}
              </div>`).join('')}
          </div>
        </div>
      </div>`;

    document.getElementById('tabContent').innerHTML = `
      <div class="process-sheet">

        <!-- ── Contact & accès rapide ── -->
        <div class="process-section opco-contact-card" style="border-left:4px solid ${cfg.color};">
          <div style="display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap;">
            <div style="flex:1;min-width:200px;">
              <div style="font-size:16px;font-weight:700;color:var(--navy);margin-bottom:6px;">${cfg.label}</div>
              <div style="font-size:13px;color:var(--text-muted);line-height:1.6;">${cfg.sectors}</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;flex-shrink:0;">
              <a href="${cfg.website}" target="_blank" rel="noopener noreferrer"
                style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;background:${cfg.color};color:#fff;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;transition:opacity 0.18s;"
                onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">
                🌐 Accéder au site ${cfg.label}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
              </a>
              <div style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text-muted);">
                📞 <strong style="color:var(--navy);">${cfg.phone}</strong>
              </div>
            </div>
          </div>
        </div>

        <!-- ── Délai clé ── -->
        <div class="process-section">
          <div class="process-section-header"><span class="process-section-icon">⏱️</span>
            <div class="process-section-title">Délai de dépôt</div></div>
          <div class="process-section-body">
            <div style="font-size:14px;font-weight:600;color:var(--navy);padding:10px 14px;background:var(--warning-bg);border-radius:var(--radius);border-left:4px solid var(--warning);display:flex;align-items:center;gap:8px;">
              ⚠️ ${cfg.deadline}
            </div>
          </div>
        </div>

        <!-- ── Tableau de plafonds ── -->
        ${plafondSection}

        <!-- ── Documents requis ── -->
        <div class="process-section">
          <div class="process-section-header"><span class="process-section-icon">📄</span>
            <div class="process-section-title">Documents à fournir à l'OPCO</div></div>
          <div class="process-section-body">
            <div class="doc-list">
              ${cfg.documents.map((doc, i) => `
                <div class="doc-item">
                  <div class="doc-check" style="background:${cfg.color};color:#fff;">${i+1}</div>
                  ${doc}
                </div>`).join('')}
            </div>
          </div>
        </div>

        <!-- ── Astuces pratiques ── -->
        <div class="process-section">
          <div class="process-section-header"><span class="process-section-icon">✨</span>
            <div class="process-section-title">Astuces pratiques</div></div>
          <div class="process-section-body" style="display:flex;flex-direction:column;gap:10px;">
            ${cfg.tips.map(t => `
              <div style="padding:10px 14px;background:var(--primary-lighter,rgba(59,130,246,0.04));border:1px solid var(--primary-border,rgba(59,130,246,0.15));border-radius:8px;font-size:13px;line-height:1.6;color:var(--text);">
                ${t}
              </div>`).join('')}
          </div>
        </div>

        <!-- ── Points d'attention ── -->
        <div class="process-section">
          <div class="process-section-header"><span class="process-section-icon">🚨</span>
            <div class="process-section-title">Points d'attention critiques</div></div>
          <div class="process-section-body" style="display:flex;flex-direction:column;gap:10px;">
            ${cfg.alerts.map(a => `
              <div class="alert-note" style="border-left:3px solid var(--danger);">
                <div class="alert-note-icon">⛔</div>
                <div style="font-size:13px;">${a}</div>
              </div>`).join('')}
          </div>
        </div>

        <!-- ── Notes internes ── -->
        <div class="process-section">
          <div class="process-section-header">
            <span class="process-section-icon">📝</span>
            <div class="process-section-title">Notes internes — ${cfg.label}</div>
          </div>
          <div class="process-section-body">
            <div class="opco-notes-wrap">
              <textarea
                class="opco-notes-textarea"
                id="opcoNotesArea"
                placeholder="Vos notes spécifiques à cet OPCO : contact habituel, numéro d'adhérent, accords particuliers, historique des dossiers…"
              >${savedNotes ? savedNotes.replace(/</g,'&lt;').replace(/>/g,'&gt;') : ''}</textarea>
              <div class="opco-notes-footer">
                <span class="opco-notes-hint">Sauvegarde automatique — notes conservées localement</span>
                <span class="opco-notes-saved" id="opcoNotesSaved">✓ Sauvegardé</span>
              </div>
            </div>
          </div>
        </div>

      </div>`;

    /* ── Sauvegarde automatique des notes ── */
    let saveTimer = null;
    const textarea = document.getElementById('opcoNotesArea');
    const savedLabel = document.getElementById('opcoNotesSaved');

    textarea?.addEventListener('input', () => {
      clearTimeout(saveTimer);
      savedLabel?.classList.remove('show');
      saveTimer = setTimeout(() => {
        localStorage.setItem(notesKey, textarea.value);
        savedLabel?.classList.add('show');
        setTimeout(() => savedLabel?.classList.remove('show'), 2000);
      }, 600);
    });
  }
};

/* ── Global helpers ── */
function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
