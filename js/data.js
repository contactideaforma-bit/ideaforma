/* ─── DataStore — Supabase backend ─── */

/* Convertit une ligne dossiers+clients en objet plat utilisé par l'UI */
function _mapClient(row) {
  const c = row.clients || {};
  return {
    id:              row.id,
    clientId:        row.client_id,
    opco:            c.opco            || '',
    companyName:     c.nom_entreprise  || '',
    siret:           c.siret           || '',
    address:         c.adresse         || '',
    phone:           c.tel             || '',
    email:           c.email           || '',
    employees:       c.nb_salaries     ?? '',
    trainees:        Array.isArray(row.salaries)        ? row.salaries        : [],
    trainingSubject: row.sujet_formation                || '',
    price:           parseFloat(row.prix)               || 0,
    trainingDates:   Array.isArray(row.dates_formation) ? row.dates_formation : [],
    status:          row.statut        || 'devis_fait',
    notes:           row.notes         || '',
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
     CLIENTS / DOSSIERS
  ══════════════════════════════════════════════ */

  async getClients(opco) {
    const uid = await this._uid();
    const { data, error } = await supa
      .from('dossiers')
      .select('*, clients!inner(id, opco, nom_entreprise, siret, adresse, tel, email, nb_salaries)')
      .eq('user_id', uid)
      .eq('clients.opco', opco)
      .order('cree_le', { ascending: false });

    if (error) this._handleError(error, 'getClients');
    return (data || []).map(_mapClient);
  },

  async getAllClients() {
    const uid = await this._uid();
    const { data, error } = await supa
      .from('dossiers')
      .select('*, clients!inner(id, opco, nom_entreprise, siret, adresse, tel, email, nb_salaries)')
      .eq('user_id', uid)
      .order('cree_le', { ascending: false });

    if (error) this._handleError(error, 'getAllClients');
    return (data || []).map(_mapClient);
  },

  async getClient(opco, id) {
    const uid = await this._uid();
    const { data, error } = await supa
      .from('dossiers')
      .select('*, clients!inner(id, opco, nom_entreprise, siret, adresse, tel, email, nb_salaries)')
      .eq('id', id)
      .eq('user_id', uid)
      .single();

    if (error) return null;
    return _mapClient(data);
  },

  async addClient(opco, d) {
    const uid = await this._uid();

    // 1. Créer le client (entreprise)
    const { data: client, error: cErr } = await supa
      .from('clients')
      .insert({
        user_id:        uid,
        opco,
        nom_entreprise: d.companyName,
        siret:          d.siret       || null,
        adresse:        d.address     || null,
        tel:            d.phone       || null,
        email:          d.email       || null,
        nb_salaries:    d.employees   ? parseInt(d.employees) : null
      })
      .select()
      .single();

    if (cErr) this._handleError(cErr, 'addClient/client');

    // 2. Créer le dossier (formation)
    const { data: dossier, error: dErr } = await supa
      .from('dossiers')
      .insert({
        user_id:         uid,
        client_id:       client.id,
        salaries:        d.trainees        || [],
        dates_formation: d.trainingDates   || [],
        sujet_formation: d.trainingSubject || null,
        prix:            parseFloat(d.price) || 0,
        statut:          d.status           || 'devis_fait',
        notes:           d.notes            || null
      })
      .select('*, clients!inner(id, opco, nom_entreprise, siret, adresse, tel, email, nb_salaries)')
      .single();

    if (dErr) this._handleError(dErr, 'addClient/dossier');
    return _mapClient(dossier);
  },

  async updateClient(opco, id, updates) {
    const uid = await this._uid();

    // Récupérer le client_id du dossier
    const { data: dRef, error: refErr } = await supa
      .from('dossiers')
      .select('client_id')
      .eq('id', id)
      .eq('user_id', uid)
      .single();

    if (refErr || !dRef) this._handleError(refErr || new Error('Dossier introuvable'), 'updateClient/ref');

    // Mettre à jour l'entreprise (clients table)
    await supa
      .from('clients')
      .update({
        nom_entreprise: updates.companyName,
        siret:          updates.siret     || null,
        adresse:        updates.address   || null,
        tel:            updates.phone     || null,
        email:          updates.email     || null,
        nb_salaries:    updates.employees ? parseInt(updates.employees) : null
      })
      .eq('id', dRef.client_id)
      .eq('user_id', uid);

    // Mettre à jour le dossier (formation)
    const { data: updated, error: dErr } = await supa
      .from('dossiers')
      .update({
        salaries:        updates.trainees        || [],
        dates_formation: updates.trainingDates   || [],
        sujet_formation: updates.trainingSubject || null,
        prix:            parseFloat(updates.price) || 0,
        statut:          updates.status           || 'devis_fait',
        notes:           updates.notes            || null
      })
      .eq('id', id)
      .eq('user_id', uid)
      .select('*, clients!inner(id, opco, nom_entreprise, siret, adresse, tel, email, nb_salaries)')
      .single();

    if (dErr) this._handleError(dErr, 'updateClient/dossier');
    return _mapClient(updated);
  },

  async updateDossierStatus(id, statut) {
    const uid = await this._uid();
    const { error } = await supa
      .from('dossiers')
      .update({ statut })
      .eq('id', id)
      .eq('user_id', uid);

    if (error) this._handleError(error, 'updateDossierStatus');
  },

  async deleteClient(opco, id) {
    const uid = await this._uid();

    // Trouver le client_id pour nettoyage éventuel
    const { data: dRef } = await supa
      .from('dossiers')
      .select('client_id')
      .eq('id', id)
      .eq('user_id', uid)
      .single();

    // Supprimer le dossier
    await supa.from('dossiers').delete().eq('id', id).eq('user_id', uid);

    if (dRef?.client_id) {
      // Supprimer le client si aucun autre dossier ne le référence
      const { count } = await supa
        .from('dossiers')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', dRef.client_id);

      if (count === 0) {
        await supa.from('clients').delete().eq('id', dRef.client_id).eq('user_id', uid);
      }
    }
  },

  /* ══════════════════════════════════════════════
     AGRÉGATS (synchrones sur données pré-chargées)
  ══════════════════════════════════════════════ */

  computeFormationDates(clients) {
    const result = [];
    clients.forEach(c => {
      (c.trainingDates || []).forEach(d => {
        if (d.start) result.push({
          ...d,
          opco:        c.opco,
          companyName: c.companyName,
          subject:     c.trainingSubject,
          dossierId:   c.id
        });
      });
    });
    return result;
  },

  computeUpcoming(clients, days = 14) {
    const now   = new Date();
    const limit = new Date(now.getTime() + days * 86400000);
    return this.computeFormationDates(clients)
      .filter(d => {
        const start = new Date(d.start + 'T00:00:00');
        return start >= now && start <= limit;
      })
      .sort((a, b) => new Date(a.start) - new Date(b.start));
  },

  computeAlerts(clients) {
    const alerts = [];
    clients.forEach(c => {
      if (!c.updatedAt) return;
      const ageDays = (new Date() - new Date(c.updatedAt)) / 86400000;
      if (c.status === 'devis_envoye' && ageDays > 7) {
        alerts.push({ type: 'warning', msg: `Devis sans réponse depuis ${Math.floor(ageDays)}j`, sub: c.companyName });
      }
      if (c.status === 'devis_signe' && ageDays > 5) {
        alerts.push({ type: 'urgent', msg: `Dossier signé en attente OPCO (${Math.floor(ageDays)}j)`, sub: c.companyName });
      }
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
    const { data, error } = await supa
      .from('profiles')
      .update({
        nom:              updates.nom              || null,
        organisme:        updates.organisme        || null,
        siret:            updates.siret            || null,
        adresse:          updates.adresse          || null,
        telephone:        updates.telephone        || null,
        numero_da:        updates.numero_da        || null,
        numero_qualiopi:  updates.numero_qualiopi  || null
      })
      .eq('id', uid)
      .select()
      .single();

    if (error) this._handleError(error, 'updateProfile');
    return data;
  }
};
