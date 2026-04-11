import {
  CALIBRATION_DIMENSIONS,
  normalizeError,
  normalizeVelocity,
  type CalibrationDimension,
} from "@/lib/calibration/engine";
import { APEX_LEARNING_EVENTS, type CalibrationSignalType } from "@/lib/assessment/placement-lifecycle";

/** Metadata: agregat harian dari cron — boleh dihapus pengganti harian. */
export const CALIBRATION_AGGREGATION_NIGHTLY = "nightly" as const;
/** Metadata: event dari client / modul — tidak dihapus oleh cron harian. */
export const CALIBRATION_AGGREGATION_LIVE = "live" as const;

export type LiveLearningEventPayload = {
  event: string;
  dimension?: CalibrationDimension | null;
  moduleId?: string | null;
  lessonId?: string | null;
  /** Skor 0–100 untuk infer velocity / error. */
  scorePct?: number | null;
  conceptKey?: string | null;
  /** Detik durasi sesi (opsional). */
  durationSeconds?: number | null;
  metadata?: Record<string, unknown> | null;
};

export type CalibrationSignalInsert = {
  user_id: string;
  session_id: string;
  signal_type: CalibrationSignalType;
  dimension: string;
  raw_value: number;
  normalized_value: number;
  metadata: Record<string, unknown>;
  recorded_at: string;
};

function isCalibrationDimension(d: string | null | undefined): d is CalibrationDimension {
  return !!d && CALIBRATION_DIMENSIONS.includes(d as CalibrationDimension);
}

function defaultDimension(payload: LiveLearningEventPayload): CalibrationDimension {
  if (isCalibrationDimension(payload.dimension ?? undefined)) return payload.dimension!;
  return "kognitif";
}

/**
 * Memetakan satu event pembelajaran ke satu atau beberapa baris `calibration_signals`.
 */
export function buildLiveCalibrationRows(
  userId: string,
  sessionId: string,
  payload: LiveLearningEventPayload,
  recordedAt: Date = new Date(),
): CalibrationSignalInsert[] {
  const iso = recordedAt.toISOString();
  const dim = defaultDimension(payload);
  const baseMeta = {
    aggregationSource: CALIBRATION_AGGREGATION_LIVE,
    event: payload.event,
    ...(payload.moduleId ? { moduleId: payload.moduleId } : {}),
    ...(payload.lessonId ? { lessonId: payload.lessonId } : {}),
    ...(payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {}),
  };

  const event = payload.event;

  if (event === APEX_LEARNING_EVENTS.MODULE_SESSION_START) {
    return [
      {
        user_id: userId,
        session_id: sessionId,
        signal_type: "ENGAGEMENT",
        dimension: "global",
        raw_value: 6,
        normalized_value: 6,
        metadata: { ...baseMeta, kind: "session_start" },
        recorded_at: iso,
      },
    ];
  }

  if (event === APEX_LEARNING_EVENTS.MODULE_SESSION_END) {
    const score = payload.scorePct;
    const velocityRaw =
      typeof score === "number" && Number.isFinite(score)
        ? Math.max(0.2, Math.min(3.0, 0.35 + (score / 100) * 2.2))
        : 1.0;
    const rows: CalibrationSignalInsert[] = [
      {
        user_id: userId,
        session_id: sessionId,
        signal_type: "ENGAGEMENT",
        dimension: "global",
        raw_value: Math.max(4, Math.min(10, 5 + (payload.durationSeconds ?? 600) / 1200)),
        normalized_value: Math.max(4, Math.min(10, 5 + (payload.durationSeconds ?? 600) / 1200)),
        metadata: {
          ...baseMeta,
          kind: "session_end",
          durationSeconds: payload.durationSeconds ?? null,
        },
        recorded_at: iso,
      },
      {
        user_id: userId,
        session_id: sessionId,
        signal_type: "MASTERY_VELOCITY",
        dimension: dim,
        raw_value: velocityRaw,
        normalized_value: normalizeVelocity(velocityRaw),
        metadata: { ...baseMeta, kind: "session_end_velocity", scorePct: score ?? null },
        recorded_at: iso,
      },
    ];
    return rows;
  }

  if (event === APEX_LEARNING_EVENTS.MASTERY_THRESHOLD) {
    const score = payload.scorePct ?? 80;
    const velocityRaw = Math.max(0.2, Math.min(3.0, 0.4 + (score / 100) * 2.0));
    return [
      {
        user_id: userId,
        session_id: sessionId,
        signal_type: "MASTERY_VELOCITY",
        dimension: dim,
        raw_value: velocityRaw,
        normalized_value: normalizeVelocity(velocityRaw),
        metadata: { ...baseMeta, kind: "mastery_threshold", scorePct: score },
        recorded_at: iso,
      },
    ];
  }

  if (event === APEX_LEARNING_EVENTS.ITEM_RESPONSE) {
    const score = payload.scorePct ?? 100;
    const systematicRate = Math.max(0, Math.min(1, (100 - score) / 100));
    const errRaw = systematicRate;
    return [
      {
        user_id: userId,
        session_id: sessionId,
        signal_type: "ERROR_PATTERN",
        dimension: dim,
        raw_value: errRaw,
        normalized_value: normalizeError(errRaw),
        metadata: { ...baseMeta, kind: "item_response", scorePct: score },
        recorded_at: iso,
      },
    ];
  }

  if (event === APEX_LEARNING_EVENTS.CONCEPT_ERROR_STREAK) {
    const rate = 0.65;
    return [
      {
        user_id: userId,
        session_id: sessionId,
        signal_type: "ERROR_PATTERN",
        dimension: dim,
        raw_value: rate,
        normalized_value: normalizeError(rate),
        metadata: {
          ...baseMeta,
          kind: "concept_streak",
          conceptKey: payload.conceptKey ?? null,
        },
        recorded_at: iso,
      },
    ];
  }

  if (event === APEX_LEARNING_EVENTS.CONTENT_REPLAY) {
    return [
      {
        user_id: userId,
        session_id: sessionId,
        signal_type: "ENGAGEMENT",
        dimension: "global",
        raw_value: 7,
        normalized_value: 7,
        metadata: { ...baseMeta, kind: "replay" },
        recorded_at: iso,
      },
    ];
  }

  if (event === APEX_LEARNING_EVENTS.CONTENT_SKIP) {
    return [
      {
        user_id: userId,
        session_id: sessionId,
        signal_type: "ENGAGEMENT",
        dimension: "global",
        raw_value: 4.5,
        normalized_value: 4.5,
        metadata: { ...baseMeta, kind: "skip" },
        recorded_at: iso,
      },
    ];
  }

  if (event === APEX_LEARNING_EVENTS.SESSION_DROP_OFF) {
    return [
      {
        user_id: userId,
        session_id: sessionId,
        signal_type: "ENGAGEMENT",
        dimension: "global",
        raw_value: 3.5,
        normalized_value: 3.5,
        metadata: { ...baseMeta, kind: "drop_off" },
        recorded_at: iso,
      },
    ];
  }

  if (event === APEX_LEARNING_EVENTS.DAILY_SPIRITUAL_HABIT) {
    const habitKey =
      typeof payload.metadata?.habitKey === "string" ? String(payload.metadata.habitKey).trim().slice(0, 64) : "";
    const localDate =
      typeof payload.metadata?.localDate === "string" ? String(payload.metadata.localDate).trim().slice(0, 10) : "";
    const score = typeof payload.scorePct === "number" && Number.isFinite(payload.scorePct) ? payload.scorePct : 50;
    const raw = Math.max(5, Math.min(8.8, 5.1 + (Math.min(100, Math.max(0, score)) / 100) * 3.7));
    return [
      {
        user_id: userId,
        session_id: sessionId,
        signal_type: "ENGAGEMENT",
        dimension: "spiritual",
        raw_value: raw,
        normalized_value: raw,
        metadata: {
          ...baseMeta,
          kind: "daily_spiritual_habit",
          habitKey: habitKey || null,
          localDate: localDate || null,
          scorePct: score,
        },
        recorded_at: iso,
      },
    ];
  }

  if (
    event === APEX_LEARNING_EVENTS.PLACEMENT_REVIEW_SCHEDULED ||
    event === APEX_LEARNING_EVENTS.PLACEMENT_REVIEW_COMPLETED
  ) {
    return [
      {
        user_id: userId,
        session_id: sessionId,
        signal_type: "ENGAGEMENT",
        dimension: "global",
        raw_value: 6,
        normalized_value: 6,
        metadata: { ...baseMeta, kind: "placement_review" },
        recorded_at: iso,
      },
    ];
  }

  return [
    {
      user_id: userId,
      session_id: sessionId,
      signal_type: "ENGAGEMENT",
      dimension: "global",
      raw_value: 5,
      normalized_value: 5,
      metadata: { ...baseMeta, kind: "unknown_event", originalEvent: event },
      recorded_at: iso,
    },
  ];
}

/** Daftar event yang dikenali (untuk validasi API). */
export const KNOWN_LEARNING_EVENT_NAMES = new Set<string>(Object.values(APEX_LEARNING_EVENTS));
