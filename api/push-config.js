/* ─── Vercel Serverless Function — clé publique VAPID ─────────────────────────
   Le navigateur a besoin de la clé PUBLIQUE pour s'abonner aux notifications.
   Elle n'est pas secrète, mais on la sert depuis le serveur plutôt que de la
   figer dans le JavaScript : le jour où la paire de clés est régénérée, il n'y
   a qu'une variable d'environnement à changer.
──────────────────────────────────────────────────────────────────────────────*/

function resolveOrigin(req) {
  const allowed = (process.env.ALLOWED_ORIGINS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  const origin = req.headers.origin;
  if (!allowed.length) return origin || '*';
  /* Sans en-tête Origin, la requête est same-origin (fetch GET depuis la page,
     app installée sur iPhone…). La refuser rendait la clé VAPID inaccessible :
     « Configuration des notifications indisponible », et aucun abonnement. */
  if (!origin) return '*';
  /* L'appli qui appelle sa propre API (même hôte) est toujours autorisée,
     quelle que soit la liste : sinon un ALLOWED_ORIGINS qui traîne avec un
     ancien domaine (ideaforma.vercel.app) bloque tout — « Origine non
     autorisée » dans le chatbot. La liste ne sert qu'aux domaines tiers. */
  try {
    if (new URL(origin).host === req.headers.host) return origin;
  } catch { /* origine illisible : on retombe sur la liste */ }
  return allowed.includes(origin) ? origin : null;
}

module.exports = async function handler(req, res) {
  const origin = resolveOrigin(req);
  if (origin === null) return res.status(403).json({ error: 'Origine non autorisée' });

  res.setHeader('Access-Control-Allow-Origin',  origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Cache-Control', 'public, max-age=3600');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET')     return res.status(405).json({ error: 'Method not allowed' });

  const cle = process.env.VAPID_PUBLIC_KEY;
  if (!cle) {
    return res.status(503).json({
      error: 'VAPID_PUBLIC_KEY non configurée dans Vercel — les notifications sont désactivées.'
    });
  }

  return res.status(200).json({ publicKey: cle });
};
