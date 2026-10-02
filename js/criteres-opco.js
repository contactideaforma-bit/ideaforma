/* ─── Critères OPCO 2026 + planificateur de formation ─────────────────────────
   SOURCE UNIQUE des règles de prise en charge (plan de développement des
   compétences, entreprises < 50 salariés). À mettre à jour chaque année :
   tout le reste de l'appli (tarif conseillé, contrôle de conformité, IA,
   proposition automatique, documents) lit ces valeurs.

   Vérifié le 02/10/2026 — sources :
   • Constructys bâtiment : CAPEB « Modalités Bâtiment PDC 2026 » (MAJ juin 2026),
     FFB 28/05/2026 ; travaux publics : Tissot 10/02/2026, FNTP 29/04/2026.
   • OPCO Mobilités : opcomobilites.fr (PDC version janvier 2026 ; conditions
     financières services de l'automobile 2026).
   • L'Opcommerce : critères section Commerce 01/01/2026 + conditions générales 2026.
   • AKTO : règles interprofession (MAJ 29/09/2026) + conditions générales 06/2026.
   • OPCO EP : conditions générales 2026 (29/12/2025) ; critères par branche.

   Chargé APRÈS opco.js et entreprise.js : il remplace les barèmes (Tarifs) et
   met à jour la fiche de chaque OPCO (OpcoPage.CONFIG).
──────────────────────────────────────────────────────────────────────────── */

const CriteresOpco = {

  MAJ: '02/10/2026',
  TARIF_REFERENCE: 30,          // € HT/h/stagiaire proposé quand l'OPCO ne publie pas de taux horaire
  HORAIRES: { matin: ['9h00', '12h30'], apresMidi: ['13h30', '17h00'] },

  BATIMENT: ['1596', '1597', '2609', '2420'],
  TRAVAUX_PUBLICS: ['1702', '2614', '3212', '2409'],
  NAF_PLAN_TPE_AUTO: ['4520A', '4511Z', '4520B'],

  /* ── Fiches OPCO (texte affiché + règles numériques) ── */
  OPCO: {
    constructys: {
      label: 'Constructys', website: 'https://www.constructys.fr',
      delaiJours: 15, dateLimiteDepot: null,
      deadline: 'Demande reçue au moins 15 jours calendaires avant le début (viser 1 mois pour la signature client)',
      ceiling: 'Bâtiment : 24 €/h/stagiaire et 840 €/jour/groupe en intra (< 11 sal.) ; 19 €/h et 665 €/jour/groupe (11-49 sal., depuis le 01/06/2026). Travaux publics : 32 €/h dans un budget annuel de 4 000 €.',
      alerts: [
        'Bâtiment ouvriers : IDCC 1596 jusqu\'à 10 salariés, 1597 au-delà — vérifier sur la fiche de paie',
        'Demande reçue au moins 15 jours avant le début, sinon refus',
        'Formations non qualifiantes : 300 h maximum par stagiaire'
      ],
      documents: ['Devis signé par l\'entreprise', 'Programme détaillé (objectifs, contenu, durée, modalités, évaluation)', 'Convention de formation', 'Liste nominative des stagiaires', 'Certificat Qualiopi de l\'organisme', 'À la facturation : certificat de réalisation + émargements / relevés de connexion'],
      foad: 'Séquences à distance : décrire l\'outil, l\'assistance technique et pédagogique et le suivi de l\'assiduité (relevé de connexion).',
      plafonds: [
        { type: 'Bâtiment — plan de développement', taille: '< 11 salariés', taux: '24 €/h/stagiaire', plafond: '840 € HT/jour/groupe (intra)', note: 'Salaires : 15 €/h' },
        { type: 'Bâtiment — plan de développement', taille: '11–49 salariés', taux: '19 €/h/stagiaire', plafond: '665 € HT/jour/groupe (intra)', note: 'Depuis le 01/06/2026' },
        { type: 'Travaux publics — plan de développement', taille: '< 50 salariés', taux: '32 €/h/stagiaire', plafond: '4 000 € / an / entreprise', note: 'Transitions écologique et numérique : hors budget' }
      ],
      thresholds: ['Dépôt ≥ 15 jours avant le début', 'Non qualifiant : 300 h max / stagiaire', 'Bâtiment 11-49 : 19 €/h depuis le 01/06/2026']
    },
    opco_mobilite: {
      label: 'OPCO Mobilités', website: 'https://www.opcomobilites.fr',
      delaiJours: 30, dateLimiteDepot: '12-31',
      deadline: 'Demande à déposer le plus tôt possible, avant le début (l\'appli impose 1 mois) — au plus tard le 31/12 de l\'année',
      ceiling: 'Services de l\'automobile (IDCC 1090) : budget annuel 1 500 € (< 11 sal.) à 2 700 € (40-49 sal.) ; Plan TPE 2026 (< 11 sal., NAF 4520A / 4511Z / 4520B) : 65 €/h, 21 h maximum.',
      alerts: [
        'Plan TPE auto : réservé aux < 11 salariés, NAF 4520A / 4511Z / 4520B, 21 h maximum',
        'Plan TPE : habilitations électriques et climatisation exclues',
        'Budget annuel par entreprise : vérifier ce qui a déjà été consommé cette année'
      ],
      documents: ['Devis signé', 'Programme détaillé', 'Convention de formation', 'Liste nominative des stagiaires', 'Certificat Qualiopi', 'À la facturation : certificat de réalisation'],
      foad: 'FOAD éligible : prévoir assistance, activités à distance et preuves d\'assiduité.',
      plafonds: [
        { type: 'Plan de développement (budget annuel)', taille: '< 11 salariés', taux: 'Budget', plafond: '1 500 € / an', note: 'Coûts pédagogiques seulement' },
        { type: 'Plan de développement (budget annuel)', taille: '11–19 / 20–29 / 30–39 / 40–49', taux: 'Budget', plafond: '1 800 / 2 100 / 2 400 / 2 700 € / an', note: '' },
        { type: 'Plan TPE 2026 — services de l\'automobile', taille: '< 11 salariés (NAF 4520A, 4511Z, 4520B)', taux: '65 €/h', plafond: '21 h maximum', note: 'Hors habilitations électriques et climatisation' }
      ],
      thresholds: ['Durée minimale : 1 h', 'Date limite de dépôt : 31/12/2026', 'Organisme certifié Qualiopi obligatoire']
    },
    opco_commerce: {
      label: 'L\'Opcommerce', website: 'https://www.lopcommerce.com',
      delaiJours: 30, dateLimiteDepot: '11-30',
      deadline: 'Demande en ligne au moins 1 mois avant le début — au plus tard le 30/11 de l\'année',
      ceiling: 'Section Commerce : budget « Compétences+ » 1 500 €/an (< 11 sal.), 2 500 €/an (11-49 sal.), formation + salaires (13 €/h) + frais annexes. Montants propres à chaque branche.',
      alerts: ['Critères fixés par branche : vérifier ceux de la branche du client', 'Dépôt 1 mois avant le début, au plus tard le 30/11', 'Certificat de réalisation obligatoire pour le paiement'],
      documents: ['Devis signé', 'Programme détaillé', 'Convention de formation', 'Certificat Qualiopi', 'À la facturation : certificat de réalisation'],
      foad: 'FOAD : assistance technique et pédagogique, information du stagiaire sur les activités à distance, évaluations jalonnant le parcours.',
      plafonds: [
        { type: 'Compétences+ (section Commerce)', taille: '< 11 salariés', taux: 'Budget', plafond: '1 500 € / an', note: 'Inclut salaires et frais annexes' },
        { type: 'Compétences+ (section Commerce)', taille: '11–49 salariés', taux: 'Budget', plafond: '2 500 € / an', note: '' }
      ],
      thresholds: ['Dépôt ≥ 1 mois avant', 'Date limite : 30/11/2026']
    },
    akto: {
      label: 'AKTO', website: 'https://www.akto.fr',
      delaiJours: 30, dateLimiteDepot: null,
      deadline: 'Demande 30 jours calendaires avant le démarrage',
      ceiling: 'Interprofession : budget annuel 2 500 € (< 11 sal.), 4 000 € (11-49) ; inter-entreprises 30 €/h/salarié ; intra-entreprise 1 000 €/jour (3 stagiaires minimum). Salaires non pris en charge.',
      alerts: ['Règles propres à chaque branche AKTO (propreté, restauration rapide…) : vérifier la branche du client', 'Intra-entreprise : 3 stagiaires minimum', 'Seules les heures prévues, réalisées et justifiées sont payées'],
      documents: ['Convention ou devis signé (objectif, contenu, durée, coût)', 'Programme détaillé', 'Certificat Qualiopi', 'À la facturation : certificat de réalisation'],
      foad: 'FOAD : convention signée, certificat de réalisation ; protocole individuel de formation fortement recommandé.',
      plafonds: [
        { type: 'Interprofession — intra-entreprise', taille: '< 50 salariés', taux: '1 000 €/jour', plafond: '2 500 € (< 11) / 4 000 € (11-49) par an', note: '3 stagiaires minimum' },
        { type: 'Interprofession — inter-entreprises', taille: '< 50 salariés', taux: '30 €/h/salarié', plafond: '2 500 € (< 11) / 4 000 € (11-49) par an', note: 'Salaires non pris en charge' }
      ],
      thresholds: ['Dépôt 30 jours avant', 'Intra : 3 stagiaires minimum']
    },
    opco_ep: {
      label: 'OPCO EP', website: 'https://www.opcoep.fr',
      delaiJours: 30, dateLimiteDepot: '11-30',
      deadline: 'Demande au moins 1 mois avant le début — au plus tard le 30/11 de l\'année',
      ceiling: 'Critères par branche (ex. esthétique : 1 500 € / 4 000 € / 6 500 € par an selon effectif, 25 à 30 €/h). Vérifier la branche du client sur opcoep.fr.',
      alerts: ['Critères propres à chaque branche : consulter opcoep.fr/criteres-de-financement', 'Dépôt 1 mois avant, au plus tard le 30/11', 'Programme détaillé exigé à la demande'],
      documents: ['Programme détaillé', 'Devis / convention', 'Certificat Qualiopi', 'À la facturation : facture + certificat de réalisation'],
      foad: 'FOAD : certificat de réalisation ou attestation d\'assiduité ; autres preuves acceptées (travaux, résultats d\'évaluation).',
      plafonds: [
        { type: 'Plan de développement (selon branche)', taille: '< 11 salariés', taux: '25–30 €/h', plafond: 'Budget annuel de branche', note: 'Ex. esthétique : 1 500 à 6 500 € selon effectif' },
        { type: 'Plan de développement (selon branche)', taille: '≥ 11 salariés', taux: '30 €/h', plafond: 'Ex. 3 jours / an / salarié', note: 'Selon branche' }
      ],
      thresholds: ['Dépôt ≥ 1 mois avant', 'Date limite : 30/11/2026']
    }
  },

  /* ── Barèmes structurés (remplacent Tarifs.BAREMES) ──
     tauxMax : € HT/h/stagiaire ; plafondJour : € HT/jour/groupe (intra) ;
     budgetAnnuel : € par entreprise et par an ; dureeMax : h ; idcc / naf : branche. */
  BAREMES: {
    constructys: [
      { dispositif: 'Plan de développement des compétences', branche: 'Bâtiment', idcc: ['1596', '1597', '2609', '2420'], min: 0,  max: 10,   tauxMin: 24, tauxMax: 24, unite: 'h', plafondJour: 840, dureeMax: 300, note: 'Bâtiment 2026 : 24 € HT/h/stagiaire, intra 840 € HT/jour/groupe' },
      { dispositif: 'Plan de développement des compétences', branche: 'Bâtiment', idcc: ['1596', '1597', '2609', '2420'], min: 11, max: 49,   tauxMin: 19, tauxMax: 19, unite: 'h', plafondJour: 665, dureeMax: 300, note: 'Bâtiment depuis le 01/06/2026 : 19 € HT/h/stagiaire, intra 665 € HT/jour/groupe' },
      { dispositif: 'Plan de développement des compétences', branche: 'Travaux publics', idcc: ['1702', '2614', '3212', '2409'], min: 0, max: 49, tauxMin: 32, tauxMax: 32, unite: 'h', budgetAnnuel: 4000, dureeMax: 300, note: 'Travaux publics 2026 : 32 € HT/h/stagiaire, budget 4 000 €/an' },
      { dispositif: 'Plan de développement des compétences', min: 50, max: null, tauxMin: null, tauxMax: null, unite: 'h', note: 'Barème ≥ 50 salariés non publié — demander l\'accord du conseiller' }
    ],
    opco_mobilite: [
      { dispositif: 'Plan TPE 2026 — services de l\'automobile', idcc: ['1090'], naf: ['4520A', '4511Z', '4520B'], min: 0, max: 10, tauxMin: 65, tauxMax: 65, unite: 'h', dureeMax: 21, exclusions: /habilitation|électrique|electrique|climatisation|clim\b/i, note: 'Plan TPE : 65 € HT/h, 21 h max, hors habilitations électriques et climatisation (taux à confirmer : par heure de formation)' },
      { dispositif: 'Plan de développement des compétences', min: 0,  max: 10, tauxMin: null, tauxMax: null, unite: 'h', budgetAnnuel: 1500, note: 'Budget annuel 1 500 € (coûts pédagogiques)' },
      { dispositif: 'Plan de développement des compétences', min: 11, max: 19, tauxMin: null, tauxMax: null, unite: 'h', budgetAnnuel: 1800, note: 'Budget annuel 1 800 €' },
      { dispositif: 'Plan de développement des compétences', min: 20, max: 29, tauxMin: null, tauxMax: null, unite: 'h', budgetAnnuel: 2100, note: 'Budget annuel 2 100 €' },
      { dispositif: 'Plan de développement des compétences', min: 30, max: 39, tauxMin: null, tauxMax: null, unite: 'h', budgetAnnuel: 2400, note: 'Budget annuel 2 400 €' },
      { dispositif: 'Plan de développement des compétences', min: 40, max: 49, tauxMin: null, tauxMax: null, unite: 'h', budgetAnnuel: 2700, note: 'Budget annuel 2 700 €' }
    ],
    opco_commerce: [
      { dispositif: 'Plan de développement des compétences', min: 0,  max: 10, tauxMin: null, tauxMax: null, unite: 'h', budgetAnnuel: 1500, note: 'Compétences+ section Commerce : 1 500 €/an (formation + salaires + frais) — critères propres à chaque branche' },
      { dispositif: 'Plan de développement des compétences', min: 11, max: 49, tauxMin: null, tauxMax: null, unite: 'h', budgetAnnuel: 2500, note: 'Compétences+ section Commerce : 2 500 €/an — critères propres à chaque branche' }
    ],
    akto: [
      { dispositif: 'Plan de développement des compétences', min: 0,  max: 10, tauxMin: 30, tauxMax: 30, unite: 'h', plafondJour: 1000, minStagiairesIntra: 3, budgetAnnuel: 2500, note: 'Interprofession : intra 1 000 €/jour (3 stagiaires min.), inter 30 €/h/salarié, budget 2 500 €/an' },
      { dispositif: 'Plan de développement des compétences', min: 11, max: 49, tauxMin: 30, tauxMax: 30, unite: 'h', plafondJour: 1000, minStagiairesIntra: 3, budgetAnnuel: 4000, note: 'Interprofession : intra 1 000 €/jour (3 stagiaires min.), budget 4 000 €/an' }
    ],
    opco_ep: [
      { dispositif: 'Plan de développement des compétences', min: 0,  max: 10, tauxMin: 25, tauxMax: 30, unite: 'h', note: 'Critères par branche (25 à 30 €/h) — vérifier le budget annuel de la branche sur opcoep.fr' },
      { dispositif: 'Plan de développement des compétences', min: 11, max: 49, tauxMin: 30, tauxMax: 30, unite: 'h', note: 'Selon branche (ex. 3 jours / an / salarié à 30 €/h)' }
    ]
  },

  /* ══════════════════════════════════════════════════════════════════════
     DATES : jours ouvrés (hors week-ends et jours fériés)
  ══════════════════════════════════════════════════════════════════════ */
  _paques(an) {   // algorithme de Butcher (dimanche de Pâques)
    const a = an % 19, b = Math.floor(an / 100), c = an % 100, d = Math.floor(b / 4), e = b % 4,
      f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30,
      i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
      mois = Math.floor((h + l - 7 * m + 114) / 31), jour = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(an, mois - 1, jour);
  },
  feries(an) {
    const p = this._paques(an), plus = n => { const d = new Date(p); d.setDate(d.getDate() + n); return this.iso(d); };
    return new Set([`${an}-01-01`, plus(1), `${an}-05-01`, `${an}-05-08`, plus(39), plus(50), `${an}-07-14`, `${an}-08-15`, `${an}-11-01`, `${an}-11-11`, `${an}-12-25`]);
  },
  iso(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; },
  date(iso) { return new Date(iso + 'T00:00'); },
  ouvre(d) { const j = d.getDay(); return j !== 0 && j !== 6 && !this.feries(d.getFullYear()).has(this.iso(d)); },
  prochainOuvre(d) { const r = new Date(d); while (!this.ouvre(r)) r.setDate(r.getDate() + 1); return r; },
  joursOuvres(debut, n) {
    const out = []; let d = this.prochainOuvre(debut);
    while (out.length < n) { if (this.ouvre(d)) out.push(this.iso(d)); d = new Date(d); d.setDate(d.getDate() + 1); }
    return out;
  },
  /** Regroupe des jours en périodes contiguës (jours ouvrés successifs) pour le formulaire */
  periodes(jours) {
    const per = [];
    jours.forEach(j => {
      const last = per[per.length - 1];
      if (last && (this.date(j) - this.date(last.end)) / 86400000 === 1) last.end = j;   // jours calendaires consécutifs
      else per.push({ start: j, end: j });
    });
    return per;
  },

  /* ══════════════════════════════════════════════════════════════════════
     RÈGLES APPLICABLES À UN CLIENT
  ══════════════════════════════════════════════════════════════════════ */
  fiche(opco) { return this.OPCO[opco] || null; },

  /** Date limite de dépôt pour une formation commençant à `debut` */
  depotAvant(opco, debut) {
    const f = this.fiche(opco); if (!f || !debut) return null;
    const d = new Date(this.date(debut)); d.setDate(d.getDate() - (f.delaiJours || 0));
    if (f.dateLimiteDepot) {
      const [m, j] = f.dateLimiteDepot.split('-').map(Number);
      const lim = new Date(this.date(debut).getFullYear(), m - 1, j);
      if (lim < d) return lim;
    }
    return d;
  },

  /** Premier jour de démarrage possible (délai OPCO + marge pour la signature client) */
  premierDemarrage(opco, aujourdhui = new Date(), marge = 7) {
    const f = this.fiche(opco);
    const d = new Date(aujourdhui); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + (f?.delaiJours ?? 30) + marge);
    return this.prochainOuvre(d);
  },

  /* ══════════════════════════════════════════════════════════════════════
     PLANIFICATEUR — proposition durée / dates / répartition / prix
  ══════════════════════════════════════════════════════════════════════ */
  /**
   * @param {object} p { opco, client, dispositif, stagiaires, heures?, debut?, modalite? }
   * @returns proposition { heures, jours[], trainingDates[], creneaux[], prix, financement, depotAvant, notes[], bareme }
   */
  proposer({ opco, client = {}, dispositif, stagiaires = 1, heures, debut, modalite = 'presentiel' }) {
    const nb = Math.max(1, parseInt(stagiaires) || 1);
    const b = Tarifs.bareme(opco, dispositif, client.employees, client);
    const notes = [];
    const taux = b?.tauxMax ?? null;
    const tauxCalcul = taux ?? this.TARIF_REFERENCE;

    /* 1. Durée : demandée, sinon 14 h (2 jours) ajustée à ce qui est finançable */
    const financeMax = h => this.financement({ bareme: b, heures: h, jours: Math.ceil(h / 7), nb }).max;
    let h = parseFloat(heures) > 0 ? parseFloat(heures) : null;
    if (!h) {
      h = 14;
      if (b?.dureeMax && h > b.dureeMax) h = Math.floor(b.dureeMax / 3.5) * 3.5;
      // budget annuel seul (pas de taux) : on garde 7 h minimum, sinon on réduit à ce que le budget couvre au tarif de référence
      if (taux == null && b?.budgetAnnuel) {
        const hFin = Math.floor(b.budgetAnnuel / (tauxCalcul * nb) / 3.5) * 3.5;
        h = Math.max(7, Math.min(h, hFin));
        notes.push(`Durée calée sur le budget annuel ${Tarifs.eur(b.budgetAnnuel)} au tarif de référence ${tauxCalcul} €/h/stagiaire.`);
      }
      notes.push(`Durée proposée : ${this._h(h)}${b?.dureeMax ? ` (maximum ${b.dureeMax} h pour ce dispositif)` : ''}.`);
    } else {
      const arr = Math.round(h / 3.5) * 3.5;
      if (Math.abs(arr - h) > 0.01) { notes.push(`${this._h(h)} arrondi à ${this._h(arr)} (demi-journées complètes de 3,5 h).`); h = arr || 3.5; }
      if (b?.dureeMax && h > b.dureeMax) { notes.push(`Durée ramenée à ${b.dureeMax} h (maximum du dispositif).`); h = Math.floor(b.dureeMax / 3.5) * 3.5; }
    }

    /* 2. Jours : 7 h par jour, dernier jour en demi-journée si besoin */
    const nbJours = Math.ceil(h / 7);
    const min = this.premierDemarrage(opco);
    let depart = debut ? this.date(debut) : null;
    if (depart && depart < min) { notes.push(`Date de début repoussée au ${this.fr(min)} : délai de dépôt ${this.fiche(opco)?.label || 'OPCO'} + signature du client.`); depart = null; }
    const jours = this.joursOuvres(depart || min, nbJours);
    const trainingDates = this.periodes(jours);
    const creneaux = this.creneaux(jours, h);

    /* 3. Prix : prise en charge maximale (reste à charge nul) */
    const fin = this.financement({ bareme: b, heures: h, jours: nbJours, nb });
    let prix = fin.max != null ? Math.floor(fin.max) : Math.round(tauxCalcul * h * nb);
    if (taux == null && fin.max != null && tauxCalcul * h * nb < fin.max) {     // budget seul : on facture au tarif de référence, sans consommer tout le budget
      prix = Math.round(tauxCalcul * h * nb);
      fin.detail = `tarif de référence ${tauxCalcul} €/h × ${this._h(h)} × ${nb} stagiaire${nb > 1 ? 's' : ''} (dans le budget annuel ${Tarifs.eur(b.budgetAnnuel)})`;
    }
    if (fin.max == null) notes.push(`Pas de plafond publié : prix au tarif de référence ${tauxCalcul} €/h/stagiaire — à valider avec le conseiller ${this.fiche(opco)?.label || 'OPCO'}.`);
    if (fin.detail) notes.push(`Prix = ${fin.detail}.`);
    if (b?.budgetAnnuel) notes.push(`Budget annuel de l'entreprise : ${Tarifs.eur(b.budgetAnnuel)} — s'il a déjà servi cette année, le reste à charge augmente.`);
    if (b?.minStagiairesIntra && nb < b.minStagiairesIntra) notes.push(`Intra-entreprise : ${b.minStagiairesIntra} stagiaires minimum pour le forfait journalier (${nb} prévu${nb > 1 ? 's' : ''}).`);

    const depot = this.depotAvant(opco, jours[0]);
    return { heures: h, nbJours, jours, trainingDates, creneaux, prix, financement: fin, depotAvant: depot, notes, bareme: b, nb, modalite };
  },

  /** Financement maximal : taux × heures × stagiaires, borné par le plafond jour/groupe, le plafond par action et le budget annuel */
  financement({ bareme: b, heures, jours, nb }) {
    if (!b) return { max: null };
    const limites = [];
    if (b.tauxMax != null) limites.push({ v: b.tauxMax * heures * nb, txt: `${b.tauxMax} €/h × ${this._h(heures)} × ${nb} stagiaire${nb > 1 ? 's' : ''}` });
    if (b.plafondJour && jours) limites.push({ v: b.plafondJour * jours, txt: `${Tarifs.eur(b.plafondJour)}/jour/groupe × ${jours} jour${jours > 1 ? 's' : ''}` });
    if (b.plafond) limites.push({ v: b.plafond, txt: `plafond ${Tarifs.eur(b.plafond)} par action` });
    if (b.budgetAnnuel) limites.push({ v: b.budgetAnnuel, txt: `budget annuel ${Tarifs.eur(b.budgetAnnuel)}` });
    if (!limites.length) return { max: null };
    // AKTO : forfait jour seulement en intra avec 3 stagiaires minimum
    const utiles = limites.filter(l => !(b.minStagiairesIntra && nb < b.minStagiairesIntra && /jour\/groupe/.test(l.txt)));
    const lim = utiles.reduce((a, l) => (l.v < a.v ? l : a));
    return { max: lim.v, detail: lim.txt, limites: utiles };
  },

  /**
   * Créneaux horaires : jours de 7 h (9h00-12h30 / 13h30-17h00), demi-journée de 3,5 h si besoin.
   * Si le nombre de jours saisi ne correspond pas à des journées pleines, les heures sont réparties à parts égales.
   */
  creneaux(jours, heures) {
    const n = jours.length; if (!n || !(heures > 0)) return [];
    const pleins = n * 7 >= heures - 0.01 && (n - 1) * 7 < heures - 0.01;
    const parJour = jours.map((j, i) => pleins ? Math.min(7, Math.round((heures - i * 7) * 100) / 100) : Math.round(heures / n * 100) / 100);
    const out = [];
    jours.forEach((j, i) => {
      const hj = parJour[i]; if (hj <= 0) return;
      const m = Math.min(3.5, hj), am = Math.round((hj - m) * 100) / 100;
      out.push({ date: j, demi: 'matin', heures: m, debut: '9h00', fin: this._heure(9, m) });
      if (am > 0) out.push({ date: j, demi: 'apres-midi', heures: am, debut: '13h30', fin: this._heure(13.5, am) });
    });
    return out;
  },

  /** Planning complet : créneaux + séquences du programme (modules répartis dans l'ordre) */
  planning(dossier) {
    const jours = typeof Documents !== 'undefined' ? Documents._expandDates(dossier.trainingDates) : [];
    const heures = Number(dossier.dureeHeures) > 0 ? Number(dossier.dureeHeures) : jours.length * 7;
    const cr = this.creneaux(jours, heures);
    const mods = (typeof Conformite !== 'undefined' ? Conformite.modules(dossier.contenu) : []).filter(m => m.heures > 0);
    let mi = 0, reste = mods[0]?.heures || 0;
    return cr.map(c => {
      let dispo = c.heures; const titres = [], modalites = new Set();
      while (dispo > 0.01 && mi < mods.length) {
        const pris = Math.min(dispo, reste);
        titres.push(mods[mi].titre.replace(/\s*\([^)]*\)\s*:?\s*$/, ''));
        if (mods[mi].modalite) modalites.add(mods[mi].modalite);
        dispo -= pris; reste -= pris;
        if (reste <= 0.01) { mi++; reste = mods[mi]?.heures || 0; }
      }
      const mod = modalites.size === 1 ? [...modalites][0] : (modalites.size ? 'mixte' : dossier.modalite);
      return { ...c, sequences: [...new Set(titres)], modalite: mod };
    });
  },

  _heure(depart, duree) { const t = depart + duree, hh = Math.floor(t), mm = Math.round((t - hh) * 60); return `${hh}h${String(mm).padStart(2, '0')}`; },
  _h(h) { return `${String(Math.round(h * 100) / 100).replace('.', ',')} h`; },
  fr(d) { return (d instanceof Date ? d : this.date(d)).toLocaleDateString('fr-FR'); },

  /* ══════════════════════════════════════════════════════════════════════
     INSTALLATION : barèmes + fiches OPCO
  ══════════════════════════════════════════════════════════════════════ */
  installer() {
    if (typeof Tarifs !== 'undefined') {
      Tarifs.BAREMES = this.BAREMES;
      Tarifs.DISPOSITIF_DEFAUT = 'Plan de développement des compétences';
    }
    if (typeof OpcoPage !== 'undefined') {
      Object.entries(this.OPCO).forEach(([k, f]) => {
        const cfg = OpcoPage.CONFIG[k]; if (!cfg) return;
        Object.assign(cfg, {
          label: f.label, website: f.website, contact: f.website.replace(/^https?:\/\/(www\.)?/, ''),
          deadline: f.deadline, ceiling: f.ceiling, delaiJours: f.delaiJours, dateLimiteDepot: f.dateLimiteDepot,
          alerts: f.alerts, documents: f.documents, foad: f.foad, plafonds: f.plafonds,
          thresholds: [...f.thresholds, `Critères vérifiés le ${this.MAJ}`]
        });
      });
    }
  }
};

CriteresOpco.installer();
