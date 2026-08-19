/* ─────────────────────────────────────────────────────────────────────────────
   IDEAFORMA — Assistant
   Une discussion avec Claude qui voit les données de l'application et peut
   agir dessus : créer une tâche, poser un rendez-vous avec son rappel, écrire
   une note, chercher dans les dossiers OPCO.

   Choix d'architecture : les outils sont EXÉCUTÉS PAR LE NAVIGATEUR, avec la
   session de l'utilisateur. Le serveur ne fait que relayer le modèle ; il n'a
   jamais accès aux données, et les policies RLS restent la seule autorité.
───────────────────────────────────────────────────────────────────────────── */

const Assistant = {

  conversationId: null,
  _messages:      [],     // format API Anthropic
  _etiquettes:    [],
  _listes:        [],
  _occupe:        false,

  /* ══════════════════════════════════════════════
     OUTILS EXPOSÉS AU MODÈLE
  ══════════════════════════════════════════════ */
  outils() {
    return [
      {
        name: 'creer_tache',
        description: "Crée une tâche dans la liste de choses à faire. Utiliser dès que l'utilisateur demande de se souvenir de faire quelque chose, sans horaire précis de rendez-vous.",
        input_schema: {
          type: 'object',
          properties: {
            description: { type: 'string', description: 'Intitulé court et actionnable' },
            notes:       { type: 'string', description: 'Détails complémentaires' },
            echeance:    { type: 'string', description: 'Date au format AAAA-MM-JJ' },
            heure:       { type: 'string', description: 'Heure au format HH:MM' },
            priorite:    { type: 'string', enum: ['basse', 'normale', 'haute'] },
            etiquette:   { type: 'string', description: 'Nom exact d\'une étiquette existante' },
            liste:       { type: 'string', description: 'Nom exact d\'une liste existante' },
            rappel_minutes: { type: 'integer', description: 'Minutes avant l\'échéance pour la notification (0 = à l\'heure dite)' }
          },
          required: ['description']
        }
      },
      {
        name: 'creer_evenement',
        description: "Crée un rendez-vous dans l'agenda, avec ses rappels. Utiliser dès qu'il y a un horaire de début : réunion, RDV médical, appel programmé.",
        input_schema: {
          type: 'object',
          properties: {
            titre:       { type: 'string' },
            debut:       { type: 'string', description: 'Début, format AAAA-MM-JJTHH:MM (heure locale de Paris)' },
            duree_minutes: { type: 'integer', description: 'Durée en minutes, 60 par défaut' },
            lieu:        { type: 'string' },
            description: { type: 'string' },
            etiquette:   { type: 'string', description: 'Nom exact d\'une étiquette existante' },
            rappels:     { type: 'array', items: { type: 'integer' },
                           description: 'Minutes avant le début, ex. [15] ou [1440, 30]' },
            recurrence:  { type: 'string', enum: ['aucune', 'quotidien', 'hebdomadaire', 'mensuel', 'annuel'] }
          },
          required: ['titre', 'debut']
        }
      },
      {
        name: 'creer_note',
        description: 'Écrit une note dans le pense-bête. Pour une information à conserver, pas pour une action à faire.',
        input_schema: {
          type: 'object',
          properties: {
            titre:     { type: 'string' },
            contenu:   { type: 'string' },
            epinglee:  { type: 'boolean' },
            etiquette: { type: 'string' },
            jour:      { type: 'string', description: "AAAA-MM-JJ pour inscrire la note dans le log du jour du carnet ; omettre pour une note libre" }
          },
          required: ['contenu']
        }
      },
      {
        name: 'lister_agenda',
        description: "Lit l'agenda entre deux dates : rendez-vous, journées de formation, tâches datées et échéances OPCO.",
        input_schema: {
          type: 'object',
          properties: {
            du: { type: 'string', description: 'AAAA-MM-JJ' },
            au: { type: 'string', description: 'AAAA-MM-JJ inclus' }
          },
          required: ['du', 'au']
        }
      },
      {
        name: 'lister_taches',
        description: 'Liste les tâches, éventuellement filtrées.',
        input_schema: {
          type: 'object',
          properties: {
            terminees:     { type: 'boolean', description: 'true pour voir les tâches faites' },
            etiquette:     { type: 'string' },
            horizon_jours: { type: 'integer', description: "N'afficher que les tâches dont l'échéance tombe dans N jours" }
          }
        }
      },
      {
        name: 'migrer_tache',
        description: "Repousse une tâche à une autre date (le « › » du bullet journal). Appeler lister_taches d'abord pour l'identifiant.",
        input_schema: {
          type: 'object',
          properties: {
            id:            { type: 'string' },
            nouvelle_date: { type: 'string', description: 'AAAA-MM-JJ' }
          },
          required: ['id', 'nouvelle_date']
        }
      },
      {
        name: 'abandonner_tache',
        description: "Marque une tâche comme abandonnée (le « ~ »). À proposer quand une tâche a déjà été repoussée plusieurs fois.",
        input_schema: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id']
        }
      },
      {
        name: 'terminer_tache',
        description: "Marque une tâche comme faite. Toujours appeler lister_taches d'abord pour récupérer l'identifiant.",
        input_schema: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id']
        }
      },
      {
        name: 'chercher_dossiers',
        description: 'Cherche dans les dossiers de formation OPCO : entreprise, sujet, montants, dates, statuts, retards.',
        input_schema: {
          type: 'object',
          properties: {
            recherche: { type: 'string', description: 'Nom d\'entreprise ou mot du sujet de formation' },
            opco:      { type: 'string', enum: ['opco_commerce', 'opco_mobilite', 'akto', 'constructys', 'opco_ep'] },
            actifs_seulement: { type: 'boolean' }
          }
        }
      },
      {
        name: 'resume_activite',
        description: "Donne une photographie de la situation : chiffre d'affaires par statut, nombre de dossiers, actions OPCO en attente, tâches en retard.",
        input_schema: { type: 'object', properties: {} }
      }
    ];
  },

  /* ══════════════════════════════════════════════
     EXÉCUTION DES OUTILS (dans le navigateur, sous RLS)
  ══════════════════════════════════════════════ */
  async executer(nom, args) {
    const idEtiquette = n => {
      if (!n) return null;
      const e = this._etiquettes.find(x =>
        x.nom.toLowerCase() === String(n).toLowerCase());
      return e?.id || null;
    };
    const idListe = n => {
      if (!n) return null;
      const l = this._listes.find(x => x.nom.toLowerCase() === String(n).toLowerCase());
      return l?.id || null;
    };

    switch (nom) {

      case 'creer_tache': {
        const t = await DataStore.addTacheComplete({
          description:   args.description,
          notes:         args.notes || null,
          echeance:      args.echeance || null,
          heure:         args.heure || null,
          priorite:      args.priorite || 'normale',
          etiquetteId:   idEtiquette(args.etiquette),
          listeId:       idListe(args.liste),
          rappelMinutes: args.rappel_minutes ?? (args.heure ? 15 : null)
        });
        return {
          ok: true, id: t.id,
          message: `Tâche « ${t.description} » créée` +
                   (t.echeance ? ` pour le ${t.echeance}` : ' sans échéance') +
                   (t.rappel_minutes != null ? `, rappel ${t.rappel_minutes} min avant` : '')
        };
      }

      case 'creer_evenement': {
        const d0 = new Date(args.debut.length <= 10 ? args.debut + 'T09:00:00' : args.debut);
        if (isNaN(d0)) return { ok: false, erreur: 'Date de début illisible' };
        const duree = args.duree_minutes || 60;
        const ev = await DataStore.addEvenement({
          titre:       args.titre,
          description: args.description || null,
          lieu:        args.lieu || null,
          debut:       d0.toISOString(),
          fin:         new Date(d0.getTime() + duree * 60000).toISOString(),
          etiquetteId: idEtiquette(args.etiquette),
          rappels:     Array.isArray(args.rappels) && args.rappels.length ? args.rappels : [15],
          recurrence:  args.recurrence || 'aucune'
        });
        return {
          ok: true, id: ev.id,
          message: `Rendez-vous « ${ev.titre} » le ${Dates.longue(d0)} à ${Dates.heure(d0)}, ` +
                   `rappel(s) : ${(ev.rappels || []).join(', ')} min avant.`
        };
      }

      case 'creer_note': {
        const n = await DataStore.addNote({
          titre:       args.titre || null,
          contenu:     args.contenu,
          epinglee:    !!args.epinglee,
          etiquetteId: idEtiquette(args.etiquette),
          dateJour:    args.jour || null
        });
        return {
          ok: true, id: n.id,
          message: args.jour
            ? `Note inscrite dans le log du ${args.jour}.`
            : 'Note enregistrée dans le pense-bête.'
        };
      }

      case 'migrer_tache': {
        await DataStore.migrerTache(args.id, args.nouvelle_date);
        return { ok: true, message: `Tâche repoussée au ${args.nouvelle_date}.` };
      }

      case 'abandonner_tache': {
        await DataStore.abandonnerTache(args.id, true);
        return { ok: true, message: 'Tâche abandonnée.' };
      }

      case 'lister_agenda': {
        const du = new Date(args.du + 'T00:00:00');
        const au = new Date(args.au + 'T23:59:59');
        const items = await DataStore.getAgenda(du.toISOString(), au.toISOString());
        return {
          nombre: items.length,
          items: items.slice(0, 60).map(i => ({
            type: i.type, titre: i.titre,
            date: Dates.iso(new Date(i.debut)),
            heure: i.journee_entiere ? null : Dates.heure(i.debut),
            lieu: i.lieu || null, termine: i.termine
          }))
        };
      }

      case 'lister_taches': {
        const taches = await DataStore.getTachesFiltrees({
          fait:        args.terminees === true ? true : false,
          etiquetteId: this._etiquettes.find(x =>
                         x.nom.toLowerCase() === String(args.etiquette || '').toLowerCase())?.id,
          horizonJours: args.horizon_jours ?? null
        });
        return {
          nombre: taches.length,
          taches: taches.slice(0, 80).map(t => ({
            id: t.id, description: t.description, echeance: t.echeance,
            heure: t.heure, priorite: t.priorite, fait: t.fait,
            liste: t.listes?.nom || null, etiquette: t.etiquettes?.nom || null
          }))
        };
      }

      case 'terminer_tache': {
        await DataStore.setTacheFait(args.id, true);
        return { ok: true, message: 'Tâche marquée comme faite.' };
      }

      case 'chercher_dossiers': {
        let dossiers = await DataStore.getDossiers360({
          opco:   args.opco || null,
          actifs: !!args.actifs_seulement
        });
        if (args.recherche) {
          const q = args.recherche.toLowerCase();
          dossiers = dossiers.filter(d =>
            (d.nom_entreprise || '').toLowerCase().includes(q) ||
            (d.sujet_formation || '').toLowerCase().includes(q));
        }
        return {
          nombre: dossiers.length,
          dossiers: dossiers.slice(0, 30).map(d => ({
            entreprise: d.nom_entreprise, sujet: d.sujet_formation,
            opco: d.opco_label || d.opco_code, prix: d.prix,
            debut: d.date_debut, statut_commercial: d.statut_commercial,
            statut_opco: d.statut_opco, statut_facturation: d.statut_facturation,
            stagiaires: d.nb_stagiaires
          }))
        };
      }

      case 'resume_activite': {
        const [dossiers, actions, taches] = await Promise.all([
          DataStore.getDossiers360({}).catch(() => []),
          DataStore.getActionsDuJour(14).catch(() => []),
          DataStore.getTachesFiltrees({ fait: false }).catch(() => [])
        ]);
        const hui = Dates.aujourdhui();
        const somme = f => dossiers.filter(f)
          .reduce((s, d) => s + (parseFloat(d.prix) || 0), 0);
        return {
          dossiers_total:     dossiers.length,
          ca_total:           somme(() => true),
          ca_non_facture:     somme(d => d.statut_facturation !== 'payee'),
          actions_opco:       actions.length,
          actions_bloquantes: actions.filter(a => a.criticite === 'bloquante').length,
          taches_en_cours:    taches.length,
          taches_en_retard:   taches.filter(t => t.echeance && t.echeance < hui).length
        };
      }

      default:
        return { ok: false, erreur: `Outil inconnu : ${nom}` };
    }
  },

  /* ══════════════════════════════════════════════
     CONTEXTE ENVOYÉ AU MODÈLE
  ══════════════════════════════════════════════ */
  async systeme() {
    const maintenant = new Date();
    const [etiquettes, listes] = await Promise.all([
      DataStore.getEtiquettes(), DataStore.getListes()
    ]);
    this._etiquettes = etiquettes;
    this._listes     = listes;

    return `Tu es l'assistant personnel intégré à IDEAFORMA, l'application de gestion de son utilisateur unique.
Cette application sert à deux choses : suivre les dossiers de formation professionnelle déposés auprès des OPCO (organisme de formation certifié Qualiopi), et organiser le quotidien — tâches, rendez-vous, notes, documents.

CONTEXTE TEMPOREL
Nous sommes le ${Dates.longue(maintenant)} ${maintenant.getFullYear()}, il est ${Dates.heure(maintenant)} (heure de Paris).
Date du jour au format machine : ${Dates.iso(maintenant)}.
Calcule toujours les dates relatives ("demain", "vendredi prochain") à partir de là.

ÉTIQUETTES DISPONIBLES (utilise le nom exact)
${etiquettes.map(e => `- ${e.nom}`).join('\n') || '- aucune'}

LISTES DE TÂCHES DISPONIBLES (nom exact)
${listes.map(l => `- ${l.nom}`).join('\n') || '- aucune'}

COMMENT TRAVAILLER
- Tu as des outils pour lire ET écrire. Utilise-les plutôt que de demander à l'utilisateur de le faire lui-même.
- Un horaire précis ⇒ creer_evenement. Une chose à faire sans horaire ⇒ creer_tache.
- L'application est tenue comme un bullet journal : • tâche, ✕ faite, › repoussée,
  ~ abandonnée, ○ rendez-vous, — note. Emploie ce vocabulaire quand tu en parles.
- Une tâche déjà repoussée trois fois ou plus : signale-le et propose de
  l'abandonner ou de la découper, plutôt que de la repousser encore.
- Programme un rappel par défaut (15 min avant) sauf indication contraire ; pour une échéance importante, propose aussi la veille.
- Devine l'étiquette d'après le sujet : ce qui touche aux dossiers OPCO, aux clients ou aux formations va sous « IDEAFORMA », le reste sous « Pro » ou « Perso ».
- Avant de créer quelque chose d'ambigu, pose UNE question courte. Sinon agis, puis dis en une phrase ce que tu as fait.
- Pour les questions sur l'activité (chiffre d'affaires, dossiers en retard), appelle resume_activite ou chercher_dossiers plutôt que de deviner.

TON
Direct, concret, en français. Pas de listes à puces quand deux phrases suffisent. Pas de formules de politesse inutiles.`;
  },

  /* ══════════════════════════════════════════════
     PAGE
  ══════════════════════════════════════════════ */
  async render() {
    document.getElementById('pageTitle').textContent    = 'Assistant';
    document.getElementById('pageSubtitle').textContent = 'Il voit vos données et peut agir';
    document.getElementById('pageHeaderRight').innerHTML = `
      <button class="btn btn-sm btn-secondary" id="btnHistorique">Discussions</button>
      <button class="btn btn-sm btn-primary" id="btnNouvelleConv">+ Nouvelle</button>`;

    document.getElementById('pageContent').innerHTML = `
      <div class="chat-page">
        <div class="chat-fil" id="chatFil"></div>
        <div class="chat-saisie">
          <textarea id="chatInput" rows="1"
                    placeholder="Demandez n'importe quoi : « qu'est-ce que j'ai demain ? », « rappelle-moi d'appeler AKTO jeudi 10h », « combien de dossiers en attente ? »"></textarea>
          <button class="btn btn-primary" id="chatEnvoyer" title="Envoyer">➤</button>
        </div>
      </div>`;

    document.getElementById('btnNouvelleConv').addEventListener('click', () => this.nouvelle());
    document.getElementById('btnHistorique').addEventListener('click', () => this._historique());

    const input = document.getElementById('chatInput');
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 180) + 'px';
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.envoyer(); }
    });
    document.getElementById('chatEnvoyer').addEventListener('click', () => this.envoyer());

    // Reprise de la dernière discussion, ou accueil
    const convs = await DataStore.getConversations(1).catch(() => []);
    if (convs.length) await this.charger(convs[0].id);
    else this._accueil();

    input.focus();
  },

  _accueil() {
    const suggestions = [
      "Qu'est-ce que j'ai de prévu cette semaine ?",
      "Rappelle-moi d'appeler le comptable jeudi à 10h",
      'Quels dossiers OPCO sont en retard ?',
      'Fais-moi la liste de mes tâches en retard',
      'Note que le code du portail AKTO a changé'
    ];
    document.getElementById('chatFil').innerHTML = `
      <div class="chat-accueil">
        <div class="chat-accueil-ic">🤖</div>
        <div class="chat-accueil-titre">Que puis-je faire pour vous ?</div>
        <div class="chat-accueil-sous">
          Je vois vos dossiers, votre agenda, vos tâches et vos notes.
          Je peux aussi créer des rendez-vous et programmer leurs rappels.
        </div>
        <div class="chat-suggestions">
          ${suggestions.map(s => `<button class="chat-suggestion">${esc(s)}</button>`).join('')}
        </div>
      </div>`;
    document.querySelectorAll('.chat-suggestion').forEach(b =>
      b.addEventListener('click', () => {
        document.getElementById('chatInput').value = b.textContent.trim();
        this.envoyer();
      })
    );
  },

  async nouvelle() {
    this.conversationId = null;
    this._messages = [];
    this._accueil();
    document.getElementById('chatInput').focus();
  },

  async charger(id) {
    this.conversationId = id;
    const lignes = await DataStore.getMessages(id);
    this._messages = lignes.map(l => ({ role: l.role, content: l.contenu }));
    this._peindre();
  },

  async _historique() {
    const convs = await DataStore.getConversations(30);
    Modal.open('Discussions', convs.length ? `
      <div class="conv-liste">
        ${convs.map(c => `
          <div class="conv-item" data-conv="${c.id}">
            <div>
              <div class="conv-titre">${esc(c.titre)}</div>
              <div class="conv-date">${Dates.relative(c.modifie_le)}</div>
            </div>
            <button class="btn-icon danger" data-conv-del="${c.id}">✕</button>
          </div>`).join('')}
      </div>` : '<div class="empty-state">Aucune discussion enregistrée.</div>', [
      { label: 'Fermer', cls: 'btn btn-secondary', action: () => Modal.close() }
    ], 'modal-sm');

    document.querySelector('.conv-liste')?.addEventListener('click', async e => {
      const del = e.target.closest('[data-conv-del]');
      if (del) {
        await DataStore.deleteConversation(del.dataset.convDel);
        Modal.close(); this._historique();
        return;
      }
      const it = e.target.closest('[data-conv]');
      if (it) { Modal.close(); await this.charger(it.dataset.conv); }
    });
  },

  /* ══ Rendu du fil ══ */
  _peindre(enCours = null) {
    const fil = document.getElementById('chatFil');
    if (!fil) return;

    let html = '';
    this._messages.forEach(m => {
      const blocs = Array.isArray(m.content)
        ? m.content
        : [{ type: 'text', text: m.content }];

      if (m.role === 'user') {
        const txt = blocs.filter(b => b.type === 'text').map(b => b.text).join('\n');
        // Les tool_result sont techniques : on ne les montre pas
        if (txt.trim()) {
          html += `<div class="chat-bulle chat-user">${this._markdown(txt)}</div>`;
        }
        return;
      }

      blocs.forEach(b => {
        if (b.type === 'text' && b.text.trim()) {
          html += `<div class="chat-bulle chat-ia">${this._markdown(b.text)}</div>`;
        }
        if (b.type === 'tool_use') {
          html += `<div class="chat-action">${this._libelleOutil(b.name, b.input)}</div>`;
        }
      });
    });

    if (enCours) html += `<div class="chat-bulle chat-ia chat-attente">${enCours}</div>`;

    fil.innerHTML = html;
    fil.scrollTop = fil.scrollHeight;
  },

  _libelleOutil(nom, args = {}) {
    const l = {
      creer_tache:      `✅ Tâche créée : « ${esc(args.description || '')} »`,
      creer_evenement:  `📅 Rendez-vous créé : « ${esc(args.titre || '')} »`,
      creer_note:       `— Note enregistrée`,
      terminer_tache:   `✕ Tâche marquée comme faite`,
      migrer_tache:     `› Tâche repoussée`,
      abandonner_tache: `~ Tâche abandonnée`,
      lister_agenda:    `🔍 Lecture de l'agenda`,
      lister_taches:    `🔍 Lecture des tâches`,
      chercher_dossiers:`🔍 Recherche dans les dossiers`,
      resume_activite:  `🔍 Analyse de l'activité`
    };
    return l[nom] || `⚙️ ${esc(nom)}`;
  },

  /* Markdown minimal : gras, italique, code, listes, sauts de ligne */
  _markdown(t) {
    let h = esc(t);
    h = h.replace(/```([\s\S]*?)```/g, (_, c) => `<pre>${c.trim()}</pre>`);
    h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
    h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/(^|\s)\*([^*\n]+)\*/g, '$1<em>$2</em>');
    h = h.replace(/^\s*[-•]\s+(.+)$/gm, '<li>$1</li>');
    h = h.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
    return h.replace(/\n/g, '<br>');
  },

  /* ══ Boucle de conversation ══ */
  async envoyer() {
    if (this._occupe) return;
    const input = document.getElementById('chatInput');
    const texte = input.value.trim();
    if (!texte) return;

    input.value = '';
    input.style.height = 'auto';
    this._occupe = true;
    document.getElementById('chatEnvoyer').disabled = true;

    try {
      if (!this.conversationId) {
        const c = await DataStore.addConversation(texte.slice(0, 60));
        this.conversationId = c.id;
      }

      this._messages.push({ role: 'user', content: [{ type: 'text', text: texte }] });
      await DataStore.addMessage(this.conversationId, 'user', [{ type: 'text', text: texte }]);
      this._peindre('<span class="chat-points"><i></i><i></i><i></i></span>');

      const systeme = await this.systeme();
      const outils  = this.outils();

      // Jusqu'à 6 allers-retours : au-delà, c'est que le modèle boucle
      for (let tour = 0; tour < 6; tour++) {
        const reponse = await this._appeler(systeme, outils);

        this._messages.push({ role: 'assistant', content: reponse.content });
        await DataStore.addMessage(this.conversationId, 'assistant', reponse.content);
        this._peindre(reponse.stop_reason === 'tool_use'
          ? '<span class="chat-points"><i></i><i></i><i></i></span>' : null);

        if (reponse.stop_reason !== 'tool_use') break;

        // Exécution des outils demandés
        const resultats = [];
        for (const bloc of reponse.content.filter(b => b.type === 'tool_use')) {
          let r;
          try { r = await this.executer(bloc.name, bloc.input || {}); }
          catch (err) { r = { ok: false, erreur: err.message }; }
          resultats.push({
            type: 'tool_result',
            tool_use_id: bloc.id,
            content: JSON.stringify(r).slice(0, 12000),
            is_error: r?.ok === false
          });
        }

        this._messages.push({ role: 'user', content: resultats });
        await DataStore.addMessage(this.conversationId, 'user', resultats);

        // Dernier tour : on redemande une réponse en désactivant les outils,
        // sinon l'échange se terminerait sur un résultat technique et
        // l'utilisateur ne verrait aucune conclusion.
        if (tour === 5) {
          const fin = await this._appeler(systeme, outils, { type: 'none' });
          this._messages.push({ role: 'assistant', content: fin.content });
          await DataStore.addMessage(this.conversationId, 'assistant', fin.content);
        }
      }

      updateJourneeBadge();

    } catch (err) {
      this._peindre();
      document.getElementById('chatFil').insertAdjacentHTML('beforeend',
        `<div class="chat-bulle chat-erreur">⚠️ ${esc(err.message)}</div>`);
    } finally {
      this._occupe = false;
      const b = document.getElementById('chatEnvoyer');
      if (b) b.disabled = false;
      this._peindre();
      document.getElementById('chatInput')?.focus();
    }
  },

  /** Les N derniers messages, en veillant à ne pas commencer par un
      tool_result orphelin : l'API refuse un résultat d'outil dont l'appel
      correspondant a été coupé. */
  _fenetre(n) {
    let debut = Math.max(0, this._messages.length - n);
    while (debut < this._messages.length) {
      const m = this._messages[debut];
      const contientResultat = Array.isArray(m.content)
        && m.content.some(b => b.type === 'tool_result');
      if (m.role === 'user' && !contientResultat) break;
      debut++;
    }
    // Si tout a été écarté, on repart du dernier message utilisateur
    if (debut >= this._messages.length) {
      for (let i = this._messages.length - 1; i >= 0; i--) {
        const m = this._messages[i];
        if (m.role === 'user' && Array.isArray(m.content)
            && !m.content.some(b => b.type === 'tool_result')) { debut = i; break; }
      }
    }
    return this._messages.slice(debut);
  },

  async _appeler(systeme, outils, toolChoice = null) {
    const { data: { session } } = await supa.auth.getSession();
    if (!session?.access_token) throw new Error('Session expirée — reconnectez-vous');

    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        profil:     'complet',
        system:     systeme,
        tools:      outils,
        ...(toolChoice ? { tool_choice: toolChoice } : {}),
        max_tokens: 2500,
        messages:   this._fenetre(40)
      })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
    if (!Array.isArray(data.content) || !data.content.length) {
      throw new Error('Réponse vide du modèle');
    }
    return data;
  }
};
