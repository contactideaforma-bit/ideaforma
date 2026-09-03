-- ════════════════════════════════════════════════════════════════════════════
--  IDEAFORMA — Migration v16 : historique des e-mails envoyés
--
--  À exécuter dans Supabase → SQL Editor. Idempotente.
--
--  L'onglet « Mail » de l'application permet d'écrire un e-mail et de
--  retrouver tout ce qui a été envoyé, par soi-même ou par Nanika.
--  L'envoi réel passe par /api/mail (Resend) ; cette table n'est que le
--  journal, écrit par le navigateur sous RLS après chaque tentative.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.mails (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid references auth.users(id) on delete cascade not null,
  destinataires text[] not null,
  objet         text not null,
  corps         text not null,
  statut        text default 'envoye' not null check (statut in ('envoye', 'echec')),
  erreur        text,
  source        text default 'manuel' not null check (source in ('manuel', 'nanika')),
  resend_id     text,
  envoye_le     timestamptz default now() not null
);

comment on table public.mails is
  'Journal des e-mails envoyés depuis l''application (onglet Mail et Nanika).';

create index if not exists idx_mails_user_date on public.mails(user_id, envoye_le desc);

alter table public.mails enable row level security;

drop policy if exists mails_own on public.mails;
create policy mails_own on public.mails for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- PostgREST (l'API que l'application interroge) garde le schéma en cache :
-- sans ce signal, l'application peut répondre « Could not find the table
-- 'public.mails' in the schema cache » pendant un moment après la création.
notify pgrst, 'reload schema';
