-- Avatar profil level akun (berlaku untuk semua role)
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS avatar_url TEXT;

