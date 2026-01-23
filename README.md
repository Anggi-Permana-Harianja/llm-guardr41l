<div align="center">

# LLM Guardr41l

**AI code governance for engineering teams.**

Stop AI-generated code from flooding your PR queue. Catch issues before they hit code review.

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/llm-guardr41l.llm-guardr41l?label=VS%20Code%20Marketplace&logo=visualstudiocode&color=blue)](https://marketplace.visualstudio.com/items?itemName=llm-guardr41l.llm-guardr41l)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/llm-guardr41l.llm-guardr41l?logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=llm-guardr41l.llm-guardr41l)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/Anggi-Permana-Harianja/llm-guardr41l/actions/workflows/ci.yml/badge.svg)](https://github.com/Anggi-Permana-Harianja/llm-guardr41l/actions/workflows/ci.yml)

[Install from Marketplace](https://marketplace.visualstudio.com/items?itemName=llm-guardr41l.llm-guardr41l) · [For Teams](#for-engineering-teams) · [Presets](#presets) · [CLI for CI/CD](#cli-tool)

</div>

---

## The Problem

AI coding tools make your team faster — but create new problems:

| What AI does well | What breaks |
|-------------------|-------------|
| Generates code fast | Review turnaround increases |
| More PRs per week | Back-and-forth explodes |
| Higher LOC/day | Subtle bugs slip through |

**Teams using AI tools see 40% longer review cycles** — the code looks correct at a glance, but fails on business logic and edge cases.

> "The issue isn't just the volume (more PRs), it's the density of the review required. We had to shift focus from 'Velocity' to 'Review Efficiency'."
> — Engineering Manager tracking AI impact on their team

**LLM Guardr41l catches these issues before code hits PR.**

---

## For Engineering Teams

Built for engineering leads who want to set guardrails once and enforce them across the whole team.

### Why Teams Install It

| Pain Point | How Guardr41l Helps |
|------------|---------------------|
| "AI touched files nobody asked it to" | **Scope rules** — restrict changes to specific files/functions |
| "PRs are exploding to 300+ lines" | **Threshold rules** — cap lines/files changed |
| "Who imported this dependency?" | **Dependency rules** — allowlist/blocklist packages |
| "Review back-and-forth is killing us" | **Catch violations before PR** — not during review |

### Team Features

| Feature | What It Does |
|---------|--------------|
| **Shared `rules.yaml`** | One config file, whole team follows same standards |
| **CLI for CI/CD** | `guardrail check --staged` in GitHub Actions — gate PRs automatically |
| **Metrics Dashboard** | Track violation trends, approval rates, top violated rules |
| **Audit Logs** | Who approved what, when — full trail in `.llm-guardrail/logs.json` |
| **SARIF Output** | Integrates with GitHub Code Scanning |

### CI/CD Integration

Gate PRs before they're even opened:

```yaml
# GitHub Actions
- name: Check AI code changes
  run: npx llm-guardr41l check --staged

- name: Upload to GitHub Code Scanning
  uses: github/codeql-action/upload-sarif@v2
  with:
    sarif_file: results.sarif
```

```bash
# Pre-commit hook
#!/bin/sh
npx llm-guardr41l check --staged || exit 1
```

---

## Quick Start

**1. Install the extension**

```
ext install llm-guardr41l.llm-guardr41l
```

Or search "LLM Guardr41l" in VS Code Extensions.

**2. Pick a preset and copy it to your project root**

```bash
# Recommended for teams: Start with safe-default
curl -o rules.yaml https://raw.githubusercontent.com/Anggi-Permana-Harianja/llm-guardr41l/main/rules-examples/safe-default.yaml
```

**3. Commit `rules.yaml` to your repo.** Your whole team now follows the same guardrails.

---

## Presets

Don't write rules from scratch. **Pick an opinionated preset:**

### For Teams

| Preset | Best For | What It Stops |
|--------|----------|---------------|
| **[safe-default](rules-examples/safe-default.yaml)** | Most teams | AI sprawl, unwanted deps, mass refactors. **Start here.** |
| **[no-surprises](rules-examples/no-surprises.yaml)** | Scope control | "I asked for one function. Why 12 files?" |
| **[dependency-lockdown](rules-examples/dependency-lockdown.yaml)** | Enterprise / Supply chain | All new dependencies blocked by default |
| **[enterprise-safe](rules-examples/enterprise-safe.yaml)** | SOC2, HIPAA, PCI | Full audit trail, compliance patterns |

### For Code Quality

| Preset | Best For |
|--------|----------|
| **[no-bad-practices](rules-examples/no-bad-practices.yaml)** | No `console.log`, no `TODO`, no clutter |
| **[web-app](rules-examples/web-app.yaml)** | React, Vue, Angular — XSS, bundle size |
| **[backend-api](rules-examples/backend-api.yaml)** | Node, Python, Go — secrets, SQL injection |

<details>
<summary><strong>Or write your own rules.yaml</strong></summary>

```yaml
rules:
  # Don't let AI add random npm packages
  - type: dependencies
    allowed:
      - react
      - lodash
      - axios
    forbidden:
      - moment  # Use date-fns instead

  # No debugging artifacts in production code
  - type: content
    forbid:
      - console.log
      - debugger

  # Limit blast radius
  - type: threshold
    max_lines_changed: 100
    max_files_changed: 5

global:
  require_approval_for_all: true
```

</details>

---

## How It Works

LLM Guardr41l watches code changes in real-time — from any AI tool:

- GitHub Copilot
- Cursor
- Claude
- ChatGPT pastes
- Autonomous agents

**No API interception. No vendor lock-in. Your code stays local.**

When a developer saves AI-generated code:

1. Guardr41l detects the change
2. Validates against `rules.yaml`
3. Shows violations inline (like ESLint errors)
4. Blocks or warns based on severity

<!-- TODO: Add GIF showing violation being caught -->

---

## For Individual Developers

Even without a team, Guardr41l helps you catch AI mistakes before they waste your time:

> "Copilot changed files I didn't touch"

> "Why did this edit explode to 300 lines?"

> "AI refactored my code without asking"

### Features for Solo Devs

- **Real-time monitoring** — catches changes as you code
- **Inline diagnostics** — violations appear as squiggly underlines
- **Diff preview** — see exactly what changed before approving
- **Quick fixes** — click to allow a dependency or adjust a threshold
- **Undo rejection** — accidentally rejected? Restore instantly

---

## Metrics Dashboard

Track how AI code is affecting your team:

- **Approval/rejection rates** — are guardrails too strict or too loose?
- **Violation trends** — getting better or worse over time?
- **Top violated rules** — which rules catch the most issues?
- **Export to CSV** — for reporting to leadership

Run: `Guardrail: Show Metrics Dashboard`

<!-- TODO: Add screenshot of metrics dashboard -->

---

## Rule Types

| Type | What It Controls |
|------|------------------|
| **Scope** | Which files/functions can be modified |
| **Threshold** | Max lines/files changed per edit |
| **Dependencies** | Allowed/forbidden packages |
| **Content** | Forbidden patterns (`console.log`, `eval`, etc.) |
| **Refactor** | Block unwanted renames, formatting changes |

See full documentation: [Rule Types](#rule-types-1)

---

## CLI Tool

For CI/CD, pre-commit hooks, and automation.

```bash
# Install globally
npm install -g llm-guardr41l

# Or use npx (no install)
npx llm-guardr41l check --staged
```

### Commands

```bash
# Check staged changes before commit
guardrail check --staged

# Check a specific commit
guardrail check --commit <sha>

# Initialize rules in a new project
guardrail init --template standard
```

### Output Formats

```bash
# Human-readable (default)
guardrail check --staged

# JSON (for scripts)
guardrail check --staged --format json

# SARIF (for GitHub Code Scanning)
guardrail check --staged --format sarif --output results.sarif
```

---

## Installation

### VS Code Extension

**From Marketplace (Recommended):**
1. Open VS Code
2. Go to Extensions (Cmd+Shift+X / Ctrl+Shift+X)
3. Search "LLM Guardr41l"
4. Click Install

**From Source:**
```bash
git clone https://github.com/Anggi-Permana-Harianja/llm-guardr41l.git
cd llm-guardr41l
npm install
npm run package
# Install the generated .vsix file
```

### CLI Tool

```bash
npm install -g llm-guardr41l
```

---

## Open Source

LLM Guardr41l is fully open source (MIT). Audit it. Extend it. Customize it.

---

## Roadmap

- [x] Core rule engine
- [x] Metrics dashboard
- [x] CLI for CI/CD
- [x] SARIF output for GitHub
- [ ] Team/enterprise features (coming soon)
- [ ] JetBrains port (help wanted!)
- [ ] Neovim plugin

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)

---

<div align="center">

**Built for the AI-assisted coding era.**

[Install from Marketplace](https://marketplace.visualstudio.com/items?itemName=llm-guardr41l.llm-guardr41l) · [GitHub](https://github.com/Anggi-Permana-Harianja/llm-guardr41l)

</div>
