DO $mig$
BEGIN
  IF to_regclass('public.student_profiles') IS NOT NULL THEN
    CREATE TABLE IF NOT EXISTS public.student_progress_grade_archives (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      student_profile_id uuid NOT NULL,
      user_id uuid NULL,
      from_grade text NOT NULL,
      to_grade text NOT NULL,
      archived_at timestamptz NOT NULL DEFAULT now(),
      reason text NOT NULL DEFAULT 'GRADE_CHANGE',
      lesson_progress_count integer NOT NULL DEFAULT 0,
      assessment_attempt_count integer NOT NULL DEFAULT 0,
      lesson_progress_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
      assessment_attempt_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb
    );

    CREATE INDEX IF NOT EXISTS idx_student_progress_grade_archives_student_profile
      ON public.student_progress_grade_archives (student_profile_id, archived_at DESC);
  END IF;
END
$mig$;

DO $fn$
BEGIN
  IF to_regclass('public.student_profiles') IS NOT NULL
     AND to_regclass('public.lesson_progress') IS NOT NULL
     AND to_regclass('public.lesson_assessment_attempts') IS NOT NULL THEN
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.archive_student_progress_on_grade_change()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $body$
      DECLARE
        v_lesson_progress_snapshot jsonb;
        v_attempt_snapshot jsonb;
        v_lesson_progress_count integer;
        v_attempt_count integer;
      BEGIN
        IF COALESCE(OLD.grade_level::text, '') = COALESCE(NEW.grade_level::text, '') THEN
          RETURN NEW;
        END IF;

        SELECT
          COALESCE(jsonb_agg(to_jsonb(lp) ORDER BY lp.lesson_id), '[]'::jsonb),
          COUNT(*)::integer
        INTO v_lesson_progress_snapshot, v_lesson_progress_count
        FROM public.lesson_progress lp
        WHERE lp.student_id = OLD.id;

        SELECT
          COALESCE(jsonb_agg(to_jsonb(la) ORDER BY la.created_at), '[]'::jsonb),
          COUNT(*)::integer
        INTO v_attempt_snapshot, v_attempt_count
        FROM public.lesson_assessment_attempts la
        WHERE la.student_id = OLD.id;

        INSERT INTO public.student_progress_grade_archives (
          student_profile_id,
          user_id,
          from_grade,
          to_grade,
          lesson_progress_count,
          assessment_attempt_count,
          lesson_progress_snapshot,
          assessment_attempt_snapshot
        ) VALUES (
          OLD.id,
          OLD.user_id,
          OLD.grade_level::text,
          NEW.grade_level::text,
          v_lesson_progress_count,
          v_attempt_count,
          v_lesson_progress_snapshot,
          v_attempt_snapshot
        );

        DELETE FROM public.lesson_assessment_attempts
        WHERE student_id = OLD.id;

        DELETE FROM public.lesson_progress
        WHERE student_id = OLD.id;

        RETURN NEW;
      END
      $body$;
    $sql$;
  END IF;
END
$fn$;

DO $trg$
BEGIN
  IF to_regclass('public.student_profiles') IS NOT NULL
     AND to_regclass('public.lesson_progress') IS NOT NULL
     AND to_regclass('public.lesson_assessment_attempts') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_archive_student_progress_on_grade_change ON public.student_profiles;
    CREATE TRIGGER trg_archive_student_progress_on_grade_change
    BEFORE UPDATE OF grade_level ON public.student_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.archive_student_progress_on_grade_change();
  END IF;
END
$trg$;
