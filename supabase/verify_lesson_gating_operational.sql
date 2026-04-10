-- ============================================================================
-- Smoke-test helper (PRE_REQUIRED):
--   Untuk memilih kandidat APEX_SMOKE_LESSON_ID per siswa, pakai query di bawah:
--
-- with student_ctx as (
--   select sp.id as student_profile_id
--   from public.users u
--   join public.student_profiles sp on sp.user_id = u.id
--   where lower(trim(u.email)) = lower(trim('student@example.com'))
--   limit 1
-- )
-- select l.id as lesson_id, l.title, m.title as module_title, lp.pretest_score
-- from student_ctx s
-- join public.student_profiles sp2 on sp2.id = s.student_profile_id
-- join public.courses c on c.grade_level = sp2.grade_level
-- join public.modules m on m.course_id = c.id
-- join public.lessons l on l.module_id = m.id
-- join public.quizzes q on q.lesson_id = l.id
-- left join public.lesson_progress lp on lp.student_id = s.student_profile_id and lp.lesson_id = l.id
-- where lp.pretest_score is null
-- order by m.sequence_order, l.created_at
-- limit 20;
--
-- RUNBOOK OPERASIONAL — Lesson gating, PRE/POST, threshold modul, kalibrasi
-- Lokasi repo: apex-frontend/supabase/verify_lesson_gating_operational.sql
--
-- Cara pakai (Supabase Dashboard → SQL Editor):
--   1) Buka tab New query, tempel SATU blok query di bawah (pisah antar blok dengan ;).
--   2) Jangan jalankan seluruh file sekaligus jika editor Anda membatasi multi-statement;
--      jalankan per nomor (1, 2, 3A, …) sesuai kebutuhan.
--   3) Simpan hasil sebagai CSV/JSON dari panel hasil bila perlu dilampirkan ke tiket.
--
-- Runbook terkait (folder yang sama: apex-frontend/supabase/):
--   • verify_srs_operational.sql              — antrian SM-2 / srs_reviews / srs_flashcards
--   • verify_auth_signup_operational.sql     — auth.users ↔ public.users, profil siswa/orang tua
--   • verify_admin_curriculum_operational.sql — courses → modules → lessons → quizzes
--
-- Expected API behavior (ringkas, non-SQL context):
--   • GET /api/learning/lesson-assessment?lessonId=...&assessmentType=POST
--       → 403 PRE_REQUIRED jika pretest_score belum ada.
--   • POST /api/learning/lesson-assessment (assessmentType=POST)
--       → 403 PRE_REQUIRED jika pretest_score belum ada.
--   • POST lesson-assessment untuk lesson terkunci
--       → 403 LESSON_LOCKED.
--
-- Urutan disarankan (cek kesehatan sistem):
--   Langkah A — Metrik pembelajaran: query 1 → 2 → 3A → 3B → 4A → 4B
--   Langkah B — Integritas data: query 5  → harapan: 0 baris (tidak ada mismatch)
--   Langkah C — Engine kalibrasi: query 6  → ada baris baru setelah siswa submit PRE/POST
--   Langkah D — Dashboard per siswa: 7A → 7B → 7C (opsional filter user_id di 7C)
--
-- Interpretasi cepat:
--   • Query 1: lesson dengan pass rate rendah = prioritas konten/quiz.
--   • Query 2 & 4: lesson dengan banyak kegagalan POST = remedial / review soal.
--   • Query 3: attempt tinggi sebelum lulus = lesson terlalu sulit atau threshold terlalu ketat.
--   • Query 4B: apex_quiz_target_lesson_ids = NULL artinya tidak ada top-5 failure (OK).
--   • Query 5: baris apa pun = lesson_progress tidak selaras threshold modul → jalankan
--             migrasi reconcile atau investigasi manual.
--   • Query 6–7: metadata.source = 'lesson_assessment' = sinyal dari submit PRE/POST di app.
--
-- English: Operational checks for lesson POST pass rates, module mastery_threshold alignment,
-- and calibration_signals from lesson_assessment. Run blocks one at a time in SQL Editor.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Pass rate per lesson (POST test only)
--    Gunakan hasil ini untuk kartu/diagram "lesson health".
select
  l.id as lesson_id,
  l.title as lesson_title,
  m.title as module_title,
  c.grade_level,
  count(*) as total_post_attempts,
  count(*) filter (where la.passed = true) as passed_post_attempts,
  count(*) filter (where la.passed = false) as failed_post_attempts,
  round(
    100.0 * count(*) filter (where la.passed = true) / nullif(count(*), 0),
    2
  ) as pass_rate_pct
from public.lesson_assessment_attempts la
join public.lessons l on l.id = la.lesson_id
join public.modules m on m.id = l.module_id
join public.courses c on c.id = m.course_id
where la.assessment_type = 'POST'
group by l.id, l.title, m.title, c.grade_level
order by pass_rate_pct asc nulls last, total_post_attempts desc, lesson_title asc;

-- 2) Lessons with most failures (berdasarkan posttest_passed = false)
--    Fokuskan intervensi konten/remedial pada lesson teratas.
select
  l.id as lesson_id,
  l.title as lesson_title,
  m.title as module_title,
  c.grade_level,
  count(*) filter (where la.passed = false) as total_failures,
  count(distinct la.student_id) filter (where la.passed = false) as unique_students_failed,
  round(avg(la.score_pct) filter (where la.passed = false), 2) as avg_failed_score_pct
from public.lesson_assessment_attempts la
join public.lessons l on l.id = la.lesson_id
join public.modules m on m.id = l.module_id
join public.courses c on c.id = m.course_id
where la.assessment_type = 'POST'
group by l.id, l.title, m.title, c.grade_level
having count(*) filter (where la.passed = false) > 0
order by total_failures desc, unique_students_failed desc, avg_failed_score_pct asc nulls last;

-- 3A) Average attempts before first pass (sesuai threshold modul, global)
--     Nilai ini menjawab: rata-rata berapa kali attempt sebelum siswa lulus menurut mastery_threshold modul.
with post_attempts as (
  select
    la.student_id,
    la.lesson_id,
    la.score_pct,
    least(100, greatest(0, coalesce(m.mastery_threshold, 80)))::int as pass_threshold,
    row_number() over (
      partition by la.student_id, la.lesson_id
      order by la.created_at asc, la.id asc
    ) as attempt_no
  from public.lesson_assessment_attempts la
  join public.lessons l on l.id = la.lesson_id
  join public.modules m on m.id = l.module_id
  where la.assessment_type = 'POST'
),
first_pass as (
  select
    student_id,
    lesson_id,
    min(attempt_no) as attempts_to_pass
  from post_attempts
  where score_pct >= pass_threshold
  group by student_id, lesson_id
)
select
  round(avg(attempts_to_pass::numeric), 2) as avg_attempts_before_pass_threshold,
  percentile_cont(0.5) within group (order by attempts_to_pass) as median_attempts_before_pass_threshold,
  count(*) as student_lesson_pairs_passed
from first_pass;

-- 3B) Average attempts before first pass (sesuai threshold modul, per lesson)
--     Berguna untuk lihat lesson mana yang butuh attempt terbanyak sebelum pass.
with post_attempts as (
  select
    la.student_id,
    la.lesson_id,
    la.score_pct,
    least(100, greatest(0, coalesce(m.mastery_threshold, 80)))::int as pass_threshold,
    row_number() over (
      partition by la.student_id, la.lesson_id
      order by la.created_at asc, la.id asc
    ) as attempt_no
  from public.lesson_assessment_attempts la
  join public.lessons l on l.id = la.lesson_id
  join public.modules m on m.id = l.module_id
  where la.assessment_type = 'POST'
),
first_pass as (
  select
    student_id,
    lesson_id,
    min(attempt_no) as attempts_to_pass
  from post_attempts
  where score_pct >= pass_threshold
  group by student_id, lesson_id
)
select
  l.id as lesson_id,
  l.title as lesson_title,
  m.title as module_title,
  c.grade_level,
  round(avg(fp.attempts_to_pass::numeric), 2) as avg_attempts_before_pass_threshold,
  percentile_cont(0.5) within group (order by fp.attempts_to_pass) as median_attempts_before_pass_threshold,
  count(*) as total_student_pairs_passed
from first_pass fp
join public.lessons l on l.id = fp.lesson_id
join public.modules m on m.id = l.module_id
join public.courses c on c.id = m.course_id
group by l.id, l.title, m.title, c.grade_level
order by avg_attempts_before_pass_threshold desc, total_student_pairs_passed desc, lesson_title asc;

-- 4A) Top 5 lesson failures (detail list)
--     Gunakan output ini untuk tentukan prioritas perbaikan konten.
with ranked_failures as (
  select
    l.id as lesson_id,
    l.title as lesson_title,
    m.title as module_title,
    c.grade_level,
    count(*) filter (where la.passed = false) as total_failures,
    count(distinct la.student_id) filter (where la.passed = false) as unique_students_failed,
    round(avg(la.score_pct) filter (where la.passed = false), 2) as avg_failed_score_pct
  from public.lesson_assessment_attempts la
  join public.lessons l on l.id = la.lesson_id
  join public.modules m on m.id = l.module_id
  join public.courses c on c.id = m.course_id
  where la.assessment_type = 'POST'
  group by l.id, l.title, m.title, c.grade_level
  having count(*) filter (where la.passed = false) > 0
)
select
  lesson_id,
  lesson_title,
  module_title,
  grade_level,
  total_failures,
  unique_students_failed,
  avg_failed_score_pct
from ranked_failures
order by total_failures desc, unique_students_failed desc, avg_failed_score_pct asc nulls last
limit 5;

-- 4B) Top 5 lesson IDs in comma-separated format
--     Copy hasil kolom ini ke env:
--     $env:APEX_QUIZ_TARGET_LESSON_IDS = "<hasil_dari_query_ini>"
with ranked_failures as (
  select
    l.id as lesson_id,
    count(*) filter (where la.passed = false) as total_failures,
    count(distinct la.student_id) filter (where la.passed = false) as unique_students_failed,
    round(avg(la.score_pct) filter (where la.passed = false), 2) as avg_failed_score_pct
  from public.lesson_assessment_attempts la
  join public.lessons l on l.id = la.lesson_id
  where la.assessment_type = 'POST'
  group by l.id
  having count(*) filter (where la.passed = false) > 0
),
top5 as (
  select lesson_id
  from ranked_failures
  order by total_failures desc, unique_students_failed desc, avg_failed_score_pct asc nulls last
  limit 5
)
select string_agg(lesson_id::text, ',' order by lesson_id::text) as apex_quiz_target_lesson_ids
from top5;

-- 5) Data integrity check:
--    posttest_passed harus sama dengan rule (posttest_score >= mastery_threshold modul)
select
  lp.student_id,
  lp.lesson_id,
  lp.posttest_score,
  lp.posttest_passed,
  least(100, greatest(0, coalesce(m.mastery_threshold, 80)))::int as pass_threshold,
  (lp.posttest_score is not null and lp.posttest_score >= least(100, greatest(0, coalesce(m.mastery_threshold, 80)))::int) as expected_passed
from public.lesson_progress lp
join public.lessons l on l.id = lp.lesson_id
join public.modules m on m.id = l.module_id
where lp.posttest_passed is distinct from
  (lp.posttest_score is not null and lp.posttest_score >= least(100, greatest(0, coalesce(m.mastery_threshold, 80)))::int)
order by lp.updated_at desc
limit 200;

-- 6) Calibration signal check:
--    pastikan submit PRE/POST sudah emit sinyal dari source lesson_assessment.
select
  cs.recorded_at,
  cs.user_id,
  cs.signal_type,
  cs.dimension,
  cs.metadata->>'assessmentType' as assessment_type,
  cs.metadata->>'passed' as passed,
  cs.metadata->>'passThreshold' as pass_threshold,
  cs.metadata->>'lessonId' as lesson_id_meta,
  cs.metadata->>'moduleId' as module_id_meta
from public.calibration_signals cs
where cs.metadata->>'source' = 'lesson_assessment'
order by cs.recorded_at desc
limit 200;

-- 7A) Per-student signal contribution by source (lesson_assessment vs lainnya)
--     Tujuan: melihat bobot kontribusi signal dari lesson assessment terhadap total engine input.
select
  cs.user_id,
  coalesce(cs.metadata->>'source', 'unknown') as source,
  count(*) as signal_count,
  round(100.0 * count(*) / nullif(sum(count(*)) over (partition by cs.user_id), 0), 2) as pct_within_user
from public.calibration_signals cs
group by cs.user_id, coalesce(cs.metadata->>'source', 'unknown')
order by cs.user_id, signal_count desc;

-- 7B) Per-student summary: lesson_assessment vs non-lesson_assessment
--     Cocok untuk kartu dashboard ringkas.
select
  cs.user_id,
  count(*) as total_signals,
  count(*) filter (where cs.metadata->>'source' = 'lesson_assessment') as lesson_signals,
  count(*) filter (where coalesce(cs.metadata->>'source', '') <> 'lesson_assessment') as non_lesson_signals,
  round(
    100.0 * count(*) filter (where cs.metadata->>'source' = 'lesson_assessment') / nullif(count(*), 0),
    2
  ) as lesson_signal_share_pct,
  max(cs.recorded_at) as latest_signal_at
from public.calibration_signals cs
group by cs.user_id
order by latest_signal_at desc nulls last, lesson_signal_share_pct desc;

-- 7C) Detail terbaru per siswa (timeline cepat, 1000 baris)
--     Filter manual di SQL Editor bila perlu: tambahkan WHERE cs.user_id = '<uuid>'
select
  cs.recorded_at,
  cs.user_id,
  cs.signal_type,
  cs.dimension,
  coalesce(cs.metadata->>'source', 'unknown') as source,
  cs.metadata->>'assessmentType' as assessment_type,
  cs.metadata->>'passed' as passed,
  cs.metadata->>'passThreshold' as pass_threshold,
  cs.metadata->>'lessonId' as lesson_id_meta,
  cs.metadata->>'moduleId' as module_id_meta
from public.calibration_signals cs
order by cs.recorded_at desc
limit 1000;
