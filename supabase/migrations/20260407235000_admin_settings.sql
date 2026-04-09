CREATE TABLE IF NOT EXISTS app_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  app_name VARCHAR(120) NOT NULL DEFAULT 'APEX System',
  app_tagline VARCHAR(255) NOT NULL DEFAULT 'Belajar Mandiri, Bersaing Global.',
  wellbeing_minutes INTEGER NOT NULL DEFAULT 45 CHECK (wellbeing_minutes BETWEEN 10 AND 120),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO app_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;
