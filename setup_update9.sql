-- ════════════════════════════════════════════════════════════════════════════
--  IDEAFORMA — Migration v9 : catégories libres et bullet journal
--
--  À exécuter APRÈS setup_update8.sql, dans Supabase → SQL Editor.
--  Idempotente : peut être rejouée sans dommage.
--
--  Contenu :
--    1. Catégories du coffre sorties du JavaScript vers la base
--    2. Colonnes de « rapid logging » sur les tâches (migration, abandon)
--    3. Notes rattachables à une journée (le « — » du log du jour)
--    4. Vue v_journal_jour : tout ce qui compose une journée de carnet
--    5. RLS
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
--  1. CATÉGORIES DU COFFRE
--     Elles étaient figées dans js/vie.js. Elles vivent désormais en base,
--     donc l'utilisateur les crée, les renomme et les supprime lui-même.
--
--     coffre.categorie continue de stocker un CODE texte : pas de clé
--     étrangère, pour qu'une catégorie supprimée ne fasse pas disparaître
--     les documents qu'elle rangeait (ils retombent sur « autre »).
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.coffre_categories (
  id       uuid default gen_random_uuid() primary key,
  user_id  uuid references auth.users(id) on delete cascade not null,
  code     text not null,
  nom      text not null,
  icone    text default '📄' not null,
  couleur  text default '#64748B' not null,
  ordre    integer default 50 not null,
  cree_le  timestamptz default now() not null,
  unique (user_id, code)
);

comment on table public.coffre_categories is
  'Catégories du coffre à documents, libres et propres à chaque compte.
   coffre.categorie référence « code » sans contrainte, volontairement.';

create index if not exists idx_coffre_cat_user on public.coffre_categories(user_id, ordre);

/* Les dix catégories livrées d'origine, créées une seule fois par compte. */
create or replace function public.fn_seed_coffre_categories(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.coffre_categories (user_id, code, nom, icone, couleur, ordre) values
    (p_user, 'identite',   'Identité',           '🪪', '#3B82F6',  1),
    (p_user, 'logement',   'Logement',           '🏠', '#10B981',  2),
    (p_user, 'sante',      'Santé',              '❤️', '#EC4899',  3),
    (p_user, 'assurance',  'Assurances',         '🛡️', '#8B5CF6',  4),
    (p_user, 'banque',     'Banque',             '🏦', '#0EA5E9',  5),
    (p_user, 'vehicule',   'Véhicule',           '🚗', '#F59E0B',  6),
    (p_user, 'entreprise', 'Entreprise',         '🏢', '#1E3A5F',  7),
    (p_user, 'fiscal',     'Impôts / comptable', '🧾', '#B45309',  8),
    (p_user, 'diplome',    'Diplômes',           '🎓', '#6366F1',  9),
    (p_user, 'autre',      'Autre',              '📄', '#64748B', 99)
  on conflict (user_id, code) do nothing;
end $$;

do $$
declare u record;
begin
  for u in select id from auth.users loop
    perform public.fn_seed_coffre_categories(u.id);
  end loop;
end $$;

/* Un compte doit toujours garder « autre » : c'est le refuge des documents
   dont la catégorie vient d'être supprimée. */
create or replace function public.fn_proteger_categorie_autre()
returns trigger language plpgsql as $$
begin
  if old.code = 'autre' then
    raise exception 'La catégorie « Autre » ne peut pas être supprimée : '
                    'elle recueille les documents des catégories supprimées.';
  end if;
  update public.coffre
     set categorie = 'autre'
   where user_id = old.user_id and categorie = old.code;
  return old;
end $$;

drop trigger if exists trg_coffre_cat_suppr on public.coffre_categories;
create trigger trg_coffre_cat_suppr
  before delete on public.coffre_categories
  for each row execute function public.fn_proteger_categorie_autre();

/* Renommer le code d'une catégorie déplace les documents avec elle */
create or replace function public.fn_suivre_code_categorie()
returns trigger language plpgsql as $$
begin
  if new.code is distinct from old.code then
    update public.coffre
       set categorie = new.code
     where user_id = old.user_id and categorie = old.code;
  end if;
  return new;
end $$;

drop trigger if exists trg_coffre_cat_rename on public.coffre_categories;
create trigger trg_coffre_cat_rename
  after update of code on public.coffre_categories
  for each row execute function public.fn_suivre_code_categorie();


-- ════════════════════════════════════════════════════════════════════════════
--  2. RAPID LOGGING — les états d'une tâche dans un bullet journal
--
--     •  à faire        fait = false, abandonnee = false
--     ✕  faite          fait = true
--     ~  abandonnée     abandonnee = true
--     >  migrée         migrations > 0  (l'échéance a été repoussée)
--
--     On garde la colonne « fait » telle quelle : les pages « Ma journée » et
--     « Activité OPCO » s'appuient dessus depuis la v1.
-- ════════════════════════════════════════════════════════════════════════════
alter table public.taches add column if not exists abandonnee   boolean default false not null;
alter table public.taches add column if not exists migrations   integer default 0 not null;
alter table public.taches add column if not exists migree_le    timestamptz;
alter table public.taches add column if not exists echeance_origine date;

comment on column public.taches.migrations is
  'Nombre de fois où la tâche a été repoussée. Une tâche migrée trois fois
   mérite d''être abandonnée ou découpée — c''est le principe du bullet journal.';

comment on column public.taches.echeance_origine is
  'Première échéance donnée à la tâche, conservée à la première migration.';

/* Une tâche abandonnée ne doit plus déclencher de rappel */
create or replace function public.fn_taches_abandon()
returns trigger language plpgsql as $$
begin
  if new.abandonnee and not old.abandonnee then
    delete from public.rappels
     where source_type = 'tache' and source_id = new.id and statut = 'en_attente';
  end if;
  return new;
end $$;

drop trigger if exists trg_taches_abandon on public.taches;
create trigger trg_taches_abandon
  after update of abandonnee on public.taches
  for each row execute function public.fn_taches_abandon();

/* Repousser une tâche : une seule opération atomique côté base, pour que le
   compteur de migrations et l'échéance d'origine restent cohérents. */
create or replace function public.fn_migrer_tache(p_tache uuid, p_nouvelle_date date)
returns public.taches language plpgsql security definer set search_path = public as $$
declare t public.taches;
begin
  update public.taches
     set echeance_origine = coalesce(echeance_origine, echeance),
         echeance         = p_nouvelle_date,
         migrations       = migrations + 1,
         migree_le        = now()
   where id = p_tache and user_id = auth.uid()
  returning * into t;

  if not found then
    raise exception 'Tâche introuvable';
  end if;
  return t;
end $$;


-- ════════════════════════════════════════════════════════════════════════════
--  3. NOTES DATÉES
--     Dans un carnet, une note « — » appartient à une journée précise.
--     Sans date, la note reste dans le pense-bête libre, comme aujourd'hui.
-- ════════════════════════════════════════════════════════════════════════════
alter table public.notes add column if not exists date_jour date;

create index if not exists idx_notes_jour on public.notes(user_id, date_jour)
  where date_jour is not null;


-- ════════════════════════════════════════════════════════════════════════════
--  4. VUE v_journal_jour — une journée de carnet, d'un seul coup
--     Réunit les trois types d'entrées du rapid logging, déjà symbolisés.
-- ════════════════════════════════════════════════════════════════════════════
create or replace view public.v_journal_jour
with (security_invoker = true) as

  select 'tache'::text                       as entree,
         t.id,
         t.user_id,
         t.echeance                          as jour,
         t.description                       as texte,
         t.notes                             as detail,
         t.heure,
         t.etiquette_id,
         t.priorite,
         case when t.fait then 'fait'
              when t.abandonnee then 'abandonnee'
              else 'a_faire' end             as etat,
         t.migrations,
         null::text                          as couleur,
         t.dossier_id
  from public.taches t
  where t.echeance is not null

  union all

  select 'evenement',
         e.id,
         e.user_id,
         (e.debut at time zone 'Europe/Paris')::date,
         e.titre,
         coalesce(nullif(e.lieu, ''), e.description),
         date_trunc('minute', e.debut at time zone 'Europe/Paris')::time,
         e.etiquette_id,
         'normale',
         'a_faire',
         0,
         e.couleur,
         e.dossier_id
  from public.evenements e
  where not e.annule

  union all

  select 'note',
         n.id,
         n.user_id,
         n.date_jour,
         coalesce(nullif(n.titre, ''), left(n.contenu, 80)),
         n.contenu,
         null::time,
         n.etiquette_id,
         'normale',
         'a_faire',
         0,
         n.couleur,
         null::uuid
  from public.notes n
  where n.date_jour is not null and not n.archivee;

comment on view public.v_journal_jour is
  'Log du jour au sens bullet journal : tâches datées, rendez-vous et notes
   du jour, avec leur état de rapid logging. Les échéances OPCO en sont
   volontairement absentes — elles vivent sur la page « Ma journée ».';


-- ════════════════════════════════════════════════════════════════════════════
--  5. RLS
-- ════════════════════════════════════════════════════════════════════════════
alter table public.coffre_categories enable row level security;

drop policy if exists coffre_categories_own on public.coffre_categories;
create policy coffre_categories_own on public.coffre_categories
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());


-- ════════════════════════════════════════════════════════════════════════════
--  VÉRIFICATION
-- ════════════════════════════════════════════════════════════════════════════
select 'Catégories du coffre' as controle,
       count(*)::text || ' (10 attendues par compte)' as valeur
  from public.coffre_categories
union all
select 'Colonnes bullet journal sur taches',
       count(*)::text || ' / 4'
  from information_schema.columns
 where table_schema = 'public' and table_name = 'taches'
   and column_name in ('abandonnee', 'migrations', 'migree_le', 'echeance_origine')
union all
select 'Colonne date_jour sur notes',
       coalesce((select 'presente' from information_schema.columns
                  where table_schema = 'public' and table_name = 'notes'
                    and column_name = 'date_jour'), 'absente ⚠')
union all
select 'Vue v_journal_jour',
       coalesce((select 'presente' from pg_views where viewname = 'v_journal_jour'), 'absente ⚠')
union all
select 'Fonction fn_migrer_tache',
       coalesce((select 'presente' from pg_proc where proname = 'fn_migrer_tache'), 'absente ⚠');
