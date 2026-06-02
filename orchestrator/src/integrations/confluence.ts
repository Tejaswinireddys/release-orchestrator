import { httpJson, basicAuthHeader } from "./http.js";
import type {
  ConfluenceResult,
  OrchestratorConfig,
  PackageDescriptor,
  ReleaseSummary,
} from "../types.js";

/**
 * Confluence client. Creates a "release change" page summarizing which
 * packages changed and what the changes were.
 *
 * Live mode uses the Confluence Cloud REST API (/rest/api/content).
 * Mock mode points at the local mock server which mirrors the same contract.
 */
export class ConfluenceClient {
  constructor(private cfg: OrchestratorConfig["confluence"]) {}

  /** Build the storage-format HTML body for the change page. */
  static renderBody(
    version: string,
    packages: PackageDescriptor[],
    summary?: ReleaseSummary,
  ): string {
    const changed = packages.filter((p) => p.changed);

    const aiBadge = summary
      ? `<p><em>${summary.aiGenerated ? "AI-generated summary" : "Automated summary"}` +
        `${summary.aiGenerated && summary.model ? ` (${escapeHtml(summary.model)})` : ""}` +
        ` from this build's commits and changed files.</em></p>`
      : "";
    const overview = summary?.overview
      ? `<h3>Release overview</h3><p>${escapeHtml(summary.overview)}</p>`
      : "";

    const rows = changed
      .map((p) => {
        const aiCell = p.aiSummary
          ? `<p>${escapeHtml(p.aiSummary)}</p>`
          : `<ul>${p.changes.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}</ul>`;
        const commitList = (p.commits ?? []).length
          ? `<details><summary>Commits (${(p.commits ?? []).length})</summary><ul>` +
            (p.commits ?? [])
              .map((c) => `<li>${escapeHtml(c.split("\n")[0])}</li>`)
              .join("") +
            `</ul></details>`
          : "";
        const fileList = (p.changedFiles ?? []).length
          ? `<details><summary>Changed files (${(p.changedFiles ?? []).length})</summary><ul>` +
            (p.changedFiles ?? [])
              .slice(0, 50)
              .map((f) => `<li>${escapeHtml(f)}</li>`)
              .join("") +
            `</ul></details>`
          : "";
        return (
          `<tr><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.version)}</td>` +
          `<td>${aiCell}${commitList}${fileList}</td></tr>`
        );
      })
      .join("");

    return (
      `<h2>Release ${escapeHtml(version)} — Change Summary</h2>` +
      aiBadge +
      `<p>${changed.length} of ${packages.length} packages changed in this release.</p>` +
      overview +
      `<h3>Per-package changes</h3>` +
      `<table><thead><tr><th>Package</th><th>Version</th><th>What changed</th></tr></thead>` +
      `<tbody>${rows || "<tr><td colspan=3>No package changes detected</td></tr>"}</tbody></table>`
    );
  }

  async createChangePage(
    version: string,
    packages: PackageDescriptor[],
    summary?: ReleaseSummary,
  ): Promise<ConfluenceResult> {
    const title = `Release ${version} — Change Summary`;
    const body = ConfluenceClient.renderBody(version, packages, summary);

    const payload = {
      type: "page",
      title,
      space: { key: this.cfg.spaceKey },
      body: { storage: { value: body, representation: "storage" } },
    };

    const res = await httpJson<{ id: string; _links?: { base?: string; webui?: string } }>(
      `${this.cfg.baseUrl}/rest/api/content`,
      { method: "POST", headers: basicAuthHeader(this.cfg.token), body: payload },
    );

    const base = res._links?.base ?? this.cfg.baseUrl;
    const webui = res._links?.webui ?? `/pages/${res.id}`;
    return { pageId: res.id, title, url: `${base}${webui}` };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
