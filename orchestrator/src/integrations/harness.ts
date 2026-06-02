import { httpJson } from "./http.js";
import type { DeployResult, OrchestratorConfig, PackageDescriptor } from "../types.js";

/**
 * Harness client. Triggers the ECS (EC2 launch type) deployment pipeline,
 * passing the per-package image references as pipeline inputs.
 *
 * Live mode uses the Harness Pipeline Execution API.
 * Mock mode points at the local mock server which mirrors the same contract.
 */
export class HarnessClient {
  constructor(private cfg: OrchestratorConfig["harness"]) {}

  async triggerDeploy(
    version: string,
    cluster: string,
    packages: PackageDescriptor[],
  ): Promise<DeployResult> {
    const images = packages
      .filter((p) => p.image)
      .reduce<Record<string, string>>((acc, p) => {
        acc[p.name] = p.image as string;
        return acc;
      }, {});

    const url =
      `${this.cfg.baseUrl}/pipeline/api/pipeline/execute/${this.cfg.pipelineId}` +
      `?accountIdentifier=${this.cfg.accountId}` +
      `&orgIdentifier=${this.cfg.orgId}` +
      `&projectIdentifier=${this.cfg.projectId}`;

    const payload = {
      inputSetPipelineYaml: yamlInputs({ version, cluster, images }),
    };

    const res = await httpJson<{
      data?: { planExecution?: { uuid?: string }; executionId?: string };
      status?: string;
    }>(url, {
      method: "POST",
      headers: { "x-api-key": this.cfg.apiKey },
      body: payload,
    });

    const executionId =
      res.data?.planExecution?.uuid ?? res.data?.executionId ?? `exec-${Date.now()}`;

    return {
      pipelineId: this.cfg.pipelineId,
      executionId,
      url:
        `${this.cfg.baseUrl}/ng/account/${this.cfg.accountId}/cd/orgs/${this.cfg.orgId}` +
        `/projects/${this.cfg.projectId}/pipelines/${this.cfg.pipelineId}/executions/${executionId}/pipeline`,
      cluster,
      status: "QUEUED",
    };
  }
}

/** Minimal YAML serialization of the pipeline input set. */
function yamlInputs(args: { version: string; cluster: string; images: Record<string, string> }): string {
  const imageLines = Object.entries(args.images)
    .map(([k, v]) => `        ${k}: ${v}`)
    .join("\n");
  return [
    "pipeline:",
    `  identifier: ecs_ec2_deploy`,
    "  variables:",
    `    - name: releaseVersion`,
    `      type: String`,
    `      value: ${args.version}`,
    `    - name: ecsCluster`,
    `      type: String`,
    `      value: ${args.cluster}`,
    `    - name: launchType`,
    `      type: String`,
    `      value: EC2`,
    "  properties:",
    "    images:",
    imageLines,
  ].join("\n");
}
