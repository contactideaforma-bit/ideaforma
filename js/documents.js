/* ─── Documents — Génération PDF v2 (design clean & light) ─── */
/* Dépendances : jsPDF + jsPDF-AutoTable (CDN)                  */

const Documents = {

  /* ── Palette ── */
  DARK:  [30,  41,  59],   // texte principal (slate-800)
  GRAY:  [100, 116, 139],  // texte secondaire (slate-500)
  LIGHT: [248, 250, 252],  // fond léger (slate-50)
  LINE:  [226, 232, 240],  // bordures (slate-200)

  /* ── Couleur OF (dynamic) ── */
  _c(of) { return of?.color || [30, 41, 59]; },

  /* ── Numéro de document ── */
  _docNum(prefix) {
    const d    = new Date();
    const yymm = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}`;
    return `${prefix}-${yymm}-${Math.floor(Math.random()*900)+100}`;
  },

  /* ── Charger profil OF ── */
  async _getOFProfile() {
    try {
      const p = await DataStore.getProfile();
      return {
        nom:      p?.organisme        || p?.nom || 'IDEAFORMA',
        email:    p?.email            || '',
        siret:    p?.siret            || '',
        adresse:  p?.adresse          || '',
        tel:      p?.telephone        || '',
        da:       p?.numero_da        || '',
        qualiopi: p?.numero_qualiopi  || '',
        logo:     p?.logo_base64      || null,
        color:    this._hexToRgb(p?.couleur_primaire   || '#1E2D4B'),
        color2:   this._hexToRgb(p?.couleur_secondaire || '#3B82F6')
      };
    } catch {
      return { nom:'IDEAFORMA', email:'', siret:'', adresse:'', tel:'', da:'',
               qualiopi:'', logo:null, color:[30,41,59], color2:[59,130,246] };
    }
  },

  _hexToRgb(hex) {
    if (!hex || hex.length < 7) return [30, 41, 59];
    return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
  },

  /* Fond léger à partir de la couleur secondaire */
  _lightBg(of) {
    const [r,g,b] = of.color2 || [59,130,246];
    return [Math.round(r*0.09+246), Math.round(g*0.09+246), Math.round(b*0.09+246)];
  },

  /* ══════════════════════════════════════════════
     DEVIS
  ══════════════════════════════════════════════ */
  async genererDevis(dossier) {
    const { jsPDF } = window.jspdf;
    const doc       = new jsPDF({ unit:'mm', format:'a4' });
    const of        = await this._getOFProfile();
    const num       = this._docNum('DEV');
    const today     = new Date().toLocaleDateString('fr-FR');
    const opcoLabel = OpcoPage.CONFIG[dossier.opco]?.label || dossier.opco;
    const duree     = this._calculerDuree(dossier.trainingDates);

    let y = this._header(doc, of, 'DEVIS', num, today);
    y = this._biParties(doc, of, dossier, y);

    // Objet
    y = this._infoLine(doc, y, this._c(of), `Formation : « ${dossier.trainingSubject} »`);
    doc.setFontSize(8.5).setFont(undefined,'normal').setTextColor(...this.GRAY);
    doc.text(`OPCO : ${opcoLabel}   |   Durée : ${duree}   |   Valable 30 jours`, 15, y); y += 8;

    // Tableau
    doc.autoTable({
      startY: y,
      head: [['Désignation', 'Durée', 'Participants', 'Prix HT']],
      body: [[
        dossier.trainingSubject,
        duree,
        `${(dossier.trainees||[]).length || '—'} pers.`,
        this._fmtEuro(dossier.price)
      ]],
      ...this._tableTheme(of)
    });
    y = doc.lastAutoTable.finalY + 5;

    y = this._totalBox(doc, dossier.price, of, y);
    y += 4;

    if ((dossier.trainees||[]).length) {
      y = this._sectionTitle(doc, y, of, 'Participants');
      doc.autoTable({
        startY: y,
        head: [['Prénom', 'Nom']],
        body: dossier.trainees.map(t => [t.firstName, t.lastName]),
        ...this._tableTheme(of, true)
      });
      y = doc.lastAutoTable.finalY + 5;
    }

    const datesRows = (dossier.trainingDates||[]).filter(d => d.start);
    if (datesRows.length) {
      y = this._sectionTitle(doc, y, of, 'Dates de formation');
      doc.autoTable({
        startY: y,
        head: [['Début', 'Fin']],
        body: datesRows.map(d => [
          new Date(d.start+'T00:00').toLocaleDateString('fr-FR'),
          d.end ? new Date(d.end+'T00:00').toLocaleDateString('fr-FR') : '—'
        ]),
        ...this._tableTheme(of, true)
      });
      y = doc.lastAutoTable.finalY + 5;
    }

    if (y > 230) { doc.addPage(); y = 20; }
    y = this._sectionTitle(doc, y, of, 'Conditions');
    doc.setFontSize(8.5).setFont(undefined,'normal').setTextColor(...this.GRAY);
    [
      '• Devis valable 30 jours à compter de sa date d\'émission.',
      '• Règlement à 30 jours réception de facture, après réalisation.',
      '• Formation exonérée de TVA (art. 261-4-4° du Code Général des Impôts).',
      `• Organisme certifié Qualiopi${of.qualiopi ? ` — n° ${of.qualiopi}` : ''}.`
    ].forEach(l => { doc.text(l, 15, y); y += 4.5; });
    y += 4;

    if (y > 230) { doc.addPage(); y = 20; }
    this._signatures(doc, y, of, 'L\'Organisme de Formation', 'L\'Entreprise');
    this._footer(doc, of);
    doc.save(`Devis_${num}_${this._slug(dossier.companyName)}.pdf`);
    Toast.show(`Devis ${num} téléchargé ✓`, 'success');
  },

  /* ══════════════════════════════════════════════
     CONVENTION DE FORMATION
  ══════════════════════════════════════════════ */
  async genererConvention(dossier) {
    const { jsPDF } = window.jspdf;
    const doc       = new jsPDF({ unit:'mm', format:'a4' });
    const of        = await this._getOFProfile();
    const num       = this._docNum('CONV');
    const today     = new Date().toLocaleDateString('fr-FR');
    const opcoLabel = OpcoPage.CONFIG[dossier.opco]?.label || dossier.opco;
    const duree     = this._calculerDuree(dossier.trainingDates);

    let y = this._header(doc, of, 'CONVENTION DE FORMATION PROFESSIONNELLE', num, today);
    doc.setFontSize(8).setFont(undefined,'italic').setTextColor(...this.GRAY);
    doc.text('Établie conformément aux articles L.6353-1 et suivants du Code du Travail', 105, y, { align:'center' });
    y += 8;

    y = this._article(doc, y, of, 'ARTICLE 1 — PARTIES', [
      'Entre l\'organisme de formation :',
      `  ${of.nom}`,
      ...(of.adresse ? [`  ${of.adresse}`] : []),
      ...(of.siret   ? [`  SIRET : ${of.siret}`] : []),
      ...(of.da      ? [`  N° Déclaration d'activité : ${of.da}`] : []),
      '',
      'Et l\'entreprise commanditaire :',
      `  ${dossier.companyName}`,
      ...(dossier.address  ? [`  ${dossier.address}`] : []),
      ...(dossier.siret    ? [`  SIRET : ${dossier.siret}`] : []),
      ...(dossier.nomGerant? [`  Représentant légal : ${dossier.nomGerant}`] : []),
      ...(dossier.idcc     ? [`  Convention collective IDCC : ${dossier.idcc}`] : []),
    ]);

    y = this._article(doc, y, of, 'ARTICLE 2 — OBJET', [
      'La présente convention porte sur la réalisation de l\'action de formation :',
      `  « ${dossier.trainingSubject} »`,
      '',
      `Financement OPCO : ${opcoLabel}`,
    ]);

    const datesStr = (dossier.trainingDates||[]).filter(d => d.start)
      .map(d => {
        const s = new Date(d.start+'T00:00').toLocaleDateString('fr-FR');
        const e = d.end ? new Date(d.end+'T00:00').toLocaleDateString('fr-FR') : null;
        return e && e!==s ? `du ${s} au ${e}` : `le ${s}`;
      }).join(', ') || 'Dates à définir';

    const modalLabels = { presentiel:'Présentiel', distanciel:'Distanciel', mixte:'Mixte' };

    y = this._article(doc, y, of, 'ARTICLE 3 — PROGRAMME ET MODALITÉS', [
      `Durée : ${duree}`,
      `Dates : ${datesStr}`,
      `Modalité : ${modalLabels[dossier.modalite] || 'Présentiel'}`,
      `Lieu : À préciser`,
      ...(dossier.objectifs ? ['', 'Objectifs pédagogiques :', ...dossier.objectifs.split('\n').map(l => `  ${l}`)] : []),
    ]);

    y = this._article(doc, y, of, 'ARTICLE 4 — PARTICIPANTS', [
      `Nombre de stagiaires : ${(dossier.trainees||[]).length || '—'}`,
      ...(dossier.trainees||[]).map((t,i) => `  ${i+1}. ${t.firstName} ${t.lastName}`),
    ]);

    if (y > 210) { doc.addPage(); y = 20; }

    y = this._article(doc, y, of, 'ARTICLE 5 — CONDITIONS FINANCIÈRES', [
      `Coût total HT : ${this._fmtEuro(dossier.price)}`,
      'Exonéré de TVA (article 261-4-4° du Code Général des Impôts).',
      '',
      'Modalités : Paiement à 30 jours réception de facture.',
      `Dans le cadre d'une prise en charge ${opcoLabel}, la facturation sera adressée directement à l'OPCO.`,
    ]);

    y = this._article(doc, y, of, 'ARTICLE 6 — CERTIFICATION QUALITÉ', [
      `L'organisme de formation est certifié Qualiopi${of.qualiopi ? ` (n° ${of.qualiopi})` : ''}.`,
      'Cette certification est délivrée au titre des actions de formation.',
    ]);

    y = this._article(doc, y, of, 'ARTICLE 7 — RÉSILIATION', [
      'En cas d\'abandon par le stagiaire ou de défaillance de l\'entreprise, les sommes versées restent dues,',
      'sauf cas de force majeure dûment reconnu.',
    ]);

    if (y > 235) { doc.addPage(); y = 20; }
    y += 4;
    doc.setFontSize(8.5).setFont(undefined,'italic').setTextColor(...this.GRAY);
    doc.text('Fait en deux exemplaires originaux — chaque partie reconnaît en avoir reçu un exemplaire', 105, y, { align:'center' }); y += 4;
    doc.text(`À ________________, le ________________`, 105, y, { align:'center' }); y += 10;
    this._signatures(doc, y, of, `L\'Organisme de Formation\n${of.nom}`, `L\'Entreprise\n${dossier.companyName}`);
    this._footer(doc, of);
    doc.save(`Convention_${num}_${this._slug(dossier.companyName)}.pdf`);
    Toast.show(`Convention ${num} téléchargée ✓`, 'success');
  },

  /* ══════════════════════════════════════════════
     PROGRAMME PÉDAGOGIQUE
  ══════════════════════════════════════════════ */
  async genererProgramme(dossier) {
    const { jsPDF } = window.jspdf;
    const doc       = new jsPDF({ unit:'mm', format:'a4' });
    const of        = await this._getOFProfile();
    const num       = this._docNum('PROG');
    const today     = new Date().toLocaleDateString('fr-FR');
    const opcoLabel = OpcoPage.CONFIG[dossier.opco]?.label || dossier.opco;
    const duree     = this._calculerDuree(dossier.trainingDates);
    const c         = this._c(of);
    const modalLabels = { presentiel:'Présentiel', distanciel:'Distanciel', mixte:'Mixte' };

    let y = this._header(doc, of, 'PROGRAMME PÉDAGOGIQUE', num, today);

    // Titre formation
    doc.setFontSize(13).setFont(undefined,'bold').setTextColor(...c);
    doc.text(dossier.trainingSubject, 105, y, { align:'center' }); y += 6;
    doc.setFontSize(8.5).setFont(undefined,'normal').setTextColor(...this.GRAY);
    doc.text(`${opcoLabel}  ·  ${duree}  ·  ${modalLabels[dossier.modalite] || 'Présentiel'}`, 105, y, { align:'center' }); y += 10;

    // Tableau infos générales
    y = this._sectionTitle(doc, y, of, 'Informations générales');
    const infoRows = [
      ['Organisme de formation', `${of.nom}${of.da ? ` — N° DA : ${of.da}` : ''}`],
      ['Certification',          of.qualiopi ? `Qualiopi n° ${of.qualiopi}` : 'Certifié Qualiopi'],
      ['Entreprise',             `${dossier.companyName}${dossier.siret ? ` — SIRET : ${dossier.siret}` : ''}`],
      ['Responsable légal',      dossier.nomGerant  || 'À préciser'],
      ['Convention collective',  dossier.idcc ? `IDCC ${dossier.idcc}` : 'À préciser'],
      ['OPCO',                   opcoLabel],
      ['Durée',                  duree],
      ['Modalité',               modalLabels[dossier.modalite] || 'Présentiel'],
      ['Tarif HT',               this._fmtEuro(dossier.price)],
      ['Dates', (dossier.trainingDates||[]).filter(d => d.start).map(d => {
        const s = new Date(d.start+'T00:00').toLocaleDateString('fr-FR');
        const e = d.end ? new Date(d.end+'T00:00').toLocaleDateString('fr-FR') : null;
        return e && e!==s ? `du ${s} au ${e}` : s;
      }).join(', ') || 'À définir'],
    ];
    doc.autoTable({
      startY: y,
      body: infoRows,
      columnStyles: { 0: { fontStyle:'bold', cellWidth:60, textColor:c }, 1: { cellWidth:120 } },
      ...this._tableTheme(of, true)
    });
    y = doc.lastAutoTable.finalY + 6;

    // Public visé
    const publicVise = (dossier.trainees||[]).length
      ? (dossier.trainees||[]).map(t => `${t.firstName} ${t.lastName}`).join(', ')
      : 'Salariés de l\'entreprise';
    y = this._textBlock(doc, y, of, 'Public visé', publicVise);

    // Prérequis
    y = this._textBlock(doc, y, of, 'Prérequis', dossier.prerequis || 'Aucun prérequis particulier.');

    // Objectifs
    if (y > 220) { doc.addPage(); y = 20; }
    y = this._textBlock(doc, y, of, 'Objectifs pédagogiques',
      dossier.objectifs || 'À l\'issue de la formation, les participants auront acquis les compétences visées.');

    // Programme
    if (y > 200) { doc.addPage(); y = 20; }
    y = this._textBlock(doc, y, of, 'Programme détaillé',
      dossier.contenu || 'Le programme détaillé est joint à la convention de formation.');

    // Méthodes
    if (y > 220) { doc.addPage(); y = 20; }
    y = this._textBlock(doc, y, of, 'Méthodes pédagogiques',
      'Apports théoriques et pratiques, exercices d\'application, mises en situation professionnelle, échanges et retours d\'expériences.');

    // Évaluation
    y = this._textBlock(doc, y, of, 'Modalités d\'évaluation',
      dossier.evaluation || 'Évaluation formative continue. Bilan de compétences en fin de formation. Attestation de formation délivrée à chaque participant.');

    // Accessibilité
    if (y > 235) { doc.addPage(); y = 20; }
    y = this._textBlock(doc, y, of, 'Accessibilité',
      'Notre organisme est attentif à l\'accueil des personnes en situation de handicap. Contactez-nous pour tout aménagement spécifique.');

    this._footer(doc, of);
    doc.save(`Programme_${num}_${this._slug(dossier.companyName)}.pdf`);
    Toast.show(`Programme pédagogique ${num} téléchargé ✓`, 'success');
  },

  /* ══════════════════════════════════════════════
     FEUILLES DE PRÉSENCE
  ══════════════════════════════════════════════ */
  async genererFeuillesPresence(dossier) {
    const { jsPDF } = window.jspdf;
    const of        = await this._getOFProfile();
    const jours     = this._expandDates(dossier.trainingDates);
    const c         = this._c(of);

    if (!jours.length) { Toast.show('Aucune date renseignée', 'warning'); return; }

    const doc = new jsPDF({ unit:'mm', format:'a4' });

    jours.forEach((jour, idx) => {
      if (idx > 0) doc.addPage();
      const dateLabel = new Date(jour+'T00:00').toLocaleDateString('fr-FR',
        { weekday:'long', day:'numeric', month:'long', year:'numeric' });

      // En-tête léger
      doc.setDrawColor(...c).setLineWidth(1.5);
      doc.line(15, 10, 15, 32);
      doc.setLineWidth(0.2).setDrawColor(...this.LINE);

      doc.setFontSize(16).setFont(undefined,'bold').setTextColor(...c);
      doc.text('FEUILLE DE PRÉSENCE', 22, 18);
      doc.setFontSize(9).setFont(undefined,'normal').setTextColor(...this.GRAY);
      doc.text(of.nom, 22, 24);
      if (of.logo) { try { doc.addImage(of.logo, 'auto', 165, 6, 30, 22); } catch {} }

      doc.setDrawColor(...this.LINE).setLineWidth(0.4);
      doc.line(15, 35, 195, 35);

      let y = 43;
      doc.setFontSize(10).setFont(undefined,'bold').setTextColor(...this.DARK);
      doc.text(dossier.trainingSubject, 15, y); y += 5;
      doc.setFont(undefined,'normal').setFontSize(9).setTextColor(...this.GRAY);
      doc.text(`Entreprise : ${dossier.companyName}   ·   ${dateLabel.charAt(0).toUpperCase()+dateLabel.slice(1)}   ·   Feuille ${idx+1}/${jours.length}`, 15, y); y += 8;

      // Tableau émargement
      let rows = (dossier.trainees||[]).map(t => [t.firstName, t.lastName, '', '']);
      while (rows.length < 10) rows.push(['','','','']);

      doc.autoTable({
        startY: y,
        head: [['Prénom', 'Nom', 'Signature matin', 'Signature après-midi']],
        body: rows,
        columnStyles: {
          0: { cellWidth: 35 },
          1: { cellWidth: 40 },
          2: { cellWidth: 55, cellHeight: 14 },
          3: { cellWidth: 55, cellHeight: 14 }
        },
        bodyStyles:   { minCellHeight: 14 },
        headStyles:   { fillColor: this.LIGHT, textColor: c, fontStyle:'bold', fontSize:9, lineColor: this.LINE, lineWidth: 0.3 },
        alternateRowStyles: { fillColor: [252, 253, 255] },
        styles: { fontSize:9, cellPadding:3, lineColor: this.LINE, lineWidth: 0.2 }
      });

      y = doc.lastAutoTable.finalY + 10;

      // Signature formateur
      doc.setFontSize(9).setFont(undefined,'bold').setTextColor(...this.DARK);
      doc.text('Formateur', 15, y); y += 4;
      doc.setFontSize(8.5).setFont(undefined,'normal').setTextColor(...this.GRAY);
      doc.text('Nom : _______________________________  Prénom : _______________________________', 15, y); y += 6;
      doc.setDrawColor(...this.LINE).setLineWidth(0.4);
      doc.rect(15, y, 85, 20);
      doc.setFontSize(7.5).setTextColor(...this.GRAY);
      doc.text('Cachet et signature', 15, y - 1);

      // Footer
      doc.setFontSize(7.5).setTextColor(...this.GRAY);
      doc.text(`${of.nom}${of.siret ? ' · SIRET : '+of.siret : ''}${of.da ? ' · N° DA : '+of.da : ''}`, 105, 287, { align:'center' });
    });

    doc.save(`Presences_${this._slug(dossier.companyName)}.pdf`);
    Toast.show(`${jours.length} feuille(s) de présence téléchargée(s) ✓`, 'success');
  },

  /* ══════════════════════════════════════════════
     FACTURE
  ══════════════════════════════════════════════ */
  async genererFacture(dossier) {
    const { jsPDF } = window.jspdf;
    const doc       = new jsPDF({ unit:'mm', format:'a4' });
    const of        = await this._getOFProfile();
    const num       = this._docNum('FACT');
    const today     = new Date().toLocaleDateString('fr-FR');
    const due       = new Date(); due.setDate(due.getDate()+30);
    const dueStr    = due.toLocaleDateString('fr-FR');
    const opcoLabel = OpcoPage.CONFIG[dossier.opco]?.label || dossier.opco;
    const duree     = this._calculerDuree(dossier.trainingDates);

    let y = this._header(doc, of, 'FACTURE', num, today);

    // Échéance inline
    doc.setFontSize(8.5).setFont(undefined,'normal').setTextColor(...this.GRAY);
    doc.text(`Échéance : ${dueStr}`, 195, y - 5, { align:'right' });

    y = this._biParties(doc, of, dossier, y, `Destinataire — ${opcoLabel}`);

    // Tableau facturation
    const datesStr = (dossier.trainingDates||[]).filter(d => d.start)
      .map(d => {
        const s = new Date(d.start+'T00:00').toLocaleDateString('fr-FR');
        const e = d.end ? new Date(d.end+'T00:00').toLocaleDateString('fr-FR') : null;
        return e && e!==s ? `${s} → ${e}` : s;
      }).join('\n') || 'À définir';

    doc.autoTable({
      startY: y,
      head: [['Désignation', 'Dates', 'Durée', 'Pers.', 'Montant HT']],
      body: [[
        dossier.trainingSubject, datesStr, duree,
        String((dossier.trainees||[]).length || '—'),
        this._fmtEuro(dossier.price)
      ]],
      columnStyles: {
        0: { cellWidth:62 }, 1: { cellWidth:44 },
        2: { cellWidth:26 }, 3: { cellWidth:16, halign:'center' },
        4: { cellWidth:30, halign:'right' }
      },
      ...this._tableTheme(of)
    });
    y = doc.lastAutoTable.finalY + 5;

    y = this._totalBox(doc, dossier.price, of, y);
    y += 5;

    if ((dossier.trainees||[]).length) {
      doc.setFontSize(8.5).setFont(undefined,'bold').setTextColor(...this.DARK);
      doc.text('Participants formés :', 15, y); y += 4;
      doc.setFont(undefined,'normal').setTextColor(...this.GRAY);
      dossier.trainees.forEach((t, i) => { doc.text(`  ${i+1}. ${t.firstName} ${t.lastName}`, 15, y); y += 4; });
      y += 3;
    }

    if (y > 245) { doc.addPage(); y = 20; }
    doc.setFontSize(8.5).setFont(undefined,'normal').setTextColor(...this.GRAY);
    [
      `Date d'échéance de paiement : ${dueStr}`,
      'Modalité de règlement : Virement bancaire.',
      'Pénalités de retard : taux légal × 3 — Indemnité forfaitaire de recouvrement : 40 €.',
      'Exonéré de TVA — Article 261-4-4° du Code Général des Impôts.',
      ...(of.qualiopi ? [`Organisme certifié Qualiopi n° ${of.qualiopi}.`] : [])
    ].forEach(l => { doc.text(l, 15, y); y += 4.5; });

    this._footer(doc, of);
    doc.save(`Facture_${num}_${this._slug(dossier.companyName)}.pdf`);
    Toast.show(`Facture ${num} téléchargée ✓`, 'success');
  },

  /* ══════════════════════════════════════════════
     COMPOSANTS VISUELS PARTAGÉS
  ══════════════════════════════════════════════ */

  /** En-tête clean — logo visible, aucun chevauchement */
  _header(doc, of, docType, num, date) {
    const c      = this._c(of);
    const hasLogo = !!(of.logo);

    /* ── Logo (haut gauche, max 40×30 mm) ── */
    let logoH = 0;
    if (hasLogo) {
      try {
        doc.addImage(of.logo, 'auto', 14, 6, 40, 30);
        logoH = 30;
      } catch { /* logo invalide → on passe en mode texte */ }
    }

    /* ── Titre document (haut droite) ── */
    doc.setFontSize(17).setFont(undefined,'bold').setTextColor(...c);
    doc.text(docType, 196, 14, { align:'right' });
    doc.setFontSize(8.5).setFont(undefined,'normal').setTextColor(...this.GRAY);
    doc.text(`N° ${num}   ·   ${date}`, 196, 21, { align:'right' });

    /* ── Identité OF (sous le logo, ou à gauche si pas de logo) ── */
    const infoY = hasLogo && logoH > 0 ? 6 + logoH + 4 : 14;
    const infoX = 14;
    if (!hasLogo || logoH === 0) {
      doc.setFontSize(10).setFont(undefined,'bold').setTextColor(...this.DARK);
      doc.text(of.nom, infoX, infoY);
      doc.setFontSize(7.5).setFont(undefined,'normal').setTextColor(...this.GRAY);
      const sub = [of.siret?`SIRET : ${of.siret}`:'', of.da?`N° DA : ${of.da}`:'']
        .filter(Boolean).join('   ·   ');
      if (sub) doc.text(sub, infoX, infoY + 4.5);
    }

    /* ── Ligne séparatrice ── */
    const sepY = hasLogo && logoH > 0
      ? Math.max(infoY + 2, 38)   // sous le logo
      : infoY + 11;               // sous le texte OF

    doc.setDrawColor(...c).setLineWidth(1);
    doc.line(14, sepY, 196, sepY);
    doc.setDrawColor(...this.LINE).setLineWidth(0.2);

    return sepY + 6;
  },

  /** Bloc bipartites (émetteur + destinataire) */
  _biParties(doc, of, dossier, y, rightLabel = 'Destinataire') {
    const c = this._c(of);

    doc.setFontSize(7.5).setFont(undefined,'bold').setTextColor(...this.GRAY);
    doc.text('ÉMETTEUR', 15, y);
    doc.text(rightLabel.toUpperCase(), 115, y);
    y += 2;

    doc.setDrawColor(...this.LINE).setLineWidth(0.3);
    doc.line(15, y, 100, y);
    doc.line(115, y, 195, y);
    y += 4;

    // Colonne gauche — OF
    doc.setFontSize(9).setFont(undefined,'bold').setTextColor(...this.DARK);
    doc.text(of.nom, 15, y);
    doc.setFontSize(8.5).setFont(undefined,'normal').setTextColor(...this.GRAY);
    let ly = y + 4;
    if (of.adresse) { doc.text(of.adresse,           15, ly); ly += 3.8; }
    if (of.siret)   { doc.text(`SIRET : ${of.siret}`, 15, ly); ly += 3.8; }
    if (of.da)      { doc.text(`N° DA : ${of.da}`,    15, ly); ly += 3.8; }
    if (of.tel)     { doc.text(`Tél : ${of.tel}`,     15, ly); ly += 3.8; }
    if (of.email)   { doc.text(of.email,              15, ly); ly += 3.8; }

    // Colonne droite — Client
    doc.setFontSize(9).setFont(undefined,'bold').setTextColor(...this.DARK);
    doc.text(dossier.companyName, 115, y);
    doc.setFontSize(8.5).setFont(undefined,'normal').setTextColor(...this.GRAY);
    let ry = y + 4;
    if (dossier.address)   { doc.text(dossier.address,              115, ry); ry += 3.8; }
    if (dossier.siret)     { doc.text(`SIRET : ${dossier.siret}`,   115, ry); ry += 3.8; }
    if (dossier.nomGerant) { doc.text(`Gérant : ${dossier.nomGerant}`, 115, ry); ry += 3.8; }
    if (dossier.phone)     { doc.text(`Tél : ${dossier.phone}`,     115, ry); ry += 3.8; }
    if (dossier.email)     { doc.text(dossier.email,                115, ry); ry += 3.8; }

    const finalY = Math.max(ly, ry) + 5;
    doc.setDrawColor(...this.LINE).setLineWidth(0.3);
    doc.line(14, finalY, 196, finalY);
    return finalY + 5;
  },

  /** Titre de section — barre couleur secondaire gauche, fond léger */
  _sectionTitle(doc, y, of, title) {
    if (y > 258) { doc.addPage(); y = 20; }
    const c  = this._c(of);
    const bg = this._lightBg(of);
    doc.setFillColor(...bg);
    doc.rect(14, y - 2, 182, 8, 'F');
    doc.setFillColor(...(of.color2 || c));
    doc.rect(14, y - 2, 3, 8, 'F');
    doc.setFontSize(8.5).setFont(undefined,'bold').setTextColor(...c);
    doc.text(title, 20, y + 3.5);
    return y + 10;
  },

  /** Info line (une ligne colorée pour un objet / sujet) */
  _infoLine(doc, y, c, text) {
    doc.setFontSize(10).setFont(undefined,'bold').setTextColor(...c);
    doc.text(text, 15, y);
    return y + 6;
  },

  /** Article numéroté */
  _article(doc, y, of, title, lines) {
    if (y > 258) { doc.addPage(); y = 20; }
    const c  = this._c(of);
    const bg = this._lightBg(of);

    doc.setFillColor(...bg);
    doc.rect(14, y - 2, 182, 8, 'F');
    doc.setFillColor(...(of.color2 || c));
    doc.rect(14, y - 2, 3, 8, 'F');
    doc.setFontSize(8.5).setFont(undefined,'bold').setTextColor(...c);
    doc.text(title, 20, y + 3.5);
    y += 10;

    doc.setFontSize(8.5).setFont(undefined,'normal').setTextColor(60, 65, 80);
    lines.forEach(line => {
      if (y > 270) { doc.addPage(); y = 20; }
      if (line !== '') {
        const wrapped = doc.splitTextToSize(line, 174);
        doc.text(wrapped, 17, y);
        y += wrapped.length * 4.2;
      } else {
        y += 2.5;
      }
    });
    return y + 5;
  },

  /** Bloc texte (section + contenu) */
  _textBlock(doc, y, of, title, text) {
    if (y > 252) { doc.addPage(); y = 20; }
    const c  = this._c(of);
    const bg = this._lightBg(of);

    doc.setFillColor(...bg);
    doc.rect(14, y - 2, 182, 8, 'F');
    doc.setFillColor(...(of.color2 || c));
    doc.rect(14, y - 2, 3, 8, 'F');
    doc.setFontSize(8.5).setFont(undefined,'bold').setTextColor(...c);
    doc.text(title, 20, y + 3.5);
    y += 10;

    doc.setFontSize(8.5).setFont(undefined,'normal').setTextColor(60, 65, 80);
    const lines = String(text || '—').split('\n');
    lines.forEach(line => {
      if (y > 270) { doc.addPage(); y = 20; }
      const wrapped = doc.splitTextToSize(line || ' ', 174);
      doc.text(wrapped, 17, y);
      y += wrapped.length * 4.2;
    });
    return y + 6;
  },

  /** Encadré total (prix) — ligne fine, fond blanc */
  _totalBox(doc, price, of, y) {
    const c = this._c(of);
    doc.setDrawColor(...c).setLineWidth(0.8);
    doc.line(130, y, 196, y);
    doc.setLineWidth(0.2).setDrawColor(...this.LINE);

    doc.setFontSize(8.5).setFont(undefined,'normal').setTextColor(...this.GRAY);
    doc.text('Montant HT :', 133, y + 6);
    doc.text('TVA (art. 261-4-4° CGI) :', 133, y + 11);
    doc.setFontSize(9.5).setFont(undefined,'bold').setTextColor(...c);
    doc.text('Total à payer :', 133, y + 17);

    doc.setFontSize(8.5).setFont(undefined,'normal').setTextColor(...this.GRAY);
    doc.text(this._fmtEuro(price), 193, y + 6,  { align:'right' });
    doc.text('0,00 €',             193, y + 11, { align:'right' });
    doc.setFontSize(9.5).setFont(undefined,'bold').setTextColor(...c);
    doc.text(this._fmtEuro(price), 193, y + 17, { align:'right' });

    doc.setDrawColor(...c).setLineWidth(0.8);
    doc.line(130, y + 20, 196, y + 20);

    return y + 24;
  },

  /** Zone de signatures */
  _signatures(doc, y, of, leftLabel, rightLabel) {
    if (y > 245) { doc.addPage(); y = 20; }
    const c = this._c(of);

    doc.setDrawColor(...this.LINE).setLineWidth(0.3);
    doc.line(14, y, 196, y);
    y += 6;

    doc.setFontSize(8.5).setFont(undefined,'italic').setTextColor(...this.GRAY);
    doc.text('À ________________,   le ________________', 105, y, { align:'center' }); y += 8;

    const leftLines  = leftLabel.split('\n');
    const rightLines = rightLabel.split('\n');

    doc.setFont(undefined,'bold').setFontSize(8.5).setTextColor(...this.DARK);
    leftLines.forEach((l,i)  => doc.text(l, 15,  y + i*4));
    rightLines.forEach((l,i) => doc.text(l, 115, y + i*4));

    const off = Math.max(leftLines.length, rightLines.length) * 4 + 3;
    doc.setFontSize(7.5).setFont(undefined,'normal').setTextColor(...this.GRAY);
    doc.text('Signature et cachet :', 15,  y + off);
    doc.text('Signature et cachet :', 115, y + off);

    doc.setDrawColor(...this.LINE).setLineWidth(0.4);
    doc.rect(15,  y + off + 2, 85, 24);
    doc.rect(115, y + off + 2, 80, 24);

    return y + off + 30;
  },

  /** Thème tableau — utilise la couleur secondaire pour l'en-tête */
  _tableTheme(of, compact = false) {
    const c  = this._c(of);
    const bg = this._lightBg(of);
    return {
      headStyles: {
        fillColor: bg,
        textColor: c,
        fontStyle: 'bold',
        fontSize:  9,
        lineColor: this.LINE,
        lineWidth: 0.3
      },
      bodyStyles: {
        fontSize:  8.5,
        textColor: this.DARK,
        lineColor: this.LINE,
        lineWidth: 0.2
      },
      alternateRowStyles: { fillColor: [252, 253, 255] },
      styles: { cellPadding: compact ? 2.5 : 3.5 },
      margin: { left: 14, right: 14 }
    };
  },

  /** Footer paginé */
  _footer(doc, of) {
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      doc.setDrawColor(...this.LINE).setLineWidth(0.3);
      doc.line(14, 282, 196, 282);
      doc.setFontSize(7.5).setFont(undefined,'normal').setTextColor(...this.GRAY);
      const info = [of.nom, of.siret?`SIRET : ${of.siret}`:'', of.da?`N° DA : ${of.da}`:'']
        .filter(Boolean).join('   ·   ');
      doc.text(info,  105, 287, { align:'center' });
      doc.text(`${i}/${n}`, 195, 287, { align:'right' });
    }
  },

  /* ══════════════════════════════════════════════
     UTILITAIRES
  ══════════════════════════════════════════════ */
  _fmtEuro(n) {
    return new Intl.NumberFormat('fr-FR', { style:'currency', currency:'EUR', maximumFractionDigits:2 }).format(n||0);
  },

  _calculerDuree(trainingDates) {
    if (!trainingDates?.length) return 'À définir';
    let days = 0;
    trainingDates.forEach(d => {
      if (!d.start) return;
      const s = new Date(d.start+'T00:00');
      const e = d.end ? new Date(d.end+'T00:00') : s;
      days += Math.max(1, Math.round((e - s) / 86400000) + 1);
    });
    return days === 1 ? '1 jour' : `${days} jours`;
  },

  _expandDates(trainingDates) {
    const result = [];
    (trainingDates||[]).forEach(d => {
      if (!d.start) return;
      const s = new Date(d.start+'T00:00');
      const e = d.end ? new Date(d.end+'T00:00') : s;
      for (let dt = new Date(s); dt <= e; dt.setDate(dt.getDate()+1))
        result.push(dt.toISOString().split('T')[0]);
    });
    return result;
  },

  _slug(str) {
    return (str || 'doc').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40);
  }
};
