"use client";

import { useEffect, useRef, useState } from "react";

export function LogStream({ deploymentId }: { deploymentId: string }) {
  const [lines, setLines] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const es = new EventSource(`/api/deployments/${deploymentId}/logs`);

    es.onmessage = (e) => {
      const line = JSON.parse(e.data) as string;
      setLines((prev) => [...prev, line]);
    };

    es.onerror = () => {
      setDone(true);
      es.close();
    };

    es.addEventListener("close", () => {
      setDone(true);
      es.close();
    });

    return () => es.close();
  }, [deploymentId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  return (
    <div className="relative rounded-lg border border-zinc-200 bg-zinc-950 font-mono text-xs text-zinc-300">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
        <span className="text-zinc-500">Build log</span>
        {!done && (
          <span className="flex items-center gap-1.5 text-violet-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400" />
            Live
          </span>
        )}
      </div>
      <div className="max-h-[480px] overflow-y-auto p-4 leading-5">
        {lines.length === 0 && !done ? (
          <span className="text-zinc-600">Waiting for build output…</span>
        ) : (
          lines.map((l, i) => (
            <div key={i} className={l.startsWith("ERROR") || l.startsWith("FAILED") ? "text-red-400" : l.startsWith("===") ? "text-violet-400 font-semibold" : ""}>
              {l}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
