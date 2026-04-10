-- Speed up due-card queries: student + next_review_date range scans.
-- Guarded so preview branches do not fail when srs_reviews is absent.
DO $$
BEGIN
  IF to_regclass('public.srs_reviews') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_srs_reviews_student_next_review
      ON public.srs_reviews (student_id, next_review_date);
  END IF;
END $$;
