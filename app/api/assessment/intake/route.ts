import {
  CALIBRATION_DIMENSIONS,
  thetaToLevel,
  type CalibrationDimension,
} from "@/lib/calibration/engine";
import {
  foldThetaFromAttempts,
  maxPointsFromRubric,
  selectNextCatItemId,
  thetaAfterItemAttempt,
  type CatAttemptRow,
  type CatBankItem,
} from "@/lib/assessment/intake-cat";
import { scoreIntakeOpenEndedWithAi } from "@/lib/assessment/intake-ai-score";
import {
  ensureAssessmentSession,
  getBearerToken,
  requireStudentSession,
} from "@/lib/assessment/require-student";

function parseCombinedTheta(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== "object") return null;
  const src = value as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const dim of CALIBRATION_DIMENSIONS) {
    const v = src[dim];
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    if (v < 1 || v > 10) return null;
    out[dim] = v;
  }
  return out;
}

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return Response.json({ message: "Missing token" }, { status: 401 });

    const auth = await requireStudentSession(token);
    if (!auth.ok) return Response.json({ message: auth.message }, { status: auth.status });

    const { supabase, userId } = auth;
    const session = await ensureAssessmentSession(supabase, userId);

    const { data: interview } = await supabase
      .from("intake_interviews")
      .select(
        "id, status, target_duration_minutes, started_at, completed_at, academic_cat_summary, character_scenario_summary, islamic_baseline, combined_intake_theta, dimension_display_labels",
      )
      .eq("assessment_session_id", session.id)
      .maybeSingle();

    const MAX_CAT_ITEMS = 12;

    const url = new URL(req.url);
    const dimensionFilter = url.searchParams.get("dimension")?.trim();
    const bankLimit = Math.min(20, Math.max(1, Number(url.searchParams.get("bankLimit") ?? "8")));

    let bankQuery = supabase
      .from("intake_item_bank")
      .select("id, slug, dimension, subject, item_type, difficulty_logit, stem, options, scoring_rubric")
      .eq("active", true)
      .limit(bankLimit);
    if (dimensionFilter && CALIBRATION_DIMENSIONS.includes(dimensionFilter as CalibrationDimension)) {
      bankQuery = bankQuery.eq("dimension", dimensionFilter);
    }
    const { data: bankItems } = await bankQuery;

    const { data: scenarioPrompts } = await supabase
      .from("intake_scenario_prompts")
      .select("id, slug, scenario_text, response_mode, options, sort_order")
      .eq("active", true)
      .order("sort_order", { ascending: true });

    let catHint: {
      nextBankItemId: string | null;
      thetaEstimate: number;
      attemptsCount: number;
      maxCatItems: number;
    } | null = null;

    if (interview?.status === "IN_PROGRESS" && interview.id && (bankItems?.length ?? 0) > 0) {
      const { data: attRows } = await supabase
        .from("intake_item_attempts")
        .select("bank_item_id, scored_points, theta_estimate_after, seq")
        .eq("interview_id", interview.id)
        .order("seq", { ascending: true });
      const attempts: CatAttemptRow[] = (attRows ?? []).map((r) => ({
        bank_item_id: r.bank_item_id ? String(r.bank_item_id) : null,
        scored_points: typeof r.scored_points === "number" ? r.scored_points : null,
        theta_estimate_after: typeof r.theta_estimate_after === "number" ? r.theta_estimate_after : null,
      }));
      const bankCat: CatBankItem[] = (bankItems ?? []).map((b) => ({
        id: String(b.id),
        dimension: String(b.dimension),
        difficulty_logit: typeof b.difficulty_logit === "number" ? b.difficulty_logit : null,
        scoring_rubric: b.scoring_rubric,
      }));
      const cat = selectNextCatItemId(bankCat, attempts, { maxItems: MAX_CAT_ITEMS });
      catHint = {
        nextBankItemId: cat.nextId,
        thetaEstimate: cat.thetaEstimate,
        attemptsCount: cat.attemptCount,
        maxCatItems: MAX_CAT_ITEMS,
      };
    }

    return Response.json({
      assessmentSession: {
        id: session.id,
        status: session.status,
        calibrationEndsAt: session.calibration_ends_at,
        intakeTheta: session.intake_theta,
        intakeCi: session.intake_ci ?? 2.4,
      },
      interview: interview ?? null,
      scenarioPrompts: scenarioPrompts ?? [],
      itemBank: bankItems ?? [],
      catHint,
    });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

type PostBody = {
  action?: string;
  seqNo?: number;
  role?: "system" | "assistant" | "user";
  content?: string;
  metadata?: Record<string, unknown>;
  seq?: number;
  dimension?: string;
  bankItemId?: string | null;
  difficultyAtPresent?: number | null;
  learnerResponse?: Record<string, unknown>;
  scoredPoints?: number | null;
  thetaEstimateAfter?: number | null;
  latencyMs?: number | null;
  promptId?: string;
  response?: Record<string, unknown>;
  academicCatSummary?: Record<string, unknown>;
  characterScenarioSummary?: Record<string, unknown>;
  islamicBaseline?: Record<string, unknown>;
  combinedIntakeTheta?: Record<string, number>;
  dimensionDisplayLabels?: Record<string, string>;
  /** Skor jawaban terbuka lewat model (Anthropic) sesuai scoring_rubric. */
  aiScoreOpen?: boolean;
};

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return Response.json({ message: "Missing token" }, { status: 401 });

    const auth = await requireStudentSession(token);
    if (!auth.ok) return Response.json({ message: auth.message }, { status: auth.status });

    const body = (await req.json()) as PostBody;
    const action = body.action?.trim();
    if (!action) return Response.json({ message: "action is required" }, { status: 400 });

    const { supabase, userId } = auth;
    const session = await ensureAssessmentSession(supabase, userId);
    const nowIso = new Date().toISOString();

    const { data: interviewRow, error: intErr } = await supabase
      .from("intake_interviews")
      .select("id, status")
      .eq("assessment_session_id", session.id)
      .maybeSingle();
    if (intErr) return Response.json({ message: intErr.message }, { status: 500 });

    async function requireInterview() {
      if (!interviewRow) {
        return Response.json({ message: "Intake belum dimulai. Gunakan action start." }, { status: 409 });
      }
      if (interviewRow.status === "COMPLETED") {
        return Response.json({ message: "Intake sudah selesai." }, { status: 409 });
      }
      if (interviewRow.status === "ABANDONED") {
        return Response.json({ message: "Intake dibatalkan. Hubungi admin untuk reset." }, { status: 409 });
      }
      return null;
    }

    if (action === "start") {
      if (interviewRow?.status === "COMPLETED") {
        return Response.json({ message: "Intake sudah selesai." }, { status: 409 });
      }
      if (interviewRow?.status === "IN_PROGRESS") {
        return Response.json({
          ok: true,
          interviewId: interviewRow.id,
          assessmentSessionId: session.id,
          reused: true,
        });
      }
      if (interviewRow?.status === "ABANDONED") {
        return Response.json({ message: "Sesi intake dibatalkan." }, { status: 409 });
      }

      const { data: created, error: createErr } = await supabase
        .from("intake_interviews")
        .insert({
          user_id: userId,
          assessment_session_id: session.id,
          status: "IN_PROGRESS",
        })
        .select("id")
        .single();
      if (createErr) {
        if (createErr.code === "23505") {
          const { data: again } = await supabase
            .from("intake_interviews")
            .select("id")
            .eq("assessment_session_id", session.id)
            .single();
          if (again) {
            return Response.json({
              ok: true,
              interviewId: again.id,
              assessmentSessionId: session.id,
              reused: true,
            });
          }
        }
        return Response.json({ message: createErr.message }, { status: 500 });
      }
      return Response.json({
        ok: true,
        interviewId: created.id,
        assessmentSessionId: session.id,
        reused: false,
      });
    }

    const block = await requireInterview();
    if (block) return block;
    const interviewId = interviewRow!.id;

    if (action === "conversation_turn") {
      if (typeof body.seqNo !== "number" || body.seqNo < 0) {
        return Response.json({ message: "seqNo wajib angka >= 0" }, { status: 400 });
      }
      if (body.role !== "system" && body.role !== "assistant" && body.role !== "user") {
        return Response.json({ message: "role wajib system|assistant|user" }, { status: 400 });
      }
      if (!body.content?.trim()) {
        return Response.json({ message: "content wajib diisi" }, { status: 400 });
      }
      const { error } = await supabase.from("intake_conversation_turns").insert({
        interview_id: interviewId,
        seq_no: body.seqNo,
        role: body.role,
        content: body.content.trim(),
        metadata: body.metadata ?? {},
      });
      if (error) {
        if (error.code === "23505") {
          return Response.json({ message: "seqNo sudah digunakan untuk interview ini." }, { status: 409 });
        }
        return Response.json({ message: error.message }, { status: 500 });
      }
      await supabase.from("intake_interviews").update({ updated_at: nowIso }).eq("id", interviewId);
      return Response.json({ ok: true });
    }

    if (action === "item_attempt") {
      if (typeof body.seq !== "number" || body.seq < 0) {
        return Response.json({ message: "seq wajib angka >= 0" }, { status: 400 });
      }
      if (!body.dimension || !CALIBRATION_DIMENSIONS.includes(body.dimension as CalibrationDimension)) {
        return Response.json({ message: "dimension tidak valid" }, { status: 400 });
      }
      if (!body.learnerResponse || typeof body.learnerResponse !== "object") {
        return Response.json({ message: "learnerResponse wajib object" }, { status: 400 });
      }

      const MAX_CAT_ITEMS = 12;
      let scoredPoints =
        typeof body.scoredPoints === "number" && Number.isFinite(body.scoredPoints) ? body.scoredPoints : 0;
      let difficultyAtPresent = body.difficultyAtPresent ?? null;
      let learnerResponse: Record<string, unknown> = { ...body.learnerResponse };
      let aiRationale: string | undefined;

      if (body.bankItemId) {
        const { data: bankRow, error: bankErr } = await supabase
          .from("intake_item_bank")
          .select("id, dimension, item_type, stem, scoring_rubric, difficulty_logit")
          .eq("id", body.bankItemId)
          .maybeSingle();
        if (bankErr) return Response.json({ message: bankErr.message }, { status: 500 });
        if (!bankRow) return Response.json({ message: "Bank item tidak ditemukan." }, { status: 404 });
        if (String(bankRow.dimension) !== String(body.dimension)) {
          return Response.json({ message: "dimension tidak cocok dengan bank item." }, { status: 400 });
        }
        difficultyAtPresent =
          typeof bankRow.difficulty_logit === "number" ? bankRow.difficulty_logit : difficultyAtPresent;

        const maxPts = maxPointsFromRubric(bankRow.scoring_rubric);

        if (String(bankRow.item_type) === "OPEN_SHORT" && body.aiScoreOpen === true) {
          const text = typeof learnerResponse.text === "string" ? learnerResponse.text.trim() : "";
          if (!text) {
            return Response.json({ message: "Jawaban teks wajib untuk skor AI." }, { status: 400 });
          }
          const ai = await scoreIntakeOpenEndedWithAi({
            stem: String(bankRow.stem ?? ""),
            learnerText: text,
            rubricJson: bankRow.scoring_rubric,
          });
          if (ai) {
            scoredPoints = ai.points;
            aiRationale = ai.rationale;
            learnerResponse = {
              ...learnerResponse,
              _apexAiMaxPoints: ai.maxPoints,
              _apexAiRationale: ai.rationale,
            };
          } else {
            scoredPoints = maxPts * 0.45;
            learnerResponse = {
              ...learnerResponse,
              _apexAiFallback: true,
            };
          }
        }
        if (typeof scoredPoints !== "number" || !Number.isFinite(scoredPoints)) {
          scoredPoints = 0;
        }

        const { data: prevRows } = await supabase
          .from("intake_item_attempts")
          .select("bank_item_id, scored_points, theta_estimate_after, seq")
          .eq("interview_id", interviewId)
          .order("seq", { ascending: true });
        const prevAttempts: CatAttemptRow[] = (prevRows ?? []).map((r) => ({
          bank_item_id: r.bank_item_id ? String(r.bank_item_id) : null,
          scored_points: typeof r.scored_points === "number" ? r.scored_points : null,
          theta_estimate_after: typeof r.theta_estimate_after === "number" ? r.theta_estimate_after : null,
        }));

        const { data: bankAll } = await supabase
          .from("intake_item_bank")
          .select("id, scoring_rubric")
          .eq("active", true)
          .limit(48);
        const maxById = new Map<string, number>();
        for (const b of bankAll ?? []) {
          maxById.set(String(b.id), maxPointsFromRubric(b.scoring_rubric));
        }
        const thetaBefore = foldThetaFromAttempts(prevAttempts, maxById);
        const maxForTheta =
          String(bankRow.item_type) === "OPEN_SHORT" && typeof learnerResponse._apexAiMaxPoints === "number"
            ? Number(learnerResponse._apexAiMaxPoints)
            : maxPts;
        const thetaAfter = thetaAfterItemAttempt(thetaBefore, scoredPoints, Math.max(0.01, maxForTheta));

        const { error } = await supabase.from("intake_item_attempts").insert({
          interview_id: interviewId,
          bank_item_id: body.bankItemId,
          seq: body.seq,
          dimension: body.dimension,
          difficulty_at_present: difficultyAtPresent,
          learner_response: learnerResponse,
          scored_points: scoredPoints,
          theta_estimate_after: thetaAfter,
          latency_ms: body.latencyMs ?? null,
        });
        if (error) {
          if (error.code === "23505") {
            return Response.json({ message: "seq sudah digunakan." }, { status: 409 });
          }
          return Response.json({ message: error.message }, { status: 500 });
        }

        const { data: afterRows } = await supabase
          .from("intake_item_attempts")
          .select("bank_item_id, scored_points, theta_estimate_after, seq")
          .eq("interview_id", interviewId)
          .order("seq", { ascending: true });
        const attemptsAfter: CatAttemptRow[] = (afterRows ?? []).map((r) => ({
          bank_item_id: r.bank_item_id ? String(r.bank_item_id) : null,
          scored_points: typeof r.scored_points === "number" ? r.scored_points : null,
          theta_estimate_after: typeof r.theta_estimate_after === "number" ? r.theta_estimate_after : null,
        }));
        const { data: bankFull } = await supabase
          .from("intake_item_bank")
          .select("id, dimension, difficulty_logit, scoring_rubric")
          .eq("active", true)
          .limit(48);
        const bankCat: CatBankItem[] = (bankFull ?? []).map((b) => ({
          id: String(b.id),
          dimension: String(b.dimension),
          difficulty_logit: typeof b.difficulty_logit === "number" ? b.difficulty_logit : null,
          scoring_rubric: b.scoring_rubric,
        }));
        const cat = selectNextCatItemId(bankCat, attemptsAfter, { maxItems: MAX_CAT_ITEMS });

        await supabase.from("intake_interviews").update({ updated_at: nowIso }).eq("id", interviewId);
        return Response.json({
          ok: true,
          nextBankItemId: cat.nextId,
          thetaEstimate: cat.thetaEstimate,
          attemptsCount: cat.attemptCount,
          scoredPoints,
          thetaEstimateAfter: thetaAfter,
          aiRationale: aiRationale ?? null,
        });
      }

      const { error } = await supabase.from("intake_item_attempts").insert({
        interview_id: interviewId,
        bank_item_id: body.bankItemId ?? null,
        seq: body.seq,
        dimension: body.dimension,
        difficulty_at_present: difficultyAtPresent,
        learner_response: learnerResponse,
        scored_points: scoredPoints,
        theta_estimate_after: body.thetaEstimateAfter ?? null,
        latency_ms: body.latencyMs ?? null,
      });
      if (error) {
        if (error.code === "23505") {
          return Response.json({ message: "seq sudah digunakan." }, { status: 409 });
        }
        return Response.json({ message: error.message }, { status: 500 });
      }
      await supabase.from("intake_interviews").update({ updated_at: nowIso }).eq("id", interviewId);
      return Response.json({ ok: true, nextBankItemId: null, scoredPoints, aiRationale: null });
    }

    if (action === "scenario_response") {
      if (!body.promptId?.trim()) {
        return Response.json({ message: "promptId wajib" }, { status: 400 });
      }
      if (!body.response || typeof body.response !== "object") {
        return Response.json({ message: "response wajib object" }, { status: 400 });
      }
      const { error } = await supabase.from("intake_scenario_responses").insert({
        interview_id: interviewId,
        prompt_id: body.promptId.trim(),
        response: body.response,
      });
      if (error) return Response.json({ message: error.message }, { status: 500 });
      await supabase.from("intake_interviews").update({ updated_at: nowIso }).eq("id", interviewId);
      return Response.json({ ok: true });
    }

    if (action === "complete") {
      const thetaMap = parseCombinedTheta(body.combinedIntakeTheta);
      if (!thetaMap) {
        return Response.json(
          { message: "combinedIntakeTheta wajib berisi keenam dimensi dengan angka 1–10." },
          { status: 400 },
        );
      }

      const { data: completedRows, error: upIntErr } = await supabase
        .from("intake_interviews")
        .update({
          status: "COMPLETED",
          completed_at: nowIso,
          academic_cat_summary: body.academicCatSummary ?? {},
          character_scenario_summary: body.characterScenarioSummary ?? {},
          islamic_baseline: body.islamicBaseline ?? {},
          combined_intake_theta: thetaMap,
          dimension_display_labels: body.dimensionDisplayLabels ?? {},
          updated_at: nowIso,
        })
        .eq("id", interviewId)
        .eq("status", "IN_PROGRESS")
        .select("id");
      if (upIntErr) return Response.json({ message: upIntErr.message }, { status: 500 });
      if (!completedRows?.length) {
        return Response.json(
          { message: "Intake tidak bisa diselesaikan (bukan IN_PROGRESS atau sudah selesai)." },
          { status: 409 },
        );
      }

      const calEnd = new Date();
      calEnd.setDate(calEnd.getDate() + 14);

      const intakeCi = Number(session.intake_ci ?? 2.4);

      const { error: sessErr } = await supabase
        .from("assessment_sessions")
        .update({
          status: "CALIBRATING",
          intake_theta: thetaMap,
          calibration_ends_at: calEnd.toISOString(),
          updated_at: nowIso,
        })
        .eq("id", session.id);
      if (sessErr) return Response.json({ message: sessErr.message }, { status: 500 });

      const labels = body.dimensionDisplayLabels ?? {};
      for (const dim of CALIBRATION_DIMENSIONS) {
        const theta = thetaMap[dim];
        const label = labels[dim];
        const { error: profErr } = await supabase.from("competency_profiles").upsert(
          {
            user_id: userId,
            dimension: dim,
            theta,
            ci: intakeCi,
            level: thetaToLevel(theta),
            source: "INTAKE",
            equivalent_band_label: typeof label === "string" && label.trim() ? label.trim() : null,
            locked_at: null,
            updated_at: nowIso,
          },
          { onConflict: "user_id,dimension" },
        );
        if (profErr) return Response.json({ message: profErr.message }, { status: 500 });
      }

      return Response.json({ ok: true, calibrationEndsAt: calEnd.toISOString() });
    }

    return Response.json({ message: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
