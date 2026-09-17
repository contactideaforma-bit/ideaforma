/* ─── Documents — Génération PDF v3 (charte IDEAFORMA) ─────────────────────
   Dépendances : jsPDF 2.5 + jsPDF-AutoTable 3.8 (CDN, chargés par app.html)

   Gabarit commun à tous les documents (réf. dossier « Atelier Sainte Marthe ») :
     • cadre navy fin autour de chaque page ;
     • en-tête = logo à gauche + bloc coordonnées de l'organisme ;
     • titre centré navy + sous-titre italique bleu acier ;
     • bandeaux de section pleine largeur navy numérotés ;
     • sous-bandeaux bleu acier centrés ;
     • tableaux label / valeur (label gras sur fond gris clair) ;
     • tableaux « programme » à en-tête navy, ligne TOTAL bleu clair ;
     • objectifs avec coche verte ;
     • bloc signatures 2 colonnes ;
     • pied de page « Page X / N ».

   Sept documents : devis, programme, convention, facture, feuille
   d'émargement (présentiel), relevé de connexion + attestation d'assiduité
   (distanciel), certificat de réalisation (un par stagiaire).

   Règles de mise en page : tout texte passe par _para() (retour à la ligne
   automatique + saut de page), tout tableau par autoTable (pagination
   automatique) ; aucun texte n'est positionné « en dur » en bas de page.
──────────────────────────────────────────────────────────────────────────── */

const Documents = {

  /* ── Palette charte ── */
  NAVY:   [31,  58,  95],   // #1F3A5F — titres, bandeaux, cadre
  STEEL:  [78,  134, 184],  // #4E86B8 — sous-bandeaux, sous-titres
  SKY:    [46,  155, 214],  // #2E9BD6 — mention Qualiopi
  TEXT:   [30,  41,  59],   // texte courant
  MUTED:  [71,  85,  105],  // texte secondaire
  LABEL:  [242, 245, 248],  // #F2F5F8 — fond des labels
  ALT:    [234, 241, 248],  // #EAF1F8 — lignes alternées
  TOTAL:  [207, 224, 238],  // #CFE0EE — ligne TOTAL
  LINE:   [185, 196, 208],  // #B9C4D0 — bordures
  GREEN:  [46,  125, 50],   // #2E7D32 — coches

  /* ── Géométrie (mm) ── */
  PAGE_W: 210, PAGE_H: 297,
  ML: 14, MR: 14,             // marges gauche / droite
  TOP: 12,                     // première ligne utile sur une page suivante
  BOTTOM: 276,                 // dernière ligne utile (le pied commence à 282)
  get W() { return this.PAGE_W - this.ML - this.MR; },   // largeur utile = 182

  MODALITE: { presentiel:'Présentiel', distanciel:'À distance (classe virtuelle)', mixte:'Mixte (présentiel et distanciel)' },

  /* ── Numérotation — déléguée à la base (fn_next_numero), repli local ── */
  DOC_TYPES: { DEV:'devis', CONV:'convention', PROG:'programme', FACT:'facture',
               EMA:'emargement', REL:'releve', CER:'certificat' },

  async _docNum(prefix) {
    try {
      const numero = await DataStore.nextNumero(this.DOC_TYPES[prefix] || prefix.toLowerCase());
      if (numero) return numero;
    } catch (err) {
      console.warn('[Documents] numérotation serveur indisponible', err);
    }
    const d = new Date();
    return `${prefix}-${d.getFullYear()}-TMP${String(d.getHours())}${String(d.getMinutes()).padStart(2,'0')}`;
  },

  /* ── Profil de l'organisme ── */
  async _getOFProfile() {
    let p = null;
    try { p = await DataStore.getProfile(); } catch { /* hors ligne */ }
    return {
      nom:       p?.organisme || 'IDEAFORMA',
      dirigeant: p?.nom || '',
      email:     p?.email || '',
      siret:     p?.siret || '',
      adresse:   p?.adresse || '',
      tel:       p?.telephone || '',
      da:        p?.numero_da || '',
      qualiopi:  p?.numero_qualiopi || '',
      qualiopiFin: p?.date_fin_qualiopi || '',
      naf:       p?.code_naf || '',
      uai:       p?.numero_uai || '',
      referentHandicap: p?.referent_handicap || '',
      referentHandicapContact: p?.referent_handicap_contact || '',
      iban:      p?.iban || '',
      tva:       !!p?.tva_applicable,
      logo:      p?.logo_base64 || null
    };
  },

  /* ── Données dérivées du dossier (durée, dates, lieu, formateur…) ── */
  _ctx(dossier, of) {
    const jours  = this._expandDates(dossier.trainingDates);
    const nbJ    = jours.length;
    const heures = Number(dossier.dureeHeures) > 0 ? Number(dossier.dureeHeures) : nbJ * 7;
    const hParJ  = nbJ ? heures / nbJ : 7;
    const fmt    = d => new Date(d + 'T00:00').toLocaleDateString('fr-FR');
    const periode = nbJ
      ? (nbJ === 1 ? `Le ${fmt(jours[0])}` : `Du ${fmt(jours[0])} au ${fmt(jours[nbJ-1])}`)
      : 'À définir';
    const datesDetail = (dossier.trainingDates || []).filter(d => d.start).map(d => {
      const s = fmt(d.start), e = d.end ? fmt(d.end) : null;
      return e && e !== s ? `du ${s} au ${e}` : `le ${s}`;
    }).join(', ') || 'À définir';
    const modalite = this.MODALITE[dossier.modalite] || this.MODALITE.presentiel;
    const distanciel = dossier.modalite === 'distanciel';
    const lieu = dossier.lieu
      || (distanciel ? 'À distance — classe virtuelle (visioconférence)'
                     : (dossier.address ? `Dans les locaux de l'entreprise — ${dossier.address}` : 'Dans les locaux de l\'entreprise'));
    const stagiaires = (dossier.trainees || []).filter(t => t.firstName || t.lastName);
    return {
      jours, nbJ, heures, hParJ, periode, datesDetail, modalite, distanciel, lieu, stagiaires,
      dureeLabel: `${this._fmtH(heures)}${nbJ ? ` — ${nbJ} jour${nbJ > 1 ? 's' : ''} (${this._fmtH(hParJ)}/jour)` : ''}`,
      formateur: dossier.formateur || of.dirigeant || of.nom,
      opcoLabel: (typeof OpcoPage !== 'undefined' && OpcoPage.CONFIG?.[dossier.opco]?.label) || dossier.opco || 'OPCO',
      tvaTxt: of.tva ? 'TVA 20 %' : 'TVA non applicable — art. 261-4-4° a du CGI',
      tvaMontant: of.tva ? (dossier.price || 0) * 0.2 : 0
    };
  },

  /* ══════════════════════════════════════════════════════════════════════
     DEVIS
  ══════════════════════════════════════════════════════════════════════ */
  async genererDevis(dossier) {
    const of  = await this._getOFProfile();
    const num = await this._docNum('DEV');
    const doc = this._newDoc();
    const x   = this._ctx(dossier, of);
    const today = this._today();
    const validite = new Date(); validite.setDate(validite.getDate() + 30);

    let y = this._header(doc, of);
    y = this._title(doc, y, 'Devis', `Devis n° ${num} du ${today} — valable jusqu'au ${validite.toLocaleDateString('fr-FR')}`);

    y = this._band(doc, y, '1. Parties');
    y = this._subBand(doc, y, 'Organisme de Formation');
    y = this._kv(doc, y, this._ofRows(of));
    y = this._subBand(doc, y, 'Entreprise Bénéficiaire');
    y = this._kv(doc, y, this._clientRows(dossier, x));

    y = this._band(doc, y, '2. Action de formation');
    y = this._kv(doc, y, [
      ['Intitulé', dossier.trainingSubject],
      ['Nature de l\'action', 'Action de formation (art. L. 6313-1 du Code du travail)'],
      ['Modalité', x.modalite],
      ['Durée', x.dureeLabel],
      ['Dates', x.datesDetail],
      ['Lieu', x.lieu],
      ['Effectif', x.stagiaires.length ? `${x.stagiaires.length} stagiaire${x.stagiaires.length > 1 ? 's' : ''} : ${x.stagiaires.map(t => `${t.firstName} ${t.lastName}`.trim()).join(', ')}` : 'À préciser'],
      ['Financement', `Prise en charge demandée auprès de ${x.opcoLabel} (plan de développement des compétences)`]
    ]);

    y = this._band(doc, y, '3. Détail du devis');
    y = this._prog(doc, y,
      ['Désignation', 'Durée', 'Stagiaires', 'Montant HT'],
      [[`Action de formation « ${dossier.trainingSubject} »\n${x.modalite} — ${x.periode}`, this._fmtH(x.heures), String(x.stagiaires.length || '—'), this._fmtEuro(dossier.price)]],
      { widths: [92, 26, 24, 40], aligns: { 1:'center', 2:'center', 3:'right' },
        totals: this._totalRows(dossier.price, x, of) });

    y = this._band(doc, y, '4. Conditions');
    y = this._bullets(doc, y, [
      'Devis valable 30 jours à compter de sa date d\'émission. L\'acceptation du devis vaut commande et entraîne l\'établissement d\'une convention de formation (art. L. 6353-1 du Code du travail).',
      `Règlement à 30 jours à compter de la date de facture, par virement bancaire. En cas de prise en charge par ${x.opcoLabel} avec subrogation de paiement, la facture est adressée directement à l'OPCO ; à défaut d'accord de prise en charge, le montant reste dû par l'entreprise.`,
      `${x.tvaTxt}.`,
      'Une feuille d\'émargement (ou un relevé de connexion pour le distanciel), un certificat de réalisation et une attestation de fin de formation sont remis à l\'issue de l\'action.',
      `Organisme de formation déclaré sous le n° ${of.da || '__________'} — cet enregistrement ne vaut pas agrément de l'État. ${of.qualiopi ? `Certifié Qualiopi n° ${of.qualiopi} (actions de formation).` : 'Certifié Qualiopi (actions de formation).'}`
    ]);

    y = this._band(doc, y, '5. Acceptation');
    this._signatures(doc, y, [
      { titre: 'Pour l\'Entreprise Bénéficiaire', lignes: [dossier.companyName, dossier.nomGerant ? `Représentée par ${dossier.nomGerant}` : 'Nom, qualité :', 'Mention « Bon pour accord », date, cachet et signature :'] },
      { titre: `Pour l'Organisme de Formation — ${of.nom}`, lignes: [of.dirigeant || '', `Fait le ${today}`, 'Cachet et signature :'] }
    ]);

    this._finalize(doc, of);
    this._showPreview(doc, dossier, of, 'DEVIS', `Devis_${num}_${this._slug(dossier.companyName)}`);
  },

  /* ══════════════════════════════════════════════════════════════════════
     CONVENTION DE FORMATION PROFESSIONNELLE
  ══════════════════════════════════════════════════════════════════════ */
  async genererConvention(dossier) {
    const of  = await this._getOFProfile();
    const num = await this._docNum('CONV');
    const doc = this._newDoc();
    const x   = this._ctx(dossier, of);
    const today = this._today();

    let y = this._header(doc, of);
    y = this._title(doc, y, 'Convention de formation professionnelle',
      `Convention n° ${num} — établie conformément aux articles L. 6353-1, L. 6353-2 et D. 6353-1 du Code du travail`);

    y = this._band(doc, y, '1. Parties');
    y = this._subBand(doc, y, 'Organisme de Formation (ci-après « l\'Organisme »)');
    y = this._kv(doc, y, this._ofRows(of));
    y = this._subBand(doc, y, 'Entreprise Bénéficiaire (ci-après « le Client »)');
    y = this._kv(doc, y, this._clientRows(dossier, x));

    y = this._band(doc, y, '2. Objet et caractéristiques de l\'action');
    y = this._para(doc, y, 'En exécution de la présente convention, l\'Organisme s\'engage à organiser l\'action de formation décrite ci-dessous, conformément au programme annexé (Annexe 1) qui fait partie intégrante de la convention.');
    y = this._kv(doc, y, [
      ['Intitulé', dossier.trainingSubject],
      ['Nature de l\'action', 'Action de formation au sens de l\'article L. 6313-1 du Code du travail (développement des compétences)'],
      ['Objectifs', dossier.objectifs || 'Voir programme en Annexe 1'],
      ['Public visé / prérequis', `${dossier.publicVise || 'Salarié(s) de l\'entreprise'} — Prérequis : ${dossier.prerequis || 'aucun'}`],
      ['Durée', x.dureeLabel],
      ['Dates', x.datesDetail],
      ['Modalité', x.modalite],
      ['Lieu', x.lieu],
      ['Formateur', x.formateur],
      ['Effectif', x.stagiaires.length ? `${x.stagiaires.length} stagiaire${x.stagiaires.length > 1 ? 's' : ''} — liste nominative en Annexe 2` : 'À préciser — liste nominative en Annexe 2'],
      ['Sanction', 'Attestation de fin de formation et certificat de réalisation (formation non certifiante)']
    ]);

    y = this._band(doc, y, '3. Modalités de déroulement, de suivi et d\'évaluation');
    y = this._article(doc, y, 'Article 3.1 — Moyens pédagogiques et encadrement',
      `${dossier.moyens || 'Pédagogie active : apports méthodologiques, démonstrations, exercices pratiques sur les outils et situations de travail du Client, mises en situation. Un support de formation est remis à chaque stagiaire.'} ${x.distanciel || dossier.modalite === 'mixte' ? 'Pour les séquences à distance, l\'Organisme communique les prérequis techniques et le lien de connexion au plus tard 48 heures avant la session ; une assistance technique et pédagogique est assurée par le formateur pendant toute la durée de la formation.' : ''} La formation est animée par ${x.formateur}.`);
    y = this._article(doc, y, 'Article 3.2 — Suivi de l\'exécution',
      'L\'assiduité des stagiaires est attestée par une feuille d\'émargement signée par demi-journée par les stagiaires et le formateur (présentiel) ou par un relevé de connexion accompagné d\'une attestation d\'assiduité (distanciel). Un certificat de réalisation est établi pour chaque stagiaire à l\'issue de l\'action.');
    y = this._article(doc, y, 'Article 3.3 — Évaluation',
      `${dossier.evaluation || 'Évaluation des acquis en continu (exercices, mises en situation) et en fin de formation.'} Un questionnaire de satisfaction est complété par chaque stagiaire ; une attestation de fin de formation lui est remise. Une évaluation à froid est proposée au Client dans les trois mois suivant la formation.`);
    y = this._article(doc, y, 'Article 3.4 — Règlement intérieur',
      'Le règlement intérieur applicable aux stagiaires (art. L. 6352-3 du Code du travail) est remis au Client avec la présente convention ; le Client s\'engage à le porter à la connaissance des stagiaires avant le début de la formation.');

    y = this._band(doc, y, '4. Dispositions financières');
    y = this._prog(doc, y,
      ['Désignation', 'Durée', 'Stagiaires', 'Montant HT'],
      [[`Action de formation « ${dossier.trainingSubject} »`, this._fmtH(x.heures), String(x.stagiaires.length || '—'), this._fmtEuro(dossier.price)]],
      { widths: [92, 26, 24, 40], aligns: { 1:'center', 2:'center', 3:'right' }, totals: this._totalRows(dossier.price, x, of) });
    y = this._article(doc, y, 'Article 4.1 — Modalités de règlement',
      `Le Client s'engage à verser à l'Organisme la somme de ${this._fmtEuro(dossier.price + x.tvaMontant)} ${of.tva ? 'TTC' : '(' + x.tvaTxt + ')'}. La facture est émise à l'issue de la formation, accompagnée du certificat de réalisation et des justificatifs d'assiduité ; règlement à 30 jours par virement. En cas de prise en charge par ${x.opcoLabel} avec subrogation de paiement, l'Organisme adresse sa facture directement à l'OPCO dans la limite de l'accord de prise en charge ; le solde éventuel reste dû par le Client.`);
    y = this._article(doc, y, 'Article 4.2 — Dédit, annulation et abandon',
      'En cas de renoncement par le Client plus de 10 jours ouvrés avant le début de la formation, aucune somme n\'est due. Moins de 10 jours ouvrés avant le début, le Client verse 30 % du prix de la formation à titre de dédommagement ; cette somme n\'est pas imputable sur l\'obligation de participation au développement de la formation professionnelle et ne peut faire l\'objet d\'une prise en charge par l\'OPCO. En cas d\'abandon d\'un stagiaire en cours de formation pour un motif autre que la force majeure dûment reconnue, seules les heures effectivement réalisées sont facturées. En cas de cessation anticipée ou d\'annulation du fait de l\'Organisme, seules les prestations effectivement dispensées sont dues, au prorata temporis. En cas de force majeure, la convention est résiliée de plein droit sans indemnité.');

    y = this._band(doc, y, '5. Obligations réciproques et dispositions générales');
    y = this._article(doc, y, 'Article 5.1 — Obligations',
      'L\'Organisme met en œuvre les moyens pédagogiques, techniques et d\'encadrement décrits ci-dessus et remet au Client le programme, le règlement intérieur et les justificatifs de réalisation. Le Client met à disposition les locaux, équipements et accès nécessaires lorsque la formation a lieu dans ses locaux, communique la liste nominative des stagiaires avant le début de la session et leur transmet les informations préalables (programme, horaires, règlement intérieur).');
    y = this._article(doc, y, 'Article 5.2 — Confidentialité, propriété intellectuelle et données personnelles',
      'Les parties gardent confidentielles les informations échangées. Les supports de formation restent la propriété intellectuelle de l\'Organisme et ne peuvent être reproduits ou diffusés sans son accord écrit. Les données personnelles des stagiaires sont traitées par l\'Organisme pour la gestion, le suivi et le financement de la formation, conformément au RGPD ; les droits d\'accès, de rectification et d\'opposition s\'exercent auprès de l\'Organisme.');
    y = this._article(doc, y, 'Article 5.3 — Différends',
      'En cas de litige relatif à l\'interprétation ou à l\'exécution de la présente convention, les parties recherchent une solution amiable ; à défaut, le litige est porté devant le tribunal compétent du ressort du siège de l\'Organisme.');

    y = this._band(doc, y, '6. Signatures');
    y = this._para(doc, y, `Fait en deux exemplaires originaux, à ______________________, le ____ / ____ / ______. Chaque partie reconnaît avoir reçu un exemplaire.`);
    this._signatures(doc, y, [
      { titre: 'Pour l\'Entreprise Bénéficiaire', lignes: [dossier.companyName, dossier.nomGerant ? `Représentée par ${dossier.nomGerant}` : 'Nom, qualité :', 'Cachet et signature :'] },
      { titre: `Pour l'Organisme de Formation — ${of.nom}`, lignes: [of.dirigeant || '', 'Cachet et signature :'] }
    ]);

    /* Annexe 1 — programme */
    doc.addPage(); y = this.TOP;
    y = this._band(doc, y, 'Annexe 1 — Programme de formation');
    y = this._kv(doc, y, [
      ['Intitulé', dossier.trainingSubject],
      ['Objectifs pédagogiques', dossier.objectifs || 'À l\'issue de la formation, le stagiaire sera capable de mettre en œuvre les compétences visées.'],
      ['Public et prérequis', `${dossier.publicVise || 'Salarié(s) de l\'entreprise'} — ${dossier.prerequis || 'Aucun prérequis'}`],
      ['Durée et modalité', `${x.dureeLabel} — ${x.modalite}`],
      ['Méthodes et moyens', dossier.moyens || 'Apports méthodologiques, démonstrations, exercices pratiques en situation de travail, support remis aux stagiaires.'],
      ['Modalités d\'évaluation', dossier.evaluation || 'Évaluation continue et évaluation des acquis en fin de formation ; questionnaire de satisfaction.'],
      ['Accessibilité handicap', `Référent handicap : ${of.referentHandicap || of.dirigeant || of.nom}${of.referentHandicapContact ? ` — ${of.referentHandicapContact}` : (of.email ? ` — ${of.email}` : '')}. Aménagements étudiés sur demande.`]
    ]);
    y = this._subBand(doc, y, 'Programme détaillé', 'left');
    y = this._contenuTable(doc, y, dossier.contenu, x);

    /* Annexe 2 — stagiaires */
    y = this._band(doc, y, 'Annexe 2 — Liste des stagiaires');
    const rows = x.stagiaires.map((t, i) => [String(i + 1), t.lastName || '', t.firstName || '', t.fonction || '', 'Salarié(e)']);
    while (rows.length < Math.max(4, x.stagiaires.length)) rows.push([String(rows.length + 1), '', '', '', '']);
    y = this._prog(doc, y, ['N°', 'Nom', 'Prénom', 'Fonction', 'Statut'], rows,
      { widths: [12, 50, 50, 40, 30], aligns: { 0:'center' }, minH: 7 });
    this._note(doc, y, 'Documents remis avec la convention : programme, règlement intérieur, devis. Documents remis à l\'issue : feuille(s) d\'émargement ou relevé de connexion, certificat de réalisation, attestation de fin de formation, facture.');

    this._finalize(doc, of);
    this._showPreview(doc, dossier, of, 'CONVENTION', `Convention_${num}_${this._slug(dossier.companyName)}`);
  },

  /* ══════════════════════════════════════════════════════════════════════
     PROGRAMME DE FORMATION
  ══════════════════════════════════════════════════════════════════════ */
  async genererProgramme(dossier) {
    const of  = await this._getOFProfile();
    const num = await this._docNum('PROG');
    const doc = this._newDoc();
    const x   = this._ctx(dossier, of);

    let y = this._header(doc, of);
    y = this._title(doc, y, 'Programme de formation', dossier.trainingSubject);

    y = this._band(doc, y, '1. Informations générales');
    y = this._kv(doc, y, [
      ['Intitulé de la formation', dossier.trainingSubject],
      ['Référence', `${num} — ${this._today()}`],
      ['Durée totale', x.dureeLabel],
      ['Dates', x.datesDetail],
      ['Lieu de la formation', x.lieu],
      ['Public visé', dossier.publicVise || (x.stagiaires.length ? `Salarié(s) de l'entreprise — ${x.stagiaires.length} apprenant${x.stagiaires.length > 1 ? 's' : ''}` : 'Salariés de l\'entreprise')],
      ['Niveau requis / prérequis', dossier.prerequis || 'Aucun prérequis — formation ouverte à tout niveau'],
      ['Modalité pédagogique', x.modalite],
      ['Formateur', x.formateur],
      ['Financement', `Dans le cadre d'une prise en charge ${x.opcoLabel}`]
    ]);

    y = this._band(doc, y, '2. Parties prenantes');
    y = this._subBand(doc, y, 'Organisme de Formation');
    y = this._kv(doc, y, this._ofRows(of));
    y = this._subBand(doc, y, 'Entreprise Bénéficiaire');
    y = this._kv(doc, y, this._clientRows(dossier, x));
    if (x.stagiaires.length) {
      y = this._subBand(doc, y, x.stagiaires.length > 1 ? 'Salariés formés' : 'Salarié formé');
      y = this._kv(doc, y, [
        ['Nom / Prénom', x.stagiaires.map(t => `${t.lastName || ''} ${t.firstName || ''}`.trim()).join(', ')],
        ['Statut', 'Salarié(s)'],
        ['Effectif formé', `${x.stagiaires.length} personne${x.stagiaires.length > 1 ? 's' : ''}`]
      ]);
    }

    y = this._band(doc, y, '3. Objectifs pédagogiques');
    y = this._para(doc, y, 'À l\'issue de la formation, le stagiaire sera capable de :');
    y = this._objectifs(doc, y, dossier.objectifs);

    y = this._band(doc, y, '4. Programme de la formation');
    y = this._contenuTable(doc, y, dossier.contenu, x);

    y = this._band(doc, y, '5. Moyens pédagogiques et techniques');
    y = this._kv(doc, y, [
      ['Méthodes pédagogiques', dossier.moyens || 'Apprentissage par la pratique, démonstrations en temps réel, exercices progressifs, échanges questions / réponses, accompagnement individualisé.'],
      ['Supports fournis', 'Support de cours numérique remis à chaque stagiaire à l\'issue de la formation.'],
      ['Moyens techniques', x.distanciel ? 'Classe virtuelle (visioconférence), partage d\'écran, documents partagés ; prérequis : ordinateur, connexion internet, micro et caméra.' : 'Matériel et outils de travail du bénéficiaire, mis en situation réelle ; vidéoprojection ou partage d\'écran si nécessaire.'],
      ['Environnement', x.lieu]
    ]);

    y = this._band(doc, y, '6. Modalités de suivi et d\'évaluation');
    y = this._kv(doc, y, [
      ['Suivi de l\'exécution', x.distanciel ? 'Relevé de connexion et attestation d\'assiduité signée par le formateur.' : 'Feuille d\'émargement signée par demi-journée par les stagiaires et le formateur.'],
      ['Évaluation des acquis', dossier.evaluation || 'Évaluation continue (exercices pratiques guidés à chaque module) et évaluation finale des acquis.'],
      ['Satisfaction', 'Questionnaire de satisfaction à chaud complété par le stagiaire ; évaluation à froid proposée à l\'entreprise à 2–3 mois.'],
      ['Sanction', 'Certificat de réalisation et attestation de fin de formation (formation non certifiante).']
    ]);

    y = this._band(doc, y, '7. Informations pratiques');
    y = this._kv(doc, y, [
      ['Délai d\'accès', '2 à 4 semaines entre la demande et le début de la formation, selon le financement.'],
      ['Accessibilité handicap', `Référent handicap : ${of.referentHandicap || of.dirigeant || of.nom}${of.referentHandicapContact ? ` — ${of.referentHandicapContact}` : (of.email ? ` — ${of.email}` : '')}. Aménagements (supports, rythme, accessibilité) étudiés avec le stagiaire et son employeur.`],
      ['Contact', [of.dirigeant, of.tel, of.email].filter(Boolean).join(' — ') || of.nom]
    ]);

    y = this._band(doc, y, '8. Signatures');
    this._signatures(doc, y, [
      { titre: 'Pour l\'Entreprise Bénéficiaire', lignes: [dossier.companyName, dossier.nomGerant || 'Nom, qualité :', 'Date, cachet et signature :'] },
      { titre: `Pour l'Organisme de Formation — ${of.nom}`, lignes: [of.dirigeant || '', 'Date, cachet et signature :'] }
    ]);

    this._finalize(doc, of, `Document établi par ${of.nom} — à conserver dans le dossier de prise en charge ${x.opcoLabel}.`);
    this._showPreview(doc, dossier, of, 'PROGRAMME', `Programme_${num}_${this._slug(dossier.companyName)}`);
  },

  /* ══════════════════════════════════════════════════════════════════════
     FACTURE
  ══════════════════════════════════════════════════════════════════════ */
  async genererFacture(dossier) {
    const of  = await this._getOFProfile();
    const num = await this._docNum('FACT');
    const doc = this._newDoc();
    const x   = this._ctx(dossier, of);
    const today = this._today();
    const due = new Date(); due.setDate(due.getDate() + 30);
    const dueStr = due.toLocaleDateString('fr-FR');

    let y = this._header(doc, of);
    y = this._title(doc, y, 'Facture', `Facture n° ${num} — date d'émission : ${today} — échéance : ${dueStr}`);

    y = this._band(doc, y, '1. Émetteur et destinataire');
    y = this._subBand(doc, y, 'Émetteur — Organisme de Formation');
    y = this._kv(doc, y, this._ofRows(of));
    y = this._subBand(doc, y, 'Destinataire');
    y = this._kv(doc, y, [
      ...this._clientRows(dossier, x),
      ['Financement', `${x.opcoLabel} — prise en charge au titre du plan de développement des compétences${dossier.numeroDossierOpco ? ` — dossier n° ${dossier.numeroDossierOpco}` : ''}`]
    ]);

    y = this._band(doc, y, '2. Détail de la prestation');
    y = this._prog(doc, y,
      ['Désignation', 'Dates', 'Durée', 'Stagiaires', 'Montant HT'],
      [[`Action de formation « ${dossier.trainingSubject} »\n${x.modalite}${dossier.numeroConvention ? `\nConvention n° ${dossier.numeroConvention}` : ''}`,
        x.datesDetail, this._fmtH(x.heures), String(x.stagiaires.length || '—'), this._fmtEuro(dossier.price)]],
      { widths: [70, 40, 20, 20, 32], aligns: { 2:'center', 3:'center', 4:'right' }, totals: this._totalRows(dossier.price, x, of, 5) });
    if (x.stagiaires.length) {
      y = this._para(doc, y, `Stagiaires formés : ${x.stagiaires.map(t => `${t.firstName} ${t.lastName}`.trim()).join(', ')}.`, { size: 8.5, color: this.MUTED });
    }

    y = this._band(doc, y, '3. Conditions de règlement');
    y = this._kv(doc, y, [
      ['Date d\'échéance', `${dueStr} (30 jours à compter de la date d'émission)`],
      ['Mode de règlement', `Virement bancaire${of.iban ? ` — IBAN : ${of.iban}` : ''}`],
      ['Pénalités de retard', 'Trois fois le taux d\'intérêt légal, exigibles sans rappel dès le lendemain de la date d\'échéance (art. L. 441-10 du Code de commerce).'],
      ['Indemnité de recouvrement', 'Indemnité forfaitaire de 40 € pour frais de recouvrement (art. D. 441-5 du Code de commerce).'],
      ['Escompte', 'Aucun escompte pour paiement anticipé.'],
      ['TVA', x.tvaTxt]
    ]);
    this._note(doc, y, `Pièces jointes : certificat(s) de réalisation, feuille(s) d'émargement ou relevé de connexion. Organisme de formation déclaré sous le n° ${of.da || '__________'} — cet enregistrement ne vaut pas agrément de l'État.`);

    this._finalize(doc, of);
    this._showPreview(doc, dossier, of, 'FACTURE', `Facture_${num}_${this._slug(dossier.companyName)}`);
  },

  /* ══════════════════════════════════════════════════════════════════════
     FEUILLE D'ÉMARGEMENT — une page par journée (présentiel)
  ══════════════════════════════════════════════════════════════════════ */
  async genererEmargement(dossier) {
    const of  = await this._getOFProfile();
    const x   = this._ctx(dossier, of);
    if (!x.jours.length) { Toast.show('Renseignez au moins une date de formation', 'warning'); return; }
    const num = await this._docNum('EMA');
    const doc = this._newDoc();

    x.jours.forEach((jour, idx) => {
      if (idx > 0) doc.addPage();
      const dateLabel = this._dateLongue(jour);
      let y = this._header(doc, of);
      y = this._title(doc, y, 'Feuille d\'émargement', `${dossier.trainingSubject} — journée ${idx + 1} / ${x.jours.length} — ${dateLabel}`);

      y = this._band(doc, y, '1. Informations générales');
      y = this._kv(doc, y, [
        ['Intitulé de la formation', dossier.trainingSubject],
        ['Entreprise bénéficiaire', `${dossier.companyName}${dossier.siret ? ` — SIRET ${dossier.siret}` : ''}`],
        ['Référence / financeur', `${num} — ${x.opcoLabel}${dossier.numeroConvention ? ` — convention n° ${dossier.numeroConvention}` : ''}`],
        ['Lieu', x.lieu],
        ['Formateur', x.formateur],
        ['Date et horaires', `${dateLabel} — Matin : ______ à ______ — Après-midi : ______ à ______ — Durée : ${this._fmtH(x.hParJ)}`]
      ]);

      y = this._band(doc, y, '2. Émargement des stagiaires (signature par demi-journée)');
      const rows = x.stagiaires.map((t, i) => [String(i + 1), `${t.lastName || ''} ${t.firstName || ''}`.trim(), t.fonction || '', '', '']);
      while (rows.length < 8) rows.push([String(rows.length + 1), '', '', '', '']);
      y = this._prog(doc, y, ['N°', 'Nom et prénom', 'Fonction', 'Signature matin', 'Signature après-midi'], rows,
        { widths: [10, 58, 34, 40, 40], aligns: { 0:'center' }, minH: 10,
          totals: [[{ content: 'Formateur — nom et signature', colSpan: 3 }, '', '']] });
      y = this._para(doc, y, 'Absences / retards constatés : ______________________________________________________________________');
      this._note(doc, y, 'Feuille conservée par l\'organisme de formation et transmise à l\'entreprise et au financeur avec le certificat de réalisation. Toute signature anticipée ou pour le compte d\'un tiers est interdite.');
    });

    this._finalize(doc, of);
    this._showPreview(doc, dossier, of, 'EMARGEMENT', `Emargement_${num}_${this._slug(dossier.companyName)}`, false);
  },

  /* ══════════════════════════════════════════════════════════════════════
     RELEVÉ DE CONNEXION ET ATTESTATION D'ASSIDUITÉ (distanciel)
  ══════════════════════════════════════════════════════════════════════ */
  async genererReleveConnexion(dossier) {
    const of  = await this._getOFProfile();
    const x   = this._ctx(dossier, of);
    if (!x.jours.length) { Toast.show('Renseignez au moins une date de formation', 'warning'); return; }
    const num = await this._docNum('REL');
    const doc = this._newDoc();

    let y = this._header(doc, of);
    y = this._title(doc, y, 'Relevé de connexion et attestation d\'assiduité',
      `${dossier.trainingSubject} — formation à distance (classe virtuelle synchrone) — art. L. 6353-1 et D. 6313-3-1 du Code du travail`);

    y = this._band(doc, y, '1. Informations générales');
    y = this._kv(doc, y, [
      ['Intitulé de la formation', dossier.trainingSubject],
      ['Entreprise bénéficiaire', `${dossier.companyName}${dossier.siret ? ` — SIRET ${dossier.siret}` : ''}`],
      ['Référence / financeur', `${num} — ${x.opcoLabel}${dossier.numeroConvention ? ` — convention n° ${dossier.numeroConvention}` : ''}`],
      ['Période', `${x.periode} — ${this._fmtH(x.heures)} au total (${this._fmtH(x.hParJ)} par journée)`],
      ['Plateforme utilisée', dossier.plateforme || '[ ] Google Meet   [ ] Zoom   [ ] Microsoft Teams   [ ] Autre : ______________'],
      ['Formateur', x.formateur]
    ]);

    y = this._band(doc, y, '2. Relevé de connexion (une ligne par stagiaire et par journée)');
    const rows = [];
    const noms = x.stagiaires.length ? x.stagiaires.map(t => `${t.lastName || ''} ${t.firstName || ''}`.trim()) : ['', '', ''];
    x.jours.forEach(j => noms.forEach(n => rows.push([n, new Date(j + 'T00:00').toLocaleDateString('fr-FR'), '', '', '', '', ''])));
    y = this._prog(doc, y,
      ['Nom et prénom', 'Date', 'Connexion', 'Déconnexion', 'Durée', 'Activités réalisées', 'Visa / signature électronique'],
      rows, { widths: [42, 20, 20, 22, 16, 30, 32], minH: 8.5, headSize: 7.5, bodySize: 8,
              totals: [[{ content: 'TOTAL heures réalisées', colSpan: 4 }, '', '', '']] });

    y = this._band(doc, y, '3. Attestation d\'assiduité du formateur');
    y = this._box(doc, y, [
      `Je soussigné(e) ${x.formateur}, formateur / formatrice pour ${of.nom}, atteste que les stagiaires listés ci-dessus ont participé à la formation à distance « ${dossier.trainingSubject} » aux dates et durées indiquées, que l'assistance technique et pédagogique a été assurée tout au long de chaque session et que les activités pédagogiques mentionnées ont été réalisées.`,
      'Pièces conservées par l\'organisme : journal de connexion exporté de la plateforme, captures d\'écran horodatées, travaux rendus par les stagiaires.',
      'Fait à ______________________, le ____ / ____ / ______            Signature :'
    ]);

    this._finalize(doc, of);
    this._showPreview(doc, dossier, of, 'RELEVE', `Releve_connexion_${num}_${this._slug(dossier.companyName)}`, false);
  },

  /* ══════════════════════════════════════════════════════════════════════
     CERTIFICAT DE RÉALISATION — une page par stagiaire
  ══════════════════════════════════════════════════════════════════════ */
  async genererCertificat(dossier) {
    const of  = await this._getOFProfile();
    const x   = this._ctx(dossier, of);
    if (!x.stagiaires.length) { Toast.show('Ajoutez au moins un stagiaire au dossier', 'warning'); return; }
    const num = await this._docNum('CER');
    const doc = this._newDoc();
    const nature = { presentiel:'Présentiel', distanciel:'À distance', mixte:'Mixte' }[dossier.modalite] || 'Présentiel';

    x.stagiaires.forEach((t, idx) => {
      if (idx > 0) doc.addPage();
      const nom = `${t.firstName || ''} ${t.lastName || ''}`.trim();
      let y = this._header(doc, of);
      y = this._title(doc, y, 'Certificat de réalisation',
        `N° ${num}-${String(idx + 1).padStart(2, '0')} — établi conformément à l'article L. 6353-1 du Code du travail et au modèle du ministère du Travail`);

      y = this._band(doc, y, '1. Déclaration de l\'organisme de formation');
      y = this._para(doc, y,
        `Je soussigné(e) ${of.dirigeant || '______________________'}, représentant(e) légal(e) de l'organisme de formation ${of.nom}${of.adresse ? `, ${of.adresse}` : ''}${of.siret ? `, SIRET ${of.siret}` : ''}, déclaré sous le numéro d'activité ${of.da || '__________'} (cet enregistrement ne vaut pas agrément de l'État), atteste que :`);

      y = this._band(doc, y, '2. Action de formation réalisée');
      y = this._kv(doc, y, [
        ['Nom et prénom du stagiaire', nom],
        ['Entreprise / employeur', `${dossier.companyName}${dossier.siret ? ` — SIRET ${dossier.siret}` : ''}`],
        ['Nature de l\'action', 'Action de formation (art. L. 6313-1 du Code du travail)'],
        ['Intitulé de l\'action', dossier.trainingSubject],
        ['Modalité de réalisation', `${nature}${dossier.modalite === 'presentiel' ? '' : ' — classe virtuelle synchrone'}`],
        ['Période de réalisation', x.periode],
        ['Durée réalisée', `______ heures sur ${this._fmtH(x.heures)} prévues`],
        ['Financeur', `${x.opcoLabel}${dossier.numeroConvention ? ` — convention n° ${dossier.numeroConvention}` : ''}${dossier.numeroDossierOpco ? ` — dossier n° ${dossier.numeroDossierOpco}` : ''}`]
      ]);
      y = this._para(doc, y, `a suivi l'action de formation mentionnée ci-dessus. Les justificatifs (feuilles d'émargement ou relevés de connexion, évaluations) sont conservés par ${of.nom} et tenus à la disposition du financeur et des autorités de contrôle.`);

      y = this._band(doc, y, '3. Signatures');
      y = this._para(doc, y, 'Fait à ______________________, le ____ / ____ / ______.');
      this._signatures(doc, y, [
        { titre: `Pour l'Organisme de Formation — ${of.nom}`, lignes: [of.dirigeant || '', 'Cachet et signature :'] },
        { titre: 'Le stagiaire', lignes: [nom, 'Signature :'] }
      ]);
    });

    this._finalize(doc, of);
    this._showPreview(doc, dossier, of, 'CERTIFICAT', `Certificat_realisation_${num}_${this._slug(dossier.companyName)}`, false);
  },

  /* ══════════════════════════════════════════════════════════════════════
     BLOCS DE CONTENU RÉUTILISABLES
  ══════════════════════════════════════════════════════════════════════ */

  _ofRows(of) {
    return [
      ['Raison sociale', of.nom],
      ['Adresse', of.adresse || '—'],
      ['SIRET / Code NAF', [of.siret, of.naf].filter(Boolean).join(' — ') || '—'],
      ['Déclaration d\'activité', of.da ? `N° ${of.da} — cet enregistrement ne vaut pas agrément de l'État` : '—'],
      ['Certification', of.qualiopi ? `Qualiopi n° ${of.qualiopi} — actions de formation${of.qualiopiFin ? ` (valable jusqu'au ${new Date(of.qualiopiFin + 'T00:00').toLocaleDateString('fr-FR')})` : ''}` : 'Qualiopi — actions de formation'],
      ['Représenté par', [of.dirigeant, of.tel, of.email].filter(Boolean).join(' — ') || '—']
    ];
  },

  _clientRows(dossier, x) {
    return [
      ['Raison sociale', dossier.companyName || '—'],
      ['Adresse', dossier.address || '—'],
      ['SIRET / Code NAF', [dossier.siret, dossier.codeNaf].filter(Boolean).join(' — ') || '—'],
      ['Représentée par', dossier.nomGerant || '—'],
      ['Contact', [dossier.phone, dossier.email].filter(Boolean).join(' — ') || '—'],
      ['OPCO / IDCC', `${x.opcoLabel}${dossier.idcc ? ` — IDCC ${dossier.idcc}` : ''}`]
    ];
  },

  /** Lignes TOTAL HT / TVA / NET : le libellé fusionne les (ncols-1) premières colonnes */
  _totalRows(price, x, of, ncols = 4) {
    const row = (lib, val) => [{ content: lib, colSpan: ncols - 1 }, { content: val, styles: { halign: 'right' } }];
    return [
      row('TOTAL HT', this._fmtEuro(price)),
      row(x.tvaTxt, this._fmtEuro(x.tvaMontant)),
      row(of.tva ? 'TOTAL TTC — NET À PAYER' : 'NET À PAYER', this._fmtEuro((price || 0) + x.tvaMontant))
    ];
  },

  /** Objectifs : une ligne de texte = une coche verte */
  _objectifs(doc, y, texte) {
    const lignes = String(texte || '').split('\n').map(l => l.replace(/^[\s•\-–*✔✓]+/, '').trim()).filter(Boolean);
    const rows = (lignes.length ? lignes : ['Mettre en œuvre les compétences visées par la formation dans son activité professionnelle.']).map(l => ['', l]);
    return this._table(doc, y, { body: rows, widths: [8, this.W - 8], check: true });
  },

  /** Contenu : les lignes « Module / Jour / Séquence / Partie … » deviennent des titres */
  _contenuTable(doc, y, contenu, x) {
    const lignes = String(contenu || '').split('\n').map(l => l.trim()).filter(Boolean);
    if (!lignes.length) {
      return this._kv(doc, y, [['Programme', 'Le programme détaillé est remis avec la convention de formation.']]);
    }
    const isTitre = l => /^(module|jour|journ[ée]e|s[ée]quence|partie|chapitre|matin|apr[èe]s-midi|[0-9]+[.)\-–]\s)/i.test(l) && l.length < 90;
    const rows = [];
    let courant = null;
    lignes.forEach(l => {
      if (isTitre(l)) { courant = { titre: l.replace(/^[0-9]+[.)\-–]\s*/, ''), items: [] }; rows.push(courant); }
      else {
        if (!courant) { courant = { titre: '', items: [] }; rows.push(courant); }
        courant.items.push(l.replace(/^[\s•\-–*]+/, ''));
      }
    });
    const body = rows.map(r => [r.titre, r.items.map(i => `• ${i}`).join('\n')]);
    body.push(['TOTAL', `${this._fmtH(x.heures)}${x.nbJ ? ` — ${x.nbJ} jour${x.nbJ > 1 ? 's' : ''}` : ''}`]);
    return this._table(doc, y, { head: ['Séquence', 'Contenu'], body, widths: [50, this.W - 50], navyHead: true, totalLast: 1 });
  },

  /* ══════════════════════════════════════════════════════════════════════
     PRIMITIVES DE MISE EN PAGE
  ══════════════════════════════════════════════════════════════════════ */

  _newDoc() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit:'mm', format:'a4', compress:true });
    doc.setFont('helvetica', 'normal');
    return doc;
  },

  /** Saut de page si l'espace restant est insuffisant */
  _need(doc, y, h) {
    if (y + h > this.BOTTOM) { doc.addPage(); return this.TOP; }
    return y;
  },

  /** En-tête : logo + bloc coordonnées. Retourne y sous l'en-tête. */
  _header(doc, of) {
    const top = 10;
    let textX = this.ML;
    if (of.logo) {
      try {
        const p = doc.getImageProperties(of.logo);
        const maxW = 34, maxH = 26;
        const r = Math.min(maxW / p.width, maxH / p.height);
        const w = p.width * r, h = p.height * r;
        const fmt = /^data:image\/jpe?g/i.test(of.logo) ? 'JPEG' : 'PNG';
        doc.addImage(of.logo, fmt, this.ML, top + (maxH - h) / 2, w, h);
        textX = this.ML + maxW + 6;
      } catch { /* logo illisible → bloc texte seul */ }
    }
    doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...this.NAVY);
    doc.text(of.nom, textX, top + 4);
    doc.setFont('helvetica', 'normal').setFontSize(7.8).setTextColor(...this.TEXT);
    const lignes = [
      'Organisme de Formation',
      of.adresse,
      of.tel ? `Tél. : ${of.tel}` : '',
      of.email ? `Email : ${of.email}` : '',
      of.siret ? `SIRET : ${of.siret}` : '',
      [of.naf ? `Code NAF : ${of.naf}` : '', of.uai ? `N° UAI : ${of.uai}` : ''].filter(Boolean).join('   |   ')
    ].filter(Boolean);
    let ly = top + 8.2;
    lignes.forEach(l => { doc.text(l, textX, ly); ly += 3.6; });
    doc.setFont('helvetica', 'bold').setTextColor(...this.SKY);
    doc.text('Certification Qualiopi', textX, ly); ly += 3.6;
    doc.setTextColor(...this.TEXT);
    return Math.max(ly, top + 26) + 6;
  },

  /** Titre centré + sous-titre italique */
  _title(doc, y, titre, sousTitre) {
    doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(...this.NAVY);
    const t = doc.splitTextToSize(titre.toUpperCase(), this.W);
    doc.text(t, this.PAGE_W / 2, y, { align:'center' });
    y += t.length * 6.2;
    if (sousTitre) {
      doc.setFont('helvetica', 'italic').setFontSize(8.8).setTextColor(...this.STEEL);
      const s = doc.splitTextToSize(String(sousTitre), this.W);
      doc.text(s, this.PAGE_W / 2, y, { align:'center' });
      y += s.length * 4;
    }
    return y + 3;
  },

  /** Bandeau de section navy */
  _band(doc, y, titre) {
    y = this._need(doc, y, 22);                // bandeau + au moins une ligne dessous
    doc.setFillColor(...this.NAVY);
    doc.rect(this.ML, y, this.W, 7, 'F');
    doc.setFont('helvetica', 'bold').setFontSize(9.2).setTextColor(255, 255, 255);
    doc.text(titre.toUpperCase(), this.ML + 3, y + 4.8);
    return y + 10;
  },

  /** Sous-bandeau bleu acier */
  _subBand(doc, y, titre, align = 'center') {
    y = this._need(doc, y, 18);
    doc.setFillColor(...this.STEEL);
    doc.rect(this.ML, y, this.W, 6, 'F');
    doc.setFont('helvetica', 'bold').setFontSize(8.6).setTextColor(255, 255, 255);
    if (align === 'center') doc.text(titre, this.PAGE_W / 2, y + 4.1, { align:'center' });
    else doc.text(titre, this.ML + 3, y + 4.1);
    return y + 6;   // le tableau qui suit est collé au sous-bandeau
  },

  /** Tableau label / valeur */
  _kv(doc, y, rows) {
    return this._table(doc, y, { body: rows.map(([k, v]) => [k, String(v ?? '—')]), widths: [50, this.W - 50], label: true });
  },

  /** Tableau « programme » : en-tête navy, lignes alternées, lignes TOTAL */
  _prog(doc, y, head, body, o = {}) {
    const totals = o.totals || [];
    return this._table(doc, y, {
      head, body: [...body, ...totals], widths: o.widths, aligns: o.aligns, navyHead: true,
      totalLast: totals.length, minH: o.minH, headSize: o.headSize, bodySize: o.bodySize
    });
  },

  /** Moteur commun autoTable */
  _table(doc, y, o) {
    const self = this;
    const nTotal = o.totalLast || 0;
    const nBody  = o.body.length;
    const columnStyles = {};
    (o.widths || []).forEach((w, i) => { columnStyles[i] = { cellWidth: w }; });
    Object.entries(o.aligns || {}).forEach(([i, a]) => { columnStyles[i] = { ...(columnStyles[i] || {}), halign: a }; });
    if (o.label) columnStyles[0] = { ...(columnStyles[0] || {}), fontStyle:'bold', fillColor: this.LABEL, textColor: this.NAVY };

    doc.autoTable({
      startY: y,
      margin: { left: this.ML, right: this.MR, top: this.TOP, bottom: this.PAGE_H - this.BOTTOM },
      head: o.head ? [o.head] : undefined,
      body: o.body,
      theme: 'grid',
      tableWidth: this.W,
      styles: { font:'helvetica', fontSize: o.bodySize || 8.5, cellPadding: { top: 1.8, bottom: 1.8, left: 2.2, right: 2.2 },
                lineColor: this.LINE, lineWidth: 0.25, textColor: this.TEXT, valign:'middle', overflow:'linebreak',
                minCellHeight: o.minH || 0 },
      headStyles: { fillColor: o.navyHead ? this.NAVY : this.LABEL, textColor: o.navyHead ? [255,255,255] : this.NAVY,
                    fontStyle:'bold', halign: o.navyHead ? 'center' : 'left', fontSize: o.headSize || 8.5, lineColor: this.LINE, lineWidth: 0.25 },
      alternateRowStyles: o.navyHead ? { fillColor: this.ALT } : { fillColor: [255,255,255] },
      columnStyles,
      rowPageBreak: 'avoid',
      didParseCell(data) {
        if (data.section !== 'body') return;
        const isTotal = nTotal && data.row.index >= nBody - nTotal;
        if (isTotal) {
          data.cell.styles.fillColor = self.TOTAL;
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.textColor = self.NAVY;
        } else if (o.label && data.column.index === 0) {
          data.cell.styles.fillColor = self.LABEL;
        } else if (o.navyHead && data.row.index % 2 === 0) {
          data.cell.styles.fillColor = [255,255,255];
        }
        if (o.check && data.column.index === 1) data.cell.styles.fontStyle = 'normal';
      },
      didDrawCell(data) {
        if (o.check && data.section === 'body' && data.column.index === 0) self._check(doc, data.cell.x + 2.2, data.cell.y + data.cell.height / 2);
      }
    });
    return doc.lastAutoTable.finalY + 4;
  },

  /** Coche verte dessinée (les polices PDF standard n'ont pas le glyphe ✓) */
  _check(doc, x, cy) {
    doc.setDrawColor(...this.GREEN).setLineWidth(0.6);
    doc.line(x, cy, x + 1.3, cy + 1.4);
    doc.line(x + 1.3, cy + 1.4, x + 3.6, cy - 1.6);
    doc.setDrawColor(...this.LINE).setLineWidth(0.25);
  },

  /** Paragraphe justifié avec saut de page automatique */
  _para(doc, y, texte, o = {}) {
    const size = o.size || 8.8;
    doc.setFont('helvetica', o.style || 'normal').setFontSize(size).setTextColor(...(o.color || this.TEXT));
    const lh = size * 0.42;
    const lignes = doc.splitTextToSize(String(texte || ''), this.W);
    for (const l of lignes) {
      y = this._need(doc, y, lh);
      doc.setFont('helvetica', o.style || 'normal').setFontSize(size).setTextColor(...(o.color || this.TEXT));
      doc.text(l, this.ML, y);
      y += lh;
    }
    return y + 2;
  },

  /** Article : titre navy en gras puis paragraphe */
  _article(doc, y, titre, texte) {
    y = this._need(doc, y, 14);
    doc.setFont('helvetica', 'bold').setFontSize(8.8).setTextColor(...this.NAVY);
    doc.text(titre, this.ML, y);
    return this._para(doc, y + 4.2, texte);
  },

  /** Liste à puces */
  _bullets(doc, y, items) {
    const size = 8.8, lh = size * 0.42;
    for (const it of items) {
      const lignes = doc.splitTextToSize(String(it), this.W - 5);
      y = this._need(doc, y, lh * Math.min(lignes.length, 2));
      doc.setFont('helvetica', 'normal').setFontSize(size).setTextColor(...this.TEXT);
      doc.text('•', this.ML + 1, y);
      for (const l of lignes) { y = this._need(doc, y, lh); doc.text(l, this.ML + 5, y); y += lh; }
      y += 1;
    }
    return y + 1;
  },

  /** Encadré gris clair (attestations) */
  _box(doc, y, paragraphes) {
    const size = 8.8, lh = size * 0.42;
    doc.setFont('helvetica', 'normal').setFontSize(size);
    const blocs = paragraphes.map(p => doc.splitTextToSize(String(p), this.W - 8));
    const h = blocs.reduce((s, b) => s + b.length * lh + 2, 0) + 4;
    y = this._need(doc, y, h);
    doc.setFillColor(...this.LABEL).setDrawColor(...this.LINE).setLineWidth(0.3);
    doc.rect(this.ML, y, this.W, h, 'FD');
    let ty = y + 5;
    doc.setTextColor(...this.TEXT);
    blocs.forEach(b => { b.forEach(l => { doc.text(l, this.ML + 4, ty); ty += lh; }); ty += 2; });
    return y + h + 4;
  },

  /** Note en petit, grise */
  _note(doc, y, texte) {
    return this._para(doc, y, texte, { size: 7.6, color: this.MUTED });
  },

  /** Bloc signatures : 2 cadres côte à côte */
  _signatures(doc, y, blocs) {
    const h = 32;
    y = this._need(doc, y, h + 2);
    const gap = 6, w = (this.W - gap) / 2;
    blocs.slice(0, 2).forEach((b, i) => {
      const x = this.ML + i * (w + gap);
      doc.setDrawColor(...this.LINE).setLineWidth(0.3);
      doc.rect(x, y, w, h);
      doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(...this.NAVY);
      const t = doc.splitTextToSize(b.titre, w - 6);
      doc.text(t, x + 3, y + 5);
      let ly = y + 5 + t.length * 3.8;
      doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...this.TEXT);
      (b.lignes || []).filter(l => l !== undefined && l !== null && l !== '').forEach(l => {
        const s = doc.splitTextToSize(String(l), w - 6);
        doc.text(s, x + 3, ly); ly += s.length * 3.6;
      });
    });
    return y + h + 4;
  },

  /** Cadre + pied de page sur toutes les pages */
  _finalize(doc, of, mention = '') {
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      doc.setDrawColor(...this.NAVY).setLineWidth(0.4);
      doc.rect(6, 6, this.PAGE_W - 12, this.PAGE_H - 12);
      doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...this.MUTED);
      const pied = mention || [of.nom, of.siret ? `SIRET ${of.siret}` : '', of.da ? `NDA ${of.da}` : '', of.qualiopi ? `Qualiopi n° ${of.qualiopi}` : ''].filter(Boolean).join(' — ');
      doc.text(doc.splitTextToSize(pied, this.W - 30)[0] || '', this.ML, 288);
      doc.text(`Page ${i} / ${n}`, this.PAGE_W - this.MR, 288, { align:'right' });
    }
  },

  /* ══════════════════════════════════════════════════════════════════════
     PRÉVISUALISATION + EXPORT WORD
  ══════════════════════════════════════════════════════════════════════ */
  _showPreview(doc, dossier, of, docType, filename, wordExport = true) {
    const blob  = doc.output('blob');
    const url   = URL.createObjectURL(blob);
    const title = { DEVIS:'Devis', CONVENTION:'Convention de formation', PROGRAMME:'Programme de formation',
                    FACTURE:'Facture', EMARGEMENT:'Feuille d\'émargement', RELEVE:'Relevé de connexion et attestation d\'assiduité',
                    CERTIFICAT:'Certificat de réalisation' }[docType] || docType;

    const body = `
      <div class="pdf-preview-wrap">
        <iframe id="pdfPreviewIframe" src="${url}#toolbar=1&navpanes=0&view=FitH" class="pdf-preview-frame" title="Aperçu ${title}"></iframe>
        <div class="pdf-preview-fallback" id="pdfFallback" style="display:none;">
          <div style="text-align:center;padding:20px;">
            <div style="font-size:42px;margin-bottom:12px;">📄</div>
            <div style="font-weight:600;color:var(--navy);margin-bottom:8px;">Aperçu non disponible</div>
            <div style="font-size:13px;color:var(--text-muted);margin-bottom:16px;">
              Votre navigateur ne peut pas afficher le PDF directement.<br>Téléchargez-le ou ouvrez-le dans un nouvel onglet.
            </div>
            <a href="${url}" target="_blank" rel="noopener" class="btn btn-primary" style="display:inline-flex;align-items:center;gap:6px;">🔗 Ouvrir dans un nouvel onglet</a>
          </div>
        </div>
        <div class="pdf-dl-bar">
          <span class="pdf-dl-bar-label">Télécharger :</span>
          <button class="pdf-dl-btn pdf-dl-btn-pdf" id="dlPdf">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            PDF
          </button>
          ${wordExport ? `<button class="pdf-dl-btn pdf-dl-btn-doc" id="dlDoc">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            Word / Pages (.doc)
          </button>` : ''}
          <button class="pdf-dl-btn pdf-dl-btn-close" id="dlClose">Fermer</button>
        </div>
      </div>`;
    Modal.open(`👁 Aperçu — ${title}`, body, [], 'modal-preview');
    setTimeout(() => {
      const iframe = document.getElementById('pdfPreviewIframe');
      if (iframe) {
        iframe.addEventListener('error', () => {
          iframe.style.display = 'none';
          const fb = document.getElementById('pdfFallback'); if (fb) fb.style.display = 'flex';
        });
        const checkTimer = setTimeout(() => {
          try {
            if (!iframe.contentDocument && !iframe.contentWindow?.document?.body?.childNodes?.length) {
              iframe.style.display = 'none';
              const fb = document.getElementById('pdfFallback'); if (fb) fb.style.display = 'flex';
            }
          } catch {}
        }, 2500);
        iframe.addEventListener('load', () => clearTimeout(checkTimer));
      }
      document.getElementById('dlPdf')?.addEventListener('click', () => { doc.save(filename + '.pdf'); Toast.show('PDF téléchargé ✓', 'success'); });
      document.getElementById('dlDoc')?.addEventListener('click', () => this._downloadDoc(dossier, of, docType, filename));
      document.getElementById('dlClose')?.addEventListener('click', () => { URL.revokeObjectURL(url); Modal.close(); });
    }, 80);
  },

  /** Export .doc (HTML Word) — même charte, contenu simplifié */
  _downloadDoc(dossier, of, docType, filename) {
    const x = this._ctx(dossier, of);
    const today = this._today();
    const due = new Date(); due.setDate(due.getDate() + 30);
    const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const kv = rows => `<table>${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v).replace(/\n/g, '<br>')}</td></tr>`).join('')}</table>`;
    const band = t => `<h2>${esc(t)}</h2>`;
    const logoTag = of.logo ? `<img src="${of.logo}" style="max-height:60px;max-width:120px;" alt="Logo">` : '';
    const entete = `<table class="hd"><tr><td style="width:130px;border:none;">${logoTag}</td><td style="border:none;">
      <b style="color:#1F3A5F;font-size:13pt;">${esc(of.nom)}</b><br>Organisme de Formation<br>${esc(of.adresse)}<br>
      ${of.tel ? `Tél. : ${esc(of.tel)}<br>` : ''}${of.email ? `Email : ${esc(of.email)}<br>` : ''}${of.siret ? `SIRET : ${esc(of.siret)}<br>` : ''}
      <b style="color:#2E9BD6;">Certification Qualiopi</b></td></tr></table>`;
    const titre = (t, s) => `<h1>${esc(t)}</h1><p class="sub">${esc(s)}</p>`;
    const sig = (a, b) => `<table class="sig"><tr><td><b>${esc(a)}</b><br><br><br><br>Cachet et signature :</td><td><b>${esc(b)}</b><br><br><br><br>Cachet et signature :</td></tr></table>`;
    const css = `
      body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #1e293b; margin: 2cm; line-height: 1.4; }
      h1 { text-align:center; color:#1F3A5F; font-size:16pt; text-transform:uppercase; margin: 12pt 0 2pt 0; }
      .sub { text-align:center; color:#4E86B8; font-style:italic; font-size:9pt; margin: 0 0 12pt 0; }
      h2 { background:#1F3A5F; color:#fff; font-size:10pt; padding:4pt 8pt; margin: 14pt 0 6pt 0; text-transform:uppercase; }
      h3 { background:#4E86B8; color:#fff; font-size:9pt; text-align:center; padding:3pt; margin:8pt 0 0 0; }
      table { border-collapse: collapse; width: 100%; margin: 0 0 8pt 0; font-size: 9.5pt; }
      th, td { border: 1pt solid #B9C4D0; padding: 4pt 6pt; vertical-align: top; text-align: left; }
      th { background: #F2F5F8; color: #1F3A5F; width: 30%; }
      table.hd td { border: none; font-size: 8.5pt; }
      table.sig td { height: 90pt; width: 50%; }
      p { margin: 0 0 6pt 0; text-align: justify; }
      .note { font-size: 8pt; color: #475569; }`;
    let body = entete;
    const ofRows = this._ofRows(of), clRows = this._clientRows(dossier, x);
    const totalHtml = `<table><tr><th>Total HT</th><td>${this._fmtEuro(dossier.price)}</td></tr><tr><th>${esc(x.tvaTxt)}</th><td>${this._fmtEuro(x.tvaMontant)}</td></tr><tr><th>Net à payer</th><td><b>${this._fmtEuro((dossier.price || 0) + x.tvaMontant)}</b></td></tr></table>`;
    if (docType === 'DEVIS') {
      body += titre('Devis', `Devis du ${today} — valable 30 jours`) + band('1. Parties') + '<h3>Organisme de Formation</h3>' + kv(ofRows) + '<h3>Entreprise Bénéficiaire</h3>' + kv(clRows)
        + band('2. Action de formation') + kv([['Intitulé', dossier.trainingSubject], ['Modalité', x.modalite], ['Durée', x.dureeLabel], ['Dates', x.datesDetail], ['Lieu', x.lieu], ['Effectif', String(x.stagiaires.length || '—')]])
        + band('3. Montant') + totalHtml
        + band('4. Conditions') + `<p>Devis valable 30 jours. Règlement à 30 jours par virement. ${esc(x.tvaTxt)}. Organisme déclaré sous le n° ${esc(of.da)} — cet enregistrement ne vaut pas agrément de l'État.</p>`
        + band('5. Acceptation') + sig(`Pour l'Entreprise — ${dossier.companyName} (bon pour accord)`, `Pour l'Organisme — ${of.nom}`);
    } else if (docType === 'CONVENTION') {
      body += titre('Convention de formation professionnelle', 'Articles L. 6353-1, L. 6353-2 et D. 6353-1 du Code du travail')
        + band('1. Parties') + '<h3>Organisme de Formation</h3>' + kv(ofRows) + '<h3>Entreprise Bénéficiaire</h3>' + kv(clRows)
        + band('2. Objet et caractéristiques') + kv([['Intitulé', dossier.trainingSubject], ['Nature', 'Action de formation (art. L. 6313-1)'], ['Objectifs', dossier.objectifs || 'Voir programme'], ['Prérequis', dossier.prerequis || 'Aucun'], ['Durée', x.dureeLabel], ['Dates', x.datesDetail], ['Modalité', x.modalite], ['Lieu', x.lieu], ['Formateur', x.formateur], ['Effectif', String(x.stagiaires.length || '—')], ['Sanction', 'Attestation de fin de formation et certificat de réalisation']])
        + band('3. Suivi et évaluation') + `<p>Émargement par demi-journée (ou relevé de connexion à distance), évaluation des acquis, questionnaire de satisfaction, certificat de réalisation. Règlement intérieur remis avec la convention.</p>`
        + band('4. Dispositions financières') + totalHtml + `<p>Règlement à 30 jours par virement ; subrogation ${esc(x.opcoLabel)} possible. Dédit : 30 % du prix en cas d'annulation moins de 10 jours ouvrés avant le début ; abandon facturé au prorata des heures réalisées ; force majeure sans indemnité.</p>`
        + band('5. Signatures') + '<p>Fait en deux exemplaires originaux, à ____________, le ____________.</p>' + sig(`Pour l'Entreprise — ${dossier.companyName}`, `Pour l'Organisme — ${of.nom}`)
        + band('Annexe 1 — Programme') + kv([['Objectifs', dossier.objectifs || '—'], ['Contenu', dossier.contenu || '—'], ['Évaluation', dossier.evaluation || '—']])
        + band('Annexe 2 — Stagiaires') + `<ol>${x.stagiaires.map(t => `<li>${esc(t.firstName)} ${esc(t.lastName)}</li>`).join('')}</ol>`;
    } else if (docType === 'PROGRAMME') {
      body += titre('Programme de formation', dossier.trainingSubject)
        + band('1. Informations générales') + kv([['Intitulé', dossier.trainingSubject], ['Durée', x.dureeLabel], ['Dates', x.datesDetail], ['Lieu', x.lieu], ['Public visé', dossier.publicVise || 'Salariés de l\'entreprise'], ['Prérequis', dossier.prerequis || 'Aucun'], ['Modalité', x.modalite], ['Formateur', x.formateur], ['Financement', x.opcoLabel]])
        + band('2. Parties prenantes') + '<h3>Organisme de Formation</h3>' + kv(ofRows) + '<h3>Entreprise Bénéficiaire</h3>' + kv(clRows)
        + band('3. Objectifs pédagogiques') + `<p>${esc(dossier.objectifs || '—').replace(/\n/g, '<br>')}</p>`
        + band('4. Programme') + `<p>${esc(dossier.contenu || '—').replace(/\n/g, '<br>')}</p>`
        + band('5. Moyens pédagogiques') + `<p>${esc(dossier.moyens || 'Apprentissage par la pratique, démonstrations, exercices progressifs, accompagnement individualisé ; support remis au stagiaire.')}</p>`
        + band('6. Évaluation') + `<p>${esc(dossier.evaluation || 'Évaluation continue et finale des acquis ; questionnaire de satisfaction ; certificat de réalisation et attestation de fin de formation.')}</p>`
        + band('7. Signatures') + sig(`Pour l'Entreprise — ${dossier.companyName}`, `Pour l'Organisme — ${of.nom}`);
    } else if (docType === 'FACTURE') {
      body += titre('Facture', `Date : ${today} — Échéance : ${due.toLocaleDateString('fr-FR')}`)
        + band('1. Émetteur et destinataire') + '<h3>Émetteur</h3>' + kv(ofRows) + '<h3>Destinataire</h3>' + kv(clRows)
        + band('2. Détail') + kv([['Désignation', `Action de formation « ${dossier.trainingSubject} »`], ['Dates', x.datesDetail], ['Durée', this._fmtH(x.heures)], ['Stagiaires', String(x.stagiaires.length || '—')]]) + totalHtml
        + band('3. Conditions de règlement') + kv([['Échéance', due.toLocaleDateString('fr-FR')], ['Mode', `Virement${of.iban ? ' — IBAN ' + of.iban : ''}`], ['Pénalités', '3 × taux d\'intérêt légal (art. L. 441-10 C. com.)'], ['Indemnité', '40 € forfaitaires (art. D. 441-5 C. com.)'], ['Escompte', 'Aucun'], ['TVA', x.tvaTxt]]);
    } else {
      body += titre(docType, dossier.trainingSubject) + `<p>${esc(dossier.companyName)}</p>`;
    }
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${css}</style></head><body>${body}</body></html>`;
    const b = new Blob([html], { type: 'application/msword;charset=utf-8' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(b), download: filename + '.doc' });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    Toast.show('Document Word/Pages téléchargé ✓', 'success');
  },

  /* ══════════════════════════════════════════════════════════════════════
     UTILITAIRES
  ══════════════════════════════════════════════════════════════════════ */
  _today() { return new Date().toLocaleDateString('fr-FR'); },
  _fmtEuro(n) { return new Intl.NumberFormat('fr-FR', { style:'currency', currency:'EUR', maximumFractionDigits:2 }).format(n || 0); },
  _fmtH(h) { const v = Math.round(Number(h || 0) * 100) / 100; return `${String(v).replace('.', ',')} h`; },
  _dateLongue(iso) {
    const s = new Date(iso + 'T00:00').toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  },
  _calculerDuree(trainingDates) {
    const n = this._expandDates(trainingDates).length;
    return n ? (n === 1 ? '1 jour' : `${n} jours`) : 'À définir';
  },
  _expandDates(trainingDates) {
    const result = [];
    (trainingDates || []).forEach(d => {
      if (!d.start) return;
      const s = new Date(d.start + 'T00:00');
      const e = d.end ? new Date(d.end + 'T00:00') : s;
      for (let dt = new Date(s); dt <= e; dt.setDate(dt.getDate() + 1)) {
        const y = dt.getFullYear(), m = String(dt.getMonth() + 1).padStart(2, '0'), j = String(dt.getDate()).padStart(2, '0');
        result.push(`${y}-${m}-${j}`);
      }
    });
    return result;
  },
  _slug(str) { return (str || 'doc').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40); }
};
