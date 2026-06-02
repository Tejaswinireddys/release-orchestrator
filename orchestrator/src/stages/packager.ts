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

/** A single commit collected from the release window. */
export interface CommitInfo {
  /** Short commit hash. */
  hash: string;
  /** First line of the commit message. */
  subject: string;
  /** Full commit message (subject + body). */
  message: string;
  /** Files touched by this commit. */
  files: string[];
}

/**
 * The "packager" stage. Determines the set of deployable packages, their
 * versions, and which ones changed since the previous release tag.
 *
 * `gitDiff` / `gitLog` / `gitCommits` are injectable so tests can supply a
 * deterministic change set without depending on the actual git history.
 */
export interface PackagerOptions {
  repoRoot: string;
  releaseVersion: string;
  /** Optional override that returns changed file paths since the last tag. */
  gitDiff?: () => string[];
  /** Optional override that returns commit subjects since the last tag. */
  gitLog?: () => string[];
  /** Optional override returning rich commit info (hash, message, files). */
  gitCommits?: () => CommitInfo[];
}

export function detectPackages(opts: PackagerOptions): PackageDescriptor[] {
  // An explicit gitDiff/gitLog override (used by e2e tests and mock runs that
  // want a deterministic change set) must take precedence over the real git
  // history. We only fall back to reading real commits when NO explicit diff
  // override and NO explicit commits override are supplied.
  const hasExplicitDiff = Boolean(opts.gitDiff || opts.gitLog);
  const commits = opts.gitCommits
    ? opts.gitCommits()
    : hasExplicitDiff
      ? []
      : defaultGitCommits(opts.repoRoot);

  // Aggregate changed files from commits, falling back to the simple diff.
  const filesFromCommits = commits.flatMap((c) => c.files);
  const changedFiles = filesFromCommits.length
    ? unique(filesFromCommits)
    : (opts.gitDiff ?? (() => defaultGitDiff(opts.repoRoot)))();
  // Legacy subject list (kept for the `changes` field / back-compat tests).
  const commitSubjects = commits.length
    ? commits.map((c) => c.subject)
    : (opts.gitLog ?? (() => defaultGitLog(opts.repoRoot)))();

  return PACKAGE_NAMES.map((name) => {
    const pkgPath = join("packages", name);
    const prefix = `${pkgPath}/`;
    const changedForPkg = changedFiles.filter((f) => f.startsWith(prefix));
    const changed = changedForPkg.length > 0;

    // Commits that touched this package's files, or that name it explicitly.
    const shortName = name.replace("-service", "");
    const pkgCommits = commits.filter(
      (c) =>
        c.files.some((f) => f.startsWith(prefix)) ||
        c.message.toLowerCase().includes(name) ||
        c.message.toLowerCase().includes(shortName),
    );

    // Subject-level "changes" list (back-compat): prefer scoped commits, then
    // any subject mentioning the package, then a generic note.
    const scopedSubjects = pkgCommits.length
      ? pkgCommits.map((c) => c.subject)
      : commitSubjects.filter(
          (s) => s.toLowerCase().includes(name) || s.toLowerCase().includes(shortName),
        );
    const changes = changed ? (scopedSubjects.length ? scopedSubjects : ["Updated package sources"]) : [];

    return {
      name,
      path: pkgPath,
      version: readPackageVersion(opts.repoRoot, pkgPath, opts.releaseVersion),
      changed,
      changes,
      commits: changed ? pkgCommits.map((c) => c.message) : [],
      changedFiles: changedForPkg,
    };
  });
}

function unique(xs: string[]): string[] {
  return Array.from(new Set(xs));
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

/**
 * Collect rich commit info (hash, subject, full message, changed files) for
 * the release window: commits since the previous tag, or the last 20 commits
 * if no previous tag exists. Uses a NUL-delimited format so multi-line commit
 * bodies are parsed safely.
 */
function defaultGitCommits(root: string): CommitInfo[] {
  const range = commitRange(root);
  try {
    // Records separated by \x1e, fields by \x1f: hash, subject, body.
    const fmt = "%x1e%H%x1f%s%x1f%b";
    const raw = execSync(`git log ${range} --pretty=format:${fmt}`, {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
    const records = raw.split("\x1e").map((r) => r.trim()).filter(Boolean);
    return records.map((rec) => {
      const [hash = "", subject = "", body = ""] = rec.split("\x1f");
      const files = filesForCommit(root, hash);
      const message = body.trim() ? `${subject}\n\n${body.trim()}` : subject;
      return { hash: hash.slice(0, 9), subject: subject.trim(), message: message.trim(), files };
    });
  } catch {
    return [];
  }
}

function commitRange(root: string): string {
  try {
    const lastTag = execSync("git describe --tags --abbrev=0", {
      cwd: root,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
    if (lastTag) return `${lastTag}..HEAD`;
  } catch {
    /* no tags yet */
  }
  return "-20";
}

function filesForCommit(root: string, hash: string): string[] {
  if (!hash) return [];
  try {
    const out = execSync(`git show --no-renames --name-only --pretty=format: ${hash}`, {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
    return out.split("\n").map((l) => l.trim()).filter(Boolean);
  } catch {
    return [];
  }
}
