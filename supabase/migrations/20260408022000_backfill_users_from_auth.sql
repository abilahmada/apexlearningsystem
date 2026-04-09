-- Backfill existing auth.users rows into public.users.
-- Useful when trigger was added after some users already existed.

INSERT INTO public.users (email, password_hash, role)
SELECT
  au.email,
  'SUPABASE_AUTH_MANAGED',
  CASE
    WHEN upper(coalesce(au.raw_user_meta_data ->> 'role', 'STUDENT')) IN ('STUDENT', 'PARENT', 'MENTOR', 'ADMIN')
      THEN upper(coalesce(au.raw_user_meta_data ->> 'role', 'STUDENT'))::user_role
    ELSE 'STUDENT'::user_role
  END
FROM auth.users au
WHERE au.email IS NOT NULL
ON CONFLICT (email) DO UPDATE
SET role = EXCLUDED.role;
