-- Lapis 1: intake interview + bank soal CAT (generated) + attempts
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.intake_interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  assessment_session_id UUID NOT NULL REFERENCES public.assessment_sessions (id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'ABANDONED')),
  generated_bank JSONB NOT NULL DEFAULT '[]'::jsonb,
  placement_levels JSONB,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_intake_interviews_user_session
  ON public.intake_interviews (user_id, assessment_session_id);
CREATE INDEX IF NOT EXISTS idx_intake_interviews_session_status
  ON public.intake_interviews (assessment_session_id, status);

CREATE TABLE IF NOT EXISTS public.intake_conversation_turns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id UUID NOT NULL REFERENCES public.intake_interviews (id) ON DELETE CASCADE,
  seq_no INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('system', 'assistant', 'user')),
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_intake_conversation_turns_interview
  ON public.intake_conversation_turns (interview_id, seq_no);

CREATE TABLE IF NOT EXISTS public.intake_item_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id UUID NOT NULL REFERENCES public.intake_interviews (id) ON DELETE CASCADE,
  assessment_session_id UUID NOT NULL REFERENCES public.assessment_sessions (id) ON DELETE CASCADE,
  bank_item_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  dimension TEXT NOT NULL,
  scored_points DOUBLE PRECISION,
  max_points DOUBLE PRECISION NOT NULL DEFAULT 1,
  theta_estimate_after DOUBLE PRECISION,
  learner_response JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_intake_item_attempts_interview
  ON public.intake_item_attempts (interview_id, seq);
CREATE INDEX IF NOT EXISTS idx_intake_item_attempts_session
  ON public.intake_item_attempts (assessment_session_id);

-- DB lama: tabel sudah ada tanpa kolom penuh — CREATE TABLE IF NOT EXISTS tidak meng-upgrade.
ALTER TABLE public.intake_interviews
  ADD COLUMN IF NOT EXISTS generated_bank JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS placement_levels JSONB,
  ADD COLUMN IF NOT EXISTS summary JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON TABLE public.intake_interviews IS 'Lapis 1 intake: bank soal CAT (JSON) + status wawancara.';
COMMENT ON COLUMN public.intake_interviews.generated_bank IS 'Array item MCQ hasil AI/fallback untuk sesi ini.';
COMMENT ON COLUMN public.intake_interviews.placement_levels IS 'Per dimensi placement level 1–3 setelah complete.';
