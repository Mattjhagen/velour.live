import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { projects, domains } from "@velour/db";
import { eq, and, asc } from "drizzle-orm";
import { addDomain, removeDomain } from "@/lib/actions";
import { DomainForm } from "@/components/DomainForm";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function DomainsPage({ params }: Props) {
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

  const projectDomains = await db
    .select()
    .from(domains)
    .where(eq(domains.projectId, project.id))
    .orderBy(asc(domains.domain));

  const addAction = addDomain.bind(null, slug);

  return (
    <div className="max-w-2xl space-y-8">
      {/* Add domain */}
      <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 font-medium text-zinc-900">Add custom domain</h2>
        <p className="mb-4 text-sm text-zinc-500">
          Point your DNS CNAME to <span className="font-mono">{slug}.velour.live</span> before adding.
        </p>
        <DomainForm action={addAction} />
      </div>

      {/* Notice */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
        <strong>Step 4 pending:</strong> Automatic TLS via Caddy wildcard cert will be wired up in the next milestone. Domains added here are stored but not yet routed.
      </div>

      {/* Domain list */}
      {projectDomains.length > 0 && (
        <div>
          <h2 className="mb-3 font-medium text-zinc-900">Domains</h2>
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
            {projectDomains.map((d, i) => {
              const remove = removeDomain.bind(null, slug, d.id);
              return (
                <div
                  key={d.id}
                  className={`flex items-center justify-between px-4 py-3 ${
                    i < projectDomains.length - 1 ? "border-b border-zinc-100" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm text-zinc-900">{d.domain}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      d.verified
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-zinc-100 text-zinc-500"
                    }`}>
                      {d.verified ? "Verified" : "Pending"}
                    </span>
                  </div>
                  <form action={remove}>
                    <button
                      type="submit"
                      className="rounded px-2.5 py-1 text-xs text-red-500 hover:bg-red-50"
                    >
                      Remove
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
