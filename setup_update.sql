-- ════════════════════════════════════════════════════════════════
--  IDEAFORMA — Migration v2
--  Coller et exécuter dans : Supabase Dashboard → SQL Editor
--  À appliquer EN PLUS de setup.sql (ne pas re-exécuter setup.sql)
-- ════════════════════════════════════════════════════════════════

-- ─── 1. Ajouter siret à la table clients ─────────────────────────
alter table public.clients
  add column if not exists siret text;

comment on column public.clients.siret is 'SIRET de l''entreprise cliente (14 chiffres)';


-- ─── 2. Enrichir le profil de l'organisme de formation ───────────
alter table public.profiles
  add column if not exists adresse          text,
  add column if not exists telephone        text,
  add column if not exists numero_da        text,
  add column if not exists numero_qualiopi  text;

comment on column public.profiles.adresse         is 'Adresse de l''organisme de formation';
comment on column public.profiles.telephone       is 'Téléphone de l''organisme de formation';
comment on column public.profiles.numero_da       is 'Numéro de déclaration d''activité (NDA)';
comment on column public.profiles.numero_qualiopi is 'Numéro de certification Qualiopi';


-- ─── 3. Vérification ─────────────────────────────────────────────
select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('clients', 'profiles')
  and column_name in ('siret', 'adresse', 'telephone', 'numero_da', 'numero_qualiopi')
order by table_name, column_name;
