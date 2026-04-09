import React from "react";
import SocraticTutorWidget from "@/components/lms-dashboard/SocraticTutorWidget";

function CoursePyIcon() {
  return (
    <div className="w-12 h-12 rounded-xl bg-[#2563EB] flex items-center justify-center text-white font-bold">
      Py
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="w-full">
      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-[#2563EB]"
          style={{ width: `${clamped}%` }}
          aria-hidden="true"
        />
      </div>
      <div className="mt-2 text-[12px] text-slate-500 flex items-center justify-between">
        <span>Progress {clamped}%</span>
      </div>
    </div>
  );
}

function SmallTag({
  variant,
  children,
}: {
  variant: "blue" | "orange" | "red" | "green";
  children: React.ReactNode;
}) {
  const styles: Record<typeof variant, string> = {
    blue: "bg-blue-50 text-[#2563EB] border-blue-100",
    orange: "bg-orange-50 text-[#F97316] border-orange-100",
    red: "bg-red-50 text-red-600 border-red-100",
    green: "bg-emerald-50 text-emerald-600 border-emerald-100",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-[12px] font-medium border ${styles[variant]}`}
    >
      {children}
    </span>
  );
}

function TopicRow({
  title,
  tag,
  tagVariant,
  colorLetter,
}: {
  title: string;
  tag: string;
  tagVariant: "blue" | "orange" | "red" | "green";
  colorLetter: string;
}) {
  const iconBg =
    tagVariant === "red"
      ? "bg-red-50 text-red-600 border-red-100"
      : tagVariant === "orange"
        ? "bg-orange-50 text-[#F97316] border-orange-100"
        : tagVariant === "green"
          ? "bg-emerald-50 text-emerald-600 border-emerald-100"
          : "bg-blue-50 text-[#2563EB] border-blue-100";

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-white/80 border border-slate-200">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${iconBg}`}>
          <span className="text-sm font-semibold">{colorLetter}</span>
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-800 truncate">
            {title}
          </div>
          <div className="text-[12px] text-slate-500">
            Last reviewed: yesterday
          </div>
        </div>
      </div>
      <SmallTag variant={tagVariant}>{tag}</SmallTag>
    </div>
  );
}

export default function MainContent() {
  return (
    <main className="px-6 pb-24 md:pb-8">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        {/* Left card */}
        <section className="rounded-2xl bg-white border border-slate-200 p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-[#2563EB]/10 flex items-center justify-center text-[#2563EB]">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <path
                      d="M12 5v14"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    <path
                      d="M5 12h14"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                <h2 className="text-sm font-semibold text-slate-800">
                  Continue Learning
                </h2>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Keep momentum with your current topics
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/30 p-4">
            <div className="flex items-start gap-4">
              <CoursePyIcon />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-800">
                  Python Intermediate
                </div>
                <div className="text-[12px] text-slate-500 mt-1">
                  Continued 2 hours ago
                </div>
                <div className="mt-4">
                  <ProgressBar value={67} />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-800">
                Metacognition Check
              </div>
              <button
                type="button"
                className="rounded-full bg-white border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 opacity-70"
                disabled
              >
                Not started
              </button>
            </div>
          </div>
        </section>

        {/* Right card */}
        <section className="rounded-2xl bg-white border border-slate-200 p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center text-[#F97316]">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <path
                      d="M12 2l2.2 7h7.3l-5.9 4.2 2.2 7-5.8-4.2-5.8 4.2 2.2-7L2.5 9h7.3L12 2Z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <h2 className="text-sm font-semibold text-slate-800">
                  Spaced Repetition
                </h2>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Strengthen your memory with these topics
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3">
            <TopicRow
              title="Solving Linear Equations"
              tag="Overdue"
              tagVariant="red"
              colorLetter="I"
            />
            <TopicRow
              title="Identifying Metaphors & Similes"
              tag="Review now"
              tagVariant="orange"
              colorLetter="M"
            />
            <TopicRow
              title="Order of Operations (PEMDAS)"
              tag="Tomorrow"
              tagVariant="blue"
              colorLetter="O"
            />
          </div>

          <button
            type="button"
            className="mt-5 w-full rounded-2xl bg-[#F97316] text-white font-semibold px-5 py-3 flex items-center justify-center gap-2 shadow-sm"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M12 5v14"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M5 12h14"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            Start Review Session
          </button>
        </section>
      </div>

      <SocraticTutorWidget />
    </main>
  );
}

