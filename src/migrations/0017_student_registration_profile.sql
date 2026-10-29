-- 0017: collect a unique eight-digit student number during invitation signup.
-- Existing accounts keep NULL because historical records did not include a
-- student number. New invitation registrations enforce the field in the API.

ALTER TABLE users ADD COLUMN student_number TEXT;

CREATE UNIQUE INDEX idx_users_student_number
  ON users(student_number)
  WHERE student_number IS NOT NULL;
