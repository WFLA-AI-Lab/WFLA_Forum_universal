-- 0011: rename users.graduation_year to users.enrollment_year without data loss.
--
-- 0001 is an immutable historical migration and still creates graduation_year;
-- this migration performs the real rename for both fresh and upgraded databases.
-- SQLite supports RENAME COLUMN since 3.25, and this keeps every foreign key,
-- index and user id intact without a table rebuild.
ALTER TABLE users RENAME COLUMN graduation_year TO enrollment_year;
