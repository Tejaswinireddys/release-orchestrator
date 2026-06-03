import { describe, it, expect } from "vitest";
import { detectPackages, PACKAGE_NAMES } from "../src/stages/packager.js";
import { buildImages } from "../src/stages/docker.js";
import { ConfluenceClient } from "../src/integrations/confluence.js";
import { JiraClient } from "../src/integrations/jira.js";
import { AiSummarizer, type ChatFn } from "../src/integrations/ai.js";
import type { PackageDescriptor, ConfluenceResult, OrchestratorConfig } from "../src/types.js";

const repoRoot = new URL("../../", import.meta.url).pathname;

describe("packager stage", () => {
  it("detects all five packages", () => {
    const pkgs = detectPackages({
      repoRoot,
      releaseVersion: "1.0.0",
      gitCommits: () => [],
      gitDiff: () => [],
      gitLog: () => [],
    });
    expect(pkgs).toHaveLength(5);
    expect(pkgs.map((p) => p.name).sort()).toEqual([...PACKAGE_NAMES].sort());
  });

  it("flags only changed packages from the git diff", () => {
    const pkgs = detectPackages({
      repoRoot,
      releaseVersion: "1.2.0",
      // No gitCommits override -> falls back to gitDiff/gitLog (deterministic,
      // not the real repo history).
      gitCommits: () => [],
      gitDiff: () => [
        "packages/auth-service/src/index.js",
        "packages/payment-service/src/index.js",
        "README.md",
      ],
      gitLog: () => ["fix(auth-service): rotate tokens", "feat(payment): add refunds"],
    });
    const changed = pkgs.filter((p) => p.changed).map((p) => p.name);
    expect(changed).toEqual(["auth-service", "payment-service"]);
    const auth = pkgs.find((p) => p.name === "auth-service")!;
    expect(auth.changes.length).toBeGreaterThan(0);
  });
});

describe("docker stage", () => {
  it("builds one image per changed package using injected executor", () => {
    const pkgs: PackageDescriptor[] = [
      { name: "auth-service", path: "packages/auth-service", version: "1.0.0", changed: true, changes: ["x"] },
      { name: "gateway-service", path: "packages/gateway-service", version: "1.0.0", changed: false, changes: [] },
    ];
    const calls: string[] = [];
    const results = buildImages(pkgs, {
      repoRoot,
      ecrRegistry: "acct.dkr.ecr.us-east-1.amazonaws.com",
      version: "1.0.0",
      push: true,
      exec: (cmd) => {
        calls.push(cmd);
        return "Successfully built abc123";
      },
    });
    expect(results).toHaveLength(1);
    expect(results[0].image).toContain("auth-service:1.0.0");
    expect(results[0].pushed).toBe(true);
    expect(calls.some((c) => c.startsWith("docker build"))).toBe(true);
    expect(calls.some((c) => c.startsWith("docker push"))).toBe(true);
  });

  it("skips builds but still emits image refs when Docker is unavailable", () => {
    const pkgs: PackageDescriptor[] = [
      { name: "auth-service", path: "packages/auth-service", version: "1.0.0", changed: true, changes: ["x"] },
    ];
    const results = buildImages(pkgs, {
      repoRoot,
      ecrRegistry: "acct.dkr.ecr.us-east-1.amazonaws.com",
      version: "1.0.0",
      push: true,
      // Simulate a laptop with no Docker daemon. No exec override so the
      // availability probe is the one that decides.
      isDockerAvailable: () => false,
    });
    expect(results).toHaveLength(1);
    expect(results[0].skipped).toBe(true);
    expect(results[0].pushed).toBe(false);
    expect(results[0].image).toContain("auth-service:1.0.0");
    expect(results[0].digest).toMatch(/^sha256:/);
    // The package still gets a resolved image reference for downstream stages.
    expect(pkgs[0].image).toContain("auth-service:1.0.0");
  });

  it("throws when Docker is unavailable but required", () => {
    const pkgs: PackageDescriptor[] = [
      { name: "auth-service", path: "packages/auth-service", version: "1.0.0", changed: true, changes: ["x"] },
    ];
    expect(() =>
      buildImages(pkgs, {
        repoRoot,
        ecrRegistry: "acct.dkr.ecr.us-east-1.amazonaws.com",
        version: "1.0.0",
        push: false,
        requireDocker: true,
        isDockerAvailable: () => false,
      }),
    ).toThrow(/Docker is required/);
  });
});

describe("confluence body rendering", () => {
  it("renders a change table and escapes html", () => {
    const body = ConfluenceClient.renderBody("1.0.0", [
      { name: "auth-service", path: "p", version: "1.0.0", changed: true, changes: ["<b>fix</b> bug"] },
    ]);
    expect(body).toContain("Release 1.0.0");
    expect(body).toContain("auth-service");
    expect(body).toContain("&lt;b&gt;fix&lt;/b&gt;");
  });
});

describe("jira description", () => {
  it("includes changed packages and confluence link", () => {
    const confluence: ConfluenceResult = { pageId: "1", title: "t", url: "http://c/page/1" };
    const desc = JiraClient.buildDescription(
      "1.0.0",
      [{ name: "auth-service", path: "p", version: "1.0.0", changed: true, changes: ["a", "b"] }],
      confluence,
    );
    expect(desc).toContain("auth-service @ 1.0.0");
    expect(desc).toContain("http://c/page/1");
  });
});

describe("AI change summarizer", () => {
  const aiCfg = (enabled: boolean): OrchestratorConfig["ai"] => ({
    enabled,
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    apiKey: enabled ? "test-key" : "",
  });

  const changedPackages: PackageDescriptor[] = [
    {
      name: "auth-service",
      path: "packages/auth-service",
      version: "1.4.0",
      changed: true,
      changes: ["fix(auth-service): rotate tokens"],
      commits: ["fix(auth-service): rotate tokens\n\nRotate signing keys hourly."],
      changedFiles: ["packages/auth-service/src/index.js"],
    },
    {
      name: "gateway-service",
      path: "packages/gateway-service",
      version: "1.4.0",
      changed: false,
      changes: [],
      commits: [],
      changedFiles: [],
    },
  ];

  it("uses the AI path and parses per-package summaries (injected chat)", async () => {
    let captured = "";
    const fakeChat: ChatFn = async ({ user }) => {
      captured = user;
      return JSON.stringify({
        overview: "Release 1.4.0 hardens authentication.",
        perPackage: { "auth-service": "Rotates signing tokens hourly for stronger security." },
      });
    };
    const summarizer = new AiSummarizer(aiCfg(true), fakeChat);
    const result = await summarizer.summarize("1.4.0", changedPackages);

    expect(result.aiGenerated).toBe(true);
    expect(result.model).toBe("gpt-4o-mini");
    expect(result.overview).toContain("hardens authentication");
    expect(result.perPackage["auth-service"]).toContain("Rotates signing tokens");
    // Only the changed package is summarized.
    expect(result.perPackage["gateway-service"]).toBeUndefined();
    // The prompt should carry the real commit message + changed file.
    expect(captured).toContain("rotate tokens");
    expect(captured).toContain("packages/auth-service/src/index.js");
  });

  it("falls back deterministically when AI is disabled (no network)", async () => {
    let called = false;
    const fakeChat: ChatFn = async () => {
      called = true;
      return "{}";
    };
    const summarizer = new AiSummarizer(aiCfg(false), fakeChat);
    const result = await summarizer.summarize("1.4.0", changedPackages);

    expect(called).toBe(false);
    expect(result.aiGenerated).toBe(false);
    expect(result.model).toBeUndefined();
    expect(result.overview).toContain("1.4.0");
    expect(result.perPackage["auth-service"]).toMatch(/change/i);
  });

  it("falls back when the AI transport throws (never breaks the pipeline)", async () => {
    const fakeChat: ChatFn = async () => {
      throw new Error("network down");
    };
    const summarizer = new AiSummarizer(aiCfg(true), fakeChat);
    const result = await summarizer.summarize("1.4.0", changedPackages);

    expect(result.aiGenerated).toBe(false);
    expect(result.perPackage["auth-service"]).toBeTruthy();
  });
});
