-- ════════════════════════════════════════════════════════════════════════════
--  IDEAFORMA — Migration v5 : socle « suivi de dossiers »
--  À exécuter dans Supabase Dashboard → SQL Editor
--  Cumulative avec setup.sql + setup_update.sql + setup_update2/3.sql
--
--  Caractéristiques :
--    • 100 % additive — aucune colonne ni donnée supprimée
--    • Idempotente — rejouable sans effet de bord
--    • Reprend automatiquement les données jsonb existantes
--      (dossiers.salaries → stagiaires, dossiers.dates_formation → sessions)
--    • La colonne dossiers.statut historique reste synchronisée dans les
--      deux sens : le front actuel continue de fonctionner sans modification
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";


-- ════════════════════════════════════════════════════════════════════════════
--  0. UTILITAIRES
-- ════════════════════════════════════════════════════════════════════════════

/* Cast date tolérant : renvoie NULL au lieu de lever une erreur.
   Indispensable pour reprendre des jsonb saisis à la main. */
create or replace function public.fn_safe_date(txt text)
returns date language plpgsql immutable as $$
begin
  return nullif(trim(txt), '')::date;
exception when others then
  return null;
end;
$$;

/* Horodatage automatique */
create or replace function public.fn_set_modifie_le()
returns trigger language plpgsql as $$
begin
  new.modifie_le = now();
  return new;
end;
$$;


-- ════════════════════════════════════════════════════════════════════════════
--  1. PROFILES — champs organisme manquants
--     (utilisés par data.js / documents.js mais absents des scripts versionnés)
-- ════════════════════════════════════════════════════════════════════════════
alter table public.profiles
  add column if not exists adresse            text,
  add column if not exists telephone          text,
  add column if not exists numero_da          text,
  add column if not exists numero_qualiopi    text,
  add column if not exists date_fin_qualiopi  date,
  add column if not exists referent_handicap  text,
  add column if not exists referent_handicap_contact text,
  add column if not exists tva_applicable     boolean default false not null,
  add column if not exists iban               text,
  add column if not exists cgv                text;

comment on column public.profiles.numero_da         is 'Numéro de déclaration d''activité (NDA) auprès de la DREETS';
comment on column public.profiles.date_fin_qualiopi is 'Date de fin de validité de la certification Qualiopi — alerte à J-90';
comment on column public.profiles.referent_handicap is 'Référent handicap — indicateur Qualiopi 26';
comment on column public.profiles.tva_applicable    is 'false = exonération art. 261-4-4° a du CGI';


-- ════════════════════════════════════════════════════════════════════════════
--  2. RÉFÉRENTIEL OPCO — sortir opco.js CONFIG du code
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.opco_referentiel (
  code                text primary key,
  label               text not null,
  short_label         text,
  couleur             text,
  secteurs            text,
  delai_depot_jours   integer default 0 not null,
  delai_strict        boolean default false not null,
  site_web            text,
  telephone           text,
  documents_requis    jsonb  default '[]'::jsonb not null,
  alertes             jsonb  default '[]'::jsonb not null,
  conseils            jsonb  default '[]'::jsonb not null,
  actif               boolean default true not null,
  modifie_le          timestamptz default now() not null
);

comment on table public.opco_referentiel is
  'Référentiel des OPCO — remplace OpcoPage.CONFIG codé en dur dans opco.js.
   Modifiable depuis l''application sans redéploiement.';
comment on column public.opco_referentiel.delai_depot_jours is
  'Nombre de jours avant démarrage pour déposer le dossier (0 = avant démarrage)';

insert into public.opco_referentiel
  (code, label, short_label, couleur, secteurs, delai_depot_jours, delai_strict,
   site_web, telephone, documents_requis, alertes)
values
  ('opco_commerce','OPCO Commerce','Commerce','#3B82F6',
   'Commerce de détail, grande distribution, e-commerce, bricolage, jardinerie, sport',
   0, false, 'https://www.opcommerce.com','09 69 32 99 08',
   '["Convention de formation signée (2 exemplaires)","Programme pédagogique détaillé","Devis signé par l''employeur","Attestation Qualiopi en cours de validité","RIB de l''organisme de formation","Fiche d''adhésion de l''entreprise"]'::jsonb,
   '["Vérifier l''adhésion de l''entreprise avant tout dossier","La TVA n''est pas prise en charge — facturer HT uniquement","Certains accords de branche imposent des plafonds spécifiques"]'::jsonb),

  ('opco_mobilite','OPCO Mobilité','Mobilité','#8B5CF6',
   'Transport routier (voyageurs, marchandises), déménagement, automobile, location, voyagistes, logistique urbaine',
   15, true, 'https://www.opcomobilites.fr','0970 816 816',
   '["Convention de formation signée","Programme pédagogique détaillé","Devis signé par l''employeur","Attestation Qualiopi valide","Numéro SIRET de l''entreprise","Liste nominative des salariés à former"]'::jsonb,
   '["Formation > 5 000 € : accord préalable obligatoire","Distinguer formations réglementaires (FCO, FIMO) et qualifiantes","Délai de 15 jours strict — dossier refusé si tardif"]'::jsonb),

  ('akto','AKTO','AKTO','#10B981',
   'Hôtellerie-restauration, tourisme, sport & loisirs, services à la personne, propreté, sécurité privée',
   0, false, 'https://www.akto.fr','09 80 80 10 00',
   '["Devis signé par le représentant légal","Convention de formation signée par les deux parties","Programme pédagogique détaillé","Attestation Qualiopi en cours de validité","Fiche de renseignements de l''entreprise","Liste nominative des salariés avec intitulés de postes"]'::jsonb,
   '["Vérifier impérativement l''adhésion AKTO — sinon refus automatique","Les TPE (< 11 salariés) bénéficient de taux majorés","L''alternance relève d''un circuit distinct"]'::jsonb),

  ('constructys','Constructys','Constructys','#F59E0B',
   'Bâtiment, travaux publics, négoce de matériaux, génie civil, menuiserie, plomberie, électricité du bâtiment',
   30, true, 'https://www.constructys.fr','01 55 68 70 00',
   '["Devis signé par l''employeur","Programme pédagogique détaillé","Attestation Qualiopi valide","KBIS de moins de 3 mois","Convention de formation signée","Attestation de présence après chaque session"]'::jsonb,
   '["KBIS de moins de 3 mois obligatoire — à demander en amont","Attestations de présence = condition du paiement","Délai d''1 mois strict — refus systématique si tardif"]'::jsonb),

  ('opco_ep','OPCO EP','EP','#EC4899',
   'Coiffure, esthétique-cosmétique, fleuristes, pompes funèbres, pressing, cordonnerie, blanchisserie',
   0, false, 'https://www.opcoep.fr','01 53 32 53 40',
   '["Devis signé par l''employeur","Programme de formation détaillé","Convention de formation signée","Attestation Qualiopi en cours de validité","Numéro adhérent OPCO EP"]'::jsonb,
   '["Certaines formations nécessitent un accord préalable","Niveaux de prise en charge très variables selon la taille","Structures 1-2 salariés : vérifier l''éligibilité au fonds TPE"]'::jsonb)
on conflict (code) do nothing;


-- ─── Plafonds structurés : alimente le simulateur de prise en charge ───────
create table if not exists public.opco_plafonds (
  id                     uuid default gen_random_uuid() primary key,
  opco_code              text not null references public.opco_referentiel(code) on delete cascade,
  dispositif             text not null,
  effectif_min           integer default 0    not null,
  effectif_max           integer,                      -- null = pas de limite haute
  taux_horaire_max       numeric(8,2),
  montant_jour_stagiaire numeric(8,2),
  plafond_formation      numeric(10,2),
  pourcentage_max        integer,                      -- ex. 100 pour « jusqu'à 100 % »
  prioritaire            boolean default false not null,
  note                   text,
  annee                  integer default extract(year from now())::int not null,
  unique (opco_code, dispositif, effectif_min, annee)
);

comment on table public.opco_plafonds is
  'Barèmes de prise en charge structurés — base du simulateur fn_simuler_prise_en_charge()';

insert into public.opco_plafonds
 (opco_code, dispositif, effectif_min, effectif_max, taux_horaire_max,
  montant_jour_stagiaire, plafond_formation, pourcentage_max, prioritaire, note)
values
 -- OPCO Commerce
 ('opco_commerce','Plan de développement des compétences',0,10,25,null,1500,null,false,'Taux bonifiés selon accord de branche'),
 ('opco_commerce','Plan de développement des compétences',11,49,18,null,1000,null,false,null),
 ('opco_commerce','Plan de développement des compétences',50,null,15,null,null,null,false,'Accord préalable recommandé au-delà de 10 000 €'),
 ('opco_commerce','Pro-A (reconversion / promotion)',0,null,30,null,null,null,false,'Circuit et dossier spécifiques'),
 ('opco_commerce','Formations numérique & RSE (prioritaires)',0,10,25,null,2000,null,true,'Enveloppe dédiée'),
 -- OPCO Mobilité
 ('opco_mobilite','FCO Marchandises (réglementaire)',0,null,null,300,null,null,true,'Formation obligatoire — prise en charge prioritaire'),
 ('opco_mobilite','FCO Voyageurs (réglementaire)',0,null,null,300,null,null,true,'Formation obligatoire — prise en charge prioritaire'),
 ('opco_mobilite','Plan de développement des compétences',0,49,40,null,null,null,false,'Fonds TPE-PME — dépôt 15 j avant démarrage'),
 ('opco_mobilite','Plan de développement des compétences',50,249,30,null,null,null,false,'Accord préalable obligatoire au-delà de 5 000 €'),
 ('opco_mobilite','Éco-conduite / Loi LOM',0,null,40,null,null,null,true,'Financement majoré'),
 -- AKTO
 ('akto','Plan de développement des compétences',0,10,35,null,null,null,false,'Enveloppe dédiée TPE — taux les plus élevés'),
 ('akto','Plan de développement des compétences',11,49,25,null,1200,null,false,null),
 ('akto','Plan de développement des compétences',50,null,15,null,null,null,false,null),
 ('akto','HACCP / Hygiène alimentaire (certifiant)',0,null,null,null,null,100,true,'Formations certifiantes prioritaires'),
 -- Constructys
 ('constructys','Formations sécurité réglementaires (CACES, habilitations, travail en hauteur)',0,null,28,null,null,null,true,'Aligner sur les thèmes prioritaires annuels'),
 ('constructys','Plan de développement des compétences',0,9,28,null,null,null,false,'KBIS < 3 mois obligatoire'),
 ('constructys','Plan de développement des compétences',10,49,20,null,null,null,false,'Dépôt 1 mois avant démarrage'),
 ('constructys','Plan de développement des compétences',50,null,15,null,null,null,false,null),
 ('constructys','Habilitations électriques (B0, H0, BR…)',0,null,25,null,null,null,true,'Vérifier la liste des thèmes prioritaires'),
 -- OPCO EP
 ('opco_ep','Plan de développement des compétences',0,2,null,null,null,null,false,'Fonds TPE — contacter un conseiller avant dossier'),
 ('opco_ep','Plan de développement des compétences',3,10,25,null,null,null,false,'Taux bonifiés branche'),
 ('opco_ep','Plan de développement des compétences',11,49,18,null,1000,null,false,null),
 ('opco_ep','Hygiène & désinfection',0,null,null,null,null,100,true,'Toujours bien financé en coiffure / esthétique')
on conflict (opco_code, dispositif, effectif_min, annee) do nothing;


-- ════════════════════════════════════════════════════════════════════════════
--  3. CLIENTS — SIRET, adhésion OPCO, contact
-- ════════════════════════════════════════════════════════════════════════════
alter table public.clients
  add column if not exists siret                 text,
  add column if not exists code_naf              text,
  add column if not exists numero_adherent_opco  text,
  add column if not exists statut_adhesion_opco  text default 'a_verifier' not null,
  add column if not exists contact_nom           text,
  add column if not exists contact_fonction      text,
  add column if not exists contact_email         text,
  add column if not exists contact_tel           text,
  add column if not exists kbis_date             date,
  add column if not exists modifie_le            timestamptz default now() not null;

alter table public.clients drop constraint if exists clients_adhesion_check;
alter table public.clients add  constraint clients_adhesion_check
  check (statut_adhesion_opco in ('a_verifier','adherent','non_adherent'));

comment on column public.clients.statut_adhesion_opco is
  'Première cause de refus OPCO — un dossier sur un non-adhérent est rejeté d''office';
comment on column public.clients.kbis_date is
  'Date du KBIS détenu — Constructys exige un KBIS de moins de 3 mois';

/* Le check figé sur 5 codes est remplacé par une clé étrangère :
   ajouter un OPCO ne demande plus de migration. */
alter table public.clients drop constraint if exists clients_opco_check;
alter table public.clients drop constraint if exists clients_opco_fk;
alter table public.clients add  constraint clients_opco_fk
  foreign key (opco) references public.opco_referentiel(code) on update cascade;

drop trigger if exists trg_clients_modifie_le on public.clients;
create trigger trg_clients_modifie_le
  before update on public.clients
  for each row execute function public.fn_set_modifie_le();


-- ════════════════════════════════════════════════════════════════════════════
--  4. COMPTEURS — numérotation serveur atomique
--     Remplace _docNum() qui tirait un nombre au hasard (risque de collision
--     et numérotation non continue = non conforme pour les factures)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.compteurs (
  user_id uuid    references auth.users(id) on delete cascade not null,
  type    text    not null,
  annee   integer not null,
  valeur  integer default 0 not null,
  primary key (user_id, type, annee)
);

create or replace function public.fn_next_numero(p_type text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid    := auth.uid();
  v_annee  integer := extract(year from now())::int;
  v_val    integer;
  v_prefix text;
begin
  if v_uid is null then raise exception 'Non authentifié'; end if;

  insert into public.compteurs (user_id, type, annee, valeur)
  values (v_uid, p_type, v_annee, 1)
  on conflict (user_id, type, annee)
    do update set valeur = public.compteurs.valeur + 1
  returning valeur into v_val;

  v_prefix := case p_type
    when 'facture'    then 'FAC'
    when 'devis'      then 'DEV'
    when 'convention' then 'CONV'
    when 'dossier'    then 'DOS'
    when 'avoir'      then 'AV'
    else upper(left(p_type, 3)) end;

  return format('%s-%s-%s', v_prefix, v_annee, lpad(v_val::text, 4, '0'));
end;
$$;

comment on function public.fn_next_numero is
  'Numérotation continue et atomique par organisme / type / année';


-- ════════════════════════════════════════════════════════════════════════════
--  5. FORMATEURS
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.formateurs (
  id             uuid default gen_random_uuid() primary key,
  user_id        uuid references auth.users(id) on delete cascade not null,
  nom            text not null,
  prenom         text,
  email          text,
  telephone      text,
  statut         text default 'interne' not null,
  cout_horaire   numeric(8,2),
  specialites    text,
  qualifications text,
  cv_path        text,
  actif          boolean default true not null,
  cree_le        timestamptz default now() not null,
  constraint formateurs_statut_check check (statut in ('interne','sous_traitant'))
);

comment on column public.formateurs.cout_horaire is 'Base du calcul de marge par dossier';
comment on column public.formateurs.cv_path      is 'CV et qualifications — indicateur Qualiopi 21';


-- ════════════════════════════════════════════════════════════════════════════
--  6. CATALOGUE DE FORMATIONS — programmes réutilisables et versionnés
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.formations_catalogue (
  id              uuid default gen_random_uuid() primary key,
  user_id         uuid references auth.users(id) on delete cascade not null,
  intitule        text not null,
  version         integer default 1 not null,
  objectifs       text,
  contenu         text,
  prerequis       text,
  evaluation      text,
  public_vise     text,
  moyens          text,
  duree_heures    numeric(6,2),
  modalite        text default 'presentiel' not null,
  prix_indicatif  numeric(10,2),
  certifiante     boolean default false not null,
  code_rs_rncp    text,
  actif           boolean default true not null,
  cree_le         timestamptz default now() not null,
  modifie_le      timestamptz default now() not null,
  constraint catalogue_modalite_check check (modalite in ('presentiel','distanciel','mixte'))
);

comment on table public.formations_catalogue is
  'Programmes réutilisables — évite de ressaisir objectifs/contenu à chaque dossier
   et garantit la cohérence documentaire attendue en audit Qualiopi';

drop trigger if exists trg_catalogue_modifie_le on public.formations_catalogue;
create trigger trg_catalogue_modifie_le
  before update on public.formations_catalogue
  for each row execute function public.fn_set_modifie_le();


-- ════════════════════════════════════════════════════════════════════════════
--  7. DOSSIERS — statuts multi-axes, durée, instruction OPCO
-- ════════════════════════════════════════════════════════════════════════════
alter table public.dossiers
  add column if not exists reference            text,
  add column if not exists opco_code            text,
  add column if not exists catalogue_id         uuid references public.formations_catalogue(id) on delete set null,
  add column if not exists formateur_id         uuid references public.formateurs(id) on delete set null,
  add column if not exists duree_heures         numeric(6,2),
  add column if not exists lieu                 text,
  add column if not exists public_vise          text,
  add column if not exists moyens               text,
  add column if not exists tva_applicable       boolean default false not null,
  -- axes de statut
  add column if not exists statut_commercial    text default 'brouillon'      not null,
  add column if not exists statut_opco          text default 'a_deposer'      not null,
  add column if not exists statut_pedagogique   text default 'a_planifier'    not null,
  add column if not exists statut_facturation   text default 'non_facturable' not null,
  -- instruction OPCO
  add column if not exists date_envoi_devis     date,
  add column if not exists date_signature_devis date,
  add column if not exists date_depot_opco      date,
  add column if not exists date_accord_opco     date,
  add column if not exists numero_accord_opco   text,
  add column if not exists montant_demande      numeric(10,2),
  add column if not exists montant_accorde      numeric(10,2),
  add column if not exists motif_refus_opco     text,
  add column if not exists dispositif           text default 'Plan de développement des compétences';

comment on column public.dossiers.duree_heures is
  'Durée en heures — indispensable : tous les plafonds OPCO sont en €/h, et le BPF compte en heures-stagiaires';
comment on column public.dossiers.opco_code is
  'OPCO porté par le dossier (et non plus par le client) : une entreprise peut relever de plusieurs financeurs';

alter table public.dossiers drop constraint if exists dossiers_opco_fk;
alter table public.dossiers add  constraint dossiers_opco_fk
  foreign key (opco_code) references public.opco_referentiel(code) on update cascade;

alter table public.dossiers drop constraint if exists dossiers_st_commercial_check;
alter table public.dossiers add  constraint dossiers_st_commercial_check
  check (statut_commercial in ('brouillon','devis_envoye','devis_signe','perdu','annule'));

alter table public.dossiers drop constraint if exists dossiers_st_opco_check;
alter table public.dossiers add  constraint dossiers_st_opco_check
  check (statut_opco in ('non_requis','a_deposer','depose','en_instruction','accepte','refuse','a_completer'));

alter table public.dossiers drop constraint if exists dossiers_st_pedago_check;
alter table public.dossiers add  constraint dossiers_st_pedago_check
  check (statut_pedagogique in ('a_planifier','planifiee','en_cours','terminee','abandonnee'));

alter table public.dossiers drop constraint if exists dossiers_st_factu_check;
alter table public.dossiers add  constraint dossiers_st_factu_check
  check (statut_facturation in ('non_facturable','a_facturer','facturee','payee_partiel','payee','impayee'));

create unique index if not exists idx_dossiers_reference on public.dossiers(user_id, reference)
  where reference is not null;


-- ─── Reprise : opco_code depuis le client ─────────────────────────────────
update public.dossiers d
set    opco_code = c.opco
from   public.clients c
where  d.client_id = c.id and d.opco_code is null;

-- ─── Reprise : axes de statut depuis le statut historique ─────────────────
update public.dossiers set
  statut_commercial = case statut
      when 'devis_fait' then 'brouillon'
      when 'devis_envoye' then 'devis_envoye'
      else 'devis_signe' end,
  statut_opco = case statut
      when 'devis_fait' then 'a_deposer'
      when 'devis_envoye' then 'a_deposer'
      when 'devis_signe' then 'a_deposer'
      else 'accepte' end,
  statut_pedagogique = case statut
      when 'formation_en_cours' then 'en_cours'
      when 'paye' then 'terminee'
      when 'accepte_opco' then 'planifiee'
      else 'a_planifier' end,
  statut_facturation = case statut
      when 'paye' then 'payee'
      when 'formation_en_cours' then 'a_facturer'
      else 'non_facturable' end
where statut_commercial = 'brouillon'
  and statut_opco = 'a_deposer'
  and statut_pedagogique = 'a_planifier'
  and statut_facturation = 'non_facturable'
  and statut <> 'devis_fait';


-- ─── Synchronisation bidirectionnelle avec la colonne statut historique ───
create or replace function public.fn_sync_statut_dossier()
returns trigger language plpgsql as $$
begin
  -- Cas 1 : le front met à jour l'ancienne colonne statut → on répercute sur les axes
  if TG_OP = 'UPDATE'
     and new.statut is distinct from old.statut
     and new.statut_commercial  is not distinct from old.statut_commercial
     and new.statut_opco        is not distinct from old.statut_opco
     and new.statut_pedagogique is not distinct from old.statut_pedagogique
     and new.statut_facturation is not distinct from old.statut_facturation
  then
    new.statut_commercial := case new.statut
      when 'devis_fait' then 'brouillon'
      when 'devis_envoye' then 'devis_envoye'
      else 'devis_signe' end;
    new.statut_opco := case new.statut
      when 'devis_fait' then 'a_deposer'
      when 'devis_envoye' then 'a_deposer'
      when 'devis_signe' then 'a_deposer'
      else 'accepte' end;
    new.statut_pedagogique := case new.statut
      when 'formation_en_cours' then 'en_cours'
      when 'paye' then 'terminee'
      when 'accepte_opco' then 'planifiee'
      else 'a_planifier' end;
    new.statut_facturation := case new.statut
      when 'paye' then 'payee'
      when 'formation_en_cours' then 'a_facturer'
      else 'non_facturable' end;
    return new;
  end if;

  -- Cas 2 : les axes pilotent → on recalcule la colonne historique
  new.statut := case
    when new.statut_facturation = 'payee'         then 'paye'
    when new.statut_pedagogique = 'en_cours'      then 'formation_en_cours'
    when new.statut_opco        = 'accepte'       then 'accepte_opco'
    when new.statut_commercial  = 'devis_signe'   then 'devis_signe'
    when new.statut_commercial  = 'devis_envoye'  then 'devis_envoye'
    else 'devis_fait' end;

  return new;
end;
$$;

drop trigger if exists trg_dossiers_sync_statut on public.dossiers;
create trigger trg_dossiers_sync_statut
  before insert or update on public.dossiers
  for each row execute function public.fn_sync_statut_dossier();


-- ════════════════════════════════════════════════════════════════════════════
--  8. STAGIAIRES — sortir dossiers.salaries du jsonb
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.stagiaires (
  id                     uuid default gen_random_uuid() primary key,
  user_id                uuid references auth.users(id)      on delete cascade not null,
  dossier_id             uuid references public.dossiers(id) on delete cascade not null,
  prenom                 text,
  nom                    text,
  email                  text,
  telephone              text,
  poste                  text,
  statut                 text default 'inscrit' not null,
  besoin_adaptation      boolean default false not null,
  detail_adaptation      text,
  attestation_generee_le timestamptz,
  cree_le                timestamptz default now() not null,
  constraint stagiaires_statut_check
    check (statut in ('inscrit','present','partiel','absent','abandon'))
);

comment on table public.stagiaires is
  'Un participant par ligne — permet émargement, évaluation individuelle,
   attestation nominative et comptage des heures-stagiaires pour le BPF';
comment on column public.stagiaires.besoin_adaptation is
  'Accessibilité / situation de handicap — indicateur Qualiopi 26';

-- Reprise des données jsonb existantes
insert into public.stagiaires (user_id, dossier_id, prenom, nom, poste)
select d.user_id, d.id,
       nullif(trim(s->>'firstName'), ''),
       nullif(trim(s->>'lastName'),  ''),
       nullif(trim(s->>'poste'),     '')
from   public.dossiers d
cross join lateral jsonb_array_elements(d.salaries) as s
where  jsonb_typeof(d.salaries) = 'array'
  and  coalesce(trim(s->>'firstName'), trim(s->>'lastName'), '') <> ''
  and  not exists (select 1 from public.stagiaires st where st.dossier_id = d.id);


-- ════════════════════════════════════════════════════════════════════════════
--  9. SESSIONS — sortir dossiers.dates_formation du jsonb
--     Une ligne par journée : c'est la maille de l'émargement et du BPF
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.sessions (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid references auth.users(id)      on delete cascade not null,
  dossier_id    uuid references public.dossiers(id) on delete cascade not null,
  date_session  date not null,
  heure_debut   time default '09:00' not null,
  heure_fin     time default '17:00' not null,
  duree_heures  numeric(5,2) default 7 not null,
  lieu          text,
  modalite      text default 'presentiel' not null,
  formateur_id  uuid references public.formateurs(id) on delete set null,
  emargement_token text default encode(gen_random_bytes(16), 'hex') not null,
  statut        text default 'planifiee' not null,
  cree_le       timestamptz default now() not null,
  constraint sessions_modalite_check check (modalite in ('presentiel','distanciel','mixte')),
  constraint sessions_statut_check   check (statut in ('planifiee','realisee','annulee','reportee')),
  unique (dossier_id, date_session, heure_debut)
);

comment on column public.sessions.emargement_token is
  'Jeton du lien / QR code d''émargement numérique — signature horodatée sur tablette';

-- Reprise des périodes jsonb → une session par jour ouvré
with periodes as (
  select d.user_id,
         d.id as dossier_id,
         public.fn_safe_date(p->>'start') as debut,
         coalesce(public.fn_safe_date(p->>'end'),
                  public.fn_safe_date(p->>'start')) as fin
  from   public.dossiers d
  cross join lateral jsonb_array_elements(d.dates_formation) as p
  where  jsonb_typeof(d.dates_formation) = 'array'
),
valides as (
  select * from periodes
  where debut is not null and fin is not null and fin >= debut and fin < debut + 400
)
insert into public.sessions (user_id, dossier_id, date_session)
select v.user_id, v.dossier_id, g::date
from   valides v
cross join lateral generate_series(v.debut, v.fin, interval '1 day') as g
where  extract(isodow from g) < 6
  and  not exists (select 1 from public.sessions s where s.dossier_id = v.dossier_id)
on conflict (dossier_id, date_session, heure_debut) do nothing;

-- Renseigner la durée des dossiers dépourvus de durée
update public.dossiers d
set    duree_heures = agg.total
from  (select dossier_id, sum(duree_heures) as total
       from public.sessions group by dossier_id) agg
where  d.id = agg.dossier_id and d.duree_heures is null;


-- ════════════════════════════════════════════════════════════════════════════
--  10. ÉMARGEMENTS — la preuve qui déclenche le paiement OPCO
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.emargements (
  id             uuid default gen_random_uuid() primary key,
  user_id        uuid references auth.users(id)         on delete cascade not null,
  session_id     uuid references public.sessions(id)    on delete cascade not null,
  stagiaire_id   uuid references public.stagiaires(id)  on delete cascade not null,
  demi_journee   text default 'matin' not null,
  present        boolean,
  signature_data text,                       -- data:image/png;base64 (tracé)
  signe_le       timestamptz,
  motif_absence  text,
  constraint emargements_demi_check check (demi_journee in ('matin','apres_midi')),
  unique (session_id, stagiaire_id, demi_journee)
);

comment on table public.emargements is
  'Émargement numérique par demi-journée — Constructys et OPCO Commerce
   conditionnent le paiement à l''attestation de présence signée';


-- ════════════════════════════════════════════════════════════════════════════
--  11. PIÈCES — checklist par OPCO + coffre documentaire
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.pieces (
  id              uuid default gen_random_uuid() primary key,
  user_id         uuid references auth.users(id)      on delete cascade not null,
  dossier_id      uuid references public.dossiers(id) on delete cascade not null,
  libelle         text not null,
  type_piece      text default 'autre' not null,
  obligatoire     boolean default true  not null,
  statut          text default 'a_fournir' not null,
  storage_path    text,                     -- bucket Supabase Storage
  nom_fichier     text,
  date_reception  date,
  date_envoi      date,
  source          text default 'externe' not null,
  numero          text,
  cree_le         timestamptz default now() not null,
  constraint pieces_statut_check
    check (statut in ('a_fournir','recu','envoye','signe','refuse','non_applicable')),
  constraint pieces_source_check
    check (source in ('genere','externe')),
  unique (dossier_id, libelle)
);

comment on table public.pieces is
  'Checklist générée automatiquement depuis opco_referentiel.documents_requis,
   et archivage des PDF produits (aujourd''hui générés à la volée puis perdus)';

/* Génère la checklist des pièces exigées par l'OPCO du dossier */
create or replace function public.fn_init_pieces_dossier(p_dossier uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid;
  v_opco  text;
  v_n     integer := 0;
begin
  select user_id, coalesce(opco_code, (select opco from public.clients c where c.id = d.client_id))
    into v_uid, v_opco
  from public.dossiers d where d.id = p_dossier;

  if v_uid is null then return 0; end if;

  insert into public.pieces (user_id, dossier_id, libelle, obligatoire, statut)
  select v_uid, p_dossier, doc, true, 'a_fournir'
  from   public.opco_referentiel r,
         lateral jsonb_array_elements_text(r.documents_requis) as doc
  where  r.code = v_opco
  on conflict (dossier_id, libelle) do nothing;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;


-- ════════════════════════════════════════════════════════════════════════════
--  12. ÉCHÉANCES — le rétroplanning automatique
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.echeances (
  id             uuid default gen_random_uuid() primary key,
  user_id        uuid references auth.users(id)      on delete cascade not null,
  dossier_id     uuid references public.dossiers(id) on delete cascade not null,
  type           text not null,
  libelle        text not null,
  date_echeance  date not null,
  criticite      text default 'normale' not null,
  statut         text default 'a_faire' not null,
  auto           boolean default true not null,
  fait_le        timestamptz,
  cree_le        timestamptz default now() not null,
  constraint echeances_criticite_check check (criticite in ('bloquante','haute','normale','basse')),
  constraint echeances_statut_check    check (statut    in ('a_faire','fait','annulee')),
  unique (dossier_id, type)
);

comment on table public.echeances is
  'Rétroplanning déduit du référentiel OPCO et des dates de session.
   C''est le moteur qui transforme l''outil en support quotidien.';

/* Recalcule les échéances d'un dossier */
create or replace function public.fn_generer_echeances(p_dossier uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  d          record;
  v_delai    integer := 0;
  v_strict   boolean := false;
  v_debut    date;
  v_fin      date;
  v_n        integer := 0;
begin
  select * into d from public.dossiers where id = p_dossier;
  if not found then return 0; end if;

  select coalesce(delai_depot_jours, 0), coalesce(delai_strict, false)
    into v_delai, v_strict
  from public.opco_referentiel where code = d.opco_code;

  select min(date_session), max(date_session) into v_debut, v_fin
  from public.sessions where dossier_id = p_dossier;

  -- Dépôt du dossier OPCO
  if v_debut is not null and d.statut_opco in ('a_deposer','a_completer') then
    insert into public.echeances (user_id, dossier_id, type, libelle, date_echeance, criticite)
    values (d.user_id, p_dossier, 'depot_opco',
            format('Déposer le dossier OPCO (démarrage le %s)', to_char(v_debut,'DD/MM/YYYY')),
            v_debut - v_delai,
            case when v_strict then 'bloquante' else 'haute' end)
    on conflict (dossier_id, type) do update
      set date_echeance = excluded.date_echeance,
          libelle       = excluded.libelle,
          criticite     = excluded.criticite
      where public.echeances.statut = 'a_faire';
  end if;

  -- Relance du devis
  if d.date_envoi_devis is not null and d.statut_commercial = 'devis_envoye' then
    insert into public.echeances (user_id, dossier_id, type, libelle, date_echeance, criticite)
    values (d.user_id, p_dossier, 'relance_devis', 'Relancer le devis sans réponse',
            d.date_envoi_devis + 7, 'normale')
    on conflict (dossier_id, type) do nothing;
  end if;

  -- Convocations stagiaires
  if v_debut is not null and d.statut_pedagogique in ('a_planifier','planifiee') then
    insert into public.echeances (user_id, dossier_id, type, libelle, date_echeance, criticite)
    values (d.user_id, p_dossier, 'convocations', 'Envoyer les convocations aux stagiaires',
            v_debut - 10, 'normale')
    on conflict (dossier_id, type) do nothing;
  end if;

  if v_fin is not null then
    -- Émargements à récupérer
    if d.statut_pedagogique <> 'abandonnee' then
      insert into public.echeances (user_id, dossier_id, type, libelle, date_echeance, criticite)
      values (d.user_id, p_dossier, 'emargements', 'Récupérer et archiver les émargements signés',
              v_fin + 1, 'haute')
      on conflict (dossier_id, type) do nothing;
    end if;

    -- Facturation
    if d.statut_facturation in ('non_facturable','a_facturer') then
      insert into public.echeances (user_id, dossier_id, type, libelle, date_echeance, criticite)
      values (d.user_id, p_dossier, 'facturation', 'Facturer la formation terminée',
              v_fin + 1, 'haute')
      on conflict (dossier_id, type) do nothing;
    end if;

    -- Évaluation à froid
    if d.statut_pedagogique in ('planifiee','en_cours','terminee') then
      insert into public.echeances (user_id, dossier_id, type, libelle, date_echeance, criticite)
      values (d.user_id, p_dossier, 'eval_froid', 'Envoyer l''évaluation à froid (J+90)',
              v_fin + 90, 'basse')
      on conflict (dossier_id, type) do nothing;
    end if;
  end if;

  -- Clôture automatique des échéances devenues sans objet
  update public.echeances e
     set statut = 'fait', fait_le = now()
   where e.dossier_id = p_dossier
     and e.statut = 'a_faire'
     and (
       (e.type = 'depot_opco'    and d.statut_opco        not in ('a_deposer','a_completer'))
    or (e.type = 'relance_devis' and d.statut_commercial  <> 'devis_envoye')
    or (e.type = 'facturation'   and d.statut_facturation not in ('non_facturable','a_facturer'))
    or (e.type = 'convocations'  and d.statut_pedagogique not in ('a_planifier','planifiee'))
     );

  select count(*) into v_n from public.echeances where dossier_id = p_dossier;
  return v_n;
end;
$$;

/* Génération automatique à la création / modification d'un dossier ou d'une session */
/* NB : on n'utilise pas « update of <colonnes> », qui se déclenche sur les
   colonnes citées dans la clause SET et non sur celles réellement modifiées.
   Le front actuel écrit uniquement dossiers.statut : la clause WHEN ci-dessous
   compare OLD et NEW et couvre donc les deux styles d'écriture. */

create or replace function public.fn_trg_dossier_init()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.fn_init_pieces_dossier(new.id);
  perform public.fn_generer_echeances(new.id);
  return null;
end;
$$;

create or replace function public.fn_trg_dossier_maj()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.fn_init_pieces_dossier(new.id);
  perform public.fn_generer_echeances(new.id);
  return null;
end;
$$;

create or replace function public.fn_trg_session_maj()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.fn_generer_echeances(new.dossier_id);
  return null;
end;
$$;

drop trigger if exists trg_dossiers_echeances on public.dossiers;
drop trigger if exists trg_dossiers_init      on public.dossiers;
create trigger trg_dossiers_init
  after insert on public.dossiers
  for each row execute function public.fn_trg_dossier_init();

drop trigger if exists trg_dossiers_maj on public.dossiers;
create trigger trg_dossiers_maj
  after update on public.dossiers
  for each row
  when (old.statut             is distinct from new.statut
     or old.statut_opco        is distinct from new.statut_opco
     or old.statut_commercial  is distinct from new.statut_commercial
     or old.statut_pedagogique is distinct from new.statut_pedagogique
     or old.statut_facturation is distinct from new.statut_facturation
     or old.opco_code          is distinct from new.opco_code
     or old.date_envoi_devis   is distinct from new.date_envoi_devis)
  execute function public.fn_trg_dossier_maj();

drop trigger if exists trg_sessions_echeances on public.sessions;
create trigger trg_sessions_echeances
  after insert or update on public.sessions
  for each row execute function public.fn_trg_session_maj();


-- ════════════════════════════════════════════════════════════════════════════
--  13. FINANCEMENTS — un dossier peut combiner plusieurs sources
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.financements (
  id                uuid default gen_random_uuid() primary key,
  user_id           uuid references auth.users(id)      on delete cascade not null,
  dossier_id        uuid references public.dossiers(id) on delete cascade not null,
  source            text not null,
  montant_demande   numeric(10,2) default 0 not null,
  montant_accorde   numeric(10,2) default 0 not null,
  montant_facture   numeric(10,2) default 0 not null,
  montant_encaisse  numeric(10,2) default 0 not null,
  reference         text,
  date_accord       date,
  commentaire       text,
  constraint financements_source_check
    check (source in ('opco','entreprise','cpf','fne','region','pole_emploi','autre'))
);

comment on table public.financements is
  'Le reste à charge entreprise se déduit de prix − montant accordé OPCO.
   Base du prévisionnel de trésorerie.';


-- ════════════════════════════════════════════════════════════════════════════
--  14. FACTURES ET ENCAISSEMENTS
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.factures (
  id               uuid default gen_random_uuid() primary key,
  user_id          uuid references auth.users(id)      on delete cascade not null,
  dossier_id       uuid references public.dossiers(id) on delete set null,
  client_id        uuid references public.clients(id)  on delete set null,
  numero           text not null,
  destinataire     text default 'entreprise' not null,
  date_emission    date default current_date not null,
  date_echeance    date,
  montant_ht       numeric(10,2) default 0 not null,
  taux_tva         numeric(5,2)  default 0 not null,
  montant_ttc      numeric(10,2) default 0 not null,
  montant_encaisse numeric(10,2) default 0 not null,
  date_paiement    date,
  statut           text default 'emise' not null,
  storage_path     text,
  mention_tva      text default 'TVA non applicable — art. 261-4-4° a du CGI',
  cree_le          timestamptz default now() not null,
  constraint factures_statut_check
    check (statut in ('brouillon','emise','relance_1','relance_2','payee_partiel','payee','annulee')),
  constraint factures_destinataire_check
    check (destinataire in ('entreprise','opco','mixte')),
  unique (user_id, numero)
);

comment on column public.factures.numero is
  'Numérotation continue via fn_next_numero(''facture'') — obligation légale';

/* Relances impayés : échéances à J+30 et J+45 */
create or replace function public.fn_trg_facture_echeances()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.dossier_id is null then return null; end if;

  if new.statut in ('emise','relance_1','payee_partiel') then
    insert into public.echeances (user_id, dossier_id, type, libelle, date_echeance, criticite)
    values (new.user_id, new.dossier_id, 'relance_impaye_1',
            format('Relancer la facture %s', new.numero), new.date_emission + 30, 'haute')
    on conflict (dossier_id, type) do nothing;

    insert into public.echeances (user_id, dossier_id, type, libelle, date_echeance, criticite)
    values (new.user_id, new.dossier_id, 'relance_impaye_2',
            format('2e relance facture %s — mise en demeure', new.numero),
            new.date_emission + 45, 'haute')
    on conflict (dossier_id, type) do nothing;

  elsif new.statut = 'payee' then
    update public.echeances
       set statut = 'fait', fait_le = now()
     where dossier_id = new.dossier_id
       and type in ('relance_impaye_1','relance_impaye_2')
       and statut = 'a_faire';
  end if;

  return null;
end;
$$;

drop trigger if exists trg_factures_echeances on public.factures;
create trigger trg_factures_echeances
  after insert or update of statut on public.factures
  for each row execute function public.fn_trg_facture_echeances();


-- ════════════════════════════════════════════════════════════════════════════
--  15. ÉVALUATIONS — indicateurs Qualiopi 11, 30, 31
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.evaluations (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid references auth.users(id)         on delete cascade not null,
  dossier_id    uuid references public.dossiers(id)    on delete cascade not null,
  stagiaire_id  uuid references public.stagiaires(id)  on delete cascade,
  type          text not null,
  token         text default encode(gen_random_bytes(16), 'hex') not null unique,
  date_envoi    date,
  date_reponse  date,
  note_globale  integer,
  reponses      jsonb default '{}'::jsonb not null,
  commentaire   text,
  constraint evaluations_type_check check (type in ('chaud','froid','prescripteur','formateur')),
  constraint evaluations_note_check check (note_globale is null or note_globale between 0 and 10)
);

comment on column public.evaluations.token is
  'Lien public tokenisé envoyé au stagiaire — pas de compte à créer';


-- ════════════════════════════════════════════════════════════════════════════
--  16. RÉCLAMATIONS ET ALÉAS — registre obligatoire (indicateur 31)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.reclamations (
  id             uuid default gen_random_uuid() primary key,
  user_id        uuid references auth.users(id)      on delete cascade not null,
  dossier_id     uuid references public.dossiers(id) on delete set null,
  client_id      uuid references public.clients(id)  on delete set null,
  date_reception date default current_date not null,
  origine        text default 'stagiaire' not null,
  nature         text default 'reclamation' not null,
  description    text not null,
  traitement     text,
  action_corrective text,
  statut         text default 'ouverte' not null,
  date_cloture   date,
  constraint reclamations_statut_check  check (statut  in ('ouverte','en_cours','cloturee')),
  constraint reclamations_nature_check  check (nature  in ('reclamation','alea','suggestion')),
  constraint reclamations_origine_check check (origine in ('stagiaire','entreprise','formateur','opco','autre'))
);


-- ════════════════════════════════════════════════════════════════════════════
--  17. VEILLE (indicateurs 23-25) ET HISTORIQUE
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.veille (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references auth.users(id) on delete cascade not null,
  date_veille date default current_date not null,
  type        text default 'legale' not null,
  source      text,
  resume      text not null,
  impact      text,
  action      text,
  constraint veille_type_check check (type in ('legale','metier','pedagogique','handicap'))
);

create table if not exists public.historique (
  id          bigserial primary key,
  user_id     uuid,
  table_nom   text not null,
  record_id   uuid,
  action      text not null,
  diff        jsonb,
  cree_le     timestamptz default now() not null
);

create or replace function public.fn_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_diff jsonb;
begin
  if TG_OP = 'UPDATE' then
    select jsonb_object_agg(n.key, jsonb_build_object('avant', o.value, 'apres', n.value))
      into v_diff
    from jsonb_each(to_jsonb(new)) n
    join jsonb_each(to_jsonb(old)) o on o.key = n.key
    where n.value is distinct from o.value
      and n.key not in ('modifie_le');
    if v_diff is null then return null; end if;
  elsif TG_OP = 'DELETE' then
    v_diff := to_jsonb(old);
  else
    v_diff := to_jsonb(new);
  end if;

  insert into public.historique (user_id, table_nom, record_id, action, diff)
  values (auth.uid(), TG_TABLE_NAME,
          coalesce((case when TG_OP = 'DELETE' then old.id else new.id end)),
          TG_OP, v_diff);
  return null;
end;
$$;

drop trigger if exists trg_audit_dossiers on public.dossiers;
create trigger trg_audit_dossiers
  after insert or update or delete on public.dossiers
  for each row execute function public.fn_audit();

drop trigger if exists trg_audit_factures on public.factures;
create trigger trg_audit_factures
  after insert or update or delete on public.factures
  for each row execute function public.fn_audit();


-- ════════════════════════════════════════════════════════════════════════════
--  18. SIMULATEUR DE PRISE EN CHARGE
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.fn_simuler_prise_en_charge(
  p_opco       text,
  p_effectif   integer,
  p_heures     numeric,
  p_stagiaires integer default 1,
  p_prix       numeric default 0,
  p_dispositif text default null
)
returns table (
  dispositif        text,
  taux_horaire_max  numeric,
  prise_en_charge   numeric,
  plafond_applique  numeric,
  reste_a_charge    numeric,
  prioritaire       boolean,
  note              text
)
language sql stable as $$
  with base as (
    select p.dispositif,
           p.taux_horaire_max,
           p.montant_jour_stagiaire,
           p.plafond_formation,
           p.pourcentage_max,
           p.prioritaire,
           p.note,
           coalesce(
             p.pourcentage_max * p_prix / 100.0,
             p.montant_jour_stagiaire * ceil(p_heures / 7.0) * greatest(p_stagiaires, 1),
             p.taux_horaire_max * p_heures * greatest(p_stagiaires, 1)
           ) as brut
    from public.opco_plafonds p
    where p.opco_code = p_opco
      and coalesce(p_effectif, 0) >= p.effectif_min
      and (p.effectif_max is null or coalesce(p_effectif, 0) <= p.effectif_max)
      and (p_dispositif is null or p.dispositif = p_dispositif)
  )
  select b.dispositif,
         b.taux_horaire_max,
         round(least(coalesce(b.brut, 0), coalesce(b.plafond_formation, 1e9), p_prix), 2),
         b.plafond_formation,
         round(greatest(p_prix - least(coalesce(b.brut, 0), coalesce(b.plafond_formation, 1e9), p_prix), 0), 2),
         b.prioritaire,
         b.note
  from base b
  order by 3 desc;
$$;

comment on function public.fn_simuler_prise_en_charge is
  'Estime la prise en charge OPCO avant émission du devis.
   Ex. : select * from fn_simuler_prise_en_charge(''akto'', 8, 14, 3, 2000);';


-- ════════════════════════════════════════════════════════════════════════════
--  19. VUES DE PILOTAGE
-- ════════════════════════════════════════════════════════════════════════════

/* Vue 360° d'un dossier — remplace les calculs faits côté navigateur */
create or replace view public.v_dossiers_360
with (security_invoker = true) as
select
  d.id,
  d.user_id,
  d.reference,
  d.client_id,
  c.nom_entreprise,
  c.siret,
  c.nb_salaries,
  c.statut_adhesion_opco,
  coalesce(d.opco_code, c.opco)        as opco_code,
  r.label                              as opco_label,
  r.delai_depot_jours,
  d.sujet_formation,
  d.dispositif,
  d.prix,
  d.duree_heures,
  d.statut,
  d.statut_commercial,
  d.statut_opco,
  d.statut_pedagogique,
  d.statut_facturation,
  d.date_depot_opco,
  d.numero_accord_opco,
  d.montant_accorde,
  s.date_debut,
  s.date_fin,
  s.nb_sessions,
  coalesce(s.heures_reelles, d.duree_heures)              as heures_reelles,
  st.nb_stagiaires,
  coalesce(st.nb_stagiaires, 0) * coalesce(s.heures_reelles, d.duree_heures, 0)
                                                          as heures_stagiaires,
  p.pieces_total,
  p.pieces_ok,
  (p.pieces_total > 0 and p.pieces_ok = p.pieces_total)    as pieces_completes,
  f.montant_facture,
  f.montant_encaisse,
  greatest(coalesce(d.prix, 0) - coalesce(d.montant_accorde, 0), 0) as reste_a_charge,
  greatest(coalesce(f.montant_facture, 0) - coalesce(f.montant_encaisse, 0), 0) as reste_a_encaisser,
  case when s.date_debut is not null
       then (s.date_debut - coalesce(r.delai_depot_jours, 0)) - current_date
  end                                                      as jours_avant_depot_limite,
  (s.date_debut is not null
   and d.statut_opco in ('a_deposer','a_completer')
   and (s.date_debut - coalesce(r.delai_depot_jours, 0)) < current_date)
                                                           as depot_en_retard,
  d.cree_le,
  d.modifie_le
from public.dossiers d
join public.clients c on c.id = d.client_id
left join public.opco_referentiel r on r.code = coalesce(d.opco_code, c.opco)
left join lateral (
  select min(date_session) as date_debut,
         max(date_session) as date_fin,
         count(*)          as nb_sessions,
         sum(duree_heures) as heures_reelles
  from public.sessions where dossier_id = d.id
) s on true
left join lateral (
  select count(*) as nb_stagiaires from public.stagiaires where dossier_id = d.id
) st on true
left join lateral (
  select count(*) filter (where obligatoire)                       as pieces_total,
         count(*) filter (where obligatoire and statut in ('recu','signe','envoye','non_applicable')) as pieces_ok
  from public.pieces where dossier_id = d.id
) p on true
left join lateral (
  select sum(montant_ht)       as montant_facture,
         sum(montant_encaisse) as montant_encaisse
  from public.factures where dossier_id = d.id and statut <> 'annulee'
) f on true;

comment on view public.v_dossiers_360 is
  'Source unique du dashboard et des listes — corrige les agrégats aujourd''hui
   calculés sur les clients au lieu des dossiers (CA affiché à 0 €)';


/* Actions du jour : le seul écran à ouvrir le matin */
create or replace view public.v_actions_du_jour
with (security_invoker = true) as
select
  e.id,
  e.user_id,
  e.dossier_id,
  e.type,
  e.libelle,
  e.date_echeance,
  e.criticite,
  e.date_echeance - current_date as jours_restants,
  case
    when e.date_echeance <  current_date then 'en_retard'
    when e.date_echeance =  current_date then 'aujourd_hui'
    when e.date_echeance <= current_date + 7 then 'cette_semaine'
    else 'a_venir' end          as horizon,
  v.nom_entreprise,
  v.sujet_formation,
  v.opco_label,
  v.reference
from public.echeances e
join public.v_dossiers_360 v on v.id = e.dossier_id
where e.statut = 'a_faire'
order by
  case e.criticite when 'bloquante' then 0 when 'haute' then 1
                   when 'normale' then 2 else 3 end,
  e.date_echeance;


/* Bilan Pédagogique et Financier — pré-remplissage annuel */
create or replace view public.v_bpf
with (security_invoker = true) as
select
  v.user_id,
  extract(year from v.date_fin)::int          as annee,
  count(distinct v.id)                        as nb_actions,
  sum(v.nb_stagiaires)                        as nb_stagiaires,
  sum(v.heures_stagiaires)                    as heures_stagiaires,
  sum(v.prix)                                 as produits_total,
  sum(coalesce(v.montant_accorde, 0))         as produits_opco,
  sum(greatest(v.prix - coalesce(v.montant_accorde, 0), 0)) as produits_entreprises
from public.v_dossiers_360 v
where v.date_fin is not null
  and v.statut_pedagogique in ('terminee','en_cours')
group by v.user_id, extract(year from v.date_fin);

comment on view public.v_bpf is
  'Bilan Pédagogique et Financier — à déposer avant le 31 mai.
   Deux jours de travail annuel remplacés par une requête.';


-- ════════════════════════════════════════════════════════════════════════════
--  20. INDEX
-- ════════════════════════════════════════════════════════════════════════════
create index if not exists idx_dossiers_opco_code    on public.dossiers(opco_code);
create index if not exists idx_dossiers_st_opco      on public.dossiers(user_id, statut_opco);
create index if not exists idx_dossiers_st_factu     on public.dossiers(user_id, statut_facturation);
create index if not exists idx_dossiers_st_pedago    on public.dossiers(user_id, statut_pedagogique);
create index if not exists idx_clients_siret         on public.clients(siret);
create index if not exists idx_stagiaires_dossier    on public.stagiaires(dossier_id);
create index if not exists idx_stagiaires_user       on public.stagiaires(user_id);
create index if not exists idx_sessions_dossier      on public.sessions(dossier_id);
create index if not exists idx_sessions_date         on public.sessions(user_id, date_session);
create index if not exists idx_emargements_session   on public.emargements(session_id);
create index if not exists idx_pieces_dossier        on public.pieces(dossier_id);
create index if not exists idx_echeances_user_date   on public.echeances(user_id, statut, date_echeance);
create index if not exists idx_echeances_dossier     on public.echeances(dossier_id);
create index if not exists idx_financements_dossier  on public.financements(dossier_id);
create index if not exists idx_factures_user_statut  on public.factures(user_id, statut);
create index if not exists idx_factures_dossier      on public.factures(dossier_id);
create index if not exists idx_evaluations_dossier   on public.evaluations(dossier_id);
create index if not exists idx_reclamations_user     on public.reclamations(user_id, statut);
create index if not exists idx_plafonds_opco         on public.opco_plafonds(opco_code, annee);
create index if not exists idx_historique_record     on public.historique(table_nom, record_id);


-- ════════════════════════════════════════════════════════════════════════════
--  21. ROW LEVEL SECURITY
-- ════════════════════════════════════════════════════════════════════════════
do $$
declare t text;
begin
  foreach t in array array[
    'formateurs','formations_catalogue','stagiaires','sessions','pieces',
    'echeances','financements','factures','evaluations','reclamations',
    'veille','compteurs','historique'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_own', t);
    execute format(
      'create policy %I on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t || '_own', t);
  end loop;
end $$;

-- Émargements : pas de user_id direct, on passe par la session
alter table public.emargements enable row level security;
drop policy if exists emargements_own on public.emargements;
create policy emargements_own on public.emargements
  for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Référentiels : lecture pour tout utilisateur connecté, écriture idem (outil interne)
alter table public.opco_referentiel enable row level security;
alter table public.opco_plafonds    enable row level security;

drop policy if exists opco_ref_read on public.opco_referentiel;
create policy opco_ref_read on public.opco_referentiel
  for all to authenticated using (true) with check (true);

drop policy if exists opco_plafonds_read on public.opco_plafonds;
create policy opco_plafonds_read on public.opco_plafonds
  for all to authenticated using (true) with check (true);


-- ════════════════════════════════════════════════════════════════════════════
--  22. INITIALISATION DES DOSSIERS EXISTANTS
--      Génère rétroactivement pièces et échéances
-- ════════════════════════════════════════════════════════════════════════════
do $$
declare r record;
begin
  for r in select id from public.dossiers loop
    perform public.fn_init_pieces_dossier(r.id);
    perform public.fn_generer_echeances(r.id);
  end loop;
end $$;


-- ════════════════════════════════════════════════════════════════════════════
--  23. VÉRIFICATION
-- ════════════════════════════════════════════════════════════════════════════
select 'Tables créées' as controle, count(*)::text as valeur
from information_schema.tables
where table_schema = 'public'
  and table_name in ('opco_referentiel','opco_plafonds','formateurs','formations_catalogue',
                     'stagiaires','sessions','emargements','pieces','echeances',
                     'financements','factures','evaluations','reclamations','veille',
                     'compteurs','historique')
union all
select 'Stagiaires repris depuis jsonb', count(*)::text from public.stagiaires
union all
select 'Sessions reprises depuis jsonb', count(*)::text from public.sessions
union all
select 'Échéances générées',             count(*)::text from public.echeances
union all
select 'Pièces en checklist',            count(*)::text from public.pieces
union all
select 'Barèmes OPCO chargés',           count(*)::text from public.opco_plafonds;

-- ════════════════════════════════════════════════════════════════════════════
--  APRÈS EXÉCUTION — à faire côté application
--   1. Créer le bucket Supabase Storage « documents » (privé) pour pieces.storage_path
--   2. Remplacer Documents._docNum() par un appel RPC à fn_next_numero()
--   3. Brancher le dashboard sur v_dossiers_360 et v_actions_du_jour
--   4. Protéger /api/ai : vérifier le JWT Supabase et restreindre le CORS
--   5. Planifier un pg_cron quotidien qui envoie le récapitulatif des échéances
-- ════════════════════════════════════════════════════════════════════════════
