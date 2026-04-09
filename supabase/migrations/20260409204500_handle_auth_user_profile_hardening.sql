-- Perkuat trigger signup:
-- 1) parent_link_code otomatis: 32 hex penuh (muat VARCHAR(32)), hindari tabrakan indeks unik dari substring 10 karakter.
-- 2) Potong string ke panjang kolom (hindari "value too long for type character varying").
-- 3) Setelah unique_violation pada users, resolusi id lewat SELECT (lebih andal daripada UPDATE...RETURNING + NOT FOUND).

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
  gcs_raw text;
  gcm_raw text;
  new_parent_link_code text;
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

  full_name_text := left(full_name_text, 255);
  IF phone_text IS NOT NULL THEN
    phone_text := left(phone_text, 50);
  END IF;
  IF school_origin_text IS NOT NULL THEN
    school_origin_text := left(school_origin_text, 255);
  END IF;
  IF province_text IS NOT NULL THEN
    province_text := left(province_text, 100);
  END IF;
  IF city_text IS NOT NULL THEN
    city_text := left(city_text, 100);
  END IF;
  IF district_text IS NOT NULL THEN
    district_text := left(district_text, 100);
  END IF;
  IF parent_link_code_text IS NOT NULL THEN
    parent_link_code_text := left(parent_link_code_text, 32);
  END IF;

  grade_level_text := upper(coalesce(new.raw_user_meta_data ->> 'grade_level', 'SMP'));
  IF grade_level_text IN ('SD', 'SMP', 'SMK') THEN
    grade_level_value := grade_level_text::grade_level;
  ELSE
    grade_level_value := 'SMP'::grade_level;
  END IF;

  gcs_raw := nullif(trim(coalesce(new.raw_user_meta_data ->> 'grade_class_start', '')), '');
  IF gcs_raw IS NOT NULL AND gcs_raw ~ '^[0-9]+$' THEN
    grade_class_start_value := gcs_raw::integer;
  ELSE
    grade_class_start_value := 1;
  END IF;
  grade_class_start_value := GREATEST(1, grade_class_start_value);

  gcm_raw := nullif(trim(coalesce(new.raw_user_meta_data ->> 'grade_class_max', '')), '');
  IF gcm_raw IS NOT NULL AND gcm_raw ~ '^[0-9]+$' THEN
    grade_class_max_value := gcm_raw::integer;
  ELSE
    grade_class_max_value := CASE WHEN grade_level_value = 'SD' THEN 6 ELSE 3 END;
  END IF;
  grade_class_max_value := GREATEST(1, grade_class_max_value);
  IF grade_class_max_value < grade_class_start_value THEN
    grade_class_max_value := grade_class_start_value;
  END IF;

  grade_class_start_year_value := EXTRACT(YEAR FROM CURRENT_DATE)::integer;

  birth_date_value := NULL;
  IF (new.raw_user_meta_data ? 'birth_date') AND nullif(trim(new.raw_user_meta_data ->> 'birth_date'), '') IS NOT NULL THEN
    BEGIN
      birth_date_value := trim(new.raw_user_meta_data ->> 'birth_date')::date;
    EXCEPTION
      WHEN OTHERS THEN
        birth_date_value := NULL;
    END;
  END IF;

  BEGIN
    INSERT INTO public.users (id, email, password_hash, role)
    VALUES (
      new.id,
      new.email,
      'SUPABASE_AUTH_MANAGED',
      new_role
    );
    app_user_id := new.id;
  EXCEPTION
    WHEN unique_violation THEN
      app_user_id := NULL;
      SELECT u.id INTO app_user_id FROM public.users u WHERE u.id = new.id LIMIT 1;
      IF app_user_id IS NULL THEN
        SELECT u.id INTO app_user_id FROM public.users u WHERE u.email IS NOT DISTINCT FROM new.email LIMIT 1;
      END IF;
      IF app_user_id IS NULL THEN
        RAISE;
      END IF;
  END;

  IF new_role = 'PARENT'::user_role THEN
    new_parent_link_code := coalesce(
      parent_link_code_text,
      upper(replace(gen_random_uuid()::text, '-', ''))
    );
    new_parent_link_code := left(new_parent_link_code, 32);

    INSERT INTO public.parent_profiles (
      user_id, full_name, phone_number, parent_link_code, address_line, province, city, district
    )
    VALUES (
      app_user_id,
      full_name_text,
      phone_text,
      new_parent_link_code,
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
    IF parent_link_code_text IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'check_violation',
        MESSAGE = 'STUDENT_SIGNUP_MISSING_PARENT_LINK_CODE';
    END IF;

    SELECT id
    INTO linked_parent_profile_id
    FROM public.parent_profiles
    WHERE parent_link_code = parent_link_code_text
    LIMIT 1;

    IF linked_parent_profile_id IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'check_violation',
        MESSAGE = 'STUDENT_SIGNUP_INVALID_PARENT_LINK_CODE';
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
