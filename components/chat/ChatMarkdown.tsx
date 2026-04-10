"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

type Props = {
  markdown: string;
  /**
   * When true, uses light-on-dark colors (e.g. user bubble).
   * We keep this separate so the same Markdown rules apply everywhere.
   */
  inverted?: boolean;
};

export function ChatMarkdown({ markdown, inverted }: Props) {
  return (
    <div className={inverted ? "chat-markdown chat-markdown-inverted" : "chat-markdown"}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              className={inverted ? "underline underline-offset-2 text-white/95" : "underline underline-offset-2 text-blue-700"}
            >
              {children}
            </a>
          ),
          code: ({ children, className, ...props }) => {
            const isBlock = typeof className === "string" && className.includes("language-");
            if (isBlock) {
              return (
                <code className="block" {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code
                className={
                  inverted
                    ? "rounded-md bg-white/15 px-1.5 py-0.5 text-[0.85em] text-white"
                    : "rounded-md bg-slate-100 px-1.5 py-0.5 text-[0.85em] text-slate-900"
                }
                {...props}
              >
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre
              className={
                inverted
                  ? "my-2 overflow-x-auto rounded-xl bg-black/30 p-3 text-[12px] leading-relaxed text-white"
                  : "my-2 overflow-x-auto rounded-xl bg-slate-900 p-3 text-[12px] leading-relaxed text-slate-50"
              }
            >
              {children}
            </pre>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

