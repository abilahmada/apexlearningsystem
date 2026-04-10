-- Soal pre-test dan post-test terpisah per lesson (generator AI / admin).
-- Jika null, API tetap memakai kolom legacy `questions`.

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS questions_pre JSONB,
  ADD COLUMN IF NOT EXISTS questions_post JSONB;

COMMENT ON COLUMN public.quizzes.questions_pre IS 'MCQ untuk PRE (target 5 soal). Kosong = fallback ke questions.';
COMMENT ON COLUMN public.quizzes.questions_post IS 'MCQ untuk POST (target 10 soal). Kosong = fallback ke questions.';
