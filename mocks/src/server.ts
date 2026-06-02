import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";

/**
 * Mock server emulating the three external systems the orchestrator talks to:
 *   - Confluence Cloud  (POST /confluence/rest/api/content)
 *   - Jira Cloud        (POST /jira/rest/api/3/issue)
 *   - Harness           (POST /harness/pipeline/api/pipeline/execute/:id)
 *
 * It mirrors the response contract closely enough that the SAME client code
 * runs unchanged against either the mock or the real APIs. Created artifacts
 * are also readable back for assertions in the E2E test.
 */
interface Store {
  confluencePages: Record<string, { id: string; title: string; body: string }>;
  jiraIssues: Record<string, { id: string; key: string; summary: string; description: string }>;
  harnessExecutions: Record<string, { id: string; pipelineId: string; status: string }>;
}

const store: Store = { confluencePages: {}, jiraIssues: {}, harnessExecutions: {} };
let jiraSeq = 100;

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let d = "";
    req.on("data", (c) => (d += c));
    req.on("end", () => resolve(d ? JSON.parse(d) : {}));
  });
}

const PORT = Number(process.env.MOCK_PORT ?? 4010);
const BASE = `http://localhost:${PORT}`;

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", BASE);
  const p = url.pathname;

  try {
    // ---- Confluence: create content ----
    if (p === "/confluence/rest/api/content" && req.method === "POST") {
      const body = await readBody(req);
      const id = randomUUID().slice(0, 8);
      store.confluencePages[id] = {
        id,
        title: body.title,
        body: body.body?.storage?.value ?? "",
      };
      return send(res, 200, {
        id,
        title: body.title,
        _links: { base: `${BASE}/confluence`, webui: `/spaces/REL/pages/${id}` },
      });
    }
    if (p.startsWith("/confluence/rest/api/content/") && req.method === "GET") {
      const id = p.split("/").pop()!;
      const page = store.confluencePages[id];
      if (!page) return send(res, 404, { message: "page not found" });
      return send(res, 200, page);
    }

    // ---- Jira: create issue ----
    if (p === "/jira/rest/api/3/issue" && req.method === "POST") {
      const body = await readBody(req);
      const id = String(++jiraSeq);
      const key = `${body.fields?.project?.key ?? "RM"}-${id}`;
      store.jiraIssues[key] = {
        id,
        key,
        summary: body.fields?.summary ?? "",
        description: body.fields?.description ?? "",
      };
      return send(res, 201, { id, key, self: `${BASE}/jira/rest/api/3/issue/${id}` });
    }
    if (p.match(/^\/jira\/rest\/api\/3\/issue\/[A-Z]+-\d+$/) && req.method === "GET") {
      const key = p.split("/").pop()!;
      const issue = store.jiraIssues[key];
      if (!issue) return send(res, 404, { message: "issue not found" });
      return send(res, 200, { id: issue.id, key: issue.key, fields: { summary: issue.summary } });
    }

    // ---- Harness: execute pipeline ----
    if (p.startsWith("/harness/pipeline/api/pipeline/execute/") && req.method === "POST") {
      const pipelineId = p.split("/").pop()!;
      const uuid = randomUUID();
      store.harnessExecutions[uuid] = { id: uuid, pipelineId, status: "Running" };
      return send(res, 200, {
        status: "SUCCESS",
        data: { planExecution: { uuid }, executionId: uuid },
      });
    }

    // ---- introspection for tests ----
    if (p === "/__state" && req.method === "GET") {
      return send(res, 200, store);
    }
    if (p === "/__reset" && req.method === "POST") {
      store.confluencePages = {};
      store.jiraIssues = {};
      store.harnessExecutions = {};
      jiraSeq = 100;
      return send(res, 200, { ok: true });
    }

    return send(res, 404, { message: `no mock route for ${req.method} ${p}` });
  } catch (err) {
    return send(res, 500, { message: (err as Error).message });
  }
});

if (process.env.NODE_ENV !== "test-import") {
  server.listen(PORT, () => console.log(`Mock services listening on ${BASE}`));
}

export { server, store };
