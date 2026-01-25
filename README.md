<div align="center">

# LLM Guardr41l

**Policy-as-code for AI-assisted development.**

Define rules. Enforce them. Track everything.

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/llm-guardr41l.llm-guardr41l?label=VS%20Code%20Marketplace&logo=visualstudiocode&color=blue)](https://marketplace.visualstudio.com/items?itemName=llm-guardr41l.llm-guardr41l)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/llm-guardr41l.llm-guardr41l?logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=llm-guardr41l.llm-guardr41l)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/Anggi-Permana-Harianja/llm-guardr41l/actions/workflows/ci.yml/badge.svg)](https://github.com/Anggi-Permana-Harianja/llm-guardr41l/actions/workflows/ci.yml)

[Install](https://marketplace.visualstudio.com/items?itemName=llm-guardr41l.llm-guardr41l) · [For Engineering Managers](#for-engineering-managers) · [For Developers](#for-developers) · [Quick Start](#quick-start)

</div>

---

## The Problem

AI coding tools are changing how teams write code. But without governance:

- **No visibility** — What is AI actually changing in your codebase?
- **No control** — How do you enforce coding standards on AI-generated code?
- **No accountability** — Who approved what? When?

**LLM Guardr41l solves this with four capabilities:**

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   RULES     │ →  │   REVIEW    │ →  │   METRICS   │ →  │   AUDIT     │
│  (Define)   │    │  (Enforce)  │    │  (Measure)  │    │  (Comply)   │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

---

## How It Works

### 1. Rules — Define What AI Can Change

Create a `rules.yaml` in your project. Define what's allowed and what's forbidden.

![Rules Demo](assets/gifs/01-rules.gif)

```yaml
rules:
  # Block forbidden dependencies
  - type: dependencies
    forbidden:
      - moment
      - jquery

  # No debugging artifacts
  - type: content
    forbid:
      - console.log
      - debugger

  # Limit blast radius
  - type: threshold
    max_lines_changed: 100
    max_files_changed: 5
```

**Your rules. Your standards. Enforced automatically.**

---

### 2. Review — Approve or Reject Violations

When AI-generated code violates a rule, developers see it immediately. They can:

- **Reject** — Revert the change instantly
- **Approve and update rules** — Accept the code and automatically update `rules.yaml`

![Review Demo](assets/gifs/02-review.gif)

**No more violations slipping through. Every change is a conscious decision.**

---

### 3. Metrics — Track Approval and Rejection Rates

See how your team is interacting with AI-generated code:

- Approval vs rejection rates
- Violation trends over time
- Most violated rules
- Export to CSV for reporting

![Metrics Demo](assets/gifs/03-metrics.gif)

Run: `Guardrail: Show Metrics Dashboard`

**Data-driven insights for engineering leadership.**

---

### 4. Audit — Log Everything

Every action is logged:

- Rule violations detected
- Approvals and rejections
- Rule changes (when rules.yaml is updated via approval)

![Audit Demo](assets/gifs/04-audit.gif)

Run: `Guardrail: View Logs`

**Full accountability. Complete audit trail.**

---

## For Engineering Managers

**"How do I govern AI code generation at scale?"**

| Challenge | How Guardr41l Helps |
|-----------|---------------------|
| AI adds unexpected dependencies | **Dependency rules** — allowlist/blocklist packages |
| PRs exploding in size | **Threshold rules** — cap lines/files changed |
| AI touches files it shouldn't | **Scope rules** — restrict to specific files/functions |
| No visibility into AI impact | **Metrics dashboard** — track trends over time |
| Compliance requirements | **Audit logs** — who approved what, when |

### Team Workflow

1. **Define once** — Create `rules.yaml` with your team's standards
2. **Commit to repo** — Everyone follows the same guardrails
3. **Enforce everywhere** — VS Code extension + CI/CD integration
4. **Adapt over time** — Rules evolve as your team learns

### CI/CD Integration

Gate PRs before they're opened:

```yaml
# GitHub Actions
- name: Check AI code changes
  run: npx llm-guardr41l check --staged

- name: Upload to GitHub Code Scanning
  uses: github/codeql-action/upload-sarif@v2
  with:
    sarif_file: results.sarif
```

---

## For Developers

**"I want to move fast without breaking things."**

LLM Guardr41l lets you vibe with AI tools while staying safe:

| Pain Point | Solution |
|------------|----------|
| "AI changed files I didn't touch" | Real-time detection catches it immediately |
| "Who imported this random package?" | Dependency rules block unauthorized imports |
| "My PR is 300+ lines and I don't know why" | Threshold rules keep changes focused |
| "I approved something by mistake" | One-click reject to revert instantly |

### Works With Any AI Tool

- GitHub Copilot
- Cursor
- Claude
- ChatGPT pastes
- Autonomous agents

**No API interception. No vendor lock-in. Your code stays local.**

---

## Quick Start

**1. Install the extension**

```
ext install llm-guardr41l.llm-guardr41l
```

Or search "LLM Guardr41l" in VS Code Extensions.

**2. Create `rules.yaml` in your project root**

```yaml
rules:
  - type: dependencies
    forbidden:
      - moment
      - jquery

  - type: content
    forbid:
      - console.log
      - debugger

  - type: threshold
    max_lines_changed: 50
    require_approval: true

global:
  require_approval_for_all: true
```

**3. Start coding.** Violations are caught automatically.

---

## Presets

Don't write rules from scratch. Pick an opinionated preset:

| Preset | Best For | Description |
|--------|----------|-------------|
| **[safe-default](rules-examples/safe-default.yaml)** | Most teams | Balanced guardrails. **Start here.** |
| **[no-surprises](rules-examples/no-surprises.yaml)** | Scope control | Prevent AI from touching unexpected files |
| **[dependency-lockdown](rules-examples/dependency-lockdown.yaml)** | Enterprise | All new dependencies blocked by default |
| **[enterprise-safe](rules-examples/enterprise-safe.yaml)** | SOC2, HIPAA, PCI | Full audit trail, compliance patterns |

```bash
# Download a preset
curl -o rules.yaml https://raw.githubusercontent.com/Anggi-Permana-Harianja/llm-guardr41l/main/rules-examples/safe-default.yaml
```

---

## Rule Types

| Type | What It Controls | Example |
|------|------------------|---------|
| **Dependencies** | Allowed/forbidden packages | Block `moment`, allow `date-fns` |
| **Content** | Forbidden patterns | No `console.log`, no `eval` |
| **Threshold** | Change size limits | Max 100 lines, max 5 files |
| **Scope** | Which files can be modified | Only `src/feature.ts` |
| **Refactor** | Unwanted code changes | Block variable renames |

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
# Check staged changes
guardrail check --staged

# Check a specific commit
guardrail check --commit <sha>

# Initialize rules
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

**From Marketplace:**
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

## Why Open Source?

LLM Guardr41l is fully open source (MIT).

- **Audit it** — See exactly what it does
- **Extend it** — Add rules for your use case
- **Self-host it** — No data leaves your machine

---

## Roadmap

- [x] Core rule engine
- [x] Real-time monitoring
- [x] Approve and update rules
- [x] Metrics dashboard
- [x] Audit logging
- [x] CLI for CI/CD
- [x] SARIF output for GitHub
- [ ] JetBrains port (help wanted!)
- [ ] Neovim plugin

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)

---

<div align="center">

**Governance for the AI-assisted coding era.**

[Install from Marketplace](https://marketplace.visualstudio.com/items?itemName=llm-guardr41l.llm-guardr41l) · [GitHub](https://github.com/Anggi-Permana-Harianja/llm-guardr41l)

</div>
