// Run once to create/update tables: node migrate.js
import { db } from './db.js'

db.exec(`
CREATE TABLE IF NOT EXISTS profiles (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random())%4+1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name     TEXT,
  department    TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS airfields (
  id                     TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random())%4+1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  icao                   TEXT NOT NULL,
  iata                   TEXT,
  name                   TEXT NOT NULL,
  country                TEXT,
  operations_type        TEXT,
  status                 TEXT DEFAULT 'In Progress',
  slot_requirements      TEXT,
  operating_hours        TEXT,
  elevation_ft           INTEGER,
  msa_25nm_ft            INTEGER,
  max_obstacle_ft        INTEGER,
  max_runway_designation TEXT,
  pcn                    TEXT,
  ils_approaches         TEXT,
  nav_vor                INTEGER DEFAULT 0,
  nav_rnav               INTEGER DEFAULT 0,
  nav_rnp                INTEGER DEFAULT 0,
  nav_gnss               INTEGER DEFAULT 0,
  nav_loc                INTEGER DEFAULT 0,
  nav_ndb                INTEGER DEFAULT 0,
  date_request           TEXT,
  date_flight_support    TEXT,
  date_preparation       TEXT,
  date_eng_safety        TEXT,
  date_final_approval    TEXT,
  date_fop_complete      TEXT,
  lvops_available        INTEGER DEFAULT 0,
  lvops_details          TEXT,
  airport_of_entry       INTEGER DEFAULT 0,
  aip_available          INTEGER DEFAULT 0,
  gigsky_coverage        TEXT,
  ops_data_readiness     TEXT DEFAULT 'Pending',
  catb_b757              TEXT,
  catb_b767              TEXT,
  catb_b777              TEXT,
  created_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS runways (
  id                   TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random())%4+1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  airfield_id          TEXT NOT NULL REFERENCES airfields(id) ON DELETE CASCADE,
  designator           TEXT,
  length               INTEGER,
  width                INTEGER,
  pcn                  TEXT,
  approach_lighting    TEXT DEFAULT 'None',
  ils_cat1             INTEGER DEFAULT 0,
  ils_cat2             INTEGER DEFAULT 0,
  ils_cat3             INTEGER DEFAULT 0,
  nav_vor              INTEGER DEFAULT 0,
  nav_rnav             INTEGER DEFAULT 0,
  nav_rnp              INTEGER DEFAULT 0,
  nav_circling         INTEGER DEFAULT 0,
  nav_gnss             INTEGER DEFAULT 0,
  nav_loc              INTEGER DEFAULT 0,
  nav_ndb              INTEGER DEFAULT 0,
  weight_b757_mtow     INTEGER,
  weight_b757_mlw      INTEGER,
  weight_b757_mtw      INTEGER,
  weight_b757_max_twy  INTEGER,
  weight_b767_mtow     INTEGER,
  weight_b767_mlw      INTEGER,
  weight_b767_mtw      INTEGER,
  weight_b767_max_twy  INTEGER,
  weight_b777_mtow     INTEGER,
  weight_b777_mlw      INTEGER,
  weight_b777_mtw      INTEGER,
  weight_b777_max_twy  INTEGER,
  sort_order           INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS fss_assessments (
  id                          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random())%4+1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  airfield_id                 TEXT NOT NULL REFERENCES airfields(id) ON DELETE CASCADE,
  updated_by                  TEXT REFERENCES profiles(id),
  dfs_status                  INTEGER DEFAULT 0,
  signed_by                   TEXT REFERENCES profiles(id),
  signed_at                   TEXT,
  simultaneous_runway_ops     INTEGER DEFAULT 0,
  ats_ground_movement         INTEGER DEFAULT 0,
  rff_category                TEXT DEFAULT '9',
  rff_hours                   TEXT,
  wildlife_hazard             TEXT,
  fmc_b757                    TEXT,
  fmc_b767                    TEXT,
  fmc_b777                    TEXT,
  lido_ipad                   INTEGER DEFAULT 0,
  paper_backup                INTEGER DEFAULT 0,
  taws_b757                   INTEGER DEFAULT 0,
  taws_b767                   INTEGER DEFAULT 0,
  taws_b777                   INTEGER DEFAULT 0,
  raas_b757                   INTEGER DEFAULT 0,
  raas_b767                   INTEGER DEFAULT 0,
  raas_b777                   INTEGER DEFAULT 0,
  runway_restrictions         TEXT,
  taxiway_restrictions        TEXT,
  apron_restrictions          TEXT,
  fleet_limitations           TEXT,
  additional_comments         TEXT
);

CREATE TABLE IF NOT EXISTS gop_assessments (
  id                       TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random())%4+1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  airfield_id              TEXT NOT NULL REFERENCES airfields(id) ON DELETE CASCADE,
  updated_by               TEXT REFERENCES profiles(id),
  dfs_status               INTEGER DEFAULT 0,
  signed_by                TEXT REFERENCES profiles(id),
  signed_at                TEXT,
  dhl_network_station      INTEGER DEFAULT 0,
  dhl_supervised           INTEGER DEFAULT 0,
  sgha_in_place            INTEGER DEFAULT 0,
  sable_system             INTEGER DEFAULT 0,
  supervision_requirements TEXT,
  loading_docs_producer    TEXT,
  loading_docs_deliverer   TEXT,
  loadmaster_required      INTEGER DEFAULT 0,
  catering                 INTEGER DEFAULT 0,
  disinsection             INTEGER DEFAULT 0,
  crew_transit             INTEGER DEFAULT 0,
  jumpseat_available       INTEGER DEFAULT 0,
  fuel_arrangements        TEXT,
  immigration_visa         TEXT,
  innoculation             TEXT,
  isos_country_report      TEXT,
  isos_city_report         TEXT,
  iata_fuel_quality        TEXT,
  deice_quality_pool       TEXT,
  airport_info_directory   TEXT,
  dhl_quality_audit        TEXT,
  country_reporting        TEXT,
  global_security_report   TEXT,
  dhl_security_assessment  TEXT,
  acc3_validation          TEXT DEFAULT 'Pending',
  acc3_notes               TEXT,
  dg_approved              INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS safety_assessments (
  id                  TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random())%4+1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  airfield_id         TEXT NOT NULL REFERENCES airfields(id) ON DELETE CASCADE,
  updated_by          TEXT REFERENCES profiles(id),
  dfs_status          INTEGER DEFAULT 0,
  signed_by           TEXT REFERENCES profiles(id),
  signed_at           TEXT,
  ra_completed        TEXT DEFAULT 'Pending',
  ra_form_attach      TEXT,
  safety_comments     TEXT,
  uncontrolled_ra     TEXT,
  additional_ra_1     TEXT,
  additional_ra_2     TEXT,
  additional_ra_3     TEXT,
  supporting_documents TEXT
);

CREATE TABLE IF NOT EXISTS eng_assessments (
  id                       TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random())%4+1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  airfield_id              TEXT NOT NULL REFERENCES airfields(id) ON DELETE CASCADE,
  updated_by               TEXT REFERENCES profiles(id),
  dfs_status               INTEGER DEFAULT 0,
  signed_by                TEXT REFERENCES profiles(id),
  signed_at                TEXT,
  eng_support_available    INTEGER DEFAULT 0,
  flying_spanner_required  INTEGER DEFAULT 0,
  spanner_available        INTEGER DEFAULT 0,
  eng_contact              TEXT,
  support_provider         TEXT,
  contact_details          TEXT,
  eng_comments             TEXT
);

CREATE TABLE IF NOT EXISTS mgt_assessments (
  id                   TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random())%4+1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  airfield_id          TEXT NOT NULL REFERENCES airfields(id) ON DELETE CASCADE,
  updated_by           TEXT REFERENCES profiles(id),
  dfs_status           INTEGER DEFAULT 0,
  signed_by            TEXT REFERENCES profiles(id),
  signed_at            TEXT,
  management_comments  TEXT,
  mgt_notes            TEXT,
  approved_by_mgt      INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS record_locks (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random())%4+1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  airfield_id TEXT NOT NULL REFERENCES airfields(id) ON DELETE CASCADE,
  department  TEXT NOT NULL,
  locked_by   TEXT NOT NULL REFERENCES profiles(id),
  expires_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random())%4+1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  sender_id   TEXT NOT NULL REFERENCES profiles(id),
  message     TEXT NOT NULL,
  airfield_id TEXT REFERENCES airfields(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS webrtc_signals (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random())%4+1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  from_user   TEXT NOT NULL REFERENCES profiles(id),
  to_user     TEXT NOT NULL REFERENCES profiles(id),
  signal_type TEXT NOT NULL,
  payload     TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS rie_records (
  id                     TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random())%4+1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  ref_number             TEXT UNIQUE NOT NULL,
  aircraft_registration  TEXT NOT NULL,
  aircraft_type          TEXT NOT NULL,
  mel_item_ref           TEXT NOT NULL,
  mel_chapter_title      TEXT,
  defect_description     TEXT NOT NULL,
  mel_category           TEXT NOT NULL CHECK(mel_category IN ('B','C','D')),
  date_defect_found      TEXT NOT NULL,
  date_mel_start         TEXT NOT NULL,
  mel_interval_expiry    TEXT NOT NULL,
  extension_days         INTEGER NOT NULL DEFAULT 1,
  extension_expiry       TEXT NOT NULL,
  extension_reason       TEXT NOT NULL,
  additional_limitations TEXT,
  mcc_reference          TEXT,
  status                 TEXT NOT NULL DEFAULT 'Draft'
                           CHECK(status IN ('Draft','Pending Manager','Authorised','Submitted to FOI','Closed')),
  applicant_id           TEXT REFERENCES profiles(id),
  applicant_name         TEXT,
  applicant_signed_at    TEXT,
  applicant_signature    TEXT,
  manager_id             TEXT REFERENCES profiles(id),
  manager_name           TEXT,
  manager_signed_at      TEXT,
  manager_signature      TEXT,
  foi_due_at             TEXT,
  foi_submitted_at       TEXT,
  created_by             TEXT NOT NULL REFERENCES profiles(id),
  created_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
`)

console.log('Migration complete.')
