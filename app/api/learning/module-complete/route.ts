import { jsonPrivateNoStore } from "@/lib/http/json-private-no-store";
import { getBearerToken, requireStudentSession } from "@/lib/assessment/require-student";
import { fetchStudentModulePhaseContext } from "@/lib/learning/student-module-phase-context";

function parseUuid(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  if (!/^[0-9a-f-]{36}$/i.test(t)) return null;
  return t.toLowerCase();
}

/**
 * Konfirmasi resmi "selesai dipelajari" untuk satu modul (setelah semua lesson lulus post-test).
 */
export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return jsonPrivateNoStore({ message: "Missing token" }, { status: 401 });

    const auth = await requireStudentSession(token);
    if (!auth.ok) return jsonPrivateNoStore({ message: auth.message }, { status: auth.status });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const moduleId = parseUuid(body.moduleId);
    if (!moduleId) return jsonPrivateNoStore({ message: "moduleId (UUID) wajib." }, { status: 400 });

    const phaseRes = await fetchStudentModulePhaseContext(auth.supabase, auth.userId, {
      catalogMode: false,
    });
    if (!phaseRes.ok) {
      return jsonPrivateNoStore({ message: phaseRes.message }, { status: phaseRes.status });
    }
    const { studentProfile, enriched, unlockedModuleIds } = phaseRes.context;
    if (!unlockedModuleIds.has(moduleId)) {
      return jsonPrivateNoStore(
        { message: "Modul masih terkunci fase atau tidak tersedia untuk jenjang Anda." },
        { status: 403 },
      );
    }
    const mod = enriched.find((e) => String(e.row.id) === moduleId);
    if (!mod) {
      return jsonPrivateNoStore({ message: "Modul tidak ditemukan untuk jenjang Anda." }, { status: 404 });
    }

    const { data: lessonRows, error: leErr } = await auth.supabase
      .from("lessons")
      .select("id")
      .eq("module_id", moduleId);
    if (leErr) return jsonPrivateNoStore({ message: leErr.message }, { status: 500 });
    const lessonIds = (lessonRows ?? []).map((r) => String(r.id));
    if (lessonIds.length === 0) {
      return jsonPrivateNoStore({ message: "Modul tidak memiliki lesson." }, { status: 400 });
    }

    const { data: progRows, error: prErr } = await auth.supabase
      .from("lesson_progress")
      .select("lesson_id, posttest_passed")
      .eq("student_id", String(studentProfile.id))
      .in("lesson_id", lessonIds);
    if (prErr) return jsonPrivateNoStore({ message: prErr.message }, { status: 500 });

    const passedByLesson = new Map<string, boolean>();
    for (const r of progRows ?? []) {
      passedByLesson.set(String(r.lesson_id), Boolean(r.posttest_passed));
    }
    for (const lid of lessonIds) {
      if (!passedByLesson.get(lid)) {
        return jsonPrivateNoStore(
          {
            message:
              "Semua lesson harus lulus post-test (sesuai ambang modul) sebelum menandai selesai dipelajari.",
          },
          { status: 400 },
        );
      }
    }

    const { data: inserted, error: insErr } = await auth.supabase
      .from("student_module_study_confirmations")
      .upsert(
        {
          student_id: String(studentProfile.id),
          module_id: moduleId,
          confirmed_at: new Date().toISOString(),
        },
        { onConflict: "student_id,module_id" },
      )
      .select("module_id, confirmed_at")
      .maybeSingle();

    if (insErr) {
      if (
        insErr.message?.includes("student_module_study_confirmations") ||
        insErr.message?.includes("does not exist")
      ) {
        return jsonPrivateNoStore(
          {
            message:
              "Fitur konfirmasi belum tersedia di database. Jalankan migrasi Supabase terbaru (student_module_study_confirmations).",
          },
          { status: 503 },
        );
      }
      return jsonPrivateNoStore({ message: insErr.message }, { status: 500 });
    }

    return jsonPrivateNoStore({
      ok: true,
      moduleId,
      studyConfirmedAt: inserted?.confirmed_at ?? new Date().toISOString(),
    });
  } catch (e) {
    return jsonPrivateNoStore(
      { message: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
