/* ─── Vercel Serverless Function — la voix de Nanika ──────────────────────────
   Transforme un texte en MP3 avec la synthèse vocale d'OpenAI, nettement plus
   naturelle que les voix intégrées aux navigateurs (surtout sur iPhone).

   Variables d'environnement (Vercel → Settings → Environment Variables) :
     OPENAI_API_KEY   sk-...   (facultative : sans elle, la fonction répond 501
                                et l'application garde la voix du navigateur)
     NANIKA_VOIX      nova | shimmer | coral | sage | alloy | echo | fable | onyx
                                (facultative, défaut « nova »)
     SUPABASE_URL / SUPABASE_ANON_KEY / ALLOWED_ORIGINS   déjà présentes

   Coût indicatif : gpt-4o-mini-tts ≈ 0,015 $ la minute d'audio.
─────────────────────────────────────────────────────────────────────────────── */

const MAX_CHARS = 2500;
const MODELE    = 'gpt-4o-mini-tts';
const STYLE     = "Tu es Nanika, l'assistante personnelle de Myriam. Voix féminine française, " +
                  'chaleureuse et posée, débit naturel et fluide, articulation nette, ' +
                  'légère bienveillance, jamais robotique ni exagérée. Ton calme façon assistante de confiance.';

const compteur = new Map();
function tropDAppels(userId) {
  const now = Date.now();
  const rec = compteur.get(userId);
  if (!rec || now - rec.debut > 60000) { compteur.set(userId, { debut: now, n: 1 }); return false; }
  rec.n += 1;
  return rec.n > 60;
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

module.exports = async function handler(req, res) {
  const origin = resolveOrigin(req);
  if (origin === null) return res.status(403).json({ error: 'Origine non autorisée' });
  res.setHeader('Access-Control-Allow-Origin',  origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' });

  const cle = process.env.OPENAI_API_KEY;
  if (!cle) return res.status(501).json({ error: 'TTS_NON_CONFIGURE' });

  const auth  = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  if (!token) return res.status(401).json({ error: 'Authentification requise' });

  let user;
  try { user = await verifierUtilisateur(token); }
  catch (err) {
    console.error('[tts.js] vérification du jeton', err);
    return res.status(500).json({ error: 'Configuration serveur incomplète' });
  }
  if (!user) return res.status(401).json({ error: 'Session expirée — reconnectez-vous' });
  if (tropDAppels(user.id)) return res.status(429).json({ error: 'Trop de demandes de voix — patientez une minute' });

  const texte = String((req.body || {}).texte || '').replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS);
  if (!texte) return res.status(400).json({ error: 'Texte vide' });

  try {
    const r = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODELE,
        voice: (process.env.NANIKA_VOIX || 'nova').trim(),
        input: texte,
        instructions: STYLE,
        response_format: 'mp3',
        speed: 1.0
      })
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      console.error('[tts.js] OpenAI', r.status, detail.slice(0, 300));
      return res.status(502).json({ error: `Synthèse vocale indisponible (${r.status})` });
    }
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(buf);
  } catch (err) {
    console.error('[tts.js]', err);
    return res.status(500).json({ error: 'Erreur de synthèse vocale' });
  }
};
