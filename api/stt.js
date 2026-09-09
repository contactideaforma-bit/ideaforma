/* ─── Vercel Serverless Function — l'oreille de Nanika ────────────────────────
   Transcrit un enregistrement audio (mp4/webm/ogg, quelques secondes) avec
   la reconnaissance vocale d'OpenAI : bien plus juste en français que la
   dictée intégrée aux navigateurs (surtout sur iPhone), et on lui souffle le
   vocabulaire attendu (Nanika, IDEAFORMA, OPCO, Qualiopi, prénoms du carnet…).

   Variables d'environnement (Vercel → Settings → Environment Variables) :
     OPENAI_API_KEY   sk-...   (la même que pour api/tts.js ; sans elle, la
                                fonction répond 501 et l'application garde la
                                dictée du navigateur)
     NANIKA_OREILLE   gpt-4o-transcribe | gpt-4o-mini-transcribe | whisper-1
                                (facultative, défaut « gpt-4o-transcribe »)
     SUPABASE_URL / SUPABASE_ANON_KEY / ALLOWED_ORIGINS   déjà présentes

   Entrée : JSON { audio: <base64>, mime: 'audio/mp4', indices: 'Roger, Sophie…' }
   Sortie : { texte }
   Coût indicatif : ≈ 0,006 $ la minute d'audio (gpt-4o-transcribe).
─────────────────────────────────────────────────────────────────────────────── */

const MAX_OCTETS = 6 * 1024 * 1024;     // ~ 90 s d'audio compressé
const MODELE     = (process.env.NANIKA_OREILLE || 'gpt-4o-transcribe').trim();
const VOCABULAIRE = "Conversation en français avec Nanika, l'assistante de Myriam (IDEAFORMA, organisme de formation). " +
                    'Mots fréquents : Nanika, Myriam, IDEAFORMA, OPCO, OPCO Mobilités, Qualiopi, AKTO, Constructys, ' +
                    'carrosserie, formateur, devis, facture, relance, rendez-vous, tâche, pense-bête, agenda, SMS, mail, WhatsApp, terminé.';

const compteur = new Map();
function tropDAppels(userId) {
  const now = Date.now();
  const rec = compteur.get(userId);
  if (!rec || now - rec.debut > 3600000) { compteur.set(userId, { debut: now, n: 1 }); return false; }
  rec.n += 1;
  return rec.n > 400;
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

function extension(mime) {
  const m = String(mime || '').toLowerCase();
  if (m.includes('mp4') || m.includes('m4a') || m.includes('aac')) return 'mp4';
  if (m.includes('webm')) return 'webm';
  if (m.includes('ogg') || m.includes('opus')) return 'ogg';
  if (m.includes('wav')) return 'wav';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  return 'webm';
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

  if (!process.env.OPENAI_API_KEY) {
    return res.status(501).json({ error: 'STT_NON_CONFIGURE', message: 'OPENAI_API_KEY absente : dictée du navigateur conservée' });
  }

  const auth  = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  if (!token) return res.status(401).json({ error: 'Authentification requise' });

  let user;
  try { user = await verifierUtilisateur(token); }
  catch (err) {
    console.error('[stt.js] vérification du jeton', err);
    return res.status(500).json({ error: 'Configuration serveur incomplète' });
  }
  if (!user) return res.status(401).json({ error: 'Session expirée — reconnectez-vous' });
  if (tropDAppels(user.id)) return res.status(429).json({ error: 'Trop de dictées — patientez un peu' });

  const { audio, mime, indices } = req.body || {};
  if (!audio || typeof audio !== 'string') return res.status(400).json({ error: 'Audio manquant' });
  let octets;
  try { octets = Buffer.from(audio, 'base64'); } catch { return res.status(400).json({ error: 'Audio illisible' }); }
  if (!octets.length) return res.status(400).json({ error: 'Audio vide' });
  if (octets.length > MAX_OCTETS) return res.status(413).json({ error: 'Enregistrement trop long' });

  const ext = extension(mime);
  const form = new FormData();
  form.append('file', new Blob([octets], { type: mime || 'audio/webm' }), `dictee.${ext}`);
  form.append('model', MODELE);
  form.append('language', 'fr');
  form.append('response_format', 'json');
  // Le vocabulaire attendu (+ les prénoms du carnet envoyés par l'app) : le
  // modèle s'en sert pour orthographier les noms propres correctement.
  const souffle = (VOCABULAIRE + ' ' + String(indices || '').slice(0, 600)).trim();
  form.append('prompt', souffle);

  const ctrl = new AbortController();
  const garde = setTimeout(() => ctrl.abort(), 25000);
  try {
    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST', signal: ctrl.signal,
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error('[stt.js] OpenAI', r.status, data?.error?.message);
      return res.status(502).json({ error: data?.error?.message || `OpenAI a répondu ${r.status}` });
    }
    const texte = String(data.text || '').trim();
    return res.status(200).json({ texte, modele: MODELE });
  } catch (err) {
    console.error('[stt.js]', err);
    return res.status(err.name === 'AbortError' ? 504 : 500).json({ error: err.name === 'AbortError' ? 'Transcription trop longue' : 'Erreur serveur' });
  } finally { clearTimeout(garde); }
};
