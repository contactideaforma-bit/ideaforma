-- ════════════════════════════════════════════════════════════════════════════
--  IDEAFORMA — Migration v18 : pièces jointes et photos sur les tâches
--
--  À exécuter dans Supabase → SQL Editor (projet de l'application). Idempotente.
--
--  Les fichiers vont dans le bucket privé « documents » déjà utilisé par le
--  coffre, sous <user_id>/taches/<tache_id>/<fichier> : les policies Storage
--  existantes (premier segment = uid) s'appliquent sans rien changer.
--  Cette table fait le lien tâche ↔ fichier.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.taches_pieces (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid references auth.users(id) on delete cascade not null,
  tache_id      uuid references public.taches(id) on delete cascade not null,
  nom_fichier   text not null,
  storage_path  text not null,
  mime          text,
  taille        bigint,
  cree_le       timestamptz default now() not null
);

comment on table public.taches_pieces is
  'Pièces jointes (photos, PDF…) attachées à une tâche. Fichier dans le bucket documents.';

create index if not exists idx_taches_pieces_tache on public.taches_pieces(tache_id);

alter table public.taches_pieces enable row level security;

drop policy if exists taches_pieces_own on public.taches_pieces;
create policy taches_pieces_own on public.taches_pieces for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

notify pgrst, 'reload schema';
