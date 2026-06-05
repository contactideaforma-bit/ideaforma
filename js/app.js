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
    const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
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

  init() {
    const saved       = localStorage.getItem(this.KEY);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    this.apply(saved ? saved === 'dark' : prefersDark, false);
  },

  toggle() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    this.apply(!isDark);
  },

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

  async render() {
    document.getElementById('pageTitle').textContent    = 'Paramètres';
    document.getElementById('pageSubtitle').textContent = 'Informations de votre organisme';
    document.getElementById('pageHeaderRight').innerHTML = '';
    Loading.show();

    let profile = {};
    try { profile = (await DataStore.getProfile()) || {}; } catch { /* ignore */ }

    document.getElementById('pageContent').innerHTML = `
      <div style="max-width:680px;margin:0 auto;">

        <div class="section-card" style="margin-bottom:20px;">
          <div class="section-card-header">
            <div class="section-card-title">🏢 Organisme de formation</div>
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
              <div style="margin-top:16px;">
                <button type="submit" class="btn btn-primary" id="saveSettingsBtn">
                  💾 Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>

        <div class="section-card">
          <div class="section-card-header">
            <div class="section-card-title">📄 Documents PDF</div>
          </div>
          <div class="section-card-body">
            <p style="font-size:13.5px;color:var(--text-muted);line-height:1.6;margin:0;">
              Les informations ci-dessus (nom, SIRET, adresse, N° DA, Qualiopi) apparaissent
              automatiquement dans tous les documents générés : devis, conventions, feuilles de présence
              et factures.<br><br>
              Pour générer un document, ouvrez la <strong>fiche d'un dossier</strong> (bouton 👁️
              dans la liste des clients) et cliquez sur le document souhaité.
            </p>
          </div>
        </div>

      </div>`;

    document.getElementById('settingsForm').addEventListener('submit', async e => {
      e.preventDefault();
      const form = e.target;
      const btn  = document.getElementById('saveSettingsBtn');
      const data = {
        organisme:       form.querySelector('[name="organisme"]').value.trim(),
        siret:           form.querySelector('[name="siret"]').value.trim(),
        telephone:       form.querySelector('[name="telephone"]').value.trim(),
        adresse:         form.querySelector('[name="adresse"]').value.trim(),
        numero_da:       form.querySelector('[name="numero_da"]').value.trim(),
        numero_qualiopi: form.querySelector('[name="numero_qualiopi"]').value.trim()
      };
      if (!data.organisme) { Toast.show('Le nom de l\'organisme est requis', 'error'); return; }
      btn.disabled = true; btn.textContent = 'Enregistrement…';
      try {
        await DataStore.updateProfile(data);
        Toast.show('Paramètres enregistrés ✓', 'success');
      } catch (err) {
        Toast.show('Erreur : ' + err.message, 'error');
      }
      btn.disabled = false; btn.textContent = '💾 Enregistrer';
    });
  }
};

/* ── Router ── */
const Router = {
  currentPage: 'dashboard',

  navigate(page) {
    this.currentPage = page;
    document.querySelectorAll('.nav-item').forEach(el =>
      el.classList.toggle('active', el.dataset.page === page)
    );

    if (page === 'dashboard') {
      Dashboard.render();
    } else if (page === 'settings') {
      SettingsPage.render();
    } else {
      OpcoPage.currentTab    = 'clients';
      OpcoPage.searchQuery   = '';
      OpcoPage.filterStatus  = '';
      OpcoPage._cachedClients = [];
      OpcoPage.render(page);
    }
  }
};

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

  // Keyboard
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { Modal.close(); MobileNav.close(); }
  });

  // Nav dots async init
  updateNavDots();

  // Initial render
  Router.navigate('dashboard');
});
