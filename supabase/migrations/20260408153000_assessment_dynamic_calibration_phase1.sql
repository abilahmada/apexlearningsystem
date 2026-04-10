-- Phase 1: Dynamic calibration foundation for assessment

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Compatibility shim:
-- on some Supabase setups, uuid-ossp functions live outside default search_path.
-- Provide a local public.uuid_generate_v4() so legacy defaults keep working.
CREATE OR REPLACE FUNCTION public.uuid_generate_v4()
RETURNS uuid
LANGUAGE sql
AS $$
  SELECT gen_random_uuid();
$$;

CREATE TABLE IF NOT EXISTS public.assessment_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'CALIBRATING' CHECK (status IN ('PENDING', 'ACTIVE', 'CALIBRATING', 'PLACED', 'EXTENDED')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  placement_locked_at TIMESTAMPTZ,
  calibration_ends_at TIMESTAMPTZ,
  sessions_completed INTEGER NOT NULL DEFAULT 0,
  intake_ci DOUBLE PRECISION NOT NULL DEFAULT 2.4,
  intake_theta JSONB NOT NULL DEFAULT '{}'::jsonb,
  final_theta JSONB,
  parent_validated_at TIMESTAMPTZ,
  extension_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_assessment_sessions_status_ends
  ON public.assessment_sessions(status, calibration_ends_at);

CREATE TABLE IF NOT EXISTS public.calibration_signals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.assessment_sessions(id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL CHECK (signal_type IN ('MASTERY_VELOCITY', 'ERROR_PATTERN', 'ENGAGEMENT')),
  dimension TEXT NOT NULL,
  raw_value DOUBLE PRECISION NOT NULL,
  normalized_value DOUBLE PRECISION,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calibration_signals_user_dimension_time
  ON public.calibration_signals(user_id, dimension, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_calibration_signals_session_type
  ON public.calibration_signals(session_id, signal_type);

CREATE TABLE IF NOT EXISTS public.competency_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  dimension TEXT NOT NULL,
  theta DOUBLE PRECISION NOT NULL,
  ci DOUBLE PRECISION NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('DEVELOPING', 'SOLID', 'PROFICIENT', 'ADVANCED')),
  source TEXT NOT NULL CHECK (source IN ('INTAKE', 'CALIBRATION', 'CONTINUOUS_REVIEW', 'MENTOR_OVERRIDE')),
  locked_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, dimension)
);

CREATE TABLE IF NOT EXISTS public.parent_validations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  agreed_with_profile BOOLEAN NOT NULL DEFAULT TRUE,
  adjustments JSONB NOT NULL DEFAULT '{}'::jsonb,
  observations TEXT,
  special_conditions TEXT[] NOT NULL DEFAULT '{}'::text[],
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS public.calibration_flags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  flag_type TEXT NOT NULL CHECK (flag_type IN ('ACCELERATION', 'REMEDIATION', 'MISMATCH', 'INSUFFICIENT_DATA', 'PARENT_DISAGREEMENT', 'EARLY_ALERT')),
  dimension TEXT,
  severity TEXT NOT NULL DEFAULT 'LOW' CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calibration_flags_user_resolved
  ON public.calibration_flags(user_id, resolved);

