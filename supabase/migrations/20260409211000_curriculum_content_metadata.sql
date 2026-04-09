-- Add structured metadata fields for curriculum content ingestion/filtering.
ALTER TABLE public.modules
ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.lessons
ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_modules_metadata_gin
  ON public.modules
  USING gin (metadata);

CREATE INDEX IF NOT EXISTS idx_lessons_metadata_gin
  ON public.lessons
  USING gin (metadata);
