-- ============================================================================
-- Verify Signup Biodata + Parent-Student Auto Link
-- Run these queries in Supabase SQL Editor after:
-- migration 20260408102000_signup_biodata_and_parent_link.sql
-- ============================================================================

-- 1) Check parent link code column exists
select
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'parent_profiles'
  and column_name = 'parent_link_code';

-- 2) Check trigger function is installed
select
  routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'handle_auth_user_created';

-- 3) Inspect latest parent profiles
select
  p.id as parent_profile_id,
  p.user_id,
  p.full_name,
  p.phone_number,
  p.parent_link_code,
  p.created_at
from public.parent_profiles p
order by p.created_at desc
limit 20;

-- 4) Inspect latest student profiles + linked parent
select
  s.id as student_profile_id,
  s.user_id as student_user_id,
  s.full_name as student_name,
  s.grade_level,
  s.learning_vision,
  s.parent_id,
  p.full_name as parent_name,
  p.parent_link_code,
  s.created_at
from public.student_profiles s
left join public.parent_profiles p on p.id = s.parent_id
order by s.created_at desc
limit 20;

-- 5) Find students not linked to parent
select
  s.id as student_profile_id,
  s.user_id,
  s.full_name,
  s.parent_id,
  s.created_at
from public.student_profiles s
where s.parent_id is null
order by s.created_at desc;

-- 6) Get parent monitoring snapshot (which students belong to which parent)
select
  p.parent_link_code,
  p.full_name as parent_name,
  count(s.id) as total_students,
  array_agg(s.full_name order by s.full_name) filter (where s.id is not null) as students
from public.parent_profiles p
left join public.student_profiles s on s.parent_id = p.id
group by p.parent_link_code, p.full_name
order by p.full_name;

