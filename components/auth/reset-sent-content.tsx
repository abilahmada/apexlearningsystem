"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

export function ResetSentContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email")?.trim() ?? "";

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-bold text-slate-900">Cek email Anda / Check your email</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          Jika alamat terdaftar di APEX, kami sudah mengirim tautan untuk mengatur ulang password. Buka email dan ketuk
          tautan tersebut.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          If your address is registered, we sent a reset link. Open the email and tap the link (valid for a limited
          time).
        </p>
        {email ? (
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700">
            <span className="text-slate-500">Email:</span> {email}
          </p>
        ) : null}
        <Link
          href="/"
          className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Kembali ke login / Back to sign in
        </Link>
      </div>
    </div>
  );
}
