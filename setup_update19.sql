-- ════════════════════════════════════════════════════════════════════════════
--  IDEAFORMA — Migration v19 : historique des SMS envoyés
--
--  À exécuter dans Supabase → SQL Editor (projet de l'application). Idempotente.
--
--  L'onglet « SMS » et Nanika envoient des SMS via /api/sms (Brevo ou Twilio) ;
--  cette table n'est que le journal, écrit par le navigateur sous RLS après
--  chaque tentative, réussie ou non.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.sms (
  id             uuid default gen_random_uuid() primary key,
  user_id        uuid references auth.users(id) on delete cascade not null,
  destinataires  text[] not null,          -- numéros au format +33…
  noms           text[],                   -- prénoms/noms des contacts, si connus
  contenu        text not null,
  statut         text default 'envoye' not null check (statut in ('envoye', 'echec')),
  erreur         text,
  source         text default 'manuel' not null check (source in ('manuel', 'nanika')),
  fournisseur_id text,
  envoye_le      timestamptz default now() not null
);

comment on table public.sms is
  'Journal des SMS envoyés depuis l''application (onglet SMS et Nanika).';

create index if not exists idx_sms_user_date on public.sms(user_id, envoye_le desc);

alter table public.sms enable row level security;

drop policy if exists sms_own on public.sms;
create policy sms_own on public.sms for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

notify pgrst, 'reload schema';
