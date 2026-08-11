"use client";

import { useActionState } from "react";
import type { ProjectType } from "@velour/db";

interface Props {
  action: (prev: { error?: string } | null, data: FormData) => Promise<{ error?: string }>;
  current: { projectType: ProjectType; containerPort: number };
}

export function ContainerSettingsForm({ action, current }: Props) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-zinc-700 mb-1">Project type</label>
        <select
          name="projectType"
          defaultValue={current.projectType}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
        >
          <option value="static">Static site</option>
          <option value="container">Container app (Node.js HTTP)</option>
        </select>
        <p className="mt-1 text-xs text-zinc-400">
          Static sites are served directly from disk. Container apps run as long-lived Docker containers.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700 mb-1">Container port</label>
        <input
          type="number"
          name="containerPort"
          defaultValue={current.containerPort}
          min={1}
          max={65535}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
        <p className="mt-1 text-xs text-zinc-400">
          The port your Node.js app listens on. Ignored for static sites.
        </p>
      </div>

      {state?.error && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save type settings"}
      </button>
    </form>
  );
}
