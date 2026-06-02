#!/usr/bin/env node
import { loadConfig } from "./config.js";
import { ReleaseOrchestrator } from "./orchestrator.js";
import { writeFileSync } from "node:fs";
import type { Server } from "node:http";

/**
 * CLI entry used by the GitHub Actions release workflow.
 *
 *   RUN_MODE=live RELEASE_VERSION=1.4.0 orchestrate --push --out run.json
 *
 * Exit code is non-zero when the pipeline fails so CI marks the job red.
 *
 * In `mock` mode the CLI boots the in-process mock server (the same one the
 * E2E test uses) so the whole release flow can be rehearsed end-to-end with
 * zero external services and zero secrets — this is what keeps the automatic
 * CI release job green without production credentials.
 */
async function startMockIfNeeded(mode: string): Promise<Server | null> {
  if (mode !== "mock") return null;
  const port = Number(process.env.MOCK_PORT ?? 4010);
  process.env.MOCK_PORT = String(port);
  // Keep the integration base URL in lock-step with the mock's listen port so
  // loadConfig() points Confluence/Jira/Harness at this in-process server.
  process.env.MOCK_BASE_URL = process.env.MOCK_BASE_URL ?? `http://localhost:${port}`;
  // Prevent the mock module's own top-level listen() so this CLI controls the
  // lifecycle (same convention the E2E test uses).
  process.env.NODE_ENV = "test-import";
  // Built at runtime so tsc does not pull the cross-workspace mocks file under
  // this package's rootDir. Resolved by tsx (CI) and node (after build copies).
  const mockSpecifier = ["..", "..", "mocks", "src", "server.js"].join("/");
  const mod = (await import(mockSpecifier)) as { server: Server };
  const server = mod.server;
  if (!server.listening) {
    await new Promise<void>((r) => server.listen(port, () => r()));
  }
  console.log(`[mock] in-process mock services listening on http://localhost:${port}`);
  return server;
}

async function main() {
  const args = process.argv.slice(2);
  const push = args.includes("--push");
  const outIdx = args.indexOf("--out");
  const outFile = outIdx >= 0 ? args[outIdx + 1] : undefined;
  const repoRoot = process.env.REPO_ROOT ?? process.cwd();

  // Resolve mode from env first, then boot the mock BEFORE loadConfig() so the
  // config picks up the aligned MOCK_BASE_URL for the in-process server.
  const mode = (process.env.RUN_MODE as string) ?? "live";
  const mockServer = await startMockIfNeeded(mode);

  const cfg = loadConfig();
  const orchestrator = new ReleaseOrchestrator(cfg);

  // In mock mode, stub the docker executor so the rehearsal is fully
  // deterministic and never depends on a Docker daemon. In live mode the
  // real `docker build`/`docker push` run (Docker is available on CI runners).
  const dockerExec =
    cfg.mode === "mock"
      ? (cmd: string) => {
          console.log(`[mock-docker] ${cmd}`);
          return `mock build output for: ${cmd}`;
        }
      : undefined;

  const run = await orchestrator.run({ repoRoot, pushImages: push, dockerExec });

  if (outFile) {
    writeFileSync(outFile, JSON.stringify(run, null, 2));
    console.log(`Wrote run report to ${outFile}`);
  }

  if (mockServer) {
    await new Promise<void>((r) => mockServer.close(() => r()));
  }

  if (run.status !== "success") {
    console.error(`Release pipeline failed (status=${run.status}).`);
    process.exit(1);
  }
  console.log(`Release pipeline succeeded.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
