/**
 * Core domain types for the Release Orchestration Platform.
 *
 * The orchestrator drives a release through a fixed set of stages:
 *   package -> docker -> confluence -> jira -> deploy(harness/ECS)
 */

export type StageName =
  | "package"
  | "docker"
  | "summarize"
  | "confluence"
  | "jira"
  | "deploy";

export type StageStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "skipped";

export type RunMode = "live" | "mock";

/** A single deployable package in the monorepo. */
export interface PackageDescriptor {
  name: string;
  /** Relative path of the package within the repo. */
  path: string;
  /** Semantic version produced for this release. */
  version: string;
  /** Whether this package changed in the current release window. */
  changed: boolean;
  /** Short list of human-readable changes (commit subjects). */
  changes: string[];
  /** Full commit messages (subject + body) attributed to this package. */
  commits?: string[];
  /** Changed file paths attributed to this package. */
  changedFiles?: string[];
  /** AI-generated, human-readable summary of what changed in this package. */
  aiSummary?: string;
  /** Fully-qualified image reference once the docker stage completes. */
  image?: string;
}

/**
 * Output of the AI "summarize" stage: an overall release narrative plus a
 * per-package summary keyed by package name. Produced from commit messages
 * and changed files, with a deterministic fallback when AI is unavailable.
 */
export interface ReleaseSummary {
  /** Whether the summary was produced by the AI model (vs. fallback). */
  aiGenerated: boolean;
  /** Model identifier used, when AI-generated. */
  model?: string;
  /** One- or two-paragraph overview of the whole release. */
  overview: string;
  /** Per-package human-readable change summary, keyed by package name. */
  perPackage: Record<string, string>;
}

/** Per-package result of the docker build stage. */
export interface DockerBuildResult {
  packageName: string;
  image: string;
  digest: string;
  pushed: boolean;
  /**
   * True when the real `docker build`/`docker push` were skipped because no
   * Docker daemon was available (e.g. a Mac laptop without Docker Desktop).
   * The image reference + a deterministic digest are still produced so the
   * rest of the pipeline (summary, Confluence, Jira, deploy) can run.
   */
  skipped?: boolean;
}

/** Result of creating the Confluence change page. */
export interface ConfluenceResult {
  pageId: string;
  title: string;
  url: string;
}

/** Result of creating the Jira Release Management ticket. */
export interface JiraResult {
  key: string;
  id: string;
  url: string;
  summary: string;
}

/** Result of triggering the Harness deployment to ECS. */
export interface DeployResult {
  pipelineId: string;
  executionId: string;
  url: string;
  cluster: string;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
}

/** A log line emitted during pipeline execution. */
export interface LogEntry {
  ts: string;
  stage: StageName | "pipeline";
  level: "info" | "warn" | "error";
  message: string;
}

export interface StageResult<T = unknown> {
  stage: StageName;
  status: StageStatus;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  output?: T;
  error?: string;
}

/** The full state of a single pipeline run. */
export interface PipelineRun {
  id: string;
  releaseVersion: string;
  mode: RunMode;
  startedAt: string;
  finishedAt?: string;
  status: StageStatus;
  packages: PackageDescriptor[];
  /** AI (or fallback) change summary for the release. */
  summary?: ReleaseSummary;
  stages: Record<StageName, StageResult>;
  logs: LogEntry[];
}

export interface OrchestratorConfig {
  mode: RunMode;
  releaseVersion: string;
  ecrRegistry: string;
  ecsCluster: string;
  ecsLaunchType: "EC2";
  confluence: {
    baseUrl: string;
    spaceKey: string;
    token: string;
  };
  jira: {
    baseUrl: string;
    projectKey: string;
    issueType: string;
    token: string;
  };
  harness: {
    baseUrl: string;
    accountId: string;
    orgId: string;
    projectId: string;
    pipelineId: string;
    apiKey: string;
  };
  ai: {
    /** Whether AI summarization is enabled (true when an API key is present). */
    enabled: boolean;
    /** OpenAI-compatible base URL (default https://api.openai.com/v1). */
    baseUrl: string;
    /** Model id, e.g. gpt-4o-mini. */
    model: string;
    /** API key; empty disables AI and triggers the deterministic fallback. */
    apiKey: string;
  };
  docker: {
    /**
     * When true, a missing Docker daemon is a hard error (CI/production).
     * When false (the default), the docker stage gracefully skips the real
     * build/push if Docker is unavailable so the pipeline still runs on a
     * laptop without Docker installed. Driven by REQUIRE_DOCKER.
     */
    required: boolean;
  };
}
