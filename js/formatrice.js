/* ─── Profil de la formatrice + garde-fous de compétence ─────────────────────
   Qualiopi (indicateurs 21-22) et les OPCO peuvent demander le CV du
   formateur : l'appli ne doit donc JAMAIS
     • proposer un thème que la formatrice ne peut pas justifier ;
     • écrire dans les documents une qualification qu'elle n'a pas.

   Le profil (diplômes, expériences, domaines justifiables) est enregistré
   dans la table « formateurs » (statut interne) et saisi dans Paramètres.
──────────────────────────────────────────────────────────────────────────── */

const Formatrice = {

  /* Domaines de compétence : cle, libellé, mots qui signalent le domaine dans une formation */
  DOMAINES: [
    { cle: 'bureautique',     label: 'Bureautique et outils numériques (Word, Excel, messagerie, agenda partagé)', re: /bureautique|excel|\bword\b|powerpoint|outlook|tableur|traitement de texte|outils? numériques?|google (docs|sheets|workspace)|logiciel/gi },
    { cle: 'administratif',   label: 'Gestion administrative, secrétariat, organisation et classement', re: /administrati|secrétariat|secretariat|classement|archivage|courrier|gestion documentaire|organisation (administrative|du bureau)|tableaux? de bord|suivi des dossiers/gi },
    { cle: 'relation_client', label: 'Accueil, relation client et communication téléphonique', re: /accueil|relation clients?|téléphon|réclamations?|satisfaction client|prise de rendez-vous/gi },
    { cle: 'communication',   label: 'Communication professionnelle et écrits professionnels', re: /écrits? professionnels?|rédaction|courriels?|e-mails? professionnels?|compte[s]? rendus?|communication professionnelle|prise de notes/gi },
    { cle: 'gestion_co',      label: 'Gestion commerciale : devis, facturation, relances', re: /devis|facturation|factures?|relances? clients?|recouvrement|gestion commerciale/gi },
    { cle: 'auto_admin',      label: 'Gestion administrative d\'un atelier automobile / carrosserie (sinistres, expertises, assurances)', re: /sinistres?|expertises?|assurances?|réception (atelier|client)|réceptionnaire|ordre de réparation|carrosserie|garage/gi },
    { cle: 'management',      label: 'Management et encadrement d\'équipe', re: /management|manager|encadrement|leadership|animer une équipe|conduite du changement/gi },
    { cle: 'prevention',      label: 'Prévention santé et sécurité au travail (stress, RPS, ergonomie, TMS, gestes et postures)', re: /stress|\brps\b|risques? psycho|ergonom|\btms\b|musculo-?squelettiques?|gestes et postures|prévention des risques|santé (et sécurité )?au travail|sécurité (au travail|sur (le )?chantier)|accidents? du travail|manutention|burn.?out|\bepi\b/gi },
    { cle: 'technique_auto',  label: 'Technique automobile (mécanique, carrosserie, peinture, véhicules électriques)', re: /mécanique|peinture|débosselage|soudure|diagnostic|électrique du véhicule|véhicules? électriques?|hybride/gi },
    { cle: 'ia',              label: 'Intelligence artificielle et automatisation', re: /intelligence artificielle|\bia\b|chatgpt|automatisation/gi },
    { cle: 'langues',         label: 'Langues étrangères', re: /anglais|espagnol|arabe|allemand|italien|langue étrangère/gi }
  ],

  /* Formations réglementées : formateur certifié obligatoire (organisme habilité, INRS…) */
  REGLEMENTEES: [
    { label: 'Sauveteur secouriste du travail (SST)', re: /\bsst\b|secourisme|sauveteur secouriste|premiers secours/i },
    { label: 'Habilitation électrique', re: /habilitation électrique|nf c ?18|\b(b0|h0|bs|br|b1v|b2v)\b/i },
    { label: 'CACES / conduite d\'engins', re: /caces|nacelle|chariot élévateur|conduite d'engins/i },
    { label: 'Travail en hauteur / échafaudage', re: /travail en hauteur|échafaudage|harnais/i },
    { label: 'Amiante (SS3 / SS4)', re: /amiante|\bss[34]\b/i },
    { label: 'AIPR', re: /\baipr\b/i },
    { label: 'PRAP (prévention des risques liés à l\'activité physique)', re: /\bprap\b/i },
    { label: 'Sécurité incendie', re: /incendie|extincteurs?|évacuation|equipier de première intervention|\bepi\b.*incendie/i },
    { label: 'Fluides frigorigènes / climatisation', re: /fluides? frigorigènes?|climatisation/i }
  ],

  /* Phrases interdites : qualification du formateur inventée par l'IA */
  AFFIRMATIONS: /(formateur|formatrice|intervenant|intervenante|animateur|animatrice)[^.;\n]{0,70}(certifi|expert|spécialis|diplômé|qualifié|habilité|agréé|expérience)|\bergonome\b|psychologue|\bIPRP\b|kinésith|certifié INRS|formateur SST/i,

  /* Profil proposé à la première ouverture (à vérifier puis enregistrer) */
  PROPOSITION: {
    diplomes: 'BTS Assistant de manager — Lycée Périer, Marseille (2013)\nBaccalauréat S, option Sciences de l\'ingénieur (2011)',
    experiences: 'Dirigeante et formatrice — IDEAFORMA (depuis 2025)\nSecrétaire — Arnavaux Auto Services, carrosserie, Marseille (2024)\nTéléconseillère — Free (2015-2016)\nAgent de saisie — DFAC / RTM (2013-2014)',
    certifications: '',
    domaines: ['bureautique', 'administratif', 'relation_client', 'communication', 'gestion_co', 'auto_admin']
  },

  /* ── Lecture / écriture ── */
  lire(f) {
    if (!f) return null;
    const j = s => { try { return JSON.parse(s || '{}'); } catch { return {}; } };
    const q = j(f.qualifications), sp = j(f.specialites);
    return {
      id: f.id, prenom: f.prenom || '', nom: f.nom || '',
      diplomes: q.diplomes || '', experiences: q.experiences || '', certifications: q.certifications || '',
      domaines: Array.isArray(sp.domaines) ? sp.domaines : [], autres: sp.autres || ''
    };
  },
  async charger() {
    if (typeof DataStore?.getFormateurPrincipal !== 'function') return undefined;
    try { return this.lire(await DataStore.getFormateurPrincipal()); } catch { return undefined; }
  },
  nomComplet(p) { return p ? `${p.prenom || ''} ${(p.nom || '').toUpperCase()}`.trim() : ''; },
  libelles(p) { return (p?.domaines || []).map(k => this.DOMAINES.find(d => d.cle === k)?.label).filter(Boolean); },

  /** Texte du profil transmis à l'IA */
  pourIA(p) {
    if (!p) return 'Profil non renseigné : n\'attribue AUCUNE qualification au formateur.';
    return [`Formatrice unique : ${this.nomComplet(p)}`,
      p.diplomes && `Diplômes : ${p.diplomes.replace(/\n/g, ' ; ')}`,
      p.certifications && `Certifications : ${p.certifications.replace(/\n/g, ' ; ')}`,
      p.experiences && `Expériences : ${p.experiences.replace(/\n/g, ' ; ')}`,
      `Domaines justifiables : ${this.libelles(p).join(' ; ') || 'aucun'}${p.autres ? ' ; ' + p.autres : ''}`].filter(Boolean).join('\n');
  },

  /* ── Analyse d'une formation ── */
  _compte(re, txt) { re.lastIndex = 0; const m = String(txt || '').match(re); return m ? m.length : 0; },

  /** Domaines dont relève la formation (intitulé et objectifs pèsent plus que le contenu) */
  domainesDe(d) {
    return this.DOMAINES.filter(dom => {
      const score = 3 * this._compte(dom.re, d.trainingSubject) + 2 * this._compte(dom.re, d.objectifs) + this._compte(dom.re, d.contenu);
      return score >= 3;
    });
  },

  analyser(d, p) {
    const doms = this.domainesDe(d);
    const tient = new Set(p?.domaines || []);
    const libre = String(p?.autres || '').toLowerCase();
    const hors = doms.filter(dom => !tient.has(dom.cle) && !(libre && this._compte(dom.re, libre) > 0));
    const txt = `${d.trainingSubject || ''}\n${d.contenu || ''}`;
    const certifs = `${p?.certifications || ''} ${p?.diplomes || ''}`;
    const reglementees = this.REGLEMENTEES.filter(r => r.re.test(txt) && !r.re.test(certifs));
    const affirmations = ['moyens', 'contenu', 'evaluation', 'publicVise']
      .flatMap(ch => this.phrases(d[ch]).filter(ph => this.AFFIRMATIONS.test(ph)).map(ph => ({ champ: ch, phrase: ph })));
    return { domaines: doms, hors, reglementees, affirmations };
  },

  phrases(t) { return String(t || '').split(/(?<=[.;])\s+|\n/).map(x => x.trim()).filter(Boolean); },
  /** Retire les phrases qui attribuent une qualification au formateur */
  nettoyer(t) { return this.phrases(t).filter(ph => !this.AFFIRMATIONS.test(ph)).join(' ').replace(/\s+([.;])/g, '$1').trim(); },

  /* ══════════════════════════════════════════════════════════════════════
     ENCADRÉ « PROFIL DE LA FORMATRICE » (Paramètres)
  ══════════════════════════════════════════════════════════════════════ */
  async monter(conteneur, profilOF = {}) {
    if (!conteneur) return;
    const brut = await DataStore.getFormateurPrincipal().catch(() => null);
    const p = this.lire(brut);
    const v = p || { prenom: (profilOF.nom || '').split(' ')[0] || '', nom: (profilOF.nom || '').split(' ').slice(1).join(' '), ...this.PROPOSITION };
    const e = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    conteneur.innerHTML = `
      <div class="section-card">
        <div class="section-card-header"><div class="section-card-title">Profil de la formatrice (Qualiopi indicateurs 21-22)</div></div>
        <div class="section-card-body">
          ${p ? '' : '<div class="brouillon-box"><span>Profil pré-rempli à partir de votre parcours : vérifiez-le puis enregistrez.</span></div>'}
          <p style="font-size:13px;color:var(--text-muted);margin:0 0 12px;line-height:1.6;">L'appli s'en sert pour refuser les thèmes que vous ne pouvez pas justifier et pour que l'IA n'invente jamais de qualification dans vos documents. Cochez uniquement ce que vous pouvez prouver (diplôme, certification, expérience).</p>
          <form id="formatriceForm" novalidate>
            <div class="form-grid">
              <div class="field"><label>Prénom</label><input name="prenom" value="${e(v.prenom)}"></div>
              <div class="field"><label>Nom</label><input name="nom" value="${e(v.nom)}"></div>
              <div class="field form-col-full"><label>Diplômes (un par ligne)</label><textarea name="diplomes" rows="2">${e(v.diplomes)}</textarea></div>
              <div class="field form-col-full"><label>Certifications et habilitations de formateur (SST, INRS, titre de formateur…) — vide si aucune</label><textarea name="certifications" rows="2">${e(v.certifications)}</textarea></div>
              <div class="field form-col-full"><label>Expériences professionnelles (une par ligne)</label><textarea name="experiences" rows="4">${e(v.experiences)}</textarea></div>
              <div class="field form-col-full"><label>Domaines que vous pouvez animer et justifier</label>
                <div class="formatrice-domaines">${this.DOMAINES.map(d => `<label><input type="checkbox" name="dom" value="${d.cle}" ${v.domaines?.includes(d.cle) ? 'checked' : ''}> ${e(d.label)}</label>`).join('')}</div></div>
              <div class="field form-col-full"><label>Autres domaines justifiables (facultatif)</label><input name="autres" value="${e(v.autres || '')}" placeholder="Ex. gestion de la paie (expérience de 3 ans)"></div>
            </div>
            <button type="submit" class="btn btn-primary" style="margin-top:12px;">Enregistrer le profil de la formatrice</button>
          </form>
        </div>
      </div>`;
    conteneur.querySelector('#formatriceForm').addEventListener('submit', async ev => {
      ev.preventDefault();
      const f = ev.target, val = n => f.querySelector(`[name="${n}"]`).value.trim();
      const domaines = [...f.querySelectorAll('[name="dom"]:checked')].map(c => c.value);
      try {
        const r = await DataStore.saveFormateurPrincipal({
          id: p?.id, prenom: val('prenom'), nom: val('nom').toUpperCase(),
          qualifications: JSON.stringify({ diplomes: val('diplomes'), experiences: val('experiences'), certifications: val('certifications') }),
          specialites: JSON.stringify({ domaines, autres: val('autres') })
        });
        if (typeof Conformite !== 'undefined') Conformite._of = null;
        Toast.show('Profil de la formatrice enregistré', 'success');
        if (r && !p) this.monter(conteneur, profilOF);
      } catch (err) { Toast.show('Erreur : ' + e(err.message), 'error'); }
    });
  }
};
