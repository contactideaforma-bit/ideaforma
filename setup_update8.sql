-- ════════════════════════════════════════════════════════════════════════════
--  IDEAFORMA — Migration v8 : l'application devient un assistant du quotidien
--
--  À exécuter APRÈS setup_update7.sql, dans Supabase → SQL Editor.
--  Idempotente : peut être rejouée sans dommage.
--
--  Contenu :
--    1. Étiquettes (Pro / Perso / … ) — l'axe de classement transversal
--    2. Listes et tâches (la table « taches » existante est étendue)
--    3. Évènements — l'agenda, avec rappels
--    4. Pense-bête (notes)
--    5. Coffre à documents personnels
--    6. File d'attente des rappels + abonnements push
--    7. Conversations avec l'assistant IA
--    8. Vue v_agenda — tout ce qui a une date, au même endroit
--    9. Planification : pg_cron appelle /api/rappels toutes les minutes
--
--  ⚠ Pourquoi un job cron revient alors qu'il avait été démonté en v7 :
--    le v7 supprimait le DIGEST QUOTIDIEN par e-mail (remplacé par « Ma
--    journée »). Ici il s'agit d'autre chose : une notification poussée à
--    l'heure exacte d'un rendez-vous ne peut pas être déclenchée par le
--    navigateur, il faut forcément un ordonnanceur côté serveur.
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;


-- ════════════════════════════════════════════════════════════════════════════
--  1. ÉTIQUETTES
--     Un seul espace de travail, la séparation pro / perso se fait ici.
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.etiquettes (
  id       uuid default gen_random_uuid() primary key,
  user_id  uuid references auth.users(id) on delete cascade not null,
  nom      text not null,
  couleur  text default '#3B82F6' not null,
  icone    text default '🏷️' not null,
  ordre    integer default 0 not null,
  systeme  boolean default false not null,
  cree_le  timestamptz default now() not null,
  unique (user_id, nom)
);

comment on table public.etiquettes is
  'Classement transversal (Pro, Perso, IDEAFORMA…). Porté par les tâches,
   évènements, notes et documents.';

/* Étiquettes livrées par défaut à chaque compte */
create or replace function public.fn_seed_etiquettes(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.etiquettes (user_id, nom, couleur, icone, ordre, systeme) values
    (p_user, 'IDEAFORMA',     '#1E3A5F', '🎓', 1, true),
    (p_user, 'Pro',           '#3B82F6', '💼', 2, true),
    (p_user, 'Perso',         '#10B981', '🏡', 3, true),
    (p_user, 'Administratif', '#F59E0B', '📁', 4, false),
    (p_user, 'Santé',         '#EC4899', '❤️', 5, false),
    (p_user, 'Famille',       '#8B5CF6', '👨‍👩‍👧', 6, false)
  on conflict (user_id, nom) do nothing;
end $$;

/* Comptes déjà existants */
do $$
declare u record;
begin
  for u in select id from auth.users loop
    perform public.fn_seed_etiquettes(u.id);
  end loop;
end $$;


-- ════════════════════════════════════════════════════════════════════════════
--  2. LISTES + TÂCHES
--     La table « taches » existe depuis setup.sql : on l'étend au lieu d'en
--     créer une deuxième, pour que les tâches liées aux dossiers OPCO et les
--     tâches personnelles vivent dans la même liste.
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.listes (
  id        uuid default gen_random_uuid() primary key,
  user_id   uuid references auth.users(id) on delete cascade not null,
  nom       text not null,
  couleur   text default '#3B82F6' not null,
  icone     text default '📋' not null,
  ordre     integer default 0 not null,
  archivee  boolean default false not null,
  cree_le   timestamptz default now() not null
);

alter table public.taches add column if not exists liste_id       uuid references public.listes(id)     on delete set null;
alter table public.taches add column if not exists etiquette_id   uuid references public.etiquettes(id) on delete set null;
alter table public.taches add column if not exists notes          text;
alter table public.taches add column if not exists heure          time;
alter table public.taches add column if not exists rappel_minutes integer;
alter table public.taches add column if not exists ordre          integer default 0 not null;
alter table public.taches add column if not exists fait_le        timestamptz;
alter table public.taches add column if not exists modifie_le     timestamptz default now() not null;

create index if not exists idx_taches_liste     on public.taches(liste_id);
create index if not exists idx_taches_etiquette on public.taches(etiquette_id);
create index if not exists idx_taches_user_fait on public.taches(user_id, fait, echeance);

/* Horodatage de l'accomplissement */
create or replace function public.fn_taches_fait_le()
returns trigger language plpgsql as $$
begin
  new.modifie_le := now();
  if new.fait and (old.fait is distinct from true) then
    new.fait_le := now();
  elsif not new.fait then
    new.fait_le := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_taches_fait_le on public.taches;
create trigger trg_taches_fait_le
  before update on public.taches
  for each row execute function public.fn_taches_fait_le();

/* Liste par défaut pour chaque compte */
create or replace function public.fn_seed_listes(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.listes where user_id = p_user) then
    insert into public.listes (user_id, nom, couleur, icone, ordre) values
      (p_user, 'À faire',      '#3B82F6', '📋', 1),
      (p_user, 'Courses',      '#10B981', '🛒', 2),
      (p_user, 'Idées',        '#8B5CF6', '💡', 3);
  end if;
end $$;

do $$
declare u record;
begin
  for u in select id from auth.users loop
    perform public.fn_seed_listes(u.id);
  end loop;
end $$;


-- ════════════════════════════════════════════════════════════════════════════
--  3. ÉVÈNEMENTS — l'agenda
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.evenements (
  id              uuid default gen_random_uuid() primary key,
  user_id         uuid references auth.users(id) on delete cascade not null,
  titre           text not null,
  description     text,
  lieu            text,
  debut           timestamptz not null,
  fin             timestamptz,
  journee_entiere boolean default false not null,
  etiquette_id    uuid references public.etiquettes(id) on delete set null,
  dossier_id      uuid references public.dossiers(id)   on delete set null,
  couleur         text,
  rappels         integer[] default array[15] not null,   -- minutes AVANT le début
  recurrence      text default 'aucune' not null,
  annule          boolean default false not null,
  cree_le         timestamptz default now() not null,
  modifie_le      timestamptz default now() not null,
  constraint evenements_recurrence_check
    check (recurrence in ('aucune','quotidien','hebdomadaire','mensuel','annuel')),
  constraint evenements_fin_check check (fin is null or fin >= debut)
);

create index if not exists idx_evenements_user_debut on public.evenements(user_id, debut);

drop trigger if exists trg_evenements_modifie_le on public.evenements;
create trigger trg_evenements_modifie_le
  before update on public.evenements
  for each row execute function public.fn_set_modifie_le();


-- ════════════════════════════════════════════════════════════════════════════
--  4. PENSE-BÊTE
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.notes (
  id           uuid default gen_random_uuid() primary key,
  user_id      uuid references auth.users(id) on delete cascade not null,
  titre        text,
  contenu      text default '' not null,
  couleur      text default '#FEF3C7' not null,
  epinglee     boolean default false not null,
  archivee     boolean default false not null,
  etiquette_id uuid references public.etiquettes(id) on delete set null,
  cree_le      timestamptz default now() not null,
  modifie_le   timestamptz default now() not null
);

create index if not exists idx_notes_user on public.notes(user_id, archivee, epinglee);

drop trigger if exists trg_notes_modifie_le on public.notes;
create trigger trg_notes_modifie_le
  before update on public.notes
  for each row execute function public.fn_set_modifie_le();


-- ════════════════════════════════════════════════════════════════════════════
--  5. COFFRE À DOCUMENTS
--     Réutilise le bucket privé « documents » créé en v6, sous le chemin
--     <user_id>/coffre/<fichier>. Les policies existantes s'appliquent déjà
--     (le premier segment du chemin doit être l'uid).
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.coffre (
  id              uuid default gen_random_uuid() primary key,
  user_id         uuid references auth.users(id) on delete cascade not null,
  titre           text not null,
  description     text,
  categorie       text default 'autre' not null,
  etiquette_id    uuid references public.etiquettes(id) on delete set null,
  storage_path    text not null,
  nom_fichier     text not null,
  mime            text,
  taille          bigint,
  date_document   date,
  date_expiration date,
  favori          boolean default false not null,
  cree_le         timestamptz default now() not null
);

create index if not exists idx_coffre_user on public.coffre(user_id, categorie);
create index if not exists idx_coffre_expi on public.coffre(user_id, date_expiration);

/* Le coffre accepte plus de formats que les pièces de dossier OPCO */
update storage.buckets
   set allowed_mime_types = array[
         'application/pdf','image/png','image/jpeg','image/webp','image/heic','image/gif',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'application/vnd.openxmlformats-officedocument.presentationml.presentation',
         'application/msword','application/vnd.ms-excel','application/vnd.ms-powerpoint',
         'text/plain','text/csv','application/zip','application/x-zip-compressed',
         'audio/mpeg','audio/mp4','video/mp4'
       ],
       file_size_limit = 26214400          -- 25 Mo
 where id = 'documents';


-- ════════════════════════════════════════════════════════════════════════════
--  6. RAPPELS + ABONNEMENTS PUSH
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.push_subscriptions (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid references auth.users(id) on delete cascade not null,
  endpoint      text not null unique,
  p256dh        text not null,
  auth          text not null,
  appareil      text,
  actif         boolean default true not null,
  cree_le       timestamptz default now() not null,
  derniere_utilisation timestamptz
);

comment on table public.push_subscriptions is
  'Un appareil = une ligne. Sur iPhone, l''abonnement n''est possible que si
   l''application a été ajoutée à l''écran d''accueil (iOS 16.4+).';

create table if not exists public.rappels (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references auth.users(id) on delete cascade not null,
  source_type text not null,
  source_id   uuid,
  titre       text not null,
  corps       text,
  url         text default '/app.html' not null,
  envoyer_a   timestamptz not null,
  statut      text default 'en_attente' not null,
  tentatives  integer default 0 not null,
  envoye_le   timestamptz,
  erreur      text,
  cree_le     timestamptz default now() not null,
  constraint rappels_source_check check (source_type in ('evenement','tache','echeance','manuel')),
  constraint rappels_statut_check check (statut in ('en_attente','envoye','erreur','annule'))
);

create unique index if not exists idx_rappels_unicite
  on public.rappels(source_type, source_id, envoyer_a)
  where source_id is not null;

create index if not exists idx_rappels_a_envoyer
  on public.rappels(statut, envoyer_a) where statut = 'en_attente';


-- ── Planification automatique depuis les évènements ──────────────────────────
create or replace function public.fn_planifier_rappels_evenement()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  m       integer;
  v_quand timestamptz;
begin
  delete from public.rappels
   where source_type = 'evenement' and source_id = new.id and statut = 'en_attente';

  if new.annule then return new; end if;

  foreach m in array coalesce(new.rappels, array[]::integer[]) loop
    v_quand := new.debut - make_interval(mins => m);
    continue when v_quand < now() - interval '2 minutes';

    insert into public.rappels (user_id, source_type, source_id, titre, corps, url, envoyer_a)
    values (
      new.user_id, 'evenement', new.id,
      new.titre,
      case when m = 0 then 'C''est maintenant'
           when m < 60 then 'Dans ' || m || ' min'
           when m < 1440 then 'Dans ' || (m/60) || ' h'
           else 'Dans ' || (m/1440) || ' j' end
      || ' — ' || to_char(new.debut at time zone 'Europe/Paris', 'HH24:MI')
      || coalesce(' · ' || nullif(new.lieu, ''), ''),
      '/app.html#agenda',
      v_quand
    )
    on conflict do nothing;
  end loop;

  return new;
end $$;

drop trigger if exists trg_evenements_rappels on public.evenements;
create trigger trg_evenements_rappels
  after insert or update of debut, rappels, titre, lieu, annule on public.evenements
  for each row execute function public.fn_planifier_rappels_evenement();


-- ── Planification automatique depuis les tâches ──────────────────────────────
create or replace function public.fn_planifier_rappels_tache()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_quand timestamptz;
begin
  delete from public.rappels
   where source_type = 'tache' and source_id = new.id and statut = 'en_attente';

  if new.fait or new.echeance is null or new.rappel_minutes is null then
    return new;
  end if;

  v_quand := ((new.echeance + coalesce(new.heure, time '09:00')) at time zone 'Europe/Paris')
             - make_interval(mins => new.rappel_minutes);

  if v_quand >= now() - interval '2 minutes' then
    insert into public.rappels (user_id, source_type, source_id, titre, corps, url, envoyer_a)
    values (new.user_id, 'tache', new.id, new.description,
            'Tâche à faire' ||
            coalesce(' · ' || to_char(new.heure, 'HH24:MI'), ''),
            '/app.html#taches', v_quand)
    on conflict do nothing;
  end if;

  return new;
end $$;

drop trigger if exists trg_taches_rappels on public.taches;
create trigger trg_taches_rappels
  after insert or update of echeance, heure, rappel_minutes, fait, description on public.taches
  for each row execute function public.fn_planifier_rappels_tache();


-- ── Vue lue par /api/rappels avec la clé service_role ────────────────────────
create or replace view public.v_rappels_a_envoyer
with (security_invoker = false) as
select r.id           as rappel_id,
       r.user_id,
       r.titre,
       r.corps,
       r.url,
       r.envoyer_a,
       r.tentatives,
       s.id           as subscription_id,
       s.endpoint,
       s.p256dh,
       s.auth
from public.rappels r
join public.push_subscriptions s
  on s.user_id = r.user_id and s.actif
where r.statut = 'en_attente'
  and r.envoyer_a <= now()
  and r.envoyer_a >  now() - interval '2 hours';   -- on n'envoie pas les fossiles

revoke all on public.v_rappels_a_envoyer from anon, authenticated;
grant  select on public.v_rappels_a_envoyer to service_role;


-- ════════════════════════════════════════════════════════════════════════════
--  7. CONVERSATIONS AVEC L'ASSISTANT
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.ia_conversations (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid references auth.users(id) on delete cascade not null,
  titre      text default 'Nouvelle discussion' not null,
  cree_le    timestamptz default now() not null,
  modifie_le timestamptz default now() not null
);

create table if not exists public.ia_messages (
  id              uuid default gen_random_uuid() primary key,
  user_id         uuid references auth.users(id) on delete cascade not null,
  conversation_id uuid references public.ia_conversations(id) on delete cascade not null,
  role            text not null,
  contenu         jsonb not null,
  cree_le         timestamptz default now() not null,
  constraint ia_messages_role_check check (role in ('user','assistant'))
);

create index if not exists idx_ia_messages_conv on public.ia_messages(conversation_id, cree_le);

drop trigger if exists trg_ia_conversations_modifie_le on public.ia_conversations;
create trigger trg_ia_conversations_modifie_le
  before update on public.ia_conversations
  for each row execute function public.fn_set_modifie_le();


-- ════════════════════════════════════════════════════════════════════════════
--  8. VUE v_agenda — tout ce qui a une date, au même endroit
--     Rendez-vous perso, journées de formation, tâches datées, échéances OPCO.
-- ════════════════════════════════════════════════════════════════════════════
create or replace view public.v_agenda
with (security_invoker = true) as

  select 'evenement'::text            as type,
         e.id,
         e.user_id,
         e.titre,
         e.description,
         e.lieu,
         e.debut,
         coalesce(e.fin, e.debut + interval '1 hour') as fin,
         e.journee_entiere,
         e.etiquette_id,
         e.dossier_id,
         coalesce(e.couleur, '#3B82F6') as couleur,
         false                          as termine
  from public.evenements e
  where not e.annule

  union all

  select 'session',
         s.id,
         s.user_id,
         coalesce(d.sujet_formation, 'Formation') || ' — ' || c.nom_entreprise,
         'Journée de formation',
         coalesce(s.lieu, d.lieu),
         (s.date_session + s.heure_debut) at time zone 'Europe/Paris',
         (s.date_session + s.heure_fin)   at time zone 'Europe/Paris',
         false,
         null::uuid,
         d.id,
         coalesce(r.couleur, '#8B5CF6'),
         s.statut = 'realisee'
  from public.sessions s
  join public.dossiers d on d.id = s.dossier_id
  join public.clients  c on c.id = d.client_id
  left join public.opco_referentiel r on r.code = coalesce(d.opco_code, c.opco)
  where s.statut <> 'annulee'

  union all

  select 'tache',
         t.id,
         t.user_id,
         t.description,
         t.notes,
         null,
         ((t.echeance + coalesce(t.heure, time '09:00')) at time zone 'Europe/Paris'),
         ((t.echeance + coalesce(t.heure, time '09:00')) at time zone 'Europe/Paris') + interval '30 minutes',
         t.heure is null,
         t.etiquette_id,
         t.dossier_id,
         case t.priorite when 'haute' then '#EF4444' when 'basse' then '#94A3B8' else '#F59E0B' end,
         t.fait
  from public.taches t
  where t.echeance is not null

  union all

  select 'echeance',
         ec.id,
         ec.user_id,
         ec.libelle,
         'Échéance ' || ec.criticite,
         null,
         (ec.date_echeance + time '08:00') at time zone 'Europe/Paris',
         (ec.date_echeance + time '09:00') at time zone 'Europe/Paris',
         true,
         null::uuid,
         ec.dossier_id,
         case ec.criticite when 'bloquante' then '#DC2626' when 'haute' then '#F97316' else '#64748B' end,
         ec.statut <> 'a_faire'
  from public.echeances ec;

comment on view public.v_agenda is
  'Timeline unifiée : rendez-vous, journées de formation, tâches datées,
   échéances OPCO. Source du calendrier et du tableau de bord.';


-- ════════════════════════════════════════════════════════════════════════════
--  9. RLS
-- ════════════════════════════════════════════════════════════════════════════
alter table public.etiquettes         enable row level security;
alter table public.listes             enable row level security;
alter table public.evenements         enable row level security;
alter table public.notes              enable row level security;
alter table public.coffre             enable row level security;
alter table public.rappels            enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.ia_conversations   enable row level security;
alter table public.ia_messages        enable row level security;

do $$
declare t text;
begin
  foreach t in array array['etiquettes','listes','evenements','notes','coffre',
                           'rappels','push_subscriptions','ia_conversations','ia_messages']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_own', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t || '_own', t);
  end loop;
end $$;


-- ════════════════════════════════════════════════════════════════════════════
--  10. PLANIFICATION DES NOTIFICATIONS
--      pg_cron réveille /api/rappels toutes les minutes ; la fonction Vercel
--      lit v_rappels_a_envoyer et pousse les notifications.
--
--      ⚠ AVANT d'exécuter cette section, enregistrer les deux secrets :
--
--        select vault.create_secret('https://VOTRE-APP.vercel.app', 'app_url');
--        select vault.create_secret('UN_SECRET_ALEATOIRE',          'rappels_secret');
--
--      Le même secret doit être mis dans Vercel → Environment Variables
--      sous le nom RAPPELS_SECRET.
-- ════════════════════════════════════════════════════════════════════════════
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'app_url') then
    raise warning $msg$Secret « app_url » absent — les notifications ne partiront pas.
  Exécutez :  select vault.create_secret('https://VOTRE-APP.vercel.app', 'app_url');$msg$;
  end if;
  if not exists (select 1 from vault.secrets where name = 'rappels_secret') then
    raise warning $msg$Secret « rappels_secret » absent — les notifications ne partiront pas.
  Exécutez :  select vault.create_secret('UN_SECRET_ALEATOIRE', 'rappels_secret');$msg$;
  end if;
exception when undefined_table or undefined_function then
  raise warning 'Vault indisponible — configurer le job cron à la main.';
end $$;

select cron.unschedule('rappels-push')
where exists (select 1 from cron.job where jobname = 'rappels-push');

select cron.schedule(
  'rappels-push',
  '* * * * *',                       -- toutes les minutes
  $cron$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url')
               || '/api/rappels',
    headers := jsonb_build_object(
                 'Content-Type',      'application/json',
                 'x-rappels-secret',  (select decrypted_secret from vault.decrypted_secrets
                                        where name = 'rappels_secret')
               ),
    body    := jsonb_build_object('source', 'pg_cron'),
    timeout_milliseconds := 20000
  );
  $cron$
);

/* Ménage : les rappels envoyés il y a plus de 30 jours ne servent plus */
select cron.unschedule('rappels-menage')
where exists (select 1 from cron.job where jobname = 'rappels-menage');

select cron.schedule(
  'rappels-menage', '17 3 * * *',
  $cron$ delete from public.rappels
          where statut <> 'en_attente' and cree_le < now() - interval '30 days'; $cron$
);


-- ════════════════════════════════════════════════════════════════════════════
--  VÉRIFICATION
-- ════════════════════════════════════════════════════════════════════════════
select 'Tables créées' as controle,
       count(*)::text || ' / 9' as valeur
  from information_schema.tables
 where table_schema = 'public'
   and table_name in ('etiquettes','listes','evenements','notes','coffre',
                      'rappels','push_subscriptions','ia_conversations','ia_messages')
union all
select 'Colonnes ajoutées à taches',
       count(*)::text || ' / 8'
  from information_schema.columns
 where table_schema = 'public' and table_name = 'taches'
   and column_name in ('liste_id','etiquette_id','notes','heure','rappel_minutes',
                       'ordre','fait_le','modifie_le')
union all
select 'Étiquettes par défaut', count(*)::text from public.etiquettes
union all
select 'Vue v_agenda',
       coalesce((select 'ok' from pg_views where viewname = 'v_agenda'), 'absente ⚠')
union all
select 'Job rappels-push',
       coalesce((select schedule from cron.job where jobname = 'rappels-push'), 'non planifié ⚠')
union all
select 'Secrets Vault',
       coalesce((select string_agg(name, ', ') from vault.secrets
                  where name in ('app_url','rappels_secret')), 'aucun ⚠');
