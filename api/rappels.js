/* ─── Vercel Serverless Function — envoi des notifications programmées ────────

   Appelée toutes les minutes par pg_cron (voir setup_update8.sql, section 10).
   Lit la vue v_rappels_a_envoyer avec la clé service_role, pousse une
   notification à chaque appareil abonné, puis marque le rappel comme envoyé.

   Variables d'environnement requises dans Vercel :

     SUPABASE_URL                https://xxxx.supabase.co
     SUPABASE_SERVICE_ROLE_KEY   eyJhbGci...        (secret — jamais côté client)
     VAPID_PUBLIC_KEY            BA_h_-pH...
     VAPID_PRIVATE_KEY           7EMEYBoY...        (secret)
     VAPID_SUBJECT               mailto:contact.ideaforma@gmail.com
     RAPPELS_SECRET              le même que le secret Vault « rappels_secret »

   Dépendance : web-push (déclarée dans package.json à la racine).
──────────────────────────────────────────────────────────────────────────────*/

const webpush = require('web-push');

const LOT_MAX = 200;   // garde-fou : on ne traite pas plus de 200 rappels par minute

/* ── Petit client PostgREST, pour ne pas embarquer supabase-js ── */
function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY non configurées');

  const entetes = {
    apikey:          key,
    Authorization:   `Bearer ${key}`,
    'Content-Type':  'application/json'
  };

  return {
    async get(chemin) {
      const res = await fetch(`${url}/rest/v1/${chemin}`, { headers: entetes });
      if (!res.ok) throw new Error(`Lecture ${chemin} : ${res.status} ${await res.text()}`);
      return res.json();
    },
    async patch(chemin, corps) {
      const res = await fetch(`${url}/rest/v1/${chemin}`, {
        method:  'PATCH',
        headers: { ...entetes, Prefer: 'return=minimal' },
        body:    JSON.stringify(corps)
      });
      if (!res.ok) console.error(`[rappels] PATCH ${chemin} : ${res.status} ${await res.text()}`);
    }
  };
}

module.exports = async function handler(req, res) {
  /* ── Cette route n'est appelée que par le cron ── */
  const secret = process.env.RAPPELS_SECRET;
  if (!secret) return res.status(500).json({ error: 'RAPPELS_SECRET non configurée' });
  if (req.headers['x-rappels-secret'] !== secret) {
    return res.status(401).json({ error: 'Non autorisé' });
  }
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const pub  = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return res.status(500).json({ error: 'Clés VAPID non configurées' });

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:contact.ideaforma@gmail.com',
    pub, priv
  );

  const sql = db();

  let lignes;
  try {
    lignes = await sql.get(`v_rappels_a_envoyer?select=*&order=envoyer_a.asc&limit=${LOT_MAX}`);
  } catch (err) {
    console.error('[rappels]', err);
    return res.status(500).json({ error: 'Lecture des rappels impossible' });
  }

  if (!lignes.length) return res.status(200).json({ envoyes: 0 });

  /* Une notification par appareil, mais un rappel = un seul statut final */
  const parRappel = new Map();
  for (const l of lignes) {
    if (!parRappel.has(l.rappel_id)) parRappel.set(l.rappel_id, []);
    parRappel.get(l.rappel_id).push(l);
  }

  const abonnementsMorts = new Set();
  let envoyes = 0, echecs = 0;

  await Promise.all([...parRappel.entries()].map(async ([rappelId, cibles]) => {
    const r = cibles[0];
    const charge = JSON.stringify({
      titre: r.titre,
      corps: r.corps || '',
      url:   r.url   || '/app.html',
      tag:   `rappel-${rappelId}`
    });

    const resultats = await Promise.allSettled(cibles.map(c =>
      webpush.sendNotification(
        { endpoint: c.endpoint, keys: { p256dh: c.p256dh, auth: c.auth } },
        charge,
        { TTL: 3600, urgency: 'high' }
      ).catch(err => {
        // 404 / 410 : l'appareil s'est désabonné, on nettoie
        if (err.statusCode === 404 || err.statusCode === 410) {
          abonnementsMorts.add(c.subscription_id);
        }
        throw err;
      })
    ));

    const auMoinsUn = resultats.some(x => x.status === 'fulfilled');

    if (auMoinsUn) {
      envoyes++;
      await sql.patch(`rappels?id=eq.${rappelId}`, {
        statut: 'envoye', envoye_le: new Date().toISOString(), erreur: null
      });
    } else {
      echecs++;
      const motif = resultats[0]?.reason?.body || resultats[0]?.reason?.message || 'échec inconnu';
      // Trois tentatives, puis on abandonne : sinon le cron réessaie sans fin
      const tentatives = (r.tentatives || 0) + 1;
      await sql.patch(`rappels?id=eq.${rappelId}`, {
        statut:     tentatives >= 3 ? 'erreur' : 'en_attente',
        tentatives,
        erreur:     String(motif).slice(0, 500)
      });
    }
  }));

  /* Nettoyage des abonnements périmés */
  if (abonnementsMorts.size) {
    await sql.patch(
      `push_subscriptions?id=in.(${[...abonnementsMorts].join(',')})`,
      { actif: false }
    );
  }

  /* Horodatage des abonnements utilisés (utile pour repérer un appareil muet) */
  const vivants = [...new Set(lignes.map(l => l.subscription_id))]
    .filter(id => !abonnementsMorts.has(id));
  if (vivants.length) {
    await sql.patch(
      `push_subscriptions?id=in.(${vivants.join(',')})`,
      { derniere_utilisation: new Date().toISOString() }
    );
  }

  return res.status(200).json({
    envoyes, echecs, abonnements_desactives: abonnementsMorts.size
  });
};
