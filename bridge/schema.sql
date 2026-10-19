-- DSIS Archangel local MySQL schema
-- Database: archangel
-- All tables keyed by servid (AE server) + user_id where relevant.

CREATE DATABASE IF NOT EXISTS archangel CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE archangel;

CREATE TABLE IF NOT EXISTS servers (
  servid        INT PRIMARY KEY,
  server_name   VARCHAR(32) NOT NULL,
  galaxy_data   JSON NULL
) ENGINE=InnoDB;

-- storage packets: preferences (type 0), random/bookmarks/spy (1), activescout (2)
CREATE TABLE IF NOT EXISTS storage_packets (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  servid        INT NOT NULL,
  user_id       BIGINT NOT NULL,
  storage_key   VARCHAR(64) NOT NULL,
  storage_type  TINYINT NOT NULL DEFAULT 1,
  storage_data  JSON NOT NULL,
  updated_at    TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_packet (servid, user_id, storage_key)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS bases (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  servid         INT NOT NULL,
  user_id        BIGINT NOT NULL,
  coords         CHAR(12) NOT NULL,
  base_id        BIGINT NULL,
  base_name      VARCHAR(64) NULL,
  owner_id       BIGINT NULL,
  owner_name     VARCHAR(64) NULL,
  owner_level    DECIMAL(6,2) NULL,
  owner_guild_tag VARCHAR(8) NULL,
  occupier_id    BIGINT NULL,
  occupier_name  VARCHAR(64) NULL,
  occupier_level DECIMAL(6,2) NULL,
  occupier_guild_tag VARCHAR(8) NULL,
  terrain        VARCHAR(32) NULL,
  debris         BIGINT NULL,
  -- recorded/scout astro attributes (present on scout "Recorded data" pages
  -- and on live pages; a live-eye capture may fill some of these too)
  astro_type     VARCHAR(32) NULL,
  area           INT NULL,
  solar_energy   INT NULL,
  fertility      INT NULL,
  metal          INT NULL,
  gas            INT NULL,
  crystals       INT NULL,
  recorded_days_ago VARCHAR(16) NULL,
  defenses     TEXT NULL,
  structures     TEXT NULL,
  structure_levels TEXT NULL,
  construction   VARCHAR(32) NULL,
  production     VARCHAR(32) NULL,
  research       VARCHAR(32) NULL,
  max_econ       VARCHAR(32) NULL,
  current_econ   VARCHAR(32) NULL,
  trade          TEXT NULL,
  last_pillaged  VARCHAR(32) NULL,
  stability      VARCHAR(32) NULL,
  wormhole       VARCHAR(16) NULL,
  commander      VARCHAR(64) NULL,
  universe_id    CHAR(1) NULL,
  jumpgate       INT NULL,
  scanned_at     TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_base (servid, coords)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS astros (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  servid         INT NOT NULL,
  user_id        BIGINT NOT NULL,
  coord          CHAR(12) NOT NULL,
  base_id        BIGINT NULL,
  owner_id       BIGINT NULL,
  owner_name     VARCHAR(64) NULL,
  owner_guild_tag VARCHAR(8) NULL,
  owner_level    DECIMAL(6,2) NULL,
  occ_id         BIGINT NULL,
  occ_name       VARCHAR(64) NULL,
  occ_guild_tag  VARCHAR(8) NULL,
  occ_level      DECIMAL(6,2) NULL,
  terrain        VARCHAR(32) NULL,
  debris         BIGINT NULL,
  wormhole       VARCHAR(16) NULL,
  has_eyes       TINYINT NULL,
  universe_id    CHAR(1) NULL,
  scanned_at     TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_astro (servid, coord)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS systems (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  servid         INT NOT NULL,
  user_id        BIGINT NOT NULL,
  system         CHAR(9) NOT NULL,
  has_eyes       TINYINT NULL,
  scanned_at     TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_system (servid, system)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS system_astros (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  servid         INT NOT NULL,
  system         CHAR(9) NOT NULL,
  coord          CHAR(12) NOT NULL,
  empty          TINYINT NULL,
  terrain        VARCHAR(32) NULL,
  base_id        BIGINT NULL,
  player_id      BIGINT NULL,
  wormhole       TINYINT NULL,
  occ_player_id  BIGINT NULL,
  debris         BIGINT NULL,
  UNIQUE KEY uq_sys_astro (servid, coord)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS fleets (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  servid         INT NOT NULL,
  user_id        BIGINT NOT NULL,
  fleet_id       BIGINT NOT NULL,
  fleetname      VARCHAR(64) NULL,
  player_id      BIGINT NULL,
  guild_tag      VARCHAR(8) NULL,
  location       CHAR(12) NULL,
  destination    CHAR(12) NULL,
  arrival        VARCHAR(32) NULL,
  size           VARCHAR(32) NULL,
  has_eyes       TINYINT NULL,
  scanned_at     TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  -- one row per fleet, refreshed on every sighting (not a sighting log)
  UNIQUE KEY uq_fleet (servid, fleet_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS fleet_details (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  servid         INT NOT NULL,
  fleet_id       BIGINT NOT NULL,
  details        JSON NOT NULL,
  scanned_at     TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_fdetail (servid, fleet_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS combat_reports (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  servid         INT NOT NULL,
  user_id        BIGINT NOT NULL,
  location       CHAR(12) NOT NULL,
  att_id         BIGINT NULL,
  att_level      DECIMAL(6,2) NULL,
  def_id         BIGINT NULL,
  def_level      DECIMAL(6,2) NULL,
  battle_time    VARCHAR(32) NOT NULL DEFAULT '',
  commander      VARCHAR(64) NULL,
  command_centers VARCHAR(32) NULL,
  att_units      JSON NULL,
  def_units      JSON NULL,
  att_fleet_loss BIGINT NULL,
  def_fleet_loss BIGINT NULL,
  att_xp         BIGINT NULL,
  def_xp         BIGINT NULL,
  debris         BIGINT NULL,
  pillage        BIGINT NULL,
  conquered      TINYINT NULL,
  commanders_killed INT NULL,
  scanned_at     TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
  -- a battle is identified by where/when/who; re-reading the same report
  -- (page refresh) must not duplicate it. battle_time is '' when unknown so
  -- the unique key stays effective (NULLs would not collide).
  UNIQUE KEY uq_combat (servid, location, battle_time, att_id, def_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS profiles (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  servid         INT NOT NULL,
  player_id      BIGINT NOT NULL,
  player_name    VARCHAR(64) NULL,
  guild_tag      VARCHAR(8) NULL,
  guild_id       BIGINT NULL,
  guild_name     VARCHAR(64) NULL,
  level          DECIMAL(8,2) NULL,
  inactive_days  VARCHAR(16) NULL,
  days_in_vac    VARCHAR(16) NULL,
  scanned_at     TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_profile (servid, player_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS guilds (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  servid         INT NOT NULL,
  guild_id       BIGINT NOT NULL,
  guild_name     VARCHAR(64) NULL,
  guild_tag      VARCHAR(8) NULL,
  UNIQUE KEY uq_guild (servid, guild_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS guild_members (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  servid         INT NOT NULL,
  guild_id       BIGINT NOT NULL,
  player_id      BIGINT NOT NULL,
  nick           VARCHAR(64) NULL,
  level          DECIMAL(8,2) NULL,
  scanned_at     TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_gmember (servid, guild_id, player_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS technologies (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  servid         INT NOT NULL,
  user_id        BIGINT NOT NULL,
  tech           VARCHAR(64) NOT NULL,
  level          VARCHAR(16) NULL,
  scanned_at     TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_tech (servid, user_id, tech)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS capacities (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  servid         INT NOT NULL,
  user_id        BIGINT NOT NULL,
  economy        VARCHAR(32) NULL,
  construction   VARCHAR(32) NULL,
  production     VARCHAR(32) NULL,
  research       VARCHAR(32) NULL,
  scanned_at     TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_cap (servid, user_id)
) ENGINE=InnoDB;

-- lossless raw capture log: every dataupload row verbatim, keyed by mode
CREATE TABLE IF NOT EXISTS capture_events (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  servid         INT NOT NULL,
  user_id        BIGINT NOT NULL,
  mode           VARCHAR(32) NOT NULL,
  payload        JSON NOT NULL,
  received_at    TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_cap (servid, mode, received_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS error_log (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  servid         INT NULL,
  user_id        BIGINT NULL,
  base_url       VARCHAR(255) NULL,
  error_report   JSON NULL,
  created_at     TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Idempotent in-place migration for existing installs.
-- schema.sql uses CREATE TABLE IF NOT EXISTS, so it will NOT add the new
-- scout columns to an already-created bases table. MariaDB 10.x supports
-- ADD COLUMN IF NOT EXISTS; each line is a no-op if the column already exists.
-- ---------------------------------------------------------------------------
ALTER TABLE bases ADD COLUMN IF NOT EXISTS astro_type      VARCHAR(32) NULL AFTER debris;
ALTER TABLE bases ADD COLUMN IF NOT EXISTS area            INT NULL AFTER astro_type;
ALTER TABLE bases ADD COLUMN IF NOT EXISTS solar_energy    INT NULL AFTER area;
ALTER TABLE bases ADD COLUMN IF NOT EXISTS fertility       INT NULL AFTER solar_energy;
ALTER TABLE bases ADD COLUMN IF NOT EXISTS metal           INT NULL AFTER fertility;
ALTER TABLE bases ADD COLUMN IF NOT EXISTS gas             INT NULL AFTER metal;
ALTER TABLE bases ADD COLUMN IF NOT EXISTS crystals        INT NULL AFTER gas;
ALTER TABLE bases ADD COLUMN IF NOT EXISTS recorded_days_ago VARCHAR(16) NULL AFTER crystals;
ALTER TABLE bases ADD COLUMN IF NOT EXISTS defenses TEXT NULL AFTER recorded_days_ago;
