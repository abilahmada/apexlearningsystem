/**
 * Peta empat lapis assessment APEX ke tabel Supabase (setelah migrasi
 * 20260409120000_assessment_four_layer_schema.sql).
 *
 * Lapis 2 (kalibrasi dinamis) dan sebagian Lapis 3 sudah memakai
 * assessment_sessions, calibration_signals, competency_profiles, parent_validations.
 */

export const ASSESSMENT_LAYER = {
  /** Intake interview adaptif: CAT akademik + skenario karakter + baseline Islam */
  INTAKE_INTERVIEW: 1,
  /** Provisional placement + sinyal 14 hari */
  DYNAMIC_CALIBRATION: 2,
  /** Profil radar 6 dimensi (+ label jalur per dimensi) */
  COMPETENCY_RADAR: 3,
  /** Validasi orang tua sebelum kunci final */
  PARENT_VALIDATION: 4,
} as const;

/** Tabel utama per lapis (referensi implementasi). */
export const ASSESSMENT_TABLES = {
  layer1: {
    interview: "intake_interviews",
    conversation: "intake_conversation_turns",
    itemBank: "intake_item_bank",
    itemAttempts: "intake_item_attempts",
    scenarioPrompts: "intake_scenario_prompts",
    scenarioResponses: "intake_scenario_responses",
  },
  layer2: {
    session: "assessment_sessions",
    signals: "calibration_signals",
    flags: "calibration_flags",
    remediationQueue: "assessment_remediation_queue",
  },
  layer3: {
    profile: "competency_profiles",
  },
  layer4: {
    parentValidation: "parent_validations",
  },
} as const;

export type IntakeInterviewStatus = "IN_PROGRESS" | "COMPLETED" | "ABANDONED";

export type IntakeItemType = "MULTIPLE_CHOICE" | "OPEN_SHORT";

/** Validasi orang tua hanya lewat form terstruktur di aplikasi (bukan video wawancara). */
export type ParentValidationChannel = "FORM";

/** API Lapis 1 (student bearer): GET/POST `/api/assessment/intake` */
export const INTAKE_API_PATH = "/api/assessment/intake";
