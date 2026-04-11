// spiritual-habits-route: v20260411 — satu impor namespace (bukan `import { isSpiritualHabitKey }`).
import { jsonPrivateNoStore } from "@/lib/http/json-private-no-store";
import { buildLiveCalibrationRows } from "@/lib/assessment/learning-events";
import { APEX_LEARNING_EVENTS } from "@/lib/assessment/placement-lifecycle";
import { ensureAssessmentSession, getBearerToken, requireStudentSession } from "@/lib/assessment/require-student";
import * as SpiritualHabits from "@/lib/learning/spiritual-habits-catalog";

type SpiritualHabitKey = SpiritualHabits.SpiritualHabitKey;

function parseLocalDate(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return jsonPrivateNoStore({ message: "Missing token" }, { status: 401 });

    const auth = await requireStudentSession(token);
    if (!auth.ok) return jsonPrivateNoStore({ message: auth.message }, { status: auth.status });

    const url = new URL(req.url);
    const localDate =
      parseLocalDate(url.searchParams.get("localDate")) ?? new Date().toISOString().slice(0, 10);

    const { data: profile, error: pErr } = await auth.supabase
      .from("student_profiles")
      .select("id, grade_level")
      .eq("user_id", auth.userId)
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (pErr) return jsonPrivateNoStore({ message: pErr.message }, { status: 500 });
    if (!profile) return jsonPrivateNoStore({ message: "Student profile tidak ditemukan." }, { status: 404 });

    const gradeLevel = String((profile as { grade_level?: string | null }).grade_level ?? "").trim() || null;
    if (SpiritualHabits.SPIRITUAL_HABIT_CATALOG.length < 1) {
      return jsonPrivateNoStore({ message: "Katalog habit tidak tersedia." }, { status: 500 });
    }
    const catalogForGrade = SpiritualHabits.spiritualHabitsForGrade(gradeLevel);

    const { data: rows, error: cErr } = await auth.supabase
      .from("student_spiritual_habit_completions")
      .select("habit_key, points_claimed")
      .eq("student_id", String(profile.id))
      .eq("local_date", localDate);
    if (cErr) return jsonPrivateNoStore({ message: cErr.message }, { status: 500 });

    const done = new Set((rows ?? []).map((r) => String(r.habit_key)));
    const pointsToday = (rows ?? []).reduce((s, r) => s + Number(r.points_claimed ?? 0), 0);

    const habits = catalogForGrade.map((h) => ({
      key: h.key,
      points: h.points,
      completed: done.has(h.key),
      labelId: h.labelId,
      labelEn: h.labelEn,
      icon: h.icon,
    }));

    return jsonPrivateNoStore({ localDate, gradeLevel, habits, pointsToday });
  } catch (e) {
    return jsonPrivateNoStore(
      { message: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return jsonPrivateNoStore({ message: "Missing token" }, { status: 401 });

    const auth = await requireStudentSession(token);
    if (!auth.ok) return jsonPrivateNoStore({ message: auth.message }, { status: auth.status });

    const body = (await req.json()) as { habitKey?: string; localDate?: string | null };
    const habitKeyRaw = typeof body.habitKey === "string" ? body.habitKey.trim() : "";
    const localDate = parseLocalDate(body.localDate ?? null) ?? new Date().toISOString().slice(0, 10);

    const { data: profile, error: pErr } = await auth.supabase
      .from("student_profiles")
      .select("id, grade_level")
      .eq("user_id", auth.userId)
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (pErr) return jsonPrivateNoStore({ message: pErr.message }, { status: 500 });
    if (!profile) return jsonPrivateNoStore({ message: "Student profile tidak ditemukan." }, { status: 404 });

    const gradeLevel = String((profile as { grade_level?: string | null }).grade_level ?? "").trim() || null;
    if (!habitKeyRaw) {
      return jsonPrivateNoStore({ message: "habitKey wajib diisi." }, { status: 400 });
    }
    if (!SpiritualHabits.isSpiritualHabitKey(habitKeyRaw)) {
      return jsonPrivateNoStore({ message: "habitKey tidak valid." }, { status: 400 });
    }
    if (!SpiritualHabits.isSpiritualHabitKeyForGrade(habitKeyRaw, gradeLevel)) {
      return jsonPrivateNoStore(
        { message: "habitKey tidak tersedia untuk jenjang kamu." },
        { status: 400 },
      );
    }
    const habitKey = habitKeyRaw as SpiritualHabitKey;

    const studentId = String(profile.id);
    const points = SpiritualHabits.habitPointsForKey(habitKey, gradeLevel);

    const { data: inserted, error: insErr } = await auth.supabase
      .from("student_spiritual_habit_completions")
      .insert({
        student_id: studentId,
        habit_key: habitKey,
        local_date: localDate,
        points_claimed: points,
      })
      .select("id")
      .maybeSingle();

    if (insErr) {
      const dup =
        insErr.code === "23505" ||
        (typeof insErr.message === "string" && insErr.message.toLowerCase().includes("duplicate"));
      if (dup) {
        return jsonPrivateNoStore({
          ok: true,
          alreadyCompleted: true,
          signalsInserted: 0,
          pointsDelta: 0,
          localDate,
          habitKey,
        });
      }
      return jsonPrivateNoStore({ message: insErr.message }, { status: 500 });
    }

    if (!inserted?.id) {
      return jsonPrivateNoStore({ message: "Gagal menyimpan completion." }, { status: 500 });
    }

    let signalsInserted = 0;
    try {
      const session = await ensureAssessmentSession(auth.supabase, auth.userId);
      const payload = {
        event: APEX_LEARNING_EVENTS.DAILY_SPIRITUAL_HABIT,
        dimension: "spiritual" as const,
        scorePct: points,
        metadata: { habitKey, localDate },
      };
      const signalRows = buildLiveCalibrationRows(auth.userId, session.id, payload);
      const { error: calErr } = await auth.supabase.from("calibration_signals").insert(signalRows);
      if (calErr) {
        console.error("[spiritual-habits] calibration_signals:", calErr.message);
      } else {
        signalsInserted = signalRows.length;
      }
    } catch (calEx) {
      console.error("[spiritual-habits] calibration:", calEx);
    }

    return jsonPrivateNoStore({
      ok: true,
      alreadyCompleted: false,
      signalsInserted,
      pointsDelta: points,
      localDate,
      habitKey,
    });
  } catch (e) {
    return jsonPrivateNoStore(
      { message: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
