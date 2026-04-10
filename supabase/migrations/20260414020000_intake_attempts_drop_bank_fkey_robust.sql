-- Drop any FK constraint on intake_item_attempts.bank_item_id regardless of name.
-- Uses pg_constraint so it works even if the constraint was renamed.

DO $$
DECLARE
  v_constraint TEXT;
BEGIN
  SELECT c.conname INTO v_constraint
  FROM   pg_constraint c
  JOIN   pg_class      t ON t.oid = c.conrelid
  JOIN   pg_namespace  n ON n.oid = t.relnamespace
  JOIN   pg_attribute  a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
  WHERE  n.nspname  = 'public'
    AND  t.relname  = 'intake_item_attempts'
    AND  a.attname  = 'bank_item_id'
    AND  c.contype  = 'f'   -- foreign key
  LIMIT 1;

  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.intake_item_attempts DROP CONSTRAINT %I', v_constraint);
    RAISE NOTICE 'Dropped FK constraint: %', v_constraint;
  ELSE
    RAISE NOTICE 'No FK on bank_item_id found — nothing to drop.';
  END IF;
END $$;
