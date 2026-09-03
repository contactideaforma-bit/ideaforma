/* ─────────────────────────────────────────────────────────────────────────────
   IDEAFORMA — Mail
   Écrire un e-mail depuis l'application et retrouver tout ce qui est parti,
   qu'on l'ait écrit soi-même ou que Nanika l'ait envoyé.

   Deux moitiés :
     – Mails.envoyer()   : le SEUL chemin d'envoi de l'application. Il appelle
                           /api/mail puis inscrit le résultat (réussite OU
                           échec) dans la table `mails`. Nanika passe par là
                           aussi, l'historique est donc complet.
     – MailPage          : l'onglet — formulaire d'écriture + historique.
   Migration : setup_update16.sql (table mails).
───────────────────────────────────────────────────────────────────────────── */

const Mails = {

  EMAIL_RE: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,

  async monEmail() {
    const { data: { session } } = await supa.auth.getSession();
    return String(session?.user?.email || '').toLowerCase();
  },

  _contacts: null,
  async contacts(force = false) {
    if (!this._contacts || force) this._contacts = await DataStore.getContacts().catch(() => []);
    return this._contacts;
  },
  _norm(t) { return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); },

  /** Retrouve un contact par prénom, « prénom nom », nom, société ou e-mail.
      Rend { contact } ou { candidats } si plusieurs correspondent. */
  async trouverContact(saisie) {
    const q = this._norm(saisie);
    if (!q) return { contact: null, candidats: [] };
    const liste = await this.contacts();
    const exact = liste.filter(c =>
      this._norm(c.email) === q ||
      this._norm(c.prenom) === q ||
      this._norm(`${c.prenom} ${c.nom || ''}`) === q ||
      this._norm(`${c.nom || ''} ${c.prenom}`) === q);
    if (exact.length === 1) return { contact: exact[0], candidats: exact };
    if (exact.length > 1)  return { contact: null, candidats: exact };
    const partiel = liste.filter(c =>
      this._norm(`${c.prenom} ${c.nom || ''} ${c.societe || ''} ${c.email}`).includes(q));
    return { contact: partiel.length === 1 ? partiel[0] : null, candidats: partiel };
  },

  /** Normalise une saisie de destinataires : « moi », prénoms du carnet,
      adresses, séparateurs variés, doublons. Rend { a, invalide, ambigus } */
  async destinataires(saisie) {
    const moi = await this.monEmail();
    const brut = Array.isArray(saisie) ? saisie : String(saisie || '').split(/[,;\n]+/);
    const a = [], ambigus = [], inconnus = [];
    for (const item of brut) {
      const x = String(item || '').trim();
      if (!x) continue;
      if (/^moi$/i.test(x)) { a.push(moi); continue; }
      if (this.EMAIL_RE.test(x)) { a.push(x.toLowerCase()); continue; }
      const { contact, candidats } = await this.trouverContact(x);
      if (contact) a.push(contact.email);
      else if (candidats.length > 1) ambigus.push({ saisie: x, candidats });
      else inconnus.push(x);
    }
    const uniques = [...new Set(a)];
    return { a: uniques, moi, ambigus, inconnus,
             invalide: uniques.find(x => !this.EMAIL_RE.test(x)) || inconnus[0] || null };
  },

  /** Envoie et journalise. `confirme` doit être vrai pour tout destinataire
      autre que soi : le serveur le vérifie aussi. */
  async envoyer({ a, objet, corps, confirme = false, source = 'manuel' }) {
    const { data: { session } } = await supa.auth.getSession();
    if (!session?.access_token) throw new Error('Session expirée — reconnectez-vous');

    let statut = 'envoye', erreur = null, resendId = null;
    try {
      const res  = await fetch('/api/mail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ a, objet, corps, confirme })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { statut = 'echec'; erreur = data.error || `Le serveur a répondu ${res.status}`; }
      else resendId = data.id || null;
    } catch (err) {
      statut = 'echec'; erreur = err.message || 'Réseau indisponible';
    }

    // Le journal ne doit jamais faire échouer l'envoi lui-même
    try {
      await DataStore.addMail({ destinataires: a, objet, corps, statut, erreur, source, resendId });
    } catch (err) { console.warn('[Mails] journal', err); }

    if (typeof MailPage !== 'undefined' && Router?.currentPage === 'mail') {
      MailPage._chargerHistorique().catch(() => {});
    }
    return { ok: statut === 'envoye', erreur, id: resendId };
  }
};


const MailPage = {

  _mails:     [],
  recherche:  '',
  _ouvert:    null,     // mail déplié dans l'historique

  async render() {
    document.getElementById('pageTitle').textContent    = 'Mail';
    document.getElementById('pageSubtitle').textContent = 'Écrire, et retrouver ce qui est parti';
    document.getElementById('pageHeaderRight').innerHTML = `
      <button class="btn btn-sm btn-secondary" id="btnMailNanika" title="Nanika rédige à partir de vos consignes">
        ${Icone('nanika', { taille: 16 })} Rédiger avec Nanika</button>`;
    Loading.show();

    const moi = await Mails.monEmail().catch(() => '');

    document.getElementById('pageContent').innerHTML = `
      <div class="mail-page">
        <section class="section-card mail-compose">
          <div class="section-card-header">
            <div class="section-card-title">${Icone('envoyer', { taille: 16 })} Nouveau mail</div>
            <button class="btn btn-sm btn-secondary" id="mailAMoi" title="Mettre mon adresse en destinataire">À moi</button>
          </div>
          <div class="mail-form">
            <label class="form-group">
              <span>À</span>
              <input type="text" id="mailA" placeholder="Roger, adresse@exemple.fr, « moi »…"
                     autocomplete="off" autocapitalize="off" spellcheck="false">
              <div class="mail-suggestions" id="mailSuggestions" hidden></div>
            </label>
            <label class="form-group">
              <span>Objet</span>
              <input type="text" id="mailObjetP" placeholder="Objet du message">
            </label>
            <label class="form-group">
              <span>Message</span>
              <textarea id="mailCorpsP" rows="10" placeholder="Bonjour,&#10;&#10;…"></textarea>
            </label>
            <div class="mail-actions">
              <span class="mail-expediteur">${Icone('info', { taille: 14 })}
                Les réponses arriveront sur ${esc(moi || 'votre adresse')}.</span>
              <div class="mail-actions-btns">
                <button class="btn btn-secondary" id="mailEffacer">Effacer</button>
                <button class="btn btn-primary" id="mailEnvoyer">${Icone('envoyer', { taille: 16 })} Envoyer</button>
              </div>
            </div>
          </div>
        </section>

        <section class="section-card mail-contacts">
          <div class="section-card-header">
            <div class="section-card-title">${Icone('carte', { taille: 16 })} Contacts</div>
            <button class="btn btn-sm btn-secondary" id="btnNouveauContact">${Icone('plus', { taille: 15 })} Contact</button>
          </div>
          <div id="contactsListe" class="contacts-liste"></div>
        </section>

        <section class="section-card mail-historique">
          <div class="section-card-header">
            <div class="section-card-title">${Icone('horloge', { taille: 16 })} Historique</div>
            <div class="search-input-wrap mail-recherche">
              <input class="search-input" id="mailRecherche" placeholder="Rechercher…" value="${esc(this.recherche)}">
            </div>
          </div>
          <div id="mailListe" class="mail-liste"><div class="empty-state">Chargement…</div></div>
        </section>
      </div>`;

    document.getElementById('mailEnvoyer').addEventListener('click', () => this._envoyerFormulaire());
    document.getElementById('mailEffacer').addEventListener('click', () => this._vider());
    document.getElementById('mailAMoi').addEventListener('click', () => {
      const champ = document.getElementById('mailA');
      const deja = champ.value.split(/[,;\s]+/).map(x => x.trim().toLowerCase()).filter(Boolean);
      if (moi && !deja.includes(moi)) champ.value = [...deja, moi].join(', ');
      document.getElementById('mailObjetP').focus();
    });
    document.getElementById('btnMailNanika').addEventListener('click', () => this._redigerAvecNanika());
    document.getElementById('btnNouveauContact').addEventListener('click', () => this.formContact());
    this._brancherSuggestions();
    let minuteur = null;
    document.getElementById('mailRecherche').addEventListener('input', e => {
      clearTimeout(minuteur);
      minuteur = setTimeout(() => { this.recherche = e.target.value.trim(); this._chargerHistorique(); }, 250);
    });

    this._restaurerBrouillon();
    ['mailA', 'mailObjetP', 'mailCorpsP'].forEach(id =>
      document.getElementById(id).addEventListener('input', () => this._garderBrouillon()));

    try {
      await Promise.all([this._chargerHistorique(), this._chargerContacts()]);
    } catch (err) { peindreErreur(err); }
  },

  /* ── Carnet de contacts ── */
  _contacts: [],
  async _chargerContacts() {
    this._contacts = await Mails.contacts(true);
    this._peindreContacts();
  },

  _peindreContacts() {
    const zone = document.getElementById('contactsListe');
    if (!zone) return;
    if (!this._contacts.length) {
      zone.innerHTML = `<div class="empty-state">Aucun contact. Ajoutez-en un, ou dites à Nanika
        « ajoute Roger Martin, roger@exemple.fr, dans mes contacts ».</div>`;
      return;
    }
    zone.innerHTML = this._contacts.map(c => `
      <div class="contact-carte" data-contact="${c.id}">
        <div class="contact-avatar">${esc((c.prenom || '?')[0].toUpperCase())}</div>
        <div class="contact-corps">
          <div class="contact-nom">${esc(c.prenom)}${c.nom ? ' ' + esc(c.nom) : ''}
            ${c.societe ? `<span class="contact-societe">· ${esc(c.societe)}</span>` : ''}</div>
          <div class="contact-email">${esc(c.email)}${c.fonction ? ` · ${esc(c.fonction)}` : ''}</div>
        </div>
        <button class="btn btn-sm btn-secondary" data-ecrire="${c.id}" title="Écrire à ${esc(c.prenom)}">${Icone('envoyer', { taille: 14 })}</button>
        <button class="btn-icon" data-modifier="${c.id}" title="Modifier" aria-label="Modifier">${Icone('crayon', { taille: 15 })}</button>
      </div>`).join('');
    zone.onclick = e => {
      const ec = e.target.closest('[data-ecrire]');
      if (ec) {
        const c = this._contacts.find(x => x.id === ec.dataset.ecrire);
        const champ = document.getElementById('mailA');
        const deja = champ.value.trim();
        champ.value = deja ? `${deja}, ${c.prenom}${c.nom ? ' ' + c.nom : ''}` : `${c.prenom}${c.nom ? ' ' + c.nom : ''}`;
        this._garderBrouillon();
        document.getElementById('mailObjetP').focus();
        return;
      }
      const mo = e.target.closest('[data-modifier]');
      if (mo) this.formContact(this._contacts.find(x => x.id === mo.dataset.modifier));
    };
  },

  formContact(c = null) {
    const v = k => esc(c?.[k] || '');
    Modal.open(c ? 'Modifier le contact' : 'Nouveau contact', `
      <div class="contact-form">
        <div class="contact-form-ligne">
          <label class="form-group"><span>Prénom *</span><input id="cPrenom" value="${v('prenom')}" autofocus></label>
          <label class="form-group"><span>Nom</span><input id="cNom" value="${v('nom')}"></label>
        </div>
        <label class="form-group"><span>E-mail *</span><input id="cEmail" type="email" value="${v('email')}" autocapitalize="off"></label>
        <div class="contact-form-ligne">
          <label class="form-group"><span>Téléphone</span><input id="cTel" value="${v('telephone')}"></label>
          <label class="form-group"><span>Société</span><input id="cSociete" value="${v('societe')}"></label>
        </div>
        <label class="form-group"><span>Fonction</span><input id="cFonction" value="${v('fonction')}" placeholder="Directeur, comptable, formateur…"></label>
        <label class="form-group"><span>Notes</span><textarea id="cNotes" rows="2">${v('notes')}</textarea></label>
      </div>`, [
      ...(c ? [{ label: `${Icone('poubelle', { taille: 14 })} Supprimer`, cls: 'btn btn-secondary danger', action: async () => {
        await DataStore.deleteContact(c.id); Modal.close();
        await this._chargerContacts(); Toast.show('Contact supprimé', 'info');
      } }] : []),
      { label: 'Annuler', cls: 'btn btn-secondary', action: () => Modal.close() },
      { label: 'Enregistrer', cls: 'btn btn-primary', action: async () => {
        const d = {
          prenom: document.getElementById('cPrenom').value.trim(),
          nom: document.getElementById('cNom').value.trim(),
          email: document.getElementById('cEmail').value.trim(),
          telephone: document.getElementById('cTel').value.trim(),
          societe: document.getElementById('cSociete').value.trim(),
          fonction: document.getElementById('cFonction').value.trim(),
          notes: document.getElementById('cNotes').value.trim()
        };
        if (!d.prenom) { Toast.show('Le prénom est obligatoire', 'warning'); return; }
        if (!Mails.EMAIL_RE.test(d.email)) { Toast.show('Adresse e-mail invalide', 'warning'); return; }
        try {
          if (c) await DataStore.updateContact(c.id, d); else await DataStore.addContact(d);
          Modal.close(); await this._chargerContacts();
          Toast.show(c ? 'Contact modifié' : `${d.prenom} ajouté aux contacts`, 'success');
        } catch (err) { Toast.show(err.message, 'error'); }
      } }
    ]);
  },

  /* Suggestions du carnet pendant la saisie du champ « À » */
  _brancherSuggestions() {
    const champ = document.getElementById('mailA');
    const boite = document.getElementById('mailSuggestions');
    const dernierMorceau = () => champ.value.split(/[,;]/).pop().trim();
    const montrer = () => {
      const q = Mails._norm(dernierMorceau());
      if (q.length < 1) { boite.hidden = true; return; }
      const trouves = this._contacts.filter(c =>
        Mails._norm(`${c.prenom} ${c.nom || ''} ${c.societe || ''} ${c.email}`).includes(q)).slice(0, 6);
      if (!trouves.length) { boite.hidden = true; return; }
      boite.innerHTML = trouves.map(c => `
        <button type="button" class="mail-suggestion" data-id="${c.id}">
          <strong>${esc(c.prenom)}${c.nom ? ' ' + esc(c.nom) : ''}</strong> <span>${esc(c.email)}</span>
        </button>`).join('');
      boite.hidden = false;
    };
    champ.addEventListener('input', montrer);
    champ.addEventListener('focus', montrer);
    champ.addEventListener('blur', () => setTimeout(() => { boite.hidden = true; }, 150));
    boite.addEventListener('mousedown', e => {
      const b = e.target.closest('[data-id]');
      if (!b) return;
      e.preventDefault();
      const c = this._contacts.find(x => x.id === b.dataset.id);
      const parts = champ.value.split(/[,;]/); parts.pop();
      parts.push(` ${c.prenom}${c.nom ? ' ' + c.nom : ''}`);
      champ.value = parts.map(x => x.trim()).filter(Boolean).join(', ');
      boite.hidden = true;
      this._garderBrouillon();
      document.getElementById('mailObjetP').focus();
    });
  },

  /* ── Brouillon : on ne perd pas un mail à moitié écrit en changeant d'onglet ── */
  _garderBrouillon() {
    try {
      localStorage.setItem('mail_brouillon', JSON.stringify({
        a: document.getElementById('mailA').value,
        objet: document.getElementById('mailObjetP').value,
        corps: document.getElementById('mailCorpsP').value
      }));
    } catch { /* rien */ }
  },
  _restaurerBrouillon() {
    try {
      const b = JSON.parse(localStorage.getItem('mail_brouillon') || 'null');
      if (!b) return;
      document.getElementById('mailA').value      = b.a || '';
      document.getElementById('mailObjetP').value = b.objet || '';
      document.getElementById('mailCorpsP').value = b.corps || '';
    } catch { /* rien */ }
  },
  _vider() {
    ['mailA', 'mailObjetP', 'mailCorpsP'].forEach(id => { document.getElementById(id).value = ''; });
    try { localStorage.removeItem('mail_brouillon'); } catch { /* rien */ }
    document.getElementById('mailA').focus();
  },

  /* Pré-remplit le formulaire (depuis l'historique : « réutiliser ») */
  remplir({ a = [], objet = '', corps = '' } = {}) {
    document.getElementById('mailA').value      = a.join(', ');
    document.getElementById('mailObjetP').value = objet;
    document.getElementById('mailCorpsP').value = corps;
    this._garderBrouillon();
    document.querySelector('.mail-compose')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  async _envoyerFormulaire() {
    const bouton = document.getElementById('mailEnvoyer');
    const { a, moi, invalide, ambigus, inconnus } = await Mails.destinataires(document.getElementById('mailA').value);
    const objet = document.getElementById('mailObjetP').value.trim();
    const corps = document.getElementById('mailCorpsP').value.trim();

    if (ambigus.length) {
      Toast.show(`Plusieurs contacts pour « ${ambigus[0].saisie} » : ${ambigus[0].candidats.map(c => `${c.prenom} ${c.nom || ''}`.trim()).join(', ')} — précisez`, 'warning', 6000);
      return;
    }
    if (inconnus.length) {
      Toast.show(`« ${inconnus[0]} » n'est ni une adresse ni un contact connu`, 'warning', 5000);
      return;
    }
    if (!a.length)  { Toast.show('Indiquez au moins un destinataire', 'warning'); return; }
    if (invalide)   { Toast.show(`Adresse invalide : ${invalide}`, 'warning'); return; }
    if (!objet)     { Toast.show("L'objet est vide", 'warning'); return; }
    if (!corps)     { Toast.show('Le message est vide', 'warning'); return; }

    bouton.disabled = true;
    bouton.innerHTML = `${Icone('sablier', { taille: 16 })} Envoi…`;
    try {
      // Envoi manuel : c'est l'utilisatrice qui clique, le contenu est validé de fait
      const r = await Mails.envoyer({ a, objet, corps, confirme: a.some(x => x !== moi), source: 'manuel' });
      if (r.ok) {
        Toast.show(`Mail envoyé à ${a.join(', ')}`, 'success');
        this._vider();
      } else {
        Toast.show(`Échec de l'envoi : ${r.erreur}`, 'error', 6000);
      }
    } finally {
      bouton.disabled = false;
      bouton.innerHTML = `${Icone('envoyer', { taille: 16 })} Envoyer`;
    }
  },

  /* Nanika rédige : on lui passe les destinataires et ce qu'il y a dans le
     message comme consigne ; elle proposera le mail, à valider avant envoi. */
  _redigerAvecNanika() {
    const a     = document.getElementById('mailA').value.trim();
    const objet = document.getElementById('mailObjetP').value.trim();
    const brief = document.getElementById('mailCorpsP').value.trim();
    let demande = 'Rédige un mail';
    if (a) demande += ` à ${a}`;
    if (objet) demande += ` au sujet de « ${objet} »`;
    demande += brief ? ` : ${brief}` : '.';
    if (!a && !objet && !brief) demande = 'Rédige un mail pour moi — demande-moi le destinataire et le sujet.';
    Assistant.ouvrir().then(() => {
      const champ = document.getElementById('chatInput');
      if (champ) { champ.value = demande; Assistant.envoyer(); }
    });
  },

  /* ── Historique ── */
  async _chargerHistorique() {
    this._mails = await DataStore.getMails({ recherche: this.recherche, limite: 200 });
    this._peindreHistorique();
  },

  _peindreHistorique() {
    const zone = document.getElementById('mailListe');
    if (!zone) return;
    if (!this._mails.length) {
      zone.innerHTML = `<div class="empty-state">${this.recherche
        ? 'Aucun mail ne correspond.' : 'Aucun mail envoyé pour le moment.'}</div>`;
      return;
    }

    // Regroupement par jour, façon carnet
    const groupes = [];
    this._mails.forEach(m => {
      const jour = Dates.iso(new Date(m.envoye_le));
      let g = groupes[groupes.length - 1];
      if (!g || g.jour !== jour) { g = { jour, mails: [] }; groupes.push(g); }
      g.mails.push(m);
    });
    const hui = Dates.aujourdhui();
    const hier = Dates.iso(new Date(Date.now() - 86400000));
    const libelleJour = j => j === hui ? "Aujourd'hui" : j === hier ? 'Hier' : Dates.longue(new Date(j + 'T12:00:00'));

    zone.innerHTML = groupes.map(g => `
      <div class="mail-jour">
        <div class="mail-jour-titre">${esc(libelleJour(g.jour))}</div>
        ${g.mails.map(m => {
          const ouvert = this._ouvert === m.id;
          return `
          <article class="mail-item ${m.statut === 'echec' ? 'echec' : ''} ${ouvert ? 'ouvert' : ''}" data-mail="${m.id}">
            <div class="mail-item-tete">
              <span class="mail-item-heure">${Dates.heure(new Date(m.envoye_le))}</span>
              <span class="mail-item-a">${esc((m.destinataires || []).join(', '))}</span>
              <span class="mail-item-source" title="${m.source === 'nanika' ? 'Envoyé par Nanika' : 'Écrit à la main'}">
                ${Icone(m.source === 'nanika' ? 'nanika' : 'crayon', { taille: 14 })}</span>
              ${m.statut === 'echec' ? `<span class="mail-item-statut">${Icone('alerte', { taille: 14 })} Échec</span>` : ''}
            </div>
            <div class="mail-item-objet">${esc(m.objet)}</div>
            ${ouvert ? `
              <div class="mail-item-corps">${esc(m.corps).replace(/\n/g, '<br>')}</div>
              ${m.erreur ? `<div class="mail-item-erreur">${esc(m.erreur)}</div>` : ''}
              <div class="mail-item-actions">
                <button class="btn btn-sm btn-secondary" data-reutiliser="${m.id}">${Icone('rafraichir', { taille: 14 })} Réutiliser</button>
                <button class="btn btn-sm btn-secondary" data-copier="${m.id}">${Icone('document', { taille: 14 })} Copier le texte</button>
                <button class="btn btn-sm btn-icon danger" data-supprimer="${m.id}" title="Retirer de l'historique">${Icone('poubelle', { taille: 14 })}</button>
              </div>` : `
              <div class="mail-item-apercu">${esc(m.corps).slice(0, 140)}${m.corps.length > 140 ? '…' : ''}</div>`}
          </article>`;
        }).join('')}
      </div>`).join('');

    zone.onclick = async e => {
      const re = e.target.closest('[data-reutiliser]');
      if (re) {
        const m = this._mails.find(x => x.id === re.dataset.reutiliser);
        if (m) this.remplir({ a: m.destinataires, objet: m.objet, corps: m.corps });
        return;
      }
      const cp = e.target.closest('[data-copier]');
      if (cp) {
        const m = this._mails.find(x => x.id === cp.dataset.copier);
        try { await navigator.clipboard.writeText(`Objet : ${m.objet}\n\n${m.corps}`); Toast.show('Texte copié', 'success'); }
        catch { Toast.show('Copie impossible sur ce navigateur', 'warning'); }
        return;
      }
      const sup = e.target.closest('[data-supprimer]');
      if (sup) {
        await DataStore.deleteMail(sup.dataset.supprimer);
        this._ouvert = null;
        await this._chargerHistorique();
        Toast.show("Retiré de l'historique (le mail, lui, est bien parti)", 'info');
        return;
      }
      const item = e.target.closest('[data-mail]');
      if (item) {
        this._ouvert = this._ouvert === item.dataset.mail ? null : item.dataset.mail;
        this._peindreHistorique();
      }
    };
  }
};
