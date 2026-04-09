-- Phase 3: Minimal remediation queue for calibration follow-up actions

CREATE TABLE IF NOT EXISTS public.assessment_remediation_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.assessment_sessions(id) ON DELETE SET NULL,
  dimension TEXT NOT NULL,
  concept_key TEXT NOT NULL,
  reason TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH')),
  source_signal TEXT NOT NULL DEFAULT 'ERROR_PATTERN',
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'DONE', 'DISMISSED')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_assessment_remediation_queue_user_status
  ON public.assessment_remediation_queue(user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_assessment_remediation_queue_dimension
  ON public.assessment_remediation_queue(dimension, status);

-- Prevent duplicate active queue items for same concept per student
CREATE UNIQUE INDEX IF NOT EXISTS uq_assessment_remediation_active
  ON public.assessment_remediation_queue(user_id, dimension, concept_key)
  WHERE status IN ('PENDING', 'IN_PROGRESS');

