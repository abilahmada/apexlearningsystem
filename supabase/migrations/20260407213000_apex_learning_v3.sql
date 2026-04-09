-- ============================================================================
-- APEX Learning System V3.0 - PostgreSQL / Supabase
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. Enums
-- ============================================================================
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('STUDENT', 'PARENT', 'MENTOR');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE grade_level AS ENUM ('SD', 'SMP', 'SMK');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE lesson_type AS ENUM ('VIDEO', 'ARTICLE', 'INTERACTIVE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE progress_status AS ENUM ('LOCKED', 'IN_PROGRESS', 'MASTERED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE activity_type AS ENUM ('SHALAT', 'DHUHA', 'SEDEKAH', 'MURAJAAH');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE submission_status AS ENUM ('PENDING', 'PEER_REVIEWED', 'MENTOR_VALIDATED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE alert_type AS ENUM ('STRUGGLE', 'ACHIEVEMENT', 'WELLBEING');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 2. Authentication & Profiles
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role user_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS parent_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name VARCHAR(255) NOT NULL,
  phone_number VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS student_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES parent_profiles(id) ON DELETE SET NULL,
  grade_level grade_level NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  learning_vision TEXT,
  a11y_dyslexia_font BOOLEAN DEFAULT FALSE,
  a11y_high_contrast BOOLEAN DEFAULT FALSE,
  charity_points INTEGER DEFAULT 0,
  daily_screen_time_minutes INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mentor_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expertise_area VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_parent_profiles_user_id ON parent_profiles(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_student_profiles_user_id ON student_profiles(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mentor_profiles_user_id ON mentor_profiles(user_id);

-- ============================================================================
-- 3. Curriculum & Cognitive Class
-- ============================================================================
CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(255) NOT NULL,
  grade_level grade_level NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS modules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  sequence_order INTEGER NOT NULL,
  mastery_threshold INTEGER DEFAULT 80 CHECK (mastery_threshold BETWEEN 0 AND 100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(course_id, sequence_order)
);

CREATE TABLE IF NOT EXISTS lessons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  type lesson_type NOT NULL,
  content_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quizzes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  questions JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(lesson_id)
);

-- ============================================================================
-- 4. Learning Transactions & Metacognition
-- ============================================================================
CREATE TABLE IF NOT EXISTS student_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  highest_score INTEGER DEFAULT 0 CHECK (highest_score BETWEEN 0 AND 100),
  status progress_status DEFAULT 'LOCKED',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(student_id, module_id)
);

CREATE TABLE IF NOT EXISTS active_recall_dumps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  dump_content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS metacognition_journals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  pre_expectation TEXT,
  post_confidence_scale INTEGER CHECK (post_confidence_scale >= 1 AND post_confidence_scale <= 10),
  weekly_learned TEXT,
  weekly_confused TEXT,
  weekly_strategy TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- 5. Spaced Repetition & Tahfidz
-- ============================================================================
CREATE TABLE IF NOT EXISTS srs_flashcards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS srs_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
  flashcard_id UUID NOT NULL REFERENCES srs_flashcards(id) ON DELETE CASCADE,
  ease_factor DOUBLE PRECISION DEFAULT 2.5,
  interval_days INTEGER DEFAULT 0,
  repetitions INTEGER DEFAULT 0,
  next_review_date TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(student_id, flashcard_id)
);

CREATE TABLE IF NOT EXISTS habit_tahfidz_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
  activity_type activity_type NOT NULL,
  details VARCHAR(255),
  is_completed BOOLEAN DEFAULT FALSE,
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- 6. Project & Portfolio
-- ============================================================================
CREATE TABLE IF NOT EXISTS project_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  rubric_criteria JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS portfolio_submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
  project_task_id UUID NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  title_id VARCHAR(255) NOT NULL,
  title_en VARCHAR(255) NOT NULL,
  abstract_id TEXT NOT NULL,
  abstract_en TEXT NOT NULL,
  attachment_url TEXT NOT NULL,
  sdg_tags JSONB,
  status submission_status DEFAULT 'PENDING',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS peer_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id UUID NOT NULL REFERENCES portfolio_submissions(id) ON DELETE CASCADE,
  reviewer_student_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
  rubric_scores JSONB NOT NULL,
  constructive_feedback TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(submission_id, reviewer_student_id)
);

-- ============================================================================
-- 7. Parent Analytics & Mentor Portal
-- ============================================================================
CREATE TABLE IF NOT EXISTS mentor_evaluations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id UUID NOT NULL REFERENCES portfolio_submissions(id) ON DELETE CASCADE,
  mentor_id UUID NOT NULL REFERENCES mentor_profiles(id) ON DELETE CASCADE,
  hoth_score INTEGER CHECK (hoth_score BETWEEN 1 AND 4),
  creativity_score INTEGER CHECK (creativity_score BETWEEN 1 AND 4),
  communication_score INTEGER CHECK (communication_score BETWEEN 1 AND 4),
  written_feedback TEXT,
  async_av_feedback_url TEXT,
  credential_issued BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS credential_badges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
  badge_name VARCHAR(255) NOT NULL,
  credly_api_id VARCHAR(255) NOT NULL,
  issued_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS smart_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parent_id UUID NOT NULL REFERENCES parent_profiles(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
  type alert_type NOT NULL,
  message_content TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- 8. Helpful indexes
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_student_progress_student_id ON student_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_active_recall_dumps_student_id ON active_recall_dumps(student_id);
CREATE INDEX IF NOT EXISTS idx_metacognition_journals_student_id ON metacognition_journals(student_id);
CREATE INDEX IF NOT EXISTS idx_srs_reviews_student_id ON srs_reviews(student_id);
CREATE INDEX IF NOT EXISTS idx_habit_tahfidz_logs_student_id ON habit_tahfidz_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_submissions_student_id ON portfolio_submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_mentor_evaluations_mentor_id ON mentor_evaluations(mentor_id);
CREATE INDEX IF NOT EXISTS idx_smart_alerts_parent_id ON smart_alerts(parent_id);
CREATE INDEX IF NOT EXISTS idx_smart_alerts_student_id ON smart_alerts(student_id);
