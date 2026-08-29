-- ════════════════════════════════════════════════════════════════════════════
--  IDEAFORMA — Migration v12 : dernière utilisation des listes
--
--  À exécuter APRÈS setup_update11.sql, dans Supabase → SQL Editor.
--  Idempotente : peut être rejouée sans dommage.
--
--  Le tableau de bord présente désormais les listes dans un carrousel trié
--  par dernière utilisation. La colonne `utilisee_le` est mise à jour par
--  l'application à chaque ouverture d'une liste (DataStore.toucherListe).
-- ════════════════════════════════════════════════════════════════════════════

alter table public.listes
  add column if not exists utilisee_le timestamptz default now() not null;

comment on column public.listes.utilisee_le is
  'Dernière ouverture de la liste depuis le carrousel du tableau de bord.';

-- ════════════════════════════════════════════════════════════════════════════
--  VÉRIFICATION
-- ════════════════════════════════════════════════════════════════════════════
select 'Colonne listes.utilisee_le' as controle,
       coalesce((select 'présente'
                   from information_schema.columns
                  where table_schema = 'public' and table_name = 'listes'
                    and column_name = 'utilisee_le'),
                'absente ⚠') as valeur;
