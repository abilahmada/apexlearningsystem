-- Baseline fase modul per siswa (opsional; fallback ke assessment_session di API jika null).
DO $$
BEGIN
  IF to_regclass('public.student_profiles') IS NOT NULL THEN
    ALTER TABLE public.student_profiles
      ADD COLUMN IF NOT EXISTS placement_phase integer;
    COMMENT ON COLUMN public.student_profiles.placement_phase IS
      'Integer >= 1: baseline unlock modul per fase; opsional.';
  END IF;
END $$;
