-- Jadwal mingguan manual per siswa: slot (hari + modul) hanya boleh modul yang valid di DB;
-- validasi unlock dilakukan di API aplikasi.

DO $mig$
BEGIN
  IF to_regclass('public.student_profiles') IS NULL OR to_regclass('public.modules') IS NULL THEN
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS public.student_learning_schedule_slots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id uuid NOT NULL REFERENCES public.student_profiles (id) ON DELETE CASCADE,
    day_key text NOT NULL CHECK (
      day_key = ANY (ARRAY['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']::text[])
    ),
    module_id uuid NOT NULL REFERENCES public.modules (id) ON DELETE CASCADE,
    slot_order int NOT NULL DEFAULT 0,
    time_override text NULL,
    CONSTRAINT student_learning_schedule_slots_student_day_module_key
      UNIQUE (student_id, day_key, module_id)
  );

  CREATE INDEX IF NOT EXISTS idx_student_learning_schedule_slots_student_day
    ON public.student_learning_schedule_slots (student_id, day_key);
END
$mig$;
