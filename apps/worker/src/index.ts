import { getRedis } from "./redis";
import { runBuild } from "./build";

const QUEUE_KEY = "velour:deploy:queue";

async function main() {
  console.log("Worker started, waiting for jobs…");
  const redis = getRedis();

  while (true) {
    const result = await redis.blpop(QUEUE_KEY, 30);
    if (!result) continue;

    const [, raw] = result;
    let payload: { deploymentId: string };
    try {
      payload = JSON.parse(raw);
    } catch {
      console.error("Invalid queue payload:", raw);
      continue;
    }

    console.log("Processing deployment:", payload.deploymentId);
    try {
      await runBuild(payload.deploymentId);
    } catch (err) {
      console.error("Unhandled build error for", payload.deploymentId, err);
    }
  }
}

main().catch((err) => {
  console.error("Worker crashed:", err);
  process.exit(1);
});
