-- ════════════════════════════════════════════════════════════════
--  IDEAFORMA — Migration v4
--  Ajouter couleur secondaire au profil
-- ════════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists couleur_secondaire text default '#3B82F6';

comment on column public.profiles.couleur_secondaire is 'Couleur secondaire pour les documents PDF (accents, fonds légers)';

-- Vérification
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
  and column_name in ('couleur_primaire','couleur_secondaire')
order by column_name;
