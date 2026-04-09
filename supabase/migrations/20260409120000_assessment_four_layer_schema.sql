-- APEX Assessment: empat lapis (Intake adaptif → Kalibrasi dinamis → Radar kompetensi → Validasi orang tua)
-- Lapis 2–3 inti sudah ada di assessment_sessions / competency_profiles / calibration_signals.
-- Migrasi ini menambah penyimpanan Lapis 1 (intake interview + CAT + skenario + baseline Islam),
-- label tampilan radar per dimensi, dan perluasan Lapis 4 (saluran validasi orang tua).

-- ─── Lapis 1: satu rekaman intake per assessment session ───────────────────
CREATE TABLE IF NOT EXISTS public.intake_interviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  assessment_session_id UUID NOT NULL REFERENCES public.assessment_sessions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'IN_PROGRESS'
    CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'ABANDONED')),
  target_duration_minutes SMALLINT NOT NULL DEFAULT 20,
  -- Ringkasan hasil tiga jalur paralel (AI Socrates + CAT + skenario + baseline Islam)
  academic_cat_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  character_scenario_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  islamic_baseline JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Theta/proksi 6 dimensi hasil intake (input ke provisional placement / radar awal)
  combined_intake_theta JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Label human-readable per dimensi untuk radar Lapis 3 (mis. "Matematika ≈ SMP Kelas 8")
  dimension_display_labels JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(assessment_session_id)
);

CREATE INDEX IF NOT EXISTS idx_intake_interviews_user
  ON public.intake_interviews(user_id, status);
CREATE INDEX IF NOT EXISTS idx_intake_interviews_session
  ON public.intake_interviews(assessment_session_id);

-- Percakapan terstruktur AI Socrates (turn-by-turn)
CREATE TABLE IF NOT EXISTS public.intake_conversation_turns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  interview_id UUID NOT NULL REFERENCES public.intake_interviews(id) ON DELETE CASCADE,
  seq_no INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('system', 'assistant', 'user')),
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(interview_id, seq_no)
);

CREATE INDEX IF NOT EXISTS idx_intake_conversation_turns_interview
  ON public.intake_conversation_turns(interview_id, seq_no);

-- Bank item untuk CAT / soal campuran (pilihan ganda + open-ended singkat)
CREATE TABLE IF NOT EXISTS public.intake_item_bank (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT UNIQUE,
  dimension TEXT NOT NULL,
  subject TEXT,
  item_type TEXT NOT NULL CHECK (item_type IN ('MULTIPLE_CHOICE', 'OPEN_SHORT')),
  difficulty_logit DOUBLE PRECISION,
  stem TEXT NOT NULL,
  options JSONB,
  scoring_rubric JSONB NOT NULL DEFAULT '{}'::jsonb,
  concept_tags TEXT[] NOT NULL DEFAULT '{}'::text[],
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_intake_item_bank_dim_active
  ON public.intake_item_bank(dimension, active);
CREATE INDEX IF NOT EXISTS idx_intake_item_bank_concepts
  ON public.intake_item_bank USING GIN (concept_tags);

-- Setiap penyajian & respons dalam satu interview (jejak CAT adaptif)
CREATE TABLE IF NOT EXISTS public.intake_item_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  interview_id UUID NOT NULL REFERENCES public.intake_interviews(id) ON DELETE CASCADE,
  bank_item_id UUID REFERENCES public.intake_item_bank(id) ON DELETE SET NULL,
  seq INTEGER NOT NULL,
  dimension TEXT NOT NULL,
  difficulty_at_present DOUBLE PRECISION,
  learner_response JSONB NOT NULL DEFAULT '{}'::jsonb,
  scored_points DOUBLE PRECISION,
  theta_estimate_after DOUBLE PRECISION,
  latency_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(interview_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_intake_item_attempts_interview
  ON public.intake_item_attempts(interview_id, seq);

-- Skenario karakter belajar (pertanyaan + respons pilihan atau bebas)
CREATE TABLE IF NOT EXISTS public.intake_scenario_prompts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT UNIQUE,
  dimension_hint TEXT NOT NULL DEFAULT 'karakter',
  scenario_text TEXT NOT NULL,
  response_mode TEXT NOT NULL DEFAULT 'MULTIPLE_CHOICE'
    CHECK (response_mode IN ('MULTIPLE_CHOICE', 'OPEN_SHORT')),
  options JSONB,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.intake_scenario_responses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  interview_id UUID NOT NULL REFERENCES public.intake_interviews(id) ON DELETE CASCADE,
  prompt_id UUID REFERENCES public.intake_scenario_prompts(id) ON DELETE SET NULL,
  response JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_intake_scenario_responses_interview
  ON public.intake_scenario_responses(interview_id);

-- ─── Lapis 3: deskriptor jalur per dimensi (selain enum DEVELOPING..ADVANCED) ──
ALTER TABLE public.competency_profiles
  ADD COLUMN IF NOT EXISTS equivalent_band_label TEXT;

COMMENT ON COLUMN public.competency_profiles.equivalent_band_label IS
  'Label tampilan holistik, mis. tingkat kelas/sekolah per mata pelajaran untuk radar asimetris.';

-- ─── Lapis 4: saluran validasi orang tua (form / video async / gabungan) ─────
ALTER TABLE public.parent_validations
  ADD COLUMN IF NOT EXISTS validation_channel TEXT NOT NULL DEFAULT 'FORM';

ALTER TABLE public.parent_validations
  ADD COLUMN IF NOT EXISTS async_video_url TEXT;

ALTER TABLE public.parent_validations
  ADD COLUMN IF NOT EXISTS session_duration_minutes SMALLINT;

ALTER TABLE public.parent_validations
  ADD COLUMN IF NOT EXISTS structured_session JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'parent_validations_validation_channel_check'
  ) THEN
    ALTER TABLE public.parent_validations
      ADD CONSTRAINT parent_validations_validation_channel_check
      CHECK (validation_channel IN ('FORM', 'ASYNC_VIDEO', 'HYBRID'));
  END IF;
END $$;

COMMENT ON COLUMN public.parent_validations.validation_channel IS
  'FORM: form terstruktur; ASYNC_VIDEO: unggah/video singkat; HYBRID: keduanya.';
COMMENT ON COLUMN public.parent_validations.structured_session IS
  'Jawaban terstruktur sesi ~15 menit (JSON), selain observations bebas.';

COMMENT ON TABLE public.intake_interviews IS
  'Lapis 1 — Intake interview adaptif (~20 menit): akademik CAT + skenario karakter + baseline Islam.';
COMMENT ON TABLE public.intake_item_attempts IS
  'Jejak item CAT adaptif dan respons (termasuk open-ended singkat).';
COMMENT ON TABLE public.intake_scenario_prompts IS
  'Bank skenario karakter belajar (bukan self-report langsung).';
