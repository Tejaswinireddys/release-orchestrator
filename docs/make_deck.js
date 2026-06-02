const pptx = require("pptxgenjs");
const p = new pptx();
p.defineLayout({ name: "W", width: 13.333, height: 7.5 });
p.layout = "W";

// Palette
const BG = "0B0F17", PANEL = "131A28", PANEL2 = "161E2E", BORDER = "1F2937";
const TEXT = "E6EDF6", DIM = "B6C2D2", FAINT = "7C8AA0";
const ACCENT = "3B82F6", CYAN = "22D3EE", TEAL = "2DD4BF", GREEN = "34D399", AMBER = "FBBF24", PURPLE = "A78BFA";
const HEAD = "Trebuchet MS", BODY = "Calibri", MONO = "Consolas";

const W = 13.333, H = 7.5, M = 0.7;

function bg(s, color = BG) { s.background = { color }; }
function topbar(s, color = ACCENT) {
  s.addShape("rect", { x: 0, y: 0, w: W, h: 0.12, fill: { color }, line: { type: "none" } });
}
function footer(s, n) {
  s.addText("Release Orchestrator", { x: M, y: H - 0.45, w: 6, h: 0.3, fontFace: BODY, fontSize: 9, color: FAINT });
  s.addText(`${n} / 8`, { x: W - 1.6, y: H - 0.45, w: 0.9, h: 0.3, fontFace: MONO, fontSize: 9, color: FAINT, align: "right" });
}
function card(s, x, y, w, h, fill = PANEL, line = BORDER) {
  s.addShape("roundRect", { x, y, w, h, fill: { color: fill }, line: { color: line, width: 1 }, rectRadius: 0.08 });
}
function accentBar(s, x, y, w, color) {
  s.addShape("roundRect", { x, y, w, h: 0.06, fill: { color }, line: { type: "none" }, rectRadius: 0.03 });
}

// ---------- Slide 1: Title ----------
let s = p.addSlide(); bg(s);
topbar(s, ACCENT);
s.addText("Release Orchestrator", { x: M, y: 2.55, w: 12, h: 1.0, fontFace: HEAD, fontSize: 50, bold: true, color: TEXT });
s.addText("Enterprise Deployment Control Plane", { x: M, y: 3.6, w: 12, h: 0.6, fontFace: HEAD, fontSize: 24, color: CYAN });
s.addText("packager  →  docker build (per package)  →  Confluence  →  Jira RM ticket  →  Harness  →  ECS (EC2)",
  { x: M, y: 4.45, w: 12, h: 0.5, fontFace: MONO, fontSize: 14, color: TEXT });
s.addText([
  { text: "5 services", options: { color: TEAL, bold: true } }, { text: "    ·    ", options: { color: FAINT } },
  { text: "Next.js agent UI", options: { color: ACCENT, bold: true } }, { text: "    ·    ", options: { color: FAINT } },
  { text: "GitHub Actions", options: { color: TEXT, bold: true } }, { text: "    ·    ", options: { color: FAINT } },
  { text: "Harness CD", options: { color: GREEN, bold: true } }, { text: "    ·    ", options: { color: FAINT } },
  { text: "AWS ECS / EC2", options: { color: TEAL, bold: true } },
], { x: M, y: 5.15, w: 12, h: 0.4, fontFace: BODY, fontSize: 14 });
footer(s, 1);

// ---------- Slide 2: The problem / goal ----------
s = p.addSlide(); bg(s);
s.addText("The Release Problem", { x: M, y: 0.6, w: 11, h: 0.7, fontFace: HEAD, fontSize: 34, bold: true, color: TEXT });
const probs = [
  ["Manual, error-prone releases", "Building, documenting, ticketing and deploying 5 services by hand is slow and inconsistent."],
  ["No single source of truth", "Change summaries, RM tickets and deploy state live in separate tools with no link between them."],
  ["Slow, risky deployments", "Hand-rolled ECS deploys lack repeatability, rollback and an auditable trail."],
  ["No safe dry-run", "Teams can't rehearse the full release flow without touching production systems."],
];
const cardW2 = 5.85, cardH2 = 2.35, gapX2 = 0.35, gapY2 = 0.45;
const gridW2 = cardW2 * 2 + gapX2, startX2 = (W - gridW2) / 2;
probs.forEach((c, i) => {
  const x = startX2 + (i % 2) * (cardW2 + gapX2), y = 1.7 + Math.floor(i / 2) * (cardH2 + gapY2);
  card(s, x, y, cardW2, cardH2); accentBar(s, x + 0.35, y + 0.4, 1.0, AMBER);
  s.addText(c[0], { x: x + 0.35, y: y + 0.6, w: cardW2 - 0.7, h: 0.5, fontFace: HEAD, fontSize: 19, bold: true, color: TEXT });
  s.addText(c[1], { x: x + 0.35, y: y + 1.2, w: cardW2 - 0.7, h: 1.0, fontFace: BODY, fontSize: 14, color: DIM, valign: "top" });
});
footer(s, 2);

// ---------- Slide 3: Solution overview ----------
s = p.addSlide(); bg(s);
s.addText("One Pipeline, End to End", { x: M, y: 0.6, w: 11, h: 0.7, fontFace: HEAD, fontSize: 34, bold: true, color: TEXT });
s.addText("A single orchestrator drives every stage and an agent UI makes it observable.",
  { x: M, y: 1.32, w: 12, h: 0.4, fontFace: BODY, fontSize: 15, color: DIM });
const stages = [
  ["1", "Packager", "Detect which of the 5\npackages changed", ACCENT],
  ["2", "Docker Build", "One image per\npackage, pushed to ECR", CYAN],
  ["3", "Confluence", "Auto change-summary\npage", TEAL],
  ["4", "Jira RM Ticket", "Release Management\nticket, linked to page", PURPLE],
  ["5", "Harness → ECS", "Rolling deploy to\nEC2 cluster", GREEN],
];
const sw = 2.3, gap = 0.26;
const totalW3 = sw * 5 + gap * 4, startX3 = (W - totalW3) / 2, cardY3 = 2.5, cardH3 = 2.9;
stages.forEach((st, i) => {
  const x = startX3 + i * (sw + gap), y = cardY3;
  card(s, x, y, sw, cardH3, PANEL2); accentBar(s, x, y, sw, st[3]);
  s.addShape("ellipse", { x: x + 0.35, y: y + 0.4, w: 0.62, h: 0.62, fill: { color: st[3] }, line: { type: "none" } });
  s.addText(st[0], { x: x + 0.35, y: y + 0.4, w: 0.62, h: 0.62, align: "center", valign: "middle", fontFace: HEAD, fontSize: 22, bold: true, color: BG });
  s.addText(st[1], { x: x + 0.25, y: y + 1.25, w: sw - 0.5, h: 0.5, fontFace: HEAD, fontSize: 15, bold: true, color: TEXT });
  s.addText(st[2], { x: x + 0.25, y: y + 1.8, w: sw - 0.5, h: 0.9, fontFace: BODY, fontSize: 12, color: DIM, valign: "top" });
  if (i < stages.length - 1) s.addText("→", { x: x + sw - 0.04, y: y + cardH3 / 2 - 0.25, w: 0.34, h: 0.5, align: "center", valign: "middle", fontFace: BODY, fontSize: 20, color: TEAL });
});
s.addText("Any stage failure aborts the run and surfaces in the UI and CI — no partial releases.",
  { x: M, y: cardY3 + cardH3 + 0.5, w: 12, h: 0.4, fontFace: BODY, fontSize: 14, italic: true, color: DIM });
footer(s, 3);

// ---------- Slide 4: Architecture diagram ----------
s = p.addSlide(); bg(s);
s.addText("System Architecture", { x: M, y: 0.5, w: 11, h: 0.7, fontFace: HEAD, fontSize: 34, bold: true, color: TEXT });
s.addImage({ path: __dirname + "/architecture.png", x: 0.2, y: 1.3, w: 12.93, h: 5.6, sizing: { type: "contain", w: 12.93, h: 5.6 } });
footer(s, 4);

// ---------- Slide 5: Agent UI ----------
s = p.addSlide(); bg(s);
s.addText("The Agent UI", { x: M, y: 0.5, w: 11, h: 0.7, fontFace: HEAD, fontSize: 34, bold: true, color: TEXT });
s.addText("Next.js dashboard · live pipeline visualization", { x: M, y: 1.22, w: 11, h: 0.4, fontFace: BODY, fontSize: 15, color: DIM });
card(s, M, 1.8, 7.6, 5.0, PANEL2, BORDER);
s.addImage({ path: "/tmp/ui-complete.png", x: M + 0.1, y: 1.9, w: 7.4, h: 4.8, sizing: { type: "contain", w: 7.4, h: 4.8 } });
const feats = [
  ["Mock / Live toggle", "Dry-run the full flow or fire real APIs", AMBER],
  ["Per-stage status & timing", "Package → Docker → Confluence → Jira → Deploy", ACCENT],
  ["Streaming execution log", "Every step traced in real time", CYAN],
  ["Change-aware packages", "See which services changed and why", TEAL],
  ["Run history & KPIs", "Success rate, last deploy, totals", GREEN],
];
const featX = 8.55, featY0 = 1.8, featH = 0.94, featGap = 0.06;
feats.forEach((f, i) => {
  const x = featX, y = featY0 + i * (featH + featGap);
  card(s, x, y, 4.08, featH, PANEL2);
  s.addShape("ellipse", { x: x + 0.25, y: y + featH / 2 - 0.09, w: 0.18, h: 0.18, fill: { color: f[2] }, line: { type: "none" } });
  s.addText(f[0], { x: x + 0.6, y: y + 0.13, w: 3.35, h: 0.35, fontFace: HEAD, fontSize: 13.5, bold: true, color: TEXT });
  s.addText(f[1], { x: x + 0.6, y: y + 0.48, w: 3.35, h: 0.38, fontFace: BODY, fontSize: 10.5, color: DIM, valign: "top" });
});
footer(s, 5);

// ---------- Slide 6: CI/CD + Testing ----------
s = p.addSlide(); bg(s);
s.addText("CI/CD & Quality", { x: M, y: 0.6, w: 11, h: 0.7, fontFace: HEAD, fontSize: 34, bold: true, color: TEXT });
const cols = [
  ["GitHub Actions", ACCENT, [
    "ci.yml — typecheck, build, unit + E2E, UI build (must stay green)",
    "build-packages.yml — matrix Docker build, one image per package",
    "release-deploy.yml — Confluence + Jira + Harness on tagged release",
  ]],
  ["Testing", GREEN, [
    "Unit tests — packager, docker matrix, Confluence/Jira rendering",
    "End-to-end test — full pipeline against in-process mocks",
    "Injected git diff & docker executor — deterministic, no daemon",
  ]],
  ["Mock vs. Live", AMBER, [
    "Mock — emulated Confluence/Jira/Harness, zero secrets",
    "Live — same code path, real REST APIs via env secrets",
    "Switchable from the UI toggle or RUN_MODE env var",
  ]],
];
const colW = 3.9, colGap = 0.3, colH = 4.7;
const gridW6 = colW * 3 + colGap * 2, startX6 = (W - gridW6) / 2, colY = 1.65;
cols.forEach((c, i) => {
  const x = startX6 + i * (colW + colGap), y = colY;
  card(s, x, y, colW, colH, PANEL); accentBar(s, x + 0.35, y + 0.45, 1.0, c[1]);
  s.addText(c[0], { x: x + 0.35, y: y + 0.65, w: colW - 0.7, h: 0.5, fontFace: HEAD, fontSize: 18, bold: true, color: TEXT });
  s.addText(c[2].map((t) => ({ text: t, options: { bullet: { code: "2022", indent: 14 }, color: DIM, fontSize: 12.5, paraSpaceAfter: 14 } })),
    { x: x + 0.35, y: y + 1.35, w: colW - 0.65, h: 3.1, fontFace: BODY, valign: "top" });
});
footer(s, 6);

// ---------- Slide 7: Deployment target ----------
s = p.addSlide(); bg(s);
s.addText("Deployment Target", { x: M, y: 0.6, w: 11, h: 0.7, fontFace: HEAD, fontSize: 34, bold: true, color: TEXT });
s.addText("Harness CD performs an ECS rolling deploy on the EC2 launch type, with automatic rollback.",
  { x: M, y: 1.32, w: 12, h: 0.4, fontFace: BODY, fontSize: 15, color: DIM });
const specs = [["Orchestration", "AWS ECS", ACCENT], ["Launch type", "EC2", CYAN], ["Cluster", "release-ec2-cluster", TEAL], ["Registry", "Amazon ECR · us-east-1", PURPLE], ["Strategy", "Rolling + auto rollback", GREEN], ["Services", "5 task definitions", AMBER]];
const specW = 3.9, specHt = 1.8, specGapX = 0.3, specGapY = 0.4;
const gridW7 = specW * 3 + specGapX * 2, startX7 = (W - gridW7) / 2, gridY7 = 2.15;
specs.forEach((sp, i) => {
  const x = startX7 + (i % 3) * (specW + specGapX), y = gridY7 + Math.floor(i / 3) * (specHt + specGapY);
  card(s, x, y, specW, specHt, PANEL2);
  accentBar(s, x + 0.35, y + 0.35, 0.7, sp[2]);
  s.addText(sp[0].toUpperCase(), { x: x + 0.35, y: y + 0.55, w: specW - 0.7, h: 0.3, fontFace: BODY, fontSize: 12, bold: true, color: DIM, charSpacing: 1.5 });
  s.addText(sp[1], { x: x + 0.35, y: y + 0.95, w: specW - 0.7, h: 0.6, fontFace: HEAD, fontSize: 19, bold: true, color: TEXT, valign: "top" });
});
footer(s, 7);

// ---------- Slide 8: Outcomes / close ----------
s = p.addSlide(); bg(s, PANEL);
topbar(s, ACCENT);
s.addText("What This Delivers", { x: M, y: 0.95, w: 11, h: 0.8, fontFace: HEAD, fontSize: 36, bold: true, color: TEAL });
const out = [
  ["Repeatable", "Every release runs the identical, tested pipeline."],
  ["Traceable", "Confluence page + Jira RM ticket auto-linked to each deploy."],
  ["Observable", "The agent UI shows live status, logs and history."],
  ["Safe", "Mock mode rehearses the entire flow with zero production risk."],
];
const outY0 = 2.2, outGap = 1.0;
out.forEach((o, i) => {
  const y = outY0 + i * outGap;
  s.addText(o[0], { x: M, y, w: 3.0, h: 0.6, fontFace: HEAD, fontSize: 20, bold: true, color: GREEN, valign: "top" });
  s.addText(o[1], { x: M + 3.2, y, w: 8.4, h: 0.6, fontFace: BODY, fontSize: 16, color: TEXT, valign: "top" });
});
s.addShape("line", { x: M, y: outY0 + 4 * outGap + 0.15, w: 11.93, h: 0, line: { color: BORDER, width: 1 } });
s.addText([
  { text: "github.com/Tejaswinireddys/release-orchestrator", options: { color: CYAN } },
], { x: M, y: outY0 + 4 * outGap + 0.35, w: 11.9, h: 0.4, fontFace: MONO, fontSize: 13, align: "left" });
// custom footer (no overlap) for slide 8 — label + number both right-aligned
s.addText("Release Orchestrator", { x: W - 4.6, y: H - 0.45, w: 3.0, h: 0.3, fontFace: BODY, fontSize: 9, color: FAINT, align: "right" });
s.addText("8 / 8", { x: W - 1.6, y: H - 0.45, w: 0.9, h: 0.3, fontFace: MONO, fontSize: 9, color: FAINT, align: "right" });

p.writeFile({ fileName: __dirname + "/Release-Orchestrator.pptx" }).then((f) => console.log("saved", f));
