/* ─── Conformité OPCO — contrôle avant génération des documents ─────────────
   Objectif : qu'aucun devis / programme / convention ne parte avec un motif de
   refus évident (retour d'expérience dossier ELIT / Constructys, oct. 2026).

   Conformite.verifier({ dossier, client, of, opco, typeDoc })
     → { bloquants:[{titre, detail, ou}], alertes:[…], ok:[…], score }
       • bloquant : le document ne peut pas être généré tel quel ;
       • alerte   : le document peut partir, mais le point est à vérifier.
   Conformite.controlerPuisGenerer(...) : ouvre la fenêtre de contrôle et ne
   lance la génération que si aucun point bloquant ne subsiste.
   Conformite.panneau(resultat) : encadré affiché en direct dans le formulaire.
──────────────────────────────────────────────────────────────────────────── */

const Conformite = {

  /* Documents concernés par chaque famille de contrôle */
  DOCS_DEMANDE: ['devis', 'programme', 'convention'],        // dossier de prise en charge
  DOCS_PRIX:    ['devis', 'convention', 'facture'],

  /* Bâtiment : la convention collective dépend de l'effectif (ouvriers) */
  IDCC_EFFECTIF: {
    '1596': { max: 10, autre: '1597', libelle: 'Bâtiment ouvriers — entreprises jusqu\'à 10 salariés' },
    '1597': { min: 11, autre: '1596', libelle: 'Bâtiment ouvriers — entreprises de plus de 10 salariés' }
  },

  /* Prénoms fréquents (repérage d'un nom / prénom probablement inversé) */
  PRENOMS: new Set(('mohamed mohammed mohamad mouhamed ahmed ahmet ali yasser yassine yacine youssef youcef karim kader abdel abdelkader abdellah ' +
    'mustafa mustapha mehmet halil ibrahim ismail ismael omar oussama bilal hamza mehdi nabil rachid said samir sofiane sami walid ' +
    'servet sevil sevgi emre murat hasan huseyin osman ramazan ramadan recep cem can burak ' +
    'jean pierre paul jacques michel philippe nicolas julien thomas alexandre antoine david eric frederic laurent olivier patrick ' +
    'sebastien stephane christophe sylvain vincent kevin anthony maxime romain lucas hugo louis enzo mathieu franck didier ' +
    'marie nathalie isabelle sylvie catherine christine sandrine sophie julie celine aurelie laura sarah camille emma lea manon ' +
    'fatima fatma khadija aicha amina nadia samira leila myriam meriem yasmine salima karima malika').split(/\s+/)),

  MOTS_VAGUES: /^(conna[iî]tre|comprendre|savoir|être sensibilisé|sensibiliser|découvrir|appréhender|maîtriser les bases)\b/i,
  WEBMAILS: /@(gmail|hotmail|outlook|live|yahoo|orange|free|sfr|laposte|wanadoo|icloud)\./i,

  /* ══════════════════════════════════════════════════════════════════════
     MOTEUR DE RÈGLES
  ══════════════════════════════════════════════════════════════════════ */
  verifier({ dossier = {}, client = {}, of = {}, opco, typeDoc = 'devis' }) {
    const B = [], A = [], OK = [];
    const fx = {};   // valeurs utiles aux raccourcis de correction
    const add = (liste, titre, detail = '', ou = '') => liste.push({ titre, detail, ou });
    const cfg = (typeof OpcoPage !== 'undefined' && OpcoPage.CONFIG?.[opco]) || {};
    const opcoLabel = cfg.label || opco || 'l\'OPCO';
    const demande = this.DOCS_DEMANDE.includes(typeDoc);
    const avantAccord = !dossier.status || /^devis_/.test(dossier.status);

    /* ── 1. Organisme de formation (Paramètres) ── */
    const nda = String(of.da || '').replace(/\s/g, '');
    if (!nda) add(B, 'N° de déclaration d\'activité (NDA) manquant', 'Mention obligatoire sur le devis, la convention et le programme ; un dossier sans NDA est refusé.', 'Paramètres');
    else if (!/^\d{11}$/.test(nda)) add(A, 'Format du NDA inhabituel', `« ${of.da} » : un NDA comporte 11 chiffres (ex. 93 13 XXXXX 13).`, 'Paramètres');
    const qualiopi = String(of.qualiopi || '').trim();
    if (!qualiopi) add(B, 'N° de certificat Qualiopi manquant', 'Les OPCO ne financent que les organismes certifiés : le n° du certificat doit figurer sur les documents.', 'Paramètres');
    else if (/^\d{11}$/.test(qualiopi.replace(/\s/g, '')) || qualiopi.replace(/\s/g, '') === nda)
      add(A, 'Le n° Qualiopi ressemble à un NDA', `« ${qualiopi} » a le format d'un numéro de déclaration d'activité. Reprenez le n° exact figurant sur votre certificat Qualiopi.`, 'Paramètres');
    if (of.qualiopiFin && new Date(of.qualiopiFin) < this._date(dossier.trainingDates?.[0]?.start))
      add(B, 'Certificat Qualiopi expiré à la date de la formation', `Fin de validité : ${this._fr(of.qualiopiFin)}.`, 'Paramètres');
    if (!of.dirigeant) add(B, 'Nom de la dirigeante / formatrice manquant', 'Sans lui, les documents indiquent « Formateur : ' + (of.nom || 'l\'organisme') + ' » et « Représenté par » un téléphone. L\'OPCO attend un formateur nommé (CV à l\'appui).', 'Paramètres');
    if (!/\b\d{5}\b/.test(of.adresse || '')) add(B, 'Adresse de l\'organisme incomplète', `« ${of.adresse || '—'} » : il manque le code postal et la ville.`, 'Paramètres');
    if (this.WEBMAILS.test(of.email || '')) add(A, 'Adresse e-mail personnelle sur les documents', `${of.email} : utilisez l'adresse professionnelle de l'organisme.`, 'Paramètres');
    if (!of.referentHandicap) add(A, 'Référent handicap non nommé', 'Qualiopi (indicateur 26) : nommez un référent handicap et son contact.', 'Paramètres');

    /* ── 1 bis. Compétence de la formatrice (Qualiopi 21-22) : jamais de thème injustifiable ni de qualification inventée ── */
    if (typeof Formatrice !== 'undefined' && of.formatrice !== undefined) {
      if (of.formatrice === null) add(B, 'Profil de la formatrice non renseigné', 'Diplômes, expériences et domaines justifiables : l\'appli en a besoin pour vérifier que vous pouvez animer ce thème (l\'OPCO peut demander votre CV).', 'Paramètres');
      else {
        const an = Formatrice.analyser(dossier, of.formatrice);
        if (an.hors.length) add(B, `Thème hors des compétences justifiables de la formatrice : ${an.hors.map(d => d.label.split(' (')[0]).join(', ')}`,
          `Qualiopi (indicateurs 21-22) exige des compétences adaptées et l'OPCO peut demander le CV. Vos domaines : ${Formatrice.libelles(of.formatrice).map(l => l.split(' (')[0]).join(' ; ') || 'aucun'}. Solutions : choisir un thème de vos domaines, ou faire animer cette action par un formateur qualifié en sous-traitance (contrat + CV au dossier).`, 'Formation');
        an.reglementees.forEach(r => add(B, `Formation réglementée : ${r.label}`, 'Elle doit être animée par un formateur certifié (ou un organisme habilité). Sans certification déclarée dans votre profil, sous-traitez-la.', 'Formation'));
        if (an.affirmations.length) add(B, 'Qualification du formateur inventée dans le texte', `« ${an.affirmations[0].phrase.slice(0, 160)} »${an.affirmations.length > 1 ? ` (+ ${an.affirmations.length - 1} autre(s))` : ''} — rien de tel ne figure dans votre profil : à retirer.`, 'Formation');
      }
    }

    /* ── 2. Entreprise cliente ── */
    const siret = String(client.siret || '').replace(/\s/g, '');
    if (!/^\d{14}$/.test(siret)) add(B, 'SIRET du client manquant ou invalide', siret ? `« ${client.siret} » ne comporte pas 14 chiffres.` : '', 'Fiche client');
    if (!/\b\d{5}\b/.test(client.address || '')) add(A, 'Adresse du client sans code postal', '', 'Fiche client');
    if (!client.nomGerant) add(A, 'Représentant légal du client non renseigné', 'Nécessaire pour la signature du devis et de la convention.', 'Fiche client');
    else if (!/\s/.test(client.nomGerant.trim()) || !/,|gérant|gerant|président|president|directeur|directrice|dirigeant/i.test(client.nomGerant))
      add(A, 'Représentant légal incomplet', `« ${client.nomGerant} » : indiquez prénom, NOM et qualité (ex. « Massoud MESSOUT, gérant ») — c'est lui qui signe.`, 'Fiche client');
    if (!client.phone && !client.email) add(A, 'Contact du client manquant', 'Téléphone ou e-mail du signataire : la ligne « Contact » des documents est vide.', 'Fiche client');

    const idcc = String(client.idcc || '').trim();
    const eff = parseInt(client.employees);
    if (!idcc) add(A, 'Convention collective (IDCC) non renseignée', 'Elle conditionne l\'OPCO compétent et le barème.', 'Fiche client');
    else {
      const regle = this.IDCC_EFFECTIF[idcc];
      if (regle && Number.isFinite(eff)) {
        if ((regle.max != null && eff > regle.max) || (regle.min != null && eff < regle.min)) fx.idccAutre = regle.autre;
        if ((regle.max != null && eff > regle.max) || (regle.min != null && eff < regle.min))
          add(B, `IDCC ${idcc} incohérent avec l'effectif (${eff} salariés)`,
            `L'IDCC ${idcc} = ${regle.libelle}. Avec ${eff} salariés, c'est en principe l'IDCC ${regle.autre}. Vérifiez sur une fiche de paie avant de déposer.`, 'Fiche client');
      }
      const idccOpco = typeof Entreprise !== 'undefined' && Object.entries(Entreprise.IDCC_OPCO || {}).find(([, l]) => l.includes(idcc))?.[0];
      if (idccOpco && opco && idccOpco !== opco) add(B, `L'IDCC ${idcc} ne relève pas de ${opcoLabel}`, 'Le dossier serait déposé auprès du mauvais OPCO.', 'Fiche client');
    }
    if (!Number.isFinite(eff)) add(A, 'Effectif du client inconnu', 'Il détermine le barème (et, dans le bâtiment, la convention collective).', 'Fiche client');

    /* ── 3. Stagiaires ── */
    const stag = (dossier.trainees || []).filter(t => (t.firstName || '').trim() || (t.lastName || '').trim());
    if (!stag.length) add(B, 'Aucun stagiaire', 'La liste nominative est obligatoire.', 'Formation');
    stag.forEach(t => {
      if (!(t.firstName || '').trim() || !(t.lastName || '').trim()) add(B, `Stagiaire incomplet : ${(t.lastName || t.firstName || '').trim()}`, 'Nom ET prénom sont requis.', 'Formation');
    });
    const inverses = stag.filter(t => this.nomInverse(t));
    if (inverses.length)
      add(A, `Nom / prénom peut-être inversé(s) : ${inverses.map(t => `Prénom « ${t.firstName} », Nom « ${t.lastName} »`).join(' ; ')}`,
        'L\'OPCO rapproche les noms de la DSN : ils doivent correspondre exactement à la pièce d\'identité / fiche de paie (Prénom dans « Prénom », NOM dans « Nom »).', 'Formation');
    if (Number.isFinite(eff) && stag.length > eff) add(A, 'Plus de stagiaires que de salariés', `${stag.length} stagiaires pour un effectif de ${eff}.`, 'Formation');

    /* ── 4. Dates, durée, délai de dépôt ── */
    const jours = typeof Documents !== 'undefined' ? Documents._expandDates(dossier.trainingDates) : [];
    const heures = Number(dossier.dureeHeures) > 0 ? Number(dossier.dureeHeures) : jours.length * 7;
    if (!jours.length) add(B, 'Dates de formation manquantes', '', 'Formation');
    else {
      const debut = this._date(jours[0]);
      const delta = Math.floor((debut - this._date()) / 86400000);
      const m = String(cfg.deadline || '').match(/(\d+)\s*jours/);
      const delai = cfg.delaiJours ?? (m ? parseInt(m[1]) : 0);
      const limite = typeof CriteresOpco !== 'undefined' ? CriteresOpco.depotAvant(opco, jours[0]) : this._plus(debut, -delai);
      const avantLimite = limite ? Math.floor((limite - this._date()) / 86400000) : delta - delai;
      if (demande && avantAccord) {
        if (delta < 0) add(B, 'La formation a déjà commencé', 'Une demande de prise en charge doit être déposée avant le début de la formation.', 'Formation');
        else if (avantLimite < 0) add(B, `Délai de dépôt dépassé pour ${opcoLabel}`, `La demande devait parvenir au plus tard le ${this._fr(limite)} (${cfg.deadline || `${delai} jours avant`}). Décalez les dates (bouton « Proposer durée, dates et prix »).`, 'Formation');
        else if (avantLimite < 7) add(A, 'Délai de dépôt serré', `Dépôt à faire au plus tard le ${this._fr(limite)} — faites signer le devis tout de suite.`, 'Formation');
        else add(OK, `Délai respecté — dépôt au plus tard le ${this._fr(limite)}`);
      }
      const hj = heures / jours.length;
      if (hj > 10) add(B, `${this._h(hj)} par jour`, 'Durée journalière irréaliste : ajoutez des jours ou réduisez la durée.', 'Formation');
      else if (hj > 7.5) add(A, `${this._h(hj)} par jour`, 'Au-delà de 7 h par jour, l\'OPCO peut demander des justifications : préférez des journées de 7 h.', 'Formation');
      else if (Math.abs(hj * 2 - Math.round(hj * 2)) > 0.01)
        add(A, `Répartition irrégulière : ${this._h(hj)} par jour`, `${this._h(heures)} sur ${jours.length} jours. Préférez des journées ou demi-journées complètes (ex. 2 jours de 7 h), ou saisissez des périodes qui reflètent les vrais horaires.`, 'Formation');
    }

    /* ── 5. Contenu pédagogique ── */
    const modules = this.modules(dossier.contenu);
    if (!String(dossier.objectifs || '').trim()) add(B, 'Objectifs pédagogiques manquants', '', 'Formation');
    else {
      const obj = this._items(dossier.objectifs).filter(l => !/capables?\s+de\s*:?\s*$/i.test(l));
      if (obj.length < 2) add(A, 'Objectifs trop peu détaillés', 'Listez 3 à 5 objectifs opérationnels (verbes d\'action mesurables).', 'Formation');
      const vagues = obj.filter(l => this.MOTS_VAGUES.test(l));
      if (vagues.length) add(A, 'Objectifs non mesurables', `« ${vagues[0]} »… Remplacez « connaître / comprendre / être sensibilisé » par un verbe observable (identifier, appliquer, réaliser…).`, 'Formation');
    }
    if (!modules.length) add(B, 'Programme détaillé manquant', 'Le contenu doit être découpé en modules avec leur durée.', 'Formation');
    else {
      const sansDuree = modules.filter(mo => mo.heures == null);
      const total = modules.reduce((s, mo) => s + (mo.heures || 0), 0);
      if (sansDuree.length) add(B, 'Durée manquante sur certains modules', sansDuree.map(mo => mo.titre).join(' ; '), 'Formation');
      else if (Math.abs(total - heures) > 0.01) add(B, `Total des modules (${this._h(total)}) ≠ durée de la formation (${this._h(heures)})`, 'Les durées du programme doivent correspondre exactement à la durée facturée.', 'Formation');
      else add(OK, `Programme : ${modules.length} modules, total ${this._h(total)} cohérent`);
      if (dossier.modalite === 'mixte') {
        const flous = modules.filter(mo => !mo.modalite);
        if (flous.length) add(B, 'Formation mixte : modalité non précisée par module', `Indiquez pour chaque module « présentiel » ou « à distance » (ex. « Module 1 — … (3,5 h — à distance) »). Modules concernés : ${flous.map(mo => mo.titre).join(' ; ')}.`, 'Formation');
        else {
          const hd = modules.filter(mo => mo.modalite === 'distanciel').reduce((s, mo) => s + (mo.heures || 0), 0);
          add(OK, `Mixte détaillé : ${this._h(heures - hd)} en présentiel, ${this._h(hd)} à distance`);
        }
      }
    }
    if (!String(dossier.evaluation || '').trim()) add(B, 'Modalités d\'évaluation manquantes', '', 'Formation');
    const froid = String(dossier.evaluation || '').match(/froid[^\n]*?(\d+)\s*jours/i);
    if (froid && parseInt(froid[1]) < 60) add(A, `Évaluation à froid à ${froid[1]} jours`, 'Les autres documents annoncent une évaluation à froid à 2-3 mois : harmonisez.', 'Formation');
    const flous = `${dossier.moyens || ''}\n${dossier.contenu || ''}`.match(/si possible|éventuellement|au (minimum|moins) \d+\s*m²|\d+\s*m²/gi);
    if (flous) add(A, 'Formulations imprécises dans les moyens', `« ${[...new Set(flous.map(f => f.toLowerCase()))].join(' », « ')} » : un document contractuel ne promet rien de conditionnel ni d'exigence non vérifiée.`, 'Formation');
    if (dossier.modalite === 'mixte' || dossier.modalite === 'distanciel') {
      const txt = String(dossier.moyens || '');
      if (!/visio|classe virtuelle|plateforme|teams|zoom|meet|lms|e-learning|en ligne/i.test(txt))
        add(A, 'Moyens à distance non décrits', 'Précisez l\'outil (classe virtuelle, plateforme), l\'assistance technique et pédagogique et le suivi (relevé de connexion).', 'Formation');
      if (dossier.modalite === 'mixte' && dossier.lieu && !/\b\d{5}\b/.test(dossier.lieu) && !/locaux/i.test(dossier.lieu))
        add(A, 'Lieu imprécis', `« ${dossier.lieu} » : indiquez l'adresse du présentiel et l'outil du distanciel — ou laissez le champ vide pour le texte automatique.`, 'Formation');
    }
    if (this.publicGenerique(dossier.publicVise))
      add(A, 'Public visé trop générique', 'Il recopie la liste des secteurs de la convention collective. Décrivez les salariés réellement formés (postes, ex. maçons, chefs de chantier, secrétaire).', 'Formation');

    /* ── 5 bis. Règles du dispositif (durée max, éligibilité, exclusions) ── */
    const b = typeof Tarifs !== 'undefined' ? Tarifs.bareme(opco, dossier.dispositif, client.employees, client) : null;
    if (b) {
      if (b.brancheInconnue) add(A, 'Branche du client à préciser', 'Renseignez l\'IDCC : les plafonds diffèrent selon la branche (ex. bâtiment / travaux publics).', 'Fiche client');
      if (b.dureeMax && heures > b.dureeMax) add(B, `Durée supérieure au maximum du dispositif (${b.dureeMax} h)`, `${b.dispositif} : ${this._h(heures)} prévues.`, 'Formation');
      if (b.exclusions && b.exclusions.test(`${dossier.trainingSubject || ''} ${dossier.contenu || ''}`))
        add(B, `Thème exclu du dispositif « ${b.dispositif} »`, b.note || '', 'Formation');
      if (b.naf) {
        const naf = String(client.codeNaf || '').replace(/[.\s]/g, '').toUpperCase();
        if (!naf) add(A, 'Code NAF du client manquant', `Le dispositif « ${b.dispositif} » est réservé aux codes NAF ${b.naf.join(', ')}.`, 'Fiche client');
        else if (!b.naf.includes(naf)) add(B, `Code NAF ${client.codeNaf} non éligible`, `« ${b.dispositif} » est réservé aux codes NAF ${b.naf.join(', ')}. Choisissez « Plan de développement des compétences ».`, 'Formation');
      }
      if (b.max != null && Number.isFinite(eff) && eff > b.max && b.dispositif !== 'Plan de développement des compétences')
        add(B, `Effectif trop élevé pour « ${b.dispositif} »`, `Réservé aux entreprises de ${b.max} salariés maximum (${eff} chez le client).`, 'Formation');
      if (b.minStagiairesIntra && stag.length && stag.length < b.minStagiairesIntra)
        add(A, `Forfait intra : ${b.minStagiairesIntra} stagiaires minimum`, `${stag.length} stagiaire(s) prévu(s) : le forfait journalier ne s'applique pas, seul le taux horaire par stagiaire compte.`, 'Formation');
      if (b.budgetAnnuel) add(A, `Budget annuel ${opcoLabel} : ${Tarifs.eur(b.budgetAnnuel)} par entreprise`, 'Vérifiez avec le client ce qui a déjà été consommé cette année sur son espace OPCO : le reste à charge augmente d\'autant.', 'Fiche client');
    }
    if (modules.length && jours.length) {
      const pasDemi = modules.filter(mo => mo.heures && Math.abs(mo.heures / 3.5 - Math.round(mo.heures / 3.5)) > 0.01);
      if (pasDemi.length) add(A, 'Modules non calés sur des demi-journées', `Le planning (programme) sera moins lisible : ${pasDemi.map(mo => mo.titre).join(' ; ')}. Privilégiez des durées multiples de 3,5 h.`, 'Formation');
    }
    if (dossier.modalite === 'mixte' && modules.length && modules.every(mo => mo.modalite)) {
      if (!modules.some(mo => mo.modalite === 'presentiel') || !modules.some(mo => mo.modalite === 'distanciel'))
        add(B, 'Formation déclarée mixte sans présentiel ET distanciel', 'Changez la modalité ou répartissez les modules.', 'Formation');
    }

    /* ── 6. Prix / barème OPCO ── */
    if (this.DOCS_PRIX.includes(typeDoc) || demande) {
      const prix = parseFloat(dossier.price) || 0;
      if (!prix) add(B, 'Prix HT manquant', '', 'Formation');
      else if (typeof Tarifs !== 'undefined') {
        const s = Tarifs.suggestion({ opco, dispositif: dossier.dispositif, effectif: client.employees, heures, stagiaires: stag.length || 1, prix, jours: jours.length, client });
        if (s?.estimation) fx.prixMax = Math.floor(s.estimation.max);
        if (s?.estimation && prix > s.estimation.max + 1) {
          add(A, `Prix au-dessus de la prise en charge ${opcoLabel}`,
            `${Tarifs.eur(prix)} demandés, prise en charge maximale estimée ${Tarifs.eur(s.estimation.max)} (limitée par : ${s.estimation.detail}). Reste à charge de l'entreprise : ${Tarifs.eur(prix - s.estimation.max)} — à faire accepter par le client, ou ajustez le prix à ${Tarifs.eur(s.estimation.max)}.`, 'Formation');
        } else if (s?.estimation) add(OK, `Prix dans le barème (max. ${Tarifs.eur(s.estimation.max)})`);
      }
    }

    [...B, ...A].forEach(i => { i.fix = this.correctif(i, { of, client, fx }); });
    const score = Math.max(0, 100 - B.length * 20 - A.length * 5);
    return { bloquants: B, alertes: A, ok: OK, score, opcoLabel };
  },

  /* ══════════════════════════════════════════════════════════════════════
     OUTILS D'ANALYSE
  ══════════════════════════════════════════════════════════════════════ */
  _items(t) { return String(t || '').replace(/\s*•\s*/g, '\n').split('\n').map(l => l.replace(/^[\s\-–*✔✓]+/, '').trim()).filter(Boolean); },

  /** Modules du programme : titre, heures, modalité (présentiel / distanciel) */
  modules(contenu) {
    const isTitre = l => /^(module|jour|journ[ée]e|s[ée]quence|partie|chapitre|[0-9]+[.)\-–]\s)/i.test(l) && l.length < 140;
    return String(contenu || '').split('\n').map(l => l.trim()).filter(isTitre).map(l => {
      const m = l.match(/(\d+(?:[.,]\d+)?)\s*h(?:eures?)?\b/i);
      const distanciel = /distanc|classe virtuelle|en ligne|visio|e-learning|foad/i.test(l);
      const presentiel = /présentiel|presentiel|sur site|en entreprise|dans les locaux/i.test(l);
      return { titre: l.replace(/\s*:\s*$/, ''), heures: m ? parseFloat(m[1].replace(',', '.')) : null,
               modalite: distanciel && !presentiel ? 'distanciel' : (presentiel && !distanciel ? 'presentiel' : (distanciel ? 'mixte' : null)) };
    });
  },

  publicGenerique(t) {
    const s = String(t || '');
    if (!s.trim()) return false;
    const secteurs = (s.match(/travaux publics|négoce|génie civil|menuiserie|plomberie|électricité|bâtiment|commerce|transport|automobile/gi) || []).length;
    return /\bIDCC\b|convention collective/i.test(s) || secteurs >= 4;
  },

  /** Nom / prénom probablement inversé : prénom courant saisi en « Nom », ou casse inversée (NOM saisi en prénom) */
  nomInverse(t) {
    const fn = (t.firstName || '').trim(), ln = (t.lastName || '').trim();
    if (!fn || !ln) return false;
    const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[\s-]/)[0];
    const lnPrenom = this.PRENOMS.has(norm(ln)), fnPrenom = this.PRENOMS.has(norm(fn));
    if (lnPrenom && !fnPrenom) return true;
    const maj = s => s === s.toUpperCase() && /[A-Z]/.test(s), mixte = s => /[a-z]/.test(s) && /[A-Z]/.test(s);
    return maj(fn) && mixte(ln);
  },

  /** Normalisation à l'enregistrement : NOM en capitales, Prénom en casse titre */
  normaliserNom(t) {
    const titre = s => s.toLowerCase().replace(/(^|[\s\-'])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
    return { ...t, firstName: titre((t.firstName || '').trim()), lastName: (t.lastName || '').trim().toUpperCase() };
  },

  _date(iso) { const d = iso ? new Date(iso + (String(iso).length === 10 ? 'T00:00' : '')) : new Date(); d.setHours(0, 0, 0, 0); return d; },
  _plus(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; },
  _fr(d) { return (d instanceof Date ? d : new Date(d + 'T00:00')).toLocaleDateString('fr-FR'); },
  _h(h) { return `${String(Math.round(h * 100) / 100).replace('.', ',')} h`; },

  /* ══════════════════════════════════════════════════════════════════════
     AFFICHAGE
  ══════════════════════════════════════════════════════════════════════ */
  _of: null, _ofAt: 0,
  async profil() {
    if (!this._of || Date.now() - this._ofAt > 60000) {
      const of = await Documents._getOFProfile();
      of.formatrice = typeof Formatrice !== 'undefined' ? await Formatrice.charger() : undefined;   // undefined = non vérifiable
      this._of = of; this._ofAt = Date.now();
    }
    return this._of;
  },

  /* ══════════════════════════════════════════════════════════════════════
     RACCOURCIS DE CORRECTION
     profil : petit formulaire en ligne, enregistré dans les Paramètres
     client : idem dans la fiche client (ou bouton « en un clic »)
     action : correction automatique dans le formulaire formation
  ══════════════════════════════════════════════════════════════════════ */
  correctif(item, { of = {}, client = {}, fx = {} }) {
    const t = item.titre;
    const P = (cle, label, valeur = '', placeholder = '') => ({ cle, label, valeur, placeholder });
    const pro = /idea ?forma/i.test(of.nom || '') ? 'contact@ideaforma.fr' : '';
    const emailPro = this.WEBMAILS.test(of.email || '') ? pro : (of.email || '');
    const regles = [
      [/NDA\) manquant|Format du NDA/, { type: 'profil', champs: [P('numero_da', 'N° de déclaration d\'activité', of.da || '', '11 chiffres')] }],
      [/certificat Qualiopi manquant|Qualiopi ressemble/, { type: 'profil', champs: [P('numero_qualiopi', 'N° du certificat Qualiopi', '', 'tel qu\'écrit sur le certificat')] }],
      [/dirigeante \/ formatrice/, { type: 'profil', champs: [P('nom', 'Nom affiché (dirigeante / formatrice)', '', 'Ex. Myriam AYOUAZ')] }],
      [/Adresse de l'organisme/, { type: 'profil', champs: [P('adresse', 'Adresse complète', of.adresse || '', 'N°, rue, code postal, ville')] }],
      [/e-mail personnelle/, { type: 'profil', champs: [P('email', 'E-mail sur les documents', pro, 'contact@…')] }],
      [/Référent handicap/, { type: 'profil', champs: [P('referent_handicap', 'Référent handicap', of.dirigeant || '', 'Nom'), P('referent_handicap_contact', 'Contact', emailPro, 'E-mail ou téléphone')] }],
      [/SIRET du client/, { type: 'client', champs: [P('siret', 'SIRET', client.siret || '', '14 chiffres')] }],
      [/Adresse du client/, { type: 'client', champs: [P('address', 'Adresse du client', client.address || '', 'N°, rue, code postal, ville')] }],
      [/Représentant légal du client/, { type: 'client', champs: [P('nomGerant', 'Représentant légal', '', 'Nom et prénom')] }],
      [/IDCC .* incohérent/, { type: 'client', set: { idcc: fx.idccAutre }, label: `Passer le client en IDCC ${fx.idccAutre}`, champs: [P('idcc', 'IDCC (fiche de paie)', client.idcc || '')] }],
      [/IDCC\) non renseignée|ne relève pas de|Branche du client/, { type: 'client', champs: [P('idcc', 'IDCC (fiche de paie)', client.idcc || '', 'Ex. 1596')] }],
      [/Effectif du client/, { type: 'client', champs: [P('employees', 'Effectif (salariés)', '', 'Ex. 7')] }],
      [/Code NAF du client/, { type: 'client', champs: [P('codeNaf', 'Code NAF', client.codeNaf || '', 'Ex. 4520A')] }],
      [/Profil de la formatrice/, { type: 'action', action: 'parametres', label: 'Ouvrir le profil de la formatrice' }],
      [/hors des compétences/, { type: 'action', action: 'parametres', label: 'Revoir mon profil (uniquement si je peux le justifier)' }],
      [/Qualification du formateur inventée/, { type: 'action', action: 'retirerAffirmations', label: 'Retirer ces phrases' }],
      [/Formulations imprécises/, { type: 'action', action: 'nettoyerMoyens', label: 'Nettoyer le texte' }],
      [/Évaluation à froid à/, { type: 'action', action: 'froid', label: 'Passer l\'évaluation à froid à 2-3 mois' }],
      [/Représentant légal incomplet/, { type: 'client', champs: [P('nomGerant', 'Prénom NOM, qualité', client.nomGerant || '', 'Ex. Massoud MESSOUT, gérant')] }],
      [/Contact du client/, { type: 'client', auMoinsUn: true, champs: [P('phone', 'Téléphone', client.phone || '', '06…'), P('email', 'E-mail', client.email || '', 'contact@…')] }],
      [/peut-être inversé/, { type: 'action', action: 'inverserNoms', label: 'Inverser prénom et nom de ces stagiaires' }],
      [/Aucun stagiaire|Stagiaire incomplet/, { type: 'action', action: 'champ:#traineeList', label: 'Aller aux participants' }],
      [/Dates de formation manquantes|Délai de dépôt|déjà commencé|par jour|Répartition irrégulière|Durée supérieure/, { type: 'action', action: 'proposition', label: 'Recalculer durée, dates et prix' }],
      [/Prix HT manquant/, { type: 'action', action: 'proposition', label: 'Calculer le prix' }],
      [/Prix au-dessus/, { type: 'action', action: 'prix', valeur: fx.prixMax, label: fx.prixMax ? `Appliquer ${Tarifs.eur(fx.prixMax)}` : 'Ajuster le prix' }],
      [/Objectifs|Programme détaillé|Durée manquante sur|Total des modules|modalité non précisée|mixte sans|Modules non calés|Modalités d'évaluation/, { type: 'action', action: 'ia', label: 'Régénérer le contenu avec l\'IA' }],
      [/Moyens à distance/, { type: 'action', action: 'moyens', label: 'Insérer les moyens à distance' }],
      [/Lieu imprécis/, { type: 'action', action: 'lieu', label: 'Utiliser le lieu automatique' }],
      [/Public visé/, { type: 'action', action: 'publicVise', label: 'Rédiger à partir des postes' }],
      [/Thème exclu|NAF .* non éligible|Effectif trop élevé/, { type: 'action', action: 'dispositifPDC', label: 'Passer en plan de développement des compétences' }]
    ];
    const r = regles.find(([re]) => re.test(t));
    return r ? r[1] : null;
  },

  _fixHtml(fix, idx) {
    if (!fix) return '';
    if (fix.type === 'action') return `<div class="conf-fix"><button type="button" class="conf-btn" data-fix="${idx}">${this._esc(fix.label)}</button></div>`;
    const un = fix.set && Object.values(fix.set).every(v => v) ? `<button type="button" class="conf-btn" data-fix="${idx}" data-un-clic="1">${this._esc(fix.label)}</button>` : '';
    const champs = fix.champs.map((c, j) => `<label class="conf-champ"><span>${this._esc(c.label)}</span>
        <input type="text" data-fix-champ="${idx}-${j}" value="${this._esc(c.valeur)}" placeholder="${this._esc(c.placeholder)}"></label>`).join('');
    return `<div class="conf-fix">${un}${un ? '<span class="conf-ou-sep">ou</span>' : ''}${champs}
      <button type="button" class="conf-btn conf-btn-plein" data-fix="${idx}">Enregistrer${fix.type === 'profil' ? ' dans les Paramètres' : ' dans la fiche client'}</button></div>`;
  },

  _liste(items, cls, base = 0) {
    return items.map((i, k) => `<li class="conf-item ${cls}"><strong>${this._esc(i.titre)}</strong>${i.ou ? ` <span class="conf-ou">${this._esc(i.ou)}</span>` : ''}${i.detail ? `<div class="conf-detail">${this._esc(i.detail)}</div>` : ''}${this._fixHtml(i.fix, base + k)}</li>`).join('');
  },

  /**
   * Branche les raccourcis d'un encadré. ctx : { client, action(nomAction, fix) → Promise|void, apres() }
   */
  brancherCorrectifs(racine, r, ctx = {}) {
    if (!racine) return;
    const items = [...r.bloquants, ...r.alertes];
    /* Entrée dans un champ de correction = Enregistrer (et pas d'envoi du formulaire) */
    racine.querySelectorAll('[data-fix-champ]').forEach(inp => inp.addEventListener('keydown', ev => {
      if (ev.key !== 'Enter') return;
      ev.preventDefault();
      inp.closest('.conf-fix')?.querySelector('.conf-btn-plein')?.click();
    }));
    racine.querySelectorAll('[data-fix]').forEach(btn => btn.addEventListener('click', async ev => {
      ev.preventDefault();
      const idx = +btn.dataset.fix, fix = items[idx]?.fix;
      if (!fix) return;
      btn.disabled = true;
      try {
        if (fix.type === 'action') { await ctx.action?.(fix.action, fix); }
        else {
          const valeurs = btn.dataset.unClic ? { ...fix.set } : Object.fromEntries(fix.champs.map((c, j) => [c.cle, racine.querySelector(`[data-fix-champ="${idx}-${j}"]`)?.value.trim() || '']));
          if (fix.auMoinsUn ? Object.values(valeurs).every(v => !v) : Object.values(valeurs).some(v => !v)) { Toast.show('Complétez le champ avant d\'enregistrer', 'warning'); btn.disabled = false; return; }
          if (fix.type === 'profil') {
            await DataStore.updateProfile(valeurs);
            this._of = null;
          } else {
            const c = ctx.client;
            if (!c?.id) throw new Error('fiche client introuvable');
            Object.assign(c, valeurs);
            await DataStore.updateClient(c.id, c);
          }
          Toast.show('Corrigé ✓', 'success');
        }
        await ctx.apres?.();
      } catch (err) {
        console.error(err);
        Toast.show('Correction impossible : ' + this._esc(err.message), 'error');
        btn.disabled = false;
      }
    }));
  },
  _esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); },

  /** Encadré compact pour le formulaire */
  panneau(r) {
    const etat = r.bloquants.length ? 'bloque' : (r.alertes.length ? 'alerte' : 'ok');
    const titre = r.bloquants.length ? `${r.bloquants.length} point(s) bloquant(s) avant dépôt ${r.opcoLabel}`
      : (r.alertes.length ? `Conforme — ${r.alertes.length} point(s) à vérifier` : `Dossier conforme pour ${r.opcoLabel}`);
    return `<div class="conf-box conf-${etat}">
      <div class="conf-head">Contrôle de conformité · ${this._esc(titre)}</div>
      <ul class="conf-list">${this._liste(r.bloquants, 'conf-b')}${this._liste(r.alertes, 'conf-a', r.bloquants.length)}${this._liste(r.ok, 'conf-ok')}</ul>
    </div>`;
  },

  /**
   * Contrôle puis génère. `generer` n'est appelé que si rien n'est bloquant.
   * Retourne true si la génération a eu lieu.
   */
  async controlerPuisGenerer({ dossier, client, opco, typeDoc, generer, corriger }) {
    const synchroClient = () => Object.assign(dossier, {
      companyName: client.companyName, siret: client.siret, address: client.address, nomGerant: client.nomGerant,
      idcc: client.idcc, employees: client.employees, codeNaf: client.codeNaf });
    const of0 = await this.profil();
    const r0 = this.verifier({ dossier, client, of: of0, opco, typeDoc });
    if (!r0.bloquants.length && !r0.alertes.length) { await generer(); return true; }

    return new Promise(resolve => {
      const afficher = async () => {
        synchroClient();
        const of = await this.profil();
        const r = this.verifier({ dossier, client, of, opco, typeDoc });
        const actions = [{ label: 'Fermer', cls: 'btn btn-secondary', action: () => { Modal.close(); resolve(false); } }];
        if (corriger) actions.push({ label: 'Ouvrir la formation', cls: 'btn btn-secondary', action: () => { corriger(); resolve(false); } });
        actions.push({ label: 'Analyse IA du contenu', cls: 'btn btn-secondary', action: () => this._analyseIA({ dossier, client, opco, r }) });
        if (!r.bloquants.length) actions.push({ label: 'Générer le document', cls: 'btn btn-primary',
          action: async () => { await generer(); resolve(true); } });
        Modal.open(`Contrôle de conformité — ${r.opcoLabel}`, `
          ${r.bloquants.length ? `<p class="conf-intro">Le document n'est pas généré : ces points feraient rejeter la demande. Corrigez-les directement ci-dessous (boutons sous chaque point), puis générez.</p>`
            : `<p class="conf-intro">Aucun point bloquant. Vérifiez ces points avant l'envoi :</p>`}
          <div id="confPanneauModal">${this.panneau(r)}</div>
          <div id="confIA"></div>`, actions, 'modal-lg');
        this.brancherCorrectifs(document.getElementById('confPanneauModal'), r, {
          client,
          /* Les corrections du contenu se font dans le formulaire : on l'ouvre et on applique le raccourci */
          action: async (nom) => { if (corriger) { corriger(nom); resolve(false); } },
          apres: async () => { if (document.getElementById('confPanneauModal')) await afficher(); }
        });
      };
      afficher();
    });
  },

  async _analyseIA({ dossier, client, opco, r }) {
    const zone = document.getElementById('confIA');
    if (!zone) return;
    zone.innerHTML = '<div class="ai-loading"><span class="ai-spinner"></span><span>Relecture du contenu par l\'IA…</span></div>';
    try {
      const res = await AI.verifierDossier(opco, dossier, client, r);
      const items = (res.problemes || []).map(p => ({ titre: `${p.champ ? p.champ + ' — ' : ''}${p.probleme}`, detail: p.correction || '' }));
      zone.innerHTML = `<div class="conf-box conf-${res.statut === 'conforme' ? 'ok' : 'alerte'}" style="margin-top:12px;">
        <div class="conf-head">Relecture IA · ${this._esc(res.synthese || res.statut || '')}</div>
        <ul class="conf-list">${items.length ? this._liste(items, 'conf-a') : '<li class="conf-item conf-ok">Aucune incohérence de contenu relevée.</li>'}</ul></div>`;
    } catch (err) {
      zone.innerHTML = `<div class="ai-error">Analyse IA indisponible : ${this._esc(err.message)}</div>`;
    }
  }
};
