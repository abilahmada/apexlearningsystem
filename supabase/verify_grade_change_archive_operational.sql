-- ============================================================================
-- RUNBOOK OPERASIONAL — Grade change archive (student progression reset safety)
-- Lokasi repo: apex-frontend/supabase/verify_grade_change_archive_operational.sql
--
-- Tujuan:
--   - Memastikan trigger arsip saat grade_level berubah aktif.
--   - Memastikan event archive tercatat dan snapshot tidak kosong saat ada data.
--   - Memastikan setelah grade change, progression aktif siswa dibersihkan.
-- ============================================================================

-- 1) Cek tabel archive tersedia
select
  to_regclass('public.student_progress_grade_archives') as archive_table;

-- 2) Cek function + trigger tersedia
select
  p.proname as function_name,
  n.nspname as schema_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'archive_student_progress_on_grade_change';

select
  t.tgname as trigger_name,
  c.relname as table_name
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'student_profiles'
  and t.tgname = 'trg_archive_student_progress_on_grade_change'
  and not t.tgisinternal;

-- 3) Ringkasan arsip terbaru
select
  count(*) as total_archive_events,
  coalesce(sum(lesson_progress_count), 0) as total_archived_lesson_progress,
  coalesce(sum(assessment_attempt_count), 0) as total_archived_assessment_attempts,
  max(archived_at) as latest_archived_at
from public.student_progress_grade_archives;

-- 4) Detail event terbaru (20 baris)
select
  id,
  student_profile_id,
  user_id,
  from_grade,
  to_grade,
  lesson_progress_count,
  assessment_attempt_count,
  archived_at
from public.student_progress_grade_archives
order by archived_at desc
limit 20;

-- 5) Integritas snapshot vs counter (harus 0 baris mismatch)
select
  id,
  lesson_progress_count,
  jsonb_array_length(lesson_progress_snapshot) as snapshot_lesson_progress_len,
  assessment_attempt_count,
  jsonb_array_length(assessment_attempt_snapshot) as snapshot_attempt_len
from public.student_progress_grade_archives
where lesson_progress_count <> jsonb_array_length(lesson_progress_snapshot)
   or assessment_attempt_count <> jsonb_array_length(assessment_attempt_snapshot)
order by archived_at desc
limit 200;

-- 6) Guard kualitas event (harus 0 baris)
select
  id,
  student_profile_id,
  from_grade,
  to_grade,
  archived_at
from public.student_progress_grade_archives
where coalesce(trim(from_grade), '') = ''
   or coalesce(trim(to_grade), '') = ''
   or from_grade = to_grade
order by archived_at desc
limit 200;
