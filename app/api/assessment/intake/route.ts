import { generateIntakeCatBank } from "@/lib/ai/generate-intake-cat-bank";
import { ensureAssessmentSession, getBearerToken, requireStudentSession } from "@/lib/assessment/require-student";
import {
  foldThetaFromAttempts,
  maxPointsFromRubric,
  selectNextCatItemId,
  thetaAfterItemAttempt,
} from "@/lib/assessment/intake-cat";
import { CALIBRATION_DIMENSIONS, thetaToLevel, type CalibrationDimension } from "@/lib/calibration/engine";
import { aggregatePlacementFromAttempts } from "@/lib/intake/compute-intake-placement";
import type { IntakeBankItemJson } from "@/lib/intake/fallback-intake-bank";

function addDays(d: Date, days: number): string {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x.toISOString();
}

function parseGradeLabel(raw: unknown): string {
  const t = String(raw ?? "").trim().toUpperCase();
  if (t === "SD" || t === "SMP" || t === "SMA" || t === "SMK") return t;
  return "SMP";
}

function scoreMcqItem(item: IntakeBankItemJson, selectedOptionId: string): { scored: number; max: number } {
  const rubric = item.scoring_rubric as { correctOptionId?: string; points?: number };
  const max = typeof rubric.points === "number" && rubric.points > 0 ? rubric.points : 1;
  const correct = String(rubric.correctOptionId ?? "A")
    .toUpperCase()
    .slice(0, 1);
  const sel = String(selectedOptionId ?? "")
    .toUpperCase()
    .slice(0, 1);
  return { scored: sel === correct ? max : 0, max };
}

function bankFromJson(raw: unknown): IntakeBankItemJson[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is IntakeBankItemJson => {
    if (!x || typeof x !== "object") return false;
    const o = x as Record<string, unknown>;
    return (
      typeof o.id === "string" &&
      typeof o.dimension === "string" &&
      o.item_type === "MULTIPLE_CHOICE" &&
      typeof o.stem === "string" &&
      Array.isArray(o.options)
    );
  });
}

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return Response.json({ message: "Missing token" }, { status: 401 });
    const auth = await requireStudentSession(token);
    if (!auth.ok) return Response.json({ message: auth.message }, { status: auth.status });

    const supabase = auth.supabase;
    const sessionRow = await ensureAssessmentSession(supabase, auth.userId);

    const { data: profile, error: pErr } = await supabase
      .from("student_profiles")
      .select("grade_level")
      .eq("user_id", auth.userId)
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (pErr) return Response.json({ message: pErr.message }, { status: 500 });

    const gradeLabel = parseGradeLabel(profile?.grade_level);

    const { data: interview } = await supabase
      .from("intake_interviews")
      .select("id, status, generated_bank")
      .eq("assessment_session_id", sessionRow.id)
      .eq("user_id", auth.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const bank = interview?.status === "IN_PROGRESS" ? bankFromJson(interview.generated_bank) : [];

    let attemptsRows: {
      bank_item_id: string | null;
      scored_points: number | null;
      theta_estimate_after: number | null;
    }[] = [];
    if (interview?.id) {
      const { data: att } = await supabase
        .from("intake_item_attempts")
        .select("bank_item_id, scored_points, theta_estimate_after")
        .eq("interview_id", interview.id)
        .order("seq", { ascending: true });
      attemptsRows = att ?? [];
    }

    const catHint =
      interview?.status === "IN_PROGRESS" && bank.length > 0
        ? (() => {
            const next = selectNextCatItemId(bank, attemptsRows, { maxItems: 20, minPerDimension: 2 });
            return {
              nextBankItemId: next.nextId,
              thetaEstimate: next.thetaEstimate,
              attemptsCount: next.attemptCount,
              maxCatItems: 20,
            };
          })()
        : null;

    const intakeThetaPayload = sessionRow.intake_theta;
    const intakeThetaObj =
      intakeThetaPayload && typeof intakeThetaPayload === "object" && !Array.isArray(intakeThetaPayload)
        ? (intakeThetaPayload as Record<string, unknown>)
        : {};

    return Response.json({
      assessmentSession: {
        id: sessionRow.id,
        status: sessionRow.status,
        calibrationEndsAt: sessionRow.calibration_ends_at ? String(sessionRow.calibration_ends_at) : null,
        intakeTheta: intakeThetaObj,
        intakeCi: typeof sessionRow.intake_ci === "number" ? sessionRow.intake_ci : 2.4,
      },
      interview: interview
        ? { id: interview.id, status: interview.status }
        : null,
      scenarioPrompts: [] as unknown[],
      itemBank: bank.map((b) => ({
        id: b.id,
        slug: b.slug,
        dimension: b.dimension,
        subject: b.subject,
        item_type: b.item_type,
        stem: b.stem,
        options: b.options,
        scoring_rubric: b.scoring_rubric,
      })),
      catHint,
      gradeLabel,
    });
  } catch (e) {
    return Response.json(
      { message: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return Response.json({ message: "Missing token" }, { status: 401 });
    const auth = await requireStudentSession(token);
    if (!auth.ok) return Response.json({ message: auth.message }, { status: auth.status });

    const body = (await req.json()) as Record<string, unknown>;
    const action = String(body.action ?? "").trim();

    const supabase = auth.supabase;
    const sessionRow = await ensureAssessmentSession(supabase, auth.userId);

    const { data: profile, error: pErr } = await supabase
      .from("student_profiles")
      .select("grade_level")
      .eq("user_id", auth.userId)
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (pErr) return Response.json({ message: pErr.message }, { status: 500 });
    const gradeLabel = parseGradeLabel(profile?.grade_level);

    if (action === "start") {
      if (String(sessionRow.status).toUpperCase() !== "PENDING") {
        return Response.json({ message: "Intake hanya untuk sesi berstatus PENDING." }, { status: 409 });
      }

      const { data: existing } = await supabase
        .from("intake_interviews")
        .select("id, status, generated_bank")
        .eq("assessment_session_id", sessionRow.id)
        .eq("user_id", auth.userId)
        .eq("status", "IN_PROGRESS")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing?.id) {
        const bankLen = Array.isArray(existing.generated_bank) ? existing.generated_bank.length : 0;
        if (bankLen > 0) {
          return Response.json({ ok: true, reused: true, interviewId: existing.id });
        }
      }

      const bank = await generateIntakeCatBank({ gradeLabel });
      const { data: ins, error: insErr } = await supabase
        .from("intake_interviews")
        .insert({
          user_id: auth.userId,
          assessment_session_id: sessionRow.id,
          status: "IN_PROGRESS",
          generated_bank: bank,
          summary: { gradeLabel, source: "ai_or_fallback" },
        })
        .select("id")
        .single();
      if (insErr || !ins) {
        return Response.json({ message: insErr?.message ?? "Gagal membuat intake interview." }, { status: 500 });
      }
      return Response.json({ ok: true, reused: false, interviewId: ins.id });
    }

    if (action === "conversation_turn") {
      const interviewId = String(body.interviewId ?? "").trim();
      const seqNo = Number(body.seqNo);
      const role = String(body.role ?? "").trim();
      const content = String(body.content ?? "").trim();
      if (!interviewId || !["system", "assistant", "user"].includes(role) || !content) {
        return Response.json({ message: "interviewId, seqNo, role, content wajib valid." }, { status: 400 });
      }
      const { data: own, error: ownErr } = await supabase
        .from("intake_interviews")
        .select("id")
        .eq("id", interviewId)
        .eq("user_id", auth.userId)
        .maybeSingle();
      if (ownErr || !own) {
        return Response.json({ message: "Interview tidak ditemukan." }, { status: 404 });
      }
      const { error } = await supabase.from("intake_conversation_turns").insert({
        interview_id: interviewId,
        seq_no: Number.isFinite(seqNo) ? seqNo : 0,
        role,
        content: content.slice(0, 8000),
        metadata: typeof body.metadata === "object" && body.metadata !== null ? body.metadata : {},
      });
      if (error) return Response.json({ message: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    if (action === "scenario_response") {
      // Persistkan respons skenario ke conversation turn dengan metadata terstruktur
      const promptId = String(body.promptId ?? "").trim();
      const response = body.response;
      if (promptId && response && typeof response === "object") {
        // Cari interview aktif untuk sesi ini
        const { data: activeIntv } = await supabase
          .from("intake_interviews")
          .select("id")
          .eq("assessment_session_id", sessionRow.id)
          .eq("user_id", auth.userId)
          .eq("status", "IN_PROGRESS")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (activeIntv?.id) {
          await supabase.from("intake_conversation_turns").insert({
            interview_id: activeIntv.id,
            seq_no: Date.now() % 100000,
            role: "user",
            content: JSON.stringify(response).slice(0, 2000),
            metadata: { type: "scenario_response", promptId, response },
          });
        }
      }
      return Response.json({ ok: true });
    }

    if (action === "item_attempt") {
      if (String(sessionRow.status).toUpperCase() !== "PENDING") {
        return Response.json({ message: "Sesi tidak dalam mode intake." }, { status: 409 });
      }
      const interviewId = String(body.interviewId ?? "").trim();
      const bankItemId = String(body.bankItemId ?? "").trim();
      const seq = Number(body.seq);
      const dimension = String(body.dimension ?? "").trim().toLowerCase();
      if (!interviewId || !bankItemId || !Number.isFinite(seq)) {
        return Response.json({ message: "interviewId, bankItemId, seq wajib." }, { status: 400 });
      }
      if (!CALIBRATION_DIMENSIONS.includes(dimension as CalibrationDimension)) {
        return Response.json({ message: "dimension tidak valid." }, { status: 400 });
      }

      const { data: intv, error: intvErr } = await supabase
        .from("intake_interviews")
        .select("id, generated_bank, status")
        .eq("id", interviewId)
        .eq("user_id", auth.userId)
        .maybeSingle();
      if (intvErr || !intv || intv.status !== "IN_PROGRESS") {
        return Response.json({ message: "Interview tidak ditemukan atau sudah selesai." }, { status: 404 });
      }

      const bank = bankFromJson(intv.generated_bank);
      const item = bank.find((b) => b.id === bankItemId);
      if (!item) {
        return Response.json({ message: "Item bank tidak valid." }, { status: 400 });
      }

      const lr = body.learnerResponse;
      const selected =
        lr && typeof lr === "object" && lr !== null && "selectedOptionId" in lr
          ? String((lr as { selectedOptionId: unknown }).selectedOptionId ?? "")
          : "";
      const { scored, max } = scoreMcqItem(item, selected);

      const { data: prevAttempts } = await supabase
        .from("intake_item_attempts")
        .select("bank_item_id, scored_points, theta_estimate_after")
        .eq("interview_id", interviewId)
        .order("seq", { ascending: true });

      const attemptsSoFar = [...(prevAttempts ?? [])];
      const maxById = new Map<string, number>();
      for (const b of bank) maxById.set(b.id, maxPointsFromRubric(b.scoring_rubric));

      const prevFold = foldThetaFromAttempts(
        attemptsSoFar.map((a) => ({
          bank_item_id: a.bank_item_id,
          scored_points: a.scored_points,
          theta_estimate_after: a.theta_estimate_after,
        })),
        maxById,
      );
      const thetaAfter = thetaAfterItemAttempt(prevFold, scored, max);

      const { error: attErr } = await supabase.from("intake_item_attempts").insert({
        interview_id: interviewId,
        assessment_session_id: sessionRow.id,
        bank_item_id: bankItemId,
        seq,
        dimension,
        scored_points: scored,
        max_points: max,
        theta_estimate_after: thetaAfter,
        learner_response: lr && typeof lr === "object" ? lr : {},
      });
      if (attErr) return Response.json({ message: attErr.message }, { status: 500 });

      attemptsSoFar.push({
        bank_item_id: bankItemId,
        scored_points: scored,
        theta_estimate_after: thetaAfter,
      });

      const next = selectNextCatItemId(bank, attemptsSoFar, { maxItems: 20, minPerDimension: 2 });
      return Response.json({
        ok: true,
        nextBankItemId: next.nextId,
        scoredPoints: scored,
        thetaEstimateAfter: thetaAfter,
        aiRationale: null as string | null,
      });
    }

    if (action === "complete") {
      if (String(sessionRow.status).toUpperCase() !== "PENDING") {
        return Response.json({ message: "Intake sudah diselesaikan sebelumnya." }, { status: 409 });
      }
      const interviewId = String(body.interviewId ?? "").trim();
      if (!interviewId) {
        return Response.json({ message: "interviewId wajib." }, { status: 400 });
      }

      const { data: intv, error: intvErr } = await supabase
        .from("intake_interviews")
        .select("id, status")
        .eq("id", interviewId)
        .eq("user_id", auth.userId)
        .maybeSingle();
      if (intvErr || !intv || intv.status !== "IN_PROGRESS") {
        return Response.json({ message: "Interview tidak valid." }, { status: 404 });
      }

      const { data: attRows } = await supabase
        .from("intake_item_attempts")
        .select("dimension, scored_points, max_points")
        .eq("interview_id", interviewId)
        .order("seq", { ascending: true });

      const { placementLevels, intakeTheta, ratios, narratives } = aggregatePlacementFromAttempts(attRows ?? [], gradeLabel);

      const intakeThetaExtended = {
        ...intakeTheta,
        placementLevels,
        ratios,
        source: "intake_cat_layer1",
        completedAt: new Date().toISOString(),
      };

      const calibrationEnds = addDays(new Date(), 14);

      const { error: upSessionErr } = await supabase
        .from("assessment_sessions")
        .update({
          status: "CALIBRATING",
          intake_theta: intakeThetaExtended,
          calibration_ends_at: calibrationEnds,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sessionRow.id)
        .eq("user_id", auth.userId);
      if (upSessionErr) return Response.json({ message: upSessionErr.message }, { status: 500 });

      const { error: upIntErr } = await supabase
        .from("intake_interviews")
        .update({
          status: "COMPLETED",
          placement_levels: placementLevels,
          summary: {
            ...(typeof body.academicCatSummary === "object" && body.academicCatSummary !== null
              ? (body.academicCatSummary as object)
              : {}),
            ratios,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", interviewId);
      if (upIntErr) return Response.json({ message: upIntErr.message }, { status: 500 });

      const defaultCi = typeof sessionRow.intake_ci === "number" ? sessionRow.intake_ci : 2.4;
      for (const dim of CALIBRATION_DIMENSIONS) {
        const theta = intakeTheta[dim];
        const row = {
          user_id: auth.userId,
          dimension: dim,
          theta,
          ci: defaultCi,
          level: thetaToLevel(theta),
          source: "INTAKE" as const,
          updated_at: new Date().toISOString(),
        };
        const { error: cpErr } = await supabase.from("competency_profiles").upsert(row, {
          onConflict: "user_id,dimension",
        });
        if (cpErr) return Response.json({ message: cpErr.message }, { status: 500 });
      }

      return Response.json({
        ok: true,
        placementLevels,
        intakeTheta,
        ratios,
        narratives,
        gradeLabel,
        message:
          "Intake selesai. Orang tua dapat memvalidasi ringkasan di menu kontrol orang tua sebelum penempatan final dikunci.",
      });
    }

    return Response.json({ message: "action tidak dikenal." }, { status: 400 });
  } catch (e) {
    return Response.json(
      { message: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
