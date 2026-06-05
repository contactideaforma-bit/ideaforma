/* ─── Auth — Supabase Auth ─── */
const Auth = {

  async login(email, password) {
    const { data, error } = await supa.auth.signInWithPassword({ email, password });
    if (error) {
      const detail = `[${error.status || '?'}] ${error.code || ''} — ${error.message}`;
      console.error('[Auth] Échec login:', detail, error);
      return { success: false, error: detail };
    }
    return { success: true, user: data.user };
  },

  async signup(email, password, nom) {
    const { data, error } = await supa.auth.signUp({
      email,
      password,
      options: {
        data: { nom },
        emailRedirectTo: window.location.origin + '/index.html'
      }
    });
    if (error) {
      const detail = `[${error.status || '?'}] ${error.code || ''} — ${error.message}`;
      console.error('[Auth] Échec inscription:', detail, error);
      return { success: false, error: detail };
    }
    // Supabase renvoie un user même sans confirmation email dans certains projets
    const needsConfirm = !data.session;
    return { success: true, user: data.user, needsConfirm };
  },

  async sendPasswordReset(email) {
    const { error } = await supa.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/reset-password.html'
    });
    if (error) {
      const detail = `[${error.status || '?'}] ${error.code || ''} — ${error.message}`;
      console.error('[Auth] Échec reset password:', detail, error);
      return { success: false, error: detail };
    }
    return { success: true };
  },

  async updatePassword(newPassword) {
    const { data, error } = await supa.auth.updateUser({ password: newPassword });
    if (error) {
      const detail = `[${error.status || '?'}] ${error.code || ''} — ${error.message}`;
      console.error('[Auth] Échec updatePassword:', detail, error);
      return { success: false, error: detail };
    }
    return { success: true, user: data.user };
  },

  async logout() {
    await supa.auth.signOut();
    window.location.href = 'index.html';
  },

  async getSession() {
    const { data: { session } } = await supa.auth.getSession();
    return session;
  },

  async getUser() {
    const { data: { session } } = await supa.auth.getSession();
    return session?.user || null;
  },

  onAuthChange(callback) {
    return supa.auth.onAuthStateChange(callback);
  }
};
