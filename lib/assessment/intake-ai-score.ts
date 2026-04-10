import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";

export type OpenScoreResult = {
  points: number;
  maxPoints: number;
  rationale: string;
};

/**
 * Skor jawaban terbuka intake dengan model (Anthropic), mengikuti scoring_rubric JSON di bank.
 * Tanpa API key / error model → null (caller memakai fallback).
 */
export async function scoreIntakeOpenEndedWithAi(input: {
  stem: string;
  learnerText: string;
  rubricJson: unknown;
  languageHint?: "id" | "en";
}): Promise<OpenScoreResult | null> {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) return null;

  const rubricStr =
    typeof input.rubricJson === "object" && input.rubricJson !== null
      ? JSON.stringify(input.rubricJson, null, 0)
      : String(input.rubricJson ?? "{}");

  const modelId = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

  const prompt = `You are an assessment scorer for a student intake (holistic learning platform).
Score the student's SHORT answer against the rubric. Be fair; partial credit allowed.

STEM (question):
${input.stem.slice(0, 4000)}

RUBRIC (JSON — use maxPoints and criteria from it):
${rubricStr.slice(0, 6000)}

STUDENT ANSWER:
${input.learnerText.slice(0, 4000)}

Reply with ONLY valid JSON, no markdown:
{"points":<number>=awarded,"maxPoints":<number>,"rationale":<string max 400 chars>}

Rules:
- maxPoints must match rubric max if present, else use rubric.points or 2.
- points must be between 0 and maxPoints.
- rationale in ${input.languageHint === "en" ? "English" : "Indonesian"} (brief).`;

  try {
    const { text } = await generateText({
      model: anthropic(modelId),
      prompt,
      maxOutputTokens: 512,
    });

    const raw = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    const parsed = JSON.parse(raw) as { points?: unknown; maxPoints?: unknown; rationale?: unknown };
    const maxPoints =
      typeof parsed.maxPoints === "number" && Number.isFinite(parsed.maxPoints) && parsed.maxPoints > 0
        ? Math.min(20, parsed.maxPoints)
        : 2;
    let points =
      typeof parsed.points === "number" && Number.isFinite(parsed.points) ? parsed.points : maxPoints * 0.5;
    points = Math.max(0, Math.min(maxPoints, points));
    const rationale =
      typeof parsed.rationale === "string" ? parsed.rationale.slice(0, 500) : "Scored by model.";

    return { points, maxPoints, rationale };
  } catch {
    return null;
  }
}
