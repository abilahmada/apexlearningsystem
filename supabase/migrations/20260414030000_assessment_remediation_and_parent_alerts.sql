-- Phase 1 tables: remediation queue (used by /api/assessment/remediation) and
-- parent alerts (used by /api/parent/monitoring).

CREATE TABLE IF NOT EXISTS public.assessment_remediation_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dimension TEXT NOT NULL,
  concept_key TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'RESOLVED')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_remediation_queue_user_status
  ON public.assessment_remediation_queue (user_id, status, priority);

CREATE TABLE IF NOT EXISTS public.parent_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.student_profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'INFO',
  message_content TEXT NOT NULL DEFAULT '',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parent_alerts_parent_read
  ON public.parent_alerts (parent_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_parent_alerts_student
  ON public.parent_alerts (student_id, created_at DESC);
