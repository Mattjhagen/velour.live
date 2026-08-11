"use client";

import { useActionState } from "react";
import { rotateEncryptionKey } from "@/lib/actions";

export function RotateKeyForm() {
  const [state, action, pending] = useActionState(rotateEncryptionKey, null);

  return (
    <form action={action} className="space-y-4">
      {state?.error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </div>
      )}
      {state?.rotated !== undefined && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Rotated {state.rotated} environment variable{state.rotated !== 1 ? "s" : ""}.
          Update VELOUR_ENCRYPTION_KEY in .env and restart the dashboard now.
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700">
          New encryption key (64 hex chars)
        </label>
        <input
          name="newKey"
          type="password"
          autoComplete="off"
          placeholder="Paste the output of: openssl rand -hex 32"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
      >
        {pending ? "Rotating…" : "Rotate key"}
      </button>
    </form>
  );
}
