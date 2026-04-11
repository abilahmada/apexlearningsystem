import { Suspense } from "react";
import { ResetSentContent } from "@/components/auth/reset-sent-content";

export default function ResetSentPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-600">
          Loading…
        </div>
      }
    >
      <ResetSentContent />
    </Suspense>
  );
}
