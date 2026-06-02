import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PackageDescriptor } from "../types.js";

export const PACKAGE_NAMES = [
  "auth-service",
  "payment-service",
  "notification-service",
  "inventory-service",
  "gateway-service",
] as const;

/**
 * The "packager" stage. Determines the set of deployable packages, their
 * versions, and which ones changed since the previous release tag.
 *
 * `gitDiff` is injectable so tests can supply a deterministic change set
 * without depending on the actual git history.
 */
export interface PackagerOptions {
  repoRoot: string;
  releaseVersion: string;
  /** Optional override that returns changed file paths since the last tag. */
  gitDiff?: () => string[];
  /** Optional override that returns commit subjects since the last tag. */
  gitLog?: () => string[];
}

export function detectPackages(opts: PackagerOptions): PackageDescriptor[] {
  const changedFiles = (opts.gitDiff ?? (() => defaultGitDiff(opts.repoRoot)))();
  const commitSubjects = (opts.gitLog ?? (() => defaultGitLog(opts.repoRoot)))();

  return PACKAGE_NAMES.map((name) => {
    const pkgPath = join("packages", name);
    const changedForPkg = changedFiles.filter((f) => f.startsWith(`${pkgPath}/`));
    const changed = changedForPkg.length > 0;

    // Map commit subjects that reference this package, falling back to all
    // commits if the changed-file heuristic flagged the package.
    const scoped = commitSubjects.filter((s) =>
      s.toLowerCase().includes(name) || s.toLowerCase().includes(name.replace("-service", "")),
    );
    const changes = changed ? (scoped.length ? scoped : ["Updated package sources"]) : [];

    return {
      name,
      path: pkgPath,
      version: readPackageVersion(opts.repoRoot, pkgPath, opts.releaseVersion),
      changed,
      changes,
    };
  });
}

function readPackageVersion(root: string, pkgPath: string, fallback: string): string {
  const pj = join(root, pkgPath, "package.json");
  if (existsSync(pj)) {
    try {
      const parsed = JSON.parse(readFileSync(pj, "utf8")) as { version?: string };
      if (parsed.version) return parsed.version;
    } catch {
      /* ignore */
    }
  }
  return fallback;
}

function defaultGitDiff(root: string): string[] {
  try {
    const out = execSync("git diff --name-only HEAD~1 HEAD", { cwd: root, encoding: "utf8" });
    return out.split("\n").map((l) => l.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function defaultGitLog(root: string): string[] {
  try {
    const out = execSync("git log -20 --pretty=format:%s", { cwd: root, encoding: "utf8" });
    return out.split("\n").map((l) => l.trim()).filter(Boolean);
  } catch {
    return [];
  }
}
