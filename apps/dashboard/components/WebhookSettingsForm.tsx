"use client";

import { useState } from "react";

interface Props {
  slug: string;
  hasSecret: boolean;
  webhookUrl: string;
  rotateAction: () => Promise<{ secret: string } | { error: string }>;
  revokeAction: () => Promise<void>;
}

export function WebhookSettingsForm({ slug, hasSecret, webhookUrl, rotateAction, revokeAction }: Props) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRotate() {
    setPending(true);
    setError(null);
    const result = await rotateAction();
    setPending(false);
    if ("error" in result) {
      setError(result.error);
    } else {
      setRevealed(result.secret);
    }
  }

  async function handleRevoke() {
    if (!confirm("Revoke the webhook secret? GitHub won't be able to trigger deployments until you set a new one.")) return;
    setPending(true);
    await revokeAction();
    setRevealed(null);
    setPending(false);
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-zinc-600 mb-1">Webhook URL</p>
        <code className="block rounded bg-zinc-100 px-3 py-2 text-xs text-zinc-700 break-all select-all">
          {webhookUrl}
        </code>
        <p className="mt-1 text-xs text-zinc-400">
          Add this URL in your GitHub repo → Settings → Webhooks. Set content type to{" "}
          <code className="text-zinc-600">application/json</code> and enable push events.
        </p>
      </div>

      {revealed ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-medium text-amber-700 mb-2">
            Copy this secret now — it won&apos;t be shown again.
          </p>
          <code className="block rounded bg-white px-3 py-2 text-xs text-amber-900 break-all select-all border border-amber-200">
            {revealed}
          </code>
          <button
            onClick={() => setRevealed(null)}
            className="mt-2 text-xs text-amber-600 underline"
          >
            I&apos;ve copied it
          </button>
        </div>
      ) : (
        <p className="text-sm text-zinc-500">
          Status: <span className={hasSecret ? "text-green-600 font-medium" : "text-zinc-400"}>
            {hasSecret ? "Webhook secret configured" : "No secret — webhook disabled"}
          </span>
        </p>
      )}

      {error && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}

      <div className="flex gap-3">
        <button
          onClick={handleRotate}
          disabled={pending}
          className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {pending ? "Working…" : hasSecret ? "Rotate secret" : "Generate secret"}
        </button>
        {hasSecret && (
          <button
            onClick={handleRevoke}
            disabled={pending}
            className="rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Revoke
          </button>
        )}
      </div>
    </div>
  );
}
