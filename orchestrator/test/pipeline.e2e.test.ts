import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import { loadConfig } from "../src/config.js";
import { ReleaseOrchestrator } from "../src/orchestrator.js";

/**
 * End-to-end test of the full release pipeline against the in-process mock
 * server. Exercises: package -> docker -> confluence -> jira -> deploy, and
 * asserts the artifacts were actually created in the mock store.
 *
 * Docker is stubbed via an injected executor (no Docker daemon required), so
 * this runs deterministically in CI.
 */
const MOCK_PORT = 4555;
const MOCK_BASE = `http://localhost:${MOCK_PORT}`;
let mockServer: Server;

beforeAll(async () => {
  process.env.MOCK_PORT = String(MOCK_PORT);
  process.env.NODE_ENV = "e2e";
  const mod = await import("../../mocks/src/server.js");
  mockServer = mod.server as Server;
  if (!mockServer.listening) {
    await new Promise<void>((r) => mockServer.listen(MOCK_PORT, () => r()));
  }
});

afterAll(async () => {
  await new Promise<void>((r) => mockServer.close(() => r()));
});

describe("release pipeline (E2E, mock mode)", () => {
  it("runs all five stages successfully and creates real artifacts", async () => {
    const repoRoot = new URL("../../", import.meta.url).pathname;
    const cfg = loadConfig({ mode: "mock", releaseVersion: "2.3.0" });
    // Point mock integrations at our test mock instance.
    cfg.confluence.baseUrl = `${MOCK_BASE}/confluence`;
    cfg.jira.baseUrl = `${MOCK_BASE}/jira`;
    cfg.harness.baseUrl = `${MOCK_BASE}/harness`;

    const orchestrator = new ReleaseOrchestrator(cfg);
    const run = await orchestrator.run({
      repoRoot,
      // Two changed packages.
      packagerOverrides: {
        gitDiff: () => [
          "packages/auth-service/src/index.js",
          "packages/inventory-service/src/index.js",
        ],
        gitLog: () => [
          "feat(auth-service): add MFA",
          "fix(inventory-service): correct stock count",
        ],
      },
      // Stub docker so no daemon is needed.
      dockerExec: (cmd) => `ran: ${cmd}`,
      pushImages: false,
    });

    // Pipeline succeeded end-to-end.
    expect(run.status).toBe("success");
    expect(run.mode).toBe("mock");

    // Stage statuses.
    expect(run.stages.package.status).toBe("success");
    expect(run.stages.docker.status).toBe("success");
    expect(run.stages.confluence.status).toBe("success");
    expect(run.stages.jira.status).toBe("success");
    expect(run.stages.deploy.status).toBe("success");

    // Docker built exactly the two changed packages.
    const docker = run.stages.docker.output as Array<{ packageName: string; image: string }>;
    expect(docker.map((d) => d.packageName).sort()).toEqual([
      "auth-service",
      "inventory-service",
    ]);

    // Confluence + Jira + Harness artifacts exist in the mock store.
    const state = await (await fetch(`${MOCK_BASE}/__state`)).json();
    expect(Object.keys(state.confluencePages).length).toBe(1);
    expect(Object.keys(state.jiraIssues).length).toBe(1);
    expect(Object.keys(state.harnessExecutions).length).toBe(1);

    // Jira ticket references the release and is an RM-prefixed key.
    const jira = run.stages.jira.output as { key: string; url: string };
    expect(jira.key).toMatch(/^RM-\d+$/);

    // Deploy targeted the EC2 ECS cluster.
    const deploy = run.stages.deploy.output as { cluster: string; status: string };
    expect(deploy.cluster).toBe("release-ec2-cluster");
    expect(deploy.status).toBe("QUEUED");

    // Logs were captured.
    expect(run.logs.length).toBeGreaterThan(5);
  });

  it("skips downstream build when no packages changed but still files release docs", async () => {
    await fetch(`${MOCK_BASE}/__reset`, { method: "POST" });
    const repoRoot = new URL("../../", import.meta.url).pathname;
    const cfg = loadConfig({ mode: "mock", releaseVersion: "2.3.1" });
    cfg.confluence.baseUrl = `${MOCK_BASE}/confluence`;
    cfg.jira.baseUrl = `${MOCK_BASE}/jira`;
    cfg.harness.baseUrl = `${MOCK_BASE}/harness`;

    const orchestrator = new ReleaseOrchestrator(cfg);
    const run = await orchestrator.run({
      repoRoot,
      packagerOverrides: { gitDiff: () => [], gitLog: () => [] },
      dockerExec: (cmd) => `ran: ${cmd}`,
    });

    expect(run.status).toBe("success");
    expect(run.stages.docker.status).toBe("skipped");
    // Confluence + Jira still created for traceability.
    expect(run.stages.confluence.status).toBe("success");
    expect(run.stages.jira.status).toBe("success");
  });
});
