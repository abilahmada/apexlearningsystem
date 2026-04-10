import { getBearerToken, requireStudentSession } from "@/lib/assessment/require-student";
import { calculateNextReview, DEFAULT_EASE_FACTOR } from "@/lib/learning/spaced-repetition-sm2";
import { fetchStudentSrsScope, flashcardIdSet } from "@/lib/learning/srs-server";

function parseUuid(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  if (!/^[0-9a-f-]{36}$/i.test(t)) return null;
  return t.toLowerCase();
}

function addDaysUtc(from: Date, days: number): string {
  const d = new Date(from.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return Response.json({ message: "Missing token" }, { status: 401 });

    const auth = await requireStudentSession(token);
    if (!auth.ok) return Response.json({ message: auth.message }, { status: auth.status });

    const body = (await req.json()) as Record<string, unknown>;
    const flashcardId = parseUuid(body.flashcardId);
    if (!flashcardId) {
      return Response.json({ message: "flashcardId (UUID) wajib." }, { status: 400 });
    }

    const qRaw = Number(body.quality);
    if (!Number.isFinite(qRaw)) {
      return Response.json({ message: "quality (0–5) wajib." }, { status: 400 });
    }
    const quality = Math.min(5, Math.max(0, Math.round(qRaw)));

    const scopeRes = await fetchStudentSrsScope(auth.supabase, auth.userId);
    if (!scopeRes.ok) {
      return Response.json({ message: scopeRes.message }, { status: scopeRes.status });
    }
    const allowed = flashcardIdSet(scopeRes.scope);
    if (!allowed.has(flashcardId)) {
      return Response.json({ message: "Kartu tidak tersedia untuk jenjang kamu." }, { status: 403 });
    }

    const { data: existing, error: selErr } = await auth.supabase
      .from("srs_reviews")
      .select("id, ease_factor, interval_days, repetitions")
      .eq("student_id", scopeRes.scope.studentProfileId)
      .eq("flashcard_id", flashcardId)
      .maybeSingle();

    if (selErr) {
      return Response.json({ message: selErr.message }, { status: 500 });
    }

    const prevInterval = existing ? Number(existing.interval_days) : 0;
    const prevEf = existing ? Number(existing.ease_factor) : DEFAULT_EASE_FACTOR;
    const repetitions = existing ? Number(existing.repetitions) : 0;

    const result = calculateNextReview(quality, prevInterval, prevEf, repetitions);
    const nextReviewDate = addDaysUtc(new Date(), result.nextInterval);

    const row = {
      student_id: scopeRes.scope.studentProfileId,
      flashcard_id: flashcardId,
      ease_factor: result.newEaseFactor,
      interval_days: result.nextInterval,
      repetitions: result.nextRepetitionCount,
      next_review_date: nextReviewDate,
    };

    const { error: upsertErr } = await auth.supabase.from("srs_reviews").upsert(row, {
      onConflict: "student_id,flashcard_id",
    });

    if (upsertErr) {
      return Response.json({ message: upsertErr.message }, { status: 500 });
    }

    return Response.json({
      ok: true,
      quality,
      nextInterval: result.nextInterval,
      newEaseFactor: result.newEaseFactor,
      nextRepetitionCount: result.nextRepetitionCount,
      nextReviewDate,
    });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
