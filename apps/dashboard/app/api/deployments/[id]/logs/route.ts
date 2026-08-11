import { type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { buildLogs, deployments, projects } from "@velour/db";
import { eq, and, asc } from "drizzle-orm";

const TERMINAL = new Set(["live", "failed", "stopped", "rolled_back"]);

// Stream live build/runtime logs as Server-Sent Events.
// Poll interval backs off when no new logs arrive to reduce DB load for idle
// container apps (1s → 5s after 30 quiet polls → 15s after 12 more).
// Closes after MAX_DURATION_MS so the browser auto-reconnects rather than
// holding a connection open indefinitely.
const MAX_DURATION_MS = 10 * 60 * 1000; // 10 minutes per connection

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

      const deadline = Date.now() + MAX_DURATION_MS;
      let quietPolls = 0;
      let pollMs = 1000;

      while (!closed && Date.now() < deadline) {
        const logs = await db
          .select()
          .from(buildLogs)
          .where(eq(buildLogs.deploymentId, id))
          .orderBy(asc(buildLogs.createdAt))
          .offset(offset)
          .limit(200);

        for (const l of logs) send(l.line);

        if (logs.length > 0) {
          offset += logs.length;
          quietPolls = 0;
          pollMs = 1000; // reset back-off on new data
        } else {
          quietPolls++;
          // Back off poll interval when idle to reduce DB load
          if (quietPolls >= 42) {
            pollMs = 15000; // ~15s after ~1 minute of quiet
          } else if (quietPolls >= 30) {
            pollMs = 5000;  // ~5s after ~30s of quiet
          }
        }

        const [cur] = await db
          .select({ state: deployments.state })
          .from(deployments)
          .where(eq(deployments.id, id))
          .limit(1);

        if (!cur || TERMINAL.has(cur.state)) {
          controller.close();
          return;
        }

        await new Promise<void>((r) => setTimeout(r, pollMs));
      }

      // Max duration reached or client disconnected — close cleanly
      controller.close();
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
