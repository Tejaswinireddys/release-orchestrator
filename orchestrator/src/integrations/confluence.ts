import { httpJson, basicAuthHeader } from "./http.js";
import type { ConfluenceResult, OrchestratorConfig, PackageDescriptor } from "../types.js";

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
  static renderBody(version: string, packages: PackageDescriptor[]): string {
    const changed = packages.filter((p) => p.changed);
    const rows = changed
      .map(
        (p) =>
          `<tr><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.version)}</td>` +
          `<td><ul>${p.changes.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}</ul></td></tr>`,
      )
      .join("");
    return (
      `<h2>Release ${escapeHtml(version)} — Change Summary</h2>` +
      `<p>${changed.length} of ${packages.length} packages changed in this release.</p>` +
      `<table><thead><tr><th>Package</th><th>Version</th><th>Changes</th></tr></thead>` +
      `<tbody>${rows || "<tr><td colspan=3>No package changes detected</td></tr>"}</tbody></table>`
    );
  }

  async createChangePage(version: string, packages: PackageDescriptor[]): Promise<ConfluenceResult> {
    const title = `Release ${version} — Change Summary`;
    const body = ConfluenceClient.renderBody(version, packages);

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
