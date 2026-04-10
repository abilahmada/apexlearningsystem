DO $$
BEGIN
  IF to_regclass('public.courses') IS NOT NULL THEN
    ALTER TABLE public.courses
      ADD COLUMN IF NOT EXISTS mastery_threshold integer;

    ALTER TABLE public.courses
      DROP CONSTRAINT IF EXISTS courses_mastery_threshold_range;

    ALTER TABLE public.courses
      ADD CONSTRAINT courses_mastery_threshold_range
      CHECK (mastery_threshold IS NULL OR (mastery_threshold >= 0 AND mastery_threshold <= 100));
  END IF;
END $$;
