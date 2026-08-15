-- ════════════════════════════════════════════════════════════════════════════
--  IDEAFORMA — Migration v6 : Storage, vues d'affichage, rappel quotidien
--  À exécuter APRÈS setup_update5.sql, dans Supabase Dashboard → SQL Editor
--
--  Contenu :
--    1. Bucket Storage privé « documents » + policies d'accès
--    2. Vue calendrier (sessions à afficher)
--    3. Vue digest quotidien (corps du mail de rappel)
--    4. Planification pg_cron → Edge Function
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
--  1. BUCKET STORAGE « documents »
--     Arborescence imposée : documents/<user_id>/<dossier_id>/<fichier>
--     Le premier segment du chemin sert de clé d'isolation.
-- ════════════════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents', 'documents', false,
  20971520,   -- 20 Mo par fichier
  array['application/pdf','image/png','image/jpeg','image/webp',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/msword','application/vnd.ms-excel']
)
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

/* Chaque utilisateur ne voit et n'écrit que dans son propre dossier racine */
drop policy if exists "documents_select_own" on storage.objects;
create policy "documents_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "documents_insert_own" on storage.objects;
create policy "documents_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "documents_update_own" on storage.objects;
create policy "documents_update_own" on storage.objects
  for update to authenticated
  using      (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "documents_delete_own" on storage.objects;
create policy "documents_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);


-- ════════════════════════════════════════════════════════════════════════════
--  2. VUE CALENDRIER — une ligne par journée de formation
-- ════════════════════════════════════════════════════════════════════════════
create or replace view public.v_sessions_calendrier
with (security_invoker = true) as
select
  s.id                 as session_id,
  s.user_id,
  s.dossier_id,
  s.date_session,
  s.heure_debut,
  s.heure_fin,
  s.duree_heures,
  s.statut             as statut_session,
  coalesce(s.lieu, d.lieu)                        as lieu,
  c.nom_entreprise,
  d.sujet_formation,
  coalesce(d.opco_code, c.opco)                   as opco_code,
  r.label                                          as opco_label,
  r.couleur                                        as opco_couleur,
  d.statut_pedagogique,
  (select count(*) from public.stagiaires st where st.dossier_id = d.id) as nb_stagiaires
from public.sessions s
join public.dossiers d on d.id = s.dossier_id
join public.clients  c on c.id = d.client_id
left join public.opco_referentiel r on r.code = coalesce(d.opco_code, c.opco);

comment on view public.v_sessions_calendrier is
  'Source du calendrier du dashboard — remplace le calcul jsonb côté navigateur';


-- ════════════════════════════════════════════════════════════════════════════
--  3. DIGEST QUOTIDIEN — corps du mail de rappel
-- ════════════════════════════════════════════════════════════════════════════
create or replace view public.v_digest_quotidien
with (security_invoker = false) as
select
  e.user_id,
  count(*) filter (where e.date_echeance <  current_date)                        as en_retard,
  count(*) filter (where e.date_echeance =  current_date)                        as aujourd_hui,
  count(*) filter (where e.date_echeance between current_date + 1
                                             and current_date + 7)               as cette_semaine,
  count(*) filter (where e.criticite = 'bloquante'
                     and e.date_echeance <= current_date + 7)                    as bloquantes,
  jsonb_agg(
    jsonb_build_object(
      'libelle',       e.libelle,
      'entreprise',    c.nom_entreprise,
      'formation',     d.sujet_formation,
      'date',          e.date_echeance,
      'jours',         e.date_echeance - current_date,
      'criticite',     e.criticite
    )
    order by
      case e.criticite when 'bloquante' then 0 when 'haute' then 1
                       when 'normale' then 2 else 3 end,
      e.date_echeance
  ) filter (where e.date_echeance <= current_date + 7)                           as items
from public.echeances e
join public.dossiers d on d.id = e.dossier_id
join public.clients  c on c.id = d.client_id
where e.statut = 'a_faire'
  and e.date_echeance <= current_date + 7
group by e.user_id;

comment on view public.v_digest_quotidien is
  'security_invoker = false : lue par l''Edge Function avec la clé service_role,
   hors contexte utilisateur. Ne jamais exposer cette vue au rôle anon.';

revoke all on public.v_digest_quotidien from anon, authenticated;
grant  select on public.v_digest_quotidien to service_role;

/* Adresse de destination du rappel */
create or replace view public.v_digest_destinataires
with (security_invoker = false) as
select p.id as user_id,
       coalesce(p.email, u.email) as email,
       coalesce(p.nom, p.organisme, 'Bonjour') as nom
from public.profiles p
join auth.users u on u.id = p.id;

revoke all on public.v_digest_destinataires from anon, authenticated;
grant  select on public.v_digest_destinataires to service_role;


-- ════════════════════════════════════════════════════════════════════════════
--  4. PLANIFICATION DU RAPPEL QUOTIDIEN
--     pg_cron appelle l'Edge Function « rappel-echeances » via pg_net.
--
--     ⚠ Avant d'exécuter cette section :
--        a) Dashboard → Database → Extensions : activer pg_cron et pg_net
--        b) Déployer la fonction :  supabase functions deploy rappel-echeances
--        c) Renseigner les deux secrets Vault ci-dessous
-- ════════════════════════════════════════════════════════════════════════════
create extension if not exists pg_cron;
create extension if not exists pg_net;

/* Secrets stockés dans le Vault : la clé service_role n'apparaît jamais en
   clair dans la définition du job cron.

   ⚠ La clé service_role doit être enregistrée MANUELLEMENT, une seule fois.
     Dashboard → Settings → API → « service_role secret », puis exécuter :

       select vault.create_secret('eyJhbGci...', 'service_role_key');

   Le bloc ci-dessous crée seulement l'URL du projet et vous prévient si la
   clé manque — sans elle, le job cron s'exécuterait en échec silencieux. */
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'project_url') then
    perform vault.create_secret('https://ijwcigmxcevgrhauvnyk.supabase.co', 'project_url');
    raise notice 'Secret project_url créé.';
  end if;

  if not exists (select 1 from vault.secrets where name = 'service_role_key') then
    raise warning $msg$Secret « service_role_key » absent.
  Le rappel quotidien ne partira pas tant que vous n'aurez pas exécuté :
      select vault.create_secret('VOTRE_CLE_SERVICE_ROLE', 'service_role_key');$msg$;
  end if;
exception when undefined_table or undefined_function then
  raise warning 'Vault indisponible sur ce projet — section cron à configurer à la main.';
end $$;

/* Job : tous les jours à 7 h 00 heure de Paris.
   pg_cron est en UTC → 5 h 00 UTC en été, 6 h 00 UTC en hiver.
   On planifie à 5 h UTC et la fonction ne fait rien s'il n'y a aucune échéance. */
select cron.unschedule('rappel-echeances-quotidien')
where exists (select 1 from cron.job where jobname = 'rappel-echeances-quotidien');

select cron.schedule(
  'rappel-echeances-quotidien',
  '0 5 * * 1-5',            -- du lundi au vendredi
  $cron$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
               || '/functions/v1/rappel-echeances',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' ||
                   (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
               ),
    body    := jsonb_build_object('source', 'pg_cron'),
    timeout_milliseconds := 30000
  );
  $cron$
);


-- ════════════════════════════════════════════════════════════════════════════
--  VÉRIFICATION
-- ════════════════════════════════════════════════════════════════════════════
select 'Bucket documents' as controle,
       coalesce((select case when public then 'PUBLIC ⚠' else 'privé ✓' end
                 from storage.buckets where id = 'documents'), 'absent ⚠') as valeur
union all
select 'Policies storage', count(*)::text from pg_policies
 where schemaname = 'storage' and policyname like 'documents_%'
union all
select 'Job cron planifié',
       coalesce((select schedule from cron.job where jobname = 'rappel-echeances-quotidien'), 'non planifié');
