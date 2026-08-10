"use client";

import { useRef, useState, useTransition } from "react";

export function EnvVarForm({
  action,
}: {
  action: (prev: { error?: string } | null, fd: FormData) => Promise<{ error?: string }>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await action(null, fd);
      if (result?.error) {
        setError(result.error);
      } else {
        setError(null);
        formRef.current?.reset();
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="flex gap-3">
        <input
          name="key"
          placeholder="VARIABLE_NAME"
          required
          className="flex-1 rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm uppercase outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
        />
        <input
          name="value"
          type="password"
          placeholder="value"
          required
          className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
        />
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {isPending ? "Adding…" : "Add"}
        </button>
      </div>
    </form>
  );
}
