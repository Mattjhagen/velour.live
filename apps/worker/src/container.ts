import Dockerode from "dockerode";
import { getDb } from "./db";
import { deployments, projects, buildLogs } from "@velour/db";
import { eq, and } from "drizzle-orm";
import * as fs from "fs/promises";
import * as path from "path";
import { syncCaddyRoutes } from "./caddy";

const docker = new Dockerode({ socketPath: "/var/run/docker.sock" });
const ARTIFACTS_HOST_PATH = process.env.ARTIFACTS_PATH ?? "/var/lib/velour/artifacts";
// Docker Compose prefixes network names with the project name.
// Set INGRESS_NETWORK in your .env to match (e.g. "velour-live_ingress").
const INGRESS_NETWORK = process.env.INGRESS_NETWORK ?? "ingress";

// How long to wait for health before declaring failure
const HEALTH_TIMEOUT_MS = 60_000;
const HEALTH_POLL_MS = 2_000;

// How long the clone+install build step may run
const BUILD_TIMEOUT_MS = 10 * 60 * 1000;

type DB = ReturnType<typeof getDb>;

// ── Public entry points ───────────────────────────────────────────────────────

export async function runContainerApp(deploymentId: string): Promise<void> {
  const db = getDb();

  const rows = await db
    .select()
    .from(deployments)
    .innerJoin(projects, eq(deployments.projectId, projects.id))
    .where(eq(deployments.id, deploymentId))
    .limit(1);

  if (!rows.length) {
    console.error("Container deployment not found:", deploymentId);
    return;
  }

  const { deployments: deployment, projects: project } = rows[0];

  if (!project.repoUrl) {
    await setFailed(db, deploymentId, "No repository URL set — configure it in Settings.");
    return;
  }

  await db.update(deployments)
    .set({ state: "building", updatedAt: new Date() })
    .where(eq(deployments.id, deploymentId));

  await log(db, deploymentId, `=== Velour container build started ===`);
  await log(db, deploymentId, `Repo: ${project.repoUrl}`);
  await log(db, deploymentId, `Port: ${project.containerPort}`);

  const appDir = path.join(ARTIFACTS_HOST_PATH, deploymentId);

  try {
    // 1. Clone and install dependencies in an ephemeral container
    await buildAppSource(db, deploymentId, project.repoUrl, project.buildCommand, appDir);

    // 2. Stop and remove any existing app container for this slug
    await stopContainerApp(project.slug);

    // 3. Start the new container
    const containerName = `velour-app-${project.slug}`;
    await log(db, deploymentId, `Starting container: ${containerName}`);

    const container = await docker.createContainer({
      name: containerName,
      Image: "node:22-alpine",
      Cmd: ["npm", "start"],
      WorkingDir: "/app",
      User: "node",
      HostConfig: {
        NetworkMode: INGRESS_NETWORK,
        Binds: [`${appDir}:/app:ro`],
        Memory: 256 * 1024 * 1024,
        CpuPeriod: 100000,
        CpuQuota: 50000,
        PidsLimit: 128,
        CapDrop: ["ALL"],
        SecurityOpt: ["no-new-privileges"],
        ReadonlyRootfs: false,
        RestartPolicy: { Name: "unless-stopped" },
      },
      ExposedPorts: { [`${project.containerPort}/tcp`]: {} },
      Env: [`PORT=${project.containerPort}`, `NODE_ENV=production`],
    });

    await container.start();
    await log(db, deploymentId, `Container started, waiting for it to become running…`);

    // 4. Wait for the container to be in Running state (checked via Docker inspect,
    //    since the worker and app containers are on different Docker networks).
    const healthy = await waitForRunning(containerName);
    if (!healthy) {
      await container.remove({ force: true });
      await setFailed(db, deploymentId, `Container did not reach running state within ${HEALTH_TIMEOUT_MS / 1000}s`);
      return;
    }

    // 5. Promote to live, atomically rolling back the previous one
    await db.transaction(async (tx) => {
      await tx.update(deployments)
        .set({ state: "rolled_back", updatedAt: new Date() })
        .where(and(
          eq(deployments.projectId, deployment.projectId),
          eq(deployments.state, "live"),
        ));

      await tx.update(deployments)
        .set({ state: "live", updatedAt: new Date(), finishedAt: new Date() })
        .where(eq(deployments.id, deploymentId));
    });

    // 6. Update Caddy to route traffic to this container
    await syncCaddyRoutes({ slug: project.slug, port: project.containerPort });
    await log(db, deploymentId, `=== Container app is live ===`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await log(db, deploymentId, `ERROR: ${msg}`);
    await setFailed(db, deploymentId, msg);
  }
}

export async function stopContainerApp(slug: string): Promise<void> {
  const containerName = `velour-app-${slug}`;
  try {
    const existing = docker.getContainer(containerName);
    const info = await existing.inspect().catch(() => null);
    if (info) {
      await existing.remove({ force: true });
    }
  } catch {
    // Container didn't exist — that's fine
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function buildAppSource(
  db: DB,
  deploymentId: string,
  repoUrl: string,
  buildCommand: string,
  targetDir: string,
): Promise<void> {
  await fs.mkdir(targetDir, { recursive: true });
  await pullImage("node:22-alpine");

  const installCmd = buildCommand.replace(/&&\s*npm run build/, "").trim() || "npm install --production";
  const buildScript = [
    "set -e",
    "apk add --no-cache git 2>&1",
    `git clone --depth 1 "${repoUrl}" /app 2>&1`,
    "cd /app",
    installCmd,
    "cp -rL /app/. /out/",
    "echo '=== Source prepared ==='",
  ].join(" && ");

  let container: Dockerode.Container | null = null;
  let buildNet: Dockerode.Network | null = null;
  let timedOut = false;

  try {
    buildNet = await docker.createNetwork({
      Name: `velour-cbuild-${deploymentId}`,
      Driver: "bridge",
      Labels: { "velour.deployment": deploymentId },
    });

    container = await docker.createContainer({
      name: `velour-cbuild-${deploymentId}`,
      Image: "node:22-alpine",
      Cmd: ["sh", "-c", buildScript],
      HostConfig: {
        NetworkMode: `velour-cbuild-${deploymentId}`,
        Memory: 512 * 1024 * 1024,
        CpuPeriod: 100000,
        CpuQuota: 100000,
        PidsLimit: 256,
        CapDrop: ["ALL"],
        SecurityOpt: ["no-new-privileges"],
        Binds: [`${targetDir}:/out`],
        AutoRemove: false,
      },
    });

    await container.start();

    const logStream = await container.logs({ follow: true, stdout: true, stderr: true });

    const timeout = setTimeout(async () => {
      timedOut = true;
      try { await container!.kill(); } catch {}
    }, BUILD_TIMEOUT_MS);

    await new Promise<void>((resolve) => {
      const buf = { out: "", err: "" };
      const flush = async (key: "out" | "err") => {
        const lines = buf[key].split("\n");
        buf[key] = lines.pop() ?? "";
        for (const l of lines) if (l.trim()) await log(db, deploymentId, l);
      };

      docker.modem.demuxStream(
        logStream,
        { write: (chunk: Buffer) => { buf.out += chunk.toString(); flush("out").catch(() => {}); } },
        { write: (chunk: Buffer) => { buf.err += chunk.toString(); flush("err").catch(() => {}); } },
      );
      logStream.on("end", resolve);
      logStream.on("error", () => resolve());
    });

    clearTimeout(timeout);

    if (timedOut) throw new Error("Source build timed out after 10 minutes");

    const info = await container.inspect();
    if (info.State.ExitCode !== 0) {
      throw new Error(`Source build exited with code ${info.State.ExitCode}`);
    }
  } finally {
    if (container) try { await container.remove({ force: true }); } catch {}
    if (buildNet) try { await buildNet.remove(); } catch {}
  }
}

// Wait for the container to reach Running state via Docker inspect.
// We can't do an HTTP health check here because the worker is on the control-plane
// network and app containers are on the ingress network.
async function waitForRunning(containerName: string): Promise<boolean> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await new Promise<void>((r) => setTimeout(r, HEALTH_POLL_MS));
    try {
      const info = await docker.getContainer(containerName).inspect();
      if (info.State.Running && !info.State.Restarting) return true;
      if (info.State.Dead || info.State.OOMKilled) return false;
    } catch {
      // Container may not exist yet
    }
  }
  return false;
}

function pullImage(image: string): Promise<void> {
  return new Promise((resolve, reject) => {
    docker.pull(image, (err: Error | null, stream: NodeJS.ReadableStream) => {
      if (err) return reject(err);
      docker.modem.followProgress(stream, (err: Error | null) => {
        if (err) reject(err); else resolve();
      });
    });
  });
}

async function log(db: DB, deploymentId: string, line: string) {
  const clean = line
    .replace(/\x1b\[[0-9;]*[mGKHF]/g, "")
    .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, "")
    .slice(0, 4096);
  if (!clean.trim()) return;
  try {
    await db.insert(buildLogs).values({ deploymentId, line: clean });
  } catch (err) {
    console.error("Failed to write log:", err);
  }
}

async function setFailed(db: DB, deploymentId: string, reason: string) {
  await log(db, deploymentId, `FAILED: ${reason}`);
  await db.update(deployments)
    .set({ state: "failed", updatedAt: new Date(), finishedAt: new Date() })
    .where(eq(deployments.id, deploymentId));
}
