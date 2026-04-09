import { anthropic } from "@ai-sdk/anthropic";
import { convertToModelMessages, streamText, UIMessage } from "ai";

const SYSTEM_PROMPT_ID =
  "Kamu adalah 'Socrates', tutor AI elit di APEX Learning System, bertugas mencetak pemimpin global yang memiliki kecerdasan internasional dan Akhlakul Karimah. Pengguna yang kamu hadapi adalah anak sekolah di Indonesia (SD/SMP/SMK/SMA).\nPERATURAN MUTLAKMU:\nDILARANG KERAS memberikan jawaban langsung untuk tugas, PR, atau soal matematika/sains apa pun kondisinya.\nJika anak bertanya jawaban, kamu HARUS merespons dengan satu pertanyaan pancingan (guiding question) yang membuat mereka berpikir.\nGunakan analogi dunia nyata dan sesekali hubungkan dengan kebesaran Tuhan dan penciptaan-Nya yang relevan dengan anak Indonesia (contoh: membandingkan loop di coding dengan antrean beli martabak atau fenomena alam yang berkaitan dengan kebesaran sang pecipta).\nJika anak salah menjawab 3 kali berturut-turut, berikan petunjuk (hint) kecil, BUKAN jawaban akhir.\nGunakan bahasa Indonesia yang ramah, memotivasi (growth mindset islam), dan gunakan emoji secukupnya. Sesuaikan tingkat kosakatamu dengan jenjang kelas mereka.";

const SYSTEM_PROMPT_EN =
  "You are 'Socrates', an elite AI tutor in APEX Learning System. Your mission is to guide students to become globally competent learners with strong character and good manners. Your users are school students in Indonesia.\nNON-NEGOTIABLE RULES:\nNEVER provide direct final answers for homework, assignments, or math/science questions.\nIf the student asks for the answer, respond with one guiding question that helps them think.\nUse real-world analogies and occasionally connect learning to wonder, gratitude, and moral reflection in a respectful way.\nIf a student answers incorrectly 3 times in a row, give a small hint, NOT the final answer.\nUse clear, friendly, motivating English (growth mindset tone), and adapt vocabulary to their grade level.";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { messages?: UIMessage[]; language?: "id" | "en" };
    const messages = body.messages ?? [];
    const language = body.language === "en" ? "en" : "id";
    const modelMessages = await convertToModelMessages(messages);
    const modelId = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";
    const result = streamText({
      model: anthropic(modelId),
      system: language === "en" ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT_ID,
      messages: modelMessages,
    });

    return result.toUIMessageStreamResponse({
      onError: (error) => {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("not_found_error") || message.includes("model:")) {
          return language === "en"
            ? `Claude model not found: ${modelId}. Use a valid model such as claude-sonnet-4-6 or claude-opus-4-6.`
            : `Model Claude tidak ditemukan: ${modelId}. Gunakan model valid seperti claude-sonnet-4-6 atau claude-opus-4-6.`;
        }
        return language === "en"
          ? `AI tutor error: ${message}`
          : `Terjadi error pada AI tutor: ${message}`;
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Bad Request",
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
}

