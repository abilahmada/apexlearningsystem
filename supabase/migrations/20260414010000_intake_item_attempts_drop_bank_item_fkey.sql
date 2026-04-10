-- The new Layer-1 CAT architecture stores the item bank inside
-- intake_interviews.generated_bank (JSONB). Item IDs are UUIDs that only
-- exist in that JSON array — there is no separate intake_item_bank table.
-- The FK intake_item_attempts_bank_item_id_fkey (added by an older migration)
-- therefore always rejects inserts. Drop it.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name        = 'intake_item_attempts'
      AND constraint_name   = 'intake_item_attempts_bank_item_id_fkey'
      AND constraint_type   = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE public.intake_item_attempts
      DROP CONSTRAINT intake_item_attempts_bank_item_id_fkey;
  END IF;
END $$;
