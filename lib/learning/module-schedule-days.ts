/** Sama urutan dengan weekly-schedule.tsx — dipakai API + UI agar modul "hari ini" konsisten. */
export const MODULE_SCHEDULE_DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type ModuleScheduleDayKey = (typeof MODULE_SCHEDULE_DAY_KEYS)[number];

export function normalizeModuleScheduleDayKey(raw: unknown): ModuleScheduleDayKey | null {
  const t = String(raw ?? "").trim().toLowerCase();
  if (t === "mon" || t === "monday" || t === "senin") return "mon";
  if (t === "tue" || t === "tuesday" || t === "selasa") return "tue";
  if (t === "wed" || t === "wednesday" || t === "rabu") return "wed";
  if (t === "thu" || t === "thursday" || t === "kamis") return "thu";
  if (t === "fri" || t === "friday" || t === "jumat" || t === "jum'at") return "fri";
  if (t === "sat" || t === "saturday" || t === "sabtu") return "sat";
  if (t === "sun" || t === "sunday" || t === "minggu") return "sun";
  return null;
}

export function normalizeModuleScheduleDays(raw: unknown): ModuleScheduleDayKey[] {
  if (!Array.isArray(raw)) return [];
  const out: ModuleScheduleDayKey[] = [];
  for (const item of raw) {
    const key = normalizeModuleScheduleDayKey(item);
    if (key && !out.includes(key)) out.push(key);
  }
  return out;
}

/** Sama dengan dayIndexToKey((sequenceOrder - 1) % 6) di weekly-schedule.tsx */
function syntheticDayKeyFromSequenceOrder(sequenceOrder: number): ModuleScheduleDayKey {
  const idx = (Math.trunc(sequenceOrder) - 1) % 6;
  const key = MODULE_SCHEDULE_DAY_KEYS[idx];
  return key ?? "mon";
}

/**
 * Hari kerja modul untuk filter jadwal: pakai metadata.scheduleDays jika ada,
 * kalau kosong fallback satu hari dari sequence_order (sama logika Jadwal Mingguan).
 */
export function effectiveModuleScheduleDayKeys(
  metadata: Record<string, unknown>,
  sequenceOrder: number,
): ModuleScheduleDayKey[] {
  const fromMeta = normalizeModuleScheduleDays(metadata.scheduleDays);
  if (fromMeta.length > 0) return fromMeta;
  return [syntheticDayKeyFromSequenceOrder(sequenceOrder)];
}

export function todayScheduleKeyFromDate(d: Date): ModuleScheduleDayKey {
  const day = d.getDay();
  return MODULE_SCHEDULE_DAY_KEYS[(day + 6) % 7];
}
