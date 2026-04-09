-- Extend signup biodata fields for student and parent profiles.
-- Includes school + birth date + class progression basis and full parent address hierarchy.

ALTER TABLE public.student_profiles
ADD COLUMN IF NOT EXISTS birth_date DATE,
ADD COLUMN IF NOT EXISTS school_origin VARCHAR(255),
ADD COLUMN IF NOT EXISTS grade_class_start INTEGER,
ADD COLUMN IF NOT EXISTS grade_class_max INTEGER,
ADD COLUMN IF NOT EXISTS grade_class_start_year INTEGER;

ALTER TABLE public.parent_profiles
ADD COLUMN IF NOT EXISTS address_line TEXT,
ADD COLUMN IF NOT EXISTS province VARCHAR(100),
ADD COLUMN IF NOT EXISTS city VARCHAR(100),
ADD COLUMN IF NOT EXISTS district VARCHAR(100);

CREATE OR REPLACE FUNCTION public.compute_current_grade_class(
  p_grade_class_start INTEGER,
  p_grade_class_max INTEGER,
  p_grade_class_start_year INTEGER
)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
  SELECT LEAST(
    COALESCE(p_grade_class_max, 3),
    GREATEST(
      1,
      COALESCE(p_grade_class_start, 1) + GREATEST(0, EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER - COALESCE(p_grade_class_start_year, EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER))
    )
  );
$$;

CREATE OR REPLACE VIEW public.student_profiles_enriched AS
SELECT
  sp.*,
  public.compute_current_grade_class(sp.grade_class_start, sp.grade_class_max, sp.grade_class_start_year) AS current_grade_class
FROM public.student_profiles sp;

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
  birth_date_value date;
  school_origin_text text;
  grade_class_start_value integer;
  grade_class_max_value integer;
  grade_class_start_year_value integer;
  address_line_text text;
  province_text text;
  city_text text;
  district_text text;
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
  school_origin_text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'school_origin', '')), '');
  address_line_text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'address_line', '')), '');
  province_text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'province', '')), '');
  city_text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'city', '')), '');
  district_text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'district', '')), '');

  grade_level_text := upper(coalesce(new.raw_user_meta_data ->> 'grade_level', 'SMP'));
  IF grade_level_text IN ('SD', 'SMP', 'SMK') THEN
    grade_level_value := grade_level_text::grade_level;
  ELSE
    grade_level_value := 'SMP'::grade_level;
  END IF;

  grade_class_start_value := GREATEST(1, COALESCE((new.raw_user_meta_data ->> 'grade_class_start')::integer, 1));
  grade_class_max_value := GREATEST(1, COALESCE((new.raw_user_meta_data ->> 'grade_class_max')::integer, CASE WHEN grade_level_value = 'SD' THEN 6 ELSE 3 END));
  grade_class_start_year_value := EXTRACT(YEAR FROM CURRENT_DATE)::integer;

  IF (new.raw_user_meta_data ? 'birth_date') AND nullif(new.raw_user_meta_data ->> 'birth_date', '') IS NOT NULL THEN
    birth_date_value := (new.raw_user_meta_data ->> 'birth_date')::date;
  ELSE
    birth_date_value := NULL;
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
    INSERT INTO public.parent_profiles (
      user_id, full_name, phone_number, parent_link_code, address_line, province, city, district
    )
    VALUES (
      app_user_id,
      full_name_text,
      phone_text,
      coalesce(parent_link_code_text, upper(substr(replace(uuid_generate_v4()::text, '-', ''), 1, 10))),
      address_line_text,
      province_text,
      city_text,
      district_text
    )
    ON CONFLICT (user_id) DO UPDATE
    SET
      full_name = EXCLUDED.full_name,
      phone_number = EXCLUDED.phone_number,
      parent_link_code = EXCLUDED.parent_link_code,
      address_line = EXCLUDED.address_line,
      province = EXCLUDED.province,
      city = EXCLUDED.city,
      district = EXCLUDED.district;
  ELSIF new_role = 'STUDENT'::user_role THEN
    IF parent_link_code_text IS NOT NULL THEN
      SELECT id
      INTO linked_parent_profile_id
      FROM public.parent_profiles
      WHERE parent_link_code = parent_link_code_text
      LIMIT 1;
    END IF;

    INSERT INTO public.student_profiles (
      user_id,
      parent_id,
      grade_level,
      full_name,
      learning_vision,
      birth_date,
      school_origin,
      grade_class_start,
      grade_class_max,
      grade_class_start_year
    )
    VALUES (
      app_user_id,
      linked_parent_profile_id,
      grade_level_value,
      full_name_text,
      learning_vision_text,
      birth_date_value,
      school_origin_text,
      grade_class_start_value,
      grade_class_max_value,
      grade_class_start_year_value
    )
    ON CONFLICT (user_id) DO UPDATE
    SET
      parent_id = EXCLUDED.parent_id,
      grade_level = EXCLUDED.grade_level,
      full_name = EXCLUDED.full_name,
      learning_vision = EXCLUDED.learning_vision,
      birth_date = EXCLUDED.birth_date,
      school_origin = EXCLUDED.school_origin,
      grade_class_start = EXCLUDED.grade_class_start,
      grade_class_max = EXCLUDED.grade_class_max,
      grade_class_start_year = EXCLUDED.grade_class_start_year;
  ELSIF new_role = 'MENTOR'::user_role THEN
    INSERT INTO public.mentor_profiles (user_id, expertise_area)
    VALUES (app_user_id, 'General')
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN new;
END;
$$;

