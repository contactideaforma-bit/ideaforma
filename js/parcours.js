/* ─────────────────────────────────────────────────────────────────────────────
   IDEAFORMA — Parcours CFA & EDOF

   Guide et suivi des démarches pour :
     – référencer l'organisme sur EDOF (CPF) : bilan de compétences puis
       formations certifiantes via habilitations de certificateurs ;
     – activer le volet CFA / apprentissage (phase 2, quand il y aura un local).

   Le RÉFÉRENTIEL (volets, étapes, guides, liens) vit ici, dans le code :
   c'est de la connaissance métier, mise à jour au fil du projet.
   L'ÉTAT (statut, notes, date) vit dans la table parcours_etapes
   (setup_update11.sql), une ligne par étape réellement manipulée.

   Statuts : a_faire → en_cours → fait (cycle au clic), plus « bloqué » et
   « sans objet » via le sélecteur du guide.
───────────────────────────────────────────────────────────────────────────── */

const ParcoursPage = {

  _etats:     {},          // etape_id → ligne parcours_etapes
  voletActif: 'prerequis',

  STATUTS: {
    a_faire:    { nom: 'À faire',    couleur: '#94A3B8' },
    en_cours:   { nom: 'En cours',   couleur: '#F59E0B' },
    fait:       { nom: 'Fait',       couleur: '#10B981' },
    bloque:     { nom: 'Bloqué',     couleur: '#EF4444' },
    sans_objet: { nom: 'Sans objet', couleur: '#64748B' }
  },

  /* ══════════════════════════════════════════════
     RÉFÉRENTIEL DES ÉTAPES
  ══════════════════════════════════════════════ */
  VOLETS: [

  /* ── Volet 1 : ce qui doit être propre avant tout dépôt de dossier ── */
  {
    id: 'prerequis', nom: 'Prérequis', icone: '🧱',
    titre: 'Prérequis & régularisations',
    description: 'À traiter avant tout dépôt : la Caisse des Dépôts et les certificateurs vérifieront ces points.',
    etapes: [
      {
        id: 'bpf2025', icone: '📊', titre: 'Vérifier / déposer le BPF 2025', duree: '15 min (vérif)', urgent: true,
        resume: 'Sans BPF déposé, le NDA peut être déclaré caduc — et la CDC le contrôle pour EDOF.',
        guide: `
          <p><strong>Pourquoi c'est critique :</strong> le Bilan Pédagogique et Financier est une obligation annuelle de tout organisme de formation. Sans dépôt, le NDA 11922999392 peut être déclaré caduc, et la Caisse des Dépôts vérifie le BPF lors du référencement EDOF.</p>
          <p><strong>Comment vérifier :</strong></p>
          <ul>
            <li>Aller sur <a href="https://mesdemarches.emploi.gouv.fr" target="_blank" rel="noopener">Mon Activité Formation</a> (portail Mes démarches emploi).</li>
            <li>Se connecter avec le compte utilisé pour la déclaration d'activité.</li>
            <li>Rubrique « Bilan pédagogique et financier » → vérifier qu'un BPF <strong>exercice 2025</strong> est au statut « transmis / validé ».</li>
          </ul>
          <p><strong>Si non déposé :</strong> le déposer immédiatement, même hors délai. L'activité ayant commencé le 08/10/2025, le BPF 2025 couvre octobre-décembre 2025 : des chiffres modestes voire nuls sont normaux, seul le dépôt compte. Si le portail refuse hors campagne, écrire à la DRIEETS Île-de-France (service régional de contrôle) pour régulariser.</p>`
      },
      {
        id: 'greffe', icone: '⚖️', titre: 'Lever la condition suspensive au greffe de Nanterre', duree: '30 min', urgent: true,
        resume: 'Le Kbis du 18/06/2026 porte toujours la mention n°107840 : le récépissé NDA n’a probablement jamais été transmis.',
        guide: `
          <p><strong>Le constat :</strong> le Kbis porte la mention n°107840 (« formation continue sous condition suspensive de la délivrance de l'autorisation »). Le NDA existe : il faut transmettre le récépissé au greffe pour purger la mention.</p>
          <p><strong>Étapes :</strong></p>
          <ul>
            <li>Retrouver le <strong>récépissé de déclaration d'activité</strong> DRIEETS (attribution du n°11922999392). Introuvable → le redemander via Mon Activité Formation ou à la DRIEETS.</li>
            <li>Le déposer au greffe du Tribunal des activités économiques de Nanterre : en ligne via <a href="https://www.infogreffe.fr" target="_blank" rel="noopener">Infogreffe</a> (dépôt de pièce, dossier 2025B12114) ou via le guichet unique INPI, ou par courrier (lettre type dans « Guide verifications et EDOF.md » du dossier projet).</li>
            <li>Redemander un Kbis et vérifier la disparition de la mention.</li>
          </ul>
          <p><strong>Référence :</strong> art. R.123-96 du code de commerce.</p>`
      },
      {
        id: 'fcplus', icone: '🪪', titre: 'Créer l’Identité Numérique La Poste (FranceConnect+)', duree: 'quelques jours',
        resume: 'Indispensable pour accéder à EDOF. À lancer tôt : la vérification d’identité peut prendre plusieurs jours.',
        guide: `
          <p>L'accès à l'espace EDOF exige <strong>FranceConnect+</strong>, dont le support est l'<a href="https://lidentitenumerique.laposte.fr" target="_blank" rel="noopener">Identité Numérique La Poste</a>.</p>
          <ul>
            <li>Installer l'application « L'Identité Numérique » sur le smartphone.</li>
            <li>Créer le compte avec une pièce d'identité en cours de validité.</li>
            <li>Faire vérifier l'identité (en ligne ou en bureau de poste) — compter quelques jours.</li>
            <li>Tester une connexion FranceConnect+ pour valider que tout fonctionne.</li>
          </ul>`
      },
      {
        id: 'pieces', icone: '🗂️', titre: 'Rassembler le dossier de pièces', duree: '1 h',
        resume: 'Un dossier complet du premier coup évite de repartir en file d’attente à chaque demande.',
        guide: `
          <p>Pièces à réunir dans un dossier unique (elles serviront pour EDOF ET les certificateurs) :</p>
          <ul>
            <li>Kbis de <strong>moins de 3 mois</strong> (à re-tirer après la levée de la condition suspensive) ;</li>
            <li>pièce d'identité de la présidente ;</li>
            <li>certificat Qualiopi n°26-027-04 (les 3 catégories y figurent) ;</li>
            <li>récépissé NDA 11922999392 ;</li>
            <li>attestation de dépôt du BPF 2025 ;</li>
            <li>programmes de formation détaillés (catalogue) ;</li>
            <li>CV des intervenants (dont consultant bilan de compétences) ;</li>
            <li>attestations de régularité URSSAF et fiscale.</li>
          </ul>
          <p>Astuce : les ranger aussi dans le Coffre de l'application, catégorie Entreprise.</p>`
      }
    ]
  },

  /* ── Volet 2 : habilitations des certificateurs ── */
  {
    id: 'certificateurs', nom: 'Certificateurs', icone: '🎓',
    titre: 'Habilitations certificateurs',
    description: 'Adosser le catalogue à des certifications RNCP/RS existantes : condition pour vendre en CPF.',
    etapes: [
      {
        id: 'tosa', icone: '🖥️', titre: 'Envoyer la demande d’agrément TOSA (Isograd)', duree: '15 min',
        resume: 'Brouillon prêt dans Gmail. Bureautique Word/Excel/PPT — la voie la plus rapide vers le CPF certifiant.',
        guide: `
          <p>Un <strong>brouillon est prêt dans Gmail</strong> (« Demande d'agrément centre TOSA — IDEAFORMA »).</p>
          <ul>
            <li>Vérifier l'adresse de contact sur <a href="https://www.tosa.org" target="_blank" rel="noopener">tosa.org</a> (rubrique « Devenir centre agréé ») — remplir aussi leur formulaire en ligne en parallèle.</li>
            <li>Points demandés dans le courrier : procédure et conditions d'agrément, tarifs (vouchers d'examen), <strong>passage des examens à distance</strong> (essentiel en stratégie distanciel), délais.</li>
            <li>Joindre : certificat Qualiopi + Kbis si demandés.</li>
          </ul>
          <p>Modèle économique habituel : agrément peu coûteux, achat de vouchers par candidat certifié.</p>`
      },
      {
        id: 'icdl', icone: '💻', titre: 'Envoyer la demande d’habilitation ICDL France', duree: '15 min',
        resume: 'Brouillon prêt dans Gmail. Alternative/complément au TOSA, couvre aussi les outils collaboratifs.',
        guide: `
          <p>Un <strong>brouillon est prêt dans Gmail</strong> (« Demande d'habilitation centre ICDL — IDEAFORMA »).</p>
          <ul>
            <li>Vérifier l'adresse sur <a href="https://www.icdlfrance.org" target="_blank" rel="noopener">icdlfrance.org</a> (rubrique « Devenir centre habilité »).</li>
            <li>Attendus : étapes d'habilitation, coûts (redevance annuelle + passages), surveillance à distance, accompagnement au démarrage.</li>
          </ul>
          <p>TOSA et ICDL ne sont pas exclusifs : beaucoup d'organismes proposent les deux et choisissent selon le client.</p>`
      },
      {
        id: 'clea', icone: '🔑', titre: 'Contacter Certif’Pro (CléA / CléA numérique)', duree: '10 min',
        resume: 'Brouillon prêt. La dernière campagne s’est close en août 2025 : objectif = être prêts dès la prochaine vague.',
        guide: `
          <p>Un <strong>brouillon est prêt dans Gmail</strong> (adresse vérifiée : secretariat@certif-pro.fr).</p>
          <ul>
            <li>L'habilitation CléA fonctionne par <strong>campagnes</strong> (la dernière : mai → août 2025, instruction 10-14 semaines). Voir <a href="https://www.certificat-clea.fr/campagnes-dhabilitation/" target="_blank" rel="noopener">certificat-clea.fr</a>.</li>
            <li>Le courrier demande : calendrier de la prochaine vague, liste de diffusion, pièces à préparer (convention de partenariat, référentiels, exigences distanciel).</li>
            <li>Pendant l'attente : préparer le dossier (référentiel CléA ↔ votre offre « compétences fondamentales »).</li>
          </ul>
          <p>⚠️ Certaines évaluations CléA peuvent exiger du présentiel — à confirmer avec Certif'Pro.</p>`
      },
      {
        id: 'titre', icone: '📜', titre: 'Choisir le titre RNCP tertiaire et son certificateur', duree: '2-3 h de recherche',
        resume: 'Secrétaire assistant(e) / assistant(e) de direction : trouver le titre et le partenaire ou viser l’agrément titre pro.',
        guide: `
          <p>Deux routes possibles pour un titre tertiaire niveau 4-5 :</p>
          <ul>
            <li><strong>Titre professionnel du ministère du Travail</strong> (ex. « Secrétaire assistant », « Assistant de direction ») : agrément à demander à la DREETS, sessions d'examen à organiser — plus lourd, nécessite à terme un lieu d'examen.</li>
            <li><strong>Convention avec un certificateur privé</strong> détenteur d'un titre RNCP équivalent : chercher le titre sur <a href="https://www.francecompetences.fr/recherche_certificationprofessionnelle/" target="_blank" rel="noopener">France compétences</a>, la fiche indique le certificateur et souvent un contact « partenariats ».</li>
          </ul>
          <p>Un <strong>modèle de courrier</strong> est prêt dans Gmail ([MODÈLE À ADAPTER]) : compléter l'intitulé exact, le n° RNCP et le destinataire.</p>
          <p>Critères de choix : redevance, exigences pédagogiques, évaluation à distance possible, compatibilité apprentissage (pour la phase CFA).</p>`
      },
      {
        id: 'relances', icone: '🔁', titre: 'Relancer les certificateurs sans réponse (J+10)', duree: '15 min',
        resume: 'Une relance courte et polie à J+10, puis appel téléphonique à J+20.',
        guide: `
          <p>Rythme conseillé :</p>
          <ul>
            <li><strong>J+10 :</strong> relance courriel courte (« Je me permets de revenir vers vous… »), en répondant au fil d'origine.</li>
            <li><strong>J+20 :</strong> appel téléphonique (les numéros figurent sur les sites des certificateurs).</li>
            <li>Noter chaque contact dans les notes de cette étape : date, interlocuteur, réponse.</li>
          </ul>`
      },
      {
        id: 'conventions', icone: '✍️', titre: 'Étudier et signer les conventions d’habilitation', duree: 'selon retours',
        resume: 'Lire les engagements (redevances, quotas, audits) avant signature — ils conditionnent la marge des parcours CPF.',
        guide: `
          <p>À vérifier dans chaque convention avant signature :</p>
          <ul>
            <li>coût par candidat (voucher) et minimum annuel éventuel ;</li>
            <li>conditions de <strong>surveillance des examens à distance</strong> ;</li>
            <li>droits d'usage de la marque (mention sur le site, catalogue EDOF) ;</li>
            <li>obligations de reporting et d'audit du certificateur ;</li>
            <li>durée, renouvellement, conditions de sortie.</li>
          </ul>
          <p>Une fois signée, la convention permet de rattacher la certification au catalogue EDOF (voir volet EDOF, étape « Rattacher TOSA/ICDL »).</p>`
      }
    ]
  },

  /* ── Volet 3 : référencement EDOF et exploitation CPF ── */
  {
    id: 'edof', nom: 'EDOF / CPF', icone: '🟦',
    titre: 'Référencement EDOF (CPF)',
    description: 'Produit d’appel : le bilan de compétences (Qualiopi déjà conforme). Puis les parcours certifiants.',
    etapes: [
      {
        id: 'edofacces', icone: '🚪', titre: 'Déposer la demande d’accès EDOF', duree: '2 h + ~2 mois d’instruction',
        resume: 'FranceConnect+, formulaire, pièces, formation en ligne obligatoire, décision sous ~2 mois.',
        guide: `
          <p><strong>Prérequis :</strong> BPF déposé, FranceConnect+ actif, pièces prêtes (volet Prérequis).</p>
          <p><strong>Déroulé :</strong></p>
          <ul>
            <li>Sur <a href="https://of.moncompteformation.gouv.fr" target="_blank" rel="noopener">of.moncompteformation.gouv.fr</a> : formulaire « Demande d'accès à l'espace des organismes de formation ».</li>
            <li>Recevabilité ≈ 11 jours ouvrés ; pièces complémentaires à fournir <strong>sous 8 jours</strong> (surveiller la boîte mail !) ;</li>
            <li>session de formation en ligne obligatoire ;</li>
            <li>décision de la Caisse des Dépôts sous ~2 mois.</li>
          </ul>
          <p>⚠️ Un dossier incomplet repart en file d'attente : viser le complet du premier coup.</p>`
      },
      {
        id: 'offrebdc', icone: '🧭', titre: 'Construire l’offre bilan de compétences', duree: '1-2 jours',
        resume: '3 phases légales, ≤ 24 h, visio synchrone, tarif 1 200-1 800 €, consultant qualifié : la CDC examine le fond.',
        guide: `
          <p>L'offre doit décrire précisément :</p>
          <ul>
            <li>les <strong>3 phases légales</strong> : préliminaire (analyse de la demande) / investigation (tests, entretiens, exploration des pistes) / conclusions (synthèse écrite, plan d'action) ;</li>
            <li>durée totale <strong>≤ 24 h</strong>, dont entretiens synchrones en visio (compatible 100 % distanciel) ;</li>
            <li>tarif aligné marché : viser <strong>1 200 – 1 800 €</strong> (au-delà de ~2 000 € : contrôles prioritaires) ;</li>
            <li>outils nommés : tests d'intérêts professionnels, entretiens semi-directifs, enquêtes métier… ;</li>
            <li>livrables : document de synthèse type + engagement de confidentialité ;</li>
            <li>modalités handicap (référent, adaptations).</li>
          </ul>
          <p><strong>Question clé : qui réalise les bilans ?</strong> Si c'est la dirigeante : consolider le CV côté accompagnement ; une certification courte de praticien en bilan de compétences renforce nettement le dossier. Si c'est un consultant partenaire : CV + contrat à joindre.</p>`
      },
      {
        id: 'entretien', icone: '🎥', titre: 'Préparer l’entretien visio avec la CDC', duree: '2 h de préparation',
        resume: 'La Caisse des Dépôts vérifie de vive voix la méthodologie, la qualification et la confidentialité.',
        guide: `
          <p>Sujets systématiquement abordés :</p>
          <ul>
            <li>méthodologie détaillée des 3 phases, outils utilisés ;</li>
            <li>qualification et expérience du consultant ;</li>
            <li>protocole de confidentialité (stockage des synthèses, consentement) ;</li>
            <li>modalités distancielles : plateforme visio, émargement, assiduité ;</li>
            <li>gestion des abandons et des réclamations.</li>
          </ul>
          <p>Préparer des réponses concrètes et courtes ; avoir les documents sous la main pour partage d'écran.</p>`
      },
      {
        id: 'publication', icone: '📢', titre: 'Publier l’offre et ouvrir les ventes', duree: '2 h',
        resume: 'Au moins une offre publiée pour être visible sur moncompteformation.gouv.fr.',
        guide: `
          <ul>
            <li>Rédiger la fiche : titre clair orienté bénéfice, programme, prérequis (aucun), modalités (100 % à distance, entretiens individuels), durée, tarif.</li>
            <li>Soigner les champs recherchés par les usagers (mots-clés « bilan de compétences à distance »).</li>
            <li>Vérifier l'affichage public sur <a href="https://www.moncompteformation.gouv.fr" target="_blank" rel="noopener">moncompteformation.gouv.fr</a>.</li>
          </ul>
          <p>Rappel : le titulaire CPF supporte un reste à charge forfaitaire (~100 € indexés) — utile à connaître pour répondre aux prospects, jamais à « compenser » (interdit).</p>`
      },
      {
        id: 'routine', icone: '⏱️', titre: 'Mettre en place la routine des obligations EDOF', duree: 'process permanent',
        resume: 'Délais stricts : inscription 7 j, entrée en formation, émargements, clôture 30 j. Un manquement = non-paiement.',
        guide: `
          <p>À chaque dossier :</p>
          <ul>
            <li>valider l'inscription <strong>sous 7 jours</strong> (sinon annulation automatique) ;</li>
            <li>confirmer l'entrée en formation après le premier rendez-vous (déclenche le paiement) ;</li>
            <li>émarger chaque séance ;</li>
            <li>transmettre l'attestation d'assiduité en fin de parcours ;</li>
            <li>clôturer la session <strong>sous 30 jours</strong> (sinon « abandon »).</li>
          </ul>
          <p>🚫 <strong>Jamais de démarchage</strong> des titulaires CPF (téléphone, SMS, mail, réseaux sociaux) : interdiction légale absolue, sanctionnée par le déréférencement.</p>
          <p>Idée : créer des tâches types dans l'app pour chaque dossier (7 j / 30 j).</p>`
      },
      {
        id: 'certifiantes', icone: '🔗', titre: 'Rattacher TOSA / ICDL au catalogue EDOF', duree: '1 h par certification',
        resume: 'Après signature des conventions : parcours bureautique certifiants publiés sur Mon Compte Formation.',
        guide: `
          <ul>
            <li>Dans EDOF, créer les offres en les rattachant aux certifications (n° RS) du certificateur — l'habilitation est vérifiée par la CDC auprès du certificateur.</li>
            <li>Structurer les parcours : formation (heures, programme) + passage de la certification inclus.</li>
            <li>Cohérence tarifaire avec le marché (contrôles sur les prix aberrants).</li>
          </ul>
          <p>Prérequis : étape « Conventions » du volet Certificateurs au statut Fait.</p>`
      }
    ]
  },

  /* ── Volet 4 : CFA / apprentissage — déclenché quand il y a un lieu ── */
  {
    id: 'cfa', nom: 'CFA', icone: '🚗',
    titre: 'CFA / Apprentissage — phase 2',
    description: 'Le socle est prêt (Qualiopi 4°, UAI 0923466T au 07/09/2026). Déclencheur : un lieu de formation réel.',
    etapes: [
      {
        id: 'locaux', icone: '🏢', titre: 'Trouver le lieu : local et/ou ateliers partenaires', duree: 'déclencheur de la phase',
        resume: 'Accueillir des apprentis exige des locaux réels (ERP). Options : local Marseille/PACA, conventions d’ateliers carrossiers.',
        guide: `
          <p>Trois options cumulables :</p>
          <ul>
            <li><strong>Conventions de mise à disposition d'ateliers</strong> avec les carrosseries partenaires (la pratique peut s'appuyer sur l'entreprise) — la voie la plus rapide pour la carrosserie ;</li>
            <li>partenariat / location de plateaux avec un CFA ou lycée pro équipé ;</li>
            <li>location ou achat d'un local (probablement Marseille/PACA) : vérifier conformité ERP, accessibilité, capacité.</li>
          </ul>
          <p>⚠️ Ne <strong>jamais</strong> déclarer la domiciliation SOFRADOM comme lieu de formation en présentiel : motif de sanction en contrôle (DRIEETS, CDC, OPCO).</p>`
      },
      {
        id: 'uaisite', icone: '🏷️', titre: 'Déclarer le site de formation + UAI du site', duree: '4-8 semaines',
        resume: 'Si le lieu est hors Neuilly : établissement secondaire + demande d’UAI à l’académie du site (Aix-Marseille pour PACA).',
        guide: `
          <ul>
            <li>Déclarer l'établissement secondaire au greffe / guichet unique (adresse du site de formation).</li>
            <li>Demander l'UAI du site à la DSDEN / rectorat de l'académie concernée (formulaire RAMSESE) — l'UAI actuelle 0923466T reste rattachée à Neuilly.</li>
            <li>Mettre à jour la déclaration d'activité si nécessaire (DRIEETS → DREETS PACA si transfert).</li>
          </ul>
          <p>Sans UAI du lieu réel, pas de dépôt de contrat d'apprentissage possible.</p>`
      },
      {
        id: 'choixcertifs', icone: '📚', titre: 'Arrêter les certifications préparées en apprentissage', duree: '1 semaine',
        resume: 'Carrosserie : CAP EN (sans habilitation, examen via l’académie). Tertiaire : titre choisi au volet Certificateurs.',
        guide: `
          <p><strong>Carrosserie :</strong> CAP Peintre automobile / CAP Carrossier automobile — diplômes Éducation nationale : un CFA privé peut les préparer sans habilitation, en respectant le référentiel et en inscrivant les apprentis à l'examen auprès de la division des examens de l'académie. Anticiper le calendrier d'inscription (automne pour la session de juin).</p>
          <p><strong>Tertiaire :</strong> reprendre le titre du volet Certificateurs en vérifiant que la convention couvre l'apprentissage.</p>
          <p>Pour chaque certification : vérifier le <strong>NPEC</strong> sur France compétences. ⚠️ Réforme 2026 : référentiel unifié (un NPEC par certification, modulation branche ±20 %, plafond 11 000 € niv. 5-7) applicable aux contrats signés à partir de mi-2026 ; participation employeur 750 € (niv. 6-7 uniquement).</p>`
      },
      {
        id: 'ofeliacarif', icone: '🗺️', titre: 'OFéliA + référencement Carif-Oref', duree: '2-3 h',
        resume: 'Fiche CFA France compétences + visibilité de l’offre sur les moteurs (LaBonneAlternance…).',
        guide: `
          <ul>
            <li>Vérifier / créer la fiche CFA sur <strong>OFéliA</strong> (France compétences).</li>
            <li>Référencer l'offre auprès du <strong>Carif-Oref</strong> de la région du site (Île-de-France : Défi métiers ; PACA : Carif-Oref Provence-Alpes-Côte d'Azur).</li>
            <li>Contrôler la remontée sur LaBonneAlternance et l'affichage des formations.</li>
          </ul>`
      },
      {
        id: 'soltea', icone: '💰', titre: 'S’inscrire sur SOLTéA (solde taxe d’apprentissage)', duree: '1 h',
        resume: 'Dès l’UAI active : permettre aux entreprises de flécher leur solde de taxe vers IDEAFORMA.',
        guide: `
          <ul>
            <li>Inscription sur <a href="https://soltea.education.gouv.fr" target="_blank" rel="noopener">soltea.education.gouv.fr</a> (UAI + SIRET + Qualiopi).</li>
            <li>Compléter la fiche (formations, coordonnées bancaires).</li>
            <li>En parler aux entreprises partenaires (vos carrossiers !) pendant la campagne annuelle de répartition.</li>
          </ul>
          <p>Fonds utilisables pour l'équipement pédagogique.</p>`
      },
      {
        id: 'missions', icone: '🧩', titre: 'Mettre en place les missions obligatoires des CFA', duree: '1-2 semaines',
        resume: 'Art. L.6231-2 : conseil de perfectionnement, référents handicap et mobilité, compta analytique, indicateurs publiés.',
        guide: `
          <p>À documenter avant le premier contrat (contrôlé en audit Qualiopi apprentissage) :</p>
          <ul>
            <li><strong>Conseil de perfectionnement</strong> : composition, calendrier, comptes rendus ;</li>
            <li>référent <strong>handicap</strong> et référent <strong>mobilité</strong> nommés ;</li>
            <li>accompagnement des apprentis : prévention des ruptures, médiation ;</li>
            <li><strong>comptabilité analytique</strong> distinguant l'activité apprentissage ;</li>
            <li>publication des taux (réussite, insertion — InserJeunes).</li>
          </ul>
          <p>L'audit de surveillance Qualiopi (mi-2027 à début 2028) vérifiera les indicateurs apprentissage ; une nouvelle version du référentiel entre en vigueur fin 2026.</p>`
      },
      {
        id: 'opcolitige', icone: '⚠️', titre: 'Résoudre le blocage OPCO Mobilités (M-Gestion)', duree: 'en cours',
        resume: 'Prérequis opérationnel avant le premier contrat carrosserie : dépôt et facturation passent par M-Gestion.',
        guide: `
          <p>Les contrats d'apprentissage carrosserie (IDCC 1090) seront déposés et facturés via les plateformes d'OPCO Mobilités (M-Gestion / M-Campus). Le blocage de référencement en cours doit être levé avant.</p>
          <ul>
            <li>Suivre la procédure engagée (mise en demeure, escalade France compétences / DGEFP / Médiateur des entreprises).</li>
            <li>Consigner ici l'avancement (dates, réponses) pour garder la vue d'ensemble.</li>
          </ul>`
      },
      {
        id: 'contrat1', icone: '🤝', titre: 'Signer et déposer le premier contrat d’apprentissage', duree: 'aboutissement',
        resume: 'CERFA + convention, dépôt OPCO sous 5 jours ouvrables, validation ~20 jours, facturation au service fait.',
        guide: `
          <p>Circuit d'un contrat :</p>
          <ul>
            <li>identifier la branche de l'employeur → OPCO compétent (carrosserie IDCC 1090 → OPCO Mobilités ; tertiaire → selon branche) ;</li>
            <li>vérifier le <strong>NPEC exact</strong> (référentiel France compétences) au moment de la signature ;</li>
            <li>CERFA 10103 + convention de formation signés par les trois parties ;</li>
            <li>l'employeur dépose à l'OPCO <strong>sous 5 jours ouvrables</strong> après le début d'exécution ; validation sous ~20 jours ;</li>
            <li>facturation au service fait avec justificatifs (émargements, livret d'apprentissage, assiduité).</li>
          </ul>
          <p>💶 Trésorerie : premier versement souvent à M+3 / M+4 — à anticiper.</p>`
      }
    ]
  }
  ],

  /* ══════════════════════════════════════════════
     DONNÉES (table parcours_etapes, RLS par compte)
  ══════════════════════════════════════════════ */
  async _uid() {
    const { data: { session } } = await supa.auth.getSession();
    if (!session?.user?.id) throw new Error('Non authentifié');
    return session.user.id;
  },

  async _load() {
    const { data, error } = await supa.from('parcours_etapes').select('*');
    if (error) throw error;
    this._etats = {};
    (data || []).forEach(r => { this._etats[r.etape_id] = r; });
  },

  async _save(etapeId, patch) {
    const uid   = await this._uid();
    const avant = this._etats[etapeId] || {};
    const statut = patch.statut ?? avant.statut ?? 'a_faire';
    const ligne = {
      user_id:  uid,
      etape_id: etapeId,
      statut,
      notes:    patch.notes ?? avant.notes ?? '',
      fait_le:  statut === 'fait' ? (avant.fait_le || new Date().toISOString().slice(0, 10)) : null,
      maj_le:   new Date().toISOString()
    };
    const { data, error } = await supa
      .from('parcours_etapes')
      .upsert(ligne, { onConflict: 'user_id,etape_id' })
      .select().single();
    if (error) throw error;
    this._etats[etapeId] = data;
    return data;
  },

  _etat(id)   { return this._etats[id] || { statut: 'a_faire', notes: '' }; },
  _toutes()   { return this.VOLETS.flatMap(v => v.etapes); },

  _compte(volet) {
    const etapes = volet.etapes.filter(e => this._etat(e.id).statut !== 'sans_objet');
    const faites = etapes.filter(e => this._etat(e.id).statut === 'fait').length;
    return { faites, total: etapes.length };
  },

  /* ══════════════════════════════════════════════
     RENDU
  ══════════════════════════════════════════════ */
  async render() {
    document.getElementById('pageTitle').textContent    = 'Parcours CFA & EDOF';
    document.getElementById('pageSubtitle').textContent = 'Guide et suivi des démarches de développement';
    document.getElementById('pageHeaderRight').innerHTML = '';
    Loading.show();

    try { await this._load(); } catch (err) { peindreErreur(err); return; }

    const toutes  = this._toutes().filter(e => this._etat(e.id).statut !== 'sans_objet');
    const faites  = toutes.filter(e => this._etat(e.id).statut === 'fait').length;
    const pct     = toutes.length ? Math.round(100 * faites / toutes.length) : 0;
    const bloquees = this._toutes().filter(e => this._etat(e.id).statut === 'bloque').length;

    const volet = this.VOLETS.find(v => v.id === this.voletActif) || this.VOLETS[0];

    document.getElementById('pageContent').innerHTML = `
      <div class="process-sheet">

        <div class="section-card" style="margin-bottom:16px;">
          <div class="section-card-body" style="display:flex;align-items:center;gap:18px;flex-wrap:wrap;">
            <div style="flex:1;min-width:220px;">
              <div style="font-weight:700;margin-bottom:6px;">Avancement global — ${faites}/${toutes.length} étapes</div>
              <div style="height:10px;border-radius:6px;background:rgba(148,163,184,.25);overflow:hidden;">
                <div style="height:100%;width:${pct}%;border-radius:6px;background:linear-gradient(90deg,#10B981,#34D399);transition:width .3s;"></div>
              </div>
            </div>
            <div style="font-size:26px;font-weight:800;">${pct}%</div>
            ${bloquees ? `<span class="badge" style="background:rgba(239,68,68,.14);color:#EF4444;">⚠ ${bloquees} bloquée${bloquees > 1 ? 's' : ''}</span>` : ''}
          </div>
        </div>

        <div class="opco-sub-nav">
          ${this.VOLETS.map(v => {
            const c = this._compte(v);
            return `<div class="sub-nav-item ${v.id === this.voletActif ? 'active' : ''}" data-volet="${v.id}">
                      ${v.icone} ${v.nom}
                      <span style="opacity:.65;font-size:11px;margin-left:4px;">${c.faites}/${c.total}</span>
                    </div>`;
          }).join('')}
        </div>

        <div style="margin:14px 2px 18px;color:var(--text-muted);font-size:13px;">
          ${volet.description}
        </div>

        ${volet.etapes.map(e => this._ligneEtape(e)).join('')}
      </div>`;

    /* Navigation entre volets */
    document.querySelectorAll('[data-volet]').forEach(el =>
      el.addEventListener('click', () => { this.voletActif = el.dataset.volet; this.render(); })
    );

    /* Cycle de statut au clic sur la pastille */
    document.querySelectorAll('[data-cycle]').forEach(el =>
      el.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        const id  = el.dataset.cycle;
        const cur = this._etat(id).statut;
        const suivant = { a_faire: 'en_cours', en_cours: 'fait', fait: 'a_faire',
                          bloque: 'en_cours', sans_objet: 'a_faire' }[cur] || 'en_cours';
        try {
          await this._save(id, { statut: suivant });
          if (suivant === 'fait') Toast.show('Étape marquée <strong>faite</strong> ✓', 'success');
          this.render();
        } catch (err) { Toast.show('Enregistrement impossible : ' + esc(err.message), 'error'); }
      })
    );

    /* Ouverture du guide */
    document.querySelectorAll('[data-guide]').forEach(el =>
      el.addEventListener('click', () => this._ouvrirGuide(el.dataset.guide))
    );
  },

  _ligneEtape(e) {
    const etat = this._etat(e.id);
    const s    = this.STATUTS[etat.statut] || this.STATUTS.a_faire;
    const estFait = etat.statut === 'fait';
    return `
      <div class="process-section" style="${estFait ? 'opacity:.72;' : ''}${etat.statut === 'bloque' ? 'border-left:4px solid #EF4444;' : ''}">
        <div class="process-section-header" style="cursor:pointer;gap:10px;" data-guide="${e.id}">
          <span class="process-section-icon">${e.icone}</span>
          <div style="flex:1;min-width:0;">
            <div class="process-section-title" style="${estFait ? 'text-decoration:line-through;' : ''}">
              ${e.titre}
              ${e.urgent && !estFait ? '<span class="badge" style="margin-left:8px;background:rgba(239,68,68,.14);color:#EF4444;">urgent</span>' : ''}
            </div>
            <div style="font-size:12.5px;color:var(--text-muted);margin-top:3px;">${e.resume}</div>
            <div style="font-size:11.5px;color:var(--text-muted);opacity:.8;margin-top:3px;">
              ⏳ ${e.duree}
              ${etat.notes ? ' · 📝 note' : ''}
              ${etat.fait_le ? ' · fait le ' + etat.fait_le.split('-').reverse().join('/') : ''}
            </div>
          </div>
          <button class="btn btn-sm" data-cycle="${e.id}"
                  title="Cliquer pour passer au statut suivant"
                  style="border:1.5px solid ${s.couleur};color:${s.couleur};background:transparent;
                         border-radius:14px;font-weight:700;white-space:nowrap;">
            ${s.nom}
          </button>
        </div>
      </div>`;
  },

  _ouvrirGuide(etapeId) {
    const e = this._toutes().find(x => x.id === etapeId);
    if (!e) return;
    const etat = this._etat(etapeId);

    const corps = `
      <div style="line-height:1.55;font-size:13.5px;">${e.guide}</div>
      <div class="form-group" style="margin-top:16px;">
        <label style="font-weight:700;font-size:12.5px;">📝 Mes notes sur cette étape</label>
        <textarea id="parcoursNotes" rows="4" style="width:100%;"
                  placeholder="Contacts, dates, réponses reçues, décisions…">${esc(etat.notes || '')}</textarea>
      </div>
      <div class="form-group" style="margin-top:10px;">
        <label style="font-weight:700;font-size:12.5px;">Statut</label>
        <select id="parcoursStatut" class="filter-select" style="width:100%;">
          ${Object.entries(this.STATUTS).map(([k, v]) =>
            `<option value="${k}" ${etat.statut === k ? 'selected' : ''}>${v.nom}</option>`).join('')}
        </select>
      </div>`;

    Modal.open(`${e.icone} ${e.titre}`, corps, [
      { label: 'Fermer', cls: 'btn btn-secondary', action: () => Modal.close() },
      { label: 'Enregistrer', cls: 'btn btn-primary', action: async () => {
          const notes  = document.getElementById('parcoursNotes').value;
          const statut = document.getElementById('parcoursStatut').value;
          try {
            await this._save(etapeId, { notes, statut });
            Modal.close();
            Toast.show('Étape enregistrée', 'success');
            this.render();
          } catch (err) { Toast.show('Enregistrement impossible : ' + esc(err.message), 'error'); }
        } }
    ]);
  }
};
