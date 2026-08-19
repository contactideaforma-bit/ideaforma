-- ════════════════════════════════════════════════════════════════════════════
--  IDEAFORMA — Migration v10 : préférences d'affichage
--
--  À exécuter APRÈS setup_update9.sql, dans Supabase → SQL Editor.
--  Idempotente : peut être rejouée sans dommage.
--
--  Une seule colonne, mais elle évite d'en créer une par réglage : couleur
--  de chaque post-it du tableau de bord aujourd'hui, autres préférences
--  demain. Elle est portée par « profiles », donc les réglages suivent le
--  compte d'un appareil à l'autre — contrairement au stockage local du
--  navigateur, qui aurait donné un tableau de bord différent sur iPhone et
--  sur l'ordinateur.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists preferences jsonb default '{}'::jsonb not null;

comment on column public.profiles.preferences is
  'Réglages d''interface propres au compte. Clés utilisées :
     blocs      { agenda, taches, notes, coffre, assistant } → couleur du post-it
     assistant  { profil }                                   → modèle préféré';

/* Un jsonb null casserait les lectures côté navigateur : on normalise. */
update public.profiles set preferences = '{}'::jsonb where preferences is null;

/* Les policies « profiles_own » de setup.sql couvrent déjà cette colonne :
   for all using (auth.uid() = id). Rien à ajouter. */


-- ════════════════════════════════════════════════════════════════════════════
--  VÉRIFICATION
-- ════════════════════════════════════════════════════════════════════════════
select 'Colonne preferences' as controle,
       coalesce((select data_type from information_schema.columns
                  where table_schema = 'public' and table_name = 'profiles'
                    and column_name = 'preferences'), 'absente ⚠') as valeur
union all
select 'Profils normalisés',
       count(*)::text || ' profil(s), aucun null'
  from public.profiles where preferences is not null;
