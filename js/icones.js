/* ─────────────────────────────────────────────────────────────────────────────
   IDEAFORMA — Pictogrammes

   Un seul jeu de symboles au trait pour toute l'application, à la place des
   emojis. Trois raisons de ne pas garder les emojis :

     – ils ne sont pas dessinés par nous : Apple, Google et Windows en donnent
       trois versions différentes, souvent bariolées, qui cassent la palette ;
     – en petit ils deviennent illisibles, et leur contraste ne se contrôle pas ;
     – ils ne prennent pas la couleur du texte, donc ils ne suivent pas le
       passage en thème sombre.

   Ici tout est en « currentColor » : un pictogramme prend la couleur de son
   texte, s'éclaircit en thème sombre, et grossit avec la taille demandée.

   Usage :   Icone('agenda')                  → 20 px, couleur héritée
             Icone('plus', { taille: 16 })
             Icone('etiquette', { couleur: '#B03A63', classe: 'ic-etiq' })

   Les icônes des étiquettes, des listes et des catégories du coffre sont
   enregistrées en base sous leur NOM (« maison », « voiture »…). Les comptes
   créés avant cette version contiennent encore des emojis : EQUIV_EMOJI les
   convertit à l'affichage, sans migration de données.
───────────────────────────────────────────────────────────────────────────── */

const TRACES = {

  /* ── Navigation ── */
  tableau:    '<rect x="3" y="3" width="7" height="8" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="3" y="15" width="7" height="6" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/>',
  assistant:  '<path d="M12 3v2.5"/><rect x="4" y="5.5" width="16" height="13" rx="3.5"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><path d="M9.5 15.5h5"/><path d="M2 11v3M22 11v3"/>',
  /* Nanika : l'orbe de l'assistante, et l'onde de la conversation vocale */
  nanika:     '<circle cx="12" cy="12.5" r="8.2"/><circle cx="9.2" cy="11.4" r="1.15" fill="currentColor" stroke="none"/><circle cx="14.8" cy="11.4" r="1.15" fill="currentColor" stroke="none"/><path d="M8.6 14.8c1.9 2 4.9 2 6.8 0"/><path d="M12 4.3V2"/><path d="M4.2 6.2l1.6 1.2M19.8 6.2l-1.6 1.2"/>',
  onde:       '<path d="M2.5 12h1.8M6.5 8.5v7M10.5 4.5v15M14.5 7.5v9M18.5 10v4M21.5 12h-1"/>',
  agenda:     '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  taches:     '<path d="M4 7.5l2 2 3.5-3.5"/><path d="M4 17l2 2 3.5-3.5"/><path d="M13 8h7M13 17h7"/>',
  notes:      '<path d="M5 4.5h9.5L19 9v10.5a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4 19.5v-13A1.5 1.5 0 0 1 5.5 5"/><path d="M14 4.5V9h4.5"/><path d="M8 13h7M8 16.5h4.5"/>',
  coffre:     '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="10.5" cy="12" r="3.2"/><path d="M10.5 8.8v-1M10.5 16.2v1M7.3 12h-1M14.7 12h1M17 8.5h1.5M17 15.5h1.5"/>',
  formation:  '<path d="M2.5 8.5L12 4l9.5 4.5L12 13z"/><path d="M6.5 10.7v4.6c0 1.5 2.5 2.7 5.5 2.7s5.5-1.2 5.5-2.7v-4.6"/><path d="M21.5 8.5v5"/>',
  activite:   '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  reglages:   '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v2.6M12 18.9v2.6M21.5 12h-2.6M5.1 12H2.5M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8M18.7 18.7l-1.8-1.8M7.1 7.1L5.3 5.3"/>',

  /* ── Actions ── */
  plus:       '<path d="M12 5v14M5 12h14"/>',
  moins:      '<path d="M5 12h14"/>',
  fermer:     '<path d="M6 6l12 12M18 6L6 18"/>',
  check:      '<path d="M4.5 12.5l5 5 10-11"/>',
  envoyer:    '<path d="M4 12h15"/><path d="M13 6l6 6-6 6"/>',
  micro:      '<rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0"/><path d="M12 17.5V21M8.5 21h7"/>',
  palette:    '<path d="M12 3a9 9 0 0 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.6 1.7-1.6H16a5 5 0 0 0 5-5c0-4-4-7.3-9-7.3z"/><circle cx="7.5" cy="11" r="1.1"/><circle cx="10.5" cy="7.5" r="1.1"/><circle cx="15" cy="8" r="1.1"/>',
  rafraichir: '<path d="M20 11a8 8 0 1 0-.6 4"/><path d="M20 4.5V11h-6"/>',
  recherche:  '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  crayon:     '<path d="M16.5 3.9a2 2 0 0 1 2.8 2.8L8 18l-4 1 1-4z"/><path d="M14.5 6l3.5 3.5"/>',
  poubelle:   '<path d="M4 6.5h16M9.5 6.5V4.5A1 1 0 0 1 10.5 3.5h3a1 1 0 0 1 1 1v2"/><path d="M6.5 6.5l.8 12.4a1.6 1.6 0 0 0 1.6 1.6h6.2a1.6 1.6 0 0 0 1.6-1.6l.8-12.4"/><path d="M10.5 10.5v6M13.5 10.5v6"/>',
  chevron:    '<path d="M9 5l7 7-7 7"/>',
  epingle:    '<path d="M9 3.5h6l-.7 5.2 3.2 3.2H6.5l3.2-3.2z"/><path d="M12 11.9V20.5"/>',
  oeil:       '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  enregistrer:'<path d="M5 3.5h11L20.5 8v11.5a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5v-14A1.5 1.5 0 0 1 5 3.5z"/><path d="M7.5 3.5v5.5h8V3.5"/><rect x="7.5" y="13" width="9" height="8"/>',
  televerser: '<path d="M12 16V4.5"/><path d="M7.5 9L12 4.5 16.5 9"/><path d="M4 15.5v3A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5v-3"/>',
  migrer:     '<path d="M4 12h13"/><path d="M12 7l5 5-5 5"/><path d="M20.5 5.5v13"/>',
  abandonner: '<path d="M3.5 13.5c2-3.5 4-3.5 6 0s4 3.5 6 0 4-3.5 5 0"/>',

  /* ── Repères ── */
  cloche:     '<path d="M6 9.5a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 13.5 6 9.5z"/><path d="M10 18.5a2 2 0 0 0 4 0"/>',
  clocheOff:  '<path d="M8.2 5.6A6 6 0 0 1 18 9.5c0 2.4.5 3.9 1 4.8"/><path d="M16.5 17H4.5S6 15.5 6 11.5v-1"/><path d="M10 20a2 2 0 0 0 4 0"/><path d="M3 3l18 18"/>',
  alerte:     '<path d="M12 3.8L21.5 20h-19z"/><path d="M12 10v4.2"/><circle cx="12" cy="17.2" r="0.9" fill="currentColor" stroke="none"/>',
  info:       '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><circle cx="12" cy="8" r="0.9" fill="currentColor" stroke="none"/>',
  interdit:   '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
  sablier:    '<path d="M7 3.5h10M7 20.5h10"/><path d="M7.5 3.5v3.2c0 1.6 1.4 2.9 3 4.1 1.1.8 1.1 1.6 0 2.4-1.6 1.2-3 2.5-3 4.1v3.2"/><path d="M16.5 3.5v3.2c0 1.6-1.4 2.9-3 4.1-1.1.8-1.1 1.6 0 2.4 1.6 1.2 3 2.5 3 4.1v3.2"/>',
  etoile:     '<path d="M12 3.5l2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.9l6-.8z"/>',
  horloge:    '<circle cx="12" cy="12" r="9"/><path d="M12 6.8V12l3.4 2"/>',
  cadenas:    '<rect x="4.5" y="10" width="15" height="10.5" rx="2"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10"/>',
  trombone:   '<path d="M20 11.5l-8.4 8.4a5 5 0 0 1-7.1-7.1l9-9a3.4 3.4 0 0 1 4.8 4.8l-8.9 9a1.8 1.8 0 0 1-2.5-2.5l8.2-8.2"/>',
  mobile:     '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
  point:      '<circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/>',
  cercle:     '<circle cx="12" cy="12" r="7"/>',

  /* ── Étiquettes, listes, coffre ── */
  etiquette:  '<path d="M11.5 3.5H20a.5.5 0 0 1 .5.5v8.5L12 21 3 12l8.5-8.5z"/><circle cx="16.6" cy="7.4" r="1.4"/>',
  liste:      '<rect x="5.5" y="4" width="13" height="17" rx="2"/><path d="M9 3h6v3H9z"/><path d="M9 11h6M9 15h4"/>',
  mallette:   '<rect x="2.5" y="7" width="19" height="13" rx="2.5"/><path d="M8.5 7V5a1.5 1.5 0 0 1 1.5-1.5h4A1.5 1.5 0 0 1 15.5 5v2"/><path d="M2.5 12.5h19"/>',
  maison:     '<path d="M3.5 10.5L12 3.5l8.5 7"/><path d="M5.5 9.5v10h13v-10"/><path d="M10 19.5v-5h4v5"/>',
  famille:    '<circle cx="8.5" cy="8" r="3"/><circle cx="16.5" cy="9.5" r="2.4"/><path d="M2.8 19.5a5.7 5.7 0 0 1 11.4 0"/><path d="M15 14.6a4.6 4.6 0 0 1 6.2 4.9"/>',
  coeur:      '<path d="M12 20.2S3.5 15 3.5 9.2a4.6 4.6 0 0 1 8.5-2.5 4.6 4.6 0 0 1 8.5 2.5c0 5.8-8.5 11-8.5 11z"/>',
  argent:     '<circle cx="12" cy="12" r="9"/><path d="M12 6.8v10.4"/><path d="M14.8 9.3c-.5-.9-1.6-1.4-2.8-1.4-1.7 0-2.9.9-2.9 2.1 0 3 5.8 1.6 5.8 4.5 0 1.3-1.3 2.2-3 2.2-1.3 0-2.4-.5-2.9-1.4"/>',
  voiture:    '<path d="M4 16.5v2a1 1 0 0 1-1 1H2.8a1 1 0 0 1-1-1v-2"/><path d="M22.2 16.5v2a1 1 0 0 1-1 1H21a1 1 0 0 1-1-1v-2"/><path d="M2.5 16.5v-4l2-5a2 2 0 0 1 1.9-1.3h11.2A2 2 0 0 1 19.5 7.5l2 5v4z"/><path d="M2.5 12.5h19"/><circle cx="6.8" cy="14.6" r="1.1"/><circle cx="17.2" cy="14.6" r="1.1"/>',
  avion:      '<path d="M10.5 3.5a1.5 1.5 0 0 1 3 0v6l8 4.5v2.5l-8-2.5v3.5l2.5 2v2l-4-1.2-4 1.2v-2l2.5-2V14l-8 2.5V14l8-4.5z"/>',
  cible:      '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.8"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
  outil:      '<path d="M15.5 3.5a5 5 0 0 0-4.4 7.3L3.8 18a2 2 0 0 0 2.8 2.8l7.2-7.2a5 5 0 0 0 6.4-6.6l-2.9 2.9-2.9-.7-.7-2.9 2.9-2.9a5 5 0 0 0-1.1-.1z"/>',
  panier:     '<path d="M2.5 4.5h2.8l2.4 10.6a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.5l1.6-6.4H6"/><circle cx="9.5" cy="20" r="1.3"/><circle cx="17.5" cy="20" r="1.3"/>',
  ampoule:    '<path d="M9 17.5a6.5 6.5 0 1 1 6 0"/><path d="M9.5 17.5h5v2a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2z"/><path d="M10 14.2c0-1.3 4-1.3 4 0"/>',
  telephone:  '<path d="M6 3.5h2.5l2 5-2.2 1.4a12 12 0 0 0 5.8 5.8l1.4-2.2 5 2V18a2.5 2.5 0 0 1-2.7 2.5A16.5 16.5 0 0 1 3.5 6.2 2.5 2.5 0 0 1 6 3.5z"/>',
  livre:      '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H11v16H5.5A1.5 1.5 0 0 0 4 20.5z"/><path d="M20 4.5A1.5 1.5 0 0 0 18.5 3H13v16h5.5a1.5 1.5 0 0 1 1.5 1.5z"/>',
  sante:      '<path d="M2.5 12.5h4l2-4.5 3 9 2.5-6 1.5 3h6.5"/>',
  plante:     '<path d="M12 21v-8"/><path d="M12 13c0-4 2.5-7 8-7 0 5-3 8-8 8z"/><path d="M12 16c0-3-2-5.5-6-5.5 0 3.8 2.4 6 6 6z"/>',
  balance:    '<path d="M12 3.5v17M6.5 20.5h11"/><path d="M4 8h16M8 8L4.5 15h7zM16 8l3.5 7h-7z"/>',
  patte:      '<ellipse cx="6.5" cy="10" rx="1.9" ry="2.5"/><ellipse cx="10.6" cy="6.8" rx="1.9" ry="2.5"/><ellipse cx="15.4" cy="6.8" rx="1.9" ry="2.5"/><ellipse cx="18.5" cy="10.5" rx="1.9" ry="2.5"/><path d="M12 13c3.5 0 5.5 2 5.5 4.3 0 1.7-1.4 2.9-3.1 2.6-1.7-.3-3.1-.3-4.8 0-1.7.3-3.1-.9-3.1-2.6C6.5 15 8.5 13 12 13z"/>',
  cadeau:     '<rect x="3" y="8.5" width="18" height="4"/><path d="M4.5 12.5v7.5A1 1 0 0 0 5.5 21h13a1 1 0 0 0 1-1v-7.5"/><path d="M12 8.5V21"/><path d="M12 8.5S10.8 3.5 8 3.5a2.5 2.5 0 0 0 0 5zM12 8.5s1.2-5 4-5a2.5 2.5 0 0 1 0 5z"/>',
  musique:    '<path d="M9 18V5.5l11-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  halteres:   '<path d="M2.5 9.5v5M5.5 7.5v9M18.5 7.5v9M21.5 9.5v5M5.5 12h13"/>',
  assiette:   '<path d="M5 3v6a2.5 2.5 0 0 0 5 0V3M7.5 9v12"/><path d="M17.5 21V3c-2 .8-3 3-3 6s1 4 3 4"/>',
  facture:    '<path d="M5.5 3.5h13v18l-2.2-1.5-2.2 1.5-2.1-1.5L9.7 21.5 7.5 20l-2 1.5z"/><path d="M9 8h6M9 12h6M9 16h3.5"/>',
  document:   '<path d="M6 3.5h7.5L18.5 8.5v12H6z"/><path d="M13 3.5v5.5h5.5"/><path d="M9 13h7M9 16.5h5"/>',
  dossier:    '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2.5h8A1.5 1.5 0 0 1 20 9v9a1.5 1.5 0 0 1-1.5 1.5h-14A1.5 1.5 0 0 1 3 18z"/>',
  carte:      '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><circle cx="8.5" cy="11" r="2.2"/><path d="M4.8 16.5a3.9 3.9 0 0 1 7.4 0"/><path d="M14.5 9.5h4.5M14.5 13h4.5"/>',
  bouclier:   '<path d="M12 3l7.5 2.8v5.5c0 4.5-3.1 8-7.5 9.7-4.4-1.7-7.5-5.2-7.5-9.7V5.8z"/><path d="M9 12l2 2 4-4"/>',
  banque:     '<path d="M3 9.5L12 4l9 5.5"/><path d="M4.5 9.5v9M9 9.5v9M15 9.5v9M19.5 9.5v9"/><path d="M2.5 20.5h19"/>',
  batiment:   '<path d="M4 21V4.5A1 1 0 0 1 5 3.5h9a1 1 0 0 1 1 1V21"/><path d="M15 10h4.5a1 1 0 0 1 1 1V21"/><path d="M2.5 21h19"/><path d="M7.5 7.5h4M7.5 11.5h4M7.5 15.5h4"/>',
  bebe:       '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 10.5h.01M15.5 10.5h.01" stroke-width="2.4"/><path d="M9 15c.9.9 1.9 1.3 3 1.3s2.1-.4 3-1.3"/>',
  bague:      '<circle cx="12" cy="15" r="5"/><path d="M9 10.5L7 6.5h10l-2 4"/><path d="M12 6.5l-3 4M12 6.5l3 4"/>',
  photo:      '<rect x="2.5" y="6.5" width="19" height="14" rx="2.5"/><path d="M8.5 6.5l1.5-3h4l1.5 3"/><circle cx="12" cy="13.5" r="3.5"/>',
  nuage:      '<path d="M7.5 18.5a4.5 4.5 0 0 1-.4-9 6 6 0 0 1 11.5 1.6 3.7 3.7 0 0 1-.6 7.4z"/>',
  confetti:   '<path d="M3.5 20.5l5-13 8 8z"/><path d="M14 3.5v2M18.5 5.5l-1.4 1.4M20.5 10h-2"/>'
};

/* Alias : la même image sous plusieurs noms d'usage */
const ALIAS_ICONE = {
  journee: 'formation', settings: 'reglages', dashboard: 'tableau',
  hub: 'tableau', opco: 'activite', sauvegarder: 'enregistrer',
  supprimer: 'poubelle', modifier: 'crayon', voir: 'oeil', ajouter: 'plus'
};

/* Comptes créés avant les pictogrammes : leurs étiquettes, listes et
   catégories contiennent encore un emoji. On l'affiche comme pictogramme
   sans rien migrer en base. */
const EQUIV_EMOJI = {
  '🏷️':'etiquette','🏷':'etiquette','📋':'liste','💼':'mallette','🏡':'maison',
  '🏠':'maison','🎓':'formation','📁':'dossier','❤️':'coeur','❤':'coeur',
  '👨‍👩‍👧':'famille','👪':'famille','💰':'argent','🚗':'voiture','✈️':'avion',
  '✈':'avion','🎯':'cible','🔧':'outil','🛒':'panier','💡':'ampoule',
  '📞':'telephone','📚':'livre','🩺':'sante','🌱':'plante','⚖️':'balance',
  '⚖':'balance','🐾':'patte','🎁':'cadeau','🎵':'musique','🏋️':'halteres',
  '🏋':'halteres','🍽️':'assiette','🍽':'assiette','🧾':'facture','📄':'document',
  '🪪':'carte','🛡️':'bouclier','🛡':'bouclier','🏦':'banque','🏢':'batiment',
  '👶':'bebe','💍':'bague','📷':'photo','🎨':'palette','📝':'notes',
  '📅':'agenda','🗄️':'coffre','🗄':'coffre','⚙️':'reglages','🔔':'cloche',
  '📌':'epingle','⭐':'etoile','★':'etoile','🔍':'recherche','✓':'check',
  '✕':'fermer','🤖':'assistant','🎤':'micro'
};

/* Ce que proposent les sélecteurs d'icône, dans l'ordre d'affichage */
const CHOIX_ETIQUETTE = ['etiquette', 'mallette', 'maison', 'formation', 'famille',
  'coeur', 'sante', 'argent', 'voiture', 'avion', 'cible', 'outil', 'panier',
  'ampoule', 'telephone', 'livre', 'plante', 'balance', 'patte', 'cadeau'];

const CHOIX_LISTE = ['liste', 'panier', 'ampoule', 'maison', 'mallette', 'cible',
  'telephone', 'facture', 'cadeau', 'avion', 'outil', 'livre', 'palette',
  'halteres', 'assiette', 'plante', 'musique', 'patte'];

const CHOIX_COFFRE = ['document', 'carte', 'maison', 'coeur', 'bouclier', 'banque',
  'voiture', 'batiment', 'facture', 'formation', 'avion', 'livre', 'outil',
  'palette', 'assiette', 'patte', 'bebe', 'bague', 'balance', 'photo'];

/** Nom canonique d'une icône : passe les alias et les anciens emojis. */
function nomIcone(nom, defaut = 'etiquette') {
  if (!nom) return defaut;
  const n = String(nom).trim();
  if (TRACES[n])       return n;
  if (ALIAS_ICONE[n])  return ALIAS_ICONE[n];
  if (EQUIV_EMOJI[n])  return EQUIV_EMOJI[n];
  // Emoji inconnu (variantes de teinte, drapeaux…) : on ne devine pas.
  return defaut;
}

/**
 * Icone('agenda', { taille: 20, couleur: '#B03A63', classe: '', trait: 1.75 })
 * Rend un SVG inline. La couleur par défaut est celle du texte environnant.
 */
function Icone(nom, opts = {}) {
  const n = nomIcone(nom, opts.defaut || 'etiquette');
  const t = opts.taille || 20;
  return `<svg class="ic ${opts.classe || ''}" viewBox="0 0 24 24" width="${t}" height="${t}"
    fill="none" stroke="${opts.couleur || 'currentColor'}" stroke-width="${opts.trait || 1.75}"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"
    >${TRACES[n]}</svg>`;
}

/** Grille de choix d'icône pour les formulaires (listes, étiquettes, coffre). */
function grilleIcones(nomChamp, choix, selectionne) {
  const actuel = nomIcone(selectionne, choix[0]);
  return `<div class="ic-grille" data-ic-grille="${nomChamp}">
    <input type="hidden" id="${nomChamp}" value="${actuel}" />
    ${choix.map(c => `
      <button type="button" class="ic-choix ${c === actuel ? 'on' : ''}"
              data-ic="${c}" title="${c}" aria-label="${c}"
              aria-pressed="${c === actuel ? 'true' : 'false'}">${Icone(c, { taille: 19 })}</button>`).join('')}
  </div>`;
}

/** À appeler une fois après avoir inséré une grille dans le DOM. */
function brancherGrilleIcones(racine = document) {
  racine.querySelectorAll('[data-ic-grille]').forEach(g => {
    if (g.dataset.branchee) return;
    g.dataset.branchee = '1';
    g.addEventListener('click', e => {
      const b = e.target.closest('[data-ic]');
      if (!b) return;
      g.querySelector('input').value = b.dataset.ic;
      g.querySelectorAll('.ic-choix').forEach(x => {
        const on = x === b;
        x.classList.toggle('on', on);
        x.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    });
  });
}
