import Dockerode from "dockerode";
import { getDb } from "./db";
import { deployments, projects, buildLogs } from "@velour/db";
import { eq, and } from "drizzle-orm";
import * as fs from "fs/promises";
import * as path from "path";
import { relinkSlug } from "./caddy";

const docker = new Dockerode({ socketPath: "/var/run/docker.sock" });
const ARTIFACTS_HOST_PATH = process.env.ARTIFACTS_PATH ?? "/var/lib/velour/artifacts";

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
const BUILD_TIMEOUT_MS = 10 * 60 * 1000;

type DB = ReturnType<typeof getDb>;

export async function runBuild(deploymentId: string) {
  const db = getDb();

  const rows = await db
    .select()
    .from(deployments)
    .innerJoin(projects, eq(deployments.projectId, projects.id))
    .where(eq(deployments.id, deploymentId))
    .limit(1);

  if (!rows.length) {
    console.error("Deployment not found:", deploymentId);
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

  const artifactDir = path.join(ARTIFACTS_HOST_PATH, deploymentId);
  await log(db, deploymentId, `=== Velour build started ===`);
  await log(db, deploymentId, `Repo:    ${project.repoUrl}`);
  await log(db, deploymentId, `Command: ${project.buildCommand}`);
  await log(db, deploymentId, `Output:  ${project.outputDir}`);

  // Validate outputDir is contained within /src (path containment check)
  const resolved = path.posix.resolve("/src", project.outputDir);
  if (!resolved.startsWith("/src/") && resolved !== "/src") {
    await setFailed(db, deploymentId, "Invalid output directory (path traversal attempt)");
    return;
  }
  const srcPath = resolved === "/src" ? "/src" : resolved;

  const buildScript = [
    "set -e",
    "apk add --no-cache git 2>&1",
    `git clone --depth 1 "${project.repoUrl}" /src 2>&1`,
    "cd /src",
    project.buildCommand,
    `mkdir -p /artifacts`,
    `cp -rL "${srcPath}/." /artifacts/`,
    `echo '=== Build complete ==='`,
  ].join(" && ");

  let container: Dockerode.Container | null = null;
  let buildNet: Dockerode.Network | null = null;
  let timedOut = false;

  try {
    await fs.mkdir(artifactDir, { recursive: true });
    await pullImage("node:22-alpine");

    // Isolated per-build bridge network (internet access, no control-plane)
    buildNet = await docker.createNetwork({
      Name: `velour-build-${deploymentId}`,
      Driver: "bridge",
      Labels: { "velour.deployment": deploymentId },
    });

    container = await docker.createContainer({
      name: `velour-build-${deploymentId}`,
      Image: "node:22-alpine",
      Cmd: ["sh", "-c", buildScript],
      HostConfig: {
        NetworkMode: `velour-build-${deploymentId}`,
        Memory: 512 * 1024 * 1024,
        CpuPeriod: 100000,
        CpuQuota: 100000,
        PidsLimit: 256,
        CapDrop: ["ALL"],
        SecurityOpt: ["no-new-privileges"],
        // Write artifacts into the deployment's artifact dir on the host
        Binds: [`${artifactDir}:/artifacts`],
        AutoRemove: false,
      },
    });

    await container.start();

    const logStream = await container.logs({
      follow: true,
      stdout: true,
      stderr: true,
      timestamps: false,
    });

    const timeout = setTimeout(async () => {
      timedOut = true;
      await log(db, deploymentId, "ERROR: Build timed out (10 minutes)");
      try { await container!.kill(); } catch {}
    }, BUILD_TIMEOUT_MS);

    await new Promise<void>((resolve) => {
      const lineBuffer = { out: "", err: "" };

      const flush = async (buf: { out: string; err: string }, key: "out" | "err") => {
        const lines = buf[key].split("\n");
        buf[key] = lines.pop() ?? "";
        for (const l of lines) {
          if (l.trim()) await log(db, deploymentId, l);
        }
      };

      docker.modem.demuxStream(
        logStream,
        {
          write: (chunk: Buffer) => {
            lineBuffer.out += chunk.toString();
            flush(lineBuffer, "out").catch(() => {});
          },
        },
        {
          write: (chunk: Buffer) => {
            lineBuffer.err += chunk.toString();
            flush(lineBuffer, "err").catch(() => {});
          },
        },
      );
      logStream.on("end", resolve);
      logStream.on("error", () => resolve());
    });

    clearTimeout(timeout);

    const info = await container.inspect();
    const exitCode = info.State.ExitCode;

    if (timedOut) {
      await setFailed(db, deploymentId, "Build timed out after 10 minutes");
      return;
    }
    if (exitCode !== 0) {
      await setFailed(db, deploymentId, `Build exited with code ${exitCode}`);
      return;
    }

    // Atomically roll back the current live deployment and promote this one.
    await db.transaction(async (tx) => {
      await tx.update(deployments)
        .set({ state: "rolled_back", updatedAt: new Date() })
        .where(
          and(
            eq(deployments.projectId, deployment.projectId),
            eq(deployments.state, "live"),
          ),
        );

      await tx.update(deployments)
        .set({
          state: "live",
          artifactPath: artifactDir,
          updatedAt: new Date(),
          finishedAt: new Date(),
        })
        .where(eq(deployments.id, deploymentId));
    });

    // Point slug → this deployment's artifacts so Caddy can serve it
    await relinkSlug(project.slug, artifactDir);

    await log(db, deploymentId, `=== Deployment is live ===`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await log(db, deploymentId, `ERROR: ${msg}`);
    await setFailed(db, deploymentId, msg);
  } finally {
    if (container) {
      try { await container.remove({ force: true }); } catch {}
    }
    if (buildNet) {
      try { await buildNet.remove(); } catch {}
    }
  }
}

async function log(db: DB, deploymentId: string, line: string) {
  // Strip ANSI codes and non-printable chars; truncate to prevent table bloat
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
