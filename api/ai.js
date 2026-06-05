/* ─── Vercel Serverless Function — Proxy Claude API ─── */
/* Variable d'environnement requise dans Vercel :
   ANTHROPIC_API_KEY = sk-ant-...
*/

module.exports = async function handler(req, res) {
  /* ── CORS ── */
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'ANTHROPIC_API_KEY non configurée. Ajoutez-la dans Vercel → Settings → Environment Variables.'
    });
  }

  const { messages, system, max_tokens = 1500 } = req.body || {};
  if (!messages?.length) return res.status(400).json({ error: 'messages requis' });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json'
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: Math.min(max_tokens, 2048),
        system:     system || '',
        messages
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || `Erreur API Claude (${response.status})`
      });
    }

    return res.status(200).json({ text: data.content?.[0]?.text || '' });

  } catch (err) {
    console.error('[ai.js]', err);
    return res.status(500).json({ error: err.message });
  }
};
