-- ════════════════════════════════════════════════════════════════
--  IDEAFORMA — Migration v3
--  À exécuter dans Supabase Dashboard → SQL Editor
--  Cumulative avec setup.sql + setup_update.sql
-- ════════════════════════════════════════════════════════════════

-- ─── 1. Clients : gérant, IDCC, liste salariés ───────────────────
alter table public.clients
  add column if not exists nom_gerant  text,
  add column if not exists idcc        text,
  add column if not exists salaries    jsonb default '[]'::jsonb;

comment on column public.clients.nom_gerant is 'Nom du gérant / représentant légal';
comment on column public.clients.idcc       is 'Identifiant de la Convention Collective (IDCC)';
comment on column public.clients.salaries   is 'Liste des salariés de l''entreprise [{firstName, lastName, poste}]';


-- ─── 2. Dossiers : champs programme pédagogique ──────────────────
alter table public.dossiers
  add column if not exists objectifs  text,
  add column if not exists contenu    text,
  add column if not exists modalite   text default 'presentiel',
  add column if not exists evaluation text,
  add column if not exists prerequis  text;

comment on column public.dossiers.objectifs  is 'Objectifs pédagogiques de la formation';
comment on column public.dossiers.contenu    is 'Programme détaillé / contenu des modules';
comment on column public.dossiers.modalite   is 'Modalité : presentiel | distanciel | mixte';
comment on column public.dossiers.evaluation is 'Modalité d''évaluation (QCM, TP, mise en situation…)';
comment on column public.dossiers.prerequis  is 'Prérequis d''entrée en formation';


-- ─── 3. Profiles : logo et couleur de marque ─────────────────────
alter table public.profiles
  add column if not exists logo_base64      text,
  add column if not exists couleur_primaire text default '#1E2D4B';

comment on column public.profiles.logo_base64      is 'Logo de l''organisme encodé en base64';
comment on column public.profiles.couleur_primaire is 'Couleur principale pour les documents PDF';


-- ─── 4. Vérification ─────────────────────────────────────────────
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'clients'  and column_name in ('nom_gerant','idcc','salaries'))
 or (table_name = 'dossiers' and column_name in ('objectifs','contenu','modalite','evaluation','prerequis'))
 or (table_name = 'profiles' and column_name in ('logo_base64','couleur_primaire'))
  )
order by table_name, column_name;
