/**
 * Integrasi pedagogik → produk: status assessment sebagai state machine + katalog sinyal/event.
 * Dipakai oleh API status, cron, dan (nanti) instrumentasi modul pembelajaran.
 *
 * Peta ke DB: `assessment_sessions.status`, `sessions_completed`, `parent_validated_at`,
 * `placement_locked_at`, `calibration_signals.signal_type`, `competency_profiles.source`.
 */

import { ASSESSMENT_LAYER } from "./four-layer-model";

/** Selaras dengan CHECK di `assessment_sessions.status`. */
export type AssessmentSessionStatus =
  | "PENDING"
  | "ACTIVE"
  | "CALIBRATING"
  | "EXTENDED"
  | "PLACED";

/** Fase yang ditampilkan ke produk (UI, copy, routing) — lebih halus dari raw DB status. */
export type PlacementProductPhase =
  /** Lapis 1: intake / wawancara adaptif belum menutup ke kalibrasi */
  | "L1_INTAKE"
  /** Lapis 2: jendela kalibrasi; radar bisa masih kasar */
  | "L2_CALIBRATION"
  /** Lapis 3: radar provisional memiliki cukup sinyal aktivitas (≥3 sesi modul) */
  | "L3_RADAR_PROVISIONAL"
  /** Lapis 4: placement sudah dikunci tapi orang tua belum mengirim form validasi */
  | "L4_PARENT_VALIDATION_PENDING"
  /** Placement final + validasi orang tua ada; belum waktunya review berkala */
  | "PLACEMENT_STABLE"
  /** Review penempatan berkala (4–6 minggu) — sinyal siap dievaluasi ulang */
  | "CONTINUOUS_REVIEW_DUE";

/** Default hari antara kunci placement + validasi orang tua → jendela review berkala berikutnya. */
export const CONTINUOUS_REVIEW_INTERVAL_DAYS = 35;

/** Setelah berapa sesi modul selesai kita anggap radar “cukup terisi” untuk copy Lapis 3. */
export const RADAR_PROVISIONAL_MIN_SESSIONS = 3;

/** Sinyal yang sudah didukung tabel `calibration_signals` (jangan ubah tanpa migrasi). */
export const CALIBRATION_SIGNAL_TYPES = ["MASTERY_VELOCITY", "ERROR_PATTERN", "ENGAGEMENT"] as const;
export type CalibrationSignalType = (typeof CALIBRATION_SIGNAL_TYPES)[number];

/**
 * Event yang sebaiknya dikirim dari pembelajaran ke agregator (belum semua di-wire).
 * Nama stabil untuk kontrak analytics / worker masa depan.
 */
export const APEX_LEARNING_EVENTS = {
  MODULE_SESSION_START: "apex.module.session_start",
  MODULE_SESSION_END: "apex.module.session_end",
  MASTERY_THRESHOLD: "apex.module.mastery_threshold",
  ITEM_RESPONSE: "apex.learning.item_response",
  CONCEPT_ERROR_STREAK: "apex.learning.concept_error_streak",
  CONTENT_REPLAY: "apex.engagement.content_replay",
  CONTENT_SKIP: "apex.engagement.content_skip",
  SESSION_DROP_OFF: "apex.engagement.session_drop_off",
  PLACEMENT_REVIEW_SCHEDULED: "apex.placement.review_scheduled",
  PLACEMENT_REVIEW_COMPLETED: "apex.placement.review_completed",
} as const;

export type ApexLearningEventName = (typeof APEX_LEARNING_EVENTS)[keyof typeof APEX_LEARNING_EVENTS];

export function assessmentLayerForPhase(phase: PlacementProductPhase): number {
  switch (phase) {
    case "L1_INTAKE":
      return ASSESSMENT_LAYER.INTAKE_INTERVIEW;
    case "L2_CALIBRATION":
    case "L3_RADAR_PROVISIONAL":
      return ASSESSMENT_LAYER.DYNAMIC_CALIBRATION;
    case "L4_PARENT_VALIDATION_PENDING":
      return ASSESSMENT_LAYER.PARENT_VALIDATION;
    case "PLACEMENT_STABLE":
    case "CONTINUOUS_REVIEW_DUE":
      return ASSESSMENT_LAYER.COMPETENCY_RADAR;
  }
}

function msDays(n: number) {
  return n * 24 * 60 * 60 * 1000;
}

/**
 * Menghitung kapan review penempatan berkala “jatuh tempo”.
 * Anchor: review terakhir jika ada, lalu kunci placement, lalu validasi orang tua.
 */
export function computeContinuousReviewDueAt(
  placementLockedAt: string | null,
  parentValidatedAt: string | null,
  lastContinuousReviewAt: string | null = null,
  intervalDays: number = CONTINUOUS_REVIEW_INTERVAL_DAYS,
): Date | null {
  const anchorIso = lastContinuousReviewAt ?? placementLockedAt ?? parentValidatedAt;
  if (!anchorIso) return null;
  const d = new Date(anchorIso);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + intervalDays);
  return d;
}

/**
 * Hari sampai jadwal review berkala (negatif = sudah lewat). Null jika tidak ada anchor.
 */
export function continuousReviewDaysUntilDue(
  placementLockedAt: string | null,
  parentValidatedAt: string | null,
  now: Date = new Date(),
  intervalDays: number = CONTINUOUS_REVIEW_INTERVAL_DAYS,
  lastContinuousReviewAt: string | null = null,
): number | null {
  const due = computeContinuousReviewDueAt(placementLockedAt, parentValidatedAt, lastContinuousReviewAt, intervalDays);
  if (!due) return null;
  return Math.ceil((due.getTime() - now.getTime()) / msDays(1));
}

export type PlacementPhaseInput = {
  sessionStatus: AssessmentSessionStatus;
  sessionsCompleted: number;
  parentValidatedAt: string | null;
  placementLockedAt: string | null;
  /** Menggeser jendela review berkala (setelah cron review sebelumnya). */
  lastContinuousReviewAt?: string | null;
  now?: Date;
};

/**
 * Menyatukan status sesi + aktivitas menjadi satu fase produk untuk dashboard siswa.
 */
export function resolvePlacementProductPhase(input: PlacementPhaseInput): PlacementProductPhase {
  const now = input.now ?? new Date();
  const st = input.sessionStatus;
  const sc = Math.max(0, input.sessionsCompleted);

  if (st === "PENDING") {
    return "L1_INTAKE";
  }

  if (st === "CALIBRATING" || st === "EXTENDED") {
    return sc >= RADAR_PROVISIONAL_MIN_SESSIONS ? "L3_RADAR_PROVISIONAL" : "L2_CALIBRATION";
  }

  if (st === "ACTIVE") {
    return sc >= RADAR_PROVISIONAL_MIN_SESSIONS ? "L3_RADAR_PROVISIONAL" : "L2_CALIBRATION";
  }

  if (st === "PLACED") {
    if (!input.parentValidatedAt) {
      return "L4_PARENT_VALIDATION_PENDING";
    }
    const daysLeft = continuousReviewDaysUntilDue(
      input.placementLockedAt,
      input.parentValidatedAt,
      now,
      CONTINUOUS_REVIEW_INTERVAL_DAYS,
      input.lastContinuousReviewAt ?? null,
    );
    if (daysLeft !== null && daysLeft <= 0) {
      return "CONTINUOUS_REVIEW_DUE";
    }
    return "PLACEMENT_STABLE";
  }

  return "L2_CALIBRATION";
}
