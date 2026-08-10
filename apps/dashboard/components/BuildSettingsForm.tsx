"use client";

import { useState, useTransition } from "react";

interface Current {
  repoUrl: string;
  buildCommand: string;
  outputDir: string;
}

export function BuildSettingsForm({
  action,
  current,
}: {
  action: (prev: { error?: string } | null, fd: FormData) => Promise<{ error?: string }>;
  current: Current;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaved(false);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await action(null, fd);
      if (result?.error) {
        setError(result.error);
      } else {
        setError(null);
        setSaved(true);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {saved && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Saved.
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700">
          Repository URL
        </label>
        <input
          name="repoUrl"
          defaultValue={current.repoUrl}
          placeholder="https://github.com/you/my-site"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
        />
        <p className="mt-1 text-xs text-zinc-400">
          Public HTTPS or SSH git URL. Private repos require an SSH key (Step 6).
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Build command</label>
          <input
            name="buildCommand"
            defaultValue={current.buildCommand}
            placeholder="npm install && npm run build"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Output directory</label>
          <input
            name="outputDir"
            defaultValue={current.outputDir}
            placeholder="dist"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
      >
        {isPending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
