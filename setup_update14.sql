-- ════════════════════════════════════════════════════════════════════════════
--  IDEAFORMA — Migration v14 : réparation des notifications poussées
--
--  À exécuter dans Supabase → SQL Editor. Idempotente.
--
--  CE QUI S'ÉTAIT PASSÉ : le projet Vercel a été renommé — le domaine de
--  production est devenu  https://ideaforma-mymy.vercel.app  et l'ancien
--  (ideaforma-opco.vercel.app) ne fait plus que rediriger. Or le job pg_cron
--  « rappels-push » lit l'adresse dans le secret Vault « app_url », resté sur
--  l'ancien domaine : ses POST se heurtaient à la redirection et les
--  notifications d'arrière-plan ne partaient plus.
--
--  Ce script : 1. met le secret « app_url » au bon domaine ;
--              2. recrée les deux jobs cron (au cas où) ;
--              3. remet en file les rappels récents tombés en erreur ;
--              4. affiche un état des lieux complet à lire en bas.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Le secret « app_url » pointe sur le domaine ACTUEL ────────────────────
do $$
declare v_id uuid;
begin
  select id into v_id from vault.secrets where name = 'app_url';
  if v_id is null then
    perform vault.create_secret('https://ideaforma-mymy.vercel.app', 'app_url');
  else
    perform vault.update_secret(v_id, new_secret := 'https://ideaforma-mymy.vercel.app');
  end if;
end $$;

-- ── 2. Les jobs cron, recréés à l'identique (lisent le Vault à CHAQUE tour) ──
create extension if not exists pg_cron;
create extension if not exists pg_net;

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

select cron.unschedule('rappels-menage')
where exists (select 1 from cron.job where jobname = 'rappels-menage');

select cron.schedule(
  'rappels-menage', '17 3 * * *',
  $cron$ delete from public.rappels
          where statut <> 'en_attente' and cree_le < now() - interval '30 days'; $cron$
);

-- ── 3. Seconde chance pour les rappels récents tombés en erreur ──────────────
update public.rappels
   set statut = 'en_attente', tentatives = 0, erreur = null
 where statut = 'erreur'
   and envoyer_a > now() - interval '2 days';

-- ── 4. ÉTAT DES LIEUX — à lire (et à me copier si ça coince encore) ─────────
select '1. Secret app_url' as controle,
       (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') as valeur
union all
select '2. Secret rappels_secret présent',
       case when exists (select 1 from vault.secrets where name = 'rappels_secret')
            then 'oui' else 'NON ⚠' end
union all
select '3. Job rappels-push',
       coalesce((select 'actif (' || schedule || ')' from cron.job where jobname = 'rappels-push'), 'ABSENT ⚠')
union all
select '4. Dernier appel du cron',
       coalesce((select status || ' · ' || to_char(start_time, 'DD/MM HH24:MI')
                   from cron.job_run_details d
                   join cron.job j on j.jobid = d.jobid and j.jobname = 'rappels-push'
                  order by start_time desc limit 1), 'jamais')
union all
select '5. Appareils abonnés actifs',
       (select count(*)::text from public.push_subscriptions where actif)
union all
select '6. Rappels en attente',
       (select count(*)::text from public.rappels where statut = 'en_attente')
union all
select '7. Derniers rappels (statut · erreur)',
       coalesce((select string_agg(statut || coalesce(' [' || left(erreur, 60) || ']', ''), ' | ')
                   from (select statut, erreur from public.rappels
                          order by cree_le desc limit 5) r), 'aucun')
union all
select '8. Dernières réponses du serveur au cron',
       coalesce((select string_agg(
                   coalesce('HTTP ' || status_code::text, 'échec réseau : ' || left(error_msg, 60))
                   || coalesce(' · ' || left(content, 80), ''), ' | ')
                   from (select status_code, error_msg, content::text as content
                           from net._http_response order by id desc limit 3) h), 'aucune');
-- Lecture de la ligne 8 : HTTP 200 = la chaîne marche ; HTTP 401 = le secret
-- RAPPELS_SECRET de Vercel ne correspond pas au secret « rappels_secret » du
-- Vault ; HTTP 500 = variable manquante côté Vercel (voir Paramètres →
-- Notifications dans l'app, qui liste précisément lesquelles) ; « échec
-- réseau » = adresse app_url encore fausse.
