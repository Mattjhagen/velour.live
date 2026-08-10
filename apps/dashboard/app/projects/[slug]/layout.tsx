import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { projects } from "@velour/db";
import { eq, and } from "drizzle-orm";
import Link from "next/link";
import { TabLink } from "@/components/TabLink";

interface Props {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

export default async function ProjectLayout({ children, params }: Props) {
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

  return (
    <div className="flex h-full flex-col">
      {/* Project header */}
      <div className="border-b border-zinc-200 bg-white px-8 pt-6 pb-0">
        <Link href="/projects" className="text-sm text-zinc-400 hover:text-zinc-600">
          ← Projects
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-zinc-900">{project.name}</h1>
        <a
          href={`https://${project.slug}.velour.live`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-0.5 inline-flex items-center gap-1 font-mono text-xs text-violet-500 hover:text-violet-700 hover:underline"
        >
          {project.slug}.velour.live
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3 w-3 opacity-70">
            <path d="M4.5 2.5H2a1 1 0 0 0-1 1v6.5a1 1 0 0 0 1 1h6.5a1 1 0 0 0 1-1V7M7 1h4m0 0v4m0-4L5 7" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </a>

        {/* Tab bar */}
        <nav className="mt-4 flex gap-0">
          <TabLink href={`/projects/${slug}`} exact label="Deployments" />
          <TabLink href={`/projects/${slug}/env`} label="Environment" />
          <TabLink href={`/projects/${slug}/domains`} label="Domains" />
          <TabLink href={`/projects/${slug}/settings`} label="Settings" />
        </nav>
      </div>

      <div className="flex-1 overflow-auto p-8">{children}</div>
    </div>
  );
}
