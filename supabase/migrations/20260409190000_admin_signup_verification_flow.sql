-- Admin approval flow for public signup.
-- New users are created as email-confirmed, but blocked from app until admin approves.

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS registration_approved BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS registration_approved_at TIMESTAMPTZ;

-- Existing accounts before this migration remain valid.
UPDATE public.users
SET registration_approved = TRUE,
    registration_approved_at = COALESCE(registration_approved_at, NOW())
WHERE registration_approved = FALSE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'registration_verification_status') THEN
    CREATE TYPE registration_verification_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.registration_verifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  role user_role NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  token_hash TEXT NOT NULL UNIQUE,
  status registration_verification_status NOT NULL DEFAULT 'PENDING',
  expires_at TIMESTAMPTZ NOT NULL,
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_registration_verifications_user_id
  ON public.registration_verifications(user_id);

CREATE INDEX IF NOT EXISTS idx_registration_verifications_status
  ON public.registration_verifications(status);

