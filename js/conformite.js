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

    /* ── 2. Entreprise cliente ── */
    const siret = String(client.siret || '').replace(/\s/g, '');
    if (!/^\d{14}$/.test(siret)) add(B, 'SIRET du client manquant ou invalide', siret ? `« ${client.siret} » ne comporte pas 14 chiffres.` : '', 'Fiche client');
    if (!/\b\d{5}\b/.test(client.address || '')) add(A, 'Adresse du client sans code postal', '', 'Fiche client');
    if (!client.nomGerant) add(A, 'Représentant légal du client non renseigné', 'Nécessaire pour la signature du devis et de la convention.', 'Fiche client');

    const idcc = String(client.idcc || '').trim();
    const eff = parseInt(client.employees);
    if (!idcc) add(A, 'Convention collective (IDCC) non renseignée', 'Elle conditionne l\'OPCO compétent et le barème.', 'Fiche client');
    else {
      const regle = this.IDCC_EFFECTIF[idcc];
      if (regle && Number.isFinite(eff)) {
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
      const delai = m ? parseInt(m[1]) : 0;
      if (demande && avantAccord) {
        if (delta < 0) add(B, 'La formation a déjà commencé', 'Une demande de prise en charge doit être déposée avant le début de la formation.', 'Formation');
        else if (delta < delai) add(B, `Délai de dépôt dépassé pour ${opcoLabel}`, `Début dans ${delta} jour(s) : la demande doit parvenir au moins ${delai} jours avant (au plus tard le ${this._fr(this._plus(debut, -delai))}). Décalez les dates.`, 'Formation');
        else if (delai && delta < delai + 7) add(A, 'Délai de dépôt serré', `Dépôt à faire au plus tard le ${this._fr(this._plus(debut, -delai))}.`, 'Formation');
        else if (delai) add(OK, `Délai respecté — dépôt au plus tard le ${this._fr(this._plus(debut, -delai))}`);
      }
      const hj = heures / jours.length;
      if (hj > 7.5) add(B, `${this._h(hj)} par jour`, 'Une journée de formation ne doit pas dépasser 7 h : ajoutez des jours ou réduisez la durée.', 'Formation');
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
    if (dossier.modalite === 'mixte' || dossier.modalite === 'distanciel') {
      const txt = String(dossier.moyens || '');
      if (!/visio|classe virtuelle|plateforme|teams|zoom|meet|lms|e-learning|en ligne/i.test(txt))
        add(A, 'Moyens à distance non décrits', 'Précisez l\'outil (classe virtuelle, plateforme), l\'assistance technique et pédagogique et le suivi (relevé de connexion).', 'Formation');
      if (dossier.modalite === 'mixte' && dossier.lieu && !/\b\d{5}\b/.test(dossier.lieu) && !/locaux/i.test(dossier.lieu))
        add(A, 'Lieu imprécis', `« ${dossier.lieu} » : indiquez l'adresse du présentiel et l'outil du distanciel — ou laissez le champ vide pour le texte automatique.`, 'Formation');
    }
    if (this.publicGenerique(dossier.publicVise))
      add(A, 'Public visé trop générique', 'Il recopie la liste des secteurs de la convention collective. Décrivez les salariés réellement formés (postes, ex. maçons, chefs de chantier, secrétaire).', 'Formation');

    /* ── 6. Prix / barème OPCO ── */
    if (this.DOCS_PRIX.includes(typeDoc) || demande) {
      const prix = parseFloat(dossier.price) || 0;
      if (!prix) add(B, 'Prix HT manquant', '', 'Formation');
      else if (typeof Tarifs !== 'undefined') {
        const s = Tarifs.suggestion({ opco, dispositif: dossier.dispositif, effectif: client.employees, heures, stagiaires: stag.length || 1, prix, jours: jours.length });
        if (s?.estimation && prix > s.estimation.max + 1) {
          add(A, `Prix au-dessus de la prise en charge ${opcoLabel}`,
            `${Tarifs.eur(prix)} demandés, prise en charge maximale estimée ${Tarifs.eur(s.estimation.max)} (${s.tauxTexte}${s.estimation.plafondJour ? `, plafond ${Tarifs.eur(s.bareme.plafondJour)}/jour/groupe` : ''}). Reste à charge de l'entreprise : ${Tarifs.eur(prix - s.estimation.max)} — à faire accepter par le client, ou ajustez le prix à ${Tarifs.eur(s.estimation.max)}.`, 'Formation');
        } else if (s?.estimation) add(OK, `Prix dans le barème (max. ${Tarifs.eur(s.estimation.max)})`);
      }
    }

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
    if (!this._of || Date.now() - this._ofAt > 60000) { this._of = await Documents._getOFProfile(); this._ofAt = Date.now(); }
    return this._of;
  },

  _liste(items, cls) {
    return items.map(i => `<li class="conf-item ${cls}"><strong>${this._esc(i.titre)}</strong>${i.ou ? ` <span class="conf-ou">${this._esc(i.ou)}</span>` : ''}${i.detail ? `<div class="conf-detail">${this._esc(i.detail)}</div>` : ''}</li>`).join('');
  },
  _esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); },

  /** Encadré compact pour le formulaire */
  panneau(r) {
    const etat = r.bloquants.length ? 'bloque' : (r.alertes.length ? 'alerte' : 'ok');
    const titre = r.bloquants.length ? `${r.bloquants.length} point(s) bloquant(s) avant dépôt ${r.opcoLabel}`
      : (r.alertes.length ? `Conforme — ${r.alertes.length} point(s) à vérifier` : `Dossier conforme pour ${r.opcoLabel}`);
    return `<div class="conf-box conf-${etat}">
      <div class="conf-head">Contrôle de conformité · ${this._esc(titre)}</div>
      <ul class="conf-list">${this._liste(r.bloquants, 'conf-b')}${this._liste(r.alertes, 'conf-a')}${this._liste(r.ok, 'conf-ok')}</ul>
    </div>`;
  },

  /**
   * Contrôle puis génère. `generer` n'est appelé que si rien n'est bloquant.
   * Retourne true si la génération a eu lieu.
   */
  async controlerPuisGenerer({ dossier, client, opco, typeDoc, generer, corriger }) {
    const of = await this.profil();
    const r = this.verifier({ dossier, client, of, opco, typeDoc });
    if (!r.bloquants.length && !r.alertes.length) { await generer(); return true; }

    return new Promise(resolve => {
      const actions = [{ label: 'Fermer', cls: 'btn btn-secondary', action: () => { Modal.close(); resolve(false); } }];
      if (corriger) actions.push({ label: 'Corriger la formation', cls: 'btn btn-secondary', action: () => { corriger(); resolve(false); } });
      actions.push({ label: 'Analyse IA du contenu', cls: 'btn btn-secondary', action: () => this._analyseIA({ dossier, client, opco, r }) });
      if (!r.bloquants.length) actions.push({ label: 'Générer le document', cls: 'btn btn-primary',
        action: async () => { await generer(); resolve(true); } });

      Modal.open(`Contrôle de conformité — ${r.opcoLabel}`, `
        ${r.bloquants.length ? `<p class="conf-intro">Le document n'est pas généré : ces points feraient rejeter la demande. Corrigez-les puis relancez.</p>` : `<p class="conf-intro">Aucun point bloquant. Vérifiez ces points avant l'envoi :</p>`}
        ${this.panneau(r)}
        <div id="confIA"></div>`, actions, 'modal-lg');
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
