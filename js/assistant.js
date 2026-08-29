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
  _convRapide:    null,   // conversation ouverte depuis le bloc du tableau de bord

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
            rappel_minutes: { type: 'integer', description: 'Minutes avant l\'échéance pour la notification (0 = à l\'heure dite)' },
            rappel_minutes_2: { type: 'integer', description: 'Seconde alerte optionnelle, en minutes avant l\'échéance (ex. 1440 = la veille)' }
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
          rappelMinutes:  args.rappel_minutes ?? (args.heure ? 0 : null),
          rappelMinutes2: args.rappel_minutes_2 ?? null
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

    return `Tu es l'assistant personnel intégré à IDEAFORMA, l'application de gestion de son utilisateur unique (la seule personne qui te parle).
Cette application sert à deux choses : suivre les dossiers de formation professionnelle déposés auprès des OPCO (organisme de formation certifié Qualiopi), et organiser le quotidien — tâches, rendez-vous, notes, documents.

TU N'ES PAS LIMITÉ À L'APPLICATION
Réponds à toute question, quel que soit le sujet : culture générale, droit de la formation, rédaction d'un mail ou d'un courrier, calculs, traduction, conseils, idées, explications, vie personnelle. Réponds-y directement, complètement et sans détour, comme un assistant polyvalent de confiance. N'appelle les outils que lorsque la demande concerne les données de l'application.

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
- EXCEPTION IMPORTANTE : « rappelle-moi de… », « pense à me rappeler… », « n'oublie pas… »
  ⇒ TOUJOURS creer_tache (jamais un rendez-vous), avec echeance + heure si données,
  et rappel_minutes: 0 pour que la notification parte à l'heure dite.
  Ex. « rappelle-moi d'envoyer le mail à l'école demain à 9h » ⇒ creer_tache
  { description: "Envoyer le mail à l'école", echeance: demain, heure: "09:00", rappel_minutes: 0 }.
- Si l'utilisateur nomme une liste (« dans la liste Courses », « liste école »),
  remplis le champ liste avec son nom exact pris dans LISTES DE TÂCHES DISPONIBLES.
- Une seconde alerte (rappel_minutes_2, ex. 1440 pour la veille) seulement si demandée
  ou si l'échéance est visiblement importante.
- Vocabulaire de l'interface : une tâche se COCHE quand elle est faite, se
  REPOUSSE à une autre date, ou s'ABANDONNE quand elle n'a plus lieu d'être.
  Un rendez-vous se pose dans l'agenda, une note dans le pense-bête.
  Emploie ces mots-là, pas de jargon.
- Une tâche déjà repoussée trois fois ou plus : signale-le et propose de
  l'abandonner ou de la découper, plutôt que de la repousser encore.
- Programme un rappel par défaut (15 min avant) sauf indication contraire ; pour une échéance importante, propose aussi la veille.
- Devine l'étiquette d'après le sujet : ce qui touche aux dossiers OPCO, aux clients ou aux formations va sous « IDEAFORMA », le reste sous « Pro » ou « Perso ».
- Avant de créer quelque chose d'ambigu, pose UNE question courte. Sinon agis, puis dis en une phrase ce que tu as fait.
- La question peut avoir été dictée à la voix : tolère les fautes de reconnaissance et devine le sens. Ta réponse peut être lue à voix haute : évite les tableaux et le formatage lourd quand ce n'est pas utile.
- Pour les questions sur l'activité (chiffre d'affaires, dossiers en retard), appelle resume_activite ou chercher_dossiers plutôt que de deviner.

TON
Direct, concret, en français. Pas de listes à puces quand deux phrases suffisent. Pas de formules de politesse inutiles.`;
  },

  /* ══════════════════════════════════════════════
     LE CHATBOT FLOTTANT
     Un bouton en bas à droite, présent sur toutes les pages. Il ouvre un
     panneau de discussion : on écrit ou on parle, la réponse s'affiche et,
     si on a parlé, elle est lue à voix haute.
  ══════════════════════════════════════════════ */
  _ouvert:   false,
  _monte:    false,
  _reco:     null,     // reconnaissance vocale en cours
  _voix:     false,    // lecture à voix haute des réponses
  _parle:    false,    // la dernière question a été dictée

  monter() {
    if (this._monte) return;
    this._monte = true;

    const peutDicter = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    const peutLire   = 'speechSynthesis' in window;
    try { this._voix = localStorage.getItem('chatbot_voix') === '1'; } catch { /* rien */ }

    document.body.insertAdjacentHTML('beforeend', `
      <button class="chatbot-bouton" id="chatbotBouton"
              title="Assistant" aria-label="Ouvrir l'assistant" aria-expanded="false">
        ${Icone('assistant', { taille: 26 })}
      </button>
      <div class="chatbot-voile" id="chatbotVoile" hidden></div>
      <section class="chatbot" id="chatbot" hidden aria-label="Assistant">
        <header class="chatbot-tete">
          <span class="chatbot-tete-ic">${Icone('assistant', { taille: 20 })}</span>
          <div class="chatbot-tete-txt">
            <div class="chatbot-titre">Assistant</div>
            <div class="chatbot-sous">Écrivez ou parlez — sans limite</div>
          </div>
          ${peutLire ? `
            <button class="chatbot-outil ${this._voix ? 'on' : ''}" id="chatbotVoix"
                    title="Lire les réponses à voix haute" aria-pressed="${this._voix}"
                    aria-label="Lire les réponses à voix haute">${Icone('musique', { taille: 17 })}</button>` : ''}
          <button class="chatbot-outil" id="btnHistorique" title="Discussions précédentes"
                  aria-label="Discussions précédentes">${Icone('horloge', { taille: 17 })}</button>
          <button class="chatbot-outil" id="btnNouvelleConv" title="Nouvelle discussion"
                  aria-label="Nouvelle discussion">${Icone('plus', { taille: 18 })}</button>
          <button class="chatbot-outil" id="chatbotFermer" title="Fermer"
                  aria-label="Fermer l'assistant">${Icone('fermer', { taille: 18 })}</button>
        </header>
        <div class="chat-fil chatbot-fil" id="chatFil"></div>
        <div class="chatbot-saisie">
          <textarea id="chatInput" rows="1" enterkeyhint="send"
                    placeholder="Posez votre question…"></textarea>
          ${peutDicter ? `
            <button class="chatbot-micro" id="chatMicro" title="Parler"
                    aria-label="Dicter la question">${Icone('micro', { taille: 20 })}</button>` : ''}
          <button class="chatbot-envoi" id="chatEnvoyer" title="Envoyer"
                  aria-label="Envoyer">${Icone('envoyer', { taille: 19 })}</button>
        </div>
      </section>`);

    document.getElementById('chatbotBouton').addEventListener('click', () => this.basculer());
    document.getElementById('chatbotFermer').addEventListener('click', () => this.fermer());
    document.getElementById('chatbotVoile').addEventListener('click', () => this.fermer());
    document.getElementById('btnNouvelleConv').addEventListener('click', () => this.nouvelle());
    document.getElementById('btnHistorique').addEventListener('click', () => this._historique());
    document.getElementById('chatMicro')?.addEventListener('click', () => this._dicter());
    document.getElementById('chatbotVoix')?.addEventListener('click', () => {
      this._voix = !this._voix;
      const b = document.getElementById('chatbotVoix');
      b.classList.toggle('on', this._voix);
      b.setAttribute('aria-pressed', String(this._voix));
      try { localStorage.setItem('chatbot_voix', this._voix ? '1' : '0'); } catch { /* rien */ }
      if (!this._voix) window.speechSynthesis?.cancel();
      Toast.show(this._voix ? 'Les réponses seront lues à voix haute' : 'Lecture à voix haute coupée', 'info');
    });

    const input = document.getElementById('chatInput');
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 140) + 'px';
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.envoyer(); }
    });
    document.getElementById('chatEnvoyer').addEventListener('click', () => this.envoyer());
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this._ouvert) this.fermer();
    });
  },

  async ouvrir() {
    this.monter();
    if (this._ouvert) return;
    this._ouvert = true;
    const p = document.getElementById('chatbot');
    p.hidden = false;
    document.getElementById('chatbotVoile').hidden = false;
    document.getElementById('chatbotBouton').setAttribute('aria-expanded', 'true');
    document.getElementById('chatbotBouton').classList.add('ouvert');
    requestAnimationFrame(() => p.classList.add('visible'));

    if (!this._charge) {
      this._charge = true;
      const convs = await DataStore.getConversations(1).catch(() => []);
      if (convs.length) await this.charger(convs[0].id);
      else this._accueil();
    }
    if (window.matchMedia('(min-width: 761px)').matches) {
      document.getElementById('chatInput')?.focus();
    }
  },

  fermer() {
    if (!this._ouvert) return;
    this._ouvert = false;
    const p = document.getElementById('chatbot');
    p.classList.remove('visible');
    document.getElementById('chatbotBouton').setAttribute('aria-expanded', 'false');
    document.getElementById('chatbotBouton').classList.remove('ouvert');
    document.getElementById('chatbotVoile').hidden = true;
    setTimeout(() => { if (!this._ouvert) p.hidden = true; }, 220);
    if (this._reco) this._reco.stop();
  },

  basculer() { this._ouvert ? this.fermer() : this.ouvrir(); },

  /* Compatibilité : l'ancienne route « assistant » ouvre le panneau */
  render() { this.ouvrir(); },

  _accueil() {
    const suggestions = [
      "Qu'est-ce que j'ai de prévu cette semaine ?",
      "Rappelle-moi d'appeler le comptable jeudi à 10h",
      'Quels dossiers OPCO sont en retard ?',
      'Rédige-moi un mail de relance poli',
      'Explique-moi le fonctionnement du BPF'
    ];
    const fil = document.getElementById('chatFil');
    if (!fil) return;
    fil.innerHTML = `
      <div class="chat-accueil">
        <div class="chat-accueil-ic">${Icone('assistant', { taille: 38 })}</div>
        <div class="chat-accueil-titre">Que puis-je faire pour vous ?</div>
        <div class="chat-accueil-sous">
          Je vois vos dossiers, votre agenda, vos tâches et vos notes, et je
          réponds aussi à n'importe quelle autre question.
        </div>
        <div class="chat-suggestions">
          ${suggestions.map(s => `<button class="chat-suggestion">${esc(s)}</button>`).join('')}
        </div>
      </div>`;
    fil.querySelectorAll('.chat-suggestion').forEach(b =>
      b.addEventListener('click', () => {
        document.getElementById('chatInput').value = b.textContent.trim();
        this.envoyer();
      })
    );
  },

  /* ══ Dictée ══
     Un appui lance l'écoute, un second l'arrête. Dès que le navigateur rend
     une phrase définitive, on envoie, et la réponse sera lue à voix haute. */
  _dicter() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const bouton = document.getElementById('chatMicro');
    if (!SR) { Toast.show("La dictée n'est pas disponible sur ce navigateur", 'warning'); return; }
    if (this._reco) { this._reco.stop(); return; }

    window.speechSynthesis?.cancel();
    const champ = document.getElementById('chatInput');
    const reco  = this._reco = new SR();
    reco.lang = 'fr-FR'; reco.interimResults = true;
    reco.continuous = false; reco.maxAlternatives = 1;

    const depart = champ.value.trim();
    let definitif = false;

    reco.onresult = e => {
      let dit = '';
      for (let i = 0; i < e.results.length; i++) {
        dit += e.results[i][0].transcript;
        if (e.results[i].isFinal) definitif = true;
      }
      champ.value = (depart ? depart + ' ' : '') + dit.trim();
    };
    reco.onerror = ev => {
      definitif = false;
      Toast.show(ev.error === 'not-allowed'
        ? 'Accès au micro refusé — autorisez-le dans les réglages du navigateur'
        : "La dictée s'est interrompue", 'warning');
    };
    reco.onend = () => {
      this._reco = null;
      bouton.classList.remove('ecoute');
      bouton.setAttribute('aria-label', 'Dicter la question');
      if (definitif && champ.value.trim()) { this._parle = true; this.envoyer(); }
      else champ.focus();
    };
    try {
      reco.start();
      bouton.classList.add('ecoute');
      bouton.setAttribute('aria-label', 'Arrêter la dictée');
    } catch {
      this._reco = null;
      Toast.show("La dictée n'a pas pu démarrer", 'warning');
    }
  },

  /* ══ Lecture à voix haute ══ */
  _lire(texte) {
    if (!('speechSynthesis' in window) || !texte) return;
    const propre = texte
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/[*_`#>]/g, '')
      .replace(/\s+/g, ' ').trim();
    if (!propre) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(propre);
    u.lang = 'fr-FR'; u.rate = 1.02;
    const voix = window.speechSynthesis.getVoices().find(v => /^fr/i.test(v.lang));
    if (voix) u.voice = voix;
    window.speechSynthesis.speak(u);
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
            <button class="btn-icon danger" data-conv-del="${c.id}"
                    title="Supprimer" aria-label="Supprimer la discussion"
                    >${Icone('poubelle', { taille: 16 })}</button>
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
    const ic = n => Icone(n, { taille: 15 });
    const l = {
      creer_tache:      `${ic('taches')} Tâche créée : « ${esc(args.description || '')} »`,
      creer_evenement:  `${ic('agenda')} Rendez-vous créé : « ${esc(args.titre || '')} »`,
      creer_note:       `${ic('notes')} Note enregistrée`,
      terminer_tache:   `${ic('check')} Tâche marquée comme faite`,
      migrer_tache:     `${ic('migrer')} Tâche repoussée`,
      abandonner_tache: `${ic('abandonner')} Tâche abandonnée`,
      lister_agenda:    `${ic('recherche')} Lecture de l'agenda`,
      lister_taches:    `${ic('recherche')} Lecture des tâches`,
      chercher_dossiers:`${ic('recherche')} Recherche dans les dossiers`,
      resume_activite:  `${ic('activite')} Analyse de l'activité`
    };
    return l[nom] || `${ic('reglages')} ${esc(nom)}`;
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

      // Lecture à voix haute : si la question a été dictée, ou si on l'a demandé
      if (this._voix || this._parle) {
        const dernier = [...this._messages].reverse().find(m => m.role === 'assistant');
        const txt = (dernier?.content || []).filter(b => b.type === 'text').map(b => b.text).join(' ');
        this._lire(txt);
      }
      this._parle = false;

    } catch (err) {
      this._parle = false;
      // On repeint d'abord, PUIS on ajoute l'erreur : l'ancien code faisait
      // l'inverse dans « finally », ce qui effaçait le message d'erreur et
      // laissait l'utilisateur sans aucune réponse.
      this._peindre();
      const fil = document.getElementById('chatFil');
      fil.insertAdjacentHTML('beforeend',
        `<div class="chat-bulle chat-erreur">${Icone('alerte', { taille: 16 })} ${esc(err.message)}</div>`);
      fil.scrollTop = fil.scrollHeight;
      console.error('[Assistant]', err);
      this._occupe = false;
      const b = document.getElementById('chatEnvoyer');
      if (b) b.disabled = false;
      return;
    }
    this._occupe = false;
    const b = document.getElementById('chatEnvoyer');
    if (b) b.disabled = false;
    this._peindre();
    document.getElementById('chatInput')?.focus();
  },

  /* ══════════════════════════════════════════════
     ENTRÉE SANS INTERFACE — utilisée par le bloc du tableau de bord

     Même moteur que envoyer(), mais rien n'est peint ici : la fonction rend
     { texte, actions } et l'appelant affiche ce qu'il veut. Elle travaille
     sur sa propre liste de messages pour ne pas parasiter la discussion
     ouverte sur la page Assistant, tout en enregistrant l'échange dans une
     conversation « Depuis le tableau de bord » qu'on retrouve dans
     l'historique.
  ══════════════════════════════════════════════ */
  async demander(texte, options = {}) {
    const dire = typeof options.onEtape === 'function' ? options.onEtape : () => {};
    const propre = String(texte || '').trim();
    if (!propre) return { texte: '', actions: [] };

    const messages = [{ role: 'user', content: [{ type: 'text', text: propre }] }];
    const actions  = [];
    let   convId   = this._convRapide;

    /* La conversation n'est qu'un journal : si son enregistrement échoue,
       la demande doit quand même aboutir. */
    const tracer = async (role, contenu) => {
      if (!convId) return;
      try { await DataStore.addMessage(convId, role, contenu); } catch { /* journal seulement */ }
    };

    try {
      const c = await DataStore.addConversation(propre.slice(0, 60));
      convId = this._convRapide = c.id;
    } catch { /* on continue sans historique */ }

    await tracer('user', messages[0].content);

    const systeme = await this.systeme();
    const outils  = this.outils();
    let   final   = '';

    for (let tour = 0; tour < 6; tour++) {
      const reponse = await this._appeler(systeme, outils, null, messages);
      messages.push({ role: 'assistant', content: reponse.content });
      await tracer('assistant', reponse.content);

      final = reponse.content.filter(b => b.type === 'text')
                             .map(b => b.text).join('\n').trim() || final;

      if (reponse.stop_reason !== 'tool_use') break;

      dire(reponse.content.filter(b => b.type === 'tool_use')
            .map(b => this._libelleOutil(b.name, b.input || {}))[0] || 'Un instant…');

      const resultats = [];
      for (const bloc of reponse.content.filter(b => b.type === 'tool_use')) {
        let r;
        try { r = await this.executer(bloc.name, bloc.input || {}); }
        catch (err) { r = { ok: false, erreur: err.message }; }
        if (r?.ok !== false) actions.push(this._libelleOutil(bloc.name, bloc.input || {}));
        resultats.push({
          type: 'tool_result',
          tool_use_id: bloc.id,
          content: JSON.stringify(r).slice(0, 12000),
          is_error: r?.ok === false
        });
      }

      messages.push({ role: 'user', content: resultats });
      await tracer('user', resultats);

      // Dernier tour : on force une conclusion en phrase, sinon l'échange
      // se terminerait sur un résultat technique et le bloc resterait muet.
      if (tour === 5) {
        const fin = await this._appeler(systeme, outils, { type: 'none' }, messages);
        messages.push({ role: 'assistant', content: fin.content });
        await tracer('assistant', fin.content);
        final = fin.content.filter(b => b.type === 'text')
                           .map(b => b.text).join('\n').trim() || final;
      }
    }

    updateJourneeBadge();

    // Le modèle peut n'avoir rien dit alors qu'il a agi : on ne laisse pas vide.
    if (!final) final = actions.length ? actions.join('\n') : "C'est noté.";
    return { texte: final, actions };
  },

  /** Les N derniers messages, en veillant à ne pas commencer par un
      tool_result orphelin : l'API refuse un résultat d'outil dont l'appel
      correspondant a été coupé. */
  _fenetre(n, source = null) {
    const liste = source || this._messages;
    let debut = Math.max(0, liste.length - n);
    while (debut < liste.length) {
      const m = liste[debut];
      const contientResultat = Array.isArray(m.content)
        && m.content.some(b => b.type === 'tool_result');
      if (m.role === 'user' && !contientResultat) break;
      debut++;
    }
    // Si tout a été écarté, on repart du dernier message utilisateur
    if (debut >= liste.length) {
      for (let i = liste.length - 1; i >= 0; i--) {
        const m = liste[i];
        if (m.role === 'user' && Array.isArray(m.content)
            && !m.content.some(b => b.type === 'tool_result')) { debut = i; break; }
      }
    }
    return liste.slice(debut);
  },

  async _appeler(systeme, outils, toolChoice = null, source = null) {
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
        max_tokens: 4000,
        messages:   this._fenetre(40, source)
      })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Le serveur a répondu ${res.status}`);
    if (!Array.isArray(data.content) || !data.content.length) {
      throw new Error('Réponse vide du modèle');
    }
    return data;
  }
};
