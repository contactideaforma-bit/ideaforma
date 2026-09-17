-- ════════════════════════════════════════════════════════════════════════════
--  setup_update20.sql — Documents v3 (charte IDEAFORMA)
--  Ajoute au profil de l'organisme les mentions affichées dans l'en-tête des
--  documents (code NAF, n° UAI). Idempotent.
--  À jouer dans Supabase → SQL Editor après le déploiement.
-- ════════════════════════════════════════════════════════════════════════════
alter table public.profiles
  add column if not exists code_naf   text,
  add column if not exists numero_uai text;

comment on column public.profiles.code_naf   is 'Code NAF/APE de l''organisme — en-tête des documents';
comment on column public.profiles.numero_uai is 'Numéro UAI (RNE) de l''organisme — en-tête des documents';

-- Les colonnes duree_heures, lieu, public_vise, moyens de public.dossiers et
-- email, referent_handicap, referent_handicap_contact, iban de public.profiles
-- existent déjà (setup.sql / setup_update5.sql) et sont désormais alimentées
-- par les formulaires de l'application.
