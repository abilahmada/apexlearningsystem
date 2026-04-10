-- Patch: previous migration (20260414030000) failed because student_profiles
-- may not exist in the migration runner context. Recreate parent_alerts without
-- the FK to student_profiles — student_id is stored as plain UUID.

CREATE TABLE IF NOT EXISTS public.parent_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  type TEXT NOT NULL DEFAULT 'INFO',
  message_content TEXT NOT NULL DEFAULT '',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parent_alerts_parent_read
  ON public.parent_alerts (parent_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_parent_alerts_student
  ON public.parent_alerts (student_id, created_at DESC);
