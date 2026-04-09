-- ============================================================================
-- APEX Assessment Dynamic Calibration - Verification Script (Phase 2)
-- Jalankan di Supabase SQL Editor setelah migration + uji flow Student/Parent/Mentor
-- ============================================================================

-- 1) Ringkasan assessment sessions terbaru
SELECT
  user_id,
  status,
  sessions_completed,
  calibration_ends_at,
  placement_locked_at,
  extension_count,
  final_theta,
  updated_at
FROM public.assessment_sessions
ORDER BY updated_at DESC
LIMIT 50;

-- 2) Cek unresolved flags (harus menurun setelah mentor override)
SELECT
  user_id,
  flag_type,
  dimension,
  severity,
  resolved,
  resolved_by,
  created_at
FROM public.calibration_flags
WHERE resolved = false
ORDER BY created_at DESC
LIMIT 100;

-- 3) Cek competency profiles terbaru (termasuk source MENTOR_OVERRIDE/CALIBRATION)
SELECT
  user_id,
  dimension,
  theta,
  ci,
  level,
  source,
  locked_at,
  updated_at
FROM public.competency_profiles
ORDER BY updated_at DESC
LIMIT 200;

-- 4) Cek parent validations terbaru (adjustment tersimpan)
SELECT
  user_id,
  agreed_with_profile,
  adjustments,
  observations,
  special_conditions,
  submitted_at
FROM public.parent_validations
ORDER BY submitted_at DESC
LIMIT 100;

-- 5) Cek sinyal kalibrasi 14 hari terakhir (sampling)
SELECT
  user_id,
  session_id,
  signal_type,
  dimension,
  raw_value,
  normalized_value,
  recorded_at
FROM public.calibration_signals
WHERE recorded_at >= now() - interval '14 days'
ORDER BY recorded_at DESC
LIMIT 300;

-- 6) Audit cepat parent-student linkage untuk akses final-profile parent
SELECT
  sp.id AS student_profile_id,
  sp.user_id AS student_user_id,
  sp.full_name AS student_name,
  sp.parent_id,
  pp.user_id AS parent_user_id,
  pp.full_name AS parent_name
FROM public.student_profiles sp
LEFT JOIN public.parent_profiles pp ON pp.id = sp.parent_id
ORDER BY sp.created_at DESC
LIMIT 100;

-- 7) Health check sederhana: berapa session PLACED tetapi final_theta null
SELECT
  count(*) AS placed_but_missing_final_theta
FROM public.assessment_sessions
WHERE status = 'PLACED' AND final_theta IS NULL;

-- 8) Health check sederhana: berapa competency profile source MENTOR_OVERRIDE
SELECT
  count(*) AS mentor_override_profiles
FROM public.competency_profiles
WHERE source = 'MENTOR_OVERRIDE';

