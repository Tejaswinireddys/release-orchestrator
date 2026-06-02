/**
 * Server-side orchestration engine used by the Next.js API routes.
 *
 * This mirrors the standalone @release/orchestrator package but is embedded in
 * the UI so the dashboard runs as a single deployable app. It supports two
 * modes selected by the UI toggle:
 *   - "mock": fully simulated Confluence/Jira/Harness responses (no network)
 *   - "live": calls the real Confluence/Jira/Harness REST APIs using env tokens
 */
import { randomUUID } from "crypto";

export type StageName = "package" | "docker" | "confluence" | "jira" | "deploy";
export type StageStatus = "pending" | "running" | "success" | "failed" | "skipped";
export type RunMode = "live" | "mock";

export interface PackageDescriptor {
  name: string;
  path: string;
  version: string;
  changed: boolean;
  changes: string[];
  image?: string;
}
export interface LogEntry {
  ts: string;
  stage: StageName | "pipeline";
  level: "info" | "warn" | "error";
  message: string;
}
export interface StageResult {
  stage: StageName;
  status: StageStatus;
  durationMs?: number;
  detail?: string;
  link?: string;
}
export interface PipelineRun {
  id: string;
  releaseVersion: string;
  mode: RunMode;
  startedAt: string;
  finishedAt?: string;
  status: StageStatus;
  packages: PackageDescriptor[];
  stages: Record<StageName, StageResult>;
  logs: LogEntry[];
}

export const PACKAGE_NAMES = [
  "auth-service",
  "payment-service",
  "notification-service",
  "inventory-service",
  "gateway-service",
] as const;

const STAGE_ORDER: StageName[] = ["package", "docker", "confluence", "jira", "deploy"];

// In-memory run registry (process-lifetime). Adequate for a dashboard demo.
const RUNS = new Map<string, PipelineRun>();
export function getRun(id: string) {
  return RUNS.get(id);
}
export function listRuns() {
  return [...RUNS.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

function log(run: PipelineRun, stage: LogEntry["stage"], level: LogEntry["level"], message: string) {
  run.logs.push({ ts: new Date().toISOString(), stage, level, message });
}
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Deterministic demo change set so the dashboard always shows activity. */
export function demoPackages(version: string): PackageDescriptor[] {
  const changedSet: Record<string, string[]> = {
    "auth-service": ["feat(auth): add WebAuthn passkeys", "chore(auth): bump deps"],
    "payment-service": ["fix(payment): idempotent refunds"],
    "inventory-service": ["feat(inventory): real-time stock sync"],
  };
  return PACKAGE_NAMES.map((name) => ({
    name,
    path: `packages/${name}`,
    version,
    changed: name in changedSet,
    changes: changedSet[name] ?? [],
  }));
}

export interface StartOptions {
  mode: RunMode;
  releaseVersion: string;
}

/** Starts a run and drives it asynchronously, updating the registry in place. */
export function startRun(opts: StartOptions): PipelineRun {
  const run: PipelineRun = {
    id: randomUUID(),
    releaseVersion: opts.releaseVersion,
    mode: opts.mode,
    startedAt: new Date().toISOString(),
    status: "running",
    packages: demoPackages(opts.releaseVersion),
    stages: STAGE_ORDER.reduce((acc, s) => {
      acc[s] = { stage: s, status: "pending" };
      return acc;
    }, {} as Record<StageName, StageResult>),
    logs: [],
  };
  RUNS.set(run.id, run);
  void drive(run);
  return run;
}

async function stage(
  run: PipelineRun,
  name: StageName,
  fn: () => Promise<{ detail?: string; link?: string; skip?: boolean }>,
) {
  const sr = run.stages[name];
  sr.status = "running";
  const t0 = Date.now();
  try {
    const r = await fn();
    sr.durationMs = Date.now() - t0;
    sr.status = r.skip ? "skipped" : "success";
    sr.detail = r.detail;
    sr.link = r.link;
  } catch (err) {
    sr.durationMs = Date.now() - t0;
    sr.status = "failed";
    sr.detail = (err as Error).message;
    log(run, name, "error", `Stage failed: ${(err as Error).message}`);
    throw err;
  }
}

async function drive(run: PipelineRun) {
  const live = run.mode === "live";
  log(run, "pipeline", "info", `Starting release ${run.releaseVersion} in ${run.mode.toUpperCase()} mode.`);
  const changed = run.packages.filter((p) => p.changed);

  try {
    await stage(run, "package", async () => {
      await sleep(500);
      log(run, "package", "info", `Detected ${run.packages.length} packages, ${changed.length} changed: ${changed.map((p) => p.name).join(", ")}.`);
      return { detail: `${changed.length}/${run.packages.length} packages changed` };
    });

    await stage(run, "docker", async () => {
      if (changed.length === 0) {
        log(run, "docker", "warn", "No changed packages; skipping docker builds.");
        return { skip: true, detail: "no changed packages" };
      }
      const registry = process.env.ECR_REGISTRY ?? "123456789012.dkr.ecr.us-east-1.amazonaws.com";
      for (const p of changed) {
        await sleep(400);
        p.image = `${registry}/${p.name}:${p.version}`;
        log(run, "docker", "info", `Built & pushed ${p.image}`);
      }
      return { detail: `${changed.length} images built` };
    });

    await stage(run, "confluence", async () => {
      await sleep(500);
      if (live) {
        const url = await createConfluencePage(run);
        log(run, "confluence", "info", `Created change page: ${url}`);
        return { detail: "Change summary page created", link: url };
      }
      const url = `https://mock.atlassian.net/wiki/spaces/REL/pages/${Math.floor(Math.random() * 1e6)}`;
      log(run, "confluence", "info", `[mock] Created change page: ${url}`);
      return { detail: "Change summary page created (mock)", link: url };
    });

    await stage(run, "jira", async () => {
      await sleep(500);
      if (live) {
        const { key, url } = await createJiraTicket(run);
        log(run, "jira", "info", `Created RM ticket ${key}: ${url}`);
        return { detail: `RM ticket ${key}`, link: url };
      }
      const key = `RM-${100 + Math.floor(Math.random() * 900)}`;
      const url = `https://mock.atlassian.net/browse/${key}`;
      log(run, "jira", "info", `[mock] Created RM ticket ${key}: ${url}`);
      return { detail: `RM ticket ${key} (mock)`, link: url };
    });

    await stage(run, "deploy", async () => {
      await sleep(600);
      const cluster = process.env.ECS_CLUSTER ?? "release-ec2-cluster";
      if (live) {
        const { url, exec } = await triggerHarness(run, cluster);
        log(run, "deploy", "info", `Triggered Harness -> ECS cluster ${cluster} (exec ${exec}).`);
        return { detail: `Deploying to ECS (EC2) cluster ${cluster}`, link: url };
      }
      const exec = randomUUID();
      log(run, "deploy", "info", `[mock] Triggered Harness -> ECS cluster ${cluster} (exec ${exec}).`);
      return { detail: `Deploying to ECS (EC2) cluster ${cluster} (mock)`, link: `https://mock.harness.io/executions/${exec}` };
    });

    run.status = STAGE_ORDER.every((s) => ["success", "skipped"].includes(run.stages[s].status))
      ? "success"
      : "failed";
  } catch {
    run.status = "failed";
  } finally {
    run.finishedAt = new Date().toISOString();
    log(run, "pipeline", "info", `Run finished with status=${run.status}.`);
  }
}

// ---- Live API adapters (used only in live mode) ----
async function createConfluencePage(run: PipelineRun): Promise<string> {
  const base = process.env.CONFLUENCE_BASE_URL!;
  const res = await fetch(`${base}/rest/api/content`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.CONFLUENCE_TOKEN}` },
    body: JSON.stringify({
      type: "page",
      title: `Release ${run.releaseVersion} — Change Summary`,
      space: { key: process.env.CONFLUENCE_SPACE_KEY ?? "REL" },
      body: { storage: { value: changeHtml(run), representation: "storage" } },
    }),
  });
  if (!res.ok) throw new Error(`Confluence ${res.status}`);
  const data = await res.json();
  return `${data._links?.base ?? base}${data._links?.webui ?? `/pages/${data.id}`}`;
}

async function createJiraTicket(run: PipelineRun): Promise<{ key: string; url: string }> {
  const base = process.env.JIRA_BASE_URL!;
  const res = await fetch(`${base}/rest/api/3/issue`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.JIRA_TOKEN}` },
    body: JSON.stringify({
      fields: {
        project: { key: process.env.JIRA_PROJECT_KEY ?? "RM" },
        issuetype: { name: process.env.JIRA_ISSUE_TYPE ?? "Release" },
        summary: `[RM] Release ${run.releaseVersion} deployment`,
        description: run.packages.filter((p) => p.changed).map((p) => `- ${p.name} @ ${p.version}`).join("\n"),
        labels: ["release-management", `release-${run.releaseVersion}`],
      },
    }),
  });
  if (!res.ok) throw new Error(`Jira ${res.status}`);
  const data = await res.json();
  return { key: data.key, url: `${base.replace(/\/$/, "")}/browse/${data.key}` };
}

async function triggerHarness(run: PipelineRun, cluster: string): Promise<{ url: string; exec: string }> {
  const base = process.env.HARNESS_BASE_URL ?? "https://app.harness.io";
  const pipeline = process.env.HARNESS_PIPELINE_ID ?? "ecs_ec2_deploy";
  const res = await fetch(
    `${base}/pipeline/api/pipeline/execute/${pipeline}?accountIdentifier=${process.env.HARNESS_ACCOUNT_ID}&orgIdentifier=${process.env.HARNESS_ORG_ID ?? "default"}&projectIdentifier=${process.env.HARNESS_PROJECT_ID ?? "release"}`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.HARNESS_API_KEY ?? "" },
      body: JSON.stringify({ inputSetPipelineYaml: `pipeline:\n  variables:\n    - name: releaseVersion\n      value: ${run.releaseVersion}\n    - name: ecsCluster\n      value: ${cluster}` }),
    },
  );
  if (!res.ok) throw new Error(`Harness ${res.status}`);
  const data = await res.json();
  const exec = data.data?.planExecution?.uuid ?? data.data?.executionId ?? "exec";
  return { url: `${base}/ng/executions/${exec}`, exec };
}

function changeHtml(run: PipelineRun): string {
  const rows = run.packages
    .filter((p) => p.changed)
    .map((p) => `<tr><td>${p.name}</td><td>${p.version}</td><td>${p.changes.join("; ")}</td></tr>`)
    .join("");
  return `<h2>Release ${run.releaseVersion}</h2><table><tbody>${rows}</tbody></table>`;
}
