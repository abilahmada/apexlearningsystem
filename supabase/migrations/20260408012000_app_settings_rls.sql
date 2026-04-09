-- Harden app_settings with Row Level Security.
-- Read can stay public for app bootstrap; write is admin-only.

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_settings_select_all ON app_settings;
CREATE POLICY app_settings_select_all
ON app_settings
FOR SELECT
USING (true);

DROP POLICY IF EXISTS app_settings_admin_update ON app_settings;
CREATE POLICY app_settings_admin_update
ON app_settings
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.email = (auth.jwt() ->> 'email')
      AND u.role = 'ADMIN'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.email = (auth.jwt() ->> 'email')
      AND u.role = 'ADMIN'
  )
);

DROP POLICY IF EXISTS app_settings_admin_insert ON app_settings;
CREATE POLICY app_settings_admin_insert
ON app_settings
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.email = (auth.jwt() ->> 'email')
      AND u.role = 'ADMIN'
  )
);
