/* ─── Entreprise & Tarifs — assistance automatique du parcours OPCO ──────────
   • Entreprise : recherche par SIRET / raison sociale (via /api/entreprise),
     détection de l'OPCO de rattachement (CFA Dock, puis IDCC, puis NAF).
   • Tarifs     : barèmes structurés de prise en charge par OPCO / dispositif /
     effectif → tarif horaire conseillé et estimation du financement.
─────────────────────────────────────────────────────────────────────────────── */

const Entreprise = {

  /* ── IDCC → OPCO (les 5 OPCO gérés dans l'application) ── */
  IDCC_OPCO: {
    opco_mobilite:  ['16','1090','1424','1710','2219','2972','3217'],
    opco_commerce:  ['573','733','1431','1483','1487','1505','1517','1539','1557','1606','1686','1760','2216'],
    akto:           ['1266','1351','1501','1516','1790','1979','2098','2378','3043','3127'],
    constructys:    ['1596','1597','1702','2409','2420','2609','2614','3212','3216'],
    opco_ep:        ['759','843','953','992','1000','1043','1147','1267','1527','1619','1850','1875','1978','1996','2002','2205','2596','3032']
  },

  /* ── NAF → OPCO (repli quand aucune IDCC n'est connue). Les codes les plus
        précis sont testés en premier, puis les préfixes de division. ── */
  NAF_OPCO: [
    ['96.02', 'opco_ep'], ['47.73', 'opco_ep'], ['86.2', 'opco_ep'], ['75.00', 'opco_ep'],
    ['69.1', 'opco_ep'], ['68.31', 'opco_ep'], ['96.03', 'opco_ep'], ['10.71', 'opco_ep'],
    ['47.22', 'opco_ep'], ['47.76', 'opco_ep'], ['96.01', 'opco_ep'], ['95.23', 'opco_ep'],
    ['46.73', 'constructys'], ['41', 'constructys'], ['42', 'constructys'], ['43', 'constructys'],
    ['45', 'opco_mobilite'], ['49', 'opco_mobilite'], ['79', 'opco_mobilite'], ['77.11', 'opco_mobilite'], ['52.29', 'opco_mobilite'],
    ['78.20', 'akto'], ['80.10', 'akto'], ['81.2', 'akto'], ['85.59', 'akto'], ['88.10', 'akto'], ['88.91', 'akto'],
    ['55', 'akto'], ['56', 'akto'],
    ['46', 'opco_commerce'], ['47', 'opco_commerce']
  ],

  _cache: new Map(),

  async _get(params) {
    const { data: { session } } = await supa.auth.getSession();
    if (!session?.access_token) throw new Error('Session expirée — reconnectez-vous');
    const key = JSON.stringify(params);
    if (this._cache.has(key)) return this._cache.get(key);
    const res  = await fetch(`/api/entreprise?${new URLSearchParams(params)}`, {
      headers: { Authorization: `Bearer ${session.access_token}` }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
    this._cache.set(key, data);
    return data;
  },

  /** Liste de candidats pour un nom, un SIREN ou un SIRET */
  async rechercher(q) {
    const data = await this._get({ q });
    return data.resultats || [];
  },

  /** Fiche complète + OPCO pour un SIRET */
  async fiche(siret) {
    const data = await this._get({ siret: String(siret).replace(/\s/g, '') });
    return data;
  },

  /* ── Détection de l'OPCO ── */
  codeDepuisNom(nom = '') {
    const n = nom.toLowerCase();
    if (n.includes('mobilit'))     return 'opco_mobilite';
    if (n.includes('commerce'))    return 'opco_commerce';
    if (n.includes('akto'))        return 'akto';
    if (n.includes('constructys')) return 'constructys';
    if (/\bep\b|proximit/.test(n)) return 'opco_ep';
    return null;
  },

  opcoDepuisIdcc(liste = []) {
    for (const idcc of liste.map(String)) {
      for (const [code, ids] of Object.entries(this.IDCC_OPCO)) {
        if (ids.includes(idcc)) return { code, idcc };
      }
    }
    return null;
  },

  opcoDepuisNaf(naf = '') {
    const n = String(naf).replace(/[A-Z]$/i, '');
    if (!n) return null;
    for (const [prefix, code] of this.NAF_OPCO) {
      if (n.startsWith(prefix)) return { code, naf: n };
    }
    return null;
  },

  /**
   * Combine les sources : CFA Dock (officiel) > IDCC > NAF.
   * Renvoie { code, label, source, confiance } — code null si l'OPCO n'est pas
   * parmi les 5 gérés (Atlas, Afdas, Ocapiat…), avec son nom dans label.
   */
  detecterOpco(fiche, opcoApi = null) {
    const labels = OpcoPage?.CONFIG || {};
    const lbl = c => labels[c]?.label || c;

    if (opcoApi?.nom) {
      const code = this.codeDepuisNom(opcoApi.nom);
      return { code, label: code ? lbl(code) : opcoApi.nom, source: opcoApi.source || 'CFA Dock',
               detail: opcoApi.idcc ? `IDCC ${opcoApi.idcc}` : '', confiance: 'haute' };
    }
    const parIdcc = this.opcoDepuisIdcc(fiche?.idcc || []);
    if (parIdcc) return { code: parIdcc.code, label: lbl(parIdcc.code), source: 'convention collective',
                          detail: `IDCC ${parIdcc.idcc}`, confiance: 'bonne' };
    const parNaf = this.opcoDepuisNaf(fiche?.naf || '');
    if (parNaf) return { code: parNaf.code, label: lbl(parNaf.code), source: 'code NAF',
                         detail: `NAF ${fiche.naf}`, confiance: 'indicative' };
    return null;
  },

  /** Effectif numérique exploitable (borne basse de la tranche, min 1) */
  effectifEstime(fiche) {
    if (!fiche) return '';
    if (fiche.effectifMin == null) return '';
    return Math.max(1, fiche.effectifMin);
  },

  formatSiret(s = '') {
    const d = String(s).replace(/\D/g, '');
    return d.replace(/(\d{3})(\d{3})(\d{3})(\d{5})/, '$1 $2 $3 $4');
  }
};


/* ═══════════════════════════════════════════════════════════════════════════
   TARIFS — barèmes de prise en charge (miroir de la table opco_plafonds)
   unite : 'h' = € par heure et par stagiaire · 'j' = € par jour et par stagiaire
   plafond : montant maximal par formation (null = pas de plafond connu)
   pourcentage : prise en charge en % du coût (formations « jusqu'à 100 % »)
═══════════════════════════════════════════════════════════════════════════ */
const Tarifs = {

  DISPOSITIF_DEFAUT: 'Plan de développement des compétences',

  BAREMES: {
    opco_commerce: [
      { dispositif:'Plan de développement des compétences', min:0,  max:10,   tauxMin:25, tauxMax:25, unite:'h', plafond:1500, note:'Taux bonifiés selon accord de branche' },
      { dispositif:'Plan de développement des compétences', min:11, max:49,   tauxMin:18, tauxMax:18, unite:'h', plafond:1000 },
      { dispositif:'Plan de développement des compétences', min:50, max:null, tauxMin:15, tauxMax:15, unite:'h', plafond:null, note:'Accord préalable recommandé au-delà de 10 000 €' },
      { dispositif:'Formations numérique & RSE (prioritaires)', min:0, max:10, tauxMin:25, tauxMax:25, unite:'h', plafond:2000, prioritaire:true, note:'Enveloppe dédiée' },
      { dispositif:'Pro-A (reconversion / promotion)', min:0, max:null, tauxMin:30, tauxMax:30, unite:'h', plafond:null, note:'Circuit et dossier spécifiques' }
    ],
    opco_mobilite: [
      { dispositif:'Plan de développement des compétences', min:0,  max:49,   tauxMin:30, tauxMax:40, unite:'h', plafond:null, note:'Fonds TPE-PME — dépôt 15 j avant démarrage' },
      { dispositif:'Plan de développement des compétences', min:50, max:249,  tauxMin:25, tauxMax:30, unite:'h', plafond:null, note:'Accord préalable obligatoire au-delà de 5 000 €' },
      { dispositif:'Plan de développement des compétences', min:250,max:null, tauxMin:25, tauxMax:25, unite:'h', plafond:null, note:'Sur enveloppe annuelle — accord préalable' },
      { dispositif:'Éco-conduite / Loi LOM', min:0, max:null, tauxMin:40, tauxMax:40, unite:'h', plafond:null, prioritaire:true, note:'Financement majoré' },
      { dispositif:'FCO Marchandises (réglementaire)', min:0, max:null, tauxMin:300, tauxMax:300, unite:'j', plafond:null, prioritaire:true, note:'Formation obligatoire — prise en charge prioritaire' },
      { dispositif:'FCO Voyageurs (réglementaire)', min:0, max:null, tauxMin:300, tauxMax:300, unite:'j', plafond:null, prioritaire:true, note:'Formation obligatoire — prise en charge prioritaire' }
    ],
    akto: [
      { dispositif:'Plan de développement des compétences', min:0,  max:10,   tauxMin:35, tauxMax:35, unite:'h', plafond:null, note:'Enveloppe dédiée TPE — taux les plus élevés' },
      { dispositif:'Plan de développement des compétences', min:11, max:49,   tauxMin:15, tauxMax:25, unite:'h', plafond:1200 },
      { dispositif:'Plan de développement des compétences', min:50, max:null, tauxMin:15, tauxMax:15, unite:'h', plafond:null, note:'Sur enveloppe annuelle' },
      { dispositif:'HACCP / Hygiène alimentaire (certifiant)', min:0, max:null, tauxMin:null, tauxMax:null, unite:'h', plafond:null, pourcentage:100, prioritaire:true, note:'Formations certifiantes prioritaires' }
    ],
    constructys: [
      { dispositif:'Plan de développement des compétences', min:0,  max:9,    tauxMin:20, tauxMax:28, unite:'h', plafond:null, note:'KBIS < 3 mois obligatoire' },
      { dispositif:'Plan de développement des compétences', min:10, max:49,   tauxMin:14, tauxMax:20, unite:'h', plafond:null, note:'Dépôt 1 mois avant démarrage' },
      { dispositif:'Plan de développement des compétences', min:50, max:null, tauxMin:12, tauxMax:15, unite:'h', plafond:null, note:'Sur accord préalable' },
      { dispositif:'Formations sécurité réglementaires (CACES, habilitations, travail en hauteur)', min:0, max:null, tauxMin:28, tauxMax:28, unite:'h', plafond:null, prioritaire:true, note:'Aligner sur les thèmes prioritaires annuels' },
      { dispositif:'Habilitations électriques (B0, H0, BR…)', min:0, max:null, tauxMin:25, tauxMax:25, unite:'h', plafond:null, prioritaire:true, note:'Vérifier la liste des thèmes prioritaires' }
    ],
    opco_ep: [
      { dispositif:'Plan de développement des compétences', min:0,  max:2,    tauxMin:null, tauxMax:null, unite:'h', plafond:null, note:'Fonds TPE — contacter un conseiller avant dossier' },
      { dispositif:'Plan de développement des compétences', min:3,  max:10,   tauxMin:25, tauxMax:25, unite:'h', plafond:null, note:'Taux bonifiés branche' },
      { dispositif:'Plan de développement des compétences', min:11, max:49,   tauxMin:10, tauxMax:18, unite:'h', plafond:1000 },
      { dispositif:'Plan de développement des compétences', min:50, max:null, tauxMin:10, tauxMax:10, unite:'h', plafond:null, note:'Sur enveloppe annuelle' },
      { dispositif:'Hygiène & désinfection', min:0, max:null, tauxMin:null, tauxMax:null, unite:'h', plafond:null, pourcentage:100, prioritaire:true, note:'Toujours bien financé en coiffure / esthétique' }
    ]
  },

  dispositifs(opco) {
    return [...new Set((this.BAREMES[opco] || []).map(b => b.dispositif))];
  },

  libelleTaille(b) {
    if (b.min === 0 && b.max == null) return 'Tous effectifs';
    if (b.max == null) return `≥ ${b.min} salariés`;
    if (b.min === 0)   return `≤ ${b.max} salariés`;
    return `${b.min}–${b.max} salariés`;
  },

  /** Ligne de barème applicable (effectif null → première ligne du dispositif) */
  bareme(opco, dispositif, effectif) {
    const lignes = (this.BAREMES[opco] || []).filter(b => b.dispositif === (dispositif || this.DISPOSITIF_DEFAUT));
    if (!lignes.length) return null;
    const n = parseInt(effectif);
    if (!Number.isFinite(n)) return { ...lignes[0], effectifInconnu: lignes.length > 1 };
    return lignes.find(b => n >= b.min && (b.max == null || n <= b.max)) || lignes[lignes.length - 1];
  },

  eur(n) {
    return new Intl.NumberFormat('fr-FR', { style:'currency', currency:'EUR', maximumFractionDigits: 0 }).format(n);
  },

  /**
   * Calcule la suggestion complète.
   * @returns {object|null} { bareme, taille, tauxTexte, estimation:{min,max}, base, tauxActuel, ecart, messages[] }
   */
  suggestion({ opco, dispositif, effectif, heures, stagiaires, prix }) {
    const b = this.bareme(opco, dispositif, effectif);
    if (!b) return null;

    const h   = parseFloat(heures) || 0;
    const nb  = Math.max(1, parseInt(stagiaires) || 1);
    const p   = parseFloat(prix) || 0;
    const jours = h ? Math.max(1, Math.ceil(h / 7)) : 0;
    const unite = b.unite === 'j' ? '€/jour/stagiaire' : '€/h/stagiaire';

    let tauxTexte = '';
    if (b.pourcentage)      tauxTexte = `jusqu'à ${b.pourcentage} % du coût`;
    else if (b.tauxMin == null) tauxTexte = 'sur devis — voir conseiller';
    else if (b.tauxMin === b.tauxMax) tauxTexte = `${b.tauxMax} ${unite}`;
    else tauxTexte = `${b.tauxMin} à ${b.tauxMax} ${unite}`;

    const base = b.unite === 'j' ? jours : h;
    const estimation = (b.tauxMax != null && base)
      ? { min: b.tauxMin * base * nb, max: b.tauxMax * base * nb }
      : null;
    if (estimation && b.plafond) {
      estimation.min = Math.min(estimation.min, b.plafond);
      estimation.max = Math.min(estimation.max, b.plafond);
      estimation.plafonne = b.tauxMax * base * nb > b.plafond;
    }

    /* Taux réellement pratiqué avec le prix saisi */
    let tauxActuel = null, ecart = null;
    if (p && base) {
      tauxActuel = p / base / nb;
      if (b.tauxMax != null) ecart = tauxActuel - b.tauxMax;
    }

    const messages = [];
    if (b.effectifInconnu) messages.push({ type:'info', text:'Renseignez l\'effectif du client pour affiner le barème.' });
    if (b.note) messages.push({ type:'info', text: b.note });
    if (estimation?.plafonne) messages.push({ type:'warn', text:`Plafond ${this.eur(b.plafond)} par formation atteint — le reste sera à la charge de l'entreprise.` });
    if (ecart != null && ecart > 0.5) {
      messages.push({ type:'warn', text:`Prix saisi = ${tauxActuel.toFixed(2).replace('.', ',')} ${unite}, au-dessus du plafond OPCO : reste à charge d'environ ${this.eur(ecart * base * nb)} HT pour l'entreprise.` });
    } else if (ecart != null && ecart < -3 && b.tauxMin != null) {
      messages.push({ type:'ok', text:`Prix saisi = ${tauxActuel.toFixed(2).replace('.', ',')} ${unite} : marge de ${this.eur(-ecart * base * nb)} HT sous le plafond.` });
    } else if (ecart != null) {
      messages.push({ type:'ok', text:`Prix aligné sur le plafond OPCO (${tauxActuel.toFixed(2).replace('.', ',')} ${unite}).` });
    }

    return { bareme: b, taille: this.libelleTaille(b), unite, tauxTexte, estimation, base, jours, nb, tauxActuel, ecart, messages };
  },

  /** Prix HT conseillé (taux max × durée × stagiaires, borné au plafond) */
  prixConseille({ opco, dispositif, effectif, heures, stagiaires }) {
    const s = this.suggestion({ opco, dispositif, effectif, heures, stagiaires });
    if (!s?.estimation) return null;
    return Math.round(s.estimation.max);
  }
};
