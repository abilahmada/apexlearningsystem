-- Verifikasi operasional: mutaba'ah harian + sinyal kalibrasi spiritual (setelah migrasi 20260416120000).

-- 1) Tabel ada
select to_regclass('public.student_spiritual_habit_completions') is not null as table_exists;

-- 2) Contoh agregat per siswa / tanggal (ganti UUID student_profiles jika perlu)
-- select student_id, local_date, count(*) as habits_done, sum(points_claimed) as points
-- from public.student_spiritual_habit_completions
-- group by 1, 2
-- order by local_date desc
-- limit 20;

-- 3) Sinyal live terkait event apex.spiritual.daily_habit (metadata JSON)
select cs.id, cs.user_id, cs.dimension, cs.signal_type, cs.recorded_at, cs.metadata->>'event' as event
from public.calibration_signals cs
where cs.metadata->>'event' = 'apex.spiritual.daily_habit'
order by cs.recorded_at desc
limit 20;
