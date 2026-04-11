import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MODULE_SCHEDULE_DAY_KEYS,
  type ModuleScheduleDayKey,
} from "@/lib/learning/module-schedule-days";

export type StudentScheduleSlotRow = {
  day_key: string;
  module_id: string;
  slot_order: number;
  time_override: string | null;
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidScheduleTimeOverride(raw: unknown): raw is string {
  if (typeof raw !== "string") return false;
  const t = raw.trim();
  return TIME_RE.test(t);
}

export function parseDayKeysFromBody(
  raw: unknown,
): Partial<Record<ModuleScheduleDayKey, unknown>> | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const out: Partial<Record<ModuleScheduleDayKey, unknown>> = {};
  for (const k of MODULE_SCHEDULE_DAY_KEYS) {
    if (k in o) out[k] = o[k];
  }
  return out;
}

export async function fetchStudentScheduleSlots(
  supabase: SupabaseClient,
  studentProfileId: string,
): Promise<{ ok: true; rows: StudentScheduleSlotRow[] } | { ok: false; message: string; missingTable?: boolean }> {
  const { data, error } = await supabase
    .from("student_learning_schedule_slots")
    .select("day_key, module_id, slot_order, time_override")
    .eq("student_id", studentProfileId)
    .order("day_key", { ascending: true })
    .order("slot_order", { ascending: true })
    .order("module_id", { ascending: true });

  if (error) {
    const msg = String(error.message ?? "");
    if (msg.includes("student_learning_schedule_slots") || msg.includes("does not exist")) {
      return { ok: false, message: msg, missingTable: true };
    }
    return { ok: false, message: msg };
  }

  const rows: StudentScheduleSlotRow[] = (data ?? []).map((r) => ({
    day_key: String(r.day_key),
    module_id: String(r.module_id),
    slot_order: Number(r.slot_order ?? 0),
    time_override: r.time_override == null ? null : String(r.time_override),
  }));
  return { ok: true, rows };
}

export function slotsForDay(rows: StudentScheduleSlotRow[], day: ModuleScheduleDayKey): StudentScheduleSlotRow[] {
  return rows
    .filter((r) => r.day_key === day)
    .sort((a, b) => a.slot_order - b.slot_order || a.module_id.localeCompare(b.module_id));
}

export async function replaceStudentScheduleSlots(
  supabase: SupabaseClient,
  studentProfileId: string,
  nextRows: Array<{
    day_key: ModuleScheduleDayKey;
    module_id: string;
    slot_order: number;
    time_override: string | null;
  }>,
): Promise<{ ok: true } | { ok: false; message: string; missingTable?: boolean }> {
  const { error: delErr } = await supabase
    .from("student_learning_schedule_slots")
    .delete()
    .eq("student_id", studentProfileId);
  if (delErr) {
    const msg = String(delErr.message ?? "");
    if (msg.includes("student_learning_schedule_slots") || msg.includes("does not exist")) {
      return { ok: false, message: msg, missingTable: true };
    }
    return { ok: false, message: msg };
  }
  if (nextRows.length === 0) return { ok: true };

  const insertPayload = nextRows.map((r) => ({
    student_id: studentProfileId,
    day_key: r.day_key,
    module_id: r.module_id,
    slot_order: r.slot_order,
    time_override: r.time_override,
  }));
  const { error: insErr } = await supabase.from("student_learning_schedule_slots").insert(insertPayload);
  if (insErr) {
    const msg = String(insErr.message ?? "");
    if (msg.includes("student_learning_schedule_slots") || msg.includes("does not exist")) {
      return { ok: false, message: msg, missingTable: true };
    }
    return { ok: false, message: msg };
  }
  return { ok: true };
}
