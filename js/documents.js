/* ─── Documents — Génération PDF (jsPDF + AutoTable) ─── */

const Documents = {

  /* ── Couleurs Ideaforma ── */
  NAVY:    [30,  45,  75],
  PRIMARY: [59, 130, 246],
  GRAY:    [107, 114, 128],
  LIGHT:   [243, 244, 246],

  /* ── Numéro de document ── */
  _docNum(prefix) {
    const d = new Date();
    const yymm = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}`;
    const rand  = Math.floor(Math.random() * 900) + 100;
    return `${prefix}-${yymm}-${rand}`;
  },

  /* ── Charger profil OF depuis Supabase ── */
  async _getOFProfile() {
    try {
      const p = await DataStore.getProfile();
      // Couleur primaire → convertir hex en RGB
      const hex = p?.couleur_primaire || '#1E2D4B';
      const rgb = this._hexToRgb(hex);
      return {
        nom:      p?.organisme       || p?.nom || 'IDEAFORMA',
        email:    p?.email           || '',
        siret:    p?.siret           || '',
        adresse:  p?.adresse         || '',
        tel:      p?.telephone       || '',
        da:       p?.numero_da       || '',
        qualiopi: p?.numero_qualiopi || '',
        logo:     p?.logo_base64     || null,
        color:    rgb
      };
    } catch {
      return { nom:'IDEAFORMA', email:'', siret:'', adresse:'', tel:'', da:'', qualiopi:'', logo:null, color:[30,45,75] };
    }
  },

  _hexToRgb(hex) {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return isNaN(r) ? [30,45,75] : [r,g,b];
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

    // ── En-tête ──
    this._header(doc, of, 'DEVIS', num, today);

    // ── Validité ──
    let y = 38;
    doc.setFontSize(8.5).setFont(undefined,'italic').setTextColor(...this.GRAY);
    doc.text('Valable 30 jours à compter de la date d\'émission', 195, y, { align:'right' });

    // ── Parties ──
    y = 46;
    y = this._partiesBlock(doc, of, dossier, y);

    // ── Objet ──
    y += 3;
    doc.setFontSize(9.5).setFont(undefined,'bold').setTextColor(...this.NAVY);
    doc.text(`Objet : Formation « ${dossier.trainingSubject} »`, 15, y); y += 5;
    doc.setFont(undefined,'normal').setFontSize(9).setTextColor(...this.GRAY);
    doc.text(`OPCO concerné : ${opcoLabel}`, 15, y); y += 7;

    // ── Tableau devis ──
    const nbStagiaires = (dossier.trainees||[]).length;
    doc.autoTable({
      startY: y,
      head: [['Désignation', 'Durée', 'Stagiaire(s)', 'Prix HT']],
      body: [[
        dossier.trainingSubject,
        duree,
        `${nbStagiaires || '—'} personne(s)`,
        this._fmtEuro(dossier.price)
      ]],
      ...this._tableStyle()
    });
    y = doc.lastAutoTable.finalY + 5;

    // ── Total ──
    y = this._totalBlock(doc, dossier.price, y);
    y += 5;

    // ── Participants ──
    if ((dossier.trainees||[]).length) {
      doc.setFontSize(9.5).setFont(undefined,'bold').setTextColor(...this.NAVY);
      doc.text('Participants', 15, y); y += 4;
      doc.autoTable({
        startY: y,
        head: [['Prénom', 'Nom']],
        body: dossier.trainees.map(t => [t.firstName, t.lastName]),
        ...this._tableStyle(true)
      });
      y = doc.lastAutoTable.finalY + 5;
    }

    // ── Dates ──
    const datesRows = (dossier.trainingDates||[]).filter(d => d.start);
    if (datesRows.length) {
      doc.setFontSize(9.5).setFont(undefined,'bold').setTextColor(...this.NAVY);
      doc.text('Dates de formation', 15, y); y += 4;
      doc.autoTable({
        startY: y,
        head: [['Date de début', 'Date de fin']],
        body: datesRows.map(d => [
          new Date(d.start+'T00:00').toLocaleDateString('fr-FR'),
          d.end ? new Date(d.end+'T00:00').toLocaleDateString('fr-FR') : '—'
        ]),
        ...this._tableStyle(true)
      });
      y = doc.lastAutoTable.finalY + 5;
    }

    // ── Conditions ──
    if (y > 230) { doc.addPage(); y = 20; }
    doc.setFontSize(8.5).setFont(undefined,'bold').setTextColor(...this.NAVY);
    doc.text('Conditions', 15, y); y += 4;
    doc.setFont(undefined,'normal').setTextColor(...this.GRAY).setFontSize(8.5);
    [
      '• Ce devis est valable 30 jours à compter de sa date d\'émission.',
      '• Paiement à 30 jours réception de facture après réalisation de la formation.',
      '• Formation exonérée de TVA (art. 261-4-4° du Code Général des Impôts).',
      '• Organisme certifié Qualiopi' + (of.qualiopi ? ` (n° ${of.qualiopi})` : '') + '.'
    ].forEach(l => { doc.text(l, 15, y); y += 4.5; });
    y += 5;

    // ── Signatures ──
    if (y > 235) { doc.addPage(); y = 20; }
    this._signaturesBlock(doc, y, 'L\'Organisme de Formation', 'L\'Entreprise');

    this._footer(doc, of);
    doc.save(`Devis_${num}_${dossier.companyName.replace(/[^a-zA-Z0-9]/g,'_')}.pdf`);
    Toast.show(`Devis ${num} généré ✓`, 'success');
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

    this._header(doc, of, 'CONVENTION DE FORMATION PROFESSIONNELLE', num, today);

    let y = 46;
    doc.setFontSize(8.5).setFont(undefined,'italic').setTextColor(...this.GRAY);
    doc.text('Établie conformément aux articles L.6353-1 et suivants du Code du Travail', 105, y, { align:'center' });
    y += 10;

    // Art. 1 — Parties
    y = this._article(doc, y, 'ARTICLE 1 — PARTIES À LA CONVENTION', [
      'Entre l\'organisme de formation :',
      `  ${of.nom}`,
      ...(of.adresse ? [`  ${of.adresse}`] : []),
      ...(of.siret   ? [`  SIRET : ${of.siret}`] : []),
      ...(of.da      ? [`  N° Déclaration d'activité : ${of.da}`] : []),
      '',
      'Et l\'entreprise commanditaire :',
      `  ${dossier.companyName}`,
      ...(dossier.address ? [`  ${dossier.address}`] : []),
      ...(dossier.siret   ? [`  SIRET : ${dossier.siret}`] : []),
      ...(dossier.email   ? [`  Email : ${dossier.email}`] : []),
    ]);

    // Art. 2 — Objet
    y = this._article(doc, y, 'ARTICLE 2 — OBJET', [
      `La présente convention porte sur la réalisation d'une action de formation ayant pour intitulé :`,
      `  « ${dossier.trainingSubject} »`,
      ``,
      `Financement prévu par : ${opcoLabel}`,
    ]);

    // Art. 3 — Programme & Modalités
    const datesStr = (dossier.trainingDates||[])
      .filter(d => d.start)
      .map(d => {
        const s = new Date(d.start+'T00:00').toLocaleDateString('fr-FR');
        const e = d.end ? new Date(d.end+'T00:00').toLocaleDateString('fr-FR') : null;
        return e && e!==s ? `du ${s} au ${e}` : `le ${s}`;
      }).join(', ') || 'Dates à définir';

    y = this._article(doc, y, 'ARTICLE 3 — PROGRAMME, DURÉE ET DATES', [
      `Durée totale : ${duree}`,
      `Dates : ${datesStr}`,
      `Modalité pédagogique : Présentiel`,
      `Lieu : À préciser`,
      ``,
      `Le programme détaillé est joint en annexe ou disponible sur demande.`,
    ]);

    // Art. 4 — Participants
    y = this._article(doc, y, 'ARTICLE 4 — PARTICIPANTS', [
      `Nombre de stagiaires : ${(dossier.trainees||[]).length || '—'}`,
      ...(dossier.trainees||[]).map((t,i) => `  ${i+1}. ${t.firstName} ${t.lastName}`),
    ]);

    if (y > 210) { doc.addPage(); y = 20; }

    // Art. 5 — Finances
    y = this._article(doc, y, 'ARTICLE 5 — CONDITIONS FINANCIÈRES', [
      `Coût total de la formation : ${this._fmtEuro(dossier.price)} HT`,
      `Exonéré de TVA (article 261-4-4° du Code Général des Impôts).`,
      ``,
      `Modalités de règlement : Paiement à 30 jours réception de facture.`,
      `Dans le cadre d'une prise en charge OPCO, la facturation sera adressée directement à l'OPCO.`,
      `La part non prise en charge reste à la charge de l'entreprise.`,
    ]);

    // Art. 6 — Qualité
    y = this._article(doc, y, 'ARTICLE 6 — CERTIFICATION QUALITÉ', [
      `L'organisme de formation est certifié Qualiopi${of.qualiopi ? ` (n° ${of.qualiopi})` : ''}.`,
      `Cette certification est délivrée au titre des actions de formation.`,
    ]);

    // Art. 7 — Résiliation
    y = this._article(doc, y, 'ARTICLE 7 — RÉSILIATION', [
      `En cas d'abandon par le stagiaire ou de défaillance de l'entreprise, les sommes versées restent dues`,
      `sauf cas de force majeure reconnu. En cas d'annulation par l'organisme, les sommes sont remboursées.`,
    ]);

    // Signatures
    if (y > 230) { doc.addPage(); y = 20; }
    y += 5;
    doc.setFontSize(9).setFont(undefined,'bold').setTextColor(...this.NAVY);
    doc.text('Fait en deux exemplaires originaux — chaque partie reconnaît en avoir reçu un exemplaire', 105, y, { align:'center' }); y += 5;
    doc.text('À ________________, le ________________', 105, y, { align:'center' }); y += 10;

    this._signaturesBlock(doc, y,
      `L'Organisme de Formation\n${of.nom}`,
      `L'Entreprise\n${dossier.companyName}`
    );

    this._footer(doc, of);
    doc.save(`Convention_${num}_${dossier.companyName.replace(/[^a-zA-Z0-9]/g,'_')}.pdf`);
    Toast.show(`Convention ${num} générée ✓`, 'success');
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
    const color     = of.color || this.NAVY;
    const modaliteLabel = { presentiel:'Présentiel', distanciel:'Distanciel', mixte:'Mixte (présentiel + distanciel)' };

    this._header(doc, of, 'PROGRAMME PÉDAGOGIQUE', num, today);

    let y = 38;

    // Titre formation
    doc.setFillColor(245, 247, 252);
    doc.roundedRect(15, y, 180, 18, 2, 2, 'F');
    doc.setFontSize(13).setFont(undefined,'bold').setTextColor(...color);
    doc.text(dossier.trainingSubject, 105, y + 7, { align:'center' });
    doc.setFontSize(9).setFont(undefined,'normal').setTextColor(...this.GRAY);
    doc.text(`${opcoLabel}  •  ${duree}  •  ${modaliteLabel[dossier.modalite]||dossier.modalite||'Présentiel'}`, 105, y + 13, { align:'center' });
    y += 24;

    // ── Bloc informations générales ──
    y = this._progSection(doc, y, color, '📋 Informations générales', [
      ['Organisme de formation', of.nom + (of.da ? ` (N° DA : ${of.da})` : '')],
      ['Entreprise commanditaire', dossier.companyName + (dossier.siret ? ` — SIRET : ${dossier.siret}` : '')],
      ['Responsable / Gérant',    dossier.nomGerant   || 'À préciser'],
      ['Convention collective',   dossier.idcc ? `IDCC ${dossier.idcc}` : 'À préciser'],
      ['OPCO',                    opcoLabel],
      ['Durée totale',            duree],
      ['Modalité',                modaliteLabel[dossier.modalite] || 'Présentiel'],
      ['Dates', (dossier.trainingDates||[]).filter(d => d.start).map(d => {
        const s = new Date(d.start+'T00:00').toLocaleDateString('fr-FR');
        const e = d.end ? new Date(d.end+'T00:00').toLocaleDateString('fr-FR') : null;
        return e && e!==s ? `du ${s} au ${e}` : `le ${s}`;
      }).join(', ') || 'À définir'],
      ['Tarif HT',                this._fmtEuro(dossier.price)],
      ['Certification Qualiopi',  of.qualiopi ? `N° ${of.qualiopi}` : 'Oui'],
    ]);

    // ── Public visé & prérequis ──
    if (y > 220) { doc.addPage(); y = 20; }
    const publicVise = (dossier.trainees||[]).length
      ? (dossier.trainees||[]).map(t => `${t.firstName} ${t.lastName}`).join(', ')
      : 'Salariés de l\'entreprise';
    y = this._progTextBlock(doc, y, color, '👥 Public visé', publicVise);
    y = this._progTextBlock(doc, y, color, '✅ Prérequis', dossier.prerequis || 'Aucun prérequis particulier.');

    // ── Objectifs ──
    if (y > 220) { doc.addPage(); y = 20; }
    y = this._progTextBlock(doc, y, color, '🎯 Objectifs pédagogiques',
      dossier.objectifs || 'À l\'issue de la formation, les participants seront capables de maîtriser les compétences visées.');

    // ── Programme ──
    if (y > 200) { doc.addPage(); y = 20; }
    y = this._progTextBlock(doc, y, color, '📚 Programme détaillé',
      dossier.contenu || 'Le programme détaillé sera fourni lors de la convention de formation.');

    // ── Méthodes et évaluation ──
    if (y > 220) { doc.addPage(); y = 20; }
    y = this._progTextBlock(doc, y, color, '🛠 Méthodes pédagogiques',
      'Apports théoriques, exercices pratiques, mises en situation, échanges et retours d\'expérience.');
    y = this._progTextBlock(doc, y, color, '📊 Modalités d\'évaluation',
      dossier.evaluation || 'Évaluation continue tout au long de la formation. Bilan de fin de formation.');

    // ── Accessibilité ──
    if (y > 230) { doc.addPage(); y = 20; }
    y = this._progTextBlock(doc, y, color, '♿ Accessibilité',
      'Notre organisme prend en compte les besoins des personnes en situation de handicap. Contactez-nous pour tout aménagement spécifique.');

    // ── Signature OF ──
    if (y > 245) { doc.addPage(); y = 20; }
    y += 6;
    doc.setFontSize(9).setFont(undefined,'bold').setTextColor(...color);
    doc.text(`Document établi par : ${of.nom}`, 15, y); y += 5;
    doc.setFont(undefined,'normal').setFontSize(8.5).setTextColor(...this.GRAY);
    if (of.da)    { doc.text(`N° Déclaration d'activité : ${of.da}`, 15, y); y += 4; }
    if (of.siret) { doc.text(`SIRET : ${of.siret}`, 15, y); y += 4; }

    this._footer(doc, of);
    doc.save(`Programme_${num}_${dossier.companyName.replace(/[^a-zA-Z0-9]/g,'_')}.pdf`);
    Toast.show(`Programme pédagogique ${num} généré ✓`, 'success');
  },

  /* ── Helpers programme ── */
  _progSection(doc, y, color, title, rows) {
    if (y > 240) { doc.addPage(); y = 20; }
    // Titre section
    doc.setFillColor(...color);
    doc.roundedRect(15, y-2, 180, 7, 1, 1, 'F');
    doc.setFontSize(9).setFont(undefined,'bold').setTextColor(255,255,255);
    doc.text(title, 17, y + 3); y += 9;

    rows.forEach(([label, value]) => {
      if (!value || value === 'À préciser') return;
      if (y > 270) { doc.addPage(); y = 20; }
      doc.setFontSize(8.5).setFont(undefined,'bold').setTextColor(...color);
      doc.text(`${label} :`, 17, y);
      doc.setFont(undefined,'normal').setTextColor(60,65,85);
      const wrapped = doc.splitTextToSize(String(value), 130);
      doc.text(wrapped, 70, y);
      y += Math.max(wrapped.length * 4, 4.5);
    });
    return y + 4;
  },

  _progTextBlock(doc, y, color, title, text) {
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setFillColor(...color);
    doc.roundedRect(15, y-2, 180, 7, 1, 1, 'F');
    doc.setFontSize(9).setFont(undefined,'bold').setTextColor(255,255,255);
    doc.text(title, 17, y + 3); y += 9;

    doc.setFontSize(8.5).setFont(undefined,'normal').setTextColor(60,65,85);
    const lines = String(text || '—').split('\n');
    lines.forEach(line => {
      if (y > 270) { doc.addPage(); y = 20; }
      const wrapped = doc.splitTextToSize(line || ' ', 174);
      doc.text(wrapped, 17, y);
      y += wrapped.length * 4.2;
    });
    return y + 5;
  },

  /* ══════════════════════════════════════════════
     FEUILLES DE PRÉSENCE
  ══════════════════════════════════════════════ */
  async genererFeuillesPresence(dossier) {
    const { jsPDF } = window.jspdf;
    const of   = await this._getOFProfile();
    const jours = this._expandDates(dossier.trainingDates);

    if (!jours.length) {
      Toast.show('Aucune date de formation renseignée', 'warning');
      return;
    }

    const doc = new jsPDF({ unit:'mm', format:'a4' });

    jours.forEach((jour, idx) => {
      if (idx > 0) doc.addPage();

      const dateLabel = new Date(jour+'T00:00').toLocaleDateString('fr-FR',
        { weekday:'long', day:'numeric', month:'long', year:'numeric' });

      // Bande bleue
      doc.setFillColor(...this.NAVY);
      doc.rect(0, 0, 210, 28, 'F');
      doc.setTextColor(255,255,255).setFontSize(17).setFont(undefined,'bold');
      doc.text('FEUILLE DE PRÉSENCE', 105, 13, { align:'center' });
      doc.setFontSize(9).setFont(undefined,'normal');
      doc.text(of.nom, 105, 21, { align:'center' });

      let y = 37;
      doc.setTextColor(...this.NAVY).setFontSize(10).setFont(undefined,'bold');
      doc.text(`Formation : ${dossier.trainingSubject}`, 15, y); y += 5.5;
      doc.setFont(undefined,'normal').setFontSize(9).setTextColor(...this.GRAY);
      doc.text(`Entreprise : ${dossier.companyName}`, 15, y); y += 4.5;
      doc.text(`Date : ${dateLabel.charAt(0).toUpperCase()+dateLabel.slice(1)}`, 15, y); y += 4.5;
      doc.text(`Feuille ${idx+1} / ${jours.length}`, 15, y); y += 6;

      // Tableau émargement
      let rows = (dossier.trainees||[]).map(t => [t.firstName, t.lastName, '', '']);
      while (rows.length < 10) rows.push(['', '', '', '']);

      doc.autoTable({
        startY: y,
        head: [['Prénom', 'Nom', 'Signature\nmatin', 'Signature\naprès-midi']],
        body: rows,
        columnStyles: {
          0: { cellWidth: 38 },
          1: { cellWidth: 42 },
          2: { cellWidth: 55, cellHeight: 14 },
          3: { cellWidth: 55, cellHeight: 14 }
        },
        bodyStyles: { minCellHeight: 14 },
        headStyles: { fillColor: this.NAVY, textColor: 255, fontStyle:'bold', fontSize:9, halign:'center' },
        alternateRowStyles: { fillColor: [248,249,250] },
        styles: { fontSize:9, cellPadding:3, valign:'middle' }
      });

      y = doc.lastAutoTable.finalY + 10;

      // Signature formateur
      doc.setFontSize(9.5).setFont(undefined,'bold').setTextColor(...this.NAVY);
      doc.text('Visa du formateur', 15, y); y += 4;
      doc.setFontSize(8.5).setFont(undefined,'normal').setTextColor(...this.GRAY);
      doc.text('Nom : ____________________________  Prénom : ____________________________', 15, y); y += 6;
      doc.rect(15, y, 85, 20);
      doc.text('Cachet et signature :', 15, y - 2);

      // Footer simple
      doc.setFontSize(7.5).setTextColor(...this.GRAY);
      doc.text(
        `${of.nom}${of.siret ? ' — SIRET : '+of.siret : ''}${of.da ? ' — N° DA : '+of.da : ''}`,
        105, 288, { align:'center' }
      );
    });

    doc.save(`Presences_${dossier.companyName.replace(/[^a-zA-Z0-9]/g,'_')}.pdf`);
    Toast.show(`${jours.length} feuille(s) de présence générée(s) ✓`, 'success');
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

    this._header(doc, of, 'FACTURE', num, today);

    let y = 38;
    doc.setFontSize(8.5).setFont(undefined,'normal').setTextColor(...this.GRAY);
    doc.text(`Date d'échéance : ${dueStr}`, 195, y, { align:'right' });

    y = 46;
    y = this._partiesBlock(doc, of, dossier, y, `Destinataire — ${opcoLabel}`);
    y += 3;

    // Tableau facturation
    const datesStr = (dossier.trainingDates||[])
      .filter(d => d.start)
      .map(d => {
        const s = new Date(d.start+'T00:00').toLocaleDateString('fr-FR');
        const e = d.end ? new Date(d.end+'T00:00').toLocaleDateString('fr-FR') : null;
        return e && e!==s ? `${s} au ${e}` : s;
      }).join('\n') || 'À définir';

    doc.autoTable({
      startY: y,
      head: [['Désignation', 'Dates', 'Durée', 'Pers.', 'Montant HT']],
      body: [[
        dossier.trainingSubject,
        datesStr,
        duree,
        String((dossier.trainees||[]).length || '—'),
        this._fmtEuro(dossier.price)
      ]],
      columnStyles: {
        0: { cellWidth: 65 },
        1: { cellWidth: 45 },
        2: { cellWidth: 25 },
        3: { cellWidth: 15, halign:'center' },
        4: { cellWidth: 30, halign:'right' }
      },
      ...this._tableStyle()
    });
    y = doc.lastAutoTable.finalY + 5;

    // Total
    y = this._totalBlock(doc, dossier.price, y);
    y += 5;

    // Liste participants
    if ((dossier.trainees||[]).length) {
      doc.setFontSize(9).setFont(undefined,'bold').setTextColor(...this.NAVY);
      doc.text('Participants formés :', 15, y); y += 4;
      doc.setFont(undefined,'normal').setTextColor(...this.GRAY).setFontSize(8.5);
      dossier.trainees.forEach((t, i) => {
        doc.text(`  ${i+1}. ${t.firstName} ${t.lastName}`, 15, y); y += 4;
      });
      y += 3;
    }

    // Mentions
    if (y > 245) { doc.addPage(); y = 20; }
    doc.setFontSize(8.5).setFont(undefined,'normal').setTextColor(...this.GRAY);
    [
      `Date d'échéance de paiement : ${dueStr}`,
      'Modalité de règlement : Virement bancaire.',
      'Pénalités de retard (taux légal × 3) et indemnité forfaitaire de recouvrement : 40 €.',
      'Exonéré de TVA — Article 261-4-4° du Code Général des Impôts.',
      ...(of.qualiopi ? [`Organisme certifié Qualiopi (n° ${of.qualiopi}).`] : [])
    ].forEach(l => { doc.text(l, 15, y); y += 4.5; });

    this._footer(doc, of);
    doc.save(`Facture_${num}_${dossier.companyName.replace(/[^a-zA-Z0-9]/g,'_')}.pdf`);
    Toast.show(`Facture ${num} générée ✓`, 'success');
  },

  /* ══════════════════════════════════════════════
     HELPERS INTERNES
  ══════════════════════════════════════════════ */

  _header(doc, of, docType, num, date) {
    const color = of.color || this.NAVY;

    // Bande couleur principale
    doc.setFillColor(...color);
    doc.rect(0, 0, 210, 32, 'F');

    // Logo ou nom OF
    if (of.logo) {
      try {
        doc.addImage(of.logo, 'auto', 12, 4, 28, 24);
      } catch {
        doc.setTextColor(200,220,255).setFontSize(8).setFont(undefined,'normal');
        doc.text(of.nom, 15, 28);
      }
    } else {
      doc.setTextColor(200,220,255).setFontSize(8).setFont(undefined,'normal');
      doc.text(of.nom, 15, 28);
    }

    // Titre document
    doc.setTextColor(255,255,255).setFontSize(17).setFont(undefined,'bold');
    doc.text(docType, 105, 14, { align:'center' });
    doc.setFontSize(9).setFont(undefined,'normal');
    doc.text(`N° ${num}   |   Date : ${date}`, 105, 22, { align:'center' });

    // Ligne de séparation
    doc.setDrawColor(...color).setLineWidth(0.3);
    doc.line(15, 36, 195, 36);
  },

  _partiesBlock(doc, of, dossier, y, rightLabel = 'Destinataire') {
    const col1 = 15, col2 = 115;

    // Labels
    doc.setFontSize(8.5).setFont(undefined,'bold').setTextColor(...this.NAVY);
    doc.text('Émetteur', col1, y);
    doc.text(rightLabel, col2, y);
    y += 4;

    // Ligne gris
    doc.setDrawColor(220,225,235).setLineWidth(0.2);
    doc.line(col1, y, 100, y);
    doc.line(col2, y, 195, y);
    y += 3;

    // Contenu émetteur
    doc.setFont(undefined,'bold').setFontSize(9).setTextColor(...this.NAVY);
    doc.text(of.nom, col1, y);
    doc.setFont(undefined,'normal').setFontSize(8.5).setTextColor(...this.GRAY);
    let ey = y + 4;
    if (of.adresse)  { doc.text(of.adresse,           col1, ey); ey += 3.8; }
    if (of.siret)    { doc.text(`SIRET : ${of.siret}`, col1, ey); ey += 3.8; }
    if (of.da)       { doc.text(`N° DA : ${of.da}`,    col1, ey); ey += 3.8; }
    if (of.tel)      { doc.text(`Tél : ${of.tel}`,     col1, ey); ey += 3.8; }
    if (of.email)    { doc.text(of.email,              col1, ey); ey += 3.8; }

    // Contenu destinataire
    doc.setFont(undefined,'bold').setFontSize(9).setTextColor(...this.NAVY);
    doc.text(dossier.companyName, col2, y);
    doc.setFont(undefined,'normal').setFontSize(8.5).setTextColor(...this.GRAY);
    let ry = y + 4;
    if (dossier.address) { doc.text(dossier.address,              col2, ry); ry += 3.8; }
    if (dossier.siret)   { doc.text(`SIRET : ${dossier.siret}`,   col2, ry); ry += 3.8; }
    if (dossier.phone)   { doc.text(`Tél : ${dossier.phone}`,     col2, ry); ry += 3.8; }
    if (dossier.email)   { doc.text(dossier.email,                col2, ry); ry += 3.8; }

    return Math.max(ey, ry) + 6;
  },

  _totalBlock(doc, price, y) {
    // Cadre total à droite
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(125, y, 70, 22, 2, 2, 'F');
    doc.setDrawColor(220, 225, 235).setLineWidth(0.3);
    doc.roundedRect(125, y, 70, 22, 2, 2, 'S');

    doc.setFontSize(8.5).setFont(undefined,'normal').setTextColor(...this.GRAY);
    doc.text('Montant HT :', 130, y + 6);
    doc.text('TVA (exonéré art. 261-4-4° CGI) :', 130, y + 11);

    doc.setFontSize(10).setFont(undefined,'bold').setTextColor(...this.NAVY);
    doc.text('Total à payer :', 130, y + 17);

    // Valeurs (alignées à droite)
    doc.setFont(undefined,'normal').setFontSize(8.5).setTextColor(...this.GRAY);
    doc.text(this._fmtEuro(price), 192, y + 6,  { align:'right' });
    doc.text('0,00 €',             192, y + 11, { align:'right' });
    doc.setFont(undefined,'bold').setFontSize(10).setTextColor(...this.NAVY);
    doc.text(this._fmtEuro(price), 192, y + 17, { align:'right' });

    return y + 26;
  },

  _article(doc, y, title, lines) {
    if (y > 252) { doc.addPage(); y = 20; }

    doc.setFillColor(240, 244, 252);
    doc.rect(15, y - 3, 180, 8, 'F');
    doc.setFontSize(9).setFont(undefined,'bold').setTextColor(...this.NAVY);
    doc.text(title, 17, y + 2);
    y += 8;

    doc.setFont(undefined,'normal').setFontSize(8.5).setTextColor(60, 65, 85);
    lines.forEach(line => {
      if (y > 272) { doc.addPage(); y = 20; }
      if (line !== '') {
        const wrapped = doc.splitTextToSize(line, 176);
        doc.text(wrapped, 17, y);
        y += wrapped.length * 4.2;
      } else {
        y += 2.5;
      }
    });
    return y + 4;
  },

  _signaturesBlock(doc, y, leftLabel, rightLabel) {
    doc.setFontSize(9).setFont(undefined,'bold').setTextColor(...this.NAVY);
    doc.text(`À ________________,  le ________________`, 105, y, { align:'center' }); y += 10;

    const leftLines  = leftLabel.split('\n');
    const rightLines = rightLabel.split('\n');

    doc.setFontSize(8.5).setFont(undefined,'bold').setTextColor(...this.NAVY);
    leftLines.forEach((l, i)  => { doc.text(l, 15,  y + i*4); });
    rightLines.forEach((l, i) => { doc.text(l, 115, y + i*4); });

    const offset = Math.max(leftLines.length, rightLines.length) * 4 + 3;
    doc.setFontSize(8).setFont(undefined,'normal').setTextColor(...this.GRAY);
    doc.text('Signature et cachet :', 15,  y + offset);
    doc.text('Signature et cachet :', 115, y + offset);

    doc.setDrawColor(180, 190, 210).setLineWidth(0.4);
    doc.rect(15,  y + offset + 2, 85, 24);
    doc.rect(115, y + offset + 2, 80, 24);

    return y + offset + 30;
  },

  _footer(doc, of) {
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      doc.setDrawColor(200,210,230).setLineWidth(0.3);
      doc.line(15, 283, 195, 283);
      doc.setFontSize(7.5).setFont(undefined,'normal').setTextColor(...this.GRAY);
      const info = [of.nom, of.siret?`SIRET : ${of.siret}`:'', of.da?`N° DA : ${of.da}`:'']
        .filter(Boolean).join(' — ');
      doc.text(info, 105, 287, { align:'center' });
      doc.text(`Page ${i}/${n}`, 195, 287, { align:'right' });
    }
  },

  _tableStyle(compact = false) {
    return {
      headStyles: { fillColor: this.NAVY, textColor: 255, fontStyle:'bold', fontSize:9 },
      bodyStyles: { fontSize:9, textColor:[60,65,85] },
      alternateRowStyles: { fillColor:[248,249,251] },
      styles: { cellPadding: compact ? 2.5 : 3.5 }
    };
  },

  _fmtEuro(n) {
    return new Intl.NumberFormat('fr-FR', { style:'currency', currency:'EUR', maximumFractionDigits:2 }).format(n||0);
  },

  _calculerDuree(trainingDates) {
    if (!trainingDates?.length) return 'À définir';
    let days = 0;
    (trainingDates||[]).forEach(d => {
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
      for (let dt = new Date(s); dt <= e; dt.setDate(dt.getDate()+1)) {
        result.push(dt.toISOString().split('T')[0]);
      }
    });
    return result;
  }
};
