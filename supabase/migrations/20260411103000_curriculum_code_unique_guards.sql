DO $$
BEGIN
  IF to_regclass('public.modules') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_modules_grade_module_code
      ON public.modules (
        upper(coalesce(metadata->>'grade', '')),
        upper(coalesce(metadata->>'module_code', ''))
      )
      WHERE coalesce(metadata->>'module_code', '') <> '';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.lessons') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_lessons_grade_lesson_code
      ON public.lessons (
        upper(coalesce(metadata->>'grade', '')),
        upper(coalesce(metadata->>'lesson_code', metadata->>'code', ''))
      )
      WHERE coalesce(metadata->>'lesson_code', metadata->>'code', '') <> '';
  END IF;
END $$;
