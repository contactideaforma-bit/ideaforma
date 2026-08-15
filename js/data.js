/* ─── DataStore — Supabase backend v2 ─── */

/* ── Mappers ── */
function _mapClientRow(row) {
  return {
    id:          row.id,
    opco:        row.opco            || '',
    companyName: row.nom_entreprise  || '',
    siret:       row.siret           || '',
    address:     row.adresse         || '',
    phone:       row.tel             || '',
    email:       row.email           || '',
    employees:   row.nb_salaries     ?? '',
    nomGerant:   row.nom_gerant      || '',
    idcc:        row.idcc            || '',
    salaries:    Array.isArray(row.salaries) ? row.salaries : [],
    /* stats calculées à partir des dossiers joints */
    dossiers:    (row.dossiers || []).map(_mapDossierRow),
    createdAt:   row.cree_le
  };
}

function _mapDossierRow(row) {
  return {
    id:              row.id,
    clientId:        row.client_id,
    trainingSubject: row.sujet_formation  || '',
    price:           parseFloat(row.prix) || 0,
    trainingDates:   Array.isArray(row.dates_formation) ? row.dates_formation : [],
    trainees:        Array.isArray(row.salaries)        ? row.salaries        : [],
    status:          row.statut           || 'devis_fait',
    notes:           row.notes            || '',
    objectifs:       row.objectifs        || '',
    contenu:         row.contenu          || '',
    modalite:        row.modalite         || 'presentiel',
    evaluation:      row.evaluation       || '',
    prerequis:       row.prerequis        || '',
    createdAt:       row.cree_le,
    updatedAt:       row.modifie_le
  };
}

const DataStore = {
  OPCOS: ['opco_commerce', 'opco_mobilite', 'akto', 'constructys', 'opco_ep'],

  /* ── Helpers ── */
  async _uid() {
    const { data: { session } } = await supa.auth.getSession();
    if (!session?.user?.id) throw new Error('Non authentifié');
    return session.user.id;
  },

  _handleError(error, context = '') {
    console.error(`[DataStore${context ? ' ' + context : ''}]`, error);
    throw error;
  },

  /* ══════════════════════════════════════════════
     CLIENTS
  ══════════════════════════════════════════════ */

  /** Retourne les clients d'un OPCO avec leurs dossiers */
  async getClients(opco) {
    const uid = await this._uid();
    const { data, error } = await supa
      .from('clients')
      .select(`
        id, opco, nom_entreprise, siret, adresse, tel, email,
        nb_salaries, nom_gerant, idcc, salaries, cree_le,
        dossiers(id, client_id, sujet_formation, prix, dates_formation,
                 salaries, statut, notes, objectifs, contenu, modalite,
                 evaluation, prerequis, cree_le, modifie_le)
      `)
      .eq('user_id', uid)
      .eq('opco', opco)
      .order('nom_entreprise', { ascending: true });

    if (error) this._handleError(error, 'getClients');
    return (data || []).map(_mapClientRow);
  },

  /** Retourne tous les clients (tous OPCOs) avec leurs dossiers */
  async getAllClients() {
    const uid = await this._uid();
    const { data, error } = await supa
      .from('clients')
      .select(`
        id, opco, nom_entreprise, siret, adresse, tel, email,
        nb_salaries, nom_gerant, idcc, salaries, cree_le,
        dossiers(id, client_id, sujet_formation, prix, dates_formation,
                 salaries, statut, notes, objectifs, contenu, modalite,
                 evaluation, prerequis, cree_le, modifie_le)
      `)
      .eq('user_id', uid)
      .order('nom_entreprise', { ascending: true });

    if (error) this._handleError(error, 'getAllClients');
    return (data || []).map(_mapClientRow);
  },

  /** Crée un client (entreprise) sans formation */
  async addClient(opco, d) {
    const uid = await this._uid();
    const { data, error } = await supa
      .from('clients')
      .insert({
        user_id:        uid,
        opco,
        nom_entreprise: d.companyName,
        siret:          d.siret       || null,
        adresse:        d.address     || null,
        tel:            d.phone       || null,
        email:          d.email       || null,
        nb_salaries:    d.employees   ? parseInt(d.employees) : null,
        nom_gerant:     d.nomGerant   || null,
        idcc:           d.idcc        || null,
        salaries:       d.salaries    || []
      })
      .select()
      .single();

    if (error) this._handleError(error, 'addClient');
    return { ..._mapClientRow(data), dossiers: [] };
  },

  /** Met à jour les infos d'un client */
  async updateClient(id, d) {
    const uid = await this._uid();
    const { error } = await supa
      .from('clients')
      .update({
        nom_entreprise: d.companyName,
        siret:          d.siret       || null,
        adresse:        d.address     || null,
        tel:            d.phone       || null,
        email:          d.email       || null,
        nb_salaries:    d.employees   ? parseInt(d.employees) : null,
        nom_gerant:     d.nomGerant   || null,
        idcc:           d.idcc        || null,
        salaries:       d.salaries    || []
      })
      .eq('id', id)
      .eq('user_id', uid);

    if (error) this._handleError(error, 'updateClient');
  },

  /** Supprime un client et ses dossiers */
  async deleteClient(id) {
    const uid = await this._uid();
    // Les dossiers se suppriment en cascade (ON DELETE CASCADE)
    const { error } = await supa
      .from('clients')
      .delete()
      .eq('id', id)
      .eq('user_id', uid);

    if (error) this._handleError(error, 'deleteClient');
  },

  /* ══════════════════════════════════════════════
     DOSSIERS (formations)
  ══════════════════════════════════════════════ */

  /** Crée une formation pour un client */
  async addDossier(clientId, d) {
    const uid = await this._uid();
    const { data, error } = await supa
      .from('dossiers')
      .insert({
        user_id:         uid,
        client_id:       clientId,
        salaries:        d.trainees       || [],
        sujet_formation: d.trainingSubject|| null,
        prix:            parseFloat(d.price) || 0,
        dates_formation: d.trainingDates  || [],
        statut:          d.status         || 'devis_fait',
        notes:           d.notes          || null,
        objectifs:       d.objectifs      || null,
        contenu:         d.contenu        || null,
        modalite:        d.modalite       || 'presentiel',
        evaluation:      d.evaluation     || null,
        prerequis:       d.prerequis      || null
      })
      .select()
      .single();

    if (error) this._handleError(error, 'addDossier');
    return _mapDossierRow(data);
  },

  /** Met à jour une formation */
  async updateDossier(id, d) {
    const uid = await this._uid();
    const { data, error } = await supa
      .from('dossiers')
      .update({
        salaries:        d.trainees       || [],
        sujet_formation: d.trainingSubject|| null,
        prix:            parseFloat(d.price) || 0,
        dates_formation: d.trainingDates  || [],
        statut:          d.status         || 'devis_fait',
        notes:           d.notes          || null,
        objectifs:       d.objectifs      || null,
        contenu:         d.contenu        || null,
        modalite:        d.modalite       || 'presentiel',
        evaluation:      d.evaluation     || null,
        prerequis:       d.prerequis      || null
      })
      .eq('id', id)
      .eq('user_id', uid)
      .select()
      .single();

    if (error) this._handleError(error, 'updateDossier');
    return _mapDossierRow(data);
  },

  /** Met à jour uniquement le statut */
  async updateDossierStatus(id, statut) {
    const uid = await this._uid();
    const { error } = await supa
      .from('dossiers')
      .update({ statut })
      .eq('id', id)
      .eq('user_id', uid);

    if (error) this._handleError(error, 'updateDossierStatus');
  },

  /** Supprime une formation */
  async deleteDossier(id) {
    const uid = await this._uid();
    const { error } = await supa
      .from('dossiers')
      .delete()
      .eq('id', id)
      .eq('user_id', uid);

    if (error) this._handleError(error, 'deleteDossier');
  },

  /* ══════════════════════════════════════════════
     AGRÉGATS (pour dashboard)
  ══════════════════════════════════════════════ */

  /** Tous les dossiers à plat (pour dashboard/calendar) */
  _flatDossiers(allClients) {
    const result = [];
    allClients.forEach(c => {
      (c.dossiers || []).forEach(d => {
        result.push({ ...d, opco: c.opco, companyName: c.companyName });
      });
    });
    return result;
  },

  computeFormationDates(allClients) {
    const result = [];
    this._flatDossiers(allClients).forEach(d => {
      (d.trainingDates || []).forEach(dt => {
        if (dt.start) result.push({
          ...dt,
          opco:        d.opco,
          companyName: d.companyName,
          subject:     d.trainingSubject,
          dossierId:   d.id
        });
      });
    });
    return result;
  },

  computeUpcoming(allClients, days = 14) {
    const now   = new Date();
    const limit = new Date(now.getTime() + days * 86400000);
    return this.computeFormationDates(allClients)
      .filter(d => {
        const start = new Date(d.start + 'T00:00:00');
        return start >= now && start <= limit;
      })
      .sort((a, b) => new Date(a.start) - new Date(b.start));
  },

  computeAlerts(allClients) {
    const alerts = [];
    this._flatDossiers(allClients).forEach(d => {
      if (!d.updatedAt) return;
      const ageDays = (new Date() - new Date(d.updatedAt)) / 86400000;
      if (d.status === 'devis_envoye' && ageDays > 7)
        alerts.push({ type:'warning', msg:`Devis sans réponse depuis ${Math.floor(ageDays)}j`, sub: d.companyName });
      if (d.status === 'devis_signe' && ageDays > 5)
        alerts.push({ type:'urgent', msg:`Dossier signé en attente OPCO (${Math.floor(ageDays)}j)`, sub: d.companyName });
    });
    return alerts;
  },

  /* ══════════════════════════════════════════════
     TACHES
  ══════════════════════════════════════════════ */

  async getTaches(dossierId = null) {
    const uid = await this._uid();
    let q = supa
      .from('taches')
      .select('*')
      .eq('user_id', uid)
      .order('fait',     { ascending: true })
      .order('echeance', { ascending: true, nullsFirst: false });

    if (dossierId) q = q.eq('dossier_id', dossierId);
    const { data, error } = await q;
    if (error) this._handleError(error, 'getTaches');
    return data || [];
  },

  async addTache(d) {
    const uid = await this._uid();
    const { data, error } = await supa
      .from('taches')
      .insert({
        user_id:     uid,
        dossier_id:  d.dossierId   || null,
        description: d.description,
        priorite:    d.priorite    || 'normale',
        echeance:    d.echeance    || null,
        fait:        false
      })
      .select()
      .single();

    if (error) this._handleError(error, 'addTache');
    return data;
  },

  async toggleTache(id) {
    const uid = await this._uid();
    const { data: t } = await supa.from('taches').select('fait').eq('id', id).single();
    if (!t) return;
    await supa.from('taches').update({ fait: !t.fait }).eq('id', id).eq('user_id', uid);
  },

  async deleteTache(id) {
    const uid = await this._uid();
    await supa.from('taches').delete().eq('id', id).eq('user_id', uid);
  },

  /* ══════════════════════════════════════════════
     PROFIL
  ══════════════════════════════════════════════ */

  async getProfile() {
    const uid = await this._uid();
    const { data } = await supa.from('profiles').select('*').eq('id', uid).single();
    return data;
  },

  async updateProfile(updates) {
    const uid = await this._uid();
    const patch = {
      nom:                updates.nom               || null,
      organisme:          updates.organisme         || null,
      siret:              updates.siret             || null,
      adresse:            updates.adresse           || null,
      telephone:          updates.telephone         || null,
      numero_da:          updates.numero_da         || null,
      numero_qualiopi:    updates.numero_qualiopi   || null,
      couleur_primaire:   updates.couleur_primaire  || '#1E2D4B',
      couleur_secondaire: updates.couleur_secondaire|| '#3B82F6'
    };
    // Logo seulement si fourni
    if (updates.logo_base64 !== undefined) patch.logo_base64 = updates.logo_base64;

    const { data, error } = await supa
      .from('profiles')
      .update(patch)
      .eq('id', uid)
      .select()
      .single();

    if (error) this._handleError(error, 'updateProfile');
    return data;
  },

  /* ══════════════════════════════════════════════
     NUMÉROTATION SERVEUR (migration v5)
  ══════════════════════════════════════════════ */

  /** Numéro continu et atomique : DEV-2026-0001, FAC-2026-0007… */
  async nextNumero(type) {
    const { data, error } = await supa.rpc('fn_next_numero', { p_type: type });
    if (error) this._handleError(error, 'nextNumero');
    return data;
  },

  /* ══════════════════════════════════════════════
     VUES DE PILOTAGE (migration v5 / v6)
     Les agrégats sont calculés par Postgres, plus dans le navigateur.
  ══════════════════════════════════════════════ */

  /** Dossiers enrichis : dates, stagiaires, pièces, montants, retards */
  async getDossiers360({ opco = null, actifs = false, limit = 500 } = {}) {
    let q = supa.from('v_dossiers_360').select('*').limit(limit);
    if (opco)   q = q.eq('opco_code', opco);
    if (actifs) q = q.neq('statut_facturation', 'payee')
                     .not('statut_commercial', 'in', '("perdu","annule")');

    const { data, error } = await q.order('date_debut', { ascending: true, nullsFirst: false });
    if (error) this._handleError(error, 'getDossiers360');
    return data || [];
  },

  /** Échéances à traiter, déjà triées par criticité puis par date */
  async getActionsDuJour(horizonJours = null) {
    let q = supa.from('v_actions_du_jour').select('*');
    if (horizonJours !== null) {
      const limite = new Date(Date.now() + horizonJours * 86400000)
        .toISOString().split('T')[0];
      q = q.lte('date_echeance', limite);
    }
    const { data, error } = await q;
    if (error) this._handleError(error, 'getActionsDuJour');
    return data || [];
  },

  /** Une ligne par journée de formation, pour le calendrier */
  async getSessionsCalendrier(du, au) {
    let q = supa.from('v_sessions_calendrier').select('*');
    if (du) q = q.gte('date_session', du);
    if (au) q = q.lte('date_session', au);

    const { data, error } = await q.order('date_session', { ascending: true });
    if (error) this._handleError(error, 'getSessionsCalendrier');
    return data || [];
  },

  /** Compte les clients sans rapatrier les lignes */
  async countClients() {
    const uid = await this._uid();
    const { count, error } = await supa
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', uid);
    if (error) this._handleError(error, 'countClients');
    return count || 0;
  },

  /** Marque une échéance comme traitée */
  async faireEcheance(id) {
    const uid = await this._uid();
    const { error } = await supa
      .from('echeances')
      .update({ statut: 'fait', fait_le: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', uid);
    if (error) this._handleError(error, 'faireEcheance');
  },

  /* ══════════════════════════════════════════════
     PIÈCES JUSTIFICATIVES + Supabase Storage
     Arborescence imposée par les policies du bucket :
       documents/<user_id>/<dossier_id>/<fichier>
  ══════════════════════════════════════════════ */

  BUCKET: 'documents',

  async getPieces(dossierId) {
    const { data, error } = await supa
      .from('pieces')
      .select('*')
      .eq('dossier_id', dossierId)
      .order('obligatoire', { ascending: false })
      .order('libelle',     { ascending: true });
    if (error) this._handleError(error, 'getPieces');
    return data || [];
  },

  /** Téléverse un fichier et rattache la pièce au dossier */
  async uploadPiece(dossierId, pieceId, file, { source = 'externe', statut = 'recu' } = {}) {
    const uid  = await this._uid();
    const safe = file.name.normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${uid}/${dossierId}/${Date.now()}_${safe}`;

    const { error: upErr } = await supa.storage
      .from(this.BUCKET)
      .upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (upErr) this._handleError(upErr, 'uploadPiece');

    const patch = {
      storage_path:   path,
      nom_fichier:    file.name,
      statut,
      source,
      date_reception: new Date().toISOString().split('T')[0]
    };

    const { data, error } = pieceId
      ? await supa.from('pieces').update(patch).eq('id', pieceId).eq('user_id', uid).select().single()
      : await supa.from('pieces').insert({
          ...patch, user_id: uid, dossier_id: dossierId,
          libelle: file.name, obligatoire: false
        }).select().single();

    if (error) this._handleError(error, 'uploadPiece.link');
    return data;
  },

  /** Lien de téléchargement temporaire (bucket privé) */
  async getPieceUrl(storagePath, secondes = 300) {
    const { data, error } = await supa.storage
      .from(this.BUCKET)
      .createSignedUrl(storagePath, secondes);
    if (error) this._handleError(error, 'getPieceUrl');
    return data?.signedUrl || null;
  },

  /** Archive un PDF généré par l'application dans le coffre du dossier */
  async archiverDocument(dossierId, blob, nomFichier, libelle, numero = null) {
    const uid  = await this._uid();
    const path = `${uid}/${dossierId}/${Date.now()}_${nomFichier}`;

    const { error: upErr } = await supa.storage
      .from(this.BUCKET)
      .upload(path, blob, { upsert: false, contentType: 'application/pdf' });
    if (upErr) this._handleError(upErr, 'archiverDocument');

    const { error } = await supa.from('pieces').upsert({
      user_id:     uid,
      dossier_id:  dossierId,
      libelle,
      statut:      'envoye',
      source:      'genere',
      obligatoire: true,
      storage_path: path,
      nom_fichier:  nomFichier,
      numero,
      date_envoi:   new Date().toISOString().split('T')[0]
    }, { onConflict: 'dossier_id,libelle' });

    if (error) this._handleError(error, 'archiverDocument.link');
    return path;
  }
};
