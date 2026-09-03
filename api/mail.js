/* ─── Vercel Serverless Function — envoi d'e-mails par Nanika ─────────────────
   Variables d'environnement (Vercel → Settings → Environment Variables) :

     RESEND_API_KEY   re_...            la clé Resend (déjà utilisée pour les
                                        mails d'authentification Supabase)
     MAIL_FROM        IDEAFORMA <contact@ideaforma.fr>
                                        expéditeur. Sans domaine vérifié chez
                                        Resend, laisser vide : on retombe sur
                                        « IDEAFORMA <onboarding@resend.dev> »,
                                        qui ne peut écrire QU'À l'adresse du
                                        compte Resend (la vôtre).
     SUPABASE_URL / SUPABASE_ANON_KEY   déjà présentes (vérification du jeton)
     ALLOWED_ORIGINS                    déjà présente

   Sécurité, dans l'ordre :
     1. jeton Supabase obligatoire → on connaît l'adresse de l'utilisatrice ;
     2. un mail à soi-même part directement ;
     3. un mail à quelqu'un d'autre n'est accepté qu'avec `confirme: true`,
        que le navigateur ne pose qu'APRÈS validation explicite du contenu
        dans l'app (modale ou « oui » de vive voix) ;
     4. au plus 5 destinataires, 100 envois par heure ;
     5. le Reply-To est toujours l'adresse de l'utilisatrice, pour que la
        réponse lui revienne quel que soit l'expéditeur technique.
─────────────────────────────────────────────────────────────────────────────── */

const MAX_DESTINATAIRES = 5;
const MAX_ENVOIS_HEURE  = 100;
const FROM_DEFAUT       = 'IDEAFORMA <onboarding@resend.dev>';

const compteur = new Map();
function tropDEnvois(userId) {
  const now = Date.now();
  const rec = compteur.get(userId);
  if (!rec || now - rec.debut > 3600000) { compteur.set(userId, { debut: now, n: 1 }); return false; }
  rec.n += 1;
  return rec.n > MAX_ENVOIS_HEURE;
}

function resolveOrigin(req) {
  const allowed = (process.env.ALLOWED_ORIGINS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  const origin = req.headers.origin;
  if (!allowed.length) return origin || '*';
  if (!origin) return '*';
  try { if (new URL(origin).host === req.headers.host) return origin; } catch { /* rien */ }
  return allowed.includes(origin) ? origin : null;
}

async function verifierUtilisateur(token) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY non configurées');
  const res = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` }
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user?.id ? user : null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function echapper(t) {
  return String(t).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* Texte brut → HTML lisible : paragraphes, lignes, listes « - » */
function versHtml(texte) {
  const blocs = String(texte).replace(/\r/g, '').trim().split(/\n{2,}/);
  const corps = blocs.map(b => {
    const lignes = b.split('\n');
    if (lignes.length > 1 && lignes.every(l => /^\s*[-•]\s+/.test(l))) {
      return '<ul style="margin:0 0 14px 18px;padding:0">' +
        lignes.map(l => `<li style="margin:0 0 5px">${echapper(l.replace(/^\s*[-•]\s+/, ''))}</li>`).join('') +
        '</ul>';
    }
    return `<p style="margin:0 0 14px">${lignes.map(echapper).join('<br>')}</p>`;
  }).join('');
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#FDF6F4;padding:24px 12px">
<div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #F0D9E2;border-radius:14px;padding:26px 28px;
            font-family:-apple-system,'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#2A2229">
${corps}
</div>
<div style="max-width:620px;margin:10px auto 0;text-align:center;font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#9A8A92">
Envoyé par Nanika, l'assistante IDEAFORMA
</div></body></html>`;
}

module.exports = async function handler(req, res) {
  const origin = resolveOrigin(req);
  if (origin === null) return res.status(403).json({ error: 'Origine non autorisée' });
  res.setHeader('Access-Control-Allow-Origin',  origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' });

  const auth  = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  if (!token) return res.status(401).json({ error: 'Authentification requise' });

  let user;
  try { user = await verifierUtilisateur(token); }
  catch (err) {
    console.error('[mail.js] vérification du jeton', err);
    return res.status(500).json({ error: 'Configuration serveur incomplète' });
  }
  if (!user) return res.status(401).json({ error: 'Session expirée — reconnectez-vous' });
  if (tropDEnvois(user.id)) return res.status(429).json({ error: 'Trop d\'envois — patientez une heure' });

  const cle = process.env.RESEND_API_KEY;
  if (!cle) {
    return res.status(500).json({
      error: 'RESEND_API_KEY non configurée. Ajoutez-la dans Vercel → Settings → Environment Variables.'
    });
  }

  const { a, objet, corps, confirme } = req.body || {};
  const moi = String(user.email || '').toLowerCase();

  let destinataires = Array.isArray(a) ? a : [a];
  destinataires = destinataires
    .map(d => String(d || '').trim())
    .map(d => d.toLowerCase() === 'moi' ? moi : d)
    .filter(Boolean);
  destinataires = [...new Set(destinataires.map(d => d.toLowerCase()))];

  if (!destinataires.length)                 return res.status(400).json({ error: 'Destinataire manquant' });
  if (destinataires.length > MAX_DESTINATAIRES) return res.status(400).json({ error: `Au plus ${MAX_DESTINATAIRES} destinataires` });
  const invalide = destinataires.find(d => !EMAIL_RE.test(d));
  if (invalide) return res.status(400).json({ error: `Adresse invalide : ${invalide}` });
  if (!objet || !String(objet).trim())       return res.status(400).json({ error: 'Objet manquant' });
  if (!corps || !String(corps).trim())       return res.status(400).json({ error: 'Corps du message vide' });

  /* Le verrou : hors de sa propre boîte, il faut la validation explicite */
  const externe = destinataires.some(d => d !== moi);
  if (externe && confirme !== true) {
    return res.status(403).json({
      error: 'Envoi à un tiers refusé sans validation explicite du contenu par l\'utilisatrice'
    });
  }

  const from = (process.env.MAIL_FROM || '').trim() || FROM_DEFAUT;
  const texte = String(corps).trim();

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to:       destinataires,
        reply_to: moi || undefined,
        subject:  String(objet).trim().slice(0, 200),
        text:     texte,
        html:     versHtml(texte)
      })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error('[mail.js] Resend', r.status, data);
      const msg = data?.message || data?.error || `Resend a répondu ${r.status}`;
      const aide = /testing emails|verify a domain/i.test(msg)
        ? ' — sans domaine vérifié chez Resend, seul votre propre e-mail peut recevoir des messages (voir CONFIG_AUTH.md)'
        : '';
      return res.status(502).json({ error: msg + aide });
    }
    return res.status(200).json({ ok: true, id: data.id || null, a: destinataires, externe });
  } catch (err) {
    console.error('[mail.js]', err);
    return res.status(500).json({ error: 'Erreur lors de l\'envoi du mail' });
  }
};
