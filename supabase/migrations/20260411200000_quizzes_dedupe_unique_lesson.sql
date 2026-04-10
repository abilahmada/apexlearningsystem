-- Satu lesson = satu baris quiz. Hapus duplikat (pertahankan id terkecil), lalu unique index.
DO $$
BEGIN
  IF to_regclass('public.quizzes') IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM public.quizzes q1
  WHERE q1.lesson_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.quizzes q2
      WHERE q2.lesson_id = q1.lesson_id
        AND q2.id < q1.id
    );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_quizzes_lesson_id ON public.quizzes (lesson_id);
END $$;
