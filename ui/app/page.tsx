"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Logo, IconPackage, IconDocker, IconDoc, IconTicket, IconRocket,
  IconHome, IconHistory, IconCog, IconArrow, IconSparkle,
} from "./icons";

type StageName = "package" | "docker" | "summarize" | "confluence" | "jira" | "deploy";
type StageStatus = "pending" | "running" | "success" | "failed" | "skipped";
type RunMode = "live" | "mock";

interface PackageDescriptor { name: string; version: string; changed: boolean; changes: string[]; commits?: string[]; changedFiles?: string[]; aiSummary?: string; image?: string; }
interface ReleaseSummary { aiGenerated: boolean; model?: string; overview: string; perPackage: Record<string, string>; }
interface LogEntry { ts: string; stage: string; level: "info" | "warn" | "error"; message: string; }
interface StageResult { stage: StageName; status: StageStatus; durationMs?: number; detail?: string; link?: string; }
interface PipelineRun {
  id: string; releaseVersion: string; mode: RunMode; startedAt: string; finishedAt?: string;
  status: StageStatus; packages: PackageDescriptor[]; summary?: ReleaseSummary; stages: Record<StageName, StageResult>; logs: LogEntry[];
}

const STAGES: { name: StageName; label: string; Icon: any }[] = [
  { name: "package", label: "Package", Icon: IconPackage },
  { name: "docker", label: "Docker Build", Icon: IconDocker },
  { name: "summarize", label: "AI Summary", Icon: IconSparkle },
  { name: "confluence", label: "Confluence", Icon: IconDoc },
  { name: "jira", label: "Jira RM", Icon: IconTicket },
  { name: "deploy", label: "Harness · ECS", Icon: IconRocket },
];

function Badge({ status }: { status: StageStatus }) {
  const map: Record<StageStatus, string> = {
    pending: "Pending", running: "Running", success: "Success", failed: "Failed", skipped: "Skipped",
  };
  return (
    <span className={`badge badge-${status}`}>
      <span className={`dot ${status === "running" ? "pulse" : ""}`} style={{ background: "currentColor" }} />
      {map[status]}
    </span>
  );
}

export default function Dashboard() {
  const [mode, setMode] = useState<RunMode>("mock");
  const [version, setVersion] = useState("1.4.0");
  const [run, setRun] = useState<PipelineRun | null>(null);
  const [runs, setRuns] = useState<PipelineRun[]>([]);
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  const refreshRuns = useCallback(async () => {
    const r = await fetch("/api/runs").then((x) => x.json());
    setRuns(r.runs ?? []);
  }, []);

  useEffect(() => { refreshRuns(); }, [refreshRuns]);
  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [run?.logs.length]);

  const poll = useCallback((id: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const r = await fetch(`/api/runs/${id}`).then((x) => x.json());
      if (r.run) {
        setRun(r.run);
        if (r.run.status !== "running") {
          if (pollRef.current) clearInterval(pollRef.current);
          setBusy(false);
          refreshRuns();
        }
      }
    }, 700);
  }, [refreshRuns]);

  const start = useCallback(async () => {
    setBusy(true);
    const r = await fetch("/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode, releaseVersion: version }),
    }).then((x) => x.json());
    setRun(r.run);
    poll(r.run.id);
  }, [mode, version, poll]);

  const stages = run?.stages;
  const changedCount = run?.packages.filter((p) => p.changed).length ?? 0;
  const successRuns = runs.filter((r) => r.status === "success").length;
  const lastDeploy = runs.find((r) => r.stages?.deploy?.status === "success");

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span style={{ color: "var(--accent-2)" }}><Logo /></span>
          <div>
            <div className="brand-name">Orchestrator</div>
            <div className="brand-sub">Deployment Control Plane</div>
          </div>
        </div>
        <nav className="nav">
          <div className="nav-label">Workspace</div>
          <div className="nav-item active"><IconHome /> Pipelines</div>
          <div className="nav-item"><IconHistory /> Run History</div>
          <div className="nav-item"><IconPackage /> Packages</div>
          <div className="nav-item"><IconCog /> Settings</div>
        </nav>
        <div className="sidebar-foot">
          ECS · EC2 launch type<br />Harness CD · GitHub Actions<br />
          <span style={{ color: "var(--text-dim)" }}>v1.0.0</span>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <h1>Release Pipelines</h1>
          <div className="topbar-meta">
            <span>Registry: <span className="mono" style={{ color: "var(--text)" }}>ECR · us-east-1</span></span>
            <span>Cluster: <span className="mono" style={{ color: "var(--text)" }}>release-ec2-cluster</span></span>
          </div>
        </header>

        <div className="content">
          {/* Toolbar */}
          <div className="toolbar">
            <div className="field">
              <label>Release Version</label>
              <input className="input" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.4.0" />
            </div>
            <div className="field">
              <label>Execution Mode</label>
              <div className="toggle">
                <button className={mode === "mock" ? "on-mock" : ""} onClick={() => setMode("mock")}>Mock</button>
                <button className={mode === "live" ? "on-live" : ""} onClick={() => setMode("live")}>Live</button>
              </div>
            </div>
            <div className="spacer" />
            <button className="btn" onClick={start} disabled={busy}>
              {busy ? "Running…" : "Run Release Pipeline"} <IconArrow />
            </button>
          </div>

          {mode === "live" && (
            <div className="card" style={{ borderColor: "rgba(251,191,36,.4)", background: "rgba(251,191,36,.06)", padding: "12px 16px", fontSize: 12.5 }}>
              <strong style={{ color: "var(--amber)" }}>Live mode</strong> calls the real Confluence, Jira, and Harness APIs using
              configured environment secrets (<span className="mono">CONFLUENCE_TOKEN</span>, <span className="mono">JIRA_TOKEN</span>, <span className="mono">HARNESS_API_KEY</span>). Switch to Mock for a safe dry run.
            </div>
          )}

          {/* KPIs */}
          <div className="grid grid-kpi">
            <div className="card kpi"><div className="kpi-label">Packages</div><div className="kpi-value">5</div><div className="kpi-sub">{run ? `${changedCount} changed this run` : "monorepo services"}</div></div>
            <div className="card kpi"><div className="kpi-label">Current Run</div><div className="kpi-value" style={{ fontSize: 18, marginTop: 10 }}>{run ? <Badge status={run.status} /> : "—"}</div><div className="kpi-sub">{run ? `Release ${run.releaseVersion} · ${run.mode}` : "no active run"}</div></div>
            <div className="card kpi"><div className="kpi-label">Successful Runs</div><div className="kpi-value">{successRuns}</div><div className="kpi-sub">{runs.length} total runs</div></div>
            <div className="card kpi"><div className="kpi-label">Last Deploy</div><div className="kpi-value" style={{ fontSize: 16, marginTop: 12 }}>{lastDeploy ? `v${lastDeploy.releaseVersion}` : "—"}</div><div className="kpi-sub">ECS · EC2 cluster</div></div>
          </div>

          {/* Pipeline */}
          <div className="card">
            <div className="section-title">Pipeline Stages</div>
            <div className="section-sub">package → docker build (per package) → Confluence change page → Jira RM ticket → Harness deploy to ECS (EC2)</div>
            <div className="pipeline">
              {STAGES.map(({ name, label, Icon }, i) => {
                const s = stages?.[name];
                const status = s?.status ?? "pending";
                return (
                  <div className="stage-node" key={name} style={{ display: "flex" }}>
                    <div className={`stage-card ${status}`} style={{ flex: 1 }}>
                      <div className="stage-head">
                        <div className="stage-icon" style={{ color: status === "success" ? "var(--green)" : status === "running" ? "var(--accent)" : status === "failed" ? "var(--red)" : "var(--text-dim)" }}>
                          <Icon size={16} />
                        </div>
                        <Badge status={status} />
                      </div>
                      <div className="stage-name">{label}</div>
                      <div className="stage-detail">
                        {s?.detail ?? (status === "pending" ? "Waiting…" : "")}
                        {s?.link && (<><br /><a className="link" href={s.link} target="_blank" rel="noreferrer">View ↗</a></>)}
                      </div>
                      {s?.durationMs != null && <div className="stage-dur">{(s.durationMs / 1000).toFixed(1)}s</div>}
                    </div>
                    {i < STAGES.length - 1 && <div className="connector"><IconArrow size={16} /></div>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Packages + Logs */}
          <div className="grid" style={{ gridTemplateColumns: "1.1fr 1fr" }}>
            <div className="card">
              <div className="section-title">Packages</div>
              <div className="section-sub">Change detection from the release diff</div>
              <table className="tbl">
                <thead><tr><th>Service</th><th>Version</th><th>Status</th><th>What changed</th></tr></thead>
                <tbody>
                  {(run?.packages ?? defaultPkgs(version)).map((p) => (
                    <tr key={p.name}>
                      <td className="mono">{p.name}</td>
                      <td className="mono" style={{ color: "var(--text-dim)" }}>{p.version}</td>
                      <td><span className={`chip ${p.changed ? "chip-changed" : ""}`}>{p.changed ? "changed" : "unchanged"}</span></td>
                      <td style={{ color: "var(--text-dim)", fontSize: 12 }}>{p.aiSummary ? p.aiSummary : (p.changes.length ? p.changes.join("; ") : "—")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="card">
              <div className="section-title">Live Execution Log</div>
              <div className="section-sub">Streamed from the orchestrator</div>
              <div className="logs">
                {!run?.logs.length && <div className="log-empty">No logs yet — run a pipeline to see live output.</div>}
                {run?.logs.map((l, i) => (
                  <div className="log-line" key={i}>
                    <span className="log-ts">{l.ts.slice(11, 19)}</span>
                    <span className="log-stage">[{l.stage}]</span>
                    <span className={`log-${l.level}`}>{l.message}</span>
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            </div>
          </div>

          {/* AI change summary */}
          {run?.summary?.overview && (
            <div className="card">
              <div className="section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <IconSparkle size={16} color="var(--accent)" />
                Release Change Summary
                <span className="chip" style={{ marginLeft: 8 }}>
                  {run.summary.aiGenerated ? `AI · ${run.summary.model ?? "openai"}` : "automated"}
                </span>
              </div>
              <div className="section-sub">Generated from this build&apos;s commits and changed files, then written to Confluence and the Jira RM ticket</div>
              <p style={{ color: "var(--text)", fontSize: 13, lineHeight: 1.6, marginTop: 8 }}>{run.summary.overview}</p>
            </div>
          )}

          {/* History */}
          <div className="card">
            <div className="section-title">Recent Runs</div>
            <div className="section-sub">{runs.length ? `${runs.length} runs` : "No runs yet"}</div>
            {runs.length === 0 ? (
              <div className="empty-state">Trigger your first release pipeline above.</div>
            ) : (
              <table className="tbl">
                <thead><tr><th>Release</th><th>Mode</th><th>Status</th><th>Started</th><th>Duration</th></tr></thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => setRun(r)}>
                      <td className="mono">v{r.releaseVersion}</td>
                      <td><span className={`chip ${r.mode === "live" ? "" : ""}`}>{r.mode}</span></td>
                      <td><Badge status={r.status} /></td>
                      <td style={{ color: "var(--text-dim)" }} className="mono">{r.startedAt.slice(11, 19)}</td>
                      <td className="mono" style={{ color: "var(--text-dim)" }}>{r.finishedAt ? `${((new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime()) / 1000).toFixed(1)}s` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function defaultPkgs(v: string): PackageDescriptor[] {
  return [
    { name: "auth-service", version: v, changed: true, changes: ["feat(auth): add WebAuthn passkeys"] },
    { name: "payment-service", version: v, changed: true, changes: ["fix(payment): idempotent refunds"] },
    { name: "notification-service", version: v, changed: false, changes: [] },
    { name: "inventory-service", version: v, changed: true, changes: ["feat(inventory): real-time stock sync"] },
    { name: "gateway-service", version: v, changed: false, changes: [] },
  ];
}
