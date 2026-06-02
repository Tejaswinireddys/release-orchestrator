import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { loadConfig } from "./config.js";
import { Logger } from "./logger.js";
import { ReleaseOrchestrator } from "./orchestrator.js";
import { detectPackages } from "./stages/packager.js";
import type { PipelineRun, RunMode } from "./types.js";

/**
 * Lightweight HTTP API consumed by the Next.js dashboard.
 *
 *   GET  /api/health
 *   GET  /api/packages?mode=mock|live
 *   POST /api/runs            { mode, releaseVersion }   -> starts a run
 *   GET  /api/runs                                       -> list runs
 *   GET  /api/runs/:id                                   -> run detail
 *   GET  /api/runs/:id/logs                              -> SSE log stream
 *
 * No external web framework is used to keep the dependency surface small.
 */
const runs = new Map<string, PipelineRun>();
const runLoggers = new Map<string, Logger>();
const repoRoot = process.env.REPO_ROOT ?? process.cwd();

function send(res: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  res.end(payload);
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;

  if (req.method === "OPTIONS") return send(res, 204, {});

  if (path === "/api/health") {
    return send(res, 200, { ok: true, time: new Date().toISOString() });
  }

  if (path === "/api/packages" && req.method === "GET") {
    const cfg = loadConfig({ mode: (url.searchParams.get("mode") as RunMode) ?? "live" });
    const pkgs = detectPackages({ repoRoot, releaseVersion: cfg.releaseVersion });
    return send(res, 200, { packages: pkgs });
  }

  if (path === "/api/runs" && req.method === "GET") {
    return send(res, 200, { runs: [...runs.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)) });
  }

  if (path === "/api/runs" && req.method === "POST") {
    const body = await readBody(req);
    const mode = (body.mode as RunMode) ?? "mock";
    const releaseVersion = (body.releaseVersion as string) ?? "1.0.0";
    const cfg = loadConfig({ mode, releaseVersion });
    const logger = new Logger();
    const orchestrator = new ReleaseOrchestrator(cfg, logger);

    // Kick off asynchronously; the UI polls/streams for progress.
    const pending = orchestrator.run({ repoRoot });
    pending.then((run) => {
      runs.set(run.id, run);
      runLoggers.set(run.id, logger);
    });

    // Give the run an id immediately by waiting one tick for the initial state.
    const run = await Promise.race([
      pending,
      new Promise<PipelineRun>((r) =>
        setTimeout(() => r({
          id: "starting",
          releaseVersion,
          mode,
          startedAt: new Date().toISOString(),
          status: "running",
          packages: [],
          stages: {} as PipelineRun["stages"],
          logs: [],
        }), 50),
      ),
    ]);
    return send(res, 202, { run });
  }

  const runDetail = path.match(/^\/api\/runs\/([^/]+)$/);
  if (runDetail && req.method === "GET") {
    const run = runs.get(runDetail[1]);
    if (!run) return send(res, 404, { error: "run not found" });
    return send(res, 200, { run });
  }

  return send(res, 404, { error: "not found" });
});

const port = Number(process.env.PORT ?? 4020);
server.listen(port, () => {
  console.log(`Orchestrator API listening on http://localhost:${port}`);
});
