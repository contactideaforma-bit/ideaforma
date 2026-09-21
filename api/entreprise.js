/* ─── Vercel Serverless Function — Recherche d'entreprise + OPCO ─────────────
   GET /api/entreprise?q=<siret ou raison sociale>   → liste de candidats
   GET /api/entreprise?siret=<14 chiffres>           → fiche complète + OPCO

   Sources publiques, sans clé :
     • recherche-entreprises.api.gouv.fr  (annuaire des entreprises — DINUM)
     • cfadock.fr/api/opcos?siret=…       (OPCO de rattachement — France compétences)

   Même verrou que /api/ai : jeton Supabase obligatoire. Le navigateur n'appelle
   donc jamais ces services directement (pas de souci de CORS ni de quota).
─────────────────────────────────────────────────────────────────────────────── */

const ANNUAIRE = 'https://recherche-entreprises.api.gouv.fr/search';
const CFADOCK  = 'https://www.cfadock.fr/api/opcos';

/* Tranche d'effectif INSEE → libellé + estimation (borne basse) */
const TRANCHES = {
  NN:['Non employeur',0,0], '00':['0 salarié',0,0], '01':['1 à 2 salariés',1,2],
  '02':['3 à 5 salariés',3,5], '03':['6 à 9 salariés',6,9], '11':['10 à 19 salariés',10,19],
  '12':['20 à 49 salariés',20,49], '21':['50 à 99 salariés',50,99], '22':['100 à 199 salariés',100,199],
  '31':['200 à 249 salariés',200,249], '32':['250 à 499 salariés',250,499], '41':['500 à 999 salariés',500,999],
  '42':['1 000 à 1 999 salariés',1000,1999], '51':['2 000 à 4 999 salariés',2000,4999],
  '52':['5 000 à 9 999 salariés',5000,9999], '53':['10 000 salariés et plus',10000,null]
};

function resolveOrigin(req) {
  const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const origin = req.headers.origin;
  if (!allowed.length) return origin || '*';
  if (!origin) return '*';
  try { if (new URL(origin).host === req.headers.host) return origin; } catch { /* noop */ }
  return allowed.includes(origin) ? origin : null;
}

async function verifierUtilisateur(token) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY non configurées');
  const res = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const user = await res.json();
  return user?.id ? user : null;
}

function titre(s) {
  return String(s || '').toLowerCase().replace(/(^|[\s\-'])([a-zà-ÿ])/g, (m, p, c) => p + c.toUpperCase());
}

function adresseDe(etab) {
  if (!etab) return '';
  if (etab.adresse) return etab.adresse;
  return [etab.numero_voie, etab.type_voie, etab.libelle_voie, etab.code_postal, etab.libelle_commune]
    .filter(Boolean).join(' ');
}

/* Normalise un résultat de l'annuaire vers ce que la fiche client attend */
function normaliser(r, siretVoulu = null) {
  const siege = r.siege || {};
  const etab  = siretVoulu
    ? ((r.matching_etablissements || []).find(e => e.siret === siretVoulu) || siege)
    : siege;

  const tranche = TRANCHES[etab.tranche_effectif_salarie || r.tranche_effectif_salarie] || null;

  const dirigeants = (r.dirigeants || []).filter(d => d.type_dirigeant === 'personne physique');
  const principal  = dirigeants.find(d => /g[ée]rant|pr[ée]sident|directeur g|exploitant|chef d/i.test(d.qualite || ''))
                  || dirigeants[0];

  const idcc = [...new Set([
    ...(etab.liste_idcc || []),
    ...(siege.liste_idcc || []),
    ...((r.complements || {}).liste_idcc || [])
  ])].map(String).filter(x => x && x !== '9999');

  return {
    siren:          r.siren,
    siret:          etab.siret || siege.siret || '',
    nom:            r.nom_complet || r.nom_raison_sociale || '',
    raisonSociale:  r.nom_raison_sociale || r.nom_complet || '',
    sigle:          r.sigle || '',
    adresse:        adresseDe(etab),
    codePostal:     etab.code_postal || '',
    ville:          etab.libelle_commune || '',
    naf:            etab.activite_principale || r.activite_principale || '',
    natureJuridique:r.nature_juridique || '',
    dateCreation:   r.date_creation || '',
    etat:           r.etat_administratif || '',
    estSiege:       !!etab.est_siege,
    effectifTranche:etab.tranche_effectif_salarie || r.tranche_effectif_salarie || '',
    effectifLibelle:tranche ? tranche[0] : '',
    effectifMin:    tranche ? tranche[1] : null,
    effectifMax:    tranche ? tranche[2] : null,
    idcc,
    dirigeant:      principal ? `${titre(principal.prenoms || '').split(' ')[0]} ${String(principal.nom || '').toUpperCase()}`.trim() : '',
    dirigeantQualite: principal?.qualite || '',
    nbEtablissements: r.nombre_etablissements_ouverts ?? r.nombre_etablissements ?? null
  };
}

async function annuaire(params) {
  const url = `${ANNUAIRE}?${new URLSearchParams({ per_page: '8', page: '1', ...params })}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Annuaire des entreprises indisponible (${res.status})`);
  const data = await res.json();
  return data.results || [];
}

/* OPCO de rattachement via CFA Dock. Renvoie null si le service ne répond pas :
   le navigateur retombe alors sur la table IDCC / NAF embarquée. */
async function opcoCfaDock(siret) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(`${CFADOCK}?siret=${encodeURIComponent(siret)}`, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    clearTimeout(t);
    if (!res.ok) return null;
    const d = await res.json();
    if (!d || String(d.searchStatus || '').toUpperCase() !== 'OK' || !d.opcoName) return null;
    return { nom: d.opcoName, idcc: d.idcc ? String(d.idcc) : '', source: 'CFA Dock' };
  } catch {
    return null;
  }
}

module.exports = async function handler(req, res) {
  const origin = resolveOrigin(req);
  if (origin === null) return res.status(403).json({ error: 'Origine non autorisée' });
  res.setHeader('Access-Control-Allow-Origin',  origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET')     return res.status(405).json({ error: 'Method not allowed' });

  const auth  = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  if (!token) return res.status(401).json({ error: 'Authentification requise' });
  let user;
  try { user = await verifierUtilisateur(token); }
  catch (err) { console.error('[entreprise.js] jeton', err); return res.status(500).json({ error: 'Configuration serveur incomplète' }); }
  if (!user) return res.status(401).json({ error: 'Session expirée — reconnectez-vous' });

  const q     = String(req.query.q || '').trim();
  const siret = String(req.query.siret || '').replace(/\s/g, '');

  try {
    /* ── Fiche complète par SIRET ── */
    if (siret) {
      if (!/^\d{14}$/.test(siret)) return res.status(400).json({ error: 'SIRET invalide (14 chiffres attendus)' });
      const [results, opco] = await Promise.all([annuaire({ q: siret }), opcoCfaDock(siret)]);
      const r = results.find(x => x.siege?.siret === siret || (x.matching_etablissements || []).some(e => e.siret === siret))
             || results[0];
      if (!r) return res.status(404).json({ error: 'Aucune entreprise trouvée pour ce SIRET' });
      const fiche = normaliser(r, siret);
      if (opco?.idcc && !fiche.idcc.includes(opco.idcc)) fiche.idcc.unshift(opco.idcc);
      return res.status(200).json({ entreprise: fiche, opco });
    }

    /* ── Recherche par nom (ou SIREN / SIRET partiel) ── */
    if (q.length < 3) return res.status(400).json({ error: 'Saisissez au moins 3 caractères' });
    const digits = q.replace(/\s/g, '');
    const params = /^\d{9}$|^\d{14}$/.test(digits) ? { q: digits } : { q, etat_administratif: 'A' };
    const results = await annuaire(params);
    return res.status(200).json({ resultats: results.map(r => normaliser(r)) });

  } catch (err) {
    console.error('[entreprise.js]', err);
    return res.status(502).json({ error: err.message || 'Service indisponible' });
  }
};
