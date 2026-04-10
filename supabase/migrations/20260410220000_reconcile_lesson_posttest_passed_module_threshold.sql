-- Selaraskan data lama: posttest_passed dan completed_at mengikuti modules.mastery_threshold
-- (sesuai logika aplikasi). Idempotent: aman dijalankan ulang.
-- Guarded untuk preview branch saat tabel belum tersedia.
DO $$
BEGIN
  IF to_regclass('public.lesson_progress') IS NOT NULL
     AND to_regclass('public.lessons') IS NOT NULL
     AND to_regclass('public.modules') IS NOT NULL THEN
    EXECUTE $sql$
      WITH thresholds AS (
        SELECT
          lp.id AS progress_id,
          LEAST(100, GREATEST(0, COALESCE(m.mastery_threshold, 80)))::integer AS pass_threshold
        FROM public.lesson_progress lp
        INNER JOIN public.lessons l ON l.id = lp.lesson_id
        INNER JOIN public.modules m ON m.id = l.module_id
      )
      UPDATE public.lesson_progress lp
      SET
        posttest_passed = (
          lp.posttest_score IS NOT NULL
          AND lp.posttest_score >= t.pass_threshold
        ),
        completed_at = CASE
          WHEN lp.posttest_score IS NOT NULL AND lp.posttest_score >= t.pass_threshold
          THEN COALESCE(lp.completed_at, NOW())
          ELSE NULL
        END,
        updated_at = NOW()
      FROM thresholds t
      WHERE lp.id = t.progress_id;
    $sql$;
  END IF;
END $$;
