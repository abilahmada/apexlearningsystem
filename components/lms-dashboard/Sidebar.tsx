import React from "react";

function NavIcon({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-white text-slate-600">
      {children}
    </span>
  );
}

function ActiveNavIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[#2563EB] text-white shadow-sm">
      {children}
    </span>
  );
}

function LogoIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M8 12h8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M12 8v8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M6.5 2H20v20H6.5A2.5 2.5 0 0 0 4 19.5V4.5A2.5 2.5 0 0 1 6.5 2Z"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M12 6v6l4 2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SparklesIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M12 2l1.2 4.3L17.5 8l-4.3 1.2L12 13.5l-1.2-4.3L6.5 8l4.3-1.7L12 2Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M19 14l.7 2.4L22 17l-2.3.6L19 20l-.7-2.4L16 17l2.3-.6L19 14Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M19.4 15a1.8 1.8 0 0 0 .4 2l.1.1-1.7 3-0.2-.1a1.9 1.9 0 0 0-2.2.3l-.1.2-3-1.7.1-.2a1.9 1.9 0 0 0-.3-2.2l-.2-.1-3 1.7-.1-.2a1.9 1.9 0 0 0 .3-2.2l-.1-.2-1.7-3 .1-.2a1.8 1.8 0 0 0 2-.4l.1-.1 1.7-3 .2.1a1.9 1.9 0 0 0 2.2-.3l.1-.2 3 1.7-.1.2a1.9 1.9 0 0 0 .3 2.2l.2.1 3-1.7.1.2a1.9 1.9 0 0 0-.3 2.2l.1.2 1.7 3-.1.2a1.8 1.8 0 0 0-2 .4Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.35"
      />
    </svg>
  );
}

export default function Sidebar() {
  const items = [
    { key: "learn", label: "Learn", icon: <BookIcon /> },
    { key: "review", label: "Review", icon: <ClockIcon /> },
    { key: "insights", label: "Insights", icon: <SparklesIcon /> },
    { key: "settings", label: "Settings", icon: <SettingsIcon /> },
  ];

  return (
    <>
      {/* Desktop / Tablet */}
      <aside className="hidden md:flex md:flex-col md:w-[88px] md:shrink-0 md:bg-white md:border-r">
        <div className="flex flex-col items-center py-6 gap-6">
          <div className="w-12 h-12 rounded-2xl bg-[#2563EB] text-white flex items-center justify-center shadow-sm">
            <LogoIcon />
          </div>

          <nav className="flex flex-col items-center gap-3" aria-label="Sidebar navigation">
            {items.map((it, idx) => {
              const isActive = idx === 0;
              return (
                <button
                  key={it.key}
                  type="button"
                  aria-label={it.label}
                  className="focus:outline-none"
                >
                  {isActive ? <ActiveNavIcon>{it.icon}</ActiveNavIcon> : <NavIcon>{it.icon}</NavIcon>}
                </button>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <aside className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t">
        <div className="h-16 px-3 flex items-center justify-between">
          {items.map((it, idx) => {
            const isActive = idx === 0;
            return (
              <button
                key={it.key}
                type="button"
                aria-label={it.label}
                className="flex-1 flex items-center justify-center focus:outline-none"
              >
                {isActive ? (
                  <span className="w-10 h-10 rounded-xl bg-[#2563EB] text-white flex items-center justify-center shadow-sm">
                    {it.icon}
                  </span>
                ) : (
                  <span className="w-10 h-10 rounded-xl bg-white text-slate-600 flex items-center justify-center">
                    {it.icon}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </aside>
    </>
  );
}

