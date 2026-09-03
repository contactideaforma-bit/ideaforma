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

  /** Normalise une saisie de destinataires : « moi », virgules, espaces,
      points-virgules, doublons. Rend { a, invalide } */
  async destinataires(saisie) {
    const moi = await this.monEmail();
    const brut = Array.isArray(saisie) ? saisie : String(saisie || '').split(/[,;\s]+/);
    const a = [...new Set(brut
      .map(x => String(x || '').trim())
      .filter(Boolean)
      .map(x => /^moi$/i.test(x) ? moi : x.toLowerCase()))];
    return { a, moi, invalide: a.find(x => !this.EMAIL_RE.test(x)) || null };
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
              <input type="text" id="mailA" placeholder="adresse@exemple.fr, une autre… ou « moi »"
                     autocomplete="off" autocapitalize="off" spellcheck="false">
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
    let minuteur = null;
    document.getElementById('mailRecherche').addEventListener('input', e => {
      clearTimeout(minuteur);
      minuteur = setTimeout(() => { this.recherche = e.target.value.trim(); this._chargerHistorique(); }, 250);
    });

    this._restaurerBrouillon();
    ['mailA', 'mailObjetP', 'mailCorpsP'].forEach(id =>
      document.getElementById(id).addEventListener('input', () => this._garderBrouillon()));

    try { await this._chargerHistorique(); }
    catch (err) { peindreErreur(err); }
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
    const { a, moi, invalide } = await Mails.destinataires(document.getElementById('mailA').value);
    const objet = document.getElementById('mailObjetP').value.trim();
    const corps = document.getElementById('mailCorpsP').value.trim();

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
