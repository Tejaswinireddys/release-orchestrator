import { randomUUID } from "node:crypto";
import type {
  OrchestratorConfig,
  PipelineRun,
  StageName,
  StageStatus,
  StageResult,
  PackageDescriptor,
  ConfluenceResult,
  JiraResult,
  DeployResult,
  DockerBuildResult,
  ReleaseSummary,
} from "./types.js";
import { Logger } from "./logger.js";
import { detectPackages, type PackagerOptions } from "./stages/packager.js";
import { buildImages, type DockerExecutor } from "./stages/docker.js";
import { ConfluenceClient } from "./integrations/confluence.js";
import { JiraClient } from "./integrations/jira.js";
import { HarnessClient } from "./integrations/harness.js";
import { AiSummarizer, type ChatFn } from "./integrations/ai.js";

const STAGE_ORDER: StageName[] = [
  "package",
  "docker",
  "summarize",
  "confluence",
  "jira",
  "deploy",
];

export interface RunOptions {
  repoRoot: string;
  /** Injectable git change detection (used by tests/mocks). */
  packagerOverrides?: Pick<PackagerOptions, "gitDiff" | "gitLog">;
  /** Injectable docker executor (used by tests/mocks/CI). */
  dockerExec?: DockerExecutor;
  /** Whether to push images (true in CI release builds). */
  pushImages?: boolean;
  /** Logger to attach (so a server can stream logs). */
  logger?: Logger;
  /** Injectable AI chat transport (used by tests to avoid network). */
  chatFn?: ChatFn;
}

/**
 * Runs the full release pipeline:
 *   package -> docker -> confluence -> jira -> deploy(Harness/ECS-EC2)
 *
 * Any stage failure aborts the remaining stages and marks the run failed.
 */
export class ReleaseOrchestrator {
  readonly logger: Logger;
  constructor(private cfg: OrchestratorConfig, logger?: Logger) {
    this.logger = logger ?? new Logger();
  }

  async run(opts: RunOptions): Promise<PipelineRun> {
    const run: PipelineRun = {
      id: randomUUID(),
      releaseVersion: this.cfg.releaseVersion,
      mode: this.cfg.mode,
      startedAt: new Date().toISOString(),
      status: "running",
      packages: [],
      stages: emptyStages(),
      logs: [],
    };

    this.logger.info(
      "pipeline",
      `Starting release ${run.releaseVersion} in ${this.cfg.mode.toUpperCase()} mode (run ${run.id}).`,
    );

    try {
      // 1) PACKAGE
      run.packages = await this.stage<PackageDescriptor[]>(run, "package", async () => {
        const pkgs = detectPackages({
          repoRoot: opts.repoRoot,
          releaseVersion: this.cfg.releaseVersion,
          ...opts.packagerOverrides,
        });
        const changed = pkgs.filter((p) => p.changed);
        this.logger.info(
          "package",
          `Detected ${pkgs.length} packages, ${changed.length} changed: ${changed.map((p) => p.name).join(", ") || "none"}.`,
        );
        return pkgs;
      });

      const changedPackages = run.packages.filter((p) => p.changed);
      if (changedPackages.length === 0) {
        this.logger.warn("pipeline", "No changed packages; downstream stages will be skipped.");
      }

      // 2) DOCKER (one build per changed package)
      await this.stage<DockerBuildResult[]>(run, "docker", async () => {
        if (changedPackages.length === 0) {
          run.stages.docker.status = "skipped";
          return [];
        }
        const results = buildImages(run.packages, {
          repoRoot: opts.repoRoot,
          ecrRegistry: this.cfg.ecrRegistry,
          version: this.cfg.releaseVersion,
          push: opts.pushImages ?? false,
          exec: opts.dockerExec,
        });
        for (const r of results) {
          this.logger.info("docker", `Built ${r.image} (${r.digest.slice(0, 19)}…) pushed=${r.pushed}`);
        }
        return results;
      });

      // 3) SUMMARIZE — AI-generated change summary from commits + files
      const summary = await this.stage<ReleaseSummary>(run, "summarize", async () => {
        if (changedPackages.length === 0) {
          run.stages.summarize.status = "skipped";
          return { aiGenerated: false, overview: "No package changes detected.", perPackage: {} };
        }
        const summarizer = new AiSummarizer(
          this.cfg.ai,
          opts.chatFn,
        );
        const result = await summarizer.summarize(this.cfg.releaseVersion, run.packages);
        // Attach per-package AI summaries back onto the descriptors so the
        // Confluence/Jira renderers and the UI can show them.
        for (const p of run.packages) {
          if (result.perPackage[p.name]) p.aiSummary = result.perPackage[p.name];
        }
        run.summary = result;
        this.logger.info(
          "summarize",
          result.aiGenerated
            ? `AI change summary generated with ${result.model} for ${changedPackages.length} package(s).`
            : `Used deterministic change summary (AI disabled) for ${changedPackages.length} package(s).`,
        );
        return result;
      });

      // 4) CONFLUENCE change page
      const confluence = await this.stage<ConfluenceResult>(run, "confluence", async () => {
        const client = new ConfluenceClient(this.cfg.confluence);
        const page = await client.createChangePage(
          this.cfg.releaseVersion,
          run.packages,
          run.summary,
        );
        this.logger.info("confluence", `Created change page: ${page.url}`);
        return page;
      });
      void summary;

      // 5) JIRA RM ticket
      const jira = await this.stage<JiraResult>(run, "jira", async () => {
        const client = new JiraClient(this.cfg.jira);
        const ticket = await client.createReleaseTicket(
          this.cfg.releaseVersion,
          run.packages,
          confluence,
          run.summary,
        );
        this.logger.info("jira", `Created RM ticket ${ticket.key}: ${ticket.url}`);
        return ticket;
      });
      void jira;

      // 6) DEPLOY via Harness to ECS (EC2)
      await this.stage<DeployResult>(run, "deploy", async () => {
        const client = new HarnessClient(this.cfg.harness);
        const deploy = await client.triggerDeploy(
          this.cfg.releaseVersion,
          this.cfg.ecsCluster,
          run.packages,
        );
        this.logger.info(
          "deploy",
          `Triggered Harness pipeline ${deploy.pipelineId} -> ECS cluster ${deploy.cluster} (exec ${deploy.executionId}).`,
        );
        return deploy;
      });

      run.status = STAGE_ORDER.every(
        (s) => run.stages[s].status === "success" || run.stages[s].status === "skipped",
      )
        ? "success"
        : "failed";
    } catch (err) {
      run.status = "failed";
      this.logger.error("pipeline", `Pipeline failed: ${(err as Error).message}`);
    } finally {
      run.finishedAt = new Date().toISOString();
      run.logs = this.logger.all();
      this.logger.info("pipeline", `Run ${run.id} finished with status=${run.status}.`);
    }

    return run;
  }

  /** Executes a single stage, recording timing and status on the run. */
  private async stage<T>(
    run: PipelineRun,
    name: StageName,
    fn: () => Promise<T>,
  ): Promise<T> {
    const sr = run.stages[name];
    sr.status = "running";
    sr.startedAt = new Date().toISOString();
    const t0 = Date.now();
    try {
      const out = await fn();
      sr.finishedAt = new Date().toISOString();
      sr.durationMs = Date.now() - t0;
      // fn() may have set the status to "skipped"; preserve that.
      const current = sr.status as StageStatus;
      if (current !== "skipped") sr.status = "success";
      sr.output = out;
      return out;
    } catch (err) {
      sr.finishedAt = new Date().toISOString();
      sr.durationMs = Date.now() - t0;
      sr.status = "failed";
      sr.error = (err as Error).message;
      throw err;
    }
  }
}

function emptyStages(): Record<StageName, StageResult> {
  return STAGE_ORDER.reduce(
    (acc, s) => {
      acc[s] = { stage: s, status: "pending" };
      return acc;
    },
    {} as Record<StageName, StageResult>,
  );
}
