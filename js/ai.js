/* ─── Module IA — Assistance formation OPCO-aware ─── */

const AI = {

  /* ── Appel à la serverless function ── */
  async _call(userPrompt, system = '', maxTokens = 1500) {
    const res = await fetch('/api/ai', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages:   [{ role: 'user', content: userPrompt }],
        system,
        max_tokens: maxTokens
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
    return data.text || '';
  },

  /* ── Parse JSON robuste ── */
  _parseJSON(text) {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Réponse IA non parseable');
    return JSON.parse(match[0]);
  },

  /* ══════════════════════════════════════════════
     GÉNÉRATION COMPLÈTE DU CONTENU D'UNE FORMATION
     Prend en compte les contraintes de l'OPCO
  ══════════════════════════════════════════════ */
  async genererFormation(opco, trainingSubject, clientInfo = {}) {
    const cfg = OpcoPage?.CONFIG?.[opco] || {};

    const system = `Tu es un expert en formation professionnelle continue en France.
Tu rédiges des programmes de formation conformes aux exigences des OPCOs.
Tu connais la réglementation (Loi Avenir, Qualiopi, Art. L.6353-1 du Code du Travail).
Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ni après le JSON.`;

    const prompt = `Génère le contenu pédagogique complet pour cette formation professionnelle.

CONTEXTE :
- Intitulé de la formation : "${trainingSubject}"
- Entreprise cliente : ${clientInfo.companyName || 'non précisée'}
- Convention collective (IDCC) : ${clientInfo.idcc || 'non précisée'}
- Secteur d'activité : ${cfg.sectors || 'non précisé'}

CONTEXTE OPCO — ${cfg.label || opco} :
- Secteurs couverts : ${cfg.sectors || 'non précisé'}
- Plafond horaire de prise en charge : ${cfg.ceiling || 'non précisé'}
- Délai de dépôt du dossier : ${cfg.deadline || 'avant le démarrage'}
- Documents requis par l'OPCO : ${(cfg.documents || []).join(', ') || 'convention, programme, devis'}
- Points d'attention : ${(cfg.alerts || []).join('. ') || 'vérifier l\'adhésion'}

INSTRUCTIONS :
- Les objectifs doivent être mesurables et conformes aux attendus Qualiopi
- Le programme doit être structuré en modules avec durées
- Le contenu doit être cohérent avec le secteur et le plafond OPCO
- Durée recommandée cohérente avec le prix habituel du secteur

Génère ce JSON (sans rien d'autre) :
{
  "objectifs": "À l'issue de la formation, le stagiaire sera capable de :\\n• [compétence 1 concrète]\\n• [compétence 2]\\n• [compétence 3]\\n• [compétence 4]",
  "contenu": "Module 1 — [Titre] (Xh) :\\n  • [point]\\n  • [point]\\n\\nModule 2 — [Titre] (Xh) :\\n  • [point]\\n  • [point]\\n\\nModule 3 — [Titre] (Xh) :\\n  • [point]\\n  • [point]",
  "evaluation": "[Modalités d'évaluation adaptées au secteur et à Qualiopi]",
  "prerequis": "[Prérequis adaptés au public cible]",
  "duree": "[Durée recommandée, ex: 2 jours (14h)]",
  "public_vise": "[Description du public visé en une phrase]"
}`;

    const text = await this._call(prompt, system, 1400);
    return this._parseJSON(text);
  },

  /* ══════════════════════════════════════════════
     REFORMULATION D'UN CHAMP
  ══════════════════════════════════════════════ */
  async reformuler(champ, texte, opco, trainingSubject = '') {
    const cfg = OpcoPage?.CONFIG?.[opco] || {};
    const labels = {
      objectifs:  'objectifs pédagogiques d\'une formation professionnelle',
      contenu:    'programme détaillé d\'une formation (modules et sous-points)',
      evaluation: 'modalités d\'évaluation d\'une formation (conforme Qualiopi)',
      prerequis:  'prérequis d\'entrée en formation'
    };

    const system = `Tu es un expert en rédaction de documents de formation professionnelle (Qualiopi, OPCO).
Reformule le texte fourni pour le rendre plus professionnel, précis et adapté.
Réponds UNIQUEMENT avec le texte reformulé, sans introduction ni commentaire.`;

    const prompt = `Reformule ce texte correspondant aux "${labels[champ] || champ}" d'une formation intitulée "${trainingSubject}" pour ${cfg.label || 'un OPCO'}.

Texte à reformuler :
${texte}

Contraintes : texte professionnel, conforme aux exigences Qualiopi, adapté au secteur "${cfg.sectors || ''}", clair et précis.`;

    return await this._call(prompt, system, 600);
  },

  /* ══════════════════════════════════════════════
     VÉRIFICATION COHÉRENCE DOSSIER
     Vérifie que le dossier est complet et cohérent
     avec les exigences de l'OPCO
  ══════════════════════════════════════════════ */
  async verifierDossier(opco, dossierData, clientData) {
    const cfg = OpcoPage?.CONFIG?.[opco] || {};

    const system = `Tu es un expert en dossiers OPCO. Tu vérifies la conformité et la cohérence des dossiers de formation.
Réponds UNIQUEMENT avec un objet JSON valide.`;

    const prompt = `Vérifie ce dossier de formation pour ${cfg.label || opco}.

DOSSIER :
- Intitulé : ${dossierData.trainingSubject || '—'}
- Prix HT : ${dossierData.price || 0} €
- Durée : ${dossierData.trainingDates?.length ? dossierData.trainingDates.length + ' période(s)' : 'non précisée'}
- Objectifs : ${dossierData.objectifs ? 'oui' : 'manquants'}
- Programme : ${dossierData.contenu ? 'oui' : 'manquant'}
- Évaluation : ${dossierData.evaluation ? 'oui' : 'manquante'}
- Participants : ${dossierData.trainees?.length || 0}
- IDCC : ${clientData.idcc || 'non précisé'}

EXIGENCES OPCO ${cfg.label} :
- Plafond : ${cfg.ceiling}
- Délai : ${cfg.deadline}
- Documents : ${(cfg.documents || []).join(', ')}

Génère ce JSON :
{
  "score": <0-100>,
  "statut": "conforme" | "attention" | "incomplet",
  "points_forts": ["...", "..."],
  "points_manquants": ["...", "..."],
  "recommandations": ["...", "..."]
}`;

    const text = await this._call(prompt, system, 800);
    return this._parseJSON(text);
  }
};
