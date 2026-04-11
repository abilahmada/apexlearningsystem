-- Profil: URL avatar disimpan di public.users; file di bucket storage publik `avatars`.

DO $mig$
BEGIN
  IF to_regclass('public.users') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_url text';
    EXECUTE format(
      'COMMENT ON COLUMN public.users.avatar_url IS %L',
      'Public URL ke objek di bucket storage avatars (path: user_id/avatar.jpg).'
    );
  END IF;
END
$mig$;

-- Bucket publik agar <img src="..."> tanpa signed URL (tulis hanya lewat service role / API).
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE
SET
  public = true,
  name = EXCLUDED.name;

DO $pol$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'storage' AND c.relname = 'objects' AND c.relrowsecurity) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'avatars_public_read'
    ) THEN
      CREATE POLICY avatars_public_read ON storage.objects
        FOR SELECT TO public
        USING (bucket_id = 'avatars');
    END IF;
  END IF;
END
$pol$;
