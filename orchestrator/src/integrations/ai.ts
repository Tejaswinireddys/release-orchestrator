import { httpJson } from "./http.js";
import type { OrchestratorConfig, PackageDescriptor, ReleaseSummary } from "../types.js";

/**
 * AI change-summary integration.
 *
 * Turns raw build inputs (commit messages + changed files per package) into a
 * human-readable release narrative and a per-package summary, using an
 * OpenAI-compatible chat-completions API.
 *
 * Design goals:
 *  - Deterministic, dependency-free FALLBACK when AI is disabled (no API key,
 *    mock mode, or a network/parse error) so CI and mock runs stay green.
 *  - The chat call is injectable (`chat`) so tests can exercise the AI path
 *    without real network access.
 */

/** A function that sends a chat-completion request and returns the text. */
export type ChatFn = (args: {
  baseUrl: string;
  apiKey: string;
  model: string;
  system: string;
  user: string;
}) => Promise<string>;

export class AiSummarizer {
  constructor(
    private cfg: OrchestratorConfig["ai"],
    /** Injectable transport; defaults to a real OpenAI chat call. */
    private chat: ChatFn = openAiChat,
  ) {}

  /**
   * Produce a {@link ReleaseSummary} for the changed packages. Never throws —
   * on any failure it returns the deterministic fallback summary.
   */
  async summarize(version: string, packages: PackageDescriptor[]): Promise<ReleaseSummary> {
    const changed = packages.filter((p) => p.changed);

    if (!this.cfg.enabled || !this.cfg.apiKey || changed.length === 0) {
      return fallbackSummary(version, changed);
    }

    try {
      const user = buildPrompt(version, changed);
      const raw = await this.chat({
        baseUrl: this.cfg.baseUrl,
        apiKey: this.cfg.apiKey,
        model: this.cfg.model,
        system: SYSTEM_PROMPT,
        user,
      });
      const parsed = parseModelJson(raw);
      const perPackage: Record<string, string> = {};
      for (const p of changed) {
        const v = parsed.perPackage?.[p.name];
        perPackage[p.name] = (typeof v === "string" && v.trim()) ? v.trim() : fallbackPerPackage(p);
      }
      const overview =
        typeof parsed.overview === "string" && parsed.overview.trim()
          ? parsed.overview.trim()
          : fallbackOverview(version, changed);
      return { aiGenerated: true, model: this.cfg.model, overview, perPackage };
    } catch {
      return fallbackSummary(version, changed);
    }
  }
}

const SYSTEM_PROMPT =
  "You are a release engineer who writes clear, accurate software release notes. " +
  "You are given, per package, the raw git commit messages and the list of changed " +
  "files for a release. Summarize what actually changed in plain, professional " +
  "English for an enterprise audience (developers and release managers). Do not " +
  "invent changes that are not supported by the commits or files. Respond ONLY with " +
  "minified JSON of the shape " +
  '{"overview": string, "perPackage": {"<package-name>": string}}. ' +
  "The overview is 2-4 sentences covering the release as a whole. Each perPackage " +
  "value is 1-3 sentences describing that package's changes.";

/** Build the user prompt from per-package commits and changed files. */
export function buildPrompt(version: string, changed: PackageDescriptor[]): string {
  const blocks = changed.map((p) => {
    const commits = (p.commits ?? []).length
      ? (p.commits ?? []).map((c) => `  - ${c.replace(/\n+/g, " / ")}`).join("\n")
      : (p.changes.length ? p.changes.map((c) => `  - ${c}`).join("\n") : "  - (no commit messages)");
    const files = (p.changedFiles ?? []).length
      ? (p.changedFiles ?? []).slice(0, 50).map((f) => `  - ${f}`).join("\n")
      : "  - (no file list)";
    return [
      `### Package: ${p.name} (version ${p.version})`,
      `Commits:`,
      commits,
      `Changed files:`,
      files,
    ].join("\n");
  });
  return [
    `Release version: ${version}`,
    `Changed packages: ${changed.map((p) => p.name).join(", ")}`,
    ``,
    ...blocks,
    ``,
    `Produce the JSON described in the system instructions for exactly these packages: ` +
      changed.map((p) => p.name).join(", "),
  ].join("\n");
}

/** Real OpenAI chat-completions transport. */
export const openAiChat: ChatFn = async ({ baseUrl, apiKey, model, system, user }) => {
  const res = await httpJson<{ choices?: Array<{ message?: { content?: string } }> }>(
    `${baseUrl.replace(/\/$/, "")}/chat/completions`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}` },
      body: {
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      },
    },
  );
  return res.choices?.[0]?.message?.content ?? "";
};

interface ModelJson {
  overview?: string;
  perPackage?: Record<string, string>;
}

/** Parse the model's JSON response, tolerating code fences / surrounding text. */
export function parseModelJson(raw: string): ModelJson {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(trimmed) as ModelJson;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as ModelJson;
    }
    throw new Error("AI response was not valid JSON");
  }
}

// ---------- Deterministic fallback (no AI) ----------

export function fallbackSummary(version: string, changed: PackageDescriptor[]): ReleaseSummary {
  const perPackage: Record<string, string> = {};
  for (const p of changed) perPackage[p.name] = fallbackPerPackage(p);
  return {
    aiGenerated: false,
    overview: fallbackOverview(version, changed),
    perPackage,
  };
}

function fallbackOverview(version: string, changed: PackageDescriptor[]): string {
  if (changed.length === 0) {
    return `Release ${version}: no package changes were detected in this build.`;
  }
  return (
    `Release ${version} updates ${changed.length} ` +
    `package${changed.length === 1 ? "" : "s"}: ` +
    `${changed.map((p) => p.name).join(", ")}. ` +
    `Summaries below are derived directly from the build's commit history.`
  );
}

function fallbackPerPackage(p: PackageDescriptor): string {
  const items = (p.commits ?? []).length ? (p.commits ?? []) : p.changes;
  const bullets = items.slice(0, 8).map((c) => c.split("\n")[0]).filter(Boolean);
  const fileCount = (p.changedFiles ?? []).length;
  const head = `${bullets.length} change${bullets.length === 1 ? "" : "s"}` +
    (fileCount ? `, ${fileCount} file${fileCount === 1 ? "" : "s"} touched` : "");
  return bullets.length ? `${head}: ${bullets.join("; ")}.` : `${head}.`;
}
