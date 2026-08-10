import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { projects } from "@velour/db";
import { eq, and } from "drizzle-orm";
import { renameProject, deleteProject } from "@/lib/actions";
import { RenameForm } from "@/components/RenameForm";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function SettingsPage({ params }: Props) {
  const { slug } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/");

  const db = getDb();
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.slug, slug), eq(projects.userId, session.user.id)))
    .limit(1);

  if (!project) redirect("/projects");

  const renameAction = renameProject.bind(null, slug);
  const deleteAction = deleteProject.bind(null, slug);

  return (
    <div className="max-w-2xl space-y-8">
      {/* Rename */}
      <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-medium text-zinc-900">Project name</h2>
        <RenameForm action={renameAction} currentName={project.name} />
      </div>

      {/* Project info */}
      <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-medium text-zinc-900">Project details</h2>
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-zinc-500">Slug</dt>
            <dd className="font-mono text-zinc-900">{project.slug}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-zinc-500">Project ID</dt>
            <dd className="font-mono text-xs text-zinc-400">{project.id}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-zinc-500">Created</dt>
            <dd className="text-zinc-900">{project.createdAt.toLocaleDateString()}</dd>
          </div>
        </dl>
      </div>

      {/* Danger zone */}
      <div className="rounded-lg border border-red-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 font-medium text-red-600">Danger zone</h2>
        <p className="mb-4 text-sm text-zinc-500">
          Deleting this project removes all deployments, environment variables, and domain records. This cannot be undone.
        </p>
        <form action={deleteAction}>
          <button
            type="submit"
            className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-100"
            onClick={(e) => {
              if (!confirm(`Delete "${project.name}"? This cannot be undone.`)) e.preventDefault();
            }}
          >
            Delete project
          </button>
        </form>
      </div>
    </div>
  );
}
