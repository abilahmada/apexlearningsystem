-- Dipanggil dari API backend (service_role) untuk cek email sudah dipakai di public.users
-- (sinkron dengan auth lewat trigger). Tidak diberikan ke anon untuk mengurangi enumerasi bebas.

CREATE OR REPLACE FUNCTION public.apex_email_registered_for_signup(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE lower(trim(email)) = lower(trim(coalesce(p_email, '')))
  );
$$;

REVOKE ALL ON FUNCTION public.apex_email_registered_for_signup(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apex_email_registered_for_signup(text) TO service_role;
