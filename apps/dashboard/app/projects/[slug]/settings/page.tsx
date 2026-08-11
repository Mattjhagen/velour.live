import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { projects } from "@velour/db";
import { eq, and } from "drizzle-orm";
import {
  renameProject,
  deleteProject,
  updateBuildSettings,
  updateContainerSettings,
  rotateWebhookSecret,
  revokeWebhookSecret,
} from "@/lib/actions";
import { RenameForm } from "@/components/RenameForm";
import { BuildSettingsForm } from "@/components/BuildSettingsForm";
import { ContainerSettingsForm } from "@/components/ContainerSettingsForm";
import { DeleteProjectButton } from "@/components/DeleteProjectButton";
import { WebhookSettingsForm } from "@/components/WebhookSettingsForm";

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
  const buildAction = updateBuildSettings.bind(null, slug);
  const containerAction = updateContainerSettings.bind(null, slug);
  const deleteAction = deleteProject.bind(null, slug);
  const rotateAction = rotateWebhookSecret.bind(null, slug);
  const revokeAction = revokeWebhookSecret.bind(null, slug);

  const origin = process.env.NEXTAUTH_URL ?? `https://${process.env.VELOUR_DOMAIN ?? "velour.live"}`;
  const webhookUrl = `${origin}/api/github/webhook?project=${slug}`;

  return (
    <div className="max-w-2xl space-y-8">
      {/* Rename */}
      <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-medium text-zinc-900">Project name</h2>
        <RenameForm action={renameAction} currentName={project.name} />
      </div>

      {/* Build settings */}
      <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 font-medium text-zinc-900">Build settings</h2>
        <p className="mb-4 text-sm text-zinc-500">
          Configure the repository and build command for deployments.
        </p>
        <BuildSettingsForm
          action={buildAction}
          current={{
            repoUrl: project.repoUrl ?? "",
            buildCommand: project.buildCommand,
            outputDir: project.outputDir,
          }}
        />
      </div>

      {/* Deployment type */}
      <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 font-medium text-zinc-900">Deployment type</h2>
        <p className="mb-4 text-sm text-zinc-500">
          Choose how your project is deployed and served.
        </p>
        <ContainerSettingsForm
          action={containerAction}
          current={{ projectType: project.projectType, containerPort: project.containerPort }}
        />
      </div>

      {/* GitHub Webhook */}
      <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 font-medium text-zinc-900">GitHub webhook</h2>
        <p className="mb-4 text-sm text-zinc-500">
          Automatically deploy when you push to your repository.
        </p>
        <WebhookSettingsForm
          slug={slug}
          hasSecret={!!project.githubWebhookSecret}
          webhookUrl={webhookUrl}
          rotateAction={rotateAction}
          revokeAction={revokeAction}
        />
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
            <dt className="text-zinc-500">Type</dt>
            <dd className="font-mono text-zinc-900">{project.projectType}</dd>
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
        <DeleteProjectButton action={deleteAction} projectName={project.name} />
      </div>
    </div>
  );
}
