/* ─────────────────────────────────────────────────────────────────────────────
   IDEAFORMA — Extension du DataStore : la partie « assistant du quotidien »
   Étiquettes, listes, tâches, agenda, pense-bête, coffre, rappels, IA.

   Ce fichier ajoute des méthodes à l'objet DataStore de js/data.js ; il doit
   donc être chargé APRÈS lui.
───────────────────────────────────────────────────────────────────────────── */

Object.assign(DataStore, {

  /** PostgREST utilise la virgule et les parenthèses comme séparateurs de
      filtres : une recherche « facture, EDF » produirait une requête invalide. */
  _nettoyerRecherche(t) {
    return String(t || '').replace(/[,().*%\\]/g, ' ').trim();
  },

  /* ══════════════════════════════════════════════
     ÉTIQUETTES
  ══════════════════════════════════════════════ */
  _etiquettesCache: null,

  async getEtiquettes(force = false) {
    if (this._etiquettesCache && !force) return this._etiquettesCache;
    const uid = await this._uid();
    const { data, error } = await supa
      .from('etiquettes').select('*')
      .eq('user_id', uid)
      .order('ordre', { ascending: true });
    if (error) this._handleError(error, 'getEtiquettes');
    this._etiquettesCache = data || [];
    return this._etiquettesCache;
  },

  async addEtiquette(d) {
    const uid = await this._uid();
    const { data, error } = await supa.from('etiquettes').insert({
      user_id: uid,
      nom:     d.nom,
      couleur: d.couleur || '#3B82F6',
      icone:   d.icone   || 'etiquette',
      ordre:   d.ordre   ?? 99
    }).select().single();
    if (error) this._handleError(error, 'addEtiquette');
    this._etiquettesCache = null;
    return data;
  },

  async updateEtiquette(id, d) {
    const uid = await this._uid();
    const { error } = await supa.from('etiquettes')
      .update({ nom: d.nom, couleur: d.couleur, icone: d.icone })
      .eq('id', id).eq('user_id', uid);
    if (error) this._handleError(error, 'updateEtiquette');
    this._etiquettesCache = null;
  },

  async deleteEtiquette(id) {
    const uid = await this._uid();
    const { error } = await supa.from('etiquettes').delete().eq('id', id).eq('user_id', uid);
    if (error) this._handleError(error, 'deleteEtiquette');
    this._etiquettesCache = null;
  },

  /* ══════════════════════════════════════════════
     LISTES
  ══════════════════════════════════════════════ */
  async getListes(inclureArchivees = false) {
    const uid = await this._uid();
    let q = supa.from('listes').select('*').eq('user_id', uid).order('ordre');
    if (!inclureArchivees) q = q.eq('archivee', false);
    const { data, error } = await q;
    if (error) this._handleError(error, 'getListes');
    return data || [];
  },

  async addListe(d) {
    const uid = await this._uid();
    const { data, error } = await supa.from('listes').insert({
      user_id: uid,
      nom:     d.nom,
      couleur: d.couleur || '#3B82F6',
      icone:   d.icone   || 'liste',
      ordre:   d.ordre   ?? 50
    }).select().single();
    if (error) this._handleError(error, 'addListe');
    return data;
  },

  async updateListe(id, d) {
    const uid = await this._uid();
    const patch = {};
    ['nom', 'couleur', 'icone', 'ordre', 'archivee'].forEach(k => {
      if (d[k] !== undefined) patch[k] = d[k];
    });
    const { error } = await supa.from('listes').update(patch).eq('id', id).eq('user_id', uid);
    if (error) this._handleError(error, 'updateListe');
  },

  async deleteListe(id) {
    const uid = await this._uid();
    // Les tâches ne sont pas supprimées : elles retombent dans « sans liste »
    const { error } = await supa.from('listes').delete().eq('id', id).eq('user_id', uid);
    if (error) this._handleError(error, 'deleteListe');
  },

  /** Enregistre l'ordre manuel des listes (glisser-déposer de la mosaïque).
      ids : tableau d'identifiants dans le nouvel ordre. */
  async reordonnerListes(ids) {
    const uid = await this._uid();
    for (let i = 0; i < ids.length; i++) {
      const { error } = await supa.from('listes')
        .update({ ordre: i }).eq('id', ids[i]).eq('user_id', uid);
      if (error) this._handleError(error, 'reordonnerListes');
    }
  },

  /** Horodate l'ouverture d'une liste : c'est ce qui ordonne le carrousel du
      tableau de bord. Silencieux si la migration v12 n'est pas encore jouée. */
  async toucherListe(id) {
    try {
      const uid = await this._uid();
      await supa.from('listes')
        .update({ utilisee_le: new Date().toISOString() })
        .eq('id', id).eq('user_id', uid);
    } catch { /* sans gravité : le tri retombe sur l'ordre manuel */ }
  },

  /* ══════════════════════════════════════════════
     TÂCHES (table « taches » étendue par la migration v8)
  ══════════════════════════════════════════════ */

  /** filtres : { listeId, etiquetteId, fait, horizonJours, dossierId, recherche } */
  async getTachesFiltrees(f = {}) {
    const uid = await this._uid();
    let q = supa.from('taches')
      .select('*, listes(nom,couleur,icone), etiquettes(nom,couleur,icone)')
      .eq('user_id', uid);

    if (f.listeId)     q = q.eq('liste_id', f.listeId);
    if (f.sansListe)   q = q.is('liste_id', null);
    if (f.etiquetteId) q = q.eq('etiquette_id', f.etiquetteId);
    if (f.dossierId)   q = q.eq('dossier_id', f.dossierId);
    if (f.fait !== undefined && f.fait !== null) q = q.eq('fait', f.fait);
    // Les tâches abandonnées restent en base mais sortent des listes,
    // sauf demande explicite : c'est le « ~ » du bullet journal.
    if (!f.inclureAbandonnees) q = q.eq('abandonnee', false);
    if (f.recherche)   q = q.ilike('description', `%${this._nettoyerRecherche(f.recherche)}%`);
    if (f.horizonJours != null) {
      const limite = Dates.iso(new Date(Date.now() + f.horizonJours * 86400000));
      q = q.lte('echeance', limite);
    }

    const { data, error } = await q
      .order('fait',     { ascending: true })
      .order('echeance', { ascending: true, nullsFirst: false })
      .order('ordre',    { ascending: true })
      .limit(500);

    if (error) this._handleError(error, 'getTachesFiltrees');
    return data || [];
  },

  async addTacheComplete(d) {
    const uid = await this._uid();
    const { data, error } = await supa.from('taches').insert({
      user_id:        uid,
      description:    d.description,
      notes:          d.notes        || null,
      liste_id:       d.listeId      || null,
      etiquette_id:   d.etiquetteId  || null,
      dossier_id:     d.dossierId    || null,
      priorite:       d.priorite     || 'normale',
      echeance:       d.echeance     || null,
      heure:          d.heure        || null,
      rappel_minutes: d.rappelMinutes ?? null,
      rappel_minutes_2: d.rappelMinutes2 ?? null,
      ordre:          d.ordre        ?? 0,
      fait:           false
    }).select().single();
    if (error) this._handleError(error, 'addTacheComplete');
    return data;
  },

  async updateTache(id, d) {
    const uid = await this._uid();
    const patch = {};
    const champs = {
      description: 'description', notes: 'notes', priorite: 'priorite',
      echeance: 'echeance', heure: 'heure', ordre: 'ordre', fait: 'fait',
      listeId: 'liste_id', etiquetteId: 'etiquette_id',
      dossierId: 'dossier_id', rappelMinutes: 'rappel_minutes',
      rappelMinutes2: 'rappel_minutes_2'
    };
    Object.entries(champs).forEach(([js, col]) => {
      if (d[js] !== undefined) patch[col] = d[js] === '' ? null : d[js];
    });
    const { data, error } = await supa.from('taches')
      .update(patch).eq('id', id).eq('user_id', uid).select().single();
    if (error) this._handleError(error, 'updateTache');
    return data;
  },

  async getTache(id) {
    const { data, error } = await supa.from('taches')
      .select('*, listes(nom,couleur,icone), etiquettes(nom,couleur,icone)')
      .eq('id', id).single();
    if (error) this._handleError(error, 'getTache');
    return data;
  },

  async setTacheFait(id, fait) {
    return this.updateTache(id, { fait });
  },

  /* ══════════════════════════════════════════════
     AGENDA
  ══════════════════════════════════════════════ */

  /** Tout ce qui a une date entre deux bornes (ISO) : RDV, sessions,
      tâches datées, échéances OPCO. */
  async getAgenda(debutISO, finISO, { types = null } = {}) {
    let q = supa.from('v_agenda').select('*')
      .gte('debut', debutISO)
      .lt('debut',  finISO)
      .order('debut', { ascending: true });
    if (types?.length) q = q.in('type', types);
    const { data, error } = await q;
    if (error) this._handleError(error, 'getAgenda');
    return data || [];
  },

  async getEvenements(debutISO, finISO) {
    const uid = await this._uid();
    const { data, error } = await supa.from('evenements')
      .select('*, etiquettes(nom,couleur,icone)')
      .eq('user_id', uid).eq('annule', false)
      .gte('debut', debutISO).lt('debut', finISO)
      .order('debut');
    if (error) this._handleError(error, 'getEvenements');
    return data || [];
  },

  /** Tous les rendez-vous répétitifs, quelle que soit leur date de création :
      un hebdomadaire créé il y a deux ans doit continuer de s'afficher. */
  async getEvenementsRecurrents() {
    const uid = await this._uid();
    const { data, error } = await supa.from('evenements')
      .select('*, etiquettes(nom,couleur,icone)')
      .eq('user_id', uid).eq('annule', false)
      .neq('recurrence', 'aucune')
      .order('debut');
    if (error) this._handleError(error, 'getEvenementsRecurrents');
    return data || [];
  },

  async getEvenement(id) {
    const { data, error } = await supa.from('evenements')
      .select('*').eq('id', id).single();
    if (error) this._handleError(error, 'getEvenement');
    return data;
  },

  async addEvenement(d) {
    const uid = await this._uid();
    const { data, error } = await supa.from('evenements').insert({
      user_id:         uid,
      titre:           d.titre,
      description:     d.description || null,
      lieu:            d.lieu        || null,
      debut:           d.debut,
      fin:             d.fin         || null,
      journee_entiere: !!d.journeeEntiere,
      etiquette_id:    d.etiquetteId || null,
      dossier_id:      d.dossierId   || null,
      couleur:         d.couleur     || null,
      rappels:         Array.isArray(d.rappels) ? d.rappels : [15],
      recurrence:      d.recurrence  || 'aucune'
    }).select().single();
    if (error) this._handleError(error, 'addEvenement');
    return data;
  },

  async updateEvenement(id, d) {
    const uid = await this._uid();
    const patch = {};
    const champs = {
      titre: 'titre', description: 'description', lieu: 'lieu',
      debut: 'debut', fin: 'fin', couleur: 'couleur',
      journeeEntiere: 'journee_entiere', etiquetteId: 'etiquette_id',
      dossierId: 'dossier_id', rappels: 'rappels',
      recurrence: 'recurrence', annule: 'annule'
    };
    Object.entries(champs).forEach(([js, col]) => {
      if (d[js] !== undefined) patch[col] = d[js] === '' ? null : d[js];
    });
    const { data, error } = await supa.from('evenements')
      .update(patch).eq('id', id).eq('user_id', uid).select().single();
    if (error) this._handleError(error, 'updateEvenement');
    return data;
  },

  async deleteEvenement(id) {
    const uid = await this._uid();
    const { error } = await supa.from('evenements').delete().eq('id', id).eq('user_id', uid);
    if (error) this._handleError(error, 'deleteEvenement');
  },

  /** Développe une récurrence sur une fenêtre — la base ne stocke que
      l'occurrence d'origine, on la répète à l'affichage. */
  developperRecurrence(ev, debutFenetre, finFenetre) {
    if (!ev.recurrence || ev.recurrence === 'aucune') return [ev];

    const pas = {
      quotidien:    d => d.setDate(d.getDate() + 1),
      hebdomadaire: d => d.setDate(d.getDate() + 7),
      // setMonth déborde (31 janvier + 1 mois = 3 mars) : on retombe sur le
      // dernier jour du mois quand la date n'existe pas.
      mensuel: d => {
        const jour = d.getDate();
        d.setDate(1);
        d.setMonth(d.getMonth() + 1);
        d.setDate(Math.min(jour, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
      },
      annuel:       d => d.setFullYear(d.getFullYear() + 1)
    }[ev.recurrence];
    if (!pas) return [ev];

    const duree   = ev.fin ? new Date(ev.fin) - new Date(ev.debut) : 3600000;
    const origine = new Date(ev.debut);
    const debut   = new Date(debutFenetre);
    const fin     = new Date(finFenetre);
    const out     = [];
    const curseur = new Date(origine);
    let garde = 0;

    // La ligne d'origine est déjà servie par v_agenda : on ne republie que les
    // répétitions, sans quoi le rendez-vous apparaîtrait deux fois à sa date
    // de création. Garde-fou large (10 ans de quotidien) pour ne pas perdre
    // une récurrence ancienne.
    while (curseur < fin && garde++ < 4000) {
      if (curseur > origine && curseur >= debut) {
        out.push({
          ...ev,
          id:      `${ev.id}__${Dates.iso(curseur)}`,
          _baseId: ev.id,
          debut:   new Date(curseur).toISOString(),
          fin:     new Date(curseur.getTime() + duree).toISOString(),
          _occurrence: true
        });
      }
      pas(curseur);
    }
    return out;
  },

  /* ══════════════════════════════════════════════
     BULLET JOURNAL
     Le « rapid logging » : une entrée = un symbole.
       >  migrée            ~  abandonnée
  ══════════════════════════════════════════════ */

  /** Toutes les entrées de carnet entre deux dates (AAAA-MM-JJ inclus) */
  async getJournal(du, au) {
    const { data, error } = await supa.from('v_journal_jour')
      .select('*')
      .gte('jour', du).lte('jour', au)
      .order('jour', { ascending: true })
      .order('heure', { ascending: true, nullsFirst: false })
      .limit(1000);
    if (error) this._handleError(error, 'getJournal');
    return data || [];
  },

  /** Symbole de rapid logging d'une entrée */

  /** Repousse une tâche : incrémente le compteur de migrations et conserve
      l'échéance d'origine. Le calcul est fait en base, en une seule requête. */
  async migrerTache(id, nouvelleDate) {
    const { data, error } = await supa.rpc('fn_migrer_tache', {
      p_tache: id,
      p_nouvelle_date: nouvelleDate
    });
    if (error) this._handleError(error, 'migrerTache');
    return data;
  },

  async abandonnerTache(id, abandonnee = true) {
    const uid = await this._uid();
    const { error } = await supa.from('taches')
      .update({ abandonnee }).eq('id', id).eq('user_id', uid);
    if (error) this._handleError(error, 'abandonnerTache');
  },

  /* ══════════════════════════════════════════════
     PENSE-BÊTE
  ══════════════════════════════════════════════ */
  async getNotes({ archivees = false, etiquetteId = null, recherche = '' } = {}) {
    const uid = await this._uid();
    let q = supa.from('notes')
      .select('*, etiquettes(nom,couleur,icone)')
      .eq('user_id', uid).eq('archivee', archivees);
    if (etiquetteId) q = q.eq('etiquette_id', etiquetteId);
    const rq = this._nettoyerRecherche(recherche);
    if (rq)          q = q.or(`titre.ilike.%${rq}%,contenu.ilike.%${rq}%`);
    const { data, error } = await q
      .order('epinglee',  { ascending: false })
      .order('modifie_le', { ascending: false })
      .limit(300);
    if (error) this._handleError(error, 'getNotes');
    return data || [];
  },

  async getNote(id) {
    const { data, error } = await supa.from('notes')
      .select('*, etiquettes(nom,couleur,icone)').eq('id', id).single();
    if (error) this._handleError(error, 'getNote');
    return data;
  },

  async addNote(d) {
    const uid = await this._uid();
    const { data, error } = await supa.from('notes').insert({
      user_id:      uid,
      titre:        d.titre   || null,
      contenu:      d.contenu || '',
      couleur:      d.couleur || '#FEF3C7',
      epinglee:     !!d.epinglee,
      etiquette_id: d.etiquetteId || null,
      date_jour:    d.dateJour || null
    }).select().single();
    if (error) this._handleError(error, 'addNote');
    return data;
  },

  async updateNote(id, d) {
    const uid = await this._uid();
    const patch = {};
    const champs = {
      titre: 'titre', contenu: 'contenu', couleur: 'couleur',
      epinglee: 'epinglee', archivee: 'archivee', etiquetteId: 'etiquette_id',
      dateJour: 'date_jour'
    };
    Object.entries(champs).forEach(([js, col]) => {
      if (d[js] !== undefined) patch[col] = d[js];
    });
    const { error } = await supa.from('notes').update(patch).eq('id', id).eq('user_id', uid);
    if (error) this._handleError(error, 'updateNote');
  },

  async deleteNote(id) {
    const uid = await this._uid();
    const { error } = await supa.from('notes').delete().eq('id', id).eq('user_id', uid);
    if (error) this._handleError(error, 'deleteNote');
  },

  /* ══════════════════════════════════════════════
     COFFRE À DOCUMENTS
     Chemin imposé par les policies Storage : <user_id>/coffre/<fichier>
  ══════════════════════════════════════════════ */
  /* Les catégories vivent en base depuis la v9 : l'utilisateur les crée et les
     renomme lui-même. Ce tableau ne sert plus que de secours si la migration
     n'a pas encore été jouée. */
  CATEGORIES_SECOURS: [
    { code: 'autre', nom: 'Autre', icone: 'document', couleur: '#6E6E6E', ordre: 99 }
  ],

  _categoriesCache: null,

  async getCoffreCategories(force = false) {
    if (this._categoriesCache && !force) return this._categoriesCache;
    const uid = await this._uid();
    const { data, error } = await supa.from('coffre_categories')
      .select('*').eq('user_id', uid).order('ordre');
    if (error) {
      console.warn('[DataStore] catégories du coffre indisponibles', error);
      return this.CATEGORIES_SECOURS;
    }
    this._categoriesCache = data?.length ? data : this.CATEGORIES_SECOURS;
    return this._categoriesCache;
  },

  async addCoffreCategorie(d) {
    const uid  = await this._uid();
    // Le code est dérivé du nom : sans accent, sans espace, unique
    const base = (d.code || d.nom).normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'categorie';
    const prises = (await this.getCoffreCategories(true)).map(c => c.code);
    let code = base, n = 2;
    while (prises.includes(code)) code = `${base}_${n++}`;

    const { data, error } = await supa.from('coffre_categories').insert({
      user_id: uid, code,
      nom:     d.nom,
      icone:   d.icone   || 'document',
      couleur: d.couleur || '#64748B',
      ordre:   d.ordre   ?? 50
    }).select().single();
    if (error) this._handleError(error, 'addCoffreCategorie');
    this._categoriesCache = null;
    return data;
  },

  async updateCoffreCategorie(id, d) {
    const uid = await this._uid();
    const patch = {};
    ['nom', 'icone', 'couleur', 'ordre'].forEach(k => {
      if (d[k] !== undefined) patch[k] = d[k];
    });
    const { error } = await supa.from('coffre_categories')
      .update(patch).eq('id', id).eq('user_id', uid);
    if (error) this._handleError(error, 'updateCoffreCategorie');
    this._categoriesCache = null;
  },

  /** Les documents de la catégorie supprimée retombent sur « Autre » :
      c'est un trigger côté base qui s'en charge. */
  async deleteCoffreCategorie(id) {
    const uid = await this._uid();
    const { error } = await supa.from('coffre_categories')
      .delete().eq('id', id).eq('user_id', uid);
    if (error) this._handleError(error, 'deleteCoffreCategorie');
    this._categoriesCache = null;
  },

  async getCoffre({ categorie = null, etiquetteId = null, recherche = '' } = {}) {
    const uid = await this._uid();
    let q = supa.from('coffre')
      .select('*, etiquettes(nom,couleur,icone)')
      .eq('user_id', uid);
    if (categorie)   q = q.eq('categorie', categorie);
    if (etiquetteId) q = q.eq('etiquette_id', etiquetteId);
    const rq = this._nettoyerRecherche(recherche);
    if (rq)          q = q.or(`titre.ilike.%${rq}%,description.ilike.%${rq}%`);
    const { data, error } = await q
      .order('favori', { ascending: false })
      .order('cree_le', { ascending: false })
      .limit(500);
    if (error) this._handleError(error, 'getCoffre');
    return data || [];
  },

  async uploadCoffre(file, meta = {}) {
    const uid  = await this._uid();
    const safe = file.name.normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${uid}/coffre/${Date.now()}_${safe}`;

    const { error: upErr } = await supa.storage
      .from(this.BUCKET)
      .upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (upErr) this._handleError(upErr, 'uploadCoffre');

    const { data, error } = await supa.from('coffre').insert({
      user_id:         uid,
      titre:           meta.titre || file.name,
      description:     meta.description || null,
      categorie:       meta.categorie   || 'autre',
      etiquette_id:    meta.etiquetteId || null,
      storage_path:    path,
      nom_fichier:     file.name,
      mime:            file.type || null,
      taille:          file.size,
      date_document:   meta.dateDocument   || null,
      date_expiration: meta.dateExpiration || null,
      favori:          !!meta.favori
    }).select().single();

    if (error) {
      // On ne laisse pas de fichier orphelin dans le bucket
      await supa.storage.from(this.BUCKET).remove([path]);
      this._handleError(error, 'uploadCoffre.link');
    }
    return data;
  },

  async updateCoffre(id, d) {
    const uid = await this._uid();
    const patch = {};
    const champs = {
      titre: 'titre', description: 'description', categorie: 'categorie',
      etiquetteId: 'etiquette_id', dateDocument: 'date_document',
      dateExpiration: 'date_expiration', favori: 'favori'
    };
    Object.entries(champs).forEach(([js, col]) => {
      if (d[js] !== undefined) patch[col] = d[js] === '' ? null : d[js];
    });
    const { error } = await supa.from('coffre').update(patch).eq('id', id).eq('user_id', uid);
    if (error) this._handleError(error, 'updateCoffre');
  },

  async deleteCoffre(id) {
    const uid = await this._uid();
    const { data: doc } = await supa.from('coffre')
      .select('storage_path').eq('id', id).eq('user_id', uid).single();
    if (doc?.storage_path) {
      await supa.storage.from(this.BUCKET).remove([doc.storage_path]);
    }
    const { error } = await supa.from('coffre').delete().eq('id', id).eq('user_id', uid);
    if (error) this._handleError(error, 'deleteCoffre');
  },

  /** Documents dont la validité expire bientôt (carte d'identité, assurance…) */
  async getCoffreExpirations(joursHorizon = 60) {
    const uid    = await this._uid();
    const limite = Dates.iso(new Date(Date.now() + joursHorizon * 86400000));
    const { data, error } = await supa.from('coffre')
      .select('id,titre,categorie,date_expiration')
      .eq('user_id', uid)
      .not('date_expiration', 'is', null)
      .lte('date_expiration', limite)
      .order('date_expiration');
    if (error) this._handleError(error, 'getCoffreExpirations');
    return data || [];
  },

  /* ══════════════════════════════════════════════
     RAPPELS ET ABONNEMENTS PUSH
  ══════════════════════════════════════════════ */
  async getRappelsAVenir(limite = 30) {
    const uid = await this._uid();
    const { data, error } = await supa.from('rappels')
      .select('*').eq('user_id', uid).eq('statut', 'en_attente')
      .order('envoyer_a').limit(limite);
    if (error) this._handleError(error, 'getRappelsAVenir');
    return data || [];
  },

  /** Les derniers rappels, tous statuts confondus : c'est là qu'on voit si le
      serveur les a envoyés, ou pourquoi il n'a pas pu. */
  async getRappelsRecents(limite = 8) {
    const uid = await this._uid();
    const { data, error } = await supa.from('rappels')
      .select('id,titre,envoyer_a,statut,envoye_le,erreur,tentatives')
      .eq('user_id', uid).neq('statut', 'en_attente')
      .order('envoyer_a', { ascending: false }).limit(limite);
    if (error) this._handleError(error, 'getRappelsRecents');
    return data || [];
  },

  async addRappelManuel(titre, corps, quandISO) {
    const uid = await this._uid();
    const { data, error } = await supa.from('rappels').insert({
      user_id: uid, source_type: 'manuel', source_id: null,
      titre, corps: corps || null, envoyer_a: quandISO
    }).select().single();
    if (error) this._handleError(error, 'addRappelManuel');
    return data;
  },

  async getPushSubscriptions() {
    const uid = await this._uid();
    const { data, error } = await supa.from('push_subscriptions')
      .select('*').eq('user_id', uid).order('cree_le', { ascending: false });
    if (error) this._handleError(error, 'getPushSubscriptions');
    return data || [];
  },

  async savePushSubscription(sub, appareil) {
    const uid  = await this._uid();
    const json = sub.toJSON ? sub.toJSON() : sub;
    const { data, error } = await supa.from('push_subscriptions').upsert({
      user_id:  uid,
      endpoint: json.endpoint,
      p256dh:   json.keys.p256dh,
      auth:     json.keys.auth,
      appareil: appareil || navigator.userAgent.slice(0, 120),
      actif:    true
    }, { onConflict: 'endpoint' }).select().single();
    if (error) this._handleError(error, 'savePushSubscription');
    return data;
  },

  async deletePushSubscription(endpoint) {
    const uid = await this._uid();
    const { error } = await supa.from('push_subscriptions')
      .delete().eq('endpoint', endpoint).eq('user_id', uid);
    if (error) this._handleError(error, 'deletePushSubscription');
  },

  /* ══════════════════════════════════════════════
     CONVERSATIONS AVEC L'ASSISTANT
  ══════════════════════════════════════════════ */
  async getConversations(limite = 30) {
    const uid = await this._uid();
    const { data, error } = await supa.from('ia_conversations')
      .select('*').eq('user_id', uid)
      .order('modifie_le', { ascending: false }).limit(limite);
    if (error) this._handleError(error, 'getConversations');
    return data || [];
  },

  async addConversation(titre = 'Nouvelle discussion') {
    const uid = await this._uid();
    const { data, error } = await supa.from('ia_conversations')
      .insert({ user_id: uid, titre }).select().single();
    if (error) this._handleError(error, 'addConversation');
    return data;
  },

  async renameConversation(id, titre) {
    const uid = await this._uid();
    await supa.from('ia_conversations').update({ titre }).eq('id', id).eq('user_id', uid);
  },

  async deleteConversation(id) {
    const uid = await this._uid();
    const { error } = await supa.from('ia_conversations')
      .delete().eq('id', id).eq('user_id', uid);
    if (error) this._handleError(error, 'deleteConversation');
  },

  async getMessages(conversationId) {
    const { data, error } = await supa.from('ia_messages')
      .select('*').eq('conversation_id', conversationId)
      .order('cree_le').limit(200);
    if (error) this._handleError(error, 'getMessages');
    return data || [];
  },

  async addMessage(conversationId, role, contenu) {
    const uid = await this._uid();
    const { data, error } = await supa.from('ia_messages').insert({
      user_id: uid, conversation_id: conversationId, role, contenu
    }).select().single();
    if (error) this._handleError(error, 'addMessage');
    // remonte la conversation en tête de liste
    await supa.from('ia_conversations')
      .update({ modifie_le: new Date().toISOString() })
      .eq('id', conversationId).eq('user_id', uid);
    return data;
  },

  /* ══════════════════════════════════════════════
     PRÉFÉRENCES D'AFFICHAGE  (profiles.preferences)
     Couleur de chaque post-it du tableau de bord, réglages de l'assistant…
     Portées par le compte : les mêmes réglages sur l'iPhone et l'ordinateur.
  ══════════════════════════════════════════════ */

  /* Cache mémoire : le tableau de bord lit les préférences à chaque
     repeinture, on ne veut pas un aller-retour réseau à chaque fois. */
  _prefs: null,

  async getPreferences(forcer = false) {
    if (this._prefs && !forcer) return this._prefs;
    const uid = await this._uid();
    const { data, error } = await supa
      .from('profiles').select('preferences').eq('id', uid).maybeSingle();
    // Colonne absente (migration v10 pas encore jouée) : on n'empêche pas
    // l'application de fonctionner, on part sur des valeurs par défaut.
    if (error) { this._prefs = {}; return this._prefs; }
    this._prefs = (data && data.preferences) || {};
    return this._prefs;
  },

  /** setPreference('blocs.taches', '#D9EEE1') — chemin en pointillé. */
  async setPreference(chemin, valeur) {
    const uid    = await this._uid();
    const prefs  = JSON.parse(JSON.stringify(await this.getPreferences()));
    const bouts  = String(chemin).split('.');
    let noeud    = prefs;
    for (let i = 0; i < bouts.length - 1; i++) {
      if (typeof noeud[bouts[i]] !== 'object' || noeud[bouts[i]] === null) noeud[bouts[i]] = {};
      noeud = noeud[bouts[i]];
    }
    if (valeur === null || valeur === undefined) delete noeud[bouts[bouts.length - 1]];
    else noeud[bouts[bouts.length - 1]] = valeur;

    // Optimiste : l'interface se repeint tout de suite, on écrit derrière.
    this._prefs = prefs;
    const { error } = await supa.from('profiles')
      .update({ preferences: prefs }).eq('id', uid);
    if (error) this._handleError(error, 'Enregistrement des préférences');
    return prefs;
  },

  /* ══════════════════════════════════════════════
     RÉSUMÉ POUR LE TABLEAU DE BORD ET POUR L'IA
  ══════════════════════════════════════════════ */
  /** Tout ce qu'affiche le tableau de bord, en une seule passe.

      Attention : le tableau de bord est PERSONNEL : les échéances de dossiers OPCO en
      sont volontairement absentes. Elles restent sur « Ma journée ». Ne pas
      les réintroduire ici sans une demande explicite. */
  async getResumeJour() {
    const debutJour = new Date(); debutJour.setHours(0, 0, 0, 0);
    const finJour   = new Date(debutJour.getTime() + 86400000);
    const fin7      = new Date(debutJour.getTime() + 7 * 86400000);

    const [agenda, taches, notes, expirations] = await Promise.all([
      this.getAgenda(debutJour.toISOString(), fin7.toISOString(),
                     { types: ['evenement', 'session'] }),
      this.getTachesFiltrees({ fait: false }),
      this.getNotes({ archivees: false }),
      this.getCoffreExpirations(60).catch(() => [])
    ]);

    const auj    = agenda.filter(a => new Date(a.debut) < finJour);
    const hui    = Dates.aujourdhui();
    const retard = taches.filter(t => t.echeance && t.echeance < hui);
    const dujour = taches.filter(t => t.echeance === hui);

    return {
      agendaAujourdhui: auj,
      agendaSemaine:    agenda,
      taches, tachesEnRetard: retard, tachesDuJour: dujour,
      notesEpinglees:   notes.filter(n => n.epinglee),
      notes,
      expirations
    };
  }
});


/* ─────────────────────────────────────────────────────────────────────────────
   Helpers de date et de format partagés par toutes les nouvelles pages
───────────────────────────────────────────────────────────────────────────── */
const Dates = {
  /* ⚠ Deux conventions différentes, volontairement :
     JOURS suit getDay() (dimanche = 0), JOURS_COURT suit l'affichage
     du calendrier (semaine commençant le lundi). */
  JOURS: ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'],
  JOURS_COURT: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'],
  MOIS: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
         'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],

  /** '2026-08-19' pour une Date locale (jamais toISOString : décalage UTC) */
  iso(d) {
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  },

  aujourdhui() { return this.iso(new Date()); },

  heure(d) {
    const x = d instanceof Date ? d : new Date(d);
    return x.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  },

  /** « lundi 19 août » */
  longue(d) {
    const x = d instanceof Date ? d : new Date(d + (String(d).length === 10 ? 'T12:00:00' : ''));
    return x.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  },

  courte(d) {
    const x = d instanceof Date ? d : new Date(d + (String(d).length === 10 ? 'T12:00:00' : ''));
    return x.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  },

  /** « aujourd'hui », « demain », « dans 3 j », « il y a 2 j » */
  relative(dateStr) {
    if (!dateStr) return '';
    const j0 = new Date(); j0.setHours(0, 0, 0, 0);
    const d  = new Date(String(dateStr).length === 10 ? dateStr + 'T12:00:00' : dateStr);
    d.setHours(0, 0, 0, 0);
    const j = Math.round((d - j0) / 86400000);
    if (j === 0)  return "aujourd'hui";
    if (j === 1)  return 'demain';
    if (j === -1) return 'hier';
    if (j > 1  && j <= 7)  return `dans ${j} j`;
    if (j < -1 && j >= -7) return `il y a ${-j} j`;
    return this.courte(d);
  },

  /** Le lundi de la semaine contenant d */
  lundi(d) {
    const x = new Date(d);
    const decalage = (x.getDay() + 6) % 7;
    x.setDate(x.getDate() - decalage);
    x.setHours(0, 0, 0, 0);
    return x;
  },

  /** Combine '2026-08-19' + '14:30' en Date locale */
  combiner(dateStr, heureStr) {
    return new Date(`${dateStr}T${(heureStr || '09:00')}:00`);
  }
};


/* Après une repeinture complète de la page, le champ de recherche a été
   détruit et recréé : on lui rend le focus et on replace le curseur en fin
   de saisie, sinon taper une recherche est impossible. */
function rendreFocus(id) {
  const i = document.getElementById(id);
  if (!i || document.activeElement === i) return;
  i.focus();
  try { i.setSelectionRange(i.value.length, i.value.length); } catch { /* type non compatible */ }
}


/* Encart d'erreur commun : sans lui, une table absente ou une session expirée
   laissait la page bloquée sur « Chargement… » sans rien dire. */
function peindreErreur(err) {
  document.getElementById('pageContent').innerHTML = `
    <div class="section-card"><div class="section-card-body">
      <div class="empty-state">
        <div class="empty-icon">${Icone('alerte', { taille: 34 })}</div>
        Impossible de charger cette page.<br>
        <small style="color:var(--text-muted)">${esc(err?.message || err)}</small><br><br>
        <small>Si le message évoque une table ou une vue absente, la migration
        <strong>setup_update8.sql</strong> n'a pas encore été jouée dans Supabase.</small>
      </div>
    </div></div>`;
}

/* Convertit un « #RRGGBB » en rgba(...) — pour les fonds translucides */
function teinte(hex, alpha = 0.12) {
  if (!hex || hex[0] !== '#') return `rgba(59,130,246,${alpha})`;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/* Puce d'étiquette réutilisée partout */
function pucePastille(etiquette) {
  if (!etiquette) return '';
  /* Le texte reste en encre du thème, jamais dans la couleur de l'étiquette :
     une couleur choisie librement (sombre en thème sombre, claire en thème
     clair) tombait sous 2:1 de contraste. La couleur passe dans la pastille. */
  return `<span class="etiq-chip" style="background:${teinte(etiquette.couleur, 0.18)};">
            ${Icone(etiquette.icone, { taille: 13, couleur: etiquette.couleur, defaut: 'etiquette' })}
            ${esc(etiquette.nom)}
          </span>`;
}
