import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { getBearerToken, requireStudentSession } from "@/lib/assessment/require-student";

/** Pancingan meta selama intake (bukan jawaban soal). */
export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return Response.json({ message: "Missing token" }, { status: 401 });
    const auth = await requireStudentSession(token);
    if (!auth.ok) return Response.json({ message: auth.message }, { status: auth.status });

    const body = (await req.json()) as { message?: string; language?: string };
    const msg = String(body.message ?? "").trim().slice(0, 500);
    if (!msg) return Response.json({ message: "message wajib." }, { status: 400 });

    if (!process.env.ANTHROPIC_API_KEY?.trim()) {
      return Response.json({
        assistantContent:
          "Coba uraikan dengan kata-katamu sendiri dulu, lalu bandingkan dengan pilihan yang ada. Fokus pada alasan singkat, bukan jawaban lengkap.",
      });
    }

    const modelId = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";
    const lang = body.language === "en" ? "English" : "Indonesian";
    const { text } = await generateText({
      model: anthropic(modelId),
      prompt: `Student is in an adaptive placement intake (Layer 1). They ask for a hint only — NOT the direct answer to a test item.
Reply in ${lang}, max 3 short sentences. Encourage reasoning; do not give multiple-choice letters or full solutions.
Student question: ${msg}`,
      maxOutputTokens: 256,
    });

    return Response.json({ assistantContent: text.trim() });
  } catch (e) {
    return Response.json(
      { message: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
