import { jsonPrivateNoStore } from "@/lib/http/json-private-no-store";
import { getBearerToken, requireStudentSession } from "@/lib/assessment/require-student";
import {
  effectiveModuleScheduleDayKeys,
  MODULE_SCHEDULE_DAY_KEYS,
  type ModuleScheduleDayKey,
  todayScheduleKeyFromDate,
} from "@/lib/learning/module-schedule-days";
import {
  fetchStudentScheduleSlots,
  isValidScheduleTimeOverride,
  replaceStudentScheduleSlots,
  slotsForDay,
  type StudentScheduleSlotRow,
} from "@/lib/learning/student-learning-schedule";
import {
  fetchStudentModulePhaseContext,
  isModuleUnlockedByPhaseEntry,
  type EnrichedModuleRow,
} from "@/lib/learning/student-module-phase-context";

function parseUuid(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  if (!/^[0-9a-f-]{36}$/i.test(t)) return null;
  return t.toLowerCase();
}

function moduleCompletionMaps(ctx: {
  lessons: Array<{ id: string; module_id: string }>;
  lessonProgressByLesson: Map<
    string,
    { pretestScore: number | null; posttestScore: number | null; posttestPassed: boolean }
  >;
}) {
  const totalBy = new Map<string, number>();
  const passedBy = new Map<string, number>();
  for (const l of ctx.lessons) {
    const mid = String(l.module_id);
    totalBy.set(mid, (totalBy.get(mid) ?? 0) + 1);
    if (ctx.lessonProgressByLesson.get(String(l.id))?.posttestPassed) {
      passedBy.set(mid, (passedBy.get(mid) ?? 0) + 1);
    }
  }
  return { totalBy, passedBy };
}

function isStudyCompleted(
  moduleId: string,
  totalBy: Map<string, number>,
  passedBy: Map<string, number>,
  confirmationAt: string | null,
): boolean {
  const total = totalBy.get(moduleId) ?? 0;
  const passed = passedBy.get(moduleId) ?? 0;
  const allPassed = total > 0 && passed >= total;
  return Boolean(confirmationAt) && allPassed;
}

function scheduleTypeFromMeta(metadata: Record<string, unknown>): "core" | "project" | "review" {
  const typeRaw = String(metadata.scheduleType ?? "core").toLowerCase();
  if (typeRaw === "project") return "project";
  if (typeRaw === "review") return "review";
  return "core";
}

function buildDefaultDayItems(
  dayKey: ModuleScheduleDayKey,
  pickable: EnrichedModuleRow[],
): Array<{
  id: string;
  moduleId: string;
  moduleTitle: string;
  time: string;
  duration: number;
  type: "core" | "project" | "review";
  source: "default";
}> {
  const out: Array<{
    id: string;
    moduleId: string;
    moduleTitle: string;
    time: string;
    duration: number;
    type: "core" | "project" | "review";
    source: "default";
  }> = [];
  const dayNameMap: Record<ModuleScheduleDayKey, string> = {
    mon: "Senin",
    tue: "Selasa",
    wed: "Rabu",
    thu: "Kamis",
    fri: "Jumat",
    sat: "Sabtu",
    sun: "Minggu",
  };
  const dayName = dayNameMap[dayKey];
  for (const m of pickable) {
    const moduleId = String(m.row.id);
    const days = effectiveModuleScheduleDayKeys(m.metadata, Number(m.row.sequence_order ?? 0));
    if (!days.includes(dayKey)) continue;
    const md = m.metadata;
    const scheduleTime = String(md.scheduleTime ?? "08:00");
    const durationRaw = Number(md.scheduleDuration ?? 90);
    const duration = Number.isFinite(durationRaw) && durationRaw > 0 ? Math.round(durationRaw) : 90;
    out.push({
      id: `${dayName}-${moduleId}`,
      moduleId,
      moduleTitle: String(m.row.title ?? ""),
      time: scheduleTime,
      duration,
      type: scheduleTypeFromMeta(md),
      source: "default",
    });
  }
  out.sort((a, b) => a.time.localeCompare(b.time));
  return out;
}

function buildCustomDayItems(
  dayKey: ModuleScheduleDayKey,
  slotRows: StudentScheduleSlotRow[],
  enrichedById: Map<string, EnrichedModuleRow>,
): Array<{
  id: string;
  moduleId: string;
  moduleTitle: string;
  time: string;
  duration: number;
  type: "core" | "project" | "review";
  source: "custom";
}> {
  const dayNameMap: Record<ModuleScheduleDayKey, string> = {
    mon: "Senin",
    tue: "Selasa",
    wed: "Rabu",
    thu: "Kamis",
    fri: "Jumat",
    sat: "Sabtu",
    sun: "Minggu",
  };
  const dayName = dayNameMap[dayKey];
  const ordered = slotsForDay(slotRows, dayKey);
  return ordered.map((slot, idx) => {
    const en = enrichedById.get(slot.module_id);
    const md = en?.metadata ?? {};
    const scheduleTime =
      slot.time_override && isValidScheduleTimeOverride(slot.time_override)
        ? slot.time_override.trim()
        : String(md.scheduleTime ?? "08:00");
    const durationRaw = Number(md.scheduleDuration ?? 90);
    const duration = Number.isFinite(durationRaw) && durationRaw > 0 ? Math.round(durationRaw) : 90;
    return {
      id: `${dayName}-${slot.module_id}-c${idx}`,
      moduleId: slot.module_id,
      moduleTitle: String(en?.row.title ?? ""),
      time: scheduleTime,
      duration,
      type: scheduleTypeFromMeta(md as Record<string, unknown>),
      source: "custom" as const,
    };
  });
}

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return jsonPrivateNoStore({ message: "Missing token" }, { status: 401 });

    const auth = await requireStudentSession(token);
    if (!auth.ok) return jsonPrivateNoStore({ message: auth.message }, { status: auth.status });

    const phaseRes = await fetchStudentModulePhaseContext(auth.supabase, auth.userId, {
      catalogMode: false,
    });
    if (!phaseRes.ok) {
      return jsonPrivateNoStore({ message: phaseRes.message }, { status: phaseRes.status });
    }
    const ctx = phaseRes.context;
    const { studentProfile, enriched, phaseGatedItems, dbGrade } = ctx;
    const { totalBy, passedBy } = moduleCompletionMaps(ctx);

    const confirmationByModule = new Map<string, string>();
    const confRes = await auth.supabase
      .from("student_module_study_confirmations")
      .select("module_id, confirmed_at")
      .eq("student_id", String(studentProfile.id))
      .in(
        "module_id",
        ctx.moduleIds.length > 0 ? ctx.moduleIds : ["00000000-0000-0000-0000-000000000000"],
      );
    if (!confRes.error && confRes.data) {
      for (const row of confRes.data) {
        confirmationByModule.set(String(row.module_id), String(row.confirmed_at ?? ""));
      }
    }

    const pickable = enriched.filter((m) => {
      if (!isModuleUnlockedByPhaseEntry(m, phaseGatedItems)) return false;
      const id = String(m.row.id);
      const confirmed = confirmationByModule.get(id) ?? null;
      return !isStudyCompleted(id, totalBy, passedBy, confirmed);
    });

    const slotRes = await fetchStudentScheduleSlots(auth.supabase, String(studentProfile.id));
    if (!slotRes.ok) {
      if (slotRes.missingTable) {
        return jsonPrivateNoStore(
          {
            message:
              "Tabel jadwal manual belum tersedia. Jalankan migrasi Supabase (student_learning_schedule_slots).",
          },
          { status: 503 },
        );
      }
      return jsonPrivateNoStore({ message: slotRes.message }, { status: 500 });
    }

    const enrichedById = new Map<string, EnrichedModuleRow>();
    for (const m of enriched) enrichedById.set(String(m.row.id), m);

    const schedule: Record<
      ModuleScheduleDayKey,
      Array<{
        id: string;
        moduleId: string;
        moduleTitle: string;
        time: string;
        duration: number;
        type: "core" | "project" | "review";
        source: "custom" | "default";
      }>
    > = {
      mon: [],
      tue: [],
      wed: [],
      thu: [],
      fri: [],
      sat: [],
      sun: [],
    };

    const customizedDays: ModuleScheduleDayKey[] = [];
    for (const dayKey of MODULE_SCHEDULE_DAY_KEYS) {
      const customSlice = slotsForDay(slotRes.rows, dayKey);
      if (customSlice.length > 0) {
        customizedDays.push(dayKey);
        schedule[dayKey] = buildCustomDayItems(dayKey, slotRes.rows, enrichedById);
      } else {
        schedule[dayKey] = buildDefaultDayItems(dayKey, pickable);
      }
    }

    const customSlotsByDay: Record<ModuleScheduleDayKey, { moduleId: string; time: string }[]> = {
      mon: [],
      tue: [],
      wed: [],
      thu: [],
      fri: [],
      sat: [],
      sun: [],
    };
    for (const dk of MODULE_SCHEDULE_DAY_KEYS) {
      const slice = slotsForDay(slotRes.rows, dk);
      customSlotsByDay[dk] = slice.map((r) => ({
        moduleId: r.module_id,
        time: r.time_override && isValidScheduleTimeOverride(r.time_override) ? r.time_override.trim() : "",
      }));
    }

    return jsonPrivateNoStore({
      effectiveGrade: dbGrade,
      todayKey: todayScheduleKeyFromDate(new Date()),
      customizedDays,
      schedule,
      customSlotsByDay,
      pickableModules: pickable.map((m) => ({
        id: String(m.row.id),
        title: String(m.row.title ?? ""),
        sequenceOrder: Number(m.row.sequence_order ?? 0),
        metadata: m.metadata,
      })),
    });
  } catch (e) {
    return jsonPrivateNoStore(
      { message: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

type DaySlotInput = { moduleId?: unknown; time?: unknown };

function normalizePutDays(
  raw: unknown,
):
  | { ok: true; days: Record<ModuleScheduleDayKey, DaySlotInput[]> }
  | { ok: false; message: string } {
  if (!raw || typeof raw !== "object") return { ok: false, message: "Body JSON wajib berisi { days }." };
  const body = raw as Record<string, unknown>;
  const days = body.days;
  if (!days || typeof days !== "object") return { ok: false, message: "Field days wajib (object)." };
  const d = days as Record<string, unknown>;
  const out = {} as Record<ModuleScheduleDayKey, DaySlotInput[]>;
  for (const k of MODULE_SCHEDULE_DAY_KEYS) {
    if (!(k in d)) {
      return { ok: false, message: `days.${k} wajib ada (array, boleh kosong untuk menghapus slot hari itu).` };
    }
    const v = d[k];
    if (!Array.isArray(v)) return { ok: false, message: `days.${k} harus array.` };
    out[k] = v as DaySlotInput[];
  }
  return { ok: true, days: out };
}

export async function PUT(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return jsonPrivateNoStore({ message: "Missing token" }, { status: 401 });

    const auth = await requireStudentSession(token);
    if (!auth.ok) return jsonPrivateNoStore({ message: auth.message }, { status: auth.status });

    const rawBody = await req.json().catch(() => null);
    const normalized = normalizePutDays(rawBody);
    if (!normalized.ok) return jsonPrivateNoStore({ message: normalized.message }, { status: 400 });

    const phaseRes = await fetchStudentModulePhaseContext(auth.supabase, auth.userId, {
      catalogMode: false,
    });
    if (!phaseRes.ok) {
      return jsonPrivateNoStore({ message: phaseRes.message }, { status: phaseRes.status });
    }
    const ctx = phaseRes.context;
    const { studentProfile, enriched, phaseGatedItems, unlockedModuleIds } = ctx;
    const { totalBy, passedBy } = moduleCompletionMaps(ctx);

    const confirmationByModule = new Map<string, string>();
    const confRes = await auth.supabase
      .from("student_module_study_confirmations")
      .select("module_id, confirmed_at")
      .eq("student_id", String(studentProfile.id))
      .in(
        "module_id",
        ctx.moduleIds.length > 0 ? ctx.moduleIds : ["00000000-0000-0000-0000-000000000000"],
      );
    if (!confRes.error && confRes.data) {
      for (const row of confRes.data) {
        confirmationByModule.set(String(row.module_id), String(row.confirmed_at ?? ""));
      }
    }

    const canPick = (moduleId: string) => {
      if (!unlockedModuleIds.has(moduleId)) return false;
      const confirmed = confirmationByModule.get(moduleId) ?? null;
      return !isStudyCompleted(moduleId, totalBy, passedBy, confirmed);
    };

    const nextRows: Array<{
      day_key: ModuleScheduleDayKey;
      module_id: string;
      slot_order: number;
      time_override: string | null;
    }> = [];

    for (const dayKey of MODULE_SCHEDULE_DAY_KEYS) {
      const arr = normalized.days[dayKey];
      if (arr.length > 16) {
        return jsonPrivateNoStore({ message: `Maksimal 16 slot per hari (${dayKey}).` }, { status: 400 });
      }
      const seen = new Set<string>();
      for (let i = 0; i < arr.length; i += 1) {
        const slot = arr[i];
        const moduleId = parseUuid(slot?.moduleId);
        if (!moduleId) {
          return jsonPrivateNoStore({ message: `moduleId tidak valid di ${dayKey}[${i}].` }, { status: 400 });
        }
        if (seen.has(moduleId)) {
          return jsonPrivateNoStore({ message: `Modul duplikat di hari yang sama: ${dayKey}.` }, { status: 400 });
        }
        seen.add(moduleId);
        if (!canPick(moduleId)) {
          return jsonPrivateNoStore(
            {
              message:
                "Hanya modul terbuka (unlock) dan belum selesai dipelajari yang boleh dimasukkan jadwal.",
            },
            { status: 403 },
          );
        }
        const en = enriched.find((e) => String(e.row.id) === moduleId);
        if (!en || !isModuleUnlockedByPhaseEntry(en, phaseGatedItems)) {
          return jsonPrivateNoStore({ message: "Modul tidak tersedia untuk jenjang atau masih terkunci fase." }, { status: 403 });
        }
        let timeOverride: string | null = null;
        if (slot.time != null && String(slot.time).trim() !== "") {
          if (!isValidScheduleTimeOverride(slot.time)) {
            return jsonPrivateNoStore({ message: `Format jam tidak valid (pakai HH:mm) di ${dayKey}[${i}].` }, { status: 400 });
          }
          timeOverride = String(slot.time).trim();
        }
        nextRows.push({
          day_key: dayKey,
          module_id: moduleId,
          slot_order: i,
          time_override: timeOverride,
        });
      }
    }

    if (nextRows.length > 120) {
      return jsonPrivateNoStore({ message: "Terlalu banyak slot total (maks. 120)." }, { status: 400 });
    }

    const rep = await replaceStudentScheduleSlots(auth.supabase, String(studentProfile.id), nextRows);
    if (!rep.ok) {
      if (rep.missingTable) {
        return jsonPrivateNoStore(
          {
            message:
              "Tabel jadwal manual belum tersedia. Jalankan migrasi Supabase (student_learning_schedule_slots).",
          },
          { status: 503 },
        );
      }
      return jsonPrivateNoStore({ message: rep.message }, { status: 500 });
    }

    return jsonPrivateNoStore({ ok: true, saved: nextRows.length });
  } catch (e) {
    return jsonPrivateNoStore(
      { message: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return jsonPrivateNoStore({ message: "Missing token" }, { status: 401 });

    const auth = await requireStudentSession(token);
    if (!auth.ok) return jsonPrivateNoStore({ message: auth.message }, { status: auth.status });

    const phaseRes = await fetchStudentModulePhaseContext(auth.supabase, auth.userId, {
      catalogMode: false,
    });
    if (!phaseRes.ok) {
      return jsonPrivateNoStore({ message: phaseRes.message }, { status: phaseRes.status });
    }
    const rep = await replaceStudentScheduleSlots(auth.supabase, String(phaseRes.context.studentProfile.id), []);
    if (!rep.ok) {
      if (rep.missingTable) {
        return jsonPrivateNoStore(
          {
            message:
              "Tabel jadwal manual belum tersedia. Jalankan migrasi Supabase (student_learning_schedule_slots).",
          },
          { status: 503 },
        );
      }
      return jsonPrivateNoStore({ message: rep.message }, { status: 500 });
    }
    return jsonPrivateNoStore({ ok: true, cleared: true });
  } catch (e) {
    return jsonPrivateNoStore(
      { message: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
