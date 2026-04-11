import { Suspense } from "react";
import { LessonRoomClient } from "@/components/learning/lesson-room-client";

export default function LearnLessonPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-600">
          Loading…
        </div>
      }
    >
      <LessonRoomClient />
    </Suspense>
  );
}
