-- ════════════════════════════════════════════════════════════════════════════
--  setup_update22.sql — Fiche client OPCO complète (v63)
--  Tout ce qu'il faut savoir de l'entreprise pour monter une formation
--  conforme : adhésion OPCO, signataire, interlocuteur, KBIS, subrogation,
--  analyse du besoin (Qualiopi ind. 4), lieu de formation, horaires.
--  Les infos détaillées des salariés (sexe, naissance, CSP, contrat…)
--  sont stockées dans la colonne jsonb existante clients.salaries.
--  Idempotent, 100 % additif. À jouer dans Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════
alter table public.clients
  add column if not exists forme_juridique       text,
  add column if not exists adresse_formation     text,
  add column if not exists numero_adherent_opco  text,
  add column if not exists statut_adhesion_opco  text default 'a_verifier',
  add column if not exists budget_consomme       numeric(10,2),
  add column if not exists subrogation           boolean,
  add column if not exists kbis_date             date,
  add column if not exists gerant_civilite       text,
  add column if not exists gerant_prenom         text,
  add column if not exists gerant_nom            text,
  add column if not exists gerant_qualite        text,
  add column if not exists gerant_email          text,
  add column if not exists gerant_tel            text,
  add column if not exists contact_nom           text,
  add column if not exists contact_fonction      text,
  add column if not exists contact_email         text,
  add column if not exists contact_tel           text,
  add column if not exists horaires              text,
  add column if not exists activite              text,
  add column if not exists besoins               text,
  add column if not exists formations_anterieures text;

alter table public.clients drop constraint if exists clients_adhesion_check;
alter table public.clients add  constraint clients_adhesion_check
  check (statut_adhesion_opco is null or statut_adhesion_opco in ('a_verifier','adherent','non_adherent'));

comment on column public.clients.forme_juridique      is 'Forme juridique (SARL, SAS, EI…)';
comment on column public.clients.adresse_formation    is 'Adresse de l''établissement où se déroule la formation, si différente du siège';
comment on column public.clients.numero_adherent_opco is 'N° d''adhérent de l''entreprise auprès de son OPCO';
comment on column public.clients.statut_adhesion_opco is 'a_verifier / adherent / non_adherent — un non-adhérent est refusé d''office';
comment on column public.clients.budget_consomme      is 'Budget OPCO déjà consommé sur l''année civile (€)';
comment on column public.clients.subrogation          is 'Paiement direct de l''OPCO à l''organisme (subrogation) — true / false';
comment on column public.clients.kbis_date            is 'Date du KBIS détenu — Constructys exige moins de 3 mois';
comment on column public.clients.besoins              is 'Analyse du besoin (Qualiopi ind. 4) : besoins exprimés par l''employeur';
