import { describe, it, expect } from "vitest";
import { detectPackages, PACKAGE_NAMES } from "../src/stages/packager.js";
import { buildImages } from "../src/stages/docker.js";
import { ConfluenceClient } from "../src/integrations/confluence.js";
import { JiraClient } from "../src/integrations/jira.js";
import type { PackageDescriptor, ConfluenceResult } from "../src/types.js";

const repoRoot = new URL("../../", import.meta.url).pathname;

describe("packager stage", () => {
  it("detects all five packages", () => {
    const pkgs = detectPackages({
      repoRoot,
      releaseVersion: "1.0.0",
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
