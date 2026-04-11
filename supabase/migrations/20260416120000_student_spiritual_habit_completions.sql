-- Log harian mutaba'ah / kebiasaan spiritual per siswa (satu baris per habit per hari kalender lokal).
-- Disinkronkan dari API; memicu sinyal kalibrasi live (lihat apex.spiritual.daily_habit).

DO $mig$
BEGIN
  IF to_regclass('public.student_profiles') IS NULL THEN
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS public.student_spiritual_habit_completions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id uuid NOT NULL REFERENCES public.student_profiles (id) ON DELETE CASCADE,
    habit_key text NOT NULL,
    local_date date NOT NULL,
    points_claimed integer NOT NULL DEFAULT 0 CHECK (points_claimed >= 0 AND points_claimed <= 500),
    completed_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT student_spiritual_habit_completions_unique UNIQUE (student_id, habit_key, local_date)
  );

  CREATE INDEX IF NOT EXISTS idx_student_spiritual_habit_student_date
    ON public.student_spiritual_habit_completions (student_id, local_date DESC);

  CREATE INDEX IF NOT EXISTS idx_student_spiritual_habit_student_key
    ON public.student_spiritual_habit_completions (student_id, habit_key);
END
$mig$;
