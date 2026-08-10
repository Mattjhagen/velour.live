import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { NewProjectForm } from "@/components/NewProjectForm";

export default async function NewProjectPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/");

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href="/projects" className="text-sm text-zinc-400 hover:text-zinc-600">
          ← Projects
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-zinc-900">New project</h1>
      </div>

      <div className="max-w-lg rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <NewProjectForm />
      </div>
    </div>
  );
}
