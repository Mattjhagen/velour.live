"use client";

import { useState } from "react";

export function StaticLogView({ lines }: { lines: string[] }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-950 font-mono text-xs text-zinc-300">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
        <span className="text-zinc-500">Build log</span>
        <button
          onClick={handleCopy}
          disabled={lines.length === 0}
          className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-30 transition-colors"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <div className="max-h-[520px] overflow-y-auto p-4 leading-5">
        {lines.length === 0 ? (
          <span className="text-zinc-600">No log output.</span>
        ) : (
          lines.map((l, i) => (
            <div key={i} className={
              l.startsWith("ERROR") || l.startsWith("FAILED") ? "text-red-400"
              : l.startsWith("===") ? "font-semibold text-violet-400"
              : l.startsWith("[runtime]") ? "text-sky-400"
              : ""
            }>
              {l}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
