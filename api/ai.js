/* ─── Vercel Serverless Function — Proxy Claude API ───────────────────────────
   Variables d'environnement requises dans Vercel → Settings → Environment Variables :

     ANTHROPIC_API_KEY   sk-ant-...                          (secret)
     SUPABASE_URL        https://xxxx.supabase.co
     SUPABASE_ANON_KEY   eyJhbGciOi...                       (clé publique anon)
     ALLOWED_ORIGINS     https://ideaforma-opco.vercel.app,http://localhost:3000

   Sans jeton Supabase valide, l'endpoint répond 401 : la clé Anthropic n'est
   plus consommable par un tiers qui connaîtrait l'URL.

   v8 : la fonction relaie aussi les outils (tool use). L'assistant peut donc
   demander la création d'une tâche ou d'un rendez-vous ; l'exécution reste
   faite par le navigateur avec la session de l'utilisateur, donc sous RLS.
─────────────────────────────────────────────────────────────────────────────── */

const MAX_BODY_CHARS   = 600000;  // un seul utilisateur : on laisse de la marge
const MAX_TOKENS_LIMIT = 16000;
const RATE_LIMIT       = 600;     // requêtes par utilisateur… (garde-fou anti-boucle seulement)
const RATE_WINDOW_MS   = 60000;   // …par minute

/* Modèles autorisés : on ne laisse pas le client choisir n'importe quoi */
const MODELES = {
  rapide:  'claude-haiku-4-5-20251001',
  complet: 'claude-sonnet-4-5-20250929'
};
const MODELE_DEFAUT = MODELES.rapide;

/* Compteur en mémoire — remis à zéro à chaque démarrage d'instance.
   Suffisant pour freiner une boucle accidentelle ; pour une vraie limite
   partagée entre instances, passer par une table Supabase ou Upstash. */
const hits = new Map();

function rateLimited(userId) {
  const now = Date.now();
  const rec = hits.get(userId);
  if (!rec || now - rec.start > RATE_WINDOW_MS) {
    hits.set(userId, { start: now, count: 1 });
    if (hits.size > 5000) hits.clear();
    return false;
  }
  rec.count += 1;
  return rec.count > RATE_LIMIT;
}

function resolveOrigin(req) {
  const allowed = (process.env.ALLOWED_ORIGINS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  const origin = req.headers.origin;

  // Aucune liste configurée : on autorise l'origine de la requête (mode dégradé,
  // la protection réelle reste la vérification du jeton ci-dessous).
  if (!allowed.length) return origin || '*';
  // Pas d'en-tête Origin : c'est un appel same-origin (les navigateurs ne
  // l'envoient pas toujours, l'app installée sur iPhone en particulier).
  // Refuser ici bloquait les notifications ; le jeton reste le vrai verrou.
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

/* Vérifie le jeton auprès de Supabase. Pas de dépendance ni de secret JWT à
   gérer côté Vercel, et compatible aussi bien avec les clés symétriques
   historiques qu'avec les clés asymétriques récentes. */
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

module.exports = async function handler(req, res) {
  /* ── CORS ── */
  const origin = resolveOrigin(req);
  if (origin === null) return res.status(403).json({ error: 'Origine non autorisée' });

  res.setHeader('Access-Control-Allow-Origin',  origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' });

  /* ── Authentification ── */
  const auth  = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  if (!token) return res.status(401).json({ error: 'Authentification requise' });

  let user;
  try {
    user = await verifierUtilisateur(token);
  } catch (err) {
    console.error('[ai.js] vérification du jeton', err);
    return res.status(500).json({ error: 'Configuration serveur incomplète' });
  }
  if (!user) return res.status(401).json({ error: 'Session expirée — reconnectez-vous' });

  if (rateLimited(user.id)) {
    return res.status(429).json({ error: 'Trop de requêtes — patientez une minute' });
  }

  /* ── Clé Anthropic ── */
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'ANTHROPIC_API_KEY non configurée. Ajoutez-la dans Vercel → Settings → Environment Variables.'
    });
  }

  /* ── Validation de la charge utile ── */
  const {
    messages, system, max_tokens = 1500,
    tools, tool_choice, profil, thinking
  } = req.body || {};

  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: 'messages requis' });
  }

  const taille = JSON.stringify(messages).length
               + JSON.stringify(system || '').length
               + JSON.stringify(tools || '').length;
  if (taille > MAX_BODY_CHARS) {
    return res.status(413).json({ error: 'Conversation trop longue — ouvrez une nouvelle discussion' });
  }

  const corps = {
    model:      MODELES[profil] || MODELE_DEFAUT,
    max_tokens: Math.min(Number(max_tokens) || 1500, MAX_TOKENS_LIMIT),
    system:     typeof system === 'string' ? system : '',
    messages
  };
  /* Réflexion étendue (Nanika) : le modèle raisonne avant de répondre.
     Budget plafonné, et max_tokens doit rester supérieur au budget. */
  if (thinking && thinking.type === 'enabled') {
    const budget = Math.min(Math.max(Number(thinking.budget_tokens) || 2048, 1024), 8000);
    corps.thinking = { type: 'enabled', budget_tokens: budget };
    if (corps.max_tokens <= budget) corps.max_tokens = Math.min(budget + 4000, MAX_TOKENS_LIMIT);
  }
  if (Array.isArray(tools) && tools.length) {
    /* Les outils « serveur » d'Anthropic (web_search_20250305…) passent tels
       quels : c'est Anthropic qui les exécute, le navigateur n'a rien à faire.
       Coût : ~10 $ pour 1 000 recherches, plafonné à max_uses par réponse. */
    corps.tools = tools.slice(0, 30);
    if (tool_choice) corps.tool_choice = tool_choice;
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json'
      },
      body: JSON.stringify(corps)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[ai.js] API Claude', response.status, data?.error?.type);
      return res.status(response.status).json({
        error: data?.error?.message || `Erreur API Claude (${response.status})`
      });
    }

    /* « text » est conservé pour les appels historiques (génération de
       programme, reformulation) ; « content » sert à la boucle d'outils. */
    const blocsTexte = (data.content || [])
      .filter(b => b.type === 'text').map(b => b.text).join('\n');

    return res.status(200).json({
      text:        blocsTexte,
      content:     data.content || [],
      stop_reason: data.stop_reason || null,
      usage:       data.usage || null
    });

  } catch (err) {
    console.error('[ai.js]', err);
    return res.status(500).json({ error: 'Erreur lors de l\'appel au modèle' });
  }
};
