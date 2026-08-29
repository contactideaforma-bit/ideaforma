-- ════════════════════════════════════════════════════════════════════════════
--  IDEAFORMA — Migration v13 : deuxième alerte sur les tâches
--
--  À exécuter APRÈS setup_update12.sql, dans Supabase → SQL Editor.
--  Idempotente : peut être rejouée sans dommage.
--
--  Le formulaire de tâche simplifié propose deux alertes : chacune est un
--  décalage en minutes avant l'échéance (0 = à l'heure dite). Le trigger
--  fn_planifier_rappels_tache pose désormais un rappel par alerte remplie.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.taches
  add column if not exists rappel_minutes_2 integer;

comment on column public.taches.rappel_minutes_2 is
  'Seconde alerte, en minutes avant l''échéance (0 = à l''heure dite). Null = pas de 2e alerte.';

-- ── Le trigger passe à deux rappels ──────────────────────────────────────────
create or replace function public.fn_planifier_rappels_tache()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_quand timestamptz;
  m       integer;
begin
  delete from public.rappels
   where source_type = 'tache' and source_id = new.id and statut = 'en_attente';

  if new.fait or new.echeance is null then
    return new;
  end if;

  foreach m in array array_remove(array[new.rappel_minutes, new.rappel_minutes_2], null) loop
    v_quand := ((new.echeance + coalesce(new.heure, time '09:00')) at time zone 'Europe/Paris')
               - make_interval(mins => m);

    if v_quand >= now() - interval '2 minutes' then
      insert into public.rappels (user_id, source_type, source_id, titre, corps, url, envoyer_a)
      values (new.user_id, 'tache', new.id, new.description,
              'Tâche à faire' ||
              coalesce(' · ' || to_char(new.heure, 'HH24:MI'), ''),
              '/app.html#taches', v_quand)
      on conflict do nothing;   -- l'index d'unicité déduplique deux alertes identiques
    end if;
  end loop;

  return new;
end $$;

drop trigger if exists trg_taches_rappels on public.taches;
create trigger trg_taches_rappels
  after insert or update of echeance, heure, rappel_minutes, rappel_minutes_2, fait, description
  on public.taches
  for each row execute function public.fn_planifier_rappels_tache();

-- ════════════════════════════════════════════════════════════════════════════
--  VÉRIFICATION
-- ════════════════════════════════════════════════════════════════════════════
select 'Colonne taches.rappel_minutes_2' as controle,
       coalesce((select 'présente'
                   from information_schema.columns
                  where table_schema = 'public' and table_name = 'taches'
                    and column_name = 'rappel_minutes_2'),
                'absente ⚠') as valeur
union all
select 'Trigger trg_taches_rappels',
       coalesce((select 'présent' from pg_trigger where tgname = 'trg_taches_rappels'),
                'absent ⚠');
