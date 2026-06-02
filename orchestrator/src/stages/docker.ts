import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import type { DockerBuildResult, PackageDescriptor } from "../types.js";

/**
 * The "docker" stage. Builds (and optionally pushes) one image per changed
 * package. Real `docker build`/`docker push` only run in CI where Docker is
 * available, so the executor is injectable for tests and mock runs.
 */
export type DockerExecutor = (cmd: string) => string;

export interface DockerStageOptions {
  repoRoot: string;
  ecrRegistry: string;
  version: string;
  push: boolean;
  /** Injectable command runner. Defaults to real shell exec. */
  exec?: DockerExecutor;
}

export function buildImages(
  packages: PackageDescriptor[],
  opts: DockerStageOptions,
): DockerBuildResult[] {
  const exec: DockerExecutor =
    opts.exec ?? ((cmd) => execSync(cmd, { cwd: opts.repoRoot, encoding: "utf8" }));

  const results: DockerBuildResult[] = [];
  for (const pkg of packages) {
    if (!pkg.changed) continue;
    const image = `${opts.ecrRegistry}/${pkg.name}:${pkg.version}`;
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
