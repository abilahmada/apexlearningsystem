-- Anchor untuk siklus review penempatan berkala (4–6 minggu) setelah kunci + validasi orang tua.

ALTER TABLE public.assessment_sessions
  ADD COLUMN IF NOT EXISTS last_continuous_review_at TIMESTAMPTZ;

COMMENT ON COLUMN public.assessment_sessions.last_continuous_review_at IS
  'Waktu review penempatan berkala terakhir; due berikutnya = COALESCE(last_continuous_review_at, placement_locked_at, parent_validated_at) + interval produk.';
