-- ============================================================================
-- Verifikasi operasional: konfirmasi siswa "selesai dipelajari" per modul
-- Tabel: public.student_module_study_confirmations
--
-- Cara pakai (Supabase Dashboard → SQL Editor): jalankan per blok; harapkan 0 baris pada query "bad rows".
-- Runbook: apex-frontend/RUNBOOK-OPERASIONAL-MINGGUAN.md
-- ============================================================================

-- 1) Tabel ada (jika migrasi belum dijalankan, blok ini akan error).
SELECT to_regclass('public.student_module_study_confirmations') AS table_regclass;

-- 2) Baris orphan: module_id tidak ada di modules (harus 0).
SELECT c.id, c.student_id, c.module_id
FROM public.student_module_study_confirmations c
LEFT JOIN public.modules m ON m.id = c.module_id
WHERE m.id IS NULL;

-- 3) Baris orphan: student_id tidak ada di student_profiles (harus 0).
SELECT c.id, c.student_id, c.module_id
FROM public.student_module_study_confirmations c
LEFT JOIN public.student_profiles sp ON sp.id = c.student_id
WHERE sp.id IS NULL;

-- 4) Duplikat (student_id, module_id) — seharusnya dicegah UNIQUE (harus 0).
SELECT student_id, module_id, COUNT(*) AS n
FROM public.student_module_study_confirmations
GROUP BY student_id, module_id
HAVING COUNT(*) > 1;
