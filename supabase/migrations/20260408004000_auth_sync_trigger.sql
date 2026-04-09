-- Sync Supabase Auth users into public.users table.
-- Role source priority:
-- 1) raw_user_meta_data.role (STUDENT/PARENT/MENTOR/ADMIN)
-- 2) fallback: STUDENT

CREATE OR REPLACE FUNCTION public.handle_auth_user_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_role_text text;
  new_role user_role;
BEGIN
  new_role_text := upper(coalesce(new.raw_user_meta_data ->> 'role', 'STUDENT'));

  IF new_role_text IN ('STUDENT', 'PARENT', 'MENTOR', 'ADMIN') THEN
    new_role := new_role_text::user_role;
  ELSE
    new_role := 'STUDENT'::user_role;
  END IF;

  INSERT INTO public.users (email, password_hash, role)
  VALUES (
    new.email,
    'SUPABASE_AUTH_MANAGED',
    new_role
  )
  ON CONFLICT (email) DO UPDATE
  SET
    role = EXCLUDED.role;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE PROCEDURE public.handle_auth_user_created();
