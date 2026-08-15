-- ════════════════════════════════════════════════════════════════════════════
--  IDEAFORMA — Migration v7 : abandon du rappel par e-mail
--  À exécuter APRÈS setup_update6.sql, dans Supabase Dashboard → SQL Editor
--
--  Le récapitulatif quotidien est désormais affiché dans l'application
--  (page « Ma journée ») plutôt qu'envoyé par e-mail. Ce script démonte
--  proprement le circuit d'envoi : sans lui, le job cron continuerait à
--  appeler chaque matin une Edge Function inexistante et remplirait la
--  table net._http_response d'erreurs.
-- ════════════════════════════════════════════════════════════════════════════


-- ─── 1. Déprogrammer le job cron ─────────────────────────────────────────────
do $$
begin
  if exists (select 1 from cron.job where jobname = 'rappel-echeances-quotidien') then
    perform cron.unschedule('rappel-echeances-quotidien');
    raise notice 'Job « rappel-echeances-quotidien » déprogrammé.';
  else
    raise notice 'Aucun job à déprogrammer.';
  end if;
exception when undefined_table or undefined_function or invalid_schema_name then
  raise notice 'pg_cron non installé — rien à déprogrammer.';
end $$;


-- ─── 2. Supprimer les vues dédiées à l'e-mail ────────────────────────────────
/* v_actions_du_jour (migration v5) reste la source unique : elle respecte les
   RLS et alimente directement la page « Ma journée ». */
drop view if exists public.v_digest_quotidien;
drop view if exists public.v_digest_destinataires;


-- ─── 3. Nettoyer le secret Vault devenu inutile ──────────────────────────────
/* project_url ne servait qu'à construire l'URL de l'Edge Function.
   Conservé si vous prévoyez d'autres appels sortants — décommentez sinon. */
-- delete from vault.secrets where name in ('project_url', 'service_role_key');


-- ─── 4. Vérification ─────────────────────────────────────────────────────────
select 'Job cron restant' as controle,
       coalesce((select jobname from cron.job where jobname = 'rappel-echeances-quotidien'),
                'aucun ✓') as valeur
union all
select 'Vues digest supprimées',
       case when to_regclass('public.v_digest_quotidien') is null
             and to_regclass('public.v_digest_destinataires') is null
            then 'oui ✓' else 'non ⚠' end
union all
select 'Source de la page Ma journée',
       case when to_regclass('public.v_actions_du_jour') is not null
            then 'v_actions_du_jour ✓' else 'manquante ⚠ — rejouer setup_update5.sql' end;
