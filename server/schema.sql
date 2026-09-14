-- DHL Airfield Risk Assessment PWA — self-hosted Postgres schema
-- Replaces the old Supabase-managed schema + supabase_migration.sql.
-- Run once against a fresh database: psql "$DATABASE_URL" -f schema.sql

create extension if not exists pgcrypto;

create table if not exists profiles (
  id            uuid primary key default gen_random_uuid(),
  email         text unique not null,
  password_hash text not null,
  full_name     text,
  department    text,
  created_at    timestamptz not null default now()
);

create table if not exists airfields (
  id                     uuid primary key default gen_random_uuid(),
  icao                   text not null,
  iata                   text,
  name                   text not null,
  country                text,
  operations_type        text,
  status                 text default 'In Progress',
  slot_requirements      text,
  operating_hours        text,
  elevation_ft           integer,
  msa_25nm_ft            integer,
  max_obstacle_ft        integer,
  max_runway_designation text,
  pcn                    text,
  ils_approaches         text,
  nav_vor                boolean default false,
  nav_rnav               boolean default false,
  nav_rnp                boolean default false,
  nav_gnss               boolean default false,
  nav_loc                boolean default false,
  nav_ndb                boolean default false,
  date_request           date,
  date_flight_support    date,
  date_preparation       date,
  date_eng_safety        date,
  date_final_approval    date,
  date_fop_complete      date,
  lvops_available        boolean default false,
  lvops_details          text,
  airport_of_entry       boolean default false,
  aip_available           boolean default false,
  gigsky_coverage        text,
  ops_data_readiness     text default 'Pending',
  catb_b757              text,
  catb_b767              text,
  catb_b777              text,
  created_at             timestamptz not null default now()
);

create table if not exists runways (
  id                   uuid primary key default gen_random_uuid(),
  airfield_id          uuid not null references airfields(id) on delete cascade,
  designator           text,
  length               integer,
  width                integer,
  pcn                  text,
  approach_lighting    text default 'None',
  ils_cat1             boolean default false,
  ils_cat2             boolean default false,
  ils_cat3             boolean default false,
  nav_vor              boolean default false,
  nav_rnav             boolean default false,
  nav_rnp              boolean default false,
  nav_circling         boolean default false,
  nav_gnss             boolean default false,
  nav_loc              boolean default false,
  nav_ndb              boolean default false,
  weight_b757_mtow     integer,
  weight_b757_mlw      integer,
  weight_b757_mtw      integer,
  weight_b757_max_twy  integer,
  weight_b767_mtow     integer,
  weight_b767_mlw      integer,
  weight_b767_mtw      integer,
  weight_b767_max_twy  integer,
  weight_b777_mtow     integer,
  weight_b777_mlw      integer,
  weight_b777_mtw      integer,
  weight_b777_max_twy  integer,
  sort_order           integer default 0
);

-- shared columns across the five department assessment tables
create table if not exists fss_assessments (
  id                          uuid primary key default gen_random_uuid(),
  airfield_id                 uuid not null references airfields(id) on delete cascade,
  updated_by                  uuid references profiles(id),
  dfs_status                  integer default 0,
  signed_by                   uuid references profiles(id),
  signed_at                   timestamptz,
  simultaneous_runway_ops     boolean default false,
  ats_ground_movement         boolean default false,
  rff_category                text default '9',
  rff_hours                   text,
  wildlife_hazard             text,
  fmc_b757                    text,
  fmc_b767                    text,
  fmc_b777                    text,
  lido_ipad                   boolean default false,
  paper_backup                boolean default false,
  taws_b757                   boolean default false,
  taws_b767                   boolean default false,
  taws_b777                   boolean default false,
  raas_b757                   boolean default false,
  raas_b767                   boolean default false,
  raas_b777                   boolean default false,
  runway_restrictions         text,
  taxiway_restrictions        text,
  apron_restrictions          text,
  fleet_limitations           text,
  additional_comments         text
);

create table if not exists gop_assessments (
  id                       uuid primary key default gen_random_uuid(),
  airfield_id              uuid not null references airfields(id) on delete cascade,
  updated_by               uuid references profiles(id),
  dfs_status               integer default 0,
  signed_by                uuid references profiles(id),
  signed_at                timestamptz,
  dhl_network_station      boolean default false,
  dhl_supervised           boolean default false,
  sgha_in_place            boolean default false,
  sable_system             boolean default false,
  supervision_requirements text,
  loading_docs_producer    text,
  loading_docs_deliverer   text,
  loadmaster_required      boolean default false,
  catering                 boolean default false,
  disinsection             boolean default false,
  crew_transit             boolean default false,
  jumpseat_available       boolean default false,
  fuel_arrangements        text,
  immigration_visa         text,
  innoculation             text,
  isos_country_report      text,
  isos_city_report         text,
  iata_fuel_quality        text,
  deice_quality_pool       text,
  airport_info_directory   text,
  dhl_quality_audit        text,
  country_reporting        text,
  global_security_report   text,
  dhl_security_assessment  text,
  acc3_validation          text default 'Pending',
  acc3_notes               text,
  dg_approved              boolean default false
);

create table if not exists safety_assessments (
  id                  uuid primary key default gen_random_uuid(),
  airfield_id         uuid not null references airfields(id) on delete cascade,
  updated_by          uuid references profiles(id),
  dfs_status          integer default 0,
  signed_by           uuid references profiles(id),
  signed_at           timestamptz,
  ra_completed        text default 'Pending',
  ra_form_attach      text,
  safety_comments     text,
  uncontrolled_ra     text,
  additional_ra_1     text,
  additional_ra_2     text,
  additional_ra_3     text,
  supporting_documents text
);

create table if not exists eng_assessments (
  id                       uuid primary key default gen_random_uuid(),
  airfield_id              uuid not null references airfields(id) on delete cascade,
  updated_by               uuid references profiles(id),
  dfs_status               integer default 0,
  signed_by                uuid references profiles(id),
  signed_at                timestamptz,
  eng_support_available    boolean default false,
  flying_spanner_required  boolean default false,
  spanner_available        boolean default false,
  eng_contact              text,
  support_provider         text,
  contact_details          text,
  eng_comments             text
);

create table if not exists mgt_assessments (
  id                   uuid primary key default gen_random_uuid(),
  airfield_id          uuid not null references airfields(id) on delete cascade,
  updated_by           uuid references profiles(id),
  dfs_status           integer default 0,
  signed_by            uuid references profiles(id),
  signed_at            timestamptz,
  management_comments  text,
  mgt_notes            text,
  approved_by_mgt      boolean default false
);

create table if not exists record_locks (
  id          uuid primary key default gen_random_uuid(),
  airfield_id uuid not null references airfields(id) on delete cascade,
  department  text not null,
  locked_by   uuid not null references profiles(id),
  expires_at  timestamptz not null
);

create table if not exists chat_messages (
  id          uuid primary key default gen_random_uuid(),
  sender_id   uuid not null references profiles(id),
  message     text not null,
  airfield_id uuid references airfields(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists webrtc_signals (
  id          uuid primary key default gen_random_uuid(),
  from_user   uuid not null references profiles(id),
  to_user     uuid not null references profiles(id),
  signal_type text not null,
  payload     jsonb,
  created_at  timestamptz not null default now()
);

create or replace function clean_expired_locks() returns void as $$
  delete from record_locks where expires_at < now();
$$ language sql;
