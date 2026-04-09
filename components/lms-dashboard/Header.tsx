import React from "react";
import { ApexLogo } from "../apex/apex-logo";

function FireIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M12 22c4.2 0 7-2.7 7-7 0-3-1.3-5-3-6.9.1 1.5-.7 2.8-2 3.6C13.8 6 14 4 14 2c-4 2.2-6 6-6 11 0 4.3 2.8 9 4 10Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M12 17c1.4 0 3-1 3-3 0-1.5-.8-2.4-2-3.2-.1.9-.6 1.5-1.4 1.9-.5.3-.6 1-.6 1.4 0 1.4.5 2.9 1 3Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CrownIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M4 7l4 4 4-7 4 7 4-4v14H4V7Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Header() {
  return (
    <header className="px-6 pt-6 pb-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2">
            <ApexLogo size={28} wordmarkColor="#0A1128" />
          </div>
          <div className="text-sm font-medium text-slate-700">Good morning, Alex!</div>
          <div className="text-xs text-slate-500 mt-1">
            Ready to continue your learning adventure?
          </div>
        </div>

        <div className="flex items-stretch gap-3">
          <div className="hidden sm:flex items-center gap-2 rounded-xl bg-white border border-slate-200 px-4 py-3">
            <div className="text-[#2563EB]">
              <FireIcon />
            </div>
            <div className="leading-tight">
              <div className="text-[11px] text-slate-500">Streak</div>
              <div className="text-sm font-semibold text-slate-800">12 days</div>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-xl bg-white border border-slate-200 px-4 py-3">
            <div className="text-[#2563EB]">
              <CrownIcon />
            </div>
            <div className="leading-tight">
              <div className="text-[11px] text-slate-500">Mastery Level</div>
              <div className="text-sm font-semibold text-slate-800">85%</div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

