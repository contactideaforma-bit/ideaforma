-- ════════════════════════════════════════════════════════════════
--  IDEAFORMA — Migration Supabase
--  Coller et exécuter dans : Supabase Dashboard → SQL Editor
-- ════════════════════════════════════════════════════════════════

-- ─── Forcer le rôle superuser (obligatoire sur les nouveaux projets Supabase) ───
set role postgres;

-- ─── Permissions schéma public ────────────────────────────────
alter schema public owner to postgres;
grant all privileges on schema public to postgres, anon, authenticated, service_role;

-- ─── Extension UUID ───────────────────────────────────────────
create extension if not exists "uuid-ossp";


-- ════════════════════════════════════════════════════════════════
--  1. PROFILES
-- ════════════════════════════════════════════════════════════════
create table if not exists public.profiles (
  id        uuid references auth.users(id) on delete cascade primary key,
  nom       text,
  email     text,
  organisme text,
  siret     text,
  cree_le   timestamptz default now() not null
);

comment on table public.profiles is 'Profil étendu lié à auth.users';


-- ════════════════════════════════════════════════════════════════
--  2. CLIENTS  (informations entreprise)
-- ════════════════════════════════════════════════════════════════
create table if not exists public.clients (
  id             uuid default gen_random_uuid() primary key,
  user_id        uuid references auth.users(id) on delete cascade not null,
  opco           text not null,
  nom_entreprise text not null,
  adresse        text,
  tel            text,
  email          text,
  nb_salaries    integer,
  cree_le        timestamptz default now() not null,

  constraint clients_opco_check check (
    opco in ('opco_commerce','opco_mobilite','akto','constructys','opco_ep')
  )
);

comment on table public.clients is 'Entreprises clientes, une ligne par entreprise par OPCO';


-- ════════════════════════════════════════════════════════════════
--  3. DOSSIERS  (formations)
-- ════════════════════════════════════════════════════════════════
create table if not exists public.dossiers (
  id               uuid default gen_random_uuid() primary key,
  user_id          uuid references auth.users(id) on delete cascade not null,
  client_id        uuid references public.clients(id) on delete cascade not null,
  salaries         jsonb    default '[]'::jsonb  not null,  -- [{firstName, lastName}]
  dates_formation  jsonb    default '[]'::jsonb  not null,  -- [{start, end}]
  sujet_formation  text,
  prix             numeric(10,2) default 0       not null,
  statut           text    default 'devis_fait'  not null,
  notes            text,
  cree_le          timestamptz default now()     not null,
  modifie_le       timestamptz default now()     not null,

  constraint dossiers_statut_check check (
    statut in (
      'devis_fait', 'devis_envoye', 'devis_signe',
      'accepte_opco', 'formation_en_cours', 'paye'
    )
  )
);

comment on table public.dossiers is 'Dossier de formation, une ligne par formation';


-- ════════════════════════════════════════════════════════════════
--  4. TACHES
-- ════════════════════════════════════════════════════════════════
create table if not exists public.taches (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references auth.users(id) on delete cascade not null,
  dossier_id  uuid references public.dossiers(id) on delete set null,
  description text    not null,
  priorite    text    default 'normale' not null,
  echeance    date,
  fait        boolean default false     not null,
  cree_le     timestamptz default now() not null,

  constraint taches_priorite_check check (
    priorite in ('haute', 'normale', 'basse')
  )
);

comment on table public.taches is 'Tâches manuelles, optionnellement liées à un dossier';


-- ════════════════════════════════════════════════════════════════
--  INDEXES
-- ════════════════════════════════════════════════════════════════
create index if not exists idx_clients_user_id    on public.clients(user_id);
create index if not exists idx_clients_opco       on public.clients(opco);
create index if not exists idx_dossiers_user_id   on public.dossiers(user_id);
create index if not exists idx_dossiers_client_id on public.dossiers(client_id);
create index if not exists idx_dossiers_statut    on public.dossiers(statut);
create index if not exists idx_taches_user_id     on public.taches(user_id);
create index if not exists idx_taches_echeance    on public.taches(echeance);
create index if not exists idx_taches_dossier_id  on public.taches(dossier_id);


-- ════════════════════════════════════════════════════════════════
--  TRIGGER : auto-update modifie_le
-- ════════════════════════════════════════════════════════════════
create or replace function public.fn_set_modifie_le()
returns trigger language plpgsql as $$
begin
  new.modifie_le = now();
  return new;
end;
$$;

drop trigger if exists trg_dossiers_modifie_le on public.dossiers;
create trigger trg_dossiers_modifie_le
  before update on public.dossiers
  for each row execute function public.fn_set_modifie_le();


-- ════════════════════════════════════════════════════════════════
--  TRIGGER : création automatique du profil lors de l'inscription
-- ════════════════════════════════════════════════════════════════
create or replace function public.fn_handle_new_user()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  insert into public.profiles (id, email, nom)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nom', null)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_on_new_user on auth.users;
create trigger trg_on_new_user
  after insert on auth.users
  for each row execute function public.fn_handle_new_user();


-- ════════════════════════════════════════════════════════════════
--  ROW LEVEL SECURITY (RLS)
--  Chaque utilisateur ne voit et ne modifie que ses propres données
-- ════════════════════════════════════════════════════════════════
alter table public.profiles enable row level security;
alter table public.clients  enable row level security;
alter table public.dossiers enable row level security;
alter table public.taches   enable row level security;

-- Profiles
drop policy if exists "profiles_own" on public.profiles;
create policy "profiles_own" on public.profiles
  for all
  using  (auth.uid() = id)
  with check (auth.uid() = id);

-- Clients
drop policy if exists "clients_own" on public.clients;
create policy "clients_own" on public.clients
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Dossiers
drop policy if exists "dossiers_own" on public.dossiers;
create policy "dossiers_own" on public.dossiers
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Taches
drop policy if exists "taches_own" on public.taches;
create policy "taches_own" on public.taches
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- ════════════════════════════════════════════════════════════════
--  VUE UTILITAIRE (optionnel — facilite les requêtes futures)
-- ════════════════════════════════════════════════════════════════
create or replace view public.dossiers_complets
with (security_invoker = true) as
select
  d.id,
  d.user_id,
  d.client_id,
  c.opco,
  c.nom_entreprise,
  c.adresse,
  c.tel,
  c.email          as email_entreprise,
  c.nb_salaries,
  d.salaries,
  d.dates_formation,
  d.sujet_formation,
  d.prix,
  d.statut,
  d.notes,
  d.cree_le,
  d.modifie_le
from public.dossiers d
join public.clients   c on d.client_id = c.id;

comment on view public.dossiers_complets is 'Vue jointe dossiers + clients, respecte les RLS';


-- ════════════════════════════════════════════════════════════════
--  VÉRIFICATION FINALE
-- ════════════════════════════════════════════════════════════════
select
  schemaname,
  tablename,
  rowsecurity as rls_active
from pg_tables
where schemaname = 'public'
  and tablename in ('profiles','clients','dossiers','taches')
order by tablename;


-- ════════════════════════════════════════════════════════════════
--  CONFIGURATION SUPABASE (Dashboard → Authentication → URL Config)
-- ════════════════════════════════════════════════════════════════
--
--  À configurer manuellement dans le Dashboard Supabase :
--  Authentication → URL Configuration
--
--  Site URL :
--    https://votre-domaine.fr
--    (ou http://localhost:PORT en local)
--
--  Redirect URLs autorisées (ajouter ces entrées) :
--    https://votre-domaine.fr/index.html
--    https://votre-domaine.fr/reset-password.html
--    http://localhost:*/index.html          (développement)
--    http://localhost:*/reset-password.html (développement)
--
--  Ces URLs sont utilisées par :
--  - La confirmation d'email à l'inscription (→ index.html)
--  - La réinitialisation de mot de passe     (→ reset-password.html)
-- ════════════════════════════════════════════════════════════════
