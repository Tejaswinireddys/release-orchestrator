# Release Orchestrator — Enterprise Deployment Control Plane

End-to-end release orchestration for a 5-package monorepo. A single pipeline
takes a release from source to running containers on AWS ECS:

```
packager  →  docker build (per package)  →  Confluence change page  →  Jira RM ticket  →  Harness deploy → ECS (EC2)
```

A **Next.js agent UI** drives and visualizes every run, with a **mock / live
toggle** so you can dry-run the entire flow offline or fire the real
Confluence / Jira / Harness APIs.

## Repository layout

```
release-orchestrator/
├── packages/                 # The 5 deployable services (each with a Dockerfile)
│   ├── auth-service/
│   ├── payment-service/
│   ├── notification-service/
│   ├── inventory-service/
│   └── gateway-service/
├── orchestrator/             # TypeScript engine + CLI + HTTP API
│   ├── src/
│   │   ├── stages/           #   packager, docker
│   │   ├── integrations/     #   confluence, jira, harness clients
│   │   ├── orchestrator.ts   #   stage runner
│   │   ├── cli.ts            #   used by GitHub Actions
│   │   └── server.ts         #   API for the UI
│   └── test/                 # unit tests + full E2E pipeline test
├── mocks/                    # Mock Confluence/Jira/Harness server
├── ui/                       # Next.js 14 enterprise dashboard (the agent UI)
├── deploy/
│   ├── harness/              # Harness ECS (EC2) pipeline YAML
│   └── ecs/                  # ECS EC2 task definition template
└── .github/workflows/        # CI, package/docker build matrix, release+deploy
```

## The pipeline stages

| # | Stage | What it does |
|---|-------|--------------|
| 1 | **packager** | Detects the 5 packages and which ones changed since the last release (git diff). |
| 2 | **docker** | Builds one Docker image **per changed package**, pushes to ECR on release. |
| 3 | **confluence** | Creates a "Release X — Change Summary" page listing each changed package and its changes. |
| 4 | **jira** | Opens a Release Management (RM) ticket linking back to the Confluence page. |
| 5 | **deploy** | Triggers the Harness pipeline that performs an ECS rolling deploy (EC2 launch type). |

Any stage failure aborts the run and the CLI exits non-zero so CI goes red.

## Quick start

```bash
npm install

# Run the full pipeline test suite (unit + E2E against the mock server)
npm test --workspace=orchestrator
npm run e2e --workspace=orchestrator

# Start the agent UI (mock mode works with no external services)
cd ui && npm install && npm run dev   # http://localhost:3000
```

### Mock vs. live

* **Mock** — the UI toggle (or `RUN_MODE=mock`) simulates Confluence/Jira/Harness.
  No tokens needed. Great for demos and CI.
* **Live** — set the env vars in `.env.example` (Confluence/Jira/Harness tokens,
  ECR registry, ECS cluster) and the same code path calls the real APIs.

## CI/CD (GitHub Actions)

* **`ci.yml`** — runs on every push/PR: typecheck, build, unit tests, E2E test,
  and the Next.js build. This is the workflow that must stay green.
* **`build-packages.yml`** — resolves the packager set, then a **matrix** builds
  a Docker image for each of the 5 packages (pushes to ECR on a `v*` tag).
* **`release-deploy.yml`** — after a successful build, runs the orchestrator CLI
  to create the Confluence page, the Jira RM ticket, and trigger the Harness
  ECS (EC2) deployment.

### Required GitHub configuration (for live releases)

Repository **Variables**: `ECR_REGISTRY`, `ECS_CLUSTER`, `CONFLUENCE_BASE_URL`,
`CONFLUENCE_SPACE_KEY`, `JIRA_BASE_URL`, `JIRA_PROJECT_KEY`, `JIRA_ISSUE_TYPE`,
`HARNESS_BASE_URL`, `HARNESS_ORG_ID`, `HARNESS_PROJECT_ID`, `HARNESS_PIPELINE_ID`.

Repository **Secrets**: `AWS_DEPLOY_ROLE_ARN`, `CONFLUENCE_TOKEN`, `JIRA_TOKEN`,
`HARNESS_ACCOUNT_ID`, `HARNESS_API_KEY`.

## Architecture

See [`docs/architecture.png`](docs/architecture.png) for the system diagram and
the presentation deck in `docs/`.
