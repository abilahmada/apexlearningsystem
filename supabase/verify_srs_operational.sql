-- ============================================================================
-- RUNBOOK OPERASIONAL — SRS (SM-2) queue/review health check
-- Lokasi repo: apex-frontend/supabase/verify_srs_operational.sql
--
-- Tujuan:
--   1) Memastikan data SRS konsisten (tanpa orphan/duplikat).
--   2) Memantau distribusi due/new/mature cards per siswa.
--   3) Mengecek parameter SM-2 (ease_factor, interval_days, repetitions).
--
-- Cara pakai:
--   - Jalankan per blok query (dipisah ';') di Supabase SQL Editor.
--   - Untuk analisis satu siswa, tambahkan filter:
--       where student_id = '<uuid-student-profile>'
--
-- Traffic light (interpretasi cepat):
--   HIJAU
--     • Q2 orphan = 0 dan Q3 duplicate = 0
--     • Q4 invalid SM-2 rows = 0
--     • Q5 due_cards mayoritas siswa tidak menumpuk ekstrem
--     • Q6 mature_share_pct naik seiring waktu (belajar stabil)
--
--   KUNING
--     • Orphan/duplicate ada tapi kecil dan stagnan
--     • due_cards menumpuk pada sebagian siswa (perlu nudge / schedule tuning)
--     • mature_share_pct rendah pada cohort baru (masih wajar)
--
--   MERAH
--     • Q2/Q3/Q4 ada banyak baris (integritas / bug data)
--     • due_cards tinggi hampir semua siswa (antrean tidak terselesaikan)
--     • coverage Q7 sangat rendah lama (kartu ada tapi tidak direview)
--
-- Tindak lanjut cepat:
--   1) Merah Q2/Q3/Q4 -> perbaiki data + cek route /api/learning/srs/review
--   2) Merah Q5/Q7 -> dorong engagement (UI reminder, jadwal belajar, seed kartu)
--   3) Kuning Q6 -> evaluasi kualitas konten kartu (question/answer clarity)
-- ============================================================================

-- 1) Basic table volume
select
  (select count(*) from public.srs_flashcards) as total_flashcards,
  (select count(*) from public.srs_reviews) as total_review_rows;

-- 2) Orphan guard (harus 0 semua)
select
  sum(case when sp.id is null then 1 else 0 end) as orphan_student_rows,
  sum(case when sf.id is null then 1 else 0 end) as orphan_flashcard_rows
from public.srs_reviews sr
left join public.student_profiles sp on sp.id = sr.student_id
left join public.srs_flashcards sf on sf.id = sr.flashcard_id;

-- 3) Duplicate guard by (student_id, flashcard_id) (harus 0 baris)
select
  student_id,
  flashcard_id,
  count(*) as duplicate_count
from public.srs_reviews
group by student_id, flashcard_id
having count(*) > 1
order by duplicate_count desc;

-- 4) SM-2 parameter sanity check (harus 0 baris)
--    Rules app:
--      ease_factor >= 1.3
--      interval_days >= 0
--      repetitions >= 0
select
  id,
  student_id,
  flashcard_id,
  ease_factor,
  interval_days,
  repetitions
from public.srs_reviews
where ease_factor < 1.3
   or interval_days < 0
   or repetitions < 0
order by id desc
limit 200;

-- 5) Due queue size per student (praktis untuk cek beban antrian)
select
  sr.student_id,
  count(*) filter (where sr.next_review_date <= now()) as due_cards,
  count(*) filter (where sr.next_review_date > now()) as scheduled_cards,
  count(*) as total_reviewed_cards
from public.srs_reviews sr
group by sr.student_id
order by due_cards desc, total_reviewed_cards desc;

-- 6) Mature cards per student
--    Mature = interval_days >= 21 AND repetitions >= 3 (sama dengan API queue)
select
  sr.student_id,
  count(*) filter (where sr.interval_days >= 21 and sr.repetitions >= 3) as mature_cards,
  count(*) as total_reviewed_cards,
  round(
    100.0 * count(*) filter (where sr.interval_days >= 21 and sr.repetitions >= 3) / nullif(count(*), 0),
    2
  ) as mature_share_pct
from public.srs_reviews sr
group by sr.student_id
order by mature_share_pct desc nulls last, mature_cards desc;

-- 7) Coverage per student grade (kartu grade vs sudah direview)
with grade_flashcards as (
  select
    sp.id as student_id,
    count(sf.id) as total_grade_cards
  from public.student_profiles sp
  join public.courses c on c.grade_level = sp.grade_level
  join public.modules m on m.course_id = c.id
  join public.srs_flashcards sf on sf.module_id = m.id
  group by sp.id
),
reviewed as (
  select
    student_id,
    count(*) as reviewed_cards
  from public.srs_reviews
  group by student_id
)
select
  gf.student_id,
  gf.total_grade_cards,
  coalesce(r.reviewed_cards, 0) as reviewed_cards,
  greatest(gf.total_grade_cards - coalesce(r.reviewed_cards, 0), 0) as new_cards_remaining,
  round(100.0 * coalesce(r.reviewed_cards, 0) / nullif(gf.total_grade_cards, 0), 2) as reviewed_coverage_pct
from grade_flashcards gf
left join reviewed r on r.student_id = gf.student_id
order by reviewed_coverage_pct asc nulls first, new_cards_remaining desc;

-- 8) Due cards detail (top 200) untuk troubleshooting cepat
select
  sr.student_id,
  sr.flashcard_id,
  sf.module_id,
  m.title as module_title,
  sr.ease_factor,
  sr.interval_days,
  sr.repetitions,
  sr.next_review_date
from public.srs_reviews sr
join public.srs_flashcards sf on sf.id = sr.flashcard_id
left join public.modules m on m.id = sf.module_id
where sr.next_review_date <= now()
order by sr.next_review_date asc
limit 200;
