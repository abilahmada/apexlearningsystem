-- Perbaikan: skema intake lama / partial apply — tabel sudah ada tanpa kolom
-- `assessment_session_id`, sehingga indeks di 20260412180000 gagal (42703).
-- Catatan: di `assessment_sessions` kunci sesi adalah kolom `id`, bukan `assessment_session_id`.

DO $$
BEGIN
  IF to_regclass('public.intake_interviews') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'intake_interviews'
        AND column_name = 'assessment_session_id'
    ) THEN
      ALTER TABLE public.intake_interviews
        ADD COLUMN assessment_session_id UUID REFERENCES public.assessment_sessions (id) ON DELETE CASCADE;
      UPDATE public.intake_interviews i
      SET assessment_session_id = s.id
      FROM public.assessment_sessions s
      WHERE s.user_id = i.user_id AND i.assessment_session_id IS NULL;
      DELETE FROM public.intake_interviews WHERE assessment_session_id IS NULL;
      ALTER TABLE public.intake_interviews ALTER COLUMN assessment_session_id SET NOT NULL;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.intake_item_attempts') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'intake_item_attempts'
        AND column_name = 'assessment_session_id'
    ) THEN
      ALTER TABLE public.intake_item_attempts
        ADD COLUMN assessment_session_id UUID REFERENCES public.assessment_sessions (id) ON DELETE CASCADE;
      UPDATE public.intake_item_attempts a
      SET assessment_session_id = i.assessment_session_id
      FROM public.intake_interviews i
      WHERE i.id = a.interview_id AND a.assessment_session_id IS NULL;
      DELETE FROM public.intake_item_attempts WHERE assessment_session_id IS NULL;
      ALTER TABLE public.intake_item_attempts ALTER COLUMN assessment_session_id SET NOT NULL;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.intake_interviews') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'intake_interviews'
         AND column_name = 'assessment_session_id'
     ) THEN
    EXECUTE $sql$
      CREATE INDEX IF NOT EXISTS idx_intake_interviews_user_session
        ON public.intake_interviews (user_id, assessment_session_id)
    $sql$;
    EXECUTE $sql$
      CREATE INDEX IF NOT EXISTS idx_intake_interviews_session_status
        ON public.intake_interviews (assessment_session_id, status)
    $sql$;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.intake_item_attempts') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'intake_item_attempts'
         AND column_name = 'assessment_session_id'
     ) THEN
    EXECUTE $sql$
      CREATE INDEX IF NOT EXISTS idx_intake_item_attempts_session
        ON public.intake_item_attempts (assessment_session_id)
    $sql$;
  END IF;
END $$;
