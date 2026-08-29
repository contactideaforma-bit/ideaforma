-- ════════════════════════════════════════════════════════════════════════════
--  IDEAFORMA — Migration v15 : relances automatiques des tâches URGENTES
--
--  À exécuter dans Supabase → SQL Editor. Idempotente.
--
--  Le bouton Urgence range désormais ses tâches dans une liste « Urgent ».
--  Tant qu'une tâche de cette liste n'est pas cochée (ni abandonnée) et que
--  son jour de création est passé, le serveur la relance chaque jour à
--  10 h puis 15 h, heure de Paris. Dès qu'elle est cochée, le trigger
--  existant (fn_planifier_rappels_tache) purge ses rappels en attente :
--  les relances s'arrêtent toutes seules.
--
--  Mécanique : un job cron toutes les heures à la minute 0 ; il n'insère
--  des rappels QUE si l'heure de Paris est 10 ou 15 (ce qui absorbe le
--  passage heure d'été / heure d'hiver sans rien toucher).
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists pg_cron;

select cron.unschedule('urgent-relances')
where exists (select 1 from cron.job where jobname = 'urgent-relances');

select cron.schedule(
  'urgent-relances',
  '0 * * * *',
  $cron$
  insert into public.rappels (user_id, source_type, source_id, titre, corps, url, envoyer_a)
  select t.user_id, 'tache', t.id,
         'URGENT — ' || t.description,
         'Toujours pas faite. Relance à 10 h et 15 h tant qu''elle n''est pas cochée.',
         '/app.html#taches',
         date_trunc('minute', now())
    from public.taches t
    join public.listes l on l.id = t.liste_id and lower(l.nom) = 'urgent'
   where not t.fait
     and not t.abandonnee
     and t.echeance is not null
     and t.echeance < (now() at time zone 'Europe/Paris')::date
     and extract(hour from now() at time zone 'Europe/Paris') in (10, 15)
  on conflict do nothing;
  $cron$
);

-- ════════════════════════════════════════════════════════════════════════════
--  VÉRIFICATION
-- ════════════════════════════════════════════════════════════════════════════
select 'Job urgent-relances' as controle,
       coalesce((select 'actif (' || schedule || ')' from cron.job
                  where jobname = 'urgent-relances'), 'absent ⚠') as valeur;
