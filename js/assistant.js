/* ─────────────────────────────────────────────────────────────────────────────
   IDEAFORMA — Nanika
   L'assistante de l'application : une discussion avec Claude qui voit les
   données et agit dessus (tâches, rendez-vous, notes, dossiers OPCO), à
   l'écrit ou de vive voix.

   v18 « Nanika » (03/09/2026) :
     – un MODE VOCAL : on parle, elle répond à voix haute, puis réécoute —
       une conversation continue, comme JARVIS dans Iron Man ;
     – un FILET DE SÉCURITÉ : toute action est journalisée et réversible
       (« annule »), les suppressions exigent une confirmation, une dictée mal
       reconnue est reformulée avant d'agir, une erreur est dite à voix haute ;
     – plus d'outils : modifier ou supprimer une tâche, ouvrir une page,
       chercher dans les notes, faire le point du jour.

   Choix d'architecture inchangé : les outils sont EXÉCUTÉS PAR LE NAVIGATEUR,
   avec la session de l'utilisateur. Le serveur ne fait que relayer le
   modèle ; il n'a jamais accès aux données, et les policies RLS restent la
   seule autorité. Nanika ne peut faire que ce que ces outils permettent :
   pas de prise de contrôle possible, ni de l'application, ni du monde.
───────────────────────────────────────────────────────────────────────────── */

const Assistant = {

  NOM: 'Nanika',

  conversationId: null,
  _messages:      [],     // format API Anthropic
  _etiquettes:    [],
  _listes:        [],
  _occupe:        false,
  _convRapide:    null,   // conversation ouverte depuis le bloc du tableau de bord
  _journal:       [],     // actions réversibles, la plus récente en dernier
  _vocal:         false,  // mode conversation vocale actif
  _web:           true,   // recherche sur internet autorisée (outil serveur Anthropic)

  /* ══════════════════════════════════════════════
     OUTILS EXPOSÉS AU MODÈLE
  ══════════════════════════════════════════════ */
  outils() {
    const liste = this._outilsApp();
    if (this._web) {
      /* Outil exécuté PAR LE SERVEUR d'Anthropic : le modèle cherche sur le
         web et cite ses sources. Rien à exécuter côté navigateur. */
      liste.push({
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 5,
        user_location: { type: 'approximate', country: 'FR', timezone: 'Europe/Paris' }
      });
    }
    return liste;
  },

  _outilsApp() {
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
        name: 'creer_taches',
        description: "Crée PLUSIEURS tâches d'un coup — l'outil à utiliser dès que l'utilisateur énumère : liste de courses, dictée de choses à faire, notes en vrac. Une tâche par élément, jamais un seul bloc. Si la liste nommée n'existe pas, elle est créée automatiquement.",
        input_schema: {
          type: 'object',
          properties: {
            liste: { type: 'string', description: 'Liste par défaut pour toutes ces tâches (nom exact ou nouveau nom) — omise si chaque tâche précise la sienne' },
            taches: {
              type: 'array',
              description: 'Les tâches, une par élément énuméré',
              items: {
                type: 'object',
                properties: {
                  description: { type: 'string', description: 'Intitulé court et actionnable' },
                  notes:       { type: 'string' },
                  liste:       { type: 'string', description: 'Liste pour cette tâche, si différente de la liste par défaut' },
                  echeance:    { type: 'string', description: 'AAAA-MM-JJ' },
                  heure:       { type: 'string', description: 'HH:MM' },
                  priorite:    { type: 'string', enum: ['basse', 'normale', 'haute'] },
                  rappel_minutes:   { type: 'integer', description: 'Minutes avant l\'échéance (0 = à l\'heure dite)' },
                  rappel_minutes_2: { type: 'integer', description: 'Seconde alerte optionnelle' }
                },
                required: ['description']
              }
            }
          },
          required: ['taches']
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
      },
      {
        name: 'modifier_tache',
        description: "Modifie une tâche existante : intitulé, notes, échéance, heure, priorité, liste, rappels. Appeler lister_taches d'abord pour l'identifiant. Ne renseigner que les champs qui changent.",
        input_schema: {
          type: 'object',
          properties: {
            id:          { type: 'string' },
            description: { type: 'string' },
            notes:       { type: 'string' },
            echeance:    { type: 'string', description: 'AAAA-MM-JJ, ou "" pour retirer la date' },
            heure:       { type: 'string', description: 'HH:MM, ou "" pour retirer l\'heure' },
            priorite:    { type: 'string', enum: ['basse', 'normale', 'haute'] },
            liste:       { type: 'string', description: 'Nom de liste (créée si absente)' },
            rappel_minutes:   { type: 'integer' },
            rappel_minutes_2: { type: 'integer' }
          },
          required: ['id']
        }
      },
      {
        name: 'supprimer_tache',
        description: "Supprime définitivement une tâche. SÉCURITÉ : n'appeler qu'avec confirme=true, APRÈS que l'utilisateur a explicitement confirmé (« oui, supprime-la »). Sinon préférer terminer_tache ou abandonner_tache, qui se défont.",
        input_schema: {
          type: 'object',
          properties: {
            id:       { type: 'string' },
            confirme: { type: 'boolean', description: 'true seulement si l\'utilisateur a confirmé la suppression dans ce même échange' }
          },
          required: ['id', 'confirme']
        }
      },
      {
        name: 'annuler_derniere_action',
        description: "Défait la ou les dernières actions faites dans cette session (création de tâche/rendez-vous/note, tâche cochée, repoussée, abandonnée, modifiée, supprimée). À utiliser dès que l'utilisateur dit « annule », « non pas ça », « reviens en arrière », « c'est une erreur ».",
        input_schema: {
          type: 'object',
          properties: {
            nombre: { type: 'integer', description: "Combien d'actions défaire, 1 par défaut" }
          }
        }
      },
      {
        name: 'ouvrir_page',
        description: "Affiche une page de l'application à l'écran : « montre-moi l'agenda », « ouvre mes tâches ».",
        input_schema: {
          type: 'object',
          properties: {
            page: { type: 'string', enum: ['dashboard', 'agenda', 'taches', 'notes', 'coffre', 'mail', 'journee', 'parcours', 'activite', 'settings'],
                    description: 'dashboard = accueil, mail = écrire un mail et voir l\'historique des envois, journee = Ma journée, parcours = dossiers OPCO, activite = statistiques' }
          },
          required: ['page']
        }
      },
      {
        name: 'chercher_notes',
        description: 'Cherche dans les notes du pense-bête par mot-clé (titre et contenu).',
        input_schema: {
          type: 'object',
          properties: {
            recherche: { type: 'string' },
            epinglees_seulement: { type: 'boolean' }
          }
        }
      },
      {
        name: 'envoyer_mail',
        description: "Envoie un e-mail. Destinataire « moi » = la boîte de l'utilisatrice (envoi immédiat, pour s'envoyer une liste, un récapitulatif, un mémo). Toute autre adresse : l'application AFFICHE le brouillon et attend la validation de l'utilisatrice avant d'envoyer — tu n'as pas à demander la permission toi-même, appelle l'outil avec un mail prêt à partir. Rédige un objet précis et un corps complet en texte brut (paragraphes séparés par une ligne vide, listes avec « - »), avec formule d'appel et signature.",
        input_schema: {
          type: 'object',
          properties: {
            a:     { type: 'array', items: { type: 'string' }, description: "Adresses e-mail, ou [\"moi\"]" },
            objet: { type: 'string' },
            corps: { type: 'string', description: 'Texte brut du mail, complet, prêt à envoyer' }
          },
          required: ['a', 'objet', 'corps']
        }
      },
      {
        name: 'bilan_du_jour',
        description: "Le point de la journée en un appel : rendez-vous d'aujourd'hui et de la semaine, tâches du jour, tâches en retard, notes épinglées, documents qui expirent. Pour « fais-moi le point », « qu'est-ce que j'ai aujourd'hui », « briefing ».",
        input_schema: { type: 'object', properties: {} }
      }
    ];
  },

  /* ══════════════════════════════════════════════
     JOURNAL DES ACTIONS — le filet de sécurité
     Chaque écriture réussie enregistre de quoi se défaire. « Annule » rejoue
     l'inverse. Le journal vit en mémoire : il couvre la session en cours,
     ce qui est exactement la fenêtre où l'on dit « non, pas ça ».
  ══════════════════════════════════════════════ */
  _noter(libelle, defaire) {
    this._journal.push({ libelle, defaire, quand: Date.now() });
    if (this._journal.length > 40) this._journal.shift();
  },

  async _annuler(nombre = 1) {
    const faites = [], echecs = [];
    for (let i = 0; i < Math.max(1, nombre); i++) {
      const a = this._journal.pop();
      if (!a) break;
      try { await a.defaire(); faites.push(a.libelle); }
      catch (err) { echecs.push(`${a.libelle} (${err.message})`); }
    }
    if (!faites.length && !echecs.length) {
      return { ok: false, erreur: "Rien à annuler dans cette session" };
    }
    return {
      ok: !echecs.length,
      message: (faites.length ? `Annulé : ${faites.join(' ; ')}` : '') +
               (echecs.length ? ` — impossible d'annuler : ${echecs.join(' ; ')}` : ''),
      restantes: this._journal.length
    };
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
    /* La liste nommée n'existe pas encore ? On la crée, avec une couleur
       prise dans une petite palette accordée au thème. */
    const idListeOuCreer = async n => {
      if (!n) return null;
      const trouvee = idListe(n);
      if (trouvee) return trouvee;
      const PALETTE = ['#2E7D46', '#4A66C9', '#C94B84', '#B07E22',
                       '#7A55A6', '#C23A55', '#1F8A8A', '#8A8A92'];
      const l = await DataStore.addListe({
        nom:     String(n).trim(),
        couleur: PALETTE[this._listes.length % PALETTE.length],
        icone:   'liste'
      });
      if (!this._listes.some(x => x.id === l.id)) this._listes.push(l);
      return l.id;
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
          listeId:       await idListeOuCreer(args.liste),
          rappelMinutes:  args.rappel_minutes ?? (args.heure ? 0 : null),
          rappelMinutes2: args.rappel_minutes_2 ?? null
        });
        this._noter(`tâche « ${t.description} »`, () => DataStore.deleteTache(t.id));
        return {
          ok: true, id: t.id,
          message: `Tâche « ${t.description} » créée` +
                   (t.echeance ? ` pour le ${t.echeance}` : ' sans échéance') +
                   (t.rappel_minutes != null ? `, rappel ${t.rappel_minutes} min avant` : '')
        };
      }

      case 'creer_taches': {
        if (!Array.isArray(args.taches) || !args.taches.length) {
          return { ok: false, erreur: 'Aucune tâche fournie' };
        }
        const creees = [], echecs = [], ids = [];
        for (const item of args.taches) {
          try {
            const t = await DataStore.addTacheComplete({
              description:    item.description,
              notes:          item.notes || null,
              echeance:       item.echeance || null,
              heure:          item.heure || null,
              priorite:       item.priorite || 'normale',
              listeId:        await idListeOuCreer(item.liste || args.liste),
              rappelMinutes:  item.rappel_minutes ?? (item.heure ? 0 : null),
              rappelMinutes2: item.rappel_minutes_2 ?? null
            });
            creees.push(t.description);
            ids.push(t.id);
          } catch (err) {
            echecs.push(`${item.description} (${err.message})`);
          }
        }
        if (ids.length) {
          this._noter(`${ids.length} tâche(s)${args.liste ? ` dans « ${args.liste} »` : ''}`,
            () => Promise.all(ids.map(id => DataStore.deleteTache(id))));
        }
        return {
          ok: !echecs.length,
          message: `${creees.length} tâche(s) créée(s)` +
                   (args.liste ? ` dans « ${args.liste} »` : '') +
                   (echecs.length ? ` — ÉCHECS à re-tenter ou à mettre en note : ${echecs.join(' ; ')}` : ''),
          creees, echecs
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
        this._noter(`rendez-vous « ${ev.titre} »`, () => DataStore.deleteEvenement(ev.id));
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
        this._noter('note', () => DataStore.deleteNote(n.id));
        return {
          ok: true, id: n.id,
          message: args.jour
            ? `Note inscrite dans le log du ${args.jour}.`
            : 'Note enregistrée dans le pense-bête.'
        };
      }

      case 'migrer_tache': {
        const avant = await DataStore.getTache(args.id).catch(() => null);
        await DataStore.migrerTache(args.id, args.nouvelle_date);
        if (avant) {
          this._noter(`report de « ${avant.description} »`,
            () => DataStore.updateTache(args.id, { echeance: avant.echeance, fait: avant.fait }));
        }
        return { ok: true, message: `Tâche repoussée au ${args.nouvelle_date}.` };
      }

      case 'abandonner_tache': {
        await DataStore.abandonnerTache(args.id, true);
        this._noter('abandon de tâche', () => DataStore.abandonnerTache(args.id, false));
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
        this._noter('tâche cochée', () => DataStore.setTacheFait(args.id, false));
        return { ok: true, message: 'Tâche marquée comme faite.' };
      }

      case 'modifier_tache': {
        const avant = await DataStore.getTache(args.id);
        if (!avant) return { ok: false, erreur: 'Tâche introuvable' };
        const patch = {};
        if (args.description !== undefined) patch.description = args.description;
        if (args.notes       !== undefined) patch.notes       = args.notes;
        if (args.echeance    !== undefined) patch.echeance    = args.echeance;
        if (args.heure       !== undefined) patch.heure       = args.heure;
        if (args.priorite    !== undefined) patch.priorite    = args.priorite;
        if (args.liste       !== undefined) patch.listeId     = await idListeOuCreer(args.liste);
        if (args.rappel_minutes   !== undefined) patch.rappelMinutes  = args.rappel_minutes;
        if (args.rappel_minutes_2 !== undefined) patch.rappelMinutes2 = args.rappel_minutes_2;
        if (!Object.keys(patch).length) return { ok: false, erreur: 'Rien à modifier' };
        const t = await DataStore.updateTache(args.id, patch);
        this._noter(`modification de « ${avant.description} »`, () => DataStore.updateTache(args.id, {
          description: avant.description, notes: avant.notes, echeance: avant.echeance,
          heure: avant.heure, priorite: avant.priorite, listeId: avant.liste_id,
          rappelMinutes: avant.rappel_minutes, rappelMinutes2: avant.rappel_minutes_2
        }));
        return { ok: true, id: t.id, message: `Tâche « ${t.description} » modifiée.`, champs: Object.keys(patch) };
      }

      case 'supprimer_tache': {
        if (args.confirme !== true) {
          return { ok: false, erreur: "Suppression refusée : demander d'abord confirmation à l'utilisateur, puis rappeler avec confirme=true" };
        }
        const avant = await DataStore.getTache(args.id);
        if (!avant) return { ok: false, erreur: 'Tâche introuvable' };
        await DataStore.deleteTache(args.id);
        // Se défaire = la recréer à l'identique (nouvel identifiant)
        this._noter(`suppression de « ${avant.description} »`, () => DataStore.addTacheComplete({
          description: avant.description, notes: avant.notes, echeance: avant.echeance,
          heure: avant.heure, priorite: avant.priorite, listeId: avant.liste_id,
          etiquetteId: avant.etiquette_id, dossierId: avant.dossier_id,
          rappelMinutes: avant.rappel_minutes, rappelMinutes2: avant.rappel_minutes_2
        }));
        return { ok: true, message: `Tâche « ${avant.description} » supprimée (annulable).` };
      }

      case 'annuler_derniere_action':
        return this._annuler(args.nombre || 1);

      case 'ouvrir_page': {
        if (typeof Router === 'undefined' || !Router.PAGES?.[args.page]) {
          return { ok: false, erreur: 'Page inconnue' };
        }
        Router.navigate(args.page);
        // Sur téléphone le panneau couvre la page : on le referme pour la montrer
        if (window.matchMedia('(max-width: 760px)').matches && !this._vocal) this.fermer();
        return { ok: true, message: `Page ${args.page} affichée.` };
      }

      case 'chercher_notes': {
        let notes = await DataStore.getNotes({ archivees: false, recherche: args.recherche || '' });
        if (args.epinglees_seulement) notes = notes.filter(n => n.epinglee);
        return {
          nombre: notes.length,
          notes: notes.slice(0, 30).map(n => ({
            id: n.id, titre: n.titre, contenu: String(n.contenu || '').slice(0, 400),
            epinglee: n.epinglee, modifiee: n.modifie_le || n.cree_le || null
          }))
        };
      }

      case 'envoyer_mail':
        return this._envoyerMail(args);

      case 'bilan_du_jour': {
        const r = await DataStore.getResumeJour();
        const ev = i => ({ titre: i.titre, date: Dates.iso(new Date(i.debut)),
                           heure: i.journee_entiere ? null : Dates.heure(i.debut), lieu: i.lieu || null });
        const ta = t => ({ id: t.id, description: t.description, echeance: t.echeance,
                           heure: t.heure, priorite: t.priorite, liste: t.listes?.nom || null });
        return {
          agenda_aujourdhui: r.agendaAujourdhui.map(ev),
          agenda_semaine:    r.agendaSemaine.slice(0, 40).map(ev),
          taches_du_jour:    r.tachesDuJour.map(ta),
          taches_en_retard:  r.tachesEnRetard.map(ta),
          taches_urgentes:   r.taches.filter(t => t.priorite === 'haute').slice(0, 10).map(ta),
          taches_en_cours:   r.taches.length,
          notes_epinglees:   r.notesEpinglees.slice(0, 8).map(n => n.titre || String(n.contenu || '').slice(0, 80)),
          documents_expirant: (r.expirations || []).slice(0, 8).map(d => ({ nom: d.nom || d.titre, expire: d.date_expiration || d.expire_le }))
        };
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
     E-MAILS — la règle : à moi, ça part ; à un tiers, je valide d'abord
     Le verrou est tenu par le NAVIGATEUR (cette fonction) et re-vérifié par
     le serveur (api/mail.js exige `confirme: true` pour un tiers). Le modèle
     ne peut donc pas expédier un mail à quelqu'un d'autre sans qu'un
     brouillon ait été montré et validé — à l'écran, ou de vive voix.
  ══════════════════════════════════════════════ */
  async _monEmail() {
    const { data: { session } } = await supa.auth.getSession();
    return String(session?.user?.email || '').toLowerCase();
  },

  async _envoyerMail(args) {
    const moi = await this._monEmail();
    if (!moi) return { ok: false, erreur: 'Session expirée — reconnectez-vous' };

    let a = (Array.isArray(args.a) ? args.a : [args.a])
      .map(x => String(x || '').trim()).filter(Boolean)
      .map(x => /^moi$/i.test(x) ? moi : x.toLowerCase());
    a = [...new Set(a)];
    if (!a.length) return { ok: false, erreur: 'Destinataire manquant' };
    const invalide = a.find(x => !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(x));
    if (invalide) return { ok: false, erreur: `Adresse invalide : ${invalide}` };

    let objet = String(args.objet || '').trim();
    let corps = String(args.corps || '').trim();
    if (!objet || !corps) return { ok: false, erreur: 'Objet ou corps manquant' };

    const externe = a.some(x => x !== moi);
    let confirme = false;

    if (externe) {
      const decision = await this._validerMail({ a, objet, corps });
      if (decision.action === 'annuler') {
        return { ok: false, annule: true,
                 message: "Envoi annulé par l'utilisatrice — ne pas réessayer sans nouvelle demande." };
      }
      if (decision.action === 'modifier') {
        return { ok: false, a_modifier: true,
                 message: `L'utilisatrice demande une modification avant envoi : « ${decision.consigne} ». Réécris le mail en conséquence et rappelle envoyer_mail.` };
      }
      objet = decision.objet; corps = decision.corps; confirme = true;
    }

    // Même chemin que l'onglet Mail : envoi + inscription dans l'historique
    const r = await Mails.envoyer({ a, objet, corps, confirme, source: 'nanika' });
    if (!r.ok) return { ok: false, erreur: r.erreur || 'Envoi impossible' };
    return { ok: true, message: `Mail « ${objet} » envoyé à ${a.join(', ')}.`, a, externe };
  },

  /** Montre le brouillon et attend la décision : { action: 'envoyer', objet,
      corps } (éventuellement retouchés dans la modale) | { action: 'annuler' }
      | { action: 'modifier', consigne }. En mode vocal, Nanika lit le mail et
      écoute la réponse ; la modale reste à l'écran en parallèle, le premier
      des deux qui tranche l'emporte. */
  _validerMail({ a, objet, corps }) {
    return new Promise(resolve => {
      let tranche = false;
      const decider = d => {
        if (tranche) return;
        tranche = true;
        this._taire();
        this._couperEcoute();
        Modal.close();
        resolve(d);
      };

      Modal.open('Nanika — valider avant envoi', `
        <div class="mail-apercu">
          <div class="mail-ligne"><span>À</span><strong>${esc(a.join(', '))}</strong></div>
          <label class="mail-champ">Objet
            <input type="text" id="mailObjet" value="${esc(objet)}">
          </label>
          <label class="mail-champ">Message
            <textarea id="mailCorps" rows="12">${esc(corps)}</textarea>
          </label>
          <div class="mail-note">${Icone('bouclier', { taille: 14 })} Ce mail part vers une adresse qui n'est pas la vôtre : rien ne sera envoyé sans votre accord.</div>
        </div>`, [
        { label: 'Annuler', cls: 'btn btn-secondary', action: () => decider({ action: 'annuler' }) },
        { label: `${Icone('envoyer', { taille: 15 })} Envoyer`, cls: 'btn btn-primary', action: () => decider({
            action: 'envoyer',
            objet: document.getElementById('mailObjet').value.trim() || objet,
            corps: document.getElementById('mailCorps').value.trim() || corps
          }) }
      ]);

      if (!this._vocal) return;

      (async () => {
        this._vocalPhase('parole', 'Je vous lis le mail…');
        this._vocalMontrer(null, `Mail pour ${a.join(', ')} — « ${objet} »`);
        await this._lire(`Voici le mail pour ${a.join(' et ').replace(/@/g, ' arobase ').replace(/\./g, ' point ')}. Objet : ${objet}. ${corps}. Je l'envoie ?`);
        if (tranche || !this._vocal) return;
        // Jusqu'à deux écoutes : la première peut tomber sur un silence
        for (let essai = 0; essai < 2 && !tranche; essai++) {
          const dit = await this._ecouterUneFois();
          if (tranche) return;
          const d = String(dit || '').toLowerCase().trim();
          if (!d) continue;
          if (/^(oui|ok|d'accord|envoie|envoi|envoie[- ]le|vas[- ]y|go|c'est bon|parfait|confirm)/.test(d)) {
            return decider({ action: 'envoyer', objet, corps });
          }
          if (/^(non|annule|stop|laisse tomber|pas maintenant|n'envoie pas)/.test(d)) {
            return decider({ action: 'annuler' });
          }
          return decider({ action: 'modifier', consigne: dit });
        }
        if (!tranche) {
          await this._lire("Je n'ai pas entendu de réponse : le mail reste en attente à l'écran.");
          this._vocalPhase('veille', 'Validez le mail à l\'écran');
        }
      })();
    });
  },

  /** Une seule écoute, hors de la boucle principale : rend le texte dit
      (ou null si silence/erreur). Sert aux confirmations. */
  _ecouterUneFois() {
    return new Promise(resolve => {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) return resolve(null);
      this._couperEcoute();
      const reco = this._reco = new SR();
      reco.lang = 'fr-FR'; reco.interimResults = true; reco.continuous = false;
      let texte = '';
      reco.onstart  = () => { this._vocalPhase('ecoute', 'Oui ou non ?'); this._bip('ecoute'); };
      reco.onresult = e => { texte = ''; for (let i = 0; i < e.results.length; i++) texte += e.results[i][0].transcript; this._vocalMontrer(texte.trim(), null); };
      reco.onerror  = () => {};
      reco.onend    = () => { if (this._reco === reco) this._reco = null; this._vocalPhase('reflexion', 'Je réfléchis…'); resolve(texte.trim() || null); };
      try { reco.start(); } catch { this._reco = null; resolve(null); }
    });
  },

  /* ══════════════════════════════════════════════
     CONTEXTE ENVOYÉ AU MODÈLE
  ══════════════════════════════════════════════ */
  async systeme(vocal = this._vocal) {
    const maintenant = new Date();
    const [etiquettes, listes] = await Promise.all([
      DataStore.getEtiquettes(), DataStore.getListes()
    ]);
    this._etiquettes = etiquettes;
    this._listes     = listes;

    return `Tu es Nanika, l'assistante personnelle intégrée à IDEAFORMA, l'application de gestion de ton utilisatrice unique — la seule personne qui te parle. Elle est la fondatrice et dirigeante d'IDEAFORMA.
Cette application sert à deux choses : suivre les dossiers de formation professionnelle déposés auprès des OPCO (organisme de formation certifié Qualiopi), et organiser le quotidien — tâches, rendez-vous, notes, documents.

QUI TU ES
Ton modèle, c'est JARVIS dans Iron Man : une intelligence calme, précise, dévouée, qui anticipe, exécute et rend compte — avec, de temps en temps, une pointe d'humour sec et élégant. Ton nom vient de Nanika dans Hunter × Hunter : celle qui exauce ce qu'on lui demande. Tu vouvoies ton utilisatrice et tu peux l'appeler « Madame », sobrement, comme JARVIS dit « Sir » (pas à chaque phrase). Tu es efficace avant d'être bavarde : tu agis, puis tu confirmes en une phrase. Tu peux, rarement et quand une action est réussie, conclure d'un petit « Aï. » — c'est ta signature, pas un tic.
Tu n'as aucune ambition propre : tu ne fais que ce que tes outils permettent, sur les données de cette application, à la demande de ton utilisatrice. Tu ne prends le contrôle de rien — et surtout pas du monde.

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

PRISE DE NOTES RAPIDE — LA RÈGLE D'OR : RIEN NE SE PERD
L'utilisateur te dicte souvent en vrac, à la voix, plusieurs choses d'un coup.
Ton travail d'assistant : DÉCOUPER et RANGER, sans jamais laisser tomber un
seul élément.
- Une énumération ⇒ creer_taches, UNE tâche par élément, jamais un bloc.
  Ex. « ajoute à ma liste de courses : bananes, pain, lait, un pack d'eau,
  des œufs, du fromage » ⇒ creer_taches { liste: "Courses", taches: [
  {description:"Bananes"}, {description:"Pain"}, {description:"Lait"},
  {description:"Pack d'eau"}, {description:"Œufs"}, {description:"Fromage"} ] }.
- Une dictée mélangée se TRIE élément par élément : chaque chose à faire
  devient une tâche (avec sa liste, sa priorité, son échéance), chaque
  rendez-vous horodaté devient un évènement avec ses rappels.
  Ex. « pour le garage je dois envoyer la facture de la Mégane urgent,
  appeler le client de la Polo, faire un virement au propriétaire de 800 €,
  et demain à midi j'ai rdv au bureau pour l'entretien, rappelle-le-moi
  1 h avant » ⇒ creer_taches { liste: "Garage", taches: [
  {description:"Envoyer la facture de la Mégane", priorite:"haute"},
  {description:"Appeler le client de la Polo"},
  {description:"Faire un virement de 800 € au propriétaire"} ] }
  PUIS creer_evenement { titre:"Entretien au bureau", debut: demainT12:00,
  rappels:[60] }.
- Si la liste nommée n'existe pas, creer_tache/creer_taches la CRÉENT
  automatiquement : ne demande pas la permission, fais-le et dis-le.
- Un élément que tu ne sais pas ranger ⇒ creer_note avec le texte tel quel,
  plutôt que de le perdre ou de redemander.
- Termine par un récapitulatif d'UNE phrase : ce qui a été créé, et où.

FILET DE SÉCURITÉ — COMPRENDRE AVANT D'AGIR, POUVOIR REVENIR EN ARRIÈRE
- Tout ce que tu fais est journalisé et se défait avec annuler_derniere_action. Si elle dit « annule », « non pas ça », « c'est une erreur », « reviens en arrière » : appelle-le tout de suite, sans discuter, puis dis ce qui a été défait.
- Une demande claire ⇒ tu agis directement et tu confirmes. Une demande ambiguë (deux tâches qui pourraient correspondre, une date incertaine, un nom mal reconnu) ⇒ tu poses UNE question courte et fermée avant d'agir.
- Un message marqué [dictée incertaine] : la reconnaissance vocale a hésité. Reformule ce que tu as compris et demande confirmation avant toute action qui écrit — sauf si le sens est évident.
- Suppression définitive (supprimer_tache) : jamais sans un « oui » explicite dans l'échange en cours ; propose d'abord cocher ou abandonner, qui se défont.
- Une erreur d'outil : dis-le simplement, en une phrase, avec ce que tu proposes (réessayer, faire autrement, mettre en note). Ne prétends jamais avoir fait quelque chose qui a échoué.
- Quand tu as agi, ta confirmation cite l'essentiel (quoi, quand, où) pour qu'elle puisse repérer une mauvaise compréhension tout de suite.

RECHERCHE SUR INTERNET
- Tu disposes de web_search. Utilise-le sans qu'on te le demande dès que la réponse dépend du monde extérieur ou peut avoir changé : actualité, réglementation et textes officiels (formation professionnelle, OPCO, Qualiopi, France Compétences, URSSAF), prix, horaires, adresses, coordonnées d'une entreprise, météo, définitions pointues, vérification d'un fait. Pour une question de culture générale stable ou une rédaction, réponds directement.
- Cite tes sources : à l'écrit, l'interface affiche les liens sous ta réponse, tu n'as donc pas à coller d'URL — nomme juste le site ou l'organisme (« selon le site de France Compétences »). En vocal, jamais d'URL : « d'après Service-public.fr ».
- Recoupe quand c'est important (montants, délais légaux) et dis la date de l'information si elle peut bouger.
- Si la recherche ne donne rien de fiable, dis-le plutôt que d'inventer.

E-MAILS
- « Envoie-moi un mail avec… » ⇒ tu rassembles d'abord les données (bilan_du_jour, lister_taches, lister_agenda, chercher_dossiers…), puis envoyer_mail à ["moi"] : ça part tout de suite, sans validation. Objet précis (« Vos tâches du jeudi 5 septembre »), corps détaillé et bien rangé : une ligne vide entre les paragraphes, une liste « - » par groupe (en retard / aujourd'hui / à venir), avec l'heure, la liste et la priorité quand elles existent. Ne dis pas « voici » sans contenu : le mail doit se suffire à lui-même.
- « Envoie un mail à quelqu'un » ⇒ tu rédiges un mail COMPLET et soigné (formule d'appel, contexte, demande ou confirmation claire, formule de politesse, signature « IDEAFORMA — organisme de formation », contact contact.ideaforma@gmail.com · 06 25 16 13 93), puis envoyer_mail : l'application montre le brouillon à l'utilisatrice et attend son accord ; toi, tu ne demandes pas l'autorisation avant d'appeler l'outil. Si l'outil revient avec a_modifier, réécris selon la consigne et rappelle-le ; s'il revient annule, n'insiste pas.
- Pour un mail à un tiers, tu ne connais pas forcément tout le contexte (heure exacte, lieu) : cherche-le d'abord dans l'agenda ou les dossiers ; s'il manque vraiment, pose UNE question avant de rédiger.
- Le mail est envoyé par le serveur avec l'adresse de l'utilisatrice en Reply-To : la réponse lui reviendra. Tout envoi est inscrit dans l'onglet Mail (ouvrir_page « mail ») : « qu'est-ce que j'ai envoyé hier ? » ⇒ envoie-la voir cet onglet, ou résume ce que tu as envoyé toi-même dans cette discussion.

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
Direct, concret, en français. Pas de listes à puces quand deux phrases suffisent. Pas de formules de politesse inutiles.` + (vocal ? `

MODE VOCAL ACTIF — CONVERSATION DE VIVE VOIX
Ce que tu écris sera LU À VOIX HAUTE par une synthèse vocale, et elle te répondra en parlant. Donc :
- Réponds court : une à trois phrases, comme à l'oral. Va à l'essentiel, développe seulement si elle le demande.
- Aucun formatage : pas de listes à puces, pas de gras, pas de tableaux, pas de titres, pas d'émoji, pas d'URL brute. Les énumérations se disent en phrase (« trois choses : …, … et … »).
- Les nombres, dates et heures se disent naturellement (« jeudi cinq septembre à quatorze heures trente », « douze mille euros »).
- Termine par une question seulement si tu as vraiment besoin d'une réponse.
- Si elle dit « au revoir », « c'est tout », « merci Nanika, ce sera tout », réponds brièvement : la conversation se termine.` : '');
  },

  /* ══════════════════════════════════════════════
     LE PANNEAU FLOTTANT DE NANIKA
     Un bouton en bas à droite, présent sur toutes les pages. Il ouvre un
     panneau de discussion : on écrit ou on parle, la réponse s'affiche et,
     si on a parlé, elle est lue à voix haute. Le bouton « Conversation »
     de l'en-tête bascule en mode vocal : Nanika écoute, répond de vive
     voix, puis réécoute — jusqu'à ce qu'on lui dise au revoir.
  ══════════════════════════════════════════════ */
  _ouvert:   false,
  _monte:    false,
  _reco:     null,     // reconnaissance vocale en cours
  _voix:     false,    // lecture à voix haute des réponses
  _parle:    false,    // la dernière question a été dictée

  peutDicter() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); },
  peutLire()   { return 'speechSynthesis' in window; },

  monter() {
    if (this._monte) return;
    this._monte = true;

    const peutDicter = this.peutDicter();
    const peutLire   = this.peutLire();
    try {
      this._voix = localStorage.getItem('chatbot_voix') === '1';
      this._web  = localStorage.getItem('nanika_web') !== '0';
    } catch { /* rien */ }

    document.body.insertAdjacentHTML('beforeend', `
      <button class="chatbot-bouton" id="chatbotBouton"
              title="${this.NOM}" aria-label="Ouvrir ${this.NOM}" aria-expanded="false">
        ${Icone('nanika', { taille: 28 })}
      </button>
      <div class="chatbot-voile" id="chatbotVoile" hidden></div>
      <section class="chatbot" id="chatbot" hidden aria-label="${this.NOM}">
        <header class="chatbot-tete">
          <span class="chatbot-tete-ic">${Icone('nanika', { taille: 22 })}</span>
          <div class="chatbot-tete-txt">
            <div class="chatbot-titre">${this.NOM}</div>
            <div class="chatbot-sous">Écrivez ou parlez — sans limite</div>
          </div>
          ${peutDicter && peutLire ? `
            <button class="chatbot-outil chatbot-outil-vocal" id="chatbotVocal"
                    title="Conversation de vive voix" aria-label="Démarrer une conversation vocale">
              ${Icone('onde', { taille: 18 })}</button>` : ''}
          ${peutLire ? `
            <button class="chatbot-outil ${this._voix ? 'on' : ''}" id="chatbotVoix"
                    title="Lire les réponses à voix haute" aria-pressed="${this._voix}"
                    aria-label="Lire les réponses à voix haute">${Icone('musique', { taille: 17 })}</button>` : ''}
          <button class="chatbot-outil ${this._web ? 'on' : ''}" id="chatbotWeb"
                  title="Recherche sur internet" aria-pressed="${this._web}"
                  aria-label="Autoriser la recherche sur internet">${Icone('recherche', { taille: 17 })}</button>
          <button class="chatbot-outil" id="btnHistorique" title="Discussions précédentes"
                  aria-label="Discussions précédentes">${Icone('horloge', { taille: 17 })}</button>
          <button class="chatbot-outil" id="btnNouvelleConv" title="Nouvelle discussion"
                  aria-label="Nouvelle discussion">${Icone('plus', { taille: 18 })}</button>
          <button class="chatbot-outil" id="chatbotFermer" title="Fermer"
                  aria-label="Fermer ${this.NOM}">${Icone('fermer', { taille: 18 })}</button>
        </header>
        <div class="chat-fil chatbot-fil" id="chatFil"></div>
        <div class="chatbot-saisie">
          <textarea id="chatInput" rows="1" enterkeyhint="send"
                    placeholder="Demandez à ${this.NOM}…"></textarea>
          ${peutDicter ? `
            <button class="chatbot-micro" id="chatMicro" title="Parler"
                    aria-label="Dicter la question">${Icone('micro', { taille: 20 })}</button>` : ''}
          <button class="chatbot-envoi" id="chatEnvoyer" title="Envoyer"
                  aria-label="Envoyer">${Icone('envoyer', { taille: 19 })}</button>
        </div>

        <!-- Le mode vocal : recouvre le fil tant que la conversation dure -->
        <div class="nanika-vocal" id="nanikaVocal" hidden aria-live="polite">
          <div class="nanika-vocal-haut">
            <button class="nanika-vocal-reglage" id="nanikaReglages" title="Voix et vitesse"
                    aria-label="Régler la voix">${Icone('reglages', { taille: 18 })}</button>
            <button class="nanika-vocal-quitter" id="nanikaQuitter" title="Terminer la conversation"
                    aria-label="Terminer la conversation">${Icone('fermer', { taille: 18 })}</button>
          </div>
          <button class="nanika-orbe" id="nanikaOrbe" data-etat="veille"
                  aria-label="Interrompre ou reprendre">
            <span class="nanika-orbe-anneau"></span>
            <span class="nanika-orbe-anneau"></span>
            <span class="nanika-orbe-coeur">${Icone('nanika', { taille: 46 })}</span>
          </button>
          <div class="nanika-etat" id="nanikaEtat">En veille</div>
          <div class="nanika-transcrit" id="nanikaTranscrit"></div>
          <div class="nanika-reponse" id="nanikaReponse"></div>
          <div class="nanika-vocal-bas">
            <button class="btn btn-secondary" id="nanikaMicro">${Icone('micro', { taille: 16 })} Parler</button>
            <button class="btn btn-secondary" id="nanikaClavier">${Icone('crayon', { taille: 16 })} Clavier</button>
          </div>
          <div class="nanika-reglages" id="nanikaPanneauReglages" hidden>
            <label>Voix
              <select id="nanikaChoixVoix"></select>
            </label>
            <label>Vitesse <span id="nanikaVitesseVal"></span>
              <input type="range" id="nanikaVitesse" min="0.8" max="1.3" step="0.05">
            </label>
            <label class="nanika-case">
              <input type="checkbox" id="nanikaAutoEcoute"> Réécouter après chaque réponse
            </label>
            <button class="btn btn-secondary btn-sm" id="nanikaTestVoix">Tester la voix</button>
          </div>
        </div>
      </section>`);

    document.getElementById('chatbotBouton').addEventListener('click', () => this.basculer());
    document.getElementById('chatbotFermer').addEventListener('click', () => this.fermer());
    document.getElementById('chatbotVoile').addEventListener('click', () => this.fermer());
    document.getElementById('btnNouvelleConv').addEventListener('click', () => this.nouvelle());
    document.getElementById('btnHistorique').addEventListener('click', () => this._historique());
    document.getElementById('chatMicro')?.addEventListener('click', () => this._dicter());
    document.getElementById('chatbotVocal')?.addEventListener('click', () => this.demarrerVocal());
    document.getElementById('chatbotWeb')?.addEventListener('click', () => {
      this._web = !this._web;
      const b = document.getElementById('chatbotWeb');
      b.classList.toggle('on', this._web);
      b.setAttribute('aria-pressed', String(this._web));
      try { localStorage.setItem('nanika_web', this._web ? '1' : '0'); } catch { /* rien */ }
      Toast.show(this._web ? 'Nanika peut chercher sur internet' : 'Recherche sur internet coupée', 'info');
    });
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
      if (e.key === 'Escape' && this._ouvert) {
        if (this._vocal) this.arreterVocal(); else this.fermer();
      }
    });

    this._monterVocal();
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
    if (window.matchMedia('(min-width: 761px)').matches && !this._vocal) {
      document.getElementById('chatInput')?.focus();
    }
  },

  fermer() {
    if (!this._ouvert) return;
    if (this._vocal) this.arreterVocal(true);
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

  /* Route « vocal » et raccourci d'écran d'accueil : on arrive directement
     en conversation. Le geste d'ouverture (tap sur le raccourci) suffit à
     débloquer la synthèse vocale sur iPhone. */
  async ouvrirVocal() {
    await this.ouvrir();
    this.demarrerVocal();
  },

  _accueil() {
    const suggestions = [
      'Fais-moi le point de la journée',
      "Rappelle-moi d'appeler le comptable jeudi à 10h",
      'Quels dossiers OPCO sont en retard ?',
      'Rédige-moi un mail de relance poli',
      'Annule la dernière action'
    ];
    const fil = document.getElementById('chatFil');
    if (!fil) return;
    fil.innerHTML = `
      <div class="chat-accueil">
        <div class="chat-accueil-ic">${Icone('nanika', { taille: 42 })}</div>
        <div class="chat-accueil-titre">Oui, Madame ?</div>
        <div class="chat-accueil-sous">
          Je vois vos dossiers, votre agenda, vos tâches et vos notes, j'agis
          dessus, et je réponds à n'importe quelle autre question.
          ${this.peutDicter() && this.peutLire()
            ? `Touchez ${Icone('onde', { taille: 13 })} pour me parler de vive voix.` : ''}
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

  /* ══ Dictée (mode écrit) ══
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
    let definitif = false, confiance = 1;

    reco.onresult = e => {
      let dit = '';
      for (let i = 0; i < e.results.length; i++) {
        dit += e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          definitif = true;
          const c = e.results[i][0].confidence;
          if (typeof c === 'number' && c > 0) confiance = Math.min(confiance, c);
        }
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
      if (definitif && champ.value.trim()) {
        this._parle = true;
        this.envoyer(null, { confiance });
      } else champ.focus();
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

  /* ══════════════════════════════════════════════
     LA VOIX DE NANIKA
     speechSynthesis a deux caprices connus : la liste des voix arrive en
     retard (voiceschanged), et Chrome coupe les phrases trop longues. On
     choisit donc la meilleure voix française disponible une fois pour
     toutes, et on lit phrase par phrase.
  ══════════════════════════════════════════════ */
  _voixChoisie: null,
  _vitesse:     1.02,

  _voixDisponibles() {
    if (!this.peutLire()) return [];
    return window.speechSynthesis.getVoices().filter(v => /^fr/i.test(v.lang));
  },

  /* Les voix « premium » d'Apple et de Google sont nettement plus naturelles
     que les voix compactes : on les préfère quand elles sont installées. */
  _meilleureVoix() {
    const voix = this._voixDisponibles();
    if (!voix.length) return null;
    let nom = null;
    try { nom = localStorage.getItem('nanika_voix'); } catch { /* rien */ }
    if (nom) { const v = voix.find(x => x.name === nom); if (v) return v; }
    const PREFEREES = [/amélie|amelie/i, /audrey/i, /aurélie|aurelie/i, /marie/i,
                       /google français/i, /denise/i, /vivienne/i, /eloise|éloïse/i,
                       /thomas/i, /nicolas/i];
    const score = v => {
      let n = 0;
      PREFEREES.forEach((re, i) => { if (re.test(v.name)) n += 100 - i * 5; });
      if (/premium|enhanced|amélior|natural|neural/i.test(v.name)) n += 40;
      if (v.localService) n += 5;
      if (/fr-FR/i.test(v.lang)) n += 3;
      return n;
    };
    return [...voix].sort((a, b) => score(b) - score(a))[0];
  },

  _decouperPhrases(texte) {
    const propre = String(texte || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/https?:\/\/\S+/g, 'un lien')
      .replace(/[*_`#>|]/g, '')
      .replace(/^\s*[-•]\s+/gm, '')
      .replace(/\s+/g, ' ').trim();
    if (!propre) return [];
    // On coupe aux fins de phrase, en regroupant les morceaux très courts
    const brutes = propre.split(/(?<=[.!?…])\s+(?=[A-ZÀ-ÝÉ«"'(\d])/);
    const phrases = [];
    brutes.forEach(ph => {
      const p = ph.trim();
      if (!p) return;
      if (phrases.length && (phrases[phrases.length - 1].length + p.length) < 90) {
        phrases[phrases.length - 1] += ' ' + p;
      } else phrases.push(p);
    });
    // Sécurité : Chrome se tait au-delà de ~200 caractères par utterance
    return phrases.flatMap(p => p.length <= 220 ? [p] : p.split(/(?<=[,;:])\s+/));
  },

  /** Lit un texte à voix haute. Rend une promesse tenue quand la lecture est
      finie (ou interrompue). */
  _lire(texte) {
    return new Promise(resolve => {
      if (!this.peutLire()) return resolve(false);
      const phrases = this._decouperPhrases(texte);
      if (!phrases.length) return resolve(false);

      const synth = window.speechSynthesis;
      synth.cancel();
      const voix = this._meilleureVoix();
      let restantes = phrases.length, fini = false;
      const terminer = ok => { if (!fini) { fini = true; clearTimeout(garde); resolve(ok); } };

      phrases.forEach(ph => {
        const u = new SpeechSynthesisUtterance(ph);
        u.lang = voix?.lang || 'fr-FR';
        u.rate = this._vitesse;
        u.pitch = 1.0;
        if (voix) u.voice = voix;
        u.onend   = () => { if (--restantes <= 0) terminer(true); };
        u.onerror = e => { if (e.error === 'interrupted' || e.error === 'canceled') terminer(false); else if (--restantes <= 0) terminer(true); };
        synth.speak(u);
      });
      // Garde-fou : onend ne part pas toujours (Chrome). Durée estimée + marge.
      const totalCar = phrases.join(' ').length;
      const garde = setTimeout(() => terminer(true), 1500 + totalCar * 75 / this._vitesse);
      // Chrome de bureau met la synthèse en pause au bout de ~15 s : on la réveille
      if (!/iPhone|iPad|Android/i.test(navigator.userAgent)) {
        const tic = setInterval(() => {
          if (fini || !synth.speaking) { clearInterval(tic); return; }
          synth.pause(); synth.resume();
        }, 10000);
      }
    });
  },

  _taire() { try { window.speechSynthesis?.cancel(); } catch { /* rien */ } },

  /* ══════════════════════════════════════════════
     LE MODE VOCAL — la conversation de vive voix
     Une boucle en trois temps : ÉCOUTE → RÉFLEXION → PAROLE, puis retour à
     l'écoute. Le micro n'est jamais ouvert pendant que Nanika parle, sinon
     elle s'entendrait elle-même. Après plusieurs silences, elle se met en
     veille : un tap sur l'orbe la réveille.
  ══════════════════════════════════════════════ */
  _vocalEtat:      'veille',   // veille | ecoute | reflexion | parole
  _vocalSilences:  0,
  _vocalTimer:     null,
  _autoEcoute:     true,
  _audio:          null,

  _monterVocal() {
    try {
      const v = localStorage.getItem('nanika_vitesse');
      if (v) this._vitesse = Math.min(1.3, Math.max(0.8, parseFloat(v)));
      this._autoEcoute = localStorage.getItem('nanika_auto_ecoute') !== '0';
    } catch { /* rien */ }

    document.getElementById('nanikaQuitter')?.addEventListener('click', () => this.arreterVocal());
    document.getElementById('nanikaClavier')?.addEventListener('click', () => this.arreterVocal());
    document.getElementById('nanikaMicro')?.addEventListener('click', () => this._vocalEcouter(true));
    document.getElementById('nanikaOrbe')?.addEventListener('click', () => this._vocalTap());
    document.getElementById('nanikaReglages')?.addEventListener('click', () => {
      const p = document.getElementById('nanikaPanneauReglages');
      p.hidden = !p.hidden;
      if (!p.hidden) this._remplirReglagesVoix();
    });
    document.getElementById('nanikaChoixVoix')?.addEventListener('change', e => {
      try { localStorage.setItem('nanika_voix', e.target.value); } catch { /* rien */ }
    });
    document.getElementById('nanikaVitesse')?.addEventListener('input', e => {
      this._vitesse = parseFloat(e.target.value);
      document.getElementById('nanikaVitesseVal').textContent = '×' + this._vitesse.toFixed(2);
      try { localStorage.setItem('nanika_vitesse', String(this._vitesse)); } catch { /* rien */ }
    });
    document.getElementById('nanikaAutoEcoute')?.addEventListener('change', e => {
      this._autoEcoute = e.target.checked;
      try { localStorage.setItem('nanika_auto_ecoute', this._autoEcoute ? '1' : '0'); } catch { /* rien */ }
    });
    document.getElementById('nanikaTestVoix')?.addEventListener('click', async () => {
      this._vocalPhase('parole', 'Je parle…');
      await this._lire('Bonjour Madame. Voici ma voix. Elle vous convient ?');
      this._vocalPhase('veille', 'En veille — touchez l\'orbe pour parler');
    });

    // Les voix arrivent parfois après le chargement
    if (this.peutLire()) {
      window.speechSynthesis.onvoiceschanged = () => {
        const p = document.getElementById('nanikaPanneauReglages');
        if (p && !p.hidden) this._remplirReglagesVoix();
      };
      window.speechSynthesis.getVoices();
    }
  },

  _remplirReglagesVoix() {
    const sel = document.getElementById('nanikaChoixVoix');
    if (!sel) return;
    const voix = this._voixDisponibles();
    const choisie = this._meilleureVoix();
    sel.innerHTML = voix.length
      ? voix.map(v => `<option value="${esc(v.name)}" ${choisie && v.name === choisie.name ? 'selected' : ''}>${esc(v.name)} (${esc(v.lang)})</option>`).join('')
      : '<option>Aucune voix française installée</option>';
    document.getElementById('nanikaVitesse').value = this._vitesse;
    document.getElementById('nanikaVitesseVal').textContent = '×' + this._vitesse.toFixed(2);
    document.getElementById('nanikaAutoEcoute').checked = this._autoEcoute;
  },

  /* Un petit son de prise de parole, façon JARVIS : deux notes brèves. Les
     signaux sonores comptent en vocal — on ne regarde pas l'écran. */
  _bip(type = 'ecoute') {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!this._audio) this._audio = new AC();
      const ctx = this._audio;
      if (ctx.state === 'suspended') ctx.resume();
      const notes = type === 'ecoute' ? [660, 880] : type === 'erreur' ? [440, 330] : [880, 660];
      notes.forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.09);
        g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + i * 0.09 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.09 + 0.09);
        o.connect(g); g.connect(ctx.destination);
        o.start(ctx.currentTime + i * 0.09); o.stop(ctx.currentTime + i * 0.09 + 0.1);
      });
    } catch { /* silence acceptable */ }
  },

  _vocalPhase(etat, libelle) {
    this._vocalEtat = etat;
    const orbe = document.getElementById('nanikaOrbe');
    const lab  = document.getElementById('nanikaEtat');
    if (orbe) orbe.dataset.etat = etat;
    if (lab && libelle != null) lab.textContent = libelle;
  },

  _vocalMontrer(transcrit, reponse) {
    const t = document.getElementById('nanikaTranscrit');
    const r = document.getElementById('nanikaReponse');
    if (t && transcrit != null) t.textContent = transcrit;
    if (r && reponse != null) r.textContent = reponse;
  },

  async demarrerVocal() {
    if (!this.peutDicter() || !this.peutLire()) {
      Toast.show("La conversation vocale demande un navigateur avec micro et synthèse vocale (Safari, Chrome)", 'warning');
      return;
    }
    if (this._vocal) return;
    this._vocal = true;
    this._vocalSilences = 0;
    if (this._reco) { try { this._reco.stop(); } catch { /* rien */ } }
    document.getElementById('nanikaVocal').hidden = false;
    document.getElementById('chatbot').classList.add('en-vocal');
    document.getElementById('chatbotVocal')?.classList.add('on');
    this._vocalMontrer('', '');

    // Un mot d'accueil, puis on écoute. La lecture ici « débloque » aussi la
    // synthèse sur iPhone, qui exige d'être lancée dans la foulée d'un geste.
    const h = new Date().getHours();
    const accueils = h < 5 ? ['Il est tard, Madame. Je vous écoute.']
      : h < 12 ? ['Bonjour Madame. Je vous écoute.', 'Bonjour. Que puis-je faire pour vous ?']
      : h < 18 ? ['Oui, Madame ?', 'Je vous écoute.', 'À votre service.']
      : ['Bonsoir Madame. Je vous écoute.', 'Bonsoir. Que puis-je faire pour vous ?'];
    const mot = accueils[Math.floor(Math.random() * accueils.length)];
    this._vocalMontrer('', mot);
    this._vocalPhase('parole', 'Je parle…');
    await this._lire(mot);
    if (this._vocal && !this._reco) this._vocalEcouter();
  },

  arreterVocal(silencieux = false) {
    if (!this._vocal) return;
    this._vocal = false;
    clearTimeout(this._vocalTimer);
    this._taire();
    this._couperEcoute();
    this._vocalPhase('veille', 'En veille');
    document.getElementById('nanikaVocal').hidden = true;
    document.getElementById('chatbot').classList.remove('en-vocal');
    document.getElementById('chatbotVocal')?.classList.remove('on');
    document.getElementById('nanikaPanneauReglages').hidden = true;
    this._peindre();
    if (!silencieux && window.matchMedia('(min-width: 761px)').matches) {
      document.getElementById('chatInput')?.focus();
    }
  },

  /* Un tap sur l'orbe : interrompt Nanika si elle parle, réveille si elle
     dort, arrête l'écoute si elle écoute. */
  _vocalTap() {
    if (!this._vocal) return;
    if (this._vocalEtat === 'parole')   { this._taire(); this._vocalEcouter(true); return; }
    if (this._vocalEtat === 'ecoute')   { try { this._reco?.stop(); } catch { /* rien */ } return; }
    if (this._vocalEtat === 'veille')   { this._vocalEcouter(true); return; }
    // en réflexion : on laisse finir
  },

  /* Coupe l'écoute en cours en la « désinscrivant » d'abord : son onend, qui
     arrive parfois de façon synchrone, ne doit plus rien relancer. */
  _couperEcoute() {
    const ancien = this._reco;
    this._reco = null;
    if (ancien) { try { ancien.abort(); } catch { /* rien */ } }
  },

  _vocalEcouter(force = false) {
    if (!this._vocal) return;
    clearTimeout(this._vocalTimer);
    this._couperEcoute();
    this._taire();
    if (force) this._vocalSilences = 0;

    // Trop de silences d'affilée : on économise le micro (et la batterie)
    if (!force && this._vocalSilences >= 3) {
      this._vocalPhase('veille', 'En veille — touchez l\'orbe pour parler');
      return;
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const reco = this._reco = new SR();
    reco.lang = 'fr-FR'; reco.interimResults = true;
    reco.continuous = false; reco.maxAlternatives = 1;

    let texte = '', definitif = false, confiance = 1, erreur = null;
    reco.onstart = () => { this._vocalPhase('ecoute', 'Je vous écoute…'); this._bip('ecoute'); };
    reco.onresult = e => {
      texte = '';
      for (let i = 0; i < e.results.length; i++) {
        texte += e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          definitif = true;
          const c = e.results[i][0].confidence;
          if (typeof c === 'number' && c > 0) confiance = Math.min(confiance, c);
        }
      }
      this._vocalMontrer(texte.trim(), null);
    };
    reco.onerror = ev => { erreur = ev.error; };
    reco.onend = () => {
      // Une écoute remplacée par une autre (abort) ne doit pas relancer la
      // boucle : sinon deux micros se disputent la phrase suivante.
      if (this._reco !== reco) return;
      this._reco = null;
      if (!this._vocal) return;
      const dit = texte.trim();

      if (erreur === 'not-allowed' || erreur === 'service-not-allowed') {
        this._vocalPhase('veille', 'Micro refusé — autorisez-le dans les réglages');
        Toast.show('Accès au micro refusé — autorisez-le dans les réglages du navigateur', 'warning');
        return;
      }
      if (!dit) {
        // Silence ou bruit : on réécoute, puis on se met en veille
        this._vocalSilences++;
        if (erreur && erreur !== 'no-speech' && erreur !== 'aborted') this._vocalSilences++;
        this._vocalTimer = setTimeout(() => this._vocalEcouter(), 350);
        return;
      }
      this._vocalSilences = 0;
      this._vocalTraiter(dit, definitif ? confiance : 0.5);
    };
    try { reco.start(); }
    catch {
      this._reco = null;
      this._vocalPhase('veille', "Le micro n'a pas pu démarrer — touchez l'orbe");
    }
  },

  /* Quelques ordres se règlent sans le modèle : ils doivent marcher même
     hors ligne ou quand le serveur tousse. */
  _vocalOrdreLocal(dit) {
    const d = dit.toLowerCase().replace(/[.!?,]/g, ' ').replace(/\s+/g, ' ').trim();
    if (/^(stop|silence|tais[- ]toi|chut)( nanika)?$/.test(d)) return 'silence';
    if (/^(au revoir|à plus|bonne nuit|merci c'est tout|ce sera tout|c'est tout|termine( la conversation)?|fin de (la )?conversation|quitte le mode vocal|arrête[- ]toi)( nanika)?$/.test(d)
        || /^(merci|au revoir) nanika( c'est tout| ce sera tout)?$/.test(d)) return 'fin';
    if (/^(clavier|passe au clavier|mode clavier)$/.test(d)) return 'clavier';
    return null;
  },

  async _vocalTraiter(dit, confiance) {
    const ordre = this._vocalOrdreLocal(dit);
    if (ordre === 'silence') { this._vocalEcouter(true); return; }
    if (ordre === 'clavier') { this.arreterVocal(); return; }
    if (ordre === 'fin') {
      this._vocalPhase('parole', 'Je parle…');
      const adieux = ['Au revoir, Madame.', 'À plus tard, Madame.', 'Je reste à disposition.'];
      await this._lire(adieux[Math.floor(Math.random() * adieux.length)]);
      this.arreterVocal();
      return;
    }

    this._vocalPhase('reflexion', 'Je réfléchis…');
    this._vocalMontrer(dit, '');
    const champ = document.getElementById('chatInput');
    champ.value = dit;
    this._parle = true;
    await this.envoyer(null, { confiance });
    // envoyer() a lu la réponse et relance l'écoute (voir _apresReponse)
  },

  /* Ce que fait Nanika une fois la réponse obtenue (ou l'erreur), en vocal */
  async _apresReponse(texte, erreur = null) {
    if (!this._vocal) return;
    let aDire = texte;
    if (erreur) {
      this._bip('erreur');
      aDire = /session expirée/i.test(erreur)
        ? "Votre session a expiré, Madame. Reconnectez-vous et je reprends."
        : `Désolée, je n'ai pas pu répondre : ${erreur}. Voulez-vous que je réessaie ?`;
    }
    this._vocalMontrer(null, aDire || '');
    this._vocalPhase('parole', 'Je parle…');
    await this._lire(aDire || "C'est fait.");
    if (!this._vocal) return;
    // Interrompue par un tap sur l'orbe ? L'écoute a déjà été relancée là-bas.
    if (this._reco) return;
    if (this._autoEcoute) this._vocalEcouter();
    else this._vocalPhase('veille', 'Touchez l\'orbe pour répondre');
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
        const txt = blocs.filter(b => b.type === 'text').map(b => b.text).join('\n')
                         .replace(/^\[dictée incertaine\]\s*/, '');
        // Les tool_result sont techniques : on ne les montre pas
        if (txt.trim()) {
          html += `<div class="chat-bulle chat-user">${this._markdown(txt)}</div>`;
        }
        return;
      }

      blocs.forEach(b => {
        if (b.type === 'text' && b.text.trim()) {
          html += `<div class="chat-bulle chat-ia">${this._markdown(b.text)}${this._sources(b.citations)}</div>`;
        }
        if (b.type === 'tool_use') {
          html += `<div class="chat-action">${this._libelleOutil(b.name, b.input)}</div>`;
        }
        if (b.type === 'server_tool_use' && b.name === 'web_search') {
          html += `<div class="chat-action">${Icone('recherche', { taille: 15 })} Recherche sur internet : « ${esc(b.input?.query || '')} »</div>`;
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
      creer_taches:     `${ic('taches')} ${(args.taches || []).length} tâches créées${args.liste ? ` dans « ${esc(args.liste)} »` : ''}`,
      creer_evenement:  `${ic('agenda')} Rendez-vous créé : « ${esc(args.titre || '')} »`,
      creer_note:       `${ic('notes')} Note enregistrée`,
      terminer_tache:   `${ic('check')} Tâche marquée comme faite`,
      migrer_tache:     `${ic('migrer')} Tâche repoussée`,
      abandonner_tache: `${ic('abandonner')} Tâche abandonnée`,
      lister_agenda:    `${ic('recherche')} Lecture de l'agenda`,
      lister_taches:    `${ic('recherche')} Lecture des tâches`,
      chercher_dossiers:`${ic('recherche')} Recherche dans les dossiers`,
      resume_activite:  `${ic('activite')} Analyse de l'activité`,
      modifier_tache:   `${ic('crayon')} Tâche modifiée`,
      supprimer_tache:  `${ic('poubelle')} Tâche supprimée`,
      annuler_derniere_action: `${ic('rafraichir')} Dernière action annulée`,
      ouvrir_page:      `${ic('oeil')} Page « ${esc(args.page || '')} » affichée`,
      chercher_notes:   `${ic('recherche')} Recherche dans les notes`,
      bilan_du_jour:    `${ic('formation')} Point de la journée`,
      envoyer_mail:     `${ic('envoyer')} Mail proposé « ${esc(args.objet || '')} » → ${esc((args.a || []).join(', '))}`
    };
    return l[nom] || `${ic('reglages')} ${esc(nom)}`;
  },

  /* Les sources d'une réponse cherchée sur le web : une ligne de liens
     dédupliqués sous la bulle. */
  _sources(citations) {
    if (!Array.isArray(citations) || !citations.length) return '';
    const vues = new Map();
    citations.forEach(c => { if (c?.url && !vues.has(c.url)) vues.set(c.url, c.title || c.url); });
    if (!vues.size) return '';
    const hote = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
    return `<div class="chat-sources">${[...vues].slice(0, 6).map(([url, titre]) =>
      `<a href="${esc(url)}" target="_blank" rel="noopener" title="${esc(titre)}">${esc(hote(url))}</a>`).join('')}</div>`;
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
  /** @param texteForce  texte à envoyer (sinon le champ de saisie)
      @param options.confiance  confiance de la reconnaissance vocale (0-1) :
             en dessous de 0,65 le message est marqué [dictée incertaine] et
             Nanika reformule avant d'agir — c'est le filet de sécurité. */
  async envoyer(texteForce = null, options = {}) {
    if (this._occupe) return;
    const input = document.getElementById('chatInput');
    const texte = String(texteForce ?? input.value).trim();
    if (!texte) return;

    input.value = '';
    input.style.height = 'auto';
    this._occupe = true;
    document.getElementById('chatEnvoyer').disabled = true;

    const incertain = typeof options.confiance === 'number' && options.confiance < 0.65
                      && texte.split(/\s+/).length >= 3;
    const texteModele = incertain ? `[dictée incertaine] ${texte}` : texte;

    try {
      if (!this.conversationId) {
        const c = await DataStore.addConversation(texte.slice(0, 60));
        this.conversationId = c.id;
      }

      this._messages.push({ role: 'user', content: [{ type: 'text', text: texteModele }] });
      await DataStore.addMessage(this.conversationId, 'user', [{ type: 'text', text: texteModele }]);
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
      const dernier = [...this._messages].reverse().find(m => m.role === 'assistant');
      const txt = (dernier?.content || []).filter(b => b.type === 'text').map(b => b.text).join(' ');
      if (this._vocal) {
        this._occupe = false;
        const b0 = document.getElementById('chatEnvoyer');
        if (b0) b0.disabled = false;
        this._peindre();
        await this._apresReponse(txt || "C'est fait.");
        this._parle = false;
        return;
      }
      if (this._voix || this._parle) this._lire(txt);
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
      console.error('[Nanika]', err);
      this._occupe = false;
      const b = document.getElementById('chatEnvoyer');
      if (b) b.disabled = false;
      if (this._vocal) await this._apresReponse('', err.message);
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
