-- ════════════════════════════════════════════════════════════════════════════
--  IDEAFORMA — Migration v17 : carnet de contacts
--
--  À exécuter dans Supabase → SQL Editor (projet de l'application). Idempotente.
--
--  Un contact = un prénom (et le reste si on veut) associé à un e-mail.
--  Nanika connaît le carnet : « envoie un mail à Roger » retrouve son adresse.
--  L'onglet Mail propose les contacts dans le champ « À ».
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.contacts (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references auth.users(id) on delete cascade not null,
  prenom      text not null,
  nom         text,
  email       text not null,
  telephone   text,
  societe     text,
  fonction    text,
  notes       text,
  cree_le     timestamptz default now() not null,
  modifie_le  timestamptz default now() not null
);

comment on table public.contacts is
  'Carnet d''adresses personnel : destinataires connus par prénom pour Nanika et l''onglet Mail.';

create index if not exists idx_contacts_user on public.contacts(user_id, prenom);

create or replace function public.fn_contacts_modifie_le()
returns trigger language plpgsql as $$
begin
  new.modifie_le := now();
  return new;
end $$;

drop trigger if exists trg_contacts_modifie_le on public.contacts;
create trigger trg_contacts_modifie_le
  before update on public.contacts
  for each row execute function public.fn_contacts_modifie_le();

alter table public.contacts enable row level security;

drop policy if exists contacts_own on public.contacts;
create policy contacts_own on public.contacts for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

notify pgrst, 'reload schema';
