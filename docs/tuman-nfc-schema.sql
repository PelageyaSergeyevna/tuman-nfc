-- =============================================================================
-- TUMAN NFC — BACKEND STRUCTURE (DOCUMENTATION ONLY)
-- =============================================================================
--
-- This file is NOT executed by the application, and the application does NOT
-- use a relational database. TUMAN NFC stores its data in **Firebase Firestore**
-- (a NoSQL, document-oriented store). There is no SQL server, no MySQL, and no
-- schema migration step anywhere in the runtime.
--
-- This file exists so that a reader can see the *shape* of the backend in a
-- familiar relational form. It is a direct rendering of the Firestore document
-- model defined in `src/app/core/models.ts` and written by `tools/seed.mjs`.
--
-- Firestore collections  ->  SQL tables
--   users/{uid}                                  -> users
--   attendance/{employeeId_YYYY-MM-DD}           -> attendance
--   nfcCards/{cardUidHex}                        -> nfc_cards
--   archiveRequests/{id}                         -> archive_requests
--   correctionRequests/{id}                      -> correction_requests
--   notifications/{id}                           -> notifications
--   settings/attendance                          -> settings
--   settings/attendance/shift_schedules/{id}     -> shift_schedules
--
-- Read this file with these differences in mind:
--
--   * DOCUMENT ID vs PRIMARY KEY.
--       Firestore has no foreign keys and no auto-increment. The document's
--       path/id *is* its identity. Where a table below has an `id` column, the
--       comment says how Firestore derives it (e.g. an auth UID, or the
--       composite "employeeId_YYYY-MM-DD").
--
--   * NO JOINS.
--       Related data is denormalised into each document (e.g. every attendance
--       record repeats `employee_name` and `department`). The FOREIGN KEY
--       clauses below are illustrative for a reader; Firestore enforces none of
--       them. Referential integrity is maintained by the application code.
--
--   * TIMESTAMPS ARE ISO-8601 STRINGS.
--       Firestore *can* store native timestamps, but this app deliberately
--       stores ISO-8601 strings (see `nowIso()` in models.ts) for readability.
--       They are therefore typed VARCHAR here, not DATETIME.
--
--   * ACCESS CONTROL IS NOT IN THIS FILE.
--       Who may read/write each collection is enforced by Firestore Security
--       Rules, not by GRANT statements. See `firestore.rules`.
--
--   * PERFORMANCE IS NOT IN THIS FILE.
--       Firestore indexes are declared separately in `firestore.indexes.json`.
--
-- Generated as documentation. MySQL 8 dialect.
-- =============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- =============================================================================
-- 1. users
--    Firestore path: users/{uid}
--    Document id: the Firebase Authentication UID of the account.
--    Mirror of the legacy Tuman `users` table (roles collapsed to three).
-- =============================================================================
CREATE TABLE users (
  uid            VARCHAR(128) NOT NULL,            -- Firebase Auth UID (document id)
  employee_id    VARCHAR(32)  NOT NULL,            -- legacy Tuman employee code, e.g. "HR001"
  email          VARCHAR(255) NOT NULL,
  display_name   VARCHAR(255) NOT NULL,
  role           ENUM('hr','manager','employee') NOT NULL,
  department     VARCHAR(64)  NOT NULL,
  position       VARCHAR(128) NULL,
  phone          VARCHAR(64)  NULL,
  photo_url      VARCHAR(512) NULL,
  is_active      TINYINT(1)   NOT NULL DEFAULT 1,
  created_at     VARCHAR(32)  NULL,                -- ISO-8601 string (or Firestore server timestamp)
  updated_at     VARCHAR(32)  NULL,                -- ISO-8601 string (or Firestore server timestamp)
  PRIMARY KEY (uid),
  UNIQUE KEY uq_users_employee_id (employee_id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role (role),
  KEY idx_users_department (department)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='users/{uid}. Document id = Firebase Auth UID. No self-signup: an account needs both an Auth user and this profile doc.';

-- =============================================================================
-- 2. attendance
--    Firestore path: attendance/{employeeId_YYYY-MM-DD}
--    Document id: composite "<employeeId>_<YYYY-MM-DD>" (one record per employee
--    per calendar day). This is the busiest collection in the app.
-- =============================================================================
CREATE TABLE attendance (
  id                    VARCHAR(64) NOT NULL,      -- "<employeeId>_<YYYY-MM-DD>" (document id)
  employee_id           VARCHAR(32) NOT NULL,
  employee_name         VARCHAR(255) NOT NULL,    -- denormalised copy
  department            VARCHAR(64) NOT NULL,     -- denormalised copy
  date                  DATE        NOT NULL,     -- stored as "YYYY-MM-DD"
  status                ENUM('present','absent','late','on_leave','excused') NOT NULL,
  time_in               VARCHAR(32) NULL,         -- ISO-8601 string, or NULL
  time_out              VARCHAR(32) NULL,         -- ISO-8601 string, or NULL
  late_minutes          INT         NOT NULL DEFAULT 0,
  shift_id              VARCHAR(32) NULL,
  shift_name            VARCHAR(64) NULL,
  source                ENUM('nfc','manual','seed','correction') NOT NULL,
  notes                 TEXT        NULL,
  archived              TINYINT(1)  NOT NULL DEFAULT 0,
  archived_at           VARCHAR(32) NULL,
  archived_by           VARCHAR(128) NULL,         -- uid
  archived_by_name      VARCHAR(255) NULL,
  archive_reason        TEXT        NULL,
  archive_request_id    VARCHAR(128) NULL,         -- -> archive_requests.id
  correction_request_id VARCHAR(128) NULL,         -- -> correction_requests.id
  created_at            VARCHAR(32) NULL,
  updated_at            VARCHAR(32) NULL,
  PRIMARY KEY (id),
  KEY idx_att_employee_date (employee_id, date),
  KEY idx_att_date (date),
  KEY idx_att_department (department),
  KEY idx_att_status (status),
  KEY idx_att_archived (archived),
  KEY idx_att_dept_date (department, date),          -- mirrors firestore.indexes.json
  KEY idx_att_emp_date_desc (employee_id, date DESC) -- mirrors firestore.indexes.json
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='attendance/{employeeId_YYYY-MM-DD}. One row per employee per day. FK columns are illustrative only.';

-- =============================================================================
-- 3. nfc_cards
--    Firestore path: nfcCards/{cardUidHex}
--    Document id: the hex UID read from the MIFARE Classic card.
-- =============================================================================
CREATE TABLE nfc_cards (
  id            VARCHAR(32)  NOT NULL,             -- card hex UID (document id)
  employee_id   VARCHAR(32)  NOT NULL,
  employee_name VARCHAR(255) NOT NULL,             -- denormalised copy
  department    VARCHAR(64)  NOT NULL,             -- denormalised copy
  card_type     VARCHAR(64)  NOT NULL,             -- e.g. "Mifare Classic 1K"
  assigned_at   VARCHAR(32)  NOT NULL,             -- ISO-8601 string
  assigned_by   VARCHAR(128) NOT NULL,             -- uid of the HR user who assigned it
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  notes         TEXT         NULL,
  PRIMARY KEY (id),
  KEY idx_cards_employee (employee_id),
  KEY idx_cards_department (department),
  KEY idx_cards_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='nfcCards/{cardUidHex}. Document id = the physical card hex UID.';

-- =============================================================================
-- 4. archive_requests
--    Firestore path: archiveRequests/{id}
--    Document id: Firestore auto-generated id.
--    A request to archive (hide) an attendance record; HR/manager approves it.
-- =============================================================================
CREATE TABLE archive_requests (
  id                VARCHAR(128) NOT NULL,          -- auto id (document id)
  attendance_id     VARCHAR(64)  NOT NULL,          -- -> attendance.id
  employee_id       VARCHAR(32)  NOT NULL,
  employee_name     VARCHAR(255) NOT NULL,
  department        VARCHAR(64)  NOT NULL,
  date              DATE         NOT NULL,
  reason            TEXT         NOT NULL,
  status            ENUM('pending','approved','rejected') NOT NULL,
  requested_by      VARCHAR(128) NOT NULL,          -- uid
  requested_by_name VARCHAR(255) NOT NULL,
  requested_at      VARCHAR(32)  NOT NULL,          -- ISO-8601 string
  reviewed_by       VARCHAR(128) NULL,              -- uid
  reviewed_by_name  VARCHAR(255) NULL,
  reviewed_at       VARCHAR(32)  NULL,
  review_note       TEXT         NULL,
  PRIMARY KEY (id),
  KEY idx_arch_status (status),
  KEY idx_arch_attendance (attendance_id),
  KEY idx_arch_employee (employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='archiveRequests/{id}. Auto id. Approving one sets attendance.archived = true.';

-- =============================================================================
-- 5. correction_requests
--    Firestore path: correctionRequests/{id}
--    Document id: Firestore auto-generated id.
--    An employee asks to change fields of an attendance record; the request
--    carries both the proposed values and a snapshot of the current values so
--    the reviewer can see a side-by-side diff. In Firestore those two are
--    nested objects (`proposed`, `current`); here they are flattened into
--    proposed_* / current_* columns.
-- =============================================================================
CREATE TABLE correction_requests (
  id                    VARCHAR(128) NOT NULL,      -- auto id (document id)
  attendance_id         VARCHAR(64)  NOT NULL,      -- -> attendance.id
  employee_id           VARCHAR(32)  NOT NULL,
  employee_name         VARCHAR(255) NOT NULL,
  department            VARCHAR(64)  NOT NULL,
  date                  DATE         NOT NULL,
  -- proposed.* (what the employee wants)
  proposed_status       ENUM('present','absent','late','on_leave','excused') NULL,
  proposed_time_in      VARCHAR(32)  NULL,
  proposed_time_out     VARCHAR(32)  NULL,
  proposed_late_minutes INT          NULL,
  proposed_notes        TEXT         NULL,
  -- current.* (snapshot of what is on record now)
  current_status        ENUM('present','absent','late','on_leave','excused') NULL,
  current_time_in       VARCHAR(32)  NULL,
  current_time_out      VARCHAR(32)  NULL,
  current_late_minutes  INT          NULL,
  current_notes         TEXT         NULL,
  reason                TEXT         NOT NULL,
  status                ENUM('pending','approved','rejected') NOT NULL,
  requested_by          VARCHAR(128) NOT NULL,      -- uid
  requested_by_name     VARCHAR(255) NOT NULL,
  requested_at          VARCHAR(32)  NOT NULL,
  reviewed_by           VARCHAR(128) NULL,          -- uid
  reviewed_by_name      VARCHAR(255) NULL,
  reviewed_at           VARCHAR(32)  NULL,
  review_note           TEXT         NULL,
  PRIMARY KEY (id),
  KEY idx_corr_status (status),
  KEY idx_corr_attendance (attendance_id),
  KEY idx_corr_employee (employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='correctionRequests/{id}. Auto id. In Firestore `proposed`/`current` are nested objects, flattened here.';

-- =============================================================================
-- 6. notifications
--    Firestore path: notifications/{id}
--    Document id: Firestore auto-generated id.
--    `readBy` is an ARRAY of uids in Firestore; represented here with the
--    separate notification_reads table below (the relational equivalent).
-- =============================================================================
CREATE TABLE notifications (
  id                   VARCHAR(128) NOT NULL,       -- auto id (document id)
  type                 ENUM('info','warning','success','danger') NOT NULL,
  title                VARCHAR(255) NOT NULL,
  message              TEXT         NOT NULL,
  recipient_role       ENUM('hr','manager','employee') NULL,  -- address by role
  recipient_employee_id VARCHAR(32) NULL,                     -- address by employee code
  link                 VARCHAR(512) NULL,           -- optional deep link into the app
  created_at           VARCHAR(32)  NOT NULL,       -- ISO-8601 string
  PRIMARY KEY (id),
  KEY idx_notif_role (recipient_role),
  KEY idx_notif_employee (recipient_employee_id),
  KEY idx_notif_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='notifications/{id}. Auto id. Address by role and/or employee code.';

-- notification_reads: the relational form of notifications.readBy[]
--    Firestore stores a `readBy` array of uids on each notification document.
--    This table is that array unpacked, one row per (notification, user).
CREATE TABLE notification_reads (
  notification_id VARCHAR(128) NOT NULL,            -- -> notifications.id
  uid             VARCHAR(128) NOT NULL,            -- -> users.uid
  PRIMARY KEY (notification_id, uid),
  KEY idx_notif_reads_uid (uid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='Flattened form of notifications.readBy[] (array of uids who dismissed it).';

-- =============================================================================
-- 7. settings
--    Firestore path: settings/attendance
--    Document id: the fixed string "attendance" (a singleton config document).
-- =============================================================================
CREATE TABLE settings (
  id                         VARCHAR(64) NOT NULL,  -- fixed: 'attendance' (document id)
  grace_period_minutes       INT         NOT NULL DEFAULT 15,
  default_shift_id           VARCHAR(32) NOT NULL,  -- -> shift_schedules.id
  archive_requires_approval  TINYINT(1)  NOT NULL DEFAULT 1,
  correction_requires_approval TINYINT(1) NOT NULL DEFAULT 1,
  updated_at                 VARCHAR(32) NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='settings/attendance. Singleton config document (fixed id).';

-- =============================================================================
-- 8. shift_schedules
--    Firestore path: settings/attendance/shift_schedules/{id}
--    A SUBCOLLECTION of the settings/attendance document.
--    Document id: the shift id, e.g. "day" or "night".
-- =============================================================================
CREATE TABLE shift_schedules (
  id                   VARCHAR(32) NOT NULL,        -- e.g. 'day' / 'night' (document id)
  shift_name           VARCHAR(64) NOT NULL,
  shift_type           ENUM('day','night') NOT NULL,
  start_time           VARCHAR(8)  NOT NULL,        -- "08:00"
  end_time             VARCHAR(8)  NOT NULL,        -- "17:00"
  grace_period_minutes INT         NOT NULL DEFAULT 0,
  break_start          VARCHAR(8)  NULL,            -- e.g. "12:00"
  break_end            VARCHAR(8)  NULL,            -- e.g. "13:00"
  is_active            TINYINT(1)  NOT NULL DEFAULT 1,
  updated_at           VARCHAR(32) NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='settings/attendance/shift_schedules/{id}. Subcollection of settings/attendance.';

-- =============================================================================
-- SAMPLE DATA
-- -----------------------------------------------------------------------------
-- Illustrative rows matching the app's seeded template accounts and the data
-- you can sign in with. These are examples of the structure, not a live dump.
-- =============================================================================

-- --- users (the three template accounts) -------------------------------------
INSERT INTO users
  (uid, employee_id, email, display_name, role, department, position, phone, is_active, created_at, updated_at)
VALUES
  ('uid_maria', 'HR001',  'maria.reyes@tuman.local', 'Maria Reyes', 'hr',       'Human Resources', 'HR Manager',       '0917-000-0001', 1, '2026-01-05T08:00:00Z', '2026-01-05T08:00:00Z'),
  ('uid_jose',  'MGR001', 'jose.cruz@tuman.local',   'Jose Cruz',   'manager',  'IT',              'IT Department Head','0917-000-0002', 1, '2026-01-05T08:00:00Z', '2026-01-05T08:00:00Z'),
  ('uid_ana',   'EMP001', 'ana.ramos@tuman.local',   'Ana Ramos',   'employee', 'IT',              'Software Engineer', '0917-000-0003', 1, '2026-01-05T08:00:00Z', '2026-01-05T08:00:00Z');

-- --- settings + shift_schedules ----------------------------------------------
INSERT INTO settings
  (id, grace_period_minutes, default_shift_id, archive_requires_approval, correction_requires_approval, updated_at)
VALUES
  ('attendance', 15, 'day', 1, 1, '2026-01-05T08:00:00Z');

INSERT INTO shift_schedules
  (id, shift_name, shift_type, start_time, end_time, grace_period_minutes, break_start, break_end, is_active, updated_at)
VALUES
  ('day',   'Day Shift',   'day',   '08:00', '17:00', 15, '12:00', '13:00', 1, '2026-01-05T08:00:00Z'),
  ('night', 'Night Shift', 'night', '20:00', '05:00', 15, NULL,    NULL,    1, '2026-01-05T08:00:00Z');

-- --- nfc_cards ---------------------------------------------------------------
INSERT INTO nfc_cards
  (id, employee_id, employee_name, department, card_type, assigned_at, assigned_by, is_active, notes)
VALUES
  ('04A1B2C3D4E5', 'EMP001', 'Ana Ramos', 'IT', 'Mifare Classic 1K', '2026-01-05T08:00:00Z', 'uid_maria', 1, NULL);

-- --- attendance --------------------------------------------------------------
INSERT INTO attendance
  (id, employee_id, employee_name, department, date, status, time_in, time_out, late_minutes,
   shift_id, shift_name, source, notes, archived, created_at, updated_at)
VALUES
  ('EMP001_2026-02-02', 'EMP001', 'Ana Ramos', 'IT', '2026-02-02', 'present', '2026-02-02T07:58:00Z', '2026-02-02T17:02:00Z', 0,  'day', 'Day Shift', 'nfc',    NULL, 0, '2026-02-02T07:58:00Z', '2026-02-02T17:02:00Z'),
  ('EMP001_2026-02-03', 'EMP001', 'Ana Ramos', 'IT', '2026-02-03', 'late',    '2026-02-03T08:12:00Z', '2026-02-03T17:05:00Z', 12, 'day', 'Day Shift', 'nfc',    NULL, 0, '2026-02-03T08:12:00Z', '2026-02-03T17:05:00Z'),
  ('MGR001_2026-02-03', 'MGR001', 'Jose Cruz', 'IT', '2026-02-03', 'on_leave', NULL,                  NULL,                  0,  'day', 'Day Shift', 'manual', 'Approved VL', 0, '2026-02-03T00:00:00Z', '2026-02-03T00:00:00Z');

-- --- correction_requests (example pending request) ---------------------------
INSERT INTO correction_requests
  (id, attendance_id, employee_id, employee_name, department, date,
   proposed_status, proposed_time_in, proposed_time_out, proposed_late_minutes, proposed_notes,
   current_status, current_time_in, current_time_out, current_late_minutes, current_notes,
   reason, status, requested_by, requested_by_name, requested_at)
VALUES
  ('corr_demo_1', 'EMP001_2026-02-03', 'EMP001', 'Ana Ramos', 'IT', '2026-02-03',
   'present', '2026-02-03T07:55:00Z', '2026-02-03T17:05:00Z', 0, 'Card tap did not register on arrival.',
   'late',    '2026-02-03T08:12:00Z', '2026-02-03T17:05:00Z', 12, NULL,
   'I arrived on time; the scanner was offline.', 'pending', 'uid_ana', 'Ana Ramos', '2026-02-03T18:00:00Z');

-- --- archive_requests (example pending request) ------------------------------
INSERT INTO archive_requests
  (id, attendance_id, employee_id, employee_name, department, date, reason, status,
   requested_by, requested_by_name, requested_at)
VALUES
  ('arch_demo_1', 'MGR001_2026-02-03', 'MGR001', 'Jose Cruz', 'IT', '2026-02-03',
   'Duplicate record created during manual entry.', 'pending', 'uid_maria', 'Maria Reyes', '2026-02-03T18:05:00Z');

-- --- notifications + notification_reads --------------------------------------
INSERT INTO notifications
  (id, type, title, message, recipient_role, recipient_employee_id, link, created_at)
VALUES
  ('notif_demo_1', 'info', 'Correction request pending',
   'Ana Ramos submitted a correction for 2026-02-03.', 'hr', NULL, '/corrections', '2026-02-03T18:00:05Z');

INSERT INTO notification_reads (notification_id, uid)
VALUES
  ('notif_demo_1', 'uid_maria');

-- =============================================================================
-- END — remember: this is a structural rendering of a Firestore backend, not a
-- database the application uses.
-- =============================================================================
