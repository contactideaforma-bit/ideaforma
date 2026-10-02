/* ─── Module IA — Assistance formation OPCO-aware ─── */

const AI = {

  /* ── Appel à la serverless function ──
     L'endpoint /api/ai exige désormais un jeton Supabase valide : sans lui,
     n'importe qui pouvait consommer la clé Anthropic. */
  async _call(userPrompt, system = '', maxTokens = 1500) {
    const { data: { session } } = await supa.auth.getSession();
    if (!session?.access_token) throw new Error('Session expirée — reconnectez-vous');

    const res = await fetch('/api/ai', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        messages:   [{ role: 'user', content: userPrompt }],
        system,
        max_tokens: maxTokens
      })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
    return data.text || '';
  },

  /* ── Parse JSON robuste ── */
  _parseJSON(text) {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Réponse IA non parseable');
    try { return JSON.parse(match[0]); } catch { /* retours à la ligne bruts dans les chaînes → on les échappe */ }
    let out = '', dansChaine = false, echap = false;
    for (const ch of match[0]) {
      if (dansChaine && !echap && (ch === '\n' || ch === '\r' || ch === '\t')) { out += ch === '\n' ? '\\n' : (ch === '\t' ? ' ' : ''); continue; }
      if (ch === '"' && !echap) dansChaine = !dansChaine;
      echap = !echap && ch === '\\';
      out += ch;
    }
    return JSON.parse(out);
  },

  /* ══════════════════════════════════════════════
     GÉNÉRATION COMPLÈTE DU CONTENU D'UNE FORMATION
     Prend en compte les contraintes de l'OPCO
  ══════════════════════════════════════════════ */
  async genererFormation(opco, trainingSubject, clientInfo = {}, ctx = {}) {
    const cfg = OpcoPage?.CONFIG?.[opco] || {};
    const modalite = ctx.modalite || 'presentiel';
    const heures = parseFloat(ctx.dureeHeures) || null;
    const nbJours = parseInt(ctx.nbJours) || null;
    const postes = (clientInfo.salaries || []).map(s => s.poste).filter(Boolean);
    const stag = (ctx.stagiaires || []).map(t => {
      const sal = (clientInfo.salaries || []).find(s =>
        [s.lastName, s.firstName].map(x => String(x || '').toLowerCase()).sort().join('|') ===
        [t.lastName, t.firstName].map(x => String(x || '').toLowerCase()).sort().join('|'));
      return sal?.poste || '';
    }).filter(Boolean);
    const libMod = { presentiel: 'présentiel (dans les locaux de l\'entreprise)', distanciel: 'à distance (classe virtuelle)', mixte: 'mixte : une partie en présentiel, une partie à distance' }[modalite];

    const system = `Tu es ingénieur pédagogique senior dans un organisme de formation certifié Qualiopi, spécialiste des dossiers de prise en charge OPCO.
Tu rédiges des programmes qu'un conseiller OPCO valide sans demande de complément : précis, réalistes, sans formule creuse, sans contradiction.
Tu connais le Code du travail (L. 6313-1, L. 6353-1), le référentiel Qualiopi et les exigences des OPCO pour la FOAD (assistance technique et pédagogique, activités à distance, suivi de l'assiduité).
Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ni après.`;

    const prompt = `Génère le contenu pédagogique complet de cette action de formation.

CONTEXTE :
- Intitulé : "${trainingSubject}"
- Entreprise : ${clientInfo.companyName || 'non précisée'} — effectif : ${clientInfo.employees || 'inconnu'} salarié(s) — IDCC ${clientInfo.idcc || 'non précisée'}
- Postes réellement occupés par les stagiaires : ${stag.length ? stag.join(', ') : (postes.length ? postes.join(', ') : 'non précisés')}
- Nombre de stagiaires : ${(ctx.stagiaires || []).length || 'non précisé'}
- Modalité : ${libMod}
- Durée IMPOSÉE : ${heures ? `${heures} heures` : 'à proposer'}${nbJours ? ` sur ${nbJours} jour(s)` : ''}
- OPCO : ${cfg.label || opco} — secteurs : ${cfg.sectors || 'non précisé'} — plafond : ${cfg.ceiling || 'non précisé'}
- Points d'attention OPCO : ${(cfg.alerts || []).join('. ') || '—'}

RÈGLES IMPÉRATIVES :
1. Objectifs : 3 à 5, chacun commence par un verbe d'action observable (identifier, appliquer, réaliser, analyser, mettre en œuvre…). Jamais « connaître », « comprendre », « être sensibilisé ».
2. Contenu : chaque titre de module suit EXACTEMENT ce format : « Module N — Titre (X h — présentiel) : » ou « Module N — Titre (X h — à distance) : ». ${heures ? `La somme des X doit faire exactement ${heures} h.` : 'La somme des X doit égaler la durée proposée.'} ${nbJours && heures ? `Répartis de façon réaliste sur ${nbJours} jour(s) (7 h maximum par jour).` : ''}
3. ${modalite === 'mixte' ? 'Mixte : place les apports théoriques à distance et la pratique / mises en situation en présentiel ; chaque module indique sa modalité.' : modalite === 'distanciel' ? 'Tous les modules sont « à distance » (classe virtuelle synchrone).' : 'Tous les modules sont « présentiel ».'}
4. Sous chaque module, 3 à 6 points concrets, propres au métier des stagiaires, précédés de « • », un par ligne. Aucune incohérence technique (ex. pas d'« EPI adaptés au stress »).
5. Évaluation : une modalité par ligne précédée de « • » (positionnement initial, évaluations formatives par module, évaluation finale des acquis, satisfaction à chaud et à froid${modalite !== 'presentiel' ? ', suivi de l\'assiduité à distance par relevé de connexion' : ''}).
6. Public visé : décris les salariés réellement concernés (postes ci-dessus, secteur), en une phrase. Jamais la liste des secteurs de la convention collective.
7. Moyens : méthodes et outils concrets${modalite !== 'presentiel' ? ', dont l\'outil de classe virtuelle, l\'assistance technique et pédagogique (délai de réponse) et les activités à distance' : ''}.
8. points_attention : liste (éventuellement vide) des risques de refus OPCO que tu repères dans le contexte (ex. durée irréaliste, intitulé hors champ, effectif / IDCC incohérents).

Génère ce JSON (sans rien d'autre) :
{
  "objectifs": "À l'issue de la formation, le stagiaire sera capable de :\\n• …\\n• …\\n• …",
  "contenu": "Module 1 — … (X h — présentiel) :\\n• …\\n• …\\n\\nModule 2 — … (X h — à distance) :\\n• …\\n• …",
  "evaluation": "• …\\n• …\\n• …\\n• …",
  "prerequis": "…",
  "duree": "${heures ? `${heures} h` : 'ex. 2 jours (14 h)'}",
  "public_vise": "…",
  "moyens": "…",
  "points_attention": ["…"]
}`;

    const text = await this._call(prompt, system, 2600);
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
  async verifierDossier(opco, d, client = {}, regles = null) {
    const cfg = OpcoPage?.CONFIG?.[opco] || {};
    const system = `Tu es conseiller OPCO expérimenté : tu instruis des demandes de prise en charge et tu repères ce qui ferait refuser ou suspendre un dossier.
Tu relis le CONTENU (cohérence, réalisme, précision), les contrôles de forme ayant déjà été faits par un programme.
Réponds UNIQUEMENT avec un objet JSON valide.`;
    const deja = regles ? [...regles.bloquants, ...regles.alertes].map(x => '- ' + x.titre).join('\n') : '';
    const prompt = `Relis ce dossier de formation destiné à ${cfg.label || opco}.

Entreprise : ${d.companyName || '—'} — ${client.employees || '?'} salariés — IDCC ${client.idcc || '?'}
Intitulé : ${d.trainingSubject || '—'}
Modalité : ${d.modalite || '—'} — Durée : ${d.dureeHeures || '?'} h — Dates : ${(d.trainingDates || []).map(x => `${x.start} → ${x.end || x.start}`).join(', ')}
Stagiaires : ${(d.trainees || []).length} — postes : ${(client.salaries || []).map(s => s.poste).filter(Boolean).join(', ') || 'non précisés'}
Prix HT : ${d.price || 0} €
Public visé : ${d.publicVise || '—'}
Prérequis : ${d.prerequis || '—'}
Objectifs :
${d.objectifs || '—'}
Programme :
${d.contenu || '—'}
Évaluation :
${d.evaluation || '—'}
Moyens : ${d.moyens || '—'}
Lieu : ${d.lieu || '—'}

Points déjà signalés par le contrôle automatique (ne les répète pas) :
${deja || '- aucun'}

Cherche : contradictions ou formulations absurdes, contenu générique non adapté aux postes, objectifs non mesurables, programme trop chargé pour la durée, adéquation intitulé / contenu / public, éléments FOAD manquants, tout ce qu'un conseiller ${cfg.label || 'OPCO'} demanderait de corriger.

JSON attendu :
{
  "statut": "conforme" | "a_corriger",
  "synthese": "une phrase",
  "problemes": [ { "champ": "Objectifs|Programme|Évaluation|Public visé|Moyens|Durée|Autre", "probleme": "…", "correction": "texte de remplacement ou action précise" } ]
}`;
    const text = await this._call(prompt, system, 1800);
    return this._parseJSON(text);
  }
};
