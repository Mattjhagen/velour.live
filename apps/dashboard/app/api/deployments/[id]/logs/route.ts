import { type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { buildLogs, deployments, projects } from "@velour/db";
import { eq, and, asc } from "drizzle-orm";

const TERMINAL = new Set(["live", "failed", "stopped", "rolled_back"]);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const db = getDb();
  const rows = await db
    .select({ state: deployments.state })
    .from(deployments)
    .innerJoin(projects, eq(deployments.projectId, projects.id))
    .where(and(eq(deployments.id, id), eq(projects.userId, session.user.id)))
    .limit(1);

  if (!rows.length) return new Response("Not found", { status: 404 });

  const enc = new TextEncoder();
  let offset = 0;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (line: string) =>
        controller.enqueue(enc.encode(`data: ${JSON.stringify(line)}\n\n`));

      while (!closed) {
        const logs = await db
          .select()
          .from(buildLogs)
          .where(eq(buildLogs.deploymentId, id))
          .orderBy(asc(buildLogs.createdAt))
          .offset(offset)
          .limit(200);

        for (const l of logs) send(l.line);
        offset += logs.length;

        const [cur] = await db
          .select({ state: deployments.state })
          .from(deployments)
          .where(eq(deployments.id, id))
          .limit(1);

        if (!cur || TERMINAL.has(cur.state)) {
          controller.close();
          return;
        }

        await new Promise<void>((r) => setTimeout(r, 1000));
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
