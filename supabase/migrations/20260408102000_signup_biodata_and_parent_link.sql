-- Add richer signup metadata mapping and parent-student linking by parent_link_code.

ALTER TABLE public.parent_profiles
ADD COLUMN IF NOT EXISTS parent_link_code VARCHAR(32);

CREATE UNIQUE INDEX IF NOT EXISTS idx_parent_profiles_parent_link_code
ON public.parent_profiles(parent_link_code)
WHERE parent_link_code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.handle_auth_user_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_role_text text;
  new_role user_role;
  app_user_id uuid;
  full_name_text text;
  phone_text text;
  grade_level_text text;
  grade_level_value grade_level;
  learning_vision_text text;
  parent_link_code_text text;
  linked_parent_profile_id uuid;
BEGIN
  new_role_text := upper(coalesce(new.raw_user_meta_data ->> 'role', 'STUDENT'));

  IF new_role_text IN ('STUDENT', 'PARENT', 'MENTOR', 'ADMIN') THEN
    new_role := new_role_text::user_role;
  ELSE
    new_role := 'STUDENT'::user_role;
  END IF;

  full_name_text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');
  IF full_name_text IS NULL THEN
    full_name_text := split_part(coalesce(new.email, 'user'), '@', 1);
  END IF;

  phone_text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'phone_number', '')), '');
  learning_vision_text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'learning_vision', '')), '');
  parent_link_code_text := nullif(upper(trim(coalesce(new.raw_user_meta_data ->> 'parent_link_code', ''))), '');

  grade_level_text := upper(coalesce(new.raw_user_meta_data ->> 'grade_level', 'SMP'));
  IF grade_level_text IN ('SD', 'SMP', 'SMK') THEN
    grade_level_value := grade_level_text::grade_level;
  ELSE
    grade_level_value := 'SMP'::grade_level;
  END IF;

  INSERT INTO public.users (email, password_hash, role)
  VALUES (
    new.email,
    'SUPABASE_AUTH_MANAGED',
    new_role
  )
  ON CONFLICT (email) DO UPDATE
  SET role = EXCLUDED.role
  RETURNING id INTO app_user_id;

  IF new_role = 'PARENT'::user_role THEN
    INSERT INTO public.parent_profiles (user_id, full_name, phone_number, parent_link_code)
    VALUES (
      app_user_id,
      full_name_text,
      phone_text,
      coalesce(parent_link_code_text, upper(substr(replace(uuid_generate_v4()::text, '-', ''), 1, 10)))
    )
    ON CONFLICT (user_id) DO UPDATE
    SET
      full_name = EXCLUDED.full_name,
      phone_number = EXCLUDED.phone_number;
  ELSIF new_role = 'STUDENT'::user_role THEN
    IF parent_link_code_text IS NOT NULL THEN
      SELECT id
      INTO linked_parent_profile_id
      FROM public.parent_profiles
      WHERE parent_link_code = parent_link_code_text
      LIMIT 1;
    END IF;

    INSERT INTO public.student_profiles (user_id, parent_id, grade_level, full_name, learning_vision)
    VALUES (
      app_user_id,
      linked_parent_profile_id,
      grade_level_value,
      full_name_text,
      learning_vision_text
    )
    ON CONFLICT (user_id) DO UPDATE
    SET
      parent_id = EXCLUDED.parent_id,
      grade_level = EXCLUDED.grade_level,
      full_name = EXCLUDED.full_name,
      learning_vision = EXCLUDED.learning_vision;
  ELSIF new_role = 'MENTOR'::user_role THEN
    INSERT INTO public.mentor_profiles (user_id, expertise_area)
    VALUES (app_user_id, 'General')
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN new;
END;
$$;

