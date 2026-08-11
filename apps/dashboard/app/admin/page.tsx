import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { RotateKeyForm } from "@/components/RotateKeyForm";

export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/");

  return (
    <div className="mx-auto max-w-2xl space-y-8 py-10 px-4">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Administration</h1>
        <p className="mt-1 text-sm text-zinc-500">System-level operations for this Velour instance.</p>
      </div>

      {/* Encryption key rotation */}
      <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 font-medium text-zinc-900">Rotate encryption key</h2>
        <p className="mb-4 text-sm text-zinc-500">
          Re-encrypts all stored environment variables with a new AES-256-GCM key.
          Generate a new key with <code className="rounded bg-zinc-100 px-1 font-mono text-xs">openssl rand -hex 32</code>.
        </p>
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <strong>After submitting:</strong> immediately update <code className="font-mono text-xs">VELOUR_ENCRYPTION_KEY</code> in your
          .env on the R510 to the new key and restart with{" "}
          <code className="font-mono text-xs">docker compose up -d dashboard</code>.
          Until restarted, decryption will fail.
        </div>
        <RotateKeyForm />
      </div>
    </div>
  );
}
