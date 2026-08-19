# IDEAFORMA v8 — mise en service

L'application devient un assistant du quotidien : agenda avec notifications,
listes de tâches, pense-bête, coffre à documents, et un assistant IA qui voit
vos données et peut agir dessus. Tout se range dans un seul espace, séparé par
des **étiquettes** (IDEAFORMA / Pro / Perso / …).

Suivre les cinq étapes dans l'ordre. Compter 20 minutes.

---

> **État au 19/08/2026 — étapes 1 et 3 déjà faites.**
> La migration a été jouée (9 tables sur 9, vue `v_agenda` présente, job
> `rappels-push` planifié) et les deux secrets Vault sont en place.
> **Il reste l'étape 2 (variables Vercel) et l'étape 4 (commit / push).**

---

## 1. La migration SQL ✅ faite

Supabase → **SQL Editor** → coller le contenu de `setup_update8.sql` → **Run**.

Le script est idempotent : on peut le rejouer sans dommage. Il finit par un
tableau de contrôle qui doit afficher :

| controle | valeur attendue |
|---|---|
| Tables créées | `9 / 9` |
| Colonnes ajoutées à taches | `8 / 8` |
| Étiquettes par défaut | `6` |
| Vue v_agenda | `ok` |
| Job rappels-push | `* * * * *` |
| Secrets Vault | `aucun ⚠` — normal à ce stade, corrigé à l'étape 3 |

Deux lignes `ERROR: extension "pg_cron" is not available` signifient que les
extensions ne sont pas activées : **Database → Extensions**, activer `pg_cron`
et `pg_net`, puis rejouer le script.

---

## 2. Les variables d'environnement Vercel

Vercel → le projet → **Settings → Environment Variables**. Ajouter :

| Nom | Valeur |
|---|---|
| `VAPID_PUBLIC_KEY` | `BA_h_-pH7XNaFuccrlpuM0RzqhtBEGlqpFHI1F0xb5qhJsFiOjWQBr9gYqaw3ousmEnLY0-uraMOD6A0lJXauKQ` |
| `VAPID_PRIVATE_KEY` | `7EMEYBoYYx2HWrykBdr98gXG8tPsLStyNS5rIonQPL8` |
| `VAPID_SUBJECT` | `mailto:contact.ideaforma@gmail.com` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → `service_role secret` |
| `RAPPELS_SECRET` | `jqK1O7huf1FZmO2bC4LGp0Nig0y8VuQF` — **doit être exactement celle-ci**, c'est celle enregistrée côté Supabase |

> **La clé privée VAPID et la clé service_role sont des secrets.** Elles ne
> doivent jamais apparaître dans le code du dépôt : elles ne vivent que dans
> Vercel. Cette paire VAPID a été générée pour vous ; si elle fuite, il suffit
> d'en régénérer une (voir plus bas) — les appareils se réabonneront seuls.

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ANTHROPIC_API_KEY` et `ALLOWED_ORIGINS`
sont déjà en place depuis la v7.

---

## 3. Les secrets côté Supabase ✅ fait

C'est ce qui permet au planificateur de Supabase d'appeler Vercel toutes les
minutes. Enregistré le 19/08/2026 :

| Secret | Valeur |
|---|---|
| `app_url` | `https://ideaforma-opco.vercel.app` |
| `rappels_secret` | `jqK1O7huf1FZmO2bC4LGp0Nig0y8VuQF` |

> Le domaine de production est **`ideaforma-opco.vercel.app`** (projet Vercel
> `ideaforma`), et non `ideaforma.vercel.app` comme le supposaient les
> commentaires d'origine. Si `ALLOWED_ORIGINS` contient encore l'ancienne
> valeur, le corriger — sinon `/api/ai` renverra « Origine non autorisée ».

Pour relire ou corriger plus tard :

```sql
select name, decrypted_secret from vault.decrypted_secrets
 where name in ('app_url','rappels_secret');

-- Changer une valeur :
select vault.update_secret(
  (select id from vault.secrets where name = 'rappels_secret'),
  'NOUVELLE_VALEUR', 'rappels_secret');
```

---

## 4. La mise en ligne

Les fichiers nouveaux ou modifiés, à commiter :

```
setup_update8.sql          nouveau   migration
package.json               nouveau   dépendance web-push
manifest.webmanifest       nouveau   application installable
sw.js                      nouveau   service worker (notifications + hors ligne)
icons/                     nouveau   6 icônes générées depuis le logo
api/rappels.js             nouveau   envoi des notifications
api/push-config.js         nouveau   clé publique VAPID
api/ai.js                  modifié   relais des outils pour l'assistant
css/vie.css                nouveau   styles des nouvelles pages
js/vie.js                  nouveau   accès aux nouvelles tables
js/notifications.js        nouveau   permission + abonnement push
js/hub.js                  nouveau   tableau de bord polyvalent
js/taches.js               nouveau   listes de tâches
js/agenda.js               nouveau   calendrier
js/notes.js                nouveau   pense-bête
js/coffre.js               nouveau   documents
js/assistant.js            nouveau   assistant IA
js/app.js                  modifié   routeur + réglages notifications
app.html                   modifié   navigation + métadonnées PWA
index.html                 modifié   métadonnées PWA
vercel.json                modifié   en-têtes du service worker
```

```bash
git add -A
git commit -m "feat(v8): assistant du quotidien — agenda, tâches, notes, coffre, IA et notifications push"
git push
```

`package.json` apparaît pour la première fois : Vercel va installer `web-push`
au déploiement. Aucune étape de build n'est ajoutée, le front reste en
JavaScript vanilla.

---

## 5. La vérification, dans cet ordre

1. **Ouvrir l'application.** Le tableau de bord doit afficher la barre de
   saisie rapide et quatre tuiles. Un encart d'erreur mentionnant une table
   absente signifie que l'étape 1 n'est pas passée.

2. **Créer un rendez-vous** dans 10 minutes, avec un rappel « 5 min avant ».

3. **Paramètres → Notifications → Activer les notifications**, puis
   **Tester tout de suite** : une notification doit apparaître immédiatement.
   C'est le test du navigateur.

4. **Tester le rappel serveur (1 min)** : fermer complètement l'application et
   attendre. La notification doit arriver toute seule — c'est le test de la
   chaîne complète (pg_cron → Vercel → appareil). Si rien n'arrive :
   Vercel → **Logs** → chercher `/api/rappels`. Un 401 = les deux
   `RAPPELS_SECRET` ne concordent pas.

5. **Assistant** : taper *« qu'est-ce que j'ai de prévu cette semaine ? »*,
   puis *« rappelle-moi d'appeler le comptable jeudi à 10h »*. La tâche doit
   apparaître dans la page Tâches avec sa cloche.

---

## Sur iPhone

Safari ne délivre de notifications qu'aux applications **installées**. Sur le
téléphone :

1. Ouvrir l'application dans **Safari** (ni Chrome, ni Firefox).
2. Bouton **Partager** → **Sur l'écran d'accueil** → **Ajouter**.
3. Rouvrir IDEAFORMA **depuis l'icône** de l'écran d'accueil.
4. Paramètres → Notifications → **Activer**.

Tant que l'application est ouverte dans un onglet Safari classique, le bouton
d'activation refusera l'abonnement en expliquant pourquoi. Sur Android et sur
ordinateur, l'installation n'est pas obligatoire mais reste recommandée.

---

## Ce qui a changé dans l'existant

- **`taches`** a été étendue (liste, étiquette, heure, rappel, notes) plutôt
  que doublée : les tâches liées aux dossiers OPCO et les tâches personnelles
  vivent au même endroit et remontent dans le même agenda.
- **L'ancien tableau de bord OPCO** n'a pas disparu : il est devenu
  **« Activité OPCO »** dans la section *Formation* de la barre latérale.
  « Ma journée » est inchangée.
- **Le bucket `documents`** accueille désormais le coffre personnel sous
  `<user_id>/coffre/`. Les policies de la v6 s'appliquent telles quelles ; la
  liste des formats acceptés a été élargie et la limite passée à 25 Mo.
- **`/api/ai`** relaie maintenant les outils et accepte deux modèles :
  `rapide` (Haiku, utilisé par la génération de programmes) et `complet`
  (Sonnet, utilisé par l'assistant). Les appels existants continuent de
  recevoir le champ `text` comme avant.
- **Un job cron revient**, alors que la v7 l'avait démonté. Ce n'est pas le
  même : la v7 supprimait le digest quotidien par e-mail. Ici il s'agit
  d'envoyer une notification à l'heure exacte d'un rendez-vous, ce qu'aucun
  navigateur ne peut déclencher seul.

---

## Régénérer la paire de clés VAPID

Si besoin un jour :

```bash
node -e "
const c=require('crypto');
const {publicKey,privateKey}=c.generateKeyPairSync('ec',{namedCurve:'prime256v1'});
console.log('VAPID_PUBLIC_KEY='+Buffer.from(publicKey.export({type:'spki',format:'der'}).subarray(-65)).toString('base64url'));
console.log('VAPID_PRIVATE_KEY='+privateKey.export({format:'jwk'}).d);
"
```

Remplacer les deux variables dans Vercel, redéployer, puis réactiver les
notifications sur chaque appareil : l'application détecte le changement de clé
et refait l'abonnement toute seule.

---

## Si quelque chose cloche

| Symptôme | Cause la plus probable |
|---|---|
| « Impossible de charger cette page » | `setup_update8.sql` pas joué |
| Le bouton d'activation refuse | iPhone sans installation, ou notifications bloquées dans le navigateur |
| Notification de test OK, rappel serveur muet | secrets Vault absents, ou `RAPPELS_SECRET` différent entre Supabase et Vercel |
| `/api/rappels` renvoie 500 | `SUPABASE_SERVICE_ROLE_KEY` ou les clés VAPID manquantes dans Vercel |
| L'assistant répond « Erreur 401 » | session expirée : se déconnecter puis se reconnecter |
| L'assistant ne crée rien | `api/ai.js` n'a pas été redéployé (version sans support des outils) |
| Les pages ne se mettent pas à jour après un déploiement | le service worker sert son cache : changer `CACHE_VERSION` en tête de `sw.js` à chaque mise en ligne |
