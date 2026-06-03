import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import type { DockerBuildResult, PackageDescriptor } from "../types.js";

/**
 * The "docker" stage. Builds (and optionally pushes) one image per changed
 * package.
 *
 * Docker is optional for local runs: the real `docker build`/`docker push`
 * only run when a Docker daemon is actually available. On a machine without
 * Docker (e.g. a Mac laptop with no Docker Desktop), the stage gracefully
 * skips the build/push and still produces a deterministic image reference and
 * digest so the rest of the pipeline can run end-to-end. Set `requireDocker`
 * (REQUIRE_DOCKER=1) to turn a missing daemon into a hard error in CI/prod.
 *
 * The executor and the availability probe are injectable for tests and mocks.
 */
export type DockerExecutor = (cmd: string) => string;

export interface DockerStageOptions {
  repoRoot: string;
  ecrRegistry: string;
  version: string;
  push: boolean;
  /** Injectable command runner. Defaults to real shell exec. */
  exec?: DockerExecutor;
  /**
   * When true, a missing Docker daemon throws instead of skipping. Defaults
   * to false so the pipeline runs on a laptop without Docker.
   */
  requireDocker?: boolean;
  /**
   * Injectable Docker availability probe (used by tests). Defaults to running
   * `docker version` and reporting whether it succeeds.
   */
  isDockerAvailable?: () => boolean;
}

/** Probe whether a usable Docker daemon is reachable. */
export function defaultDockerAvailable(repoRoot: string): boolean {
  try {
    execSync("docker version", {
      cwd: repoRoot,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

export function buildImages(
  packages: PackageDescriptor[],
  opts: DockerStageOptions,
): DockerBuildResult[] {
  const exec: DockerExecutor =
    opts.exec ?? ((cmd) => execSync(cmd, { cwd: opts.repoRoot, encoding: "utf8" }));

  // An explicit `exec` override (mock/test) implies Docker is "available" for
  // the purposes of this stage — the override decides what running a command
  // means. Otherwise probe the real daemon.
  const probe = opts.isDockerAvailable ?? (() => defaultDockerAvailable(opts.repoRoot));
  const dockerAvailable = opts.exec ? true : probe();

  if (!dockerAvailable && opts.requireDocker) {
    throw new Error(
      "Docker is required (REQUIRE_DOCKER is set) but no Docker daemon is available. " +
        "Install/start Docker, or unset REQUIRE_DOCKER to run without building images.",
    );
  }

  const results: DockerBuildResult[] = [];
  for (const pkg of packages) {
    if (!pkg.changed) continue;
    const image = `${opts.ecrRegistry}/${pkg.name}:${pkg.version}`;

    if (!dockerAvailable) {
      // No Docker on this machine: skip the real build/push but still produce
      // a deterministic image reference + digest so downstream stages work.
      const digest =
        "sha256:" +
        createHash("sha256").update(`${image}:no-docker`).digest("hex").slice(0, 64);
      pkg.image = image;
      results.push({ packageName: pkg.name, image, digest, pushed: false, skipped: true });
      continue;
    }

    const buildCmd = `docker build -t ${image} -f ${pkg.path}/Dockerfile ${pkg.path}`;
    const buildOut = exec(buildCmd);

    let pushed = false;
    if (opts.push) {
      exec(`docker push ${image}`);
      pushed = true;
    }

    // Derive a stable, deterministic digest from build output for traceability.
    const digest =
      "sha256:" + createHash("sha256").update(image + buildOut).digest("hex").slice(0, 64);

    pkg.image = image;
    results.push({ packageName: pkg.name, image, digest, pushed });
  }
  return results;
}
