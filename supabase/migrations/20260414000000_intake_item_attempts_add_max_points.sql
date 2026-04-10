-- Patch: intake_item_attempts was created by an older migration that pre-dates
-- the max_points column. CREATE TABLE IF NOT EXISTS in 20260412180000_intake_layer1.sql
-- is a no-op when the table already exists, so the column was never added.

DO $$
BEGIN
  IF to_regclass('public.intake_item_attempts') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name   = 'intake_item_attempts'
         AND column_name  = 'max_points'
     ) THEN
    ALTER TABLE public.intake_item_attempts
      ADD COLUMN max_points DOUBLE PRECISION NOT NULL DEFAULT 1;
  END IF;
END $$;
