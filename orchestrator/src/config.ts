import type { OrchestratorConfig, RunMode } from "./types.js";

/**
 * Build the orchestrator config from environment variables.
 *
 * The same code path runs in both `live` and `mock` modes. In mock mode the
 * integration base URLs point at the local mock server, and tokens can be
 * dummy values. This is what lets the UI offer a "mock" toggle while the main
 * (production) path uses the real Confluence/Jira/Harness APIs.
 */
export function loadConfig(overrides: Partial<OrchestratorConfig> = {}): OrchestratorConfig {
  const mode = (overrides.mode ?? (process.env.RUN_MODE as RunMode) ?? "live") as RunMode;
  const mockBase = process.env.MOCK_BASE_URL ?? "http://localhost:4010";

  const live: OrchestratorConfig = {
    mode,
    releaseVersion: process.env.RELEASE_VERSION ?? "0.0.0",
    ecrRegistry: process.env.ECR_REGISTRY ?? "123456789012.dkr.ecr.us-east-1.amazonaws.com",
    ecsCluster: process.env.ECS_CLUSTER ?? "release-ec2-cluster",
    ecsLaunchType: "EC2",
    confluence: {
      baseUrl: process.env.CONFLUENCE_BASE_URL ?? "https://your-org.atlassian.net/wiki",
      spaceKey: process.env.CONFLUENCE_SPACE_KEY ?? "REL",
      token: process.env.CONFLUENCE_TOKEN ?? "",
    },
    jira: {
      baseUrl: process.env.JIRA_BASE_URL ?? "https://your-org.atlassian.net",
      projectKey: process.env.JIRA_PROJECT_KEY ?? "RM",
      issueType: process.env.JIRA_ISSUE_TYPE ?? "Release",
      token: process.env.JIRA_TOKEN ?? "",
    },
    harness: {
      baseUrl: process.env.HARNESS_BASE_URL ?? "https://app.harness.io",
      accountId: process.env.HARNESS_ACCOUNT_ID ?? "",
      orgId: process.env.HARNESS_ORG_ID ?? "default",
      projectId: process.env.HARNESS_PROJECT_ID ?? "release",
      pipelineId: process.env.HARNESS_PIPELINE_ID ?? "ecs_ec2_deploy",
      apiKey: process.env.HARNESS_API_KEY ?? "",
    },
    ai: {
      // AI is enabled whenever an OpenAI key is present. Absent key (CI/mock)
      // falls back to a deterministic, commit-derived summary so builds stay green.
      enabled: Boolean(process.env.OPENAI_API_KEY),
      baseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      apiKey: process.env.OPENAI_API_KEY ?? "",
    },
    docker: {
      // Docker is optional by default so the pipeline runs on a laptop (e.g. a
      // Mac without Docker Desktop): a missing daemon is skipped gracefully.
      // Set REQUIRE_DOCKER=1 in CI/production to make it a hard requirement.
      required: /^(1|true|yes)$/i.test(process.env.REQUIRE_DOCKER ?? ""),
    },
  };

  if (mode === "mock") {
    live.confluence.baseUrl = `${mockBase}/confluence`;
    live.jira.baseUrl = `${mockBase}/jira`;
    live.harness.baseUrl = `${mockBase}/harness`;
    live.confluence.token = live.confluence.token || "mock-token";
    live.jira.token = live.jira.token || "mock-token";
    live.harness.apiKey = live.harness.apiKey || "mock-key";
    live.harness.accountId = live.harness.accountId || "mockAccount";
  }

  return { ...live, ...overrides, mode };
}
