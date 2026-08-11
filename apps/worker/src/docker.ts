import Dockerode from "dockerode";

let _docker: Dockerode | null = null;

/**
 * Returns a shared Dockerode client.
 * Reads DOCKER_HOST to support the socket proxy in production
 * (DOCKER_HOST=tcp://docker-proxy:2375) while falling back to the Unix socket
 * for local development.
 */
export function getDocker(): Dockerode {
  if (!_docker) {
    const host = process.env.DOCKER_HOST;
    if (host?.startsWith("tcp://")) {
      const rest = host.slice(6); // "docker-proxy:2375"
      const lastColon = rest.lastIndexOf(":");
      const h = rest.slice(0, lastColon) || "localhost";
      const p = parseInt(rest.slice(lastColon + 1), 10) || 2375;
      _docker = new Dockerode({ host: h, port: p });
    } else {
      _docker = new Dockerode({ socketPath: process.env.DOCKER_SOCKET ?? "/var/run/docker.sock" });
    }
  }
  return _docker;
}
