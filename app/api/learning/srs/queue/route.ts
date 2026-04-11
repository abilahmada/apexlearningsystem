import { jsonPrivateNoStore } from "@/lib/http/json-private-no-store";
import { getBearerToken, requireStudentSession } from "@/lib/assessment/require-student";
import { fetchStudentSrsScope, flashcardIdSet } from "@/lib/learning/srs-server";

function parseLimit(raw: string | null, fallback: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(max, Math.floor(n));
}

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return jsonPrivateNoStore({ message: "Missing token" }, { status: 401 });

    const auth = await requireStudentSession(token);
    if (!auth.ok) return jsonPrivateNoStore({ message: auth.message }, { status: auth.status });

    const url = new URL(req.url);
    const limitDue = parseLimit(url.searchParams.get("limitDue"), 50, 100);
    const limitNew = parseLimit(url.searchParams.get("limitNew"), 30, 100);

    const scopeRes = await fetchStudentSrsScope(auth.supabase, auth.userId);
    if (!scopeRes.ok) {
      return jsonPrivateNoStore({ message: scopeRes.message }, { status: scopeRes.status });
    }
    const { scope } = scopeRes;
    const allowed = flashcardIdSet(scope);
    if (allowed.size === 0) {
      return jsonPrivateNoStore({
        due: [],
        newCards: [],
        stats: { dueCount: 0, newCount: 0, masteredCount: 0, totalFlashcards: 0 },
      });
    }

    const nowIso = new Date().toISOString();
    const flashcardById = new Map(scope.flashcards.map((f) => [f.id, f]));

    const { data: dueReviews, error: dueErr } = await auth.supabase
      .from("srs_reviews")
      .select("id, flashcard_id, ease_factor, interval_days, repetitions, next_review_date")
      .eq("student_id", scope.studentProfileId)
      .in("flashcard_id", [...allowed])
      .lte("next_review_date", nowIso)
      .order("next_review_date", { ascending: true })
      .limit(limitDue);

    if (dueErr) {
      return jsonPrivateNoStore({ message: dueErr.message }, { status: 500 });
    }

    const due: Array<{
      kind: "due";
      reviewId: string;
      flashcardId: string;
      question: string;
      answer: string;
      moduleTitle: string | null;
      easeFactor: number;
      intervalDays: number;
      repetitions: number;
      nextReviewDate: string;
    }> = [];
    for (const r of dueReviews ?? []) {
      const card = flashcardById.get(String(r.flashcard_id));
      if (!card) continue;
      due.push({
        kind: "due",
        reviewId: String(r.id),
        flashcardId: card.id,
        question: card.question,
        answer: card.answer,
        moduleTitle: card.moduleTitle,
        easeFactor: Number(r.ease_factor),
        intervalDays: Number(r.interval_days),
        repetitions: Number(r.repetitions),
        nextReviewDate: String(r.next_review_date),
      });
    }

    const { data: existingRows, error: exErr } = await auth.supabase
      .from("srs_reviews")
      .select("flashcard_id, interval_days, repetitions")
      .eq("student_id", scope.studentProfileId)
      .in("flashcard_id", [...allowed]);

    if (exErr) {
      return jsonPrivateNoStore({ message: exErr.message }, { status: 500 });
    }

    const seen = new Set((existingRows ?? []).map((x) => String(x.flashcard_id)));
    const masteredCount = (existingRows ?? []).filter(
      (x) => Number(x.interval_days) >= 21 && Number(x.repetitions) >= 3,
    ).length;

    const newCards = scope.flashcards
      .filter((f) => !seen.has(f.id))
      .slice(0, limitNew)
      .map((card) => ({
        kind: "new" as const,
        flashcardId: card.id,
        question: card.question,
        answer: card.answer,
        moduleTitle: card.moduleTitle,
      }));

    return jsonPrivateNoStore({
      due,
      newCards,
      stats: {
        dueCount: due.length,
        newCount: newCards.length,
        masteredCount,
        totalFlashcards: scope.flashcards.length,
      },
    });
  } catch (error) {
    return jsonPrivateNoStore(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
