/* ─── Vercel Serverless Function — envoi de SMS par l'application et Nanika ──
   Variables d'environnement (Vercel → Settings → Environment Variables) :

     SMS_FOURNISSEUR   brevo (défaut) | twilio
     ── Brevo (recommandé en France : expéditeur alphanumérique « IDEAFORMA »,
        ≈ 0,045 € le SMS, compte gratuit puis crédits SMS) ──
     BREVO_API_KEY     xkeysib-…   (Brevo → SMTP & API → Clés API)
     SMS_EXPEDITEUR    IDEAFORMA   (3 à 11 caractères alphanumériques, ou un
                                    numéro) — défaut « IDEAFORMA »
     ── Twilio (alternative) ──
     TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM (+33… ou alphanumérique)
     ── Commun ──
     MON_TELEPHONE     +33612345678  votre propre portable : un SMS « à moi »
                                     part sans validation, comme pour les mails
     SUPABASE_URL / SUPABASE_ANON_KEY / ALLOWED_ORIGINS   déjà présentes

   Sécurité : jeton Supabase obligatoire ; tout destinataire autre que
   MON_TELEPHONE exige `confirme: true`, posé par le navigateur seulement
   après validation explicite du texte (modale ou « oui » de vive voix) ;
   3 destinataires max par envoi, 60 SMS par heure ; 600 caractères max.
─────────────────────────────────────────────────────────────────────────────── */

const MAX_DEST   = 3;
const MAX_HEURE  = 60;
const MAX_CHARS  = 600;

const compteur = new Map();
function tropDEnvois(userId) {
  const now = Date.now();
  const rec = compteur.get(userId);
  if (!rec || now - rec.debut > 3600000) { compteur.set(userId, { debut: now, n: 1 }); return false; }
  rec.n += 1;
  return rec.n > MAX_HEURE;
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

/* 06 12 34 56 78 / 0612345678 / +33 6… / 0033 6… → +33612345678 */
function e164(brut) {
  let n = String(brut || '').replace(/[\s.\-()]/g, '');
  if (!n) return null;
  if (n.startsWith('00')) n = '+' + n.slice(2);
  if (/^0[1-9]\d{8}$/.test(n)) n = '+33' + n.slice(1);
  if (/^[1-9]\d{8}$/.test(n)) n = '+33' + n;           // 612345678
  if (!/^\+[1-9]\d{7,14}$/.test(n)) return null;
  return n;
}

function fournisseur() {
  return (process.env.SMS_FOURNISSEUR || 'brevo').trim().toLowerCase();
}
function configure() {
  return fournisseur() === 'twilio'
    ? !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM)
    : !!process.env.BREVO_API_KEY;
}

async function envoyerBrevo(a, contenu) {
  const r = await fetch('https://api.brevo.com/v3/transactionalSMS/send', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender:    (process.env.SMS_EXPEDITEUR || 'IDEAFORMA').slice(0, 11),
      recipient: a.replace('+', ''),      // Brevo veut 33612345678
      content:   contenu,
      type:      'transactional',
      unicodeEnabled: /[^\x00-\x7F£¥èéùìòÇØøÅåÆæßÉÄÖÑÜ§¿äöñüà]/.test(contenu)
    })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.message || data.code || `Brevo a répondu ${r.status}`);
  return data.messageId || data.reference || null;
}

async function envoyerTwilio(a, contenu) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
  const corps = new URLSearchParams({ To: a, From: process.env.TWILIO_FROM, Body: contenu });
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: corps.toString()
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.message || `Twilio a répondu ${r.status}`);
  return data.sid || null;
}

module.exports = async function handler(req, res) {
  const origin = resolveOrigin(req);
  if (origin === null) return res.status(403).json({ error: 'Origine non autorisée' });
  res.setHeader('Access-Control-Allow-Origin',  origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const auth  = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  if (!token) return res.status(401).json({ error: 'Authentification requise' });

  let user;
  try { user = await verifierUtilisateur(token); }
  catch (err) {
    console.error('[sms.js] vérification du jeton', err);
    return res.status(500).json({ error: 'Configuration serveur incomplète' });
  }
  if (!user) return res.status(401).json({ error: 'Session expirée — reconnectez-vous' });

  const moi = e164(process.env.MON_TELEPHONE || '') || null;

  /* GET : l'application demande l'état de la configuration */
  if (req.method === 'GET') {
    return res.status(200).json({
      pret: configure(), fournisseur: fournisseur(),
      expediteur: fournisseur() === 'twilio' ? (process.env.TWILIO_FROM || null) : (process.env.SMS_EXPEDITEUR || 'IDEAFORMA'),
      monTelephone: moi
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!configure()) {
    return res.status(501).json({
      error: fournisseur() === 'twilio'
        ? 'SMS non configurés : ajoutez TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN et TWILIO_FROM dans Vercel.'
        : 'SMS non configurés : ajoutez BREVO_API_KEY (et SMS_EXPEDITEUR) dans Vercel → Settings → Environment Variables.'
    });
  }
  if (tropDEnvois(user.id)) return res.status(429).json({ error: 'Trop de SMS — patientez une heure' });

  const { a, contenu, confirme } = req.body || {};
  let destinataires = (Array.isArray(a) ? a : [a]).map(x => String(x || '').trim()).filter(Boolean);
  destinataires = destinataires.map(x => /^moi$/i.test(x) ? moi : e164(x));
  if (destinataires.some(x => !x)) return res.status(400).json({ error: 'Numéro invalide (attendu : 06 12 34 56 78 ou +33 6…)' });
  destinataires = [...new Set(destinataires)];
  if (!destinataires.length) return res.status(400).json({ error: 'Destinataire manquant' });
  if (destinataires.length > MAX_DEST) return res.status(400).json({ error: `Au plus ${MAX_DEST} destinataires par SMS` });

  const texte = String(contenu || '').replace(/\r/g, '').trim();
  if (!texte) return res.status(400).json({ error: 'Message vide' });
  if (texte.length > MAX_CHARS) return res.status(400).json({ error: `Message trop long (${texte.length} caractères, ${MAX_CHARS} max)` });

  const externe = destinataires.some(d => d !== moi);
  if (externe && confirme !== true) {
    return res.status(403).json({ error: "Envoi à un tiers refusé sans validation explicite du texte par l'utilisatrice" });
  }

  const envoyer = fournisseur() === 'twilio' ? envoyerTwilio : envoyerBrevo;
  const resultats = [];
  for (const d of destinataires) {
    try { resultats.push({ a: d, ok: true, id: await envoyer(d, texte) }); }
    catch (err) { console.error('[sms.js]', d, err.message); resultats.push({ a: d, ok: false, erreur: err.message }); }
  }
  const ok = resultats.every(r => r.ok);
  return res.status(ok ? 200 : 502).json({
    ok, resultats, externe,
    error: ok ? undefined : resultats.filter(r => !r.ok).map(r => `${r.a} : ${r.erreur}`).join(' ; ')
  });
};
