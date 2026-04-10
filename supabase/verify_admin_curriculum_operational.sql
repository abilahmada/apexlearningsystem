-- ============================================================================
-- RUNBOOK OPERASIONAL — Admin curriculum (courses → modules → lessons → quizzes)
-- Lokasi repo: apex-frontend/supabase/verify_admin_curriculum_operational.sql
--
-- Cara pakai:
--   - Jalankan per blok query di Supabase SQL Editor.
--   - Filter course_id / module_id jika audit satu jalur konten saja.
--
-- Traffic light:
--   HIJAU — orphan = 0, duplikat sequence = 0, quiz tanpa soal = 0 (atau disengaja draft).
--   KUNING — modul/kursus tanpa lesson (draft); lesson tanpa quiz (belum diisi).
--   MERAH — FK putus, quiz orphan, duplikat (course_id, sequence_order).
--
-- Tindak lanjut cepat:
--   - Merah Q1/Q2/Q3 → perbaiki data atau jalankan ulang import admin.
--   - Kuning Q4/Q5 → isi konten / generator quiz / bulk CSV.
--   - Kuning Q11 → isi metadata.phase / metadata.subject di modul (filter & fase).
--
-- Sinkron dengan aplikasi (audit kode):
--   - Wizard 1→4: Kursus → Modul (metadata phase/subject/track + mastery_threshold) →
--     Lesson (metadata code/benchmark) → Quiz JSON legacy `questions`.
--   - Generator Claude / API lesson-quiz menulis questions_pre & questions_post;
--     bulk-quiz CSV & wizard quiz tab hanya mengisi kolom `questions` (legacy).
--   - GET /api/admin/content?type=quizzes mengembalikan questions_pre/post; POST/PUT quiz menerima ketiga kolom dari admin.
--   - Bulk quiz CSV: kolom opsional bank (legacy / pre / post) mengisi questions vs questions_pre vs questions_post per lesson.
-- ============================================================================

-- 1) modules: course_id harus valid
select
  m.id as module_id,
  m.course_id,
  m.title
from public.modules m
left join public.courses c on c.id = m.course_id
where c.id is null
limit 200;

-- 2) lessons: module_id harus valid
select
  l.id as lesson_id,
  l.module_id,
  l.title
from public.lessons l
left join public.modules mo on mo.id = l.module_id
where mo.id is null
limit 200;

-- 3) quizzes: lesson_id harus valid (orphan quiz)
select
  q.id as quiz_id,
  q.lesson_id
from public.quizzes q
left join public.lessons l on l.id = q.lesson_id
where l.id is null
limit 200;

-- 4) Kursus tanpa modul (konten kosong di level course)
select
  c.id as course_id,
  c.title,
  c.grade_level::text as grade_level
from public.courses c
where not exists (select 1 from public.modules m where m.course_id = c.id)
order by c.title;

-- 5) Modul tanpa lesson
select
  m.id as module_id,
  m.title as module_title,
  c.title as course_title,
  c.grade_level::text as grade_level
from public.modules m
join public.courses c on c.id = m.course_id
where not exists (select 1 from public.lessons l where l.module_id = m.id)
order by c.title, m.sequence_order;

-- 6) Lesson tanpa baris quiz (belum ada bank soal sama sekali)
select
  l.id as lesson_id,
  l.title as lesson_title,
  m.title as module_title
from public.lessons l
join public.modules m on m.id = l.module_id
where not exists (select 1 from public.quizzes q where q.lesson_id = l.id)
order by m.title, l.created_at
limit 500;

-- 6b) Lebih dari satu baris quiz untuk lesson_id yang sama (harus 0 baris setelah migrasi uq_quizzes_lesson_id)
select
  q.lesson_id,
  count(*) as quiz_row_count,
  array_agg(q.id order by q.id) as quiz_ids
from public.quizzes q
where q.lesson_id is not null
group by q.lesson_id
having count(*) > 1
order by quiz_row_count desc
limit 200;

-- 7) Quiz ada tapi questions + questions_pre + questions_post semuanya kosong/tidak ada isi
--    (JSON array kosong atau null pada kolom opsional)
select
  q.id as quiz_id,
  q.lesson_id,
  coalesce(jsonb_array_length(q.questions), 0) as legacy_len,
  coalesce(jsonb_array_length(q.questions_pre), 0) as pre_len,
  coalesce(jsonb_array_length(q.questions_post), 0) as post_len
from public.quizzes q
where
  coalesce(jsonb_array_length(q.questions), 0) = 0
  and coalesce(jsonb_array_length(q.questions_pre), 0) = 0
  and coalesce(jsonb_array_length(q.questions_post), 0) = 0
limit 200;

-- Catatan: jika kolom questions_pre/questions_post belum ada di DB lama, query ini error —
--         hapus baris coalesce(...questions_pre/post...) atau migrate dulu.

-- 8) Duplikat sequence_order dalam satu course (seharusnya dicegah UNIQUE; harus 0 baris)
select
  m.course_id,
  m.sequence_order,
  count(*) as cnt
from public.modules m
group by m.course_id, m.sequence_order
having count(*) > 1;

-- 9) Modul: mastery_threshold di luar 0–100 (melanggar CHECK; harus 0 baris)
select
  m.id,
  m.title,
  m.mastery_threshold
from public.modules m
where m.mastery_threshold is not null
  and (m.mastery_threshold < 0 or m.mastery_threshold > 100)
limit 200;

-- 10) Ringkasan volume per grade (kursus / modul / lesson / quiz)
select
  c.grade_level::text as grade_level,
  count(distinct c.id) as courses,
  count(distinct m.id) as modules,
  count(distinct l.id) as lessons,
  count(distinct q.id) as quizzes
from public.courses c
left join public.modules m on m.course_id = c.id
left join public.lessons l on l.module_id = m.id
left join public.quizzes q on q.lesson_id = l.id
group by c.grade_level
order by grade_level;

-- 11) Modul tanpa phase atau subject (kuning: filter admin & urutan fase di /api/learning/modules)
select
  m.id as module_id,
  m.title as module_title,
  c.title as course_title,
  c.grade_level::text as grade_level,
  nullif(trim(m.metadata->>'phase'), '') as phase,
  nullif(trim(m.metadata->>'subject'), '') as subject,
  nullif(trim(m.metadata->>'track'), '') as track
from public.modules m
join public.courses c on c.id = m.course_id
where nullif(trim(m.metadata->>'phase'), '') is null
   or nullif(trim(m.metadata->>'subject'), '') is null
order by c.title, m.sequence_order
limit 500;

-- 12) Modul dengan metadata lanjutan (jadwal / layer / fase produk) — snapshot volume
select
  count(*) filter (where m.metadata ? 'scheduleDays') as modules_with_schedule_days,
  count(*) filter (where m.metadata ? 'phaseOrder') as modules_with_phase_order,
  count(*) filter (where m.metadata ? 'allowedProductPhases') as modules_with_allowed_product_phases,
  count(*) filter (where m.metadata ? 'minAssessmentLayer') as modules_with_min_assessment_layer,
  count(*) as total_modules
from public.modules m;

-- 13) Quiz: hanya legacy `questions` terisi, pre/post kosong (kuning jika target PRE/POST terpisah)
--     Catatan: butuh kolom questions_pre/questions_post (sama seperti Q7); jika belum migrate, skip query ini.
select
  q.id as quiz_id,
  q.lesson_id,
  coalesce(jsonb_array_length(q.questions), 0) as legacy_len,
  coalesce(jsonb_array_length(q.questions_pre), 0) as pre_len,
  coalesce(jsonb_array_length(q.questions_post), 0) as post_len
from public.quizzes q
where coalesce(jsonb_array_length(q.questions), 0) > 0
  and coalesce(jsonb_array_length(q.questions_pre), 0) = 0
  and coalesce(jsonb_array_length(q.questions_post), 0) = 0
order by q.created_at desc
limit 200;
