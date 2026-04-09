-- ============================================================================
-- Lesson Gating Operational Monitoring
-- Run in Supabase SQL Editor for quick dashboard metrics
-- ============================================================================

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

-- 2) Lessons with most failures (POST < 80 / failed)
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

-- 3A) Average attempts before first pass >= 80 (global)
--     Nilai ini menjawab: rata-rata berapa kali attempt sebelum siswa lulus.
with post_attempts as (
  select
    la.student_id,
    la.lesson_id,
    la.score_pct,
    row_number() over (
      partition by la.student_id, la.lesson_id
      order by la.created_at asc, la.id asc
    ) as attempt_no
  from public.lesson_assessment_attempts la
  where la.assessment_type = 'POST'
),
first_pass as (
  select
    student_id,
    lesson_id,
    min(attempt_no) as attempts_to_pass
  from post_attempts
  where score_pct >= 80
  group by student_id, lesson_id
)
select
  round(avg(attempts_to_pass::numeric), 2) as avg_attempts_before_pass_80,
  percentile_cont(0.5) within group (order by attempts_to_pass) as median_attempts_before_pass_80,
  count(*) as student_lesson_pairs_passed
from first_pass;

-- 3B) Average attempts before first pass >= 80 (per lesson)
--     Berguna untuk lihat lesson mana yang butuh attempt terbanyak sebelum pass.
with post_attempts as (
  select
    la.student_id,
    la.lesson_id,
    la.score_pct,
    row_number() over (
      partition by la.student_id, la.lesson_id
      order by la.created_at asc, la.id asc
    ) as attempt_no
  from public.lesson_assessment_attempts la
  where la.assessment_type = 'POST'
),
first_pass as (
  select
    student_id,
    lesson_id,
    min(attempt_no) as attempts_to_pass
  from post_attempts
  where score_pct >= 80
  group by student_id, lesson_id
)
select
  l.id as lesson_id,
  l.title as lesson_title,
  m.title as module_title,
  c.grade_level,
  round(avg(fp.attempts_to_pass::numeric), 2) as avg_attempts_before_pass_80,
  percentile_cont(0.5) within group (order by fp.attempts_to_pass) as median_attempts_before_pass_80,
  count(*) as total_student_pairs_passed
from first_pass fp
join public.lessons l on l.id = fp.lesson_id
join public.modules m on m.id = l.module_id
join public.courses c on c.id = m.course_id
group by l.id, l.title, m.title, c.grade_level
order by avg_attempts_before_pass_80 desc, total_student_pairs_passed desc, lesson_title asc;

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
