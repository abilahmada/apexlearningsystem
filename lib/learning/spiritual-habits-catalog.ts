/** Katalog mutaba’ah harian per jenjang (P7) — sumber kebenaran key, poin, dan eligibility untuk API + UI. */

import { parseStudentGrade, type GradeApi } from "@/lib/learning/student-module-phase-context";

/** Jenjang siswa untuk filter habit (selaras `student_profiles.grade_level`). */
export type SpiritualHabitGrade = GradeApi;

const DEFAULT_SPIRITUAL_HABIT_GRADE: SpiritualHabitGrade = "SMP";

function resolvedGrade(grade: string | null | undefined): SpiritualHabitGrade {
  return parseStudentGrade(grade ?? null) ?? DEFAULT_SPIRITUAL_HABIT_GRADE;
}

type HabitEntry = {
  readonly key: string;
  readonly labelId: string;
  readonly labelEn: string;
  readonly icon: string;
  /** Poin default bila tidak ada override di `pointsByGrade`. */
  readonly points: number;
  readonly pointsByGrade?: Partial<Record<SpiritualHabitGrade, number>>;
  /** Jenjang di mana habit ini ditampilkan dan boleh diklaim. */
  readonly grades: readonly SpiritualHabitGrade[];
};

/**
 * Satu baris per `key` (unik untuk constraint DB & kalibrasi).
 * Tambah habit baru: pastikan `grades` mencakup jenjang yang relevan saja.
 */
export const SPIRITUAL_HABIT_ENTRIES: readonly HabitEntry[] = [
  {
    key: "dhuha",
    labelId: "Shalat Dhuha",
    labelEn: "Dhuha Prayer",
    icon: "🌅",
    points: 50,
    grades: ["SD", "SMP", "SMA", "SMK"],
  },
  {
    key: "tilawah",
    labelId: "Tilawah Qur'an",
    labelEn: "Qur'an recitation",
    icon: "📖",
    points: 75,
    pointsByGrade: { SD: 60, SMP: 70 },
    grades: ["SD", "SMP", "SMA", "SMK"],
  },
  {
    key: "shalat",
    labelId: "Shalat 5 Waktu",
    labelEn: "Five daily prayers",
    icon: "🕌",
    points: 100,
    pointsByGrade: { SD: 85 },
    grades: ["SD", "SMP", "SMA", "SMK"],
  },
  {
    key: "olahraga",
    labelId: "Olahraga",
    labelEn: "Exercise",
    icon: "🏃",
    points: 30,
    grades: ["SD", "SMP", "SMA", "SMK"],
  },
  {
    key: "dzikir",
    labelId: "Dzikir & istighfar",
    labelEn: "Dhikr & istighfar",
    icon: "📿",
    points: 40,
    grades: ["SMP", "SMA", "SMK"],
  },
  {
    key: "rawatib",
    labelId: "Shalat sunnah rawatib",
    labelEn: "Rawatib sunnah prayers",
    icon: "🤲",
    points: 45,
    grades: ["SMA", "SMK"],
  },
] as const;

export type SpiritualHabitKey = (typeof SPIRITUAL_HABIT_ENTRIES)[number]["key"];

const ENTRY_BY_KEY = new Map<string, HabitEntry>(SPIRITUAL_HABIT_ENTRIES.map((h) => [h.key, h]));

const ALL_KEYS = new Set<string>(SPIRITUAL_HABIT_ENTRIES.map((h) => h.key));

/**
 * True jika key ada di katalog (semua jenjang).
 * Pakai `export function` (bukan `export const = fn`) agar Turbopack / analisis statis selalu melihat named export ini.
 */
export function isSpiritualHabitKey(raw: string): raw is SpiritualHabitKey {
  return ALL_KEYS.has(raw);
}

/**
 * Semua definisi habit (bukan filter per jenjang).
 * Untuk UI siswa, prefer data dari GET `/api/learning/spiritual-habits` atau `spiritualHabitsForGrade(grade)`.
 */
export const SPIRITUAL_HABIT_CATALOG = SPIRITUAL_HABIT_ENTRIES;

export type SpiritualHabitDisplay = {
  key: string;
  labelId: string;
  labelEn: string;
  icon: string;
  points: number;
};

export function spiritualHabitsForGrade(grade: string | null | undefined): SpiritualHabitDisplay[] {
  const g = resolvedGrade(grade);
  const out: SpiritualHabitDisplay[] = [];
  for (const h of SPIRITUAL_HABIT_ENTRIES) {
    if (!h.grades.includes(g)) continue;
    const points = h.pointsByGrade?.[g] ?? h.points;
    out.push({
      key: h.key,
      labelId: h.labelId,
      labelEn: h.labelEn,
      icon: h.icon,
      points,
    });
  }
  return out;
}

export function habitPointsForKey(key: string, grade: string | null | undefined): number {
  const h = ENTRY_BY_KEY.get(key);
  if (!h) return 0;
  const g = resolvedGrade(grade);
  if (!h.grades.includes(g)) return 0;
  return h.pointsByGrade?.[g] ?? h.points;
}

/** True jika key dikenal katalog (ada di DB historis). */
export function isKnownSpiritualHabitKey(raw: string): boolean {
  return isSpiritualHabitKey(raw);
}

/** True jika key boleh diklaim pada jenjang ini. */
export function isSpiritualHabitKeyForGrade(raw: string, grade: string | null | undefined): raw is SpiritualHabitKey {
  if (!isSpiritualHabitKey(raw)) return false;
  const g = resolvedGrade(grade);
  const h = ENTRY_BY_KEY.get(raw);
  return Boolean(h?.grades.includes(g));
}
