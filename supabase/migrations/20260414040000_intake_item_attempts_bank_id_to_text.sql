-- The fallback intake bank previously used slug IDs (e.g. "fb-kognitif-3").
-- These are stored in intake_interviews.generated_bank JSONB and passed as
-- bank_item_id on item_attempt inserts. If the live column is UUID type,
-- any slug ID causes "invalid input syntax for type uuid".
--
-- Fix: change bank_item_id to TEXT so both UUID and slug IDs are accepted.
-- Existing UUID values remain valid TEXT values — no data loss.

DO $$
BEGIN
  IF to_regclass('public.intake_item_attempts') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'intake_item_attempts'
        AND column_name  = 'bank_item_id'
        AND data_type    = 'uuid'
    ) THEN
      ALTER TABLE public.intake_item_attempts
        ALTER COLUMN bank_item_id TYPE TEXT USING bank_item_id::text;
    END IF;
  END IF;
END $$;
