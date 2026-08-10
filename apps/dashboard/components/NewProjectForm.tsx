"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createProject } from "@/lib/actions";
import { validateSlug } from "@/lib/slug";

function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

export function NewProjectForm() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManual, setSlugManual] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!slugManual) setSlug(nameToSlug(name));
  }, [name, slugManual]);

  useEffect(() => {
    if (!slug) { setSlugError(null); return; }
    const v = validateSlug(slug);
    setSlugError(v.valid ? null : (v.error ?? "Invalid"));
  }, [slug]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (slugError) return;
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createProject(null, fd);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700">Project name</label>
        <input
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My awesome app"
          required
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700">Slug</label>
        <div className="flex overflow-hidden rounded-md border border-zinc-300 focus-within:border-violet-500 focus-within:ring-1 focus-within:ring-violet-500">
          <span className="border-r border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-500 select-none">
            velour.live/
          </span>
          <input
            name="slug"
            value={slug}
            onChange={(e) => { setSlug(e.target.value); setSlugManual(true); }}
            placeholder="my-app"
            required
            className="flex-1 bg-white px-3 py-2 font-mono text-sm outline-none"
          />
        </div>
        {slugError && <p className="mt-1 text-xs text-red-600">{slugError}</p>}
        {!slugError && slug && (
          <p className="mt-1 text-xs text-zinc-400">
            Will be served at <span className="font-mono">{slug}.velour.live</span>
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={isPending || !!slugError || !slug}
        className="w-full rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-50"
      >
        {isPending ? "Creating…" : "Create project"}
      </button>
    </form>
  );
}
