"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ChatMarkdown } from "../chat/ChatMarkdown";
import type { Language } from "../apex/apex-context";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function SendIcon() {
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
        d="M22 2 11 13"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M22 2 15 22l-4-9-9-4 20-7Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
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
        d="M18 6 6 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M6 6l12 12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function SocraticTutorWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [language, setLanguage] = useState<Language>("id");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const requestBody = useMemo(() => ({ provider: "anthropic", language }), [language]);

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: requestBody,
    }),
  });
  const isLoading = status === "streaming" || status === "submitted";

  useEffect(() => {
    const applyLanguage = () => {
      const saved = window.localStorage.getItem("apex-language");
      setLanguage(saved === "en" ? "en" : "id");
    };
    applyLanguage();
    window.addEventListener("storage", applyLanguage);
    window.addEventListener("apex-language-change", applyLanguage as EventListener);
    return () => {
      window.removeEventListener("storage", applyLanguage);
      window.removeEventListener("apex-language-change", applyLanguage as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [isOpen, messages.length, isLoading]);

  return (
    <>
      {/* Floating button */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed z-40 bottom-6 right-6 group"
        aria-label={language === "en" ? "Open Socrates AI Tutor" : "Buka Socrates AI Tutor"}
      >
        <span className="flex items-center gap-2 rounded-full bg-[#2563EB] text-white pl-2 pr-4 py-2 shadow-lg transition-transform duration-200 group-hover:scale-[1.03] group-active:scale-95">
          <span className="relative inline-flex w-10 h-10 rounded-full bg-white/20 items-center justify-center">
            <span className="absolute inline-flex h-full w-full rounded-full bg-white/25 animate-ping opacity-40" />
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
              className="relative"
            >
              <path
                d="M12 22c5 0 9-4 9-9s-4-9-9-9-9 4-9 9 4 9 9 9Z"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="M12 8v5l3 2"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="text-sm font-semibold tracking-tight">
            {language === "en" ? "Socrates AI Tutor" : "Socrates AI Tutor"}
          </span>
        </span>
      </button>

      {/* Overlay */}
      <div
        className={cn(
          "fixed inset-0 z-50 transition-opacity",
          isOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        aria-hidden={!isOpen}
      >
        <div
          className={cn(
            "absolute inset-0 bg-slate-900/30 backdrop-blur-[2px] transition-opacity",
            isOpen ? "opacity-100" : "opacity-0",
          )}
          onClick={() => setIsOpen(false)}
        />

        {/* Panel: full-screen on mobile, floating on desktop */}
        <section
          role="dialog"
          aria-modal="true"
          aria-label="Socratic AI Tutor chat"
          className={cn(
            "absolute right-0 bottom-0 w-full h-[92vh] bg-white border-t border-slate-200 rounded-t-3xl shadow-xl",
            "md:right-6 md:bottom-6 md:w-[420px] md:h-[560px] md:rounded-3xl md:border md:border-slate-200",
            "transition-transform duration-200",
            isOpen ? "translate-y-0" : "translate-y-full md:translate-y-6",
          )}
        >
          <header className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900 truncate">
                Socrates • AI Tutor
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {language === "en"
                  ? "A tutor that does not give direct answers 🙂"
                  : "Tutor yang tidak memberi jawaban langsung 🙂"}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="hidden sm:inline-flex items-center rounded-lg bg-slate-100 px-3 py-1 text-xs text-slate-600">
                Provider: Claude
              </span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-9 h-9 rounded-xl border border-slate-200 bg-white text-slate-700 inline-flex items-center justify-center"
                aria-label={language === "en" ? "Close chat" : "Tutup chat"}
              >
                <CloseIcon />
              </button>
            </div>
          </header>

          <div className="px-4 py-4 h-[calc(92vh-64px-72px)] md:h-[calc(560px-64px-72px)] overflow-y-auto">
            {messages.length === 0 ? (
              <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-slate-200 text-sm text-slate-700">
                {language === "en"
                  ? "Hi! I am ready to help you learn. What topic do you want to discuss today?"
                  : "Halo! Aku siap bantu belajar. Kamu ingin bahas topik apa hari ini?"}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {messages.map((m) => {
                  const text = m.parts
                    .filter((p) => p.type === "text")
                    .map((p) => p.text)
                    .join("");
                  const isUser = m.role === "user";
                  return (
                    <div
                      key={m.id}
                      className={cn("flex", isUser ? "justify-end" : "justify-start")}
                    >
                      <div
                        className={cn(
                          "max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap border",
                          isUser
                            ? "bg-[#2563EB] text-white border-[#2563EB]"
                            : "bg-white text-slate-800 border-slate-200",
                        )}
                      >
                        <ChatMarkdown markdown={text} inverted={isUser} />
                      </div>
                    </div>
                  );
                })}

                {isLoading ? (
                  <div className="text-xs text-slate-500 px-1">
                    {language === "en" ? "Typing..." : "Mengetik..."}
                  </div>
                ) : null}

                {error ? (
                  <div className="text-xs text-red-600 px-1">
                    {String(
                      error.message ??
                        (language === "en"
                          ? "An error occurred. Please try again."
                          : "Terjadi error. Coba lagi ya."),
                    )}
                  </div>
                ) : null}

                <div ref={bottomRef} />
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const text = input.trim();
              if (!text) return;
              sendMessage({ text });
              setInput("");
            }}
            className="px-4 py-4 border-t border-slate-200 bg-white"
          >
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.currentTarget.value)}
                placeholder={language === "en" ? "Ask Socrates..." : "Tanya Socrates..."}
                className="flex-1 h-12 rounded-2xl border border-slate-200 bg-[#F8FAFC] px-4 text-sm outline-none focus:ring-2 focus:ring-[#2563EB]/30"
              />
              <button
                type="submit"
                disabled={!input.trim()}
                className={cn(
                  "h-12 w-12 rounded-2xl bg-[#2563EB] text-white inline-flex items-center justify-center shadow-sm",
                  !input.trim() && "bg-[#3B82F6] text-white/90 cursor-not-allowed",
                )}
                aria-label="Send message"
              >
                <SendIcon />
              </button>
            </div>
            <div className="mt-2 text-[11px] text-slate-500">
              {language === "en"
                ? "Tip: for homework/tests, I will guide you with questions, not direct answers."
                : "Tip: kalau ini soal PR/ujian, aku akan bantu dengan pertanyaan pancingan, bukan jawabannya."}
            </div>
          </form>
        </section>
      </div>
    </>
  );
}

