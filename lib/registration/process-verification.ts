import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email/mailer";

type VerRow = {
  id: string;
  user_id: string;
  email: string;
  role: string;
  status: string;
  expires_at: string;
  payload: unknown;
};

export type ProcessResult =
  | { ok: true; message: string }
  | { ok: false; status: number; message: string };

/**
 * Setujui / tolak pendaftaran berdasarkan baris registration_verifications (token atau id admin).
 */
export async function processRegistrationVerification(
  supabase: SupabaseClient,
  ver: VerRow,
  action: "approve" | "reject",
  appBaseUrl: string,
): Promise<ProcessResult> {
  if (String(ver.status) !== "PENDING") {
    return { ok: false, status: 409, message: "Permintaan sudah diproses sebelumnya." };
  }
  if (new Date(ver.expires_at).getTime() < Date.now()) {
    await supabase
      .from("registration_verifications")
      .update({ status: "EXPIRED" })
      .eq("id", ver.id);
    return { ok: false, status: 410, message: "Permintaan verifikasi sudah kedaluwarsa." };
  }

  if (action === "reject") {
    await supabase
      .from("registration_verifications")
      .update({ status: "REJECTED", rejected_at: new Date().toISOString() })
      .eq("id", ver.id);
    return { ok: true, message: "Pendaftaran ditolak." };
  }

  await supabase
    .from("users")
    .update({
      registration_approved: true,
      registration_approved_at: new Date().toISOString(),
    })
    .eq("id", ver.user_id);

  await supabase
    .from("registration_verifications")
    .update({ status: "APPROVED", approved_at: new Date().toISOString() })
    .eq("id", ver.id);

  const role = String(ver.role ?? "")
    .trim()
    .toUpperCase();
  const intakeUrl = `${appBaseUrl}/?from=approved&open=assessment`;
  const loginUrl = `${appBaseUrl}/`;
  const fullName =
    typeof ver.payload === "object" && ver.payload && "fullName" in (ver.payload as Record<string, unknown>)
      ? String((ver.payload as Record<string, unknown>).fullName ?? ver.email)
      : ver.email;

  const isStudent = role === "STUDENT";
  const subject = "Registrasi APEX Anda Sudah Diverifikasi";
  const studentText = [
    `Halo ${fullName},`,
    "",
    "Registrasi Anda telah diverifikasi oleh Admin APEX.",
    "Silakan login, lalu lanjut intake assessment melalui link berikut:",
    intakeUrl,
    "",
    "Jika link tidak bisa diklik, copy-paste URL di atas ke browser Anda.",
    "",
    "Terima kasih.",
  ].join("\n");
  const genericText = [
    `Halo ${fullName},`,
    "",
    "Registrasi Anda telah diverifikasi oleh Admin APEX.",
    "Silakan login melalui link berikut:",
    loginUrl,
    "",
    "Terima kasih.",
  ].join("\n");

  // SMTP/provider tertentu kadang lebih ketat terhadap isi link query panjang.
  // Coba kirim email siswa dulu, lalu fallback ke email login generik bila gagal.
  try {
    await sendEmail({
      to: ver.email,
      subject,
      text: isStudent ? studentText : genericText,
    });
  } catch (e) {
    console.error("[processRegistrationVerification] primary sendEmail failed", {
      role,
      email: ver.email,
      verificationId: ver.id,
      error: e instanceof Error ? e.message : String(e),
    });
    if (!isStudent) {
      return {
        ok: false,
        status: 500,
        message: "Akun disetujui, tetapi email konfirmasi parent gagal dikirim. Cek SMTP/log server.",
      };
    }
    try {
      await sendEmail({
        to: ver.email,
        subject,
        text: genericText,
      });
      return {
        ok: true,
        message:
          "Disetujui. Email siswa dengan format fallback telah dikirim (link intake dapat dibuka setelah login).",
      };
    } catch (fallbackErr) {
      console.error("[processRegistrationVerification] fallback sendEmail failed", {
        role,
        email: ver.email,
        verificationId: ver.id,
        error: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
      });
      return {
        ok: false,
        status: 500,
        message:
          "Akun siswa disetujui, tetapi email konfirmasi gagal dikirim (utama + fallback). Cek SMTP/log server.",
      };
    }
  }

  return {
    ok: true,
    message: isStudent
      ? "Disetujui. Email konfirmasi siswa (link intake) telah dikirim."
      : "Disetujui. Email konfirmasi orang tua telah dikirim.",
  };
}
