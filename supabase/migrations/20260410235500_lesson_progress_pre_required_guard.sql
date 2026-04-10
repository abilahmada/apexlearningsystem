-- DB-level guard: posttest tidak boleh disimpan jika pretest belum ada.
-- Tujuan: anti-bypass di luar API (SQL/manual/service-role direct write).

CREATE OR REPLACE FUNCTION public.enforce_lesson_progress_pre_required()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF new.posttest_score IS NOT NULL AND new.pretest_score IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'LESSON_PROGRESS_POSTTEST_REQUIRES_PRETEST';
  END IF;

  IF new.posttest_passed = true AND new.pretest_score IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'LESSON_PROGRESS_POSTTEST_REQUIRES_PRETEST';
  END IF;

  RETURN new;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.lesson_progress') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_lesson_progress_pre_required ON public.lesson_progress;

    CREATE TRIGGER trg_lesson_progress_pre_required
    BEFORE INSERT OR UPDATE ON public.lesson_progress
    FOR EACH ROW
    EXECUTE PROCEDURE public.enforce_lesson_progress_pre_required();
  END IF;
END $$;

