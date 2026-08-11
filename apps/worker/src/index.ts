import { getRedis } from "./redis";
import { runBuild } from "./build";
import { runContainerApp, stopContainerApp } from "./container";
import { relinkSlug, unlinkSlug, syncCaddyRoutes } from "./caddy";

const QUEUE_KEY = "velour:deploy:queue";

type QueueMessage =
  | { type?: "build"; deploymentId: string }
  | { type: "relink"; slug: string; artifactPath: string }
  | { type: "container-stop"; slug: string }
  | { type: "project-delete"; slug: string; projectType: string };

async function main() {
  console.log("Worker started, waiting for jobs…");
  const redis = getRedis();

  while (true) {
    const result = await redis.blpop(QUEUE_KEY, 30);
    if (!result) continue;

    const [, raw] = result;
    let msg: QueueMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      console.error("Invalid queue payload:", raw);
      continue;
    }

    const type = (msg as { type?: string }).type ?? "build";

    try {
      if (type === "build") {
        const { deploymentId } = msg as { deploymentId: string };
        console.log("Processing build:", deploymentId);
        await runBuild(deploymentId);
      } else if (type === "container-build") {
        const { deploymentId } = msg as { deploymentId: string };
        console.log("Processing container deployment:", deploymentId);
        await runContainerApp(deploymentId);
      } else if (type === "relink") {
        const { slug, artifactPath } = msg as { slug: string; artifactPath: string };
        console.log("Relinking slug:", slug, "→", artifactPath);
        await relinkSlug(slug, artifactPath);
      } else if (type === "container-stop") {
        const { slug } = msg as { slug: string };
        console.log("Stopping container for slug:", slug);
        await stopContainerApp(slug);
      } else if (type === "project-delete") {
        const { slug, projectType } = msg as { slug: string; projectType: string };
        console.log("Cleaning up deleted project:", slug);
        if (projectType === "container") await stopContainerApp(slug);
        await unlinkSlug(slug);
        // Rebuild Caddy config without the deleted project's route
        await syncCaddyRoutes().catch((err) => console.error("Caddy sync after delete failed:", err));
      } else {
        console.error("Unknown queue message type:", type);
      }
    } catch (err) {
      console.error("Unhandled error processing job:", err);
    }
  }
}

main().catch((err) => {
  console.error("Worker crashed:", err);
  process.exit(1);
});
