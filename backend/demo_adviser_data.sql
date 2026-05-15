-- IntakeSync demo adviser account seed.
-- Import through phpMyAdmin if artisan access is unavailable.
-- Demo login: demo.adviser@intakesync.test / DemoPass123!

SET @demo_email := 'demo.adviser@intakesync.test';
SET @demo_password_hash := '$2y$10$yvrIencw4plaJJdBWipyR.rYv.XBpUWc115l5Qq0SmlUPodjwFfam';
SET @hydration_goal := 3000;
SET @seed_note := 'Demo adviser seed data';

INSERT INTO users (
  name, email, password, role, status, onboarding_completed, nickname,
  climate, exercise_frequency, weight, weight_unit,
  notification_permissions_accepted, battery_optimization_set, hydration_goal,
  created_at, updated_at
) VALUES (
  'IntakeSync Demo User', @demo_email, @demo_password_hash, 'user', 'active', 1, 'Demo',
  'hot', 'regularly', 70.00, 'kg',
  1, 1, @hydration_goal,
  NOW(), NOW()
) ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  password = VALUES(password),
  role = 'user',
  status = 'active',
  onboarding_completed = 1,
  nickname = VALUES(nickname),
  climate = VALUES(climate),
  exercise_frequency = VALUES(exercise_frequency),
  weight = VALUES(weight),
  weight_unit = VALUES(weight_unit),
  notification_permissions_accepted = 1,
  battery_optimization_set = 1,
  hydration_goal = @hydration_goal,
  updated_at = NOW();

SET @demo_user_id := (SELECT id FROM users WHERE email = @demo_email LIMIT 1);

DELETE FROM hydration_entries
WHERE user_id = @demo_user_id
  AND notes = @seed_note;

CREATE TEMPORARY TABLE demo_days (
  day_index INT PRIMARY KEY,
  day_date DATE NOT NULL
);

INSERT INTO demo_days (day_index, day_date) VALUES
(0, CURDATE() - INTERVAL 29 DAY),
(1, CURDATE() - INTERVAL 28 DAY),
(2, CURDATE() - INTERVAL 27 DAY),
(3, CURDATE() - INTERVAL 26 DAY),
(4, CURDATE() - INTERVAL 25 DAY),
(5, CURDATE() - INTERVAL 24 DAY),
(6, CURDATE() - INTERVAL 23 DAY),
(7, CURDATE() - INTERVAL 22 DAY),
(8, CURDATE() - INTERVAL 21 DAY),
(9, CURDATE() - INTERVAL 20 DAY),
(10, CURDATE() - INTERVAL 19 DAY),
(11, CURDATE() - INTERVAL 18 DAY),
(12, CURDATE() - INTERVAL 17 DAY),
(13, CURDATE() - INTERVAL 16 DAY),
(14, CURDATE() - INTERVAL 15 DAY),
(15, CURDATE() - INTERVAL 14 DAY),
(16, CURDATE() - INTERVAL 13 DAY),
(17, CURDATE() - INTERVAL 12 DAY),
(18, CURDATE() - INTERVAL 11 DAY),
(19, CURDATE() - INTERVAL 10 DAY),
(20, CURDATE() - INTERVAL 9 DAY),
(21, CURDATE() - INTERVAL 8 DAY),
(22, CURDATE() - INTERVAL 7 DAY),
(23, CURDATE() - INTERVAL 6 DAY),
(24, CURDATE() - INTERVAL 5 DAY),
(25, CURDATE() - INTERVAL 4 DAY),
(26, CURDATE() - INTERVAL 3 DAY),
(27, CURDATE() - INTERVAL 2 DAY),
(28, CURDATE() - INTERVAL 1 DAY),
(29, CURDATE());

CREATE TEMPORARY TABLE demo_hydration_templates (
  category_name VARCHAR(16) NOT NULL,
  entry_time CHAR(5) NOT NULL,
  amount_ml INT NOT NULL,
  beverage_type VARCHAR(32) NOT NULL,
  sugar_level VARCHAR(16) NOT NULL,
  caffeine_level VARCHAR(16) NOT NULL,
  drink_label VARCHAR(64) NOT NULL
);

INSERT INTO demo_hydration_templates VALUES
('perfect', '07:30', 500, 'water', 'none', 'none', 'Water'),
('perfect', '10:00', 500, 'water', 'none', 'none', 'Water'),
('perfect', '12:30', 750, 'water', 'none', 'none', 'Water'),
('perfect', '15:00', 500, 'water', 'none', 'none', 'Water'),
('perfect', '18:00', 500, 'water', 'none', 'none', 'Water'),
('perfect', '20:30', 250, 'other_non_alcoholic', 'none', 'low', 'Tea'),
('normal', '07:40', 450, 'water', 'none', 'none', 'Water'),
('normal', '10:15', 300, 'caffeinated', 'low', 'medium', 'Coffee'),
('normal', '12:40', 600, 'water', 'none', 'none', 'Water'),
('normal', '15:30', 400, 'water', 'none', 'none', 'Water'),
('normal', '19:45', 500, 'other_non_alcoholic', 'low', 'low', 'Tea'),
('low', '09:15', 350, 'water', 'none', 'none', 'Water'),
('low', '13:20', 500, 'water', 'none', 'none', 'Water'),
('low', '18:45', 450, 'other_non_alcoholic', 'medium', 'none', 'Juice'),
('mixed', '07:45', 350, 'caffeinated', 'low', 'medium', 'Coffee'),
('mixed', '10:30', 500, 'water', 'none', 'none', 'Water'),
('mixed', '12:45', 500, 'sugar_sweetened', 'high', 'none', 'Soda'),
('mixed', '16:10', 450, 'sugar_sweetened', 'high', 'medium', 'Milk tea'),
('mixed', '20:15', 500, 'water', 'none', 'none', 'Water');

INSERT INTO hydration_entries (
  user_id, amount_ml, source, beverage_type, sugar_level, caffeine_level,
  notes, drink_label, created_at
)
SELECT
  @demo_user_id,
  CASE
    WHEN t.category_name = 'normal' AND t.entry_time = '15:30' THEN t.amount_ml + (MOD(d.day_index, 4) * 100)
    WHEN t.category_name = 'low' AND t.entry_time = '18:45' THEN t.amount_ml + (MOD(d.day_index, 2) * 250)
    WHEN t.category_name = 'mixed' AND t.entry_time = '20:15' THEN t.amount_ml + (MOD(d.day_index, 3) * 100)
    ELSE t.amount_ml
  END,
  'manual',
  t.beverage_type,
  CASE
    WHEN t.category_name = 'normal' AND t.entry_time = '10:15' AND MOD(d.day_index, 3) = 0 THEN 'medium'
    WHEN t.category_name = 'normal' AND t.entry_time = '19:45' AND MOD(d.day_index, 2) = 1 THEN 'none'
    ELSE t.sugar_level
  END,
  t.caffeine_level,
  @seed_note,
  t.drink_label,
  STR_TO_DATE(CONCAT(d.day_date, ' ', t.entry_time), '%Y-%m-%d %H:%i')
FROM demo_days d
JOIN demo_hydration_templates t
  ON t.category_name = CASE
    WHEN d.day_index IN (0, 4, 8, 12, 16, 20, 24, 29) THEN 'perfect'
    WHEN d.day_index IN (2, 7, 14, 19, 25, 27) THEN 'low'
    WHEN d.day_index IN (5, 11, 21, 28) THEN 'mixed'
    ELSE 'normal'
  END;

INSERT INTO medications (
  user_id, client_uuid, name, dosage, times, reminder, active,
  start_date, end_date, frequency, days_of_week, notes, color,
  deleted_at, created_at, updated_at
) VALUES
(@demo_user_id, 'demo-adviser-med-biogesic', 'Biogesic', '500mg', JSON_ARRAY('06:00', '12:00', '18:00', '00:00'), 1, 1, CURDATE() - INTERVAL 29 DAY, NULL, 'daily', NULL, 'Demo medicine scheduled every 6 hours.', '#DC2626', NULL, CURDATE() - INTERVAL 30 DAY, NOW()),
(@demo_user_id, 'demo-adviser-med-vitamin-c', 'Vitamin C', '500mg', JSON_ARRAY('08:00'), 1, 1, CURDATE() - INTERVAL 29 DAY, NULL, 'daily', NULL, 'Daily wellness supplement for demo data.', '#F59E0B', NULL, CURDATE() - INTERVAL 30 DAY, NOW()),
(@demo_user_id, 'demo-adviser-med-maintenance', 'Maintenance Demo Med', '10mg', JSON_ARRAY('21:00'), 1, 1, CURDATE() - INTERVAL 29 DAY, NULL, 'daily', NULL, 'Evening maintenance medication for demo data.', '#2563EB', NULL, CURDATE() - INTERVAL 30 DAY, NOW())
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  dosage = VALUES(dosage),
  times = VALUES(times),
  reminder = 1,
  active = 1,
  start_date = VALUES(start_date),
  end_date = NULL,
  frequency = 'daily',
  days_of_week = NULL,
  notes = VALUES(notes),
  color = VALUES(color),
  deleted_at = NULL,
  updated_at = NOW();

CREATE TEMPORARY TABLE demo_doses (
  med_uuid VARCHAR(64) NOT NULL,
  dose_index INT NOT NULL,
  dose_time CHAR(5) NOT NULL,
  med_name VARCHAR(255) NOT NULL,
  dosage VARCHAR(100) NOT NULL
);

INSERT INTO demo_doses VALUES
('demo-adviser-med-biogesic', 0, '06:00', 'Biogesic', '500mg'),
('demo-adviser-med-biogesic', 1, '12:00', 'Biogesic', '500mg'),
('demo-adviser-med-biogesic', 2, '18:00', 'Biogesic', '500mg'),
('demo-adviser-med-biogesic', 3, '00:00', 'Biogesic', '500mg'),
('demo-adviser-med-vitamin-c', 4, '08:00', 'Vitamin C', '500mg'),
('demo-adviser-med-maintenance', 5, '21:00', 'Maintenance Demo Med', '10mg');

INSERT INTO medication_history (
  user_id, medication_id, client_uuid, status, time, scheduled_time, taken_time,
  medication_name_snapshot, dosage_snapshot, created_at, updated_at
)
SELECT
  @demo_user_id,
  m.id,
  CONCAT('demo-adviser-', dse.med_uuid, '-', DATE_FORMAT(STR_TO_DATE(CONCAT(dd.day_date, ' ', dse.dose_time), '%Y-%m-%d %H:%i'), '%Y%m%d%H%i'), '-', LPAD(dse.dose_index, 2, '0')),
  CASE
    WHEN dd.day_index IN (8, 14, 20, 28) AND dse.dose_index IN (1, 3, 5) THEN 'skipped'
    WHEN dd.day_index IN (2, 5, 11, 17, 23, 26) AND (dse.dose_index = MOD(dd.day_index, 6) OR dse.dose_index = MOD(dd.day_index + 2, 6)) THEN 'missed'
    WHEN dd.day_index IN (1, 4, 7, 10, 13, 16, 19, 22, 25, 27) AND dse.dose_index = MOD(dd.day_index, 6) THEN 'missed'
    ELSE 'completed'
  END,
  STR_TO_DATE(CONCAT(dd.day_date, ' ', dse.dose_time), '%Y-%m-%d %H:%i'),
  STR_TO_DATE(CONCAT(dd.day_date, ' ', dse.dose_time), '%Y-%m-%d %H:%i'),
  CASE
    WHEN (
      (dd.day_index IN (8, 14, 20, 28) AND dse.dose_index IN (1, 3, 5))
      OR (dd.day_index IN (2, 5, 11, 17, 23, 26) AND (dse.dose_index = MOD(dd.day_index, 6) OR dse.dose_index = MOD(dd.day_index + 2, 6)))
      OR (dd.day_index IN (1, 4, 7, 10, 13, 16, 19, 22, 25, 27) AND dse.dose_index = MOD(dd.day_index, 6))
    ) THEN NULL
    ELSE DATE_ADD(STR_TO_DATE(CONCAT(dd.day_date, ' ', dse.dose_time), '%Y-%m-%d %H:%i'), INTERVAL MOD((dd.day_index * 3) + (dse.dose_index * 5), 21) MINUTE)
  END,
  dse.med_name,
  dse.dosage,
  COALESCE(
    CASE
      WHEN (
        (dd.day_index IN (8, 14, 20, 28) AND dse.dose_index IN (1, 3, 5))
        OR (dd.day_index IN (2, 5, 11, 17, 23, 26) AND (dse.dose_index = MOD(dd.day_index, 6) OR dse.dose_index = MOD(dd.day_index + 2, 6)))
        OR (dd.day_index IN (1, 4, 7, 10, 13, 16, 19, 22, 25, 27) AND dse.dose_index = MOD(dd.day_index, 6))
      ) THEN DATE_ADD(STR_TO_DATE(CONCAT(dd.day_date, ' ', dse.dose_time), '%Y-%m-%d %H:%i'), INTERVAL 35 MINUTE)
      ELSE DATE_ADD(STR_TO_DATE(CONCAT(dd.day_date, ' ', dse.dose_time), '%Y-%m-%d %H:%i'), INTERVAL MOD((dd.day_index * 3) + (dse.dose_index * 5), 21) MINUTE)
    END,
    NOW()
  ),
  NOW()
FROM demo_days dd
CROSS JOIN demo_doses dse
JOIN medications m ON m.user_id = @demo_user_id AND m.client_uuid = dse.med_uuid
ON DUPLICATE KEY UPDATE
  medication_id = VALUES(medication_id),
  status = VALUES(status),
  time = VALUES(time),
  scheduled_time = VALUES(scheduled_time),
  taken_time = VALUES(taken_time),
  medication_name_snapshot = VALUES(medication_name_snapshot),
  dosage_snapshot = VALUES(dosage_snapshot),
  created_at = VALUES(created_at),
  updated_at = NOW();

DROP TEMPORARY TABLE IF EXISTS demo_doses;
DROP TEMPORARY TABLE IF EXISTS demo_hydration_templates;
DROP TEMPORARY TABLE IF EXISTS demo_days;
