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

   GET            → état de la configuration ; `?diag=1` ajoute les crédits SMS
                    Brevo et le bilan 7 jours (remis / bloqués / rejetés)
   GET ?evenements=+336…&id=<messageId> → suivi de remise d'un SMS (Brevo)
   POST           → envoi ; la réponse porte `credits` (solde restant) et un
                    `avertissement` si le solde est à 0 (Brevo accepte alors le
                    SMS sans jamais l'émettre — c'est le cas « envoyé mais rien
                    reçu »).
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
    headers: { 'api-key': process.env.BREVO_API_KEY.trim(), 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender:    (process.env.SMS_EXPEDITEUR || 'IDEAFORMA').slice(0, 11),
      recipient: a.replace('+', ''),      // Brevo veut 33612345678
      content:   contenu,
      type:      'transactional',
      unicodeEnabled: /[^\x00-\x7F£¥èéùìòÇØøÅåÆæßÉÄÖÑÜ§¿äöñüà]/.test(contenu)
    })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    let msg = data.message || data.code || `Brevo a répondu ${r.status}`;
    if (r.status === 401) msg += " — clé API refusée : utilisez une clé API v3 (« xkeysib-… », Brevo → SMTP & API → Clés API), pas la clé SMTP";
    if (/credit|not enough/i.test(msg)) msg += ' — achetez des crédits SMS dans Brevo (Transactionnel → SMS)';
    if (/sender/i.test(msg)) msg += ' — l\'expéditeur doit faire 3 à 11 lettres/chiffres (SMS_EXPEDITEUR)';
    throw new Error(msg);
  }
  return {
    id: data.messageId != null ? String(data.messageId) : (data.reference || null),
    credits: typeof data.remainingCredits === 'number' ? data.remainingCredits : null,
    segments: data.smsCount || null
  };
}

async function brevoGet(chemin) {
  const r = await fetch(`https://api.brevo.com/v3${chemin}`, {
    headers: { 'api-key': process.env.BREVO_API_KEY.trim(), Accept: 'application/json' }
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.message || data.code || `Brevo a répondu ${r.status}`);
  return data;
}

/* Diagnostic Brevo : crédits SMS restants + bilan des 7 derniers jours
   (remis / bloqués / rejetés). Brevo accepte volontiers un envoi (201) puis
   le bloque silencieusement : compte non validé, crédits épuisés, expéditeur
   refusé par l'opérateur… seul ce bilan le révèle. */
async function diagnosticBrevo() {
  const out = { credits: null, bilan: null, erreurDiag: null };
  try {
    const compte = await brevoGet('/account');
    const sms = (compte.plan || []).find(p => /sms/i.test(p.type || ''));
    if (sms && typeof sms.credits === 'number') out.credits = sms.credits;
  } catch (err) { out.erreurDiag = err.message; }
  try {
    const b = await brevoGet('/transactionalSMS/statistics/aggregatedReport?days=7');
    out.bilan = {
      demandes: b.requests || 0, remis: b.delivered || 0, acceptes: b.accepted || 0,
      bloques: b.blocked || 0, rejetes: b.rejected || 0,
      nonRemis: (b.hardBounces || 0) + (b.softBounces || 0)
    };
  } catch (err) { out.erreurDiag = out.erreurDiag || err.message; }
  return out;
}

const LIBELLES_EVENEMENT = {
  delivered: 'Remis sur le téléphone',
  sent: "Transmis à l'opérateur — pas encore de confirmation de remise",
  accepted: 'Accepté par Brevo — en attente de transmission',
  softBounces: 'Non remis (téléphone éteint ou hors réseau) — nouvel essai par l\'opérateur',
  hardBounces: 'Non remis : numéro invalide ou injoignable',
  blocked: 'Bloqué par Brevo',
  rejected: "Rejeté par l'opérateur",
  unsubscription: 'Le destinataire a demandé l\'arrêt des SMS',
  replies: 'Réponse reçue'
};

/* Événements Brevo pour un numéro (30 jours) ; si `id` est fourni, on ne
   garde que ceux du message concerné. */
async function evenementsBrevo(numero, id) {
  const tel = String(numero || '').replace('+', '');
  const d = await brevoGet(`/transactionalSMS/statistics/events?phoneNumber=${encodeURIComponent(tel)}&days=30&limit=100&sort=desc`);
  let ev = Array.isArray(d.events) ? d.events : [];
  if (id) ev = ev.filter(e => String(e.messageId) === String(id));
  return ev.map(e => ({
    date: e.date, evenement: e.event, raison: e.reason || null,
    libelle: LIBELLES_EVENEMENT[e.event] || e.event
  }));
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
  return { id: data.sid || null, credits: null, segments: data.num_segments ? Number(data.num_segments) : null };
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
    const q = req.query || {};
    const brevo = fournisseur() === 'brevo' && configure();

    /* ?evenements=+336…&id=<messageId> : suivi de remise d'un SMS */
    if (q.evenements) {
      if (!brevo) return res.status(501).json({ error: 'Le suivi de remise n\'est disponible qu\'avec Brevo' });
      const num = e164(q.evenements);
      if (!num) return res.status(400).json({ error: 'Numéro invalide' });
      try { return res.status(200).json({ evenements: await evenementsBrevo(num, q.id) }); }
      catch (err) { return res.status(502).json({ error: err.message }); }
    }

    const base = {
      pret: configure(), fournisseur: fournisseur(),
      cleForme: fournisseur() === 'brevo' ? (process.env.BREVO_API_KEY ? /^xkeysib-/.test(process.env.BREVO_API_KEY.trim()) : null) : null,
      expediteur: fournisseur() === 'twilio' ? (process.env.TWILIO_FROM || null) : (process.env.SMS_EXPEDITEUR || 'IDEAFORMA'),
      monTelephone: moi
    };
    /* ?diag=1 : crédits et bilan Brevo (deux appels de plus, seulement pour l'onglet SMS) */
    if (q.diag && brevo) Object.assign(base, await diagnosticBrevo());
    return res.status(200).json(base);
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
  let credits = null;
  for (const d of destinataires) {
    try {
      const r = await envoyer(d, texte);
      if (typeof r.credits === 'number') credits = r.credits;
      resultats.push({ a: d, ok: true, id: r.id, segments: r.segments });
    }
    catch (err) { console.error('[sms.js]', d, err.message); resultats.push({ a: d, ok: false, erreur: err.message }); }
  }
  const ok = resultats.every(r => r.ok);
  return res.status(ok ? 200 : 502).json({
    ok, resultats, externe, credits,
    avertissement: ok && credits === 0
      ? 'Brevo a accepté le SMS mais votre solde de crédits SMS est à 0 : il ne partira pas tant que vous n\'aurez pas acheté des crédits (Brevo → Transactionnel → SMS).'
      : undefined,
    error: ok ? undefined : resultats.filter(r => !r.ok).map(r => `${r.a} : ${r.erreur}`).join(' ; ')
  });
};
