-- ════════════════════════════════════════════════════════════════════════════
--  IDEAFORMA — Migration v11 : parcours de développement CFA & EDOF
--
--  À exécuter APRÈS setup_update10.sql, dans Supabase → SQL Editor.
--  Idempotente : peut être rejouée sans dommage.
--
--  Le référentiel des étapes (volets, guides, liens) vit dans js/parcours.js :
--  c'est de la connaissance métier, pas de la donnée utilisateur. La base ne
--  stocke que L'ÉTAT de chaque étape pour le compte : statut, notes, date.
--  Ainsi le guide peut s'enrichir à chaque version sans migration, et une
--  étape jamais touchée n'occupe aucune ligne.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.parcours_etapes (
  id        uuid default gen_random_uuid() primary key,
  user_id   uuid references auth.users(id) on delete cascade not null,
  etape_id  text not null,
  statut    text default 'a_faire' not null
            check (statut in ('a_faire','en_cours','fait','bloque','sans_objet')),
  notes     text default '' not null,
  fait_le   date,
  maj_le    timestamptz default now() not null,
  unique (user_id, etape_id)
);

comment on table public.parcours_etapes is
  'État des étapes du parcours CFA & EDOF (référentiel des étapes dans js/parcours.js).
   Une ligne par étape réellement manipulée : statut, notes libres, date de réalisation.';

create index if not exists idx_parcours_user on public.parcours_etapes(user_id);

alter table public.parcours_etapes enable row level security;

drop policy if exists parcours_etapes_own on public.parcours_etapes;
create policy parcours_etapes_own on public.parcours_etapes
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());


-- ════════════════════════════════════════════════════════════════════════════
--  VÉRIFICATION
-- ════════════════════════════════════════════════════════════════════════════
select 'Table parcours_etapes' as controle,
       coalesce((select 'présente'
                   from information_schema.tables
                  where table_schema = 'public' and table_name = 'parcours_etapes'),
                'absente ⚠') as valeur
union all
select 'RLS activée',
       case when (select relrowsecurity from pg_class where relname = 'parcours_etapes')
            then 'oui' else 'non ⚠' end
union all
select 'Policy parcours_etapes_own',
       coalesce((select 'présente' from pg_policies
                  where tablename = 'parcours_etapes' and policyname = 'parcours_etapes_own'),
                'absente ⚠');
