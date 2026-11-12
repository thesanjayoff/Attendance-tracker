-- Run this once as the postgres superuser to create the app's database and a
-- dedicated low-privilege login for the Attendance Tracker.
--
-- Replace CHANGE_ME below with a strong password of your own (the same
-- value must then go into DATABASE_URL in your local .env file, which is
-- never committed to git).
--
-- Example (PowerShell, from the PostgreSQL bin directory):
--   & "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -f scripts\setup-db.sql

CREATE USER attendance_app WITH PASSWORD 'CHANGE_ME';
CREATE DATABASE attendance_tracker OWNER attendance_app;
GRANT ALL PRIVILEGES ON DATABASE attendance_tracker TO attendance_app;
