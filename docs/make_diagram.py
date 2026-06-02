import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
from matplotlib.lines import Line2D

# Palette (matches the dashboard)
BG = "#0b0f17"; PANEL = "#131a28"; BORDER = "#1f2937"
TEXT = "#e6edf6"; DIM = "#9aa7b8"; FAINT = "#64748b"
ACCENT = "#3b82f6"; CYAN = "#22d3ee"; TEAL = "#2dd4bf"
GREEN = "#34d399"; AMBER = "#fbbf24"; PURPLE = "#a78bfa"; RED="#f87171"

fig, ax = plt.subplots(figsize=(16, 10), dpi=150)
fig.patch.set_facecolor(BG); ax.set_facecolor(BG)
ax.set_xlim(0, 100); ax.set_ylim(0, 64); ax.axis("off")

def box(x, y, w, h, title, sub="", fc=PANEL, ec=BORDER, tc=TEXT, tsize=11, accent=None, sub_c=DIM, title_top=False):
    p = FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.15,rounding_size=0.6",
                       fc=fc, ec=ec, lw=1.4)
    ax.add_patch(p)
    if accent:
        ax.add_patch(FancyBboxPatch((x, y+h-0.55), w, 0.55,
                     boxstyle="round,pad=0,rounding_size=0.1", fc=accent, ec="none", alpha=0.9))
    if title_top:
        ax.text(x+w/2, y+h-1.6, title, ha="center", va="center",
                color=tc, fontsize=tsize, fontweight="bold")
    else:
        ax.text(x+w/2, y+h/2 + (0.7 if sub else 0), title, ha="center", va="center",
                color=tc, fontsize=tsize, fontweight="bold")
    if sub:
        ax.text(x+w/2, y+h/2-1.0, sub, ha="center", va="center", color=sub_c, fontsize=8)

def arrow(x1, y1, x2, y2, c=FAINT, style="-|>", lw=1.6, ls="-"):
    ax.add_patch(FancyArrowPatch((x1, y1), (x2, y2), arrowstyle=style,
                 mutation_scale=14, color=c, lw=lw, linestyle=ls,
                 connectionstyle="arc3,rad=0"))

# Title
ax.text(2, 61.5, "Release Orchestrator — Enterprise Deployment Control Plane",
        color=TEXT, fontsize=20, fontweight="bold")
ax.text(2, 59, "packager → docker build (per package) → Confluence → Jira RM ticket → Harness → ECS (EC2)",
        color=CYAN, fontsize=11)

# ---- Top lane: Source & CI ----
box(2, 50, 18, 6, "GitHub Repo", "monorepo · 5 packages", accent=TEXT, fc="#161e2e")
box(2, 41, 18, 6, "GitHub Actions CI", "typecheck · build · unit + E2E", accent=ACCENT, fc="#161e2e")
arrow(11, 50, 11, 47, c=BORDER)

# ---- Stage 1: Packager ----
box(25, 50, 16, 6, "1 · Packager", "detect changed packages", accent=ACCENT)
arrow(20, 53, 25, 53, c=ACCENT)

# ---- Stage 2: Docker matrix (5 builds) ----
ax.text(60, 57.4, "2 · Docker Build (matrix — one per package)", color=TEXT, fontsize=10, fontweight="bold", ha="center")
pkgs = ["auth", "payment", "notification", "inventory", "gateway"]
for i, name in enumerate(pkgs):
    bx = 46 + i*10.2
    box(bx, 50.5, 9.2, 4.5, name, "image→ECR", fc="#10213a", ec=ACCENT, tsize=9, sub_c=DIM)
arrow(41, 53, 45.5, 53, c=ACCENT)

# ECR
box(46, 43.5, 51.4, 4.2, "Amazon ECR", "5 versioned container images", accent=AMBER, fc="#1a1d14")
for i in range(5):
    bx = 46 + i*10.2 + 4.6
    arrow(bx, 50.5, bx, 47.7, c=AMBER, lw=1.2)

# ---- Stage 3-4: Confluence + Jira (release docs) ----
box(2, 30, 22, 6.5, "3 · Confluence", "Release change summary page\n(packages + changes)", accent=TEAL, tsize=11)
box(2, 21, 22, 6.5, "4 · Jira RM Ticket", "Release Management ticket\nlinks Confluence page", accent=PURPLE, tsize=11)
arrow(13, 41, 13, 36.5, c=TEAL)         # CI/packager -> confluence
arrow(13, 30, 13, 27.5, c=PURPLE)       # confluence -> jira

# ---- Orchestrator engine (center) ----
box(30, 21, 30, 15.5, "Release Orchestrator Engine", "", accent=CYAN, fc="#0f1a2b", tsize=13, title_top=True)
ax.text(45, 33.2, "TypeScript · CLI + HTTP API", color=DIM, fontsize=8.5, ha="center")
for i, (lbl, c) in enumerate([("Stage runner & logging", CYAN),
                              ("Confluence / Jira / Harness clients", TEAL),
                              ("Mock <-> Live mode switch", AMBER),
                              ("Per-package change detection", ACCENT)]):
    ax.add_patch(plt.Circle((33, 30.5 - i*2.0), 0.32, color=c))
    ax.text(34, 30.5 - i*2.0, lbl, color=TEXT, fontsize=8.5, va="center")
arrow(24, 24.2, 30, 26, c=PURPLE)       # jira -> engine
arrow(24, 33, 30, 31, c=TEAL)           # confluence -> engine

# ---- Agent UI ----
box(66, 26, 31.4, 10.5, "Agent UI (Next.js)", "", accent=ACCENT, fc="#0f1a2b", tsize=12, title_top=True)
for i, lbl in enumerate(["Pipeline visualization & live logs",
                          "Per-package change table",
                          "Mock / Live execution toggle",
                          "Run history & KPIs"]):
    ax.text(68.5, 32.0 - i*1.5, "•  " + lbl, color=TEXT, fontsize=8.5, va="center")
arrow(60, 30, 66, 31, c=ACCENT, style="<|-|>")  # UI <-> engine

# ---- Stage 5: Harness + ECS ----
box(30, 9, 30, 8, "5 · Harness CD", "triggers ECS rolling deploy\nEC2 launch type", accent=GREEN, tsize=12)
arrow(45, 21, 45, 17, c=GREEN)          # engine -> harness

# ECS cluster
box(66, 5, 31.4, 14, "AWS ECS Cluster (EC2)", "", accent=GREEN, fc="#0f1f17", tsize=12, title_top=True)
ax.text(81.7, 15.6, "release-ec2-cluster · us-east-1", color=DIM, fontsize=8.5, ha="center")
for i, name in enumerate(pkgs):
    col = i % 3; row = i // 3
    sx = 68 + col*9.8; sy = 10.3 - row*4.0
    box(sx, sy, 8.8, 3.0, name, "task", fc="#10271d", ec=GREEN, tsize=8, sub_c=DIM)
arrow(60, 13, 66, 12, c=GREEN, lw=2)    # harness -> ECS

# ---- Mock services (bottom-left) ----
box(2, 5, 22, 9, "Mock Services", "", accent=AMBER, fc="#1a1d14", tsize=11, title_top=True)
ax.text(13, 10.4, "Confluence · Jira · Harness", color=DIM, fontsize=8.5, ha="center")
ax.text(13, 8.6, "in-process emulation", color=FAINT, fontsize=8, ha="center")
ax.text(13, 6.9, "used by E2E tests & UI mock", color=FAINT, fontsize=8, ha="center")
arrow(24, 9.5, 30, 24, c=AMBER, ls="--", lw=1.2)

# Legend
ax.text(2, 1.6, "● live integration   ", color=GREEN, fontsize=8)
ax.text(14, 1.6, "● orchestrated stage   ", color=ACCENT, fontsize=8)
ax.text(28, 1.6, "● mock / dry-run path", color=AMBER, fontsize=8)
ax.text(98, 1.6, "Tejaswinireddys/release-orchestrator", color=FAINT, fontsize=8, ha="right")

plt.tight_layout(pad=0.5)
plt.savefig("/home/user/workspace/release-orchestrator/docs/architecture.png",
            facecolor=BG, bbox_inches="tight", dpi=150)
print("saved architecture.png")
