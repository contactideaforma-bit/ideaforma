/* ─────────────────────────────────────────────────────────────────────────────
   IDEAFORMA — SMS
   Envoyer un SMS depuis l'application (à un contact du carnet ou à un numéro)
   et retrouver tout ce qui est parti, écrit à la main ou par Nanika.

     – Sms.envoyer()  : le SEUL chemin d'envoi. Appelle /api/sms (Brevo ou
                        Twilio) puis inscrit le résultat dans la table `sms`.
     – SmsPage        : l'onglet — formulaire + historique.
   Migration : setup_update19.sql. Réglages serveur : voir api/sms.js.
───────────────────────────────────────────────────────────────────────────── */

const Sms = {

  /* 06 12 34 56 78, 0612345678, +33 6…, 0033… → +33612345678 (ou null) */
  e164(brut) {
    let n = String(brut || '').replace(/[\s.\-()]/g, '');
    if (!n) return null;
    if (n.startsWith('00')) n = '+' + n.slice(2);
    if (/^0[1-9]\d{8}$/.test(n)) n = '+33' + n.slice(1);
    if (/^[1-9]\d{8}$/.test(n)) n = '+33' + n;
    return /^\+[1-9]\d{7,14}$/.test(n) ? n : null;
  },
  /* +33612345678 → 06 12 34 56 78 pour l'affichage */
  joli(e) {
    const m = /^\+33(\d{9})$/.exec(String(e || ''));
    if (!m) return e || '';
    return ('0' + m[1]).replace(/(\d{2})(?=\d)/g, '$1 ');
  },
  estNumero(t) { return /^[+\d][\d\s.\-()]{7,}$/.test(String(t || '').trim()); },

  _config: null,
  async config(force = false) {
    if (this._config && !force) return this._config;
    try {
      const { data: { session } } = await supa.auth.getSession();
      const r = await fetch('/api/sms', { headers: { Authorization: `Bearer ${session?.access_token || ''}` } });
      this._config = r.ok ? await r.json() : { pret: false };
    } catch { this._config = { pret: false }; }
    return this._config;
  },

  /** Destinataires : « moi », numéros, prénoms du carnet (qui ont un
      téléphone). Rend { a, noms, ambigus, inconnus, sansTel } */
  async destinataires(saisie) {
    const cfg = await this.config();
    const brut = Array.isArray(saisie) ? saisie : String(saisie || '').split(/[,;\n]+/);
    const a = [], noms = [], ambigus = [], inconnus = [], sansTel = [];
    for (const item of brut) {
      const x = String(item || '').trim();
      if (!x) continue;
      if (/^moi$/i.test(x)) {
        if (cfg.monTelephone) { a.push(cfg.monTelephone); noms.push('moi'); }
        else inconnus.push('moi (MON_TELEPHONE non configuré)');
        continue;
      }
      if (this.estNumero(x)) {
        const n = this.e164(x);
        if (n) { a.push(n); noms.push(null); } else inconnus.push(x);
        continue;
      }
      const { contact, candidats } = await Mails.trouverContact(x);
      if (contact) {
        const n = this.e164(contact.telephone);
        if (n) { a.push(n); noms.push(`${contact.prenom}${contact.nom ? ' ' + contact.nom : ''}`); }
        else sansTel.push(`${contact.prenom}${contact.nom ? ' ' + contact.nom : ''}`);
      } else if (candidats.length > 1) ambigus.push({ saisie: x, candidats });
      else inconnus.push(x);
    }
    // dédoublonnage en gardant le nom associé
    const vus = new Set(), A = [], N = [];
    a.forEach((n, i) => { if (!vus.has(n)) { vus.add(n); A.push(n); N.push(noms[i]); } });
    return { a: A, noms: N, ambigus, inconnus, sansTel, moi: cfg.monTelephone || null };
  },

  /** Envoie et journalise. `confirme` requis pour tout numéro autre que le
      sien (le serveur le vérifie aussi). */
  async envoyer({ a, noms = [], contenu, confirme = false, source = 'manuel' }) {
    const { data: { session } } = await supa.auth.getSession();
    if (!session?.access_token) throw new Error('Session expirée — reconnectez-vous');

    let statut = 'envoye', erreur = null, idFournisseur = null;
    try {
      const res  = await fetch('/api/sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ a, contenu, confirme })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) { statut = 'echec'; erreur = data.error || `Le serveur a répondu ${res.status}`; }
      idFournisseur = (data.resultats || []).map(r => r.id).filter(Boolean).join(',') || null;
    } catch (err) {
      statut = 'echec'; erreur = err.message || 'Réseau indisponible';
    }

    try {
      await DataStore.addSms({ destinataires: a, noms: noms.map(n => n || ''), contenu, statut, erreur, source, fournisseurId: idFournisseur });
    } catch (err) { console.warn('[Sms] journal', err); }

    if (typeof SmsPage !== 'undefined' && Router?.currentPage === 'sms') {
      SmsPage._chargerHistorique().catch(() => {});
    }
    return { ok: statut === 'envoye', erreur };
  },

  /* Longueur SMS : 160 caractères en GSM-7, 70 en Unicode ; au-delà, on
     enchaîne des segments (153 / 67). Les accents français courants (é è à ù
     ç…) restent en GSM-7 ; les guillemets « », l'apostrophe typographique
     et les emoji basculent en Unicode. */
  segments(t) {
    const GSM = /^[A-Za-z0-9 \r\n@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-.\/:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\\[~\]|€]*$/;
    const n = String(t || '').length;
    if (!n) return { n, segments: 0, unicode: false };
    const unicode = !GSM.test(t);
    const un = unicode ? 70 : 160, multi = unicode ? 67 : 153;
    return { n, unicode, segments: n <= un ? 1 : Math.ceil(n / multi) };
  }
};


const SmsPage = {

  _sms:      [],
  recherche: '',
  _ouvert:   null,

  async render() {
    document.getElementById('pageTitle').textContent    = 'SMS';
    document.getElementById('pageSubtitle').textContent = 'Envoyer un texto, et retrouver ce qui est parti';
    document.getElementById('pageHeaderRight').innerHTML = `
      <button class="btn btn-sm btn-secondary" id="btnSmsNanika" title="Nanika rédige à partir de vos consignes">
        ${Icone('nanika', { taille: 16 })} Rédiger avec Nanika</button>`;
    Loading.show();

    const cfg = await Sms.config(true);
    const contacts = (await Mails.contacts(true).catch(() => [])).filter(c => Sms.e164(c.telephone));

    document.getElementById('pageContent').innerHTML = `
      <div class="mail-page sms-page">
        <section class="section-card mail-compose">
          <div class="section-card-header">
            <div class="section-card-title">${Icone('mobile', { taille: 16 })} Nouveau SMS</div>
            ${cfg.monTelephone ? `<button class="btn btn-sm btn-secondary" id="smsAMoi" title="Mon portable (${esc(Sms.joli(cfg.monTelephone))})">À moi</button>` : ''}
          </div>
          ${cfg.pret ? '' : `
          <div class="sms-alerte">${Icone('alerte', { taille: 15 })}
            L'envoi n'est pas encore configuré côté serveur : ajoutez <strong>BREVO_API_KEY</strong>
            (ou les variables Twilio) dans Vercel <em>puis redéployez</em> — une variable ajoutée n'est prise en compte qu'au déploiement suivant.</div>`}
          <div class="sms-diag">
            ${Icone('info', { taille: 13 })}
            Fournisseur : <strong>${esc(cfg.fournisseur || '?')}</strong> ·
            clé : <strong>${cfg.pret ? 'présente' : 'absente'}</strong>${cfg.cleForme === false ? ' <span class="sms-diag-ko">(ne ressemble pas à une clé API v3 « xkeysib-… »)</span>' : ''} ·
            expéditeur : <strong>${esc(cfg.expediteur || '—')}</strong> ·
            mon numéro : <strong>${cfg.monTelephone ? esc(Sms.joli(cfg.monTelephone)) : 'non renseigné (MON_TELEPHONE)'}</strong>
            ${cfg.pret && cfg.monTelephone ? `<button class="btn btn-sm btn-secondary" id="smsTest">Envoyer un SMS de test à mon numéro</button>` : ''}
          </div>
          <div class="mail-form">
            <label class="form-group">
              <span>À</span>
              <input type="text" id="smsA" placeholder="Roger, 06 12 34 56 78, « moi »…"
                     autocomplete="off" autocapitalize="off" spellcheck="false" inputmode="text">
              <div class="mail-suggestions" id="smsSuggestions" hidden></div>
            </label>
            <label class="form-group">
              <span>Message</span>
              <textarea id="smsCorps" rows="6" placeholder="Bonjour Roger, …" maxlength="600"></textarea>
              <small class="sms-compteur" id="smsCompteur"></small>
            </label>
            <div class="mail-actions">
              <span class="mail-expediteur">${Icone('info', { taille: 14 })}
                Expéditeur : ${esc(cfg.expediteur || 'IDEAFORMA')} — les destinataires ne peuvent pas répondre par SMS.</span>
              <div class="mail-actions-btns">
                <button class="btn btn-secondary" id="smsEffacer">Effacer</button>
                <button class="btn btn-primary" id="smsEnvoyer">${Icone('envoyer', { taille: 16 })} Envoyer</button>
              </div>
            </div>
          </div>
        </section>

        <section class="section-card mail-contacts">
          <div class="section-card-header">
            <div class="section-card-title">${Icone('carte', { taille: 16 })} Contacts avec un numéro</div>
            <button class="btn btn-sm btn-secondary" id="btnSmsContact">${Icone('plus', { taille: 15 })} Contact</button>
          </div>
          <div class="contacts-liste">
            ${contacts.length ? contacts.map(c => `
              <div class="contact-carte">
                <div class="contact-avatar">${esc((c.prenom || '?')[0].toUpperCase())}</div>
                <div class="contact-corps">
                  <div class="contact-nom">${esc(c.prenom)}${c.nom ? ' ' + esc(c.nom) : ''}${c.societe ? `<span class="contact-societe"> · ${esc(c.societe)}</span>` : ''}</div>
                  <div class="contact-email">${esc(Sms.joli(Sms.e164(c.telephone)))}</div>
                </div>
                <button class="btn btn-sm btn-secondary" data-sms-a="${esc(c.prenom)}${c.nom ? ' ' + esc(c.nom) : ''}" title="Écrire à ${esc(c.prenom)}">${Icone('mobile', { taille: 14 })}</button>
              </div>`).join('')
            : `<div class="empty-state">Aucun contact n'a de numéro de téléphone. Ajoutez-le dans la fiche du contact (onglet Mail), ou dites à Nanika « le portable de Roger est le 06… ».</div>`}
          </div>
        </section>

        <section class="section-card mail-historique">
          <div class="section-card-header">
            <div class="section-card-title">${Icone('horloge', { taille: 16 })} Historique</div>
            <div class="search-input-wrap mail-recherche">
              <input class="search-input" id="smsRecherche" placeholder="Rechercher…" value="${esc(this.recherche)}">
            </div>
          </div>
          <div id="smsListe" class="mail-liste"><div class="empty-state">Chargement…</div></div>
        </section>
      </div>`;

    const champ = document.getElementById('smsA');
    const corps = document.getElementById('smsCorps');
    const compteur = () => {
      const s = Sms.segments(corps.value);
      const el = document.getElementById('smsCompteur');
      el.textContent = s.n ? `${s.n} caractère${s.n > 1 ? 's' : ''} · ${s.segments} SMS${s.unicode ? ' (caractères spéciaux : segments plus courts)' : ''}` : '';
      el.classList.toggle('sms-compteur-long', s.segments > 2);
    };
    corps.addEventListener('input', () => { compteur(); this._garderBrouillon(); });
    champ.addEventListener('input', () => this._garderBrouillon());
    document.getElementById('smsEnvoyer').addEventListener('click', () => this._envoyerFormulaire());
    document.getElementById('smsEffacer').addEventListener('click', () => this._vider());
    document.getElementById('smsAMoi')?.addEventListener('click', () => {
      const deja = champ.value.split(/[,;]/).map(x => x.trim()).filter(Boolean);
      if (!deja.some(x => /^moi$/i.test(x))) champ.value = [...deja, 'moi'].join(', ');
      corps.focus();
    });
    document.getElementById('btnSmsNanika').addEventListener('click', () => this._redigerAvecNanika());
    document.getElementById('smsTest')?.addEventListener('click', async e => {
      e.target.disabled = true;
      const r = await Sms.envoyer({ a: [cfg.monTelephone], noms: ['moi'], contenu: 'Test IDEAFORMA : les SMS fonctionnent.', confirme: false, source: 'manuel' });
      Toast.show(r.ok ? 'SMS de test envoyé — vérifiez votre téléphone' : `Échec : ${r.erreur}`, r.ok ? 'success' : 'error', 8000);
      e.target.disabled = false;
    });
    document.getElementById('btnSmsContact').addEventListener('click', () => MailPage.formContact());
    document.querySelectorAll('[data-sms-a]').forEach(b => b.addEventListener('click', () => {
      const deja = champ.value.trim();
      champ.value = deja ? `${deja}, ${b.dataset.smsA}` : b.dataset.smsA;
      this._garderBrouillon(); corps.focus();
    }));
    let minuteur = null;
    document.getElementById('smsRecherche').addEventListener('input', e => {
      clearTimeout(minuteur);
      minuteur = setTimeout(() => { this.recherche = e.target.value.trim(); this._chargerHistorique(); }, 250);
    });
    this._brancherSuggestions(contacts);
    this._restaurerBrouillon(); compteur();

    try { await this._chargerHistorique(); }
    catch (err) { peindreErreur(err); }
  },

  _garderBrouillon() {
    try { localStorage.setItem('sms_brouillon', JSON.stringify({ a: document.getElementById('smsA').value, corps: document.getElementById('smsCorps').value })); } catch { /* rien */ }
  },
  _restaurerBrouillon() {
    try {
      const b = JSON.parse(localStorage.getItem('sms_brouillon') || 'null');
      if (!b) return;
      document.getElementById('smsA').value = b.a || '';
      document.getElementById('smsCorps').value = b.corps || '';
    } catch { /* rien */ }
  },
  _vider() {
    document.getElementById('smsA').value = ''; document.getElementById('smsCorps').value = '';
    document.getElementById('smsCompteur').textContent = '';
    try { localStorage.removeItem('sms_brouillon'); } catch { /* rien */ }
    document.getElementById('smsA').focus();
  },
  remplir({ a = [], contenu = '' } = {}) {
    document.getElementById('smsA').value = a.join(', ');
    document.getElementById('smsCorps').value = contenu;
    document.getElementById('smsCorps').dispatchEvent(new Event('input'));
    document.querySelector('.mail-compose')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  _brancherSuggestions(contacts) {
    const champ = document.getElementById('smsA');
    const boite = document.getElementById('smsSuggestions');
    const montrer = () => {
      const q = Mails._norm(champ.value.split(/[,;]/).pop().trim());
      if (!q) { boite.hidden = true; return; }
      const trouves = contacts.filter(c => Mails._norm(`${c.prenom} ${c.nom || ''} ${c.societe || ''} ${c.telephone}`).includes(q)).slice(0, 6);
      if (!trouves.length) { boite.hidden = true; return; }
      boite.innerHTML = trouves.map(c => `
        <button type="button" class="mail-suggestion" data-id="${c.id}">
          <strong>${esc(c.prenom)}${c.nom ? ' ' + esc(c.nom) : ''}</strong> <span>${esc(Sms.joli(Sms.e164(c.telephone)))}</span>
        </button>`).join('');
      boite.hidden = false;
    };
    champ.addEventListener('input', montrer);
    champ.addEventListener('focus', montrer);
    champ.addEventListener('blur', () => setTimeout(() => { boite.hidden = true; }, 150));
    boite.addEventListener('mousedown', e => {
      const b = e.target.closest('[data-id]'); if (!b) return;
      e.preventDefault();
      const c = contacts.find(x => x.id === b.dataset.id);
      const parts = champ.value.split(/[,;]/); parts.pop();
      parts.push(`${c.prenom}${c.nom ? ' ' + c.nom : ''}`);
      champ.value = parts.map(x => x.trim()).filter(Boolean).join(', ');
      boite.hidden = true; this._garderBrouillon();
      document.getElementById('smsCorps').focus();
    });
  },

  async _envoyerFormulaire() {
    const bouton = document.getElementById('smsEnvoyer');
    const { a, noms, moi, ambigus, inconnus, sansTel } = await Sms.destinataires(document.getElementById('smsA').value);
    const contenu = document.getElementById('smsCorps').value.trim();

    if (ambigus.length) { Toast.show(`Plusieurs contacts pour « ${ambigus[0].saisie} » : ${ambigus[0].candidats.map(c => `${c.prenom} ${c.nom || ''}`.trim()).join(', ')} — précisez`, 'warning', 6000); return; }
    if (sansTel.length) { Toast.show(`${sansTel[0]} n'a pas de numéro de téléphone dans le carnet`, 'warning', 5000); return; }
    if (inconnus.length) { Toast.show(`« ${inconnus[0]} » n'est ni un numéro ni un contact connu`, 'warning', 5000); return; }
    if (!a.length)  { Toast.show('Indiquez au moins un destinataire', 'warning'); return; }
    if (!contenu)   { Toast.show('Le message est vide', 'warning'); return; }

    bouton.disabled = true;
    bouton.innerHTML = `${Icone('sablier', { taille: 16 })} Envoi…`;
    try {
      const r = await Sms.envoyer({ a, noms, contenu, confirme: a.some(x => x !== moi), source: 'manuel' });
      if (r.ok) { Toast.show(`SMS envoyé à ${a.map((n, i) => noms[i] || Sms.joli(n)).join(', ')}`, 'success'); this._vider(); }
      else Toast.show(`Échec de l'envoi : ${r.erreur}`, 'error', 7000);
    } finally {
      bouton.disabled = false;
      bouton.innerHTML = `${Icone('envoyer', { taille: 16 })} Envoyer`;
    }
  },

  _redigerAvecNanika() {
    const a = document.getElementById('smsA').value.trim();
    const brief = document.getElementById('smsCorps').value.trim();
    let demande = 'Rédige un SMS';
    if (a) demande += ` à ${a}`;
    demande += brief ? ` : ${brief}` : '.';
    if (!a && !brief) demande = 'Rédige un SMS pour moi — demande-moi le destinataire et le message.';
    Assistant.ouvrir().then(() => {
      const champ = document.getElementById('chatInput');
      if (champ) { champ.value = demande; Assistant.envoyer(); }
    });
  },

  async _chargerHistorique() {
    this._sms = await DataStore.getSms({ recherche: this.recherche, limite: 300 });
    this._peindreHistorique();
  },

  _peindreHistorique() {
    const zone = document.getElementById('smsListe');
    if (!zone) return;
    if (!this._sms.length) {
      zone.innerHTML = `<div class="empty-state">${this.recherche ? 'Aucun SMS ne correspond.' : 'Aucun SMS envoyé pour le moment.'}</div>`;
      return;
    }
    const groupes = [];
    this._sms.forEach(m => {
      const jour = Dates.iso(new Date(m.envoye_le));
      let g = groupes[groupes.length - 1];
      if (!g || g.jour !== jour) { g = { jour, sms: [] }; groupes.push(g); }
      g.sms.push(m);
    });
    const hui = Dates.aujourdhui(), hier = Dates.iso(new Date(Date.now() - 86400000));
    const libelleJour = j => j === hui ? "Aujourd'hui" : j === hier ? 'Hier' : Dates.longue(new Date(j + 'T12:00:00'));
    const dest = m => (m.destinataires || []).map((n, i) => (m.noms || [])[i] ? `${m.noms[i]} (${Sms.joli(n)})` : Sms.joli(n)).join(', ');

    zone.innerHTML = groupes.map(g => `
      <div class="mail-jour">
        <div class="mail-jour-titre">${esc(libelleJour(g.jour))}</div>
        ${g.sms.map(m => {
          const ouvert = this._ouvert === m.id;
          return `
          <article class="mail-item ${m.statut === 'echec' ? 'echec' : ''} ${ouvert ? 'ouvert' : ''}" data-sms="${m.id}">
            <div class="mail-item-tete">
              <span class="mail-item-heure">${Dates.heure(new Date(m.envoye_le))}</span>
              <span class="mail-item-a">${esc(dest(m))}</span>
              <span class="mail-item-source" title="${m.source === 'nanika' ? 'Envoyé par Nanika' : 'Écrit à la main'}">${Icone(m.source === 'nanika' ? 'nanika' : 'crayon', { taille: 14 })}</span>
              ${m.statut === 'echec' ? `<span class="mail-item-statut">${Icone('alerte', { taille: 14 })} Échec</span>` : ''}
            </div>
            <div class="sms-bulle">${esc(m.contenu).replace(/\n/g, '<br>')}</div>
            ${ouvert ? `
              ${m.erreur ? `<div class="mail-item-erreur">${esc(m.erreur)}</div>` : ''}
              <div class="mail-item-actions">
                <button class="btn btn-sm btn-primary" data-renvoyer="${m.id}" title="Même texto, autre destinataire">${Icone('envoyer', { taille: 14 })} Renvoyer à…</button>
                <button class="btn btn-sm btn-secondary" data-reutiliser="${m.id}">${Icone('rafraichir', { taille: 14 })} Réutiliser</button>
                <button class="btn btn-sm btn-icon danger" data-supprimer="${m.id}" title="Retirer de l'historique">${Icone('poubelle', { taille: 14 })}</button>
              </div>` : ''}
          </article>`;
        }).join('')}
      </div>`).join('');

    zone.onclick = async e => {
      const rv = e.target.closest('[data-renvoyer]');
      if (rv) {
        const m = this._sms.find(x => x.id === rv.dataset.renvoyer);
        if (m) { this.remplir({ a: [], contenu: m.contenu }); document.getElementById('smsA').focus(); Toast.show('Indiquez le nouveau destinataire, puis Envoyer', 'info'); }
        return;
      }
      const re = e.target.closest('[data-reutiliser]');
      if (re) {
        const m = this._sms.find(x => x.id === re.dataset.reutiliser);
        if (m) this.remplir({ a: (m.destinataires || []).map((n, i) => (m.noms || [])[i] || Sms.joli(n)), contenu: m.contenu });
        return;
      }
      const sup = e.target.closest('[data-supprimer]');
      if (sup) {
        await DataStore.deleteSms(sup.dataset.supprimer);
        this._ouvert = null; await this._chargerHistorique();
        Toast.show("Retiré de l'historique", 'info');
        return;
      }
      const item = e.target.closest('[data-sms]');
      if (item) { this._ouvert = this._ouvert === item.dataset.sms ? null : item.dataset.sms; this._peindreHistorique(); }
    };
  }
};
