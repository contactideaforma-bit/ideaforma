# IDEAFORMA — Roadmap produit

**Objet :** faire passer l'application d'un carnet d'adresses enrichi à l'outil de pilotage quotidien d'un organisme de formation.
**Cadre :** usage interne IDEAFORMA, Supabase + front vanilla JS, 5 OPCO.
**Date :** 15 août 2026

---

## 1. Diagnostic de l'existant

### Ce qui est déjà solide

| Brique | État |
|---|---|
| Auth + RLS Supabase | Propre, isolation par `user_id` sur toutes les tables |
| Référentiel OPCO (`opco.js`) | Vraiment riche : délais, plafonds, pièces requises, alertes, tips par OPCO. **C'est l'actif le plus précieux du projet** — et il est aujourd'hui inexploité par le moteur |
| Génération PDF | 5 documents (devis, convention, programme, feuilles de présence, facture), en-tête personnalisable, logo et couleurs de marque |
| Module IA | Génération de programme OPCO-aware, reformulation, pré-vérification de dossier — bonne idée, bien branchée sur le CONFIG |
| Dashboard | Calendrier, formations à venir, tâches, alertes |

### Les 6 blocages structurels

**① Le statut du dossier est linéaire alors que la réalité est parallèle.**
Aujourd'hui : `devis_fait → devis_envoyé → devis_signé → accepté_opco → formation_en_cours → payé`.
Dans la vraie vie, un dossier peut être **formation terminée + OPCO en instruction + facture impayée** en même temps. Le modèle actuel ne sait pas le représenter, donc il ne sait pas alerter dessus. C'est la cause racine de la moitié des autres limites.

**② Le référentiel OPCO ne pilote rien.**
Constructys exige un dépôt 1 mois avant, Mobilité 15 jours, un KBIS de moins de 3 mois. Ces règles sont écrites dans `opco.js`… et affichées comme des conseils. Elles ne génèrent aucune échéance, aucune checklist cochable, aucun blocage. L'outil sait ce qu'il faut faire mais ne le rappelle pas.

**③ Les données métier sont enfermées dans du JSON.**
`salaries` et `dates_formation` sont des `jsonb`. Conséquence : impossible d'émarger par demi-journée, de suivre un stagiaire d'une formation à l'autre, de compter les heures-stagiaires (base du BPF), de relancer un participant pour son évaluation à froid.

**④ Rien n'est conservé.**
Les PDF sont générés à la volée et jamais stockés. Aucune trace de ce qui a été envoyé, ni des pièces reçues (devis signé, KBIS, accord de prise en charge, RIB). En audit Qualiopi ou en litige OPCO, l'outil ne prouve rien.

**⑤ La durée en heures n'existe pas.**
`prix` est saisi, `dates_formation` donne des périodes, mais **aucun champ `durée_heures`**. Or tous les plafonds OPCO sont exprimés en €/h. Impossible de calculer une prise en charge, un reste à charge, ou le BPF. C'est un champ manquant qui bloque tout l'axe financier.

**⑥ Un client = un OPCO.**
`clients` porte la colonne `opco` avec un `check` sur 5 valeurs. Une entreprise multi-conventions oblige à créer des doublons, et la navigation force à connaître l'OPCO avant de retrouver un client.

### Bugs et risques identifiés dans le code

| # | Fichier | Problème | Gravité |
|---|---|---|---|
| B1 | `dashboard.js` L28-31, 405-455 | Les stats sont calculées sur les **clients** avec des champs qui n'existent que sur les **dossiers** (`c.status`, `c.price`). Résultat : « CA total » affiche toujours **0 €**, « Dossiers en cours » compte les clients, « Statuts en cours » est toujours vide | 🔴 Haute — le dashboard ment |
| B2 | `api/ai.js` | Endpoint **sans authentification**, `Access-Control-Allow-Origin: *`. N'importe qui peut appeler `/api/ai` et consommer la clé Anthropic | 🔴 Haute — sécurité / coût |
| B3 | `documents.js` L18-21 | Numéro de facture = `FAC-AAAAMM-{random 100-999}`. Collisions possibles, séquence non continue → **non conforme** aux obligations de numérotation des factures | 🔴 Haute — conformité |
| B4 | Repo | `setup_update.sql` (v2) est absent du dépôt. `clients.siret`, `profiles.adresse / telephone / numero_da / numero_qualiopi` sont utilisés par le code mais n'apparaissent dans aucun script versionné | 🟠 Moyenne — impossible de rejouer le schéma |
| B5 | `data.js` `getAllClients` | Charge **tous** les clients + **tous** les dossiers imbriqués à chaque rendu de page, puis filtre côté navigateur | 🟠 Moyenne — dégradation à ~200 dossiers |

---

## 2. Le changement structurant : le dossier à 4 axes

Un seul changement débloque tout le reste. Remplacer le statut unique par **quatre statuts indépendants** :

| Axe | Valeurs | Ce qu'il pilote |
|---|---|---|
| **Commercial** | brouillon → devis envoyé → devis signé → perdu / annulé | Relances devis, taux de transformation |
| **OPCO** | non requis → à déposer → déposé → en instruction → accepté / refusé / à compléter | Délais de dépôt, n° d'accord, montant accordé |
| **Pédagogique** | à planifier → planifiée → en cours → terminée → abandonnée | Convocations, émargements, attestations |
| **Facturation** | non facturable → à facturer → facturée → payée partiel → payée → impayée | Encaissements, relances impayés, trésorerie |

Chaque axe déclenche ses propres échéances et ses propres alertes. Le pipeline visuel devient lisible : on voit d'un coup d'œil les 3 dossiers « formation terminée mais pas facturée » — aujourd'hui invisibles.

L'ancienne colonne `statut` est conservée et re-calculée automatiquement pour ne rien casser dans le front existant.

---

## 3. Vague 1 — Le socle (2 à 3 semaines)

> Objectif : le modèle de données ne bloque plus rien, et le dashboard dit la vérité.

**1.1 Migration du modèle** *(script fourni : `setup_update5.sql`)*
- Statuts multi-axes + rétro-compatibilité
- `duree_heures`, `lieu`, `reference` (numérotation serveur), `opco_code` sur le dossier
- Éclatement des `jsonb` : tables `stagiaires` et `sessions` (créneaux datés avec heures)
- Migration automatique des données existantes depuis les `jsonb`

**1.2 Référentiel OPCO en base**
Sortir `OpcoPage.CONFIG` du JavaScript vers la table `opco_referentiel`, versionnée par année. Aujourd'hui, un changement de barème = un commit + un déploiement. Demain : une ligne modifiée dans l'app.

**1.3 Correction des bugs B1 à B4**
- Dashboard recalculé sur les dossiers (via la vue `v_dossiers_360`)
- `/api/ai` protégé par vérification du JWT Supabase + CORS restreint au domaine
- Numérotation devis / convention / facture via séquence serveur atomique (table `compteurs`)
- Ré-écriture d'un `setup.sql` consolidé et rejouable

**1.4 Multi-OPCO par dossier**
Le dossier porte son OPCO. Une entreprise = une fiche unique, quel que soit le financeur.

---

## 4. Vague 2 — Le moteur d'échéances OPCO *(le cœur de l'outil)* (2 semaines)

> Objectif : ne plus jamais rater un délai de dépôt. C'est ce qui rend l'outil indispensable plutôt qu'agréable.

**2.1 Rétroplanning automatique**
À la saisie de la date de démarrage, l'application génère les échéances en lisant le référentiel OPCO :

| Échéance | Règle |
|---|---|
| Dépôt du dossier OPCO | J-30 (Constructys), J-15 (Mobilité), avant démarrage (Commerce, AKTO, EP) |
| Relance du devis | J+7 après envoi sans réponse |
| Convocations stagiaires | J-10 |
| Émargements à récupérer | J+1 après chaque session |
| Facturation | J+1 après fin de formation |
| Relance impayé 1 / 2 | J+30 / J+45 après émission |
| Évaluation à froid | J+90 après fin de formation |

**2.2 Checklist de pièces générée par OPCO**
Le tableau `documents` du référentiel existe déjà par OPCO. À la création du dossier, l'app crée automatiquement les lignes à fournir :
`Convention signée ☐ · Programme ☐ · Devis signé ☐ · Attestation Qualiopi ☐ · RIB ☐ · Fiche d'adhésion ☐`
Chaque ligne accepte un upload (Supabase Storage). Le dossier affiche **« Prêt à déposer : 4/6 »** et le bouton *Déposer* reste désactivé tant que les pièces obligatoires manquent.

**2.3 Contrôle d'adhésion**
Champ `statut_adhesion_opco` (à vérifier / adhérent / non adhérent) + `numero_adherent`. Les 5 fiches OPCO répètent toutes « vérifier l'adhésion avant tout dossier » — c'est la première cause de refus. Un dossier sur une entreprise « à vérifier » lève une alerte bloquante.

**2.4 Écran « Mes actions du jour »**
Remplace les alertes actuelles (2 règles, calculées côté navigateur) par une vue serveur `v_actions_du_jour` triée par criticité, avec un e-mail récapitulatif quotidien (Supabase Edge Function + `pg_cron`).

**2.5 Suivi de l'instruction**
`date_depot`, `date_accord`, `numero_accord`, `montant_demandé`, `montant_accordé`, motif de refus. Sans ça, impossible de savoir combien l'OPCO doit réellement.

---

## 5. Vague 3 — Conformité Qualiopi (3 semaines)

> Objectif : l'audit se prépare en une journée au lieu de trois semaines.

**3.1 Documents manquants**
La bibliothèque actuelle couvre devis, convention, programme, feuilles de présence, facture. Il manque :
- **Convocation stagiaire** (indicateur 4)
- **Attestation de fin de formation** — *obligatoire*, art. L.6353-1 du Code du travail
- **Attestation de présence** consolidée (déclencheur du paiement chez Constructys et OPCO Commerce)
- **Certificat de réalisation** (modèle réglementaire pour l'OPCO)
- **Livret d'accueil** stagiaire (règlement intérieur, accessibilité, réclamations)

**3.2 Émargement numérique**
Une session = un lien / QR code. Signature au doigt sur tablette ou téléphone, par demi-journée, horodatée. L'attestation de présence se génère toute seule. C'est l'irritant n°1 des formateurs et le premier motif de blocage de paiement OPCO.

**3.3 Évaluations à chaud et à froid**
Questionnaires envoyés par lien public tokenisé (à chaud en fin de session, à froid à J+90), résultats agrégés en taux de satisfaction et en indicateurs d'atteinte des objectifs → indicateurs Qualiopi 11, 30, 31.

**3.4 Registre des réclamations et des aléas**
Table dédiée, obligatoire à l'indicateur 31. Aujourd'hui inexistant.

**3.5 Accessibilité handicap**
Champ « besoin d'adaptation » par stagiaire + référent handicap dans le profil de l'organisme → indicateur 26.

**3.6 Pack audit en un clic**
Sélection d'un échantillon de dossiers → export ZIP indexé : programme, convention, convocations, émargements, évaluations, attestations, facture. Avec une table de correspondance **indicateur Qualiopi → preuves fournies**.

**3.7 BPF pré-rempli**
Le Bilan Pédagogique et Financier annuel (obligatoire, avant le 31 mai) demande : nombre de stagiaires, heures-stagiaires, produits par origine de financement. Une fois le modèle éclaté (sessions + stagiaires + financements), c'est une simple vue SQL. **Fonctionnalité à très fort effet de levier : deux jours de travail annuel supprimés.**

---

## 6. Vague 4 — Pilotage financier (2 semaines)

**4.1 Simulateur de prise en charge — à faire en premier**
Les tableaux de plafonds sont déjà saisis pour les 5 OPCO. En croisant `effectif de l'entreprise × type de formation × durée en heures × nombre de stagiaires`, l'app affiche **avant même le devis** :

> *AKTO · TPE 8 salariés · 14 h · 3 stagiaires → prise en charge estimée 35 €/h = 1 470 € · reste à charge 530 €*

C'est un argument commercial direct, et ça évite les devis qui dépassent le plafond et se font refuser.

**4.2 Financements multi-sources**
Un dossier peut combiner OPCO + reste à charge entreprise + CPF + FNE. Table `financements` avec, pour chaque source : demandé / accordé / facturé / encaissé.

**4.3 Facturation et encaissements**
Table `factures` avec numérotation serveur continue, échéance, acompte, solde, date de paiement. Relances automatiques à J+30 et J+45. Mention d'exonération de TVA (art. 261-4-4° a du CGI) gérée par un booléen — aujourd'hui le prix est HT sans que la règle soit portée.

**4.4 Tableau de bord trésorerie**
Prévisionnel d'encaissement à 3 mois : ce qui est accordé mais pas facturé, facturé mais pas encaissé, en retard. Plus le carnet de commandes (dossiers signés non démarrés).

**4.5 Marge par dossier**
Table `formateurs` avec coût horaire (interne / sous-traitant). Marge = prix − coût formateur − frais. Permet de savoir quelles formations et quels OPCO sont réellement rentables.

**4.6 Export comptable**
CSV des factures et encaissements exploitable par l'expert-comptable.

---

## 7. Vague 5 — Productivité et saisie (1 à 2 semaines)

**5.1 Import SIRET automatique**
API publique `recherche-entreprises.api.gouv.fr` : saisie du SIRET → raison sociale, adresse, code NAF, effectif, date de création remplis automatiquement. Le code NAF permet même de **suggérer l'OPCO**. Environ 80 % de la saisie client supprimée, et plus de fautes de frappe sur la raison sociale qui font rejeter un dossier.

**5.2 Catalogue de formations réutilisable**
Aujourd'hui, chaque dossier ressaisit objectifs, contenu, prérequis, évaluation. Un catalogue versionné : on choisit « Habilitation électrique B0/H0 — v3 » et tout se pré-remplit. Cohérence Qualiopi assurée, et l'IA sert à créer le modèle une fois plutôt qu'à chaque dossier.

**5.3 Vue pipeline transverse**
Kanban glisser-déposer par axe de statut, toutes OPCO confondues, avec recherche globale (entreprise, stagiaire, référence, sujet). La navigation actuelle oblige à connaître l'OPCO pour retrouver un client.

**5.4 Duplication de dossier**
« Refaire la même formation pour une autre entreprise » en trois clics.

**5.5 Import CSV des stagiaires**
Les listes arrivent par e-mail en Excel. Coller/importer plutôt que retaper.

**5.6 Envoi par e-mail depuis l'app**
Devis, convention, convocations envoyés directement avec trace d'envoi, au lieu de télécharger puis rattacher manuellement dans le client mail.

**5.7 Signature électronique** *(optionnel, 1 semaine)*
Yousign ou Docuseal sur le devis et la convention → passage automatique en « devis signé ». Supprime le va-et-vient scan/renvoi qui fait perdre 3 à 10 jours par dossier.

---

## 8. Dette technique à traiter en parallèle

| Sujet | Action |
|---|---|
| `opco.js` 68 Ko et `documents.js` 49 Ko en scripts globaux | Passer en modules ES + build (Vite). La dette bloquera l'ajout de fonctionnalités bien avant les utilisateurs |
| Tout chargé en mémoire à chaque page | Pagination + fonctions RPC Postgres pour les agrégats du dashboard, au lieu de recalculer côté navigateur |
| Aucun test | Au minimum : tests sur les calculs de prise en charge et de dates d'échéance — ce sont eux qui produiront des erreurs coûteuses |
| Migrations non versionnées | Un dossier `migrations/` numéroté, chaque script idempotent |
| Historique | Table `historique` alimentée par trigger : qui a changé quoi, quand. Utile en litige OPCO et attendu en audit |

---

## 9. Priorisation — ce que je ferais dans l'ordre

| Rang | Chantier | Effort | Impact |
|---|---|---|---|
| 1 | Migration du modèle + correction des bugs B1-B4 | 2-3 sem. | Débloque tout le reste |
| 2 | Rétroplanning + checklist de pièces par OPCO | 2 sem. | 🔥 C'est ce qui rend l'outil indispensable |
| 3 | Simulateur de prise en charge | 3 jours | 🔥 Effet immédiat, données déjà présentes |
| 4 | Émargement numérique + attestations | 1,5 sem. | Débloque les paiements OPCO |
| 5 | Facturation, encaissements, relances | 1,5 sem. | Trésorerie |
| 6 | Import SIRET + catalogue de formations | 1 sem. | Confort quotidien, adoption |
| 7 | Évaluations chaud/froid + registre réclamations | 1,5 sem. | Qualiopi |
| 8 | BPF + pack audit | 1 sem. | 2 jours/an économisés, argument fort |
| 9 | Pipeline transverse + recherche globale | 1 sem. | Ergonomie |
| 10 | Signature électronique | 1 sem. | Raccourcit le cycle de vente |

**Les trois premiers points suffisent à changer la nature de l'outil.** Le reste construit la profondeur.

---

## 10. Modèle de données cible

```
organisme (profiles)
 └── clients ──────────────┐
      ├── contacts         │
      └── dossiers ────────┘
           ├── sessions ──── emargements ──┐
           ├── stagiaires ─────────────────┤
           │    └── evaluations            │
           ├── pieces  (checklist + Storage)
           ├── echeances (rétroplanning auto)
           ├── financements (OPCO / entreprise / CPF / FNE)
           ├── factures ──── encaissements
           └── formateur

referentiels : opco_referentiel · formations_catalogue · formateurs
transverses  : reclamations · veille · historique · compteurs
```

Script de migration fourni : **`setup_update5.sql`** — idempotent, additif, avec reprise automatique des données `jsonb` existantes.
