import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import {
  ensureAssessmentSession,
  getBearerToken,
  requireStudentSession,
} from "@/lib/assessment/require-student";

const SYSTEM_ID =
  "Kamu adalah Socrates di intake Lapis 1 APEX (wawancara terstruktur). Siswa sedang fase skenario karakter atau refleksi singkat.\n" +
  "Aturan: jawaban maksimal 2–4 paragraf pendek. Jangan beri jawaban ujian/soal langsung. Gunakan pertanyaan pancingan. Bahasa Indonesia ramah.\n" +
  "Jika siswa meminta jawaban langsung, arahkan ke proses berpikir mereka sendiri.";

const SYSTEM_EN =
  "You are Socrates in APEX Layer 1 intake (structured interview). Short replies only (2–4 brief paragraphs). No direct exam answers — use guiding questions. Friendly English.";

export async function POST(req: Request) {
  try {
    if (!process.env.ANTHROPIC_API_KEY?.trim()) {
      return Response.json(
        { message: "AI tutor tidak dikonfigurasi (ANTHROPIC_API_KEY)." },
        { status: 503 },
      );
    }

    const token = getBearerToken(req);
    if (!token) return Response.json({ message: "Missing token" }, { status: 401 });

    const auth = await requireStudentSession(token);
    if (!auth.ok) return Response.json({ message: auth.message }, { status: auth.status });

    const body = (await req.json()) as { message?: string; language?: "id" | "en" };
    const userMsg = typeof body.message === "string" ? body.message.trim() : "";
    if (!userMsg || userMsg.length > 2000) {
      return Response.json({ message: "message (1–2000 chars) wajib." }, { status: 400 });
    }
    const language = body.language === "en" ? "en" : "id";

    const { supabase, userId } = auth;
    const session = await ensureAssessmentSession(supabase, userId);

    const { data: interview, error: intErr } = await supabase
      .from("intake_interviews")
      .select("id, status")
      .eq("assessment_session_id", session.id)
      .maybeSingle();
    if (intErr) return Response.json({ message: intErr.message }, { status: 500 });
    if (!interview || interview.status !== "IN_PROGRESS") {
      return Response.json({ message: "Intake tidak aktif (IN_PROGRESS)." }, { status: 409 });
    }

    const interviewId = interview.id;

    const { data: turns, error: turnErr } = await supabase
      .from("intake_conversation_turns")
      .select("seq_no, role, content")
      .eq("interview_id", interviewId)
      .order("seq_no", { ascending: false })
      .limit(16);
    if (turnErr) return Response.json({ message: turnErr.message }, { status: 500 });

    const ordered = [...(turns ?? [])].reverse();
    const maxSeq = ordered.length ? Math.max(...ordered.map((t) => Number(t.seq_no))) : -1;
    const userSeq = maxSeq + 1;
    const assistantSeq = userSeq + 1;

    const { error: insUserErr } = await supabase.from("intake_conversation_turns").insert({
      interview_id: interviewId,
      seq_no: userSeq,
      role: "user",
      content: userMsg,
      metadata: { source: "intake_socrates_api" },
    });
    if (insUserErr) {
      if (insUserErr.code === "23505") {
        return Response.json({ message: "Urutan percakapan bentrok, coba lagi." }, { status: 409 });
      }
      return Response.json({ message: insUserErr.message }, { status: 500 });
    }

    const historyText = ordered
      .map((t) => `${String(t.role).toUpperCase()}: ${String(t.content).slice(0, 1200)}`)
      .join("\n");

    const modelId = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";
    const { text } = await generateText({
      model: anthropic(modelId),
      system: language === "en" ? SYSTEM_EN : SYSTEM_ID,
      prompt: `Konteks percakapan terbaru (boleh kosong):\n${historyText || "(kosong)"}\n\nPesan siswa sekarang:\n${userMsg}\n\nBalas sebagai Socrates.`,
      maxOutputTokens: 700,
    });

    const assistantContent = text.trim().slice(0, 4000);
    if (!assistantContent) {
      return Response.json({ message: "Model tidak mengembalikan teks." }, { status: 502 });
    }

    const { error: insAsstErr } = await supabase.from("intake_conversation_turns").insert({
      interview_id: interviewId,
      seq_no: assistantSeq,
      role: "assistant",
      content: assistantContent,
      metadata: { source: "intake_socrates_api" },
    });
    if (insAsstErr) {
      return Response.json({ message: insAsstErr.message }, { status: 500 });
    }

    await supabase.from("intake_interviews").update({ updated_at: new Date().toISOString() }).eq("id", interviewId);

    return Response.json({
      ok: true,
      assistantContent,
      userSeqNo: userSeq,
      assistantSeqNo: assistantSeq,
    });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
