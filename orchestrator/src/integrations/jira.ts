import { httpJson, basicAuthHeader } from "./http.js";
import type {
  JiraResult,
  OrchestratorConfig,
  PackageDescriptor,
  ConfluenceResult,
  ReleaseSummary,
} from "../types.js";

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
    releaseSummary?: ReleaseSummary,
  ): string {
    const changed = packages.filter((p) => p.changed);
    const lines: string[] = [`Release Management ticket for version ${version}.`, ``];

    if (releaseSummary?.overview) {
      lines.push(
        releaseSummary.aiGenerated
          ? `Summary (AI-generated${releaseSummary.model ? ` via ${releaseSummary.model}` : ""}):`
          : `Summary (automated):`,
        releaseSummary.overview,
        ``,
      );
    }

    lines.push(`Changed packages (${changed.length}):`, ``);
    for (const p of changed) {
      const detail =
        p.aiSummary ??
        releaseSummary?.perPackage?.[p.name] ??
        (p.changes.length ? p.changes.join("; ") : "Updated package sources");
      const fileCount = (p.changedFiles ?? []).length;
      lines.push(
        `* ${p.name} @ ${p.version}` + (fileCount ? ` (${fileCount} file${fileCount === 1 ? "" : "s"})` : ""),
        `  ${detail}`,
      );
    }

    lines.push(``, `Change summary page: ${confluence.url}`);
    return lines.join("\n");
  }

  async createReleaseTicket(
    version: string,
    packages: PackageDescriptor[],
    confluence: ConfluenceResult,
    releaseSummary?: ReleaseSummary,
  ): Promise<JiraResult> {
    const summary = `[RM] Release ${version} deployment`;
    const description = JiraClient.buildDescription(version, packages, confluence, releaseSummary);

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
