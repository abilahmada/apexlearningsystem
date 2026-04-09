-- ============================================================================
-- PBL Rubric + Mentor Assessment (IB MYP style)
-- ============================================================================

create table if not exists public.rubrics (
  id uuid primary key default uuid_generate_v4(),
  code text not null unique,
  name text not null,
  framework text not null default 'IB MYP (adapted)',
  grade_level text not null,
  task_title text not null,
  max_points integer not null default 16 check (max_points > 0),
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rubric_criteria (
  id uuid primary key default uuid_generate_v4(),
  rubric_id uuid not null references public.rubrics(id) on delete cascade,
  criterion_code text not null,
  criterion_name text not null,
  weight_pct numeric(5,2) not null default 25.00 check (weight_pct >= 0 and weight_pct <= 100),
  sort_order integer not null default 1 check (sort_order >= 1),
  created_at timestamptz not null default now(),
  unique (rubric_id, criterion_code)
);

create table if not exists public.rubric_levels (
  id uuid primary key default uuid_generate_v4(),
  criterion_id uuid not null references public.rubric_criteria(id) on delete cascade,
  level smallint not null check (level between 1 and 4),
  level_label text not null,
  descriptor text not null,
  created_at timestamptz not null default now(),
  unique (criterion_id, level)
);

create table if not exists public.rubric_assessments (
  id uuid primary key default uuid_generate_v4(),
  rubric_id uuid not null references public.rubrics(id) on delete restrict,
  student_id uuid not null references public.student_profiles(id) on delete restrict,
  assessor_user_id uuid not null references public.users(id) on delete restrict,
  project_title text,
  total_score integer not null check (total_score >= 0),
  band_label text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rubric_assessment_items (
  id uuid primary key default uuid_generate_v4(),
  assessment_id uuid not null references public.rubric_assessments(id) on delete cascade,
  criterion_id uuid not null references public.rubric_criteria(id) on delete restrict,
  level smallint not null check (level between 1 and 4),
  score integer not null check (score >= 0),
  mentor_note text,
  evidence_link text,
  created_at timestamptz not null default now(),
  unique (assessment_id, criterion_id)
);

create index if not exists idx_rubrics_active_grade
  on public.rubrics (is_active, grade_level);

create index if not exists idx_rubric_criteria_rubric_order
  on public.rubric_criteria (rubric_id, sort_order asc);

create index if not exists idx_rubric_levels_criterion_level
  on public.rubric_levels (criterion_id, level asc);

create index if not exists idx_rubric_assessments_student_created
  on public.rubric_assessments (student_id, created_at desc);

create index if not exists idx_rubric_assessments_assessor_created
  on public.rubric_assessments (assessor_user_id, created_at desc);

create index if not exists idx_rubric_assessment_items_assessment
  on public.rubric_assessment_items (assessment_id);
