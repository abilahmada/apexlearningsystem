-- Speed up due-card queries: student + next_review_date range scans
CREATE INDEX IF NOT EXISTS idx_srs_reviews_student_next_review
  ON public.srs_reviews (student_id, next_review_date);
