-- ============================================================================
-- RUNBOOK OPERASIONAL — Auth / signup / profil (Supabase Auth ↔ public.users)
-- Lokasi repo: apex-frontend/supabase/verify_auth_signup_operational.sql
--
-- Prasyarat: jalankan di Supabase SQL Editor dengan role yang boleh baca schema auth.
--
-- Cara pakai:
--   - Jalankan per blok query (satu SELECT per run jika editor membatasi multi-statement).
--   - Untuk satu user: filter by email atau id di query yang relevan.
--
-- Traffic light:
--   HIJAU — Q1/Q2/Q3/Q4/Q5/Q11 = 0 baris (tidak ada orphan / mismatch sinkron).
--   KUNING — sedikit mismatch (contoh: user lama sebelum trigger); investigasi manual.
--   MERAH — banyak orphan atau auth tanpa public.users (signup/trigger gagal massal).
--
-- Tindak lanjut cepat:
--   - Merah Q1/Q2 → cek trigger handle_auth_user_* dan log auth di Dashboard.
--   - Merah Q3/Q4 → perbaiki FK atau backfill profil.
--   - Merah Q11 → auth.users.id harus sama dengan public.users.id untuk email yang sama (JWT vs RLS).
--
-- Audit aplikasi (poin D — ringkas):
--   - Trigger AFTER INSERT auth.users → handle_auth_user_created (SECURITY DEFINER): INSERT public.users
--     dengan id = new.id; pada unique_violation: jika baris sudah ada untuk new.id → lanjut; jika bentrok email
--     dengan id lain → gagal dengan AUTH_PUBLIC_USERS_EMAIL_CONFLICT_DIFFERENT_ID (migrasi 20260410231000).
--   - Siswa: parent_link_code wajib; lookup parent_profiles.parent_link_code; RPC apex_parent_link_code_exists
--     untuk preflight (GET validate-parent-link + POST signup-admin-verify). Metadata snake_case + camelCase
--     di migrasi 20260409205000_handle_auth_user_metadata_dual_keys.sql.
--   - API signup-admin-verify memverifikasi public.users dengan .eq("id", authUser.id), bukan hanya email.
-- ============================================================================

-- 1) auth.users ada di Supabase Auth, public.users dipakai aplikasi — cek email selaras
--    Harapan: 0 baris (setiap auth user punya baris public dengan email sama).
select
  au.id as auth_user_id,
  au.email as auth_email,
  au.created_at as auth_created_at
from auth.users au
left join public.users pu on lower(trim(pu.email)) = lower(trim(au.email))
where pu.id is null
order by au.created_at desc
limit 200;

-- 2) Kebalikan: public.users tanpa pasangan auth (email tidak ketemu di auth.users)
--    Harapan: 0 baris (kecuali seed/test manual).
select
  pu.id,
  pu.email,
  pu.role,
  pu.created_at
from public.users pu
left join auth.users au on lower(trim(au.email)) = lower(trim(pu.email))
where au.id is null
order by pu.created_at desc
limit 200;

-- 3) student_profiles: user_id harus ada di public.users
select
  sp.id as student_profile_id,
  sp.user_id,
  sp.full_name
from public.student_profiles sp
left join public.users u on u.id = sp.user_id
where u.id is null
limit 200;

-- 4) student_profiles: parent_id (jika diisi) harus mengarah ke parent_profiles yang valid
select
  sp.id as student_profile_id,
  sp.user_id,
  sp.parent_id
from public.student_profiles sp
where sp.parent_id is not null
  and not exists (select 1 from public.parent_profiles pp where pp.id = sp.parent_id)
limit 200;

-- 5) Satu user tidak boleh punya lebih dari satu student_profiles (unik user_id)
select
  sp.user_id,
  count(*) as profile_rows
from public.student_profiles sp
group by sp.user_id
having count(*) > 1;

-- 6) Satu user tidak boleh punya lebih dari satu parent_profiles
select
  pp.user_id,
  count(*) as profile_rows
from public.parent_profiles pp
group by pp.user_id
having count(*) > 1;

-- 7) parent_profiles: user_id harus ada di public.users
select
  pp.id as parent_profile_id,
  pp.user_id
from public.parent_profiles pp
left join public.users u on u.id = pp.user_id
where u.id is null
limit 200;

-- 8) Duplikat email di public.users (melanggar UNIQUE — harus 0 baris)
select
  lower(trim(email)) as email_norm,
  count(*) as cnt
from public.users
group by lower(trim(email))
having count(*) > 1;

-- 9) Ringkasan per role (sanity volume)
select
  role,
  count(*) as user_count
from public.users
group by role
order by user_count desc;

-- 10) Siswa: grade_level harus SD / SMP / SMK
select
  sp.id,
  sp.user_id,
  sp.grade_level::text as grade_level
from public.student_profiles sp
where sp.grade_level::text not in ('SD', 'SMP', 'SMK')
limit 200;

-- 11) Email sama di auth dan public tetapi id berbeda (merah: RLS / JWT sub tidak cocok profil)
select
  au.id as auth_user_id,
  pu.id as public_users_id,
  au.email
from auth.users au
inner join public.users pu on lower(trim(pu.email)) = lower(trim(au.email))
where au.id <> pu.id
order by au.created_at desc
limit 200;

-- 12) Pendaftaran menunggu admin: user_id harus ada di auth (orphan jika auth dihapus manual)
--     Catatan: skip jika tabel registration_verifications belum ada.
select
  rv.id as verification_id,
  rv.user_id,
  rv.email,
  rv.status
from public.registration_verifications rv
left join auth.users au on au.id = rv.user_id
where au.id is null
  and rv.status = 'PENDING'
limit 200;

-- 13) Duplikat parent_link_code (seharusnya dicegah UNIQUE partial — harus 0 baris)
select
  upper(trim(parent_link_code)) as code_norm,
  count(*) as cnt
from public.parent_profiles
where parent_link_code is not null
  and trim(parent_link_code) <> ''
group by upper(trim(parent_link_code))
having count(*) > 1;
