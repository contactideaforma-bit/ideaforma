-- ════════════════════════════════════════════════════════════════════════════
--  setup_update21.sql — Parcours OPCO assisté
--  • clients.code_naf        : code NAF/APE récupéré depuis l'annuaire officiel
--  • dossiers.dispositif     : type de formation retenu pour le barème OPCO
--  • dossiers.taux_horaire   : taux horaire conseillé (€/h/stagiaire) au moment
--                              du chiffrage — base du calcul de prise en charge
--  Idempotent. À jouer dans Supabase → SQL Editor après le déploiement.
-- ════════════════════════════════════════════════════════════════════════════
alter table public.clients
  add column if not exists code_naf text;

alter table public.dossiers
  add column if not exists dispositif   text,
  add column if not exists taux_horaire numeric(8,2);

comment on column public.clients.code_naf      is 'Code NAF/APE de l''entreprise (annuaire des entreprises)';
comment on column public.dossiers.dispositif   is 'Dispositif / type de formation utilisé pour le barème OPCO';
comment on column public.dossiers.taux_horaire is 'Taux horaire de prise en charge conseillé (€/h/stagiaire) retenu au chiffrage';
