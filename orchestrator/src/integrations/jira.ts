import { httpJson, basicAuthHeader } from "./http.js";
import type { JiraResult, OrchestratorConfig, PackageDescriptor, ConfluenceResult } from "../types.js";

/**
 * Jira client. Creates a Release Management (RM) ticket for the release,
 * linking back to the Confluence change page.
 *
 * Live mode uses the Jira Cloud REST API (/rest/api/3/issue).
 * Mock mode points at the local mock server which mirrors the same contract.
 */
export class JiraClient {
  constructor(private cfg: OrchestratorConfig["jira"]) {}

  static buildDescription(
    version: string,
    packages: PackageDescriptor[],
    confluence: ConfluenceResult,
  ): string {
    const changed = packages.filter((p) => p.changed);
    const lines = [
      `Release Management ticket for version ${version}.`,
      ``,
      `Changed packages (${changed.length}):`,
      ...changed.map((p) => `- ${p.name} @ ${p.version} (${p.changes.length} changes)`),
      ``,
      `Change summary page: ${confluence.url}`,
    ];
    return lines.join("\n");
  }

  async createReleaseTicket(
    version: string,
    packages: PackageDescriptor[],
    confluence: ConfluenceResult,
  ): Promise<JiraResult> {
    const summary = `[RM] Release ${version} deployment`;
    const description = JiraClient.buildDescription(version, packages, confluence);

    const payload = {
      fields: {
        project: { key: this.cfg.projectKey },
        issuetype: { name: this.cfg.issueType },
        summary,
        description,
        labels: ["release-management", `release-${version}`],
      },
    };

    const res = await httpJson<{ id: string; key: string; self?: string }>(
      `${this.cfg.baseUrl}/rest/api/3/issue`,
      { method: "POST", headers: basicAuthHeader(this.cfg.token), body: payload },
    );

    const browseBase = this.cfg.baseUrl.replace(/\/$/, "");
    return {
      id: res.id,
      key: res.key,
      summary,
      url: `${browseBase}/browse/${res.key}`,
    };
  }
}
