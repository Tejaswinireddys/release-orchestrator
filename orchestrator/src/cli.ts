#!/usr/bin/env node
import { loadConfig } from "./config.js";
import { ReleaseOrchestrator } from "./orchestrator.js";
import { writeFileSync } from "node:fs";

/**
 * CLI entry used by the GitHub Actions release workflow.
 *
 *   RUN_MODE=live RELEASE_VERSION=1.4.0 orchestrate --push --out run.json
 *
 * Exit code is non-zero when the pipeline fails so CI marks the job red.
 */
async function main() {
  const args = process.argv.slice(2);
  const push = args.includes("--push");
  const outIdx = args.indexOf("--out");
  const outFile = outIdx >= 0 ? args[outIdx + 1] : undefined;
  const repoRoot = process.env.REPO_ROOT ?? process.cwd();

  const cfg = loadConfig();
  const orchestrator = new ReleaseOrchestrator(cfg);
  const run = await orchestrator.run({ repoRoot, pushImages: push });

  if (outFile) {
    writeFileSync(outFile, JSON.stringify(run, null, 2));
    console.log(`Wrote run report to ${outFile}`);
  }

  if (run.status !== "success") {
    console.error(`Release pipeline failed (status=${run.status}).`);
    process.exit(1);
  }
  console.log(`Release pipeline succeeded.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
