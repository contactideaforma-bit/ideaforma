/* ─── App init ─── */

/* ── Modal ── */
const Modal = {
  open(title, body, actions = [], sizeClass = '') {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = body;
    document.getElementById('modal').className = `modal ${sizeClass}`;

    const footer = document.getElementById('modalFooter');
    footer.innerHTML = actions.map((a, i) =>
      `<button class="${a.cls}" id="modalAction${i}">${a.label}</button>`
    ).join('');
    actions.forEach((a, i) => {
      document.getElementById(`modalAction${i}`)?.addEventListener('click', a.action);
    });

    const overlay = document.getElementById('modalOverlay');
    overlay.style.display = 'flex';
    requestAnimationFrame(() => overlay.classList.add('visible'));
  },

  close() {
    const overlay = document.getElementById('modalOverlay');
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 200);
  }
};

/* ── Toast ── */
const Toast = {
  show(message, type = 'info', duration = 3200) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = { success: Icone('check', { taille: 16 }),
                    error:   Icone('alerte', { taille: 16 }),
                    warning: Icone('alerte', { taille: 16 }),
                    info:    Icone('info',   { taille: 16 }) };
    // Le message peut contenir un peu de mise en forme volontaire (<strong>),
    // mais jamais de contenu tiers non échappé : tous les appels qui insèrent
    // un message d'erreur passent par esc() au point d'appel.
    toast.innerHTML = `<span>${icons[type] || ''}</span> ${message}`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(20px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
};

/* ── Loading state ── */
const Loading = {
  show() {
    document.getElementById('pageContent').innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;min-height:280px;flex-direction:column;gap:14px;">
        <div class="loading-spinner"></div>
        <div style="font-size:13px;color:var(--text-muted);">Chargement…</div>
      </div>`;
  }
};

/* ── Dark mode ── */
const DarkMode = {
  KEY: 'ideaforma_theme',

  /* Thème crystal (v13) : l'application est TOUJOURS claire.
     Le mode sombre est retiré à la demande de l'utilisatrice — ne pas le
     réintroduire. Le bouton lune est masqué par css/crystal.css. */
  init() {
    localStorage.removeItem(this.KEY);
    this.apply(false, false);
  },

  toggle() { /* plus de mode sombre */ },

  apply(dark, save = true) {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    const sun  = document.getElementById('iconSun');
    const moon = document.getElementById('iconMoon');
    if (sun)  sun.style.display  = dark ? 'none'  : 'block';
    if (moon) moon.style.display = dark ? 'block' : 'none';
    if (save) localStorage.setItem(this.KEY, dark ? 'dark' : 'light');
  }
};

/* ── Mobile nav ── */
const MobileNav = {
  open()  {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebarBackdrop').classList.add('visible');
    document.body.style.overflow = 'hidden';
  },
  close() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarBackdrop').classList.remove('visible');
    document.body.style.overflow = '';
  },
  isOpen() { return document.getElementById('sidebar').classList.contains('open'); }
};

/* ── Settings page ── */
const SettingsPage = {

  _logoBase64: null, // cache local du logo

  /* ── Changement de mot de passe ── */
  _bindPasswordForm() {
    const form = document.getElementById('passwordForm');
    if (!form) return;

    const msg = document.getElementById('pwdMessage');
    const afficher = (texte, type) => {
      msg.textContent = texte;
      msg.style.display    = 'block';
      msg.style.background = type === 'ok' ? 'rgba(16,185,129,.10)' : 'rgba(239,68,68,.10)';
      msg.style.color      = type === 'ok' ? '#059669' : '#DC2626';
    };

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const actuel   = document.getElementById('pwdCurrent').value;
      const nouveau  = document.getElementById('pwdNew').value;
      const confirme = document.getElementById('pwdConfirm').value;
      const btn      = document.getElementById('savePwdBtn');

      msg.style.display = 'none';

      if (!actuel)                 return afficher('Saisissez votre mot de passe actuel.', 'ko');
      if (nouveau.length < 8)      return afficher('Le nouveau mot de passe doit contenir au moins 8 caractères.', 'ko');
      if (nouveau !== confirme)    return afficher('Les deux nouveaux mots de passe ne correspondent pas.', 'ko');
      if (nouveau === actuel)      return afficher('Le nouveau mot de passe doit être différent de l\'actuel.', 'ko');

      btn.disabled    = true;
      btn.textContent = 'Modification…';

      const res = await Auth.changePassword(actuel, nouveau);

      if (res.success) {
        form.reset();
        afficher('Mot de passe modifié. Il sera demandé à votre prochaine connexion.', 'ok');
        Toast.show('Mot de passe modifié', 'success');
      } else if (res.code === 'current') {
        afficher('Mot de passe actuel incorrect.', 'ko');
        document.getElementById('pwdCurrent').value = '';
        document.getElementById('pwdCurrent').focus();
      } else if (res.code === 'session') {
        afficher('Session expirée. Reconnectez-vous et réessayez.', 'ko');
      } else {
        afficher(/weak|should be/i.test(res.error || '')
          ? 'Mot de passe trop simple. Ajoutez des chiffres ou des caractères.'
          : 'Impossible de modifier le mot de passe. Réessayez.', 'ko');
      }

      btn.disabled    = false;
      btn.textContent = 'Changer le mot de passe';
    });
  },

  /* ══════════════════════════════════════════════
     NOTIFICATIONS
  ══════════════════════════════════════════════ */
  async _blocNotifications() {
    const etat      = Notifs.etat();
    const appareils = await DataStore.getPushSubscriptions().catch(() => []);
    const aVenir    = await DataStore.getRappelsAVenir(5).catch(() => []);
    const recents   = await DataStore.getRappelsRecents(6).catch(() => []);

    /* La clé publique VAPID est servie par /api/push-config : si elle ne
       répond pas, aucun appareil ne peut s'abonner, quoi qu'on fasse ici. */
    let serveur = { ok: false, detail: '' };
    try {
      const res = await fetch('/api/push-config', { cache: 'no-store' });
      const d   = await res.json().catch(() => ({}));
      serveur = res.ok && d.publicKey
        ? { ok: true,  detail: 'Le serveur de notifications répond.' }
        : { ok: false, detail: d.error || `Le serveur répond ${res.status}.` };
    } catch (err) { serveur = { ok: false, detail: 'Le serveur de notifications ne répond pas : ' + err.message }; }

    const bandeau = {
      accorde:      ['ok',      Icone('cloche', { taille: 17 }), 'Les notifications sont autorisées sur cet appareil.'],
      a_demander:   ['attente', Icone('clocheOff', { taille: 17 }), 'Les notifications ne sont pas encore activées sur cet appareil.'],
      refuse:       ['ko',      Icone('interdit', { taille: 17 }), 'Les notifications sont bloquées par le navigateur. Il faut les réautoriser dans ses réglages (cadenas dans la barre d\'adresse → Notifications).'],
      non_supporte: ['ko',      Icone('alerte', { taille: 17 }), 'Ce navigateur ne gère pas les notifications poussées.']
    }[etat];

    const conseilIOS = Notifs.estIOS() && !Notifs.estInstallee() ? `
      <div class="alert-note" style="margin-bottom:14px;">
        <span class="alert-note-icon">${Icone('mobile', { taille: 17 })}</span>
        <span><strong>Sur iPhone / iPad</strong>, les notifications n'existent que si
        l'application est installée : bouton <strong>Partager</strong> dans Safari →
        <strong>« Sur l'écran d'accueil »</strong>. Rouvrez ensuite IDEAFORMA depuis
        l'icône, puis revenez ici pour activer les notifications.</span>
      </div>` : '';

    return `
      <div class="section-card">
        <div class="section-card-header">
          <div class="section-card-title">${Icone('cloche', { taille: 16 })} Notifications</div>
        </div>
        <div class="section-card-body">
          ${conseilIOS}
          <div class="notif-etat ${bandeau[0]}">
            <span class="notif-etat-ic">${bandeau[1]}</span>
            <span>${bandeau[2]}</span>
          </div>
          <div class="notif-etat ${serveur.ok ? 'ok' : 'ko'}" style="margin-top:8px;">
            <span class="notif-etat-ic">${Icone(serveur.ok ? 'check' : 'alerte', { taille: 17 })}</span>
            <span>${esc(serveur.detail)}${serveur.ok ? '' : ' — vérifiez les variables VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, SUPABASE_SERVICE_ROLE_KEY et RAPPELS_SECRET dans Vercel.'}</span>
          </div>

          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            ${etat === 'accorde'
              ? `<button class="btn btn-sm btn-secondary" id="btnTestNotif">Tester tout de suite</button>
                 <button class="btn btn-sm btn-secondary" id="btnTestChaine">Tester le rappel serveur (1 min)</button>
                 <button class="btn btn-sm btn-secondary" id="btnCouperNotif" style="color:var(--danger);">
                   Désactiver sur cet appareil</button>`
              : `<button class="btn btn-sm btn-primary" id="btnActiverNotif"
                   ${etat === 'non_supporte' || etat === 'refuse' ? 'disabled' : ''}>
                   Activer les notifications</button>`}
          </div>

          ${appareils.length ? `
            <div style="border-top:1px solid var(--border);margin-top:16px;padding-top:12px;">
              <div style="font-size:12px;font-weight:700;text-transform:uppercase;
                          letter-spacing:.5px;color:var(--text-muted);margin-bottom:6px;">
                Appareils abonnés
              </div>
              ${appareils.map(a => `
                <div class="appareil-ligne">
                  <div>
                    <div class="appareil-nom">${esc(a.appareil || 'Appareil')} ${a.actif ? '' : '· inactif'}</div>
                    <div class="appareil-date">
                      inscrit ${Dates.relative(a.cree_le)}${
                        a.derniere_utilisation ? ` · dernier envoi ${Dates.relative(a.derniere_utilisation)}` : ''}
                    </div>
                  </div>
                  <button class="btn-icon danger" data-sub-del="${esc(a.endpoint)}"
                          title="Retirer" aria-label="Retirer cet appareil"
                          >${Icone('poubelle', { taille: 16 })}</button>
                </div>`).join('')}
            </div>` : ''}

          ${aVenir.length ? `
            <div style="border-top:1px solid var(--border);margin-top:16px;padding-top:12px;">
              <div style="font-size:12px;font-weight:700;text-transform:uppercase;
                          letter-spacing:.5px;color:var(--text-muted);margin-bottom:6px;">
                Prochains rappels programmés
              </div>
              ${aVenir.map(r => `
                <div class="appareil-ligne">
                  <div class="appareil-nom">${esc(r.titre)}</div>
                  <div class="appareil-date">
                    ${Dates.relative(r.envoyer_a)} à ${Dates.heure(r.envoyer_a)}
                  </div>
                </div>`).join('')}
            </div>` : ''}

          ${recents.length ? `
            <div style="border-top:1px solid var(--border);margin-top:16px;padding-top:12px;">
              <div style="font-size:12px;font-weight:700;text-transform:uppercase;
                          letter-spacing:.5px;color:var(--text-muted);margin-bottom:6px;">
                Derniers rappels traités par le serveur
              </div>
              ${recents.map(r => `
                <div class="appareil-ligne">
                  <div>
                    <div class="appareil-nom">${esc(r.titre)}</div>
                    <div class="appareil-date">
                      ${Dates.relative(r.envoyer_a)} à ${Dates.heure(r.envoyer_a)}
                      · <strong style="color:${r.statut === 'envoye' ? 'var(--success)' : 'var(--danger)'}">
                        ${r.statut === 'envoye' ? 'envoyé' : r.statut === 'erreur' ? 'échec' : r.statut}</strong>
                      ${r.erreur ? ` — ${esc(String(r.erreur).slice(0, 160))}` : ''}
                    </div>
                  </div>
                </div>`).join('')}
            </div>` : ''}

          <div style="border-top:1px solid var(--border);margin-top:16px;padding-top:12px;
                      font-size:12.5px;color:var(--text-muted);line-height:1.6;">
            Un rappel part à l'heure programmée même si l'application est fermée,
            à condition que la migration <strong>setup_update8.sql</strong> ait été jouée
            et que les variables VAPID soient renseignées dans Vercel.
            Sans cela, seuls les rappels internes fonctionnent, application ouverte.
          </div>
        </div>
      </div>`;
  },

  /* ══════════════════════════════════════════════
     ÉTIQUETTES
  ══════════════════════════════════════════════ */
  async _blocEtiquettes() {
    const etiquettes = await DataStore.getEtiquettes(true).catch(() => []);
    return `
      <div class="section-card">
        <div class="section-card-header">
          <div class="section-card-title">${Icone('etiquette', { taille: 16 })} Étiquettes</div>
          <button class="btn btn-sm btn-secondary" id="btnAjoutEtiq">${Icone('plus', { taille: 16 })} Étiquette</button>
        </div>
        <div class="section-card-body">
          <div style="font-size:12.5px;color:var(--text-muted);margin-bottom:12px;line-height:1.6;">
            Les étiquettes classent tâches, rendez-vous, notes et documents dans un
            seul et même espace : c'est ce qui sépare le professionnel du personnel
            sans avoir à changer d'application.
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;">
            ${etiquettes.map(e => `
              <span class="liste-chip" data-etiq="${e.id}"
                    style="border-color:${e.couleur};color:${e.couleur};cursor:pointer;">
                ${Icone(e.icone, { taille: 15, defaut: 'etiquette' })} ${esc(e.nom)}${
                  e.systeme ? '' : ' ' + Icone('crayon', { taille: 13 })}
              </span>`).join('') || '<span style="color:var(--text-muted);font-size:13px;">Aucune étiquette.</span>'}
          </div>
        </div>
      </div>`;
  },

  _formEtiquette(e = null, apres = null) {
    Modal.open(e ? 'Modifier l\'étiquette' : 'Nouvelle étiquette', `
      <div class="form-grid">
        <div class="field form-col-full">
          <label>Nom *</label>
          <input id="etNom" value="${esc(e?.nom)}" placeholder="Ex. Association, Copropriété, Sport" />
        </div>
        <div class="field">
          <label>Couleur</label>
          <input type="color" id="etCouleur" value="${e?.couleur || '#9E3057'}" style="height:42px;padding:3px;" />
        </div>
        <div class="field form-col-full">
          <label>Pictogramme</label>
          ${grilleIcones('etIcone', CHOIX_ETIQUETTE, e?.icone)}
        </div>
      </div>`, [
      ...(e && !e.systeme ? [{
        label: 'Supprimer', cls: 'btn btn-danger', action: async () => {
          await DataStore.deleteEtiquette(e.id);
          Modal.close();
          if (apres) await apres(); else this.render();
        }
      }] : []),
      { label: 'Annuler', cls: 'btn btn-secondary', action: () => Modal.close() },
      { label: e ? 'Enregistrer' : 'Créer', cls: 'btn btn-primary', action: async () => {
          const d = {
            nom:     document.getElementById('etNom').value.trim(),
            icone:   document.getElementById('etIcone').value,
            couleur: document.getElementById('etCouleur').value
          };
          if (!d.nom) { Toast.show('Un nom est nécessaire', 'error'); return; }
          try {
            if (e) await DataStore.updateEtiquette(e.id, d);
            else   await DataStore.addEtiquette(d);
            Modal.close();
            if (apres) await apres(); else this.render();
          } catch (err) {
            Toast.show(/duplicate|unique/i.test(err.message)
              ? 'Cette étiquette existe déjà.' : 'Erreur : ' + esc(err.message), 'error');
          }
        } }
    ], 'modal-sm');

    brancherGrilleIcones(document.getElementById('modalBody'));
  },

  async render() {
    document.getElementById('pageTitle').textContent    = 'Paramètres';
    document.getElementById('pageSubtitle').textContent = 'Organisme, notifications, sécurité';
    document.getElementById('pageHeaderRight').innerHTML = '';
    Loading.show();

    let profile = {};
    try { profile = (await DataStore.getProfile()) || {}; } catch { /* ignore */ }

    this._logoBase64 = profile.logo_base64 || null;
    const couleur    = profile.couleur_primaire || '#1E2D4B';
    /* profiles.email peut être vide sur les comptes créés avant le trigger :
       on retombe sur l'adresse de la session. */
    const emailCompte = profile.email || (await Auth.getUser())?.email || '';

    const [blocNotifs, blocEtiquettes] = await Promise.all([
      this._blocNotifications().catch(() => ''),
      this._blocEtiquettes().catch(() => '')
    ]);

    document.getElementById('pageContent').innerHTML = `
      <div style="max-width:720px;margin:0 auto;display:flex;flex-direction:column;gap:20px;">

        ${blocNotifs}
        ${blocEtiquettes}

        <!-- ── Identité organisme ── -->
        <div class="section-card">
          <div class="section-card-header">
            <div class="section-card-title">${Icone('batiment', { taille: 16 })} Organisme de formation</div>
          </div>
          <div class="section-card-body">
            <form id="settingsForm" novalidate>
              <div class="form-grid">
                <div class="field form-col-full">
                  <label>Nom de l'organisme *</label>
                  <input type="text" name="organisme" value="${esc(profile.organisme||profile.nom)}"
                    placeholder="Ex. Ideaforma" required />
                </div>
                <div class="field">
                  <label>SIRET</label>
                  <input type="text" name="siret" value="${esc(profile.siret)}"
                    placeholder="14 chiffres" maxlength="14" />
                </div>
                <div class="field">
                  <label>Téléphone</label>
                  <input type="tel" name="telephone" value="${esc(profile.telephone)}"
                    placeholder="01 23 45 67 89" />
                </div>
                <div class="field form-col-full">
                  <label>Adresse complète</label>
                  <input type="text" name="adresse" value="${esc(profile.adresse)}"
                    placeholder="Ex. 12 rue de la Formation, 75001 Paris" />
                </div>
                <div class="field">
                  <label>N° Déclaration d'activité (NDA)</label>
                  <input type="text" name="numero_da" value="${esc(profile.numero_da)}"
                    placeholder="Ex. 11755XXXXXXXXX" />
                </div>
                <div class="field">
                  <label>N° Certification Qualiopi</label>
                  <input type="text" name="numero_qualiopi" value="${esc(profile.numero_qualiopi)}"
                    placeholder="Ex. 2023/2026-XXX" />
                </div>
              </div>

              <!-- ── Logo et couleur ── -->
              <div style="border-top:1px solid var(--border);margin-top:18px;padding-top:18px;">
                <div style="font-size:13px;font-weight:600;color:var(--navy);margin-bottom:14px;">
                  ${Icone('palette', { taille: 16 })} Personnalisation des documents PDF
                </div>
                <div class="form-grid">
                  <div class="field">
                    <label>Logo de l'organisme</label>
                    <div class="logo-upload-area" id="logoUploadArea">
                      ${this._logoBase64
                        ? `<img id="logoPreview" src="${this._logoBase64}" alt="Logo" style="max-height:60px;max-width:160px;object-fit:contain;" />`
                        : `<div id="logoPreview" style="color:var(--text-muted);font-size:13px;">Cliquer pour choisir<br><small>PNG, JPG, SVG — max 500 Ko</small></div>`
                      }
                    </div>
                    <input type="file" id="logoInput" accept="image/png,image/jpeg,image/svg+xml,image/gif"
                      style="display:none;" />
                    <div style="display:flex;gap:8px;margin-top:6px;">
                      <button type="button" class="btn btn-sm btn-secondary" id="pickLogoBtn">
                        ${Icone('dossier', { taille: 16 })} Choisir un logo
                      </button>
                      ${this._logoBase64
                        ? `<button type="button" class="btn btn-sm btn-secondary" id="removeLogoBtn" style="color:var(--danger);">${Icone('fermer', { taille: 15 })} Supprimer</button>`
                        : ''}
                    </div>
                  </div>
                  <div class="field" style="display:flex;flex-direction:column;gap:12px;">
                    <div>
                      <label>Couleur principale</label>
                      <div style="display:flex;align-items:center;gap:10px;margin-top:4px;">
                        <input type="color" name="couleur_primaire" id="colorPicker"
                          value="${couleur}"
                          style="width:44px;height:44px;border:2px solid var(--border);border-radius:8px;cursor:pointer;padding:2px;" />
                        <div>
                          <div id="colorPreviewLabel" style="font-size:13px;font-weight:600;color:${couleur};">${couleur.toUpperCase()}</div>
                          <div style="font-size:11px;color:var(--text-muted);">Titres, séparateurs</div>
                          <div id="colorSwatch" style="margin-top:3px;height:6px;width:80px;border-radius:3px;background:${couleur};"></div>
                        </div>
                      </div>
                    </div>
                    <div>
                      <label>Couleur secondaire</label>
                      <div style="display:flex;align-items:center;gap:10px;margin-top:4px;">
                        <input type="color" name="couleur_secondaire" id="colorPicker2"
                          value="${esc(profile.couleur_secondaire||'#3B82F6')}"
                          style="width:44px;height:44px;border:2px solid var(--border);border-radius:8px;cursor:pointer;padding:2px;" />
                        <div>
                          <div id="colorPreviewLabel2" style="font-size:13px;font-weight:600;color:${esc(profile.couleur_secondaire||'#3B82F6')};">${(profile.couleur_secondaire||'#3B82F6').toUpperCase()}</div>
                          <div style="font-size:11px;color:var(--text-muted);">Fonds de section, tableaux</div>
                          <div id="colorSwatch2" style="margin-top:3px;height:6px;width:80px;border-radius:3px;background:${esc(profile.couleur_secondaire||'#3B82F6')};"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div style="margin-top:20px;">
                <button type="submit" class="btn btn-primary" id="saveSettingsBtn">
                  ${Icone('enregistrer', { taille: 16 })} Enregistrer les paramètres
                </button>
              </div>
            </form>
          </div>
        </div>

        <!-- ── Info PDF ── -->
        <div class="section-card">
          <div class="section-card-header">
            <div class="section-card-title">${Icone('document', { taille: 16 })} Documents générés</div>
          </div>
          <div class="section-card-body">
            <p style="font-size:13.5px;color:var(--text-muted);line-height:1.7;margin:0;">
              Tous les documents (devis, programme pédagogique, convention, feuilles de présence, facture)
              utilisent les informations ci-dessus. <strong>Le logo et la couleur principale</strong>
              personnalisent l'en-tête de chaque PDF.<br><br>
              Pour générer des documents, créez ou ouvrez une <strong>formation</strong> depuis
              la page de l'OPCO correspondant.
            </p>
          </div>
        </div>

        <!-- ── Sécurité ── -->
        <div class="section-card">
          <div class="section-card-header">
            <div class="section-card-title">${Icone('cadenas', { taille: 16 })} Sécurité</div>
          </div>
          <div class="section-card-body">
            <div style="font-size:13px;color:var(--text-muted);margin-bottom:14px;line-height:1.6;">
              Compte connecté : <strong style="color:var(--text);">${esc(emailCompte)}</strong>
            </div>

            <form id="passwordForm" novalidate>
              <div class="form-grid">
                <div class="field form-col-full">
                  <label>Mot de passe actuel</label>
                  <input type="password" id="pwdCurrent" autocomplete="current-password"
                         placeholder="••••••••••" required />
                </div>
                <div class="field">
                  <label>Nouveau mot de passe</label>
                  <input type="password" id="pwdNew" autocomplete="new-password"
                         placeholder="8 caractères minimum" required minlength="8" />
                </div>
                <div class="field">
                  <label>Confirmer</label>
                  <input type="password" id="pwdConfirm" autocomplete="new-password"
                         placeholder="••••••••••" required />
                </div>
              </div>

              <div id="pwdMessage" style="display:none;font-size:13px;margin-top:12px;padding:10px 12px;border-radius:8px;"></div>

              <div style="margin-top:16px;">
                <button type="submit" class="btn btn-secondary" id="savePwdBtn">
                  Changer le mot de passe
                </button>
              </div>
            </form>

            <div style="border-top:1px solid var(--border);margin-top:18px;padding-top:14px;
                        font-size:12.5px;color:var(--text-muted);line-height:1.6;">
              Mot de passe oublié ? Déconnectez-vous, puis utilisez le lien
              <em>« Mot de passe oublié ? »</em> sur la page de connexion : vous recevrez
              un lien de réinitialisation valable 1 heure.
            </div>
          </div>
        </div>

      </div>`;

    this._bindPasswordForm();
    this._bindNotifications();
    this._bindEtiquettes();

    // ── Logo events ──
    document.getElementById('pickLogoBtn')?.addEventListener('click', () =>
      document.getElementById('logoInput').click()
    );
    document.getElementById('logoUploadArea')?.addEventListener('click', () =>
      document.getElementById('logoInput').click()
    );
    document.getElementById('logoInput')?.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 512 * 1024) { Toast.show('Logo trop lourd (max 500 Ko)', 'error'); return; }
      const reader = new FileReader();
      reader.onload = ev => {
        this._logoBase64 = ev.target.result;
        const preview = document.getElementById('logoPreview');
        if (preview.tagName === 'IMG') {
          preview.src = this._logoBase64;
        } else {
          preview.outerHTML = `<img id="logoPreview" src="${this._logoBase64}" alt="Logo" style="max-height:60px;max-width:160px;object-fit:contain;" />`;
        }
        Toast.show('Logo chargé — enregistrez pour sauvegarder', 'info');
      };
      reader.readAsDataURL(file);
    });
    document.getElementById('removeLogoBtn')?.addEventListener('click', () => {
      this._logoBase64 = null;
      const preview = document.getElementById('logoPreview');
      if (preview) preview.outerHTML = `<div id="logoPreview" style="color:var(--text-muted);font-size:13px;">Cliquer pour choisir<br><small>PNG, JPG, SVG — max 500 Ko</small></div>`;
      document.getElementById('removeLogoBtn')?.remove();
    });

    // ── Color pickers live preview ──
    document.getElementById('colorPicker')?.addEventListener('input', e => {
      const c = e.target.value;
      document.getElementById('colorPreviewLabel').textContent = c.toUpperCase();
      document.getElementById('colorPreviewLabel').style.color = c;
      document.getElementById('colorSwatch').style.background  = c;
    });
    document.getElementById('colorPicker2')?.addEventListener('input', e => {
      const c = e.target.value;
      document.getElementById('colorPreviewLabel2').textContent = c.toUpperCase();
      document.getElementById('colorPreviewLabel2').style.color = c;
      document.getElementById('colorSwatch2').style.background  = c;
    });

    // ── Save ──
    document.getElementById('settingsForm').addEventListener('submit', async e => {
      e.preventDefault();
      const form = e.target;
      const btn  = document.getElementById('saveSettingsBtn');
      const data = {
        organisme:        form.querySelector('[name="organisme"]').value.trim(),
        siret:            form.querySelector('[name="siret"]').value.trim(),
        telephone:        form.querySelector('[name="telephone"]').value.trim(),
        adresse:          form.querySelector('[name="adresse"]').value.trim(),
        numero_da:        form.querySelector('[name="numero_da"]').value.trim(),
        numero_qualiopi:  form.querySelector('[name="numero_qualiopi"]').value.trim(),
        couleur_primaire:   form.querySelector('[name="couleur_primaire"]').value,
        couleur_secondaire: form.querySelector('[name="couleur_secondaire"]').value,
        logo_base64:        this._logoBase64
      };
      if (!data.organisme) { Toast.show('Le nom de l\'organisme est requis', 'error'); return; }
      btn.disabled = true; btn.textContent = 'Enregistrement…';
      try {
        await DataStore.updateProfile(data);
        Toast.show('Paramètres enregistrés', 'success');
      } catch (err) {
        Toast.show('Erreur : ' + esc(err.message), 'error');
      }
      btn.disabled = false;
      btn.innerHTML = `${Icone('enregistrer', { taille: 16 })} Enregistrer les paramètres`;
    });
  },

  _bindNotifications() {
    const essai = async (fn, succes) => {
      try { await fn(); if (succes) Toast.show(succes, 'success'); }
      catch (err) { Toast.show(esc(err.message), 'error', 7000); }
    };

    document.getElementById('btnActiverNotif')?.addEventListener('click', async () => {
      await essai(() => Notifs.activer());
      this.render();
    });

    document.getElementById('btnCouperNotif')?.addEventListener('click', async () => {
      await essai(() => Notifs.desactiver());
      this.render();
    });

    document.getElementById('btnTestNotif')?.addEventListener('click', () =>
      essai(() => Notifs.tester()));

    document.getElementById('btnTestChaine')?.addEventListener('click', async () => {
      try {
        const quand = await Notifs.testerChaineComplete();
        Toast.show(`Rappel programmé pour ${Dates.heure(quand)} — fermez l'application et attendez.`,
                   'info', 8000);
        this.render();
      } catch (err) { Toast.show(esc(err.message), 'error'); }
    });

    document.querySelectorAll('[data-sub-del]').forEach(b =>
      b.addEventListener('click', async () => {
        await DataStore.deletePushSubscription(b.dataset.subDel);
        this.render();
      })
    );
  },

  _bindEtiquettes() {
    document.getElementById('btnAjoutEtiq')?.addEventListener('click', () => this._formEtiquette());
    document.querySelectorAll('[data-etiq]').forEach(el =>
      el.addEventListener('click', async () => {
        const liste = await DataStore.getEtiquettes();
        const e = liste.find(x => x.id === el.dataset.etiq);
        if (e) this._formEtiquette(e);
      })
    );
  }
};

/* ── Router ── */
const Router = {
  currentPage: 'dashboard',

  PAGES: {
    dashboard: () => Hub.render(),
    assistant: () => Assistant.render(),
    agenda:    () => Agenda.render(),
    taches:    () => Taches.render(),
    notes:     () => Notes.render(),
    coffre:    () => Coffre.render(),
    journee:   () => JourneePage.render(),
    parcours:  () => ParcoursPage.render(),
    activite:  () => Dashboard.render(),
    settings:  () => SettingsPage.render()
  },

  navigate(page, sansHistorique = false) {
    // L'assistant n'est plus une page : c'est le panneau flottant
    if (page === 'assistant') { Assistant.ouvrir(); return; }
    this.currentPage = page;
    document.querySelectorAll('.nav-item').forEach(el =>
      el.classList.toggle('active', el.dataset.page === page)
    );

    if (!sansHistorique && location.hash.slice(1) !== page) {
      history.replaceState(null, '', '#' + page);
    }

    const rendu = this.PAGES[page];
    if (rendu) { rendu(); return; }

    // Tout le reste : une page OPCO
    OpcoPage.currentTab    = 'clients';
    OpcoPage.searchQuery   = '';
    OpcoPage.filterStatus  = '';
    OpcoPage._cachedClients = [];
    OpcoPage.render(page);
  }
};

/* ── Badges de la barre latérale ── */
async function updateJourneeBadge() {
  const pastille = (id, n) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (n > 0) { el.textContent = n > 99 ? '99+' : n; el.style.display = 'inline-block'; }
    else       { el.style.display = 'none'; }
  };

  try {
    const actions = await DataStore.getActionsDuJour(0);   // échéance ≤ aujourd'hui
    pastille('navJourneeBadge', actions.length);
  } catch { pastille('navJourneeBadge', 0); }

  try {
    const hui    = Dates.aujourdhui();
    const taches = await DataStore.getTachesFiltrees({ fait: false, horizonJours: 0 });
    pastille('navTachesBadge', taches.filter(t => t.echeance && t.echeance <= hui).length);
  } catch { pastille('navTachesBadge', 0); }

  try {
    const j0 = new Date(); j0.setHours(0, 0, 0, 0);
    const j1 = new Date(j0.getTime() + 86400000);
    const items = await DataStore.getAgenda(new Date().toISOString(), j1.toISOString(),
                                            { types: ['evenement', 'session'] });
    pastille('navAgendaBadge', items.length);
  } catch { pastille('navAgendaBadge', 0); }
}

/* ── Nav dots update ── */
async function updateNavDots() {
  try {
    const all = await DataStore.getAllClients();
    DataStore.OPCOS.forEach(op => {
      const count = all.filter(c => c.opco === op).length;
      const dot   = document.querySelector(`[data-opco="${op}"]`);
      if (dot) dot.parentElement.classList.toggle('has-clients', count > 0);
    });
  } catch { /* silently ignore */ }
}

/* ── Bootstrap ── */
document.addEventListener('DOMContentLoaded', async () => {

  // Dark mode first (avoid flash)
  DarkMode.init();

  // Service worker : installation de l'app + réception des notifications.
  // Enregistré avant toute autre chose pour que l'app soit installable dès
  // la première visite.
  Notifs.initServiceWorker();

  // Check Supabase session
  const session = await Auth.getSession();
  if (!session) {
    window.location.href = 'index.html';
    return;
  }

  // User info in sidebar
  const user = session.user;
  const displayName = user.user_metadata?.nom || user.email;
  document.getElementById('userName').textContent   = displayName;
  document.getElementById('userAvatar').textContent = displayName.charAt(0).toUpperCase();

  // Auth state listener
  Auth.onAuthChange((event) => {
    if (event === 'SIGNED_OUT') window.location.href = 'index.html';
  });

  // Dark mode toggle
  document.getElementById('darkToggle').addEventListener('click', () => DarkMode.toggle());

  // Hamburger / mobile nav
  document.getElementById('hamburgerBtn').addEventListener('click', () => {
    MobileNav.isOpen() ? MobileNav.close() : MobileNav.open();
  });
  document.getElementById('sidebarBackdrop').addEventListener('click', () => MobileNav.close());

  // Logout
  document.getElementById('logoutBtn').addEventListener('click', () => Auth.logout());

  // Modal close
  document.getElementById('modalClose').addEventListener('click', () => Modal.close());
  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) Modal.close();
  });

  // Navigation clicks
  document.getElementById('sidebarNav').addEventListener('click', e => {
    const item = e.target.closest('.nav-item');
    if (!item?.dataset.page) return;
    Router.navigate(item.dataset.page);
    MobileNav.close();
  });

  // Retour arrière du navigateur / lien de notification (#agenda, #taches…)
  window.addEventListener('hashchange', () => {
    const page = location.hash.slice(1);
    const connue = Router.PAGES[page] || DataStore.OPCOS.includes(page);
    if (page && connue && page !== Router.currentPage) Router.navigate(page, true);
  });

  // Keyboard
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { Modal.close(); MobileNav.close(); }
  });

  // Nav dots async init
  updateNavDots();
  updateJourneeBadge();

  // Surveillance des rendez-vous imminents tant que l'onglet est ouvert
  Notifs.demarrerVeille();

  // Le bouton d'assistant, en bas à droite de toutes les pages
  Assistant.monter();

  // Rafraîchissement des pastilles toutes les 5 minutes
  setInterval(updateJourneeBadge, 300000);

  // Page initiale : celle demandée dans l'URL, sinon le tableau de bord
  const depart = location.hash.slice(1);
  Router.navigate(depart && (Router.PAGES[depart] || DataStore.OPCOS.includes(depart))
    ? depart : 'dashboard', true);
});
