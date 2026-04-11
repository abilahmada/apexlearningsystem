-- Konfirmasi siswa "selesai dipelajari" per modul (setelah semua lesson lulus post-test).
-- Dipakai Learning Hub / jadwal untuk menandai completed resmi.

DO $mig$
BEGIN
  IF to_regclass('public.student_profiles') IS NULL OR to_regclass('public.modules') IS NULL THEN
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS public.student_module_study_confirmations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id uuid NOT NULL REFERENCES public.student_profiles (id) ON DELETE CASCADE,
    module_id uuid NOT NULL REFERENCES public.modules (id) ON DELETE CASCADE,
    confirmed_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT student_module_study_confirmations_unique UNIQUE (student_id, module_id)
  );

  CREATE INDEX IF NOT EXISTS idx_student_module_confirmations_student
    ON public.student_module_study_confirmations (student_id);

  CREATE INDEX IF NOT EXISTS idx_student_module_confirmations_module
    ON public.student_module_study_confirmations (module_id);
END
$mig$;
