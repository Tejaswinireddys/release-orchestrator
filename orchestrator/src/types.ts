/**
 * Core domain types for the Release Orchestration Platform.
 *
 * The orchestrator drives a release through a fixed set of stages:
 *   package -> docker -> confluence -> jira -> deploy(harness/ECS)
 */

export type StageName =
  | "package"
  | "docker"
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
  /** Fully-qualified image reference once the docker stage completes. */
  image?: string;
}

/** Per-package result of the docker build stage. */
export interface DockerBuildResult {
  packageName: string;
  image: string;
  digest: string;
  pushed: boolean;
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
}
