<div align="center">

# LLM Guardr41l

**Stop AI coding assistants from breaking your code.**

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/llm-guardr41l.llm-guardr41l?label=VS%20Code%20Marketplace&logo=visualstudiocode&color=blue)](https://marketplace.visualstudio.com/items?itemName=llm-guardr41l.llm-guardr41l)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/llm-guardr41l.llm-guardr41l?logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=llm-guardr41l.llm-guardr41l)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/AE-Hertz/llm-guardr41l/actions/workflows/ci.yml/badge.svg)](https://github.com/AE-Hertz/llm-guardr41l/actions/workflows/ci.yml)

[Install from Marketplace](https://marketplace.visualstudio.com/items?itemName=llm-guardr41l.llm-guardr41l) · [Documentation](#usage) · [Contributing](CONTRIBUTING.md) · [Changelog](CHANGELOG.md)

</div>

---

## The Problem

AI coding assistants are powerful — but unpredictable. Copilot adds `console.log` everywhere. Claude refactors your variable names. Cursor imports packages you've banned. Autonomous agents rewrite entire files.

**LLM Guardr41l acts as a bouncer for your code.** Define rules once, enforce them automatically on every AI-generated change.

> **No API key required!** LLM Guardr41l monitors code changes from any source — GitHub Copilot, Claude, Cursor, ChatGPT pastes, or any other AI tool. It works by watching your editor for changes, not by intercepting API calls. API keys are only needed for the optional "Generate Code" feature.

<!--
## Demo

TODO: Add GIFs here
![Rule violation detected](docs/assets/violation-demo.gif)
-->

## Quick Start

**1. Install the extension**

```
ext install llm-guardr41l.llm-guardr41l
```

Or search "LLM Guardr41l" in VS Code Extensions.

**2. Create `rules.yaml` in your project root**

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

**3. That's it.** LLM Guardr41l now monitors all code changes and enforces your rules.

---

## Features

### Core Features
- **Real-time Change Monitoring**: Automatically detects code changes from any source (Copilot, Claude Code, Cursor, ChatGPT pastes, etc.) and validates them against your rules
- **Rule Configuration**: Define rules in a `rules.yaml` file to control how LLMs can modify your code
- **Prompt Guardrails**: Automatically inject rule directives into LLM prompts
- **LLM Proxy**: Support for OpenAI and Anthropic APIs with rule-aware code generation
- **Diff Validation**: Compare original vs. generated code and flag rule violations
- **UI Preview**: Visual diff preview with highlighted changes and approval workflow
- **Auto-Revert**: Automatically revert rejected changes to maintain code integrity
- **Logging**: Track all LLM interactions and approvals in a JSON log file

### v0.2.0 Features
- **Inline Diagnostics**: Violations appear as squiggly underlines in the editor and in the Problems panel — no more intrusive popups
- **Metrics Dashboard**: View approval rates, violation trends, and top violated rules in an interactive dashboard
- **Project-Aware Defaults**: Auto-scan your project's `package.json`, `.eslintrc`, and `tsconfig.json` to generate smart rules
- **Learn from Rejections**: The extension tracks rejection patterns and suggests new rules after repeated rejections

### v0.3.0 Features
- **Quick Fix Actions**: Click the lightbulb on any violation to add dependencies to allowlist, remove from forbidden list, adjust thresholds, or dismiss violations
- **Per-folder Rule Overrides**: Create `.llm-guardrail.yaml` files in subdirectories to extend, replace, or disable rules for specific parts of your codebase
- **Undo Rejection**: Accidentally rejected a change? Use `Guardrail: Undo Last Rejection` to restore it

---

## Installation

**From VS Code Marketplace (Recommended):**
1. Open VS Code
2. Go to Extensions (Cmd+Shift+X or Ctrl+Shift+X)
3. Search for "LLM Guardr41l"
4. Click Install

**From Source:**
```bash
git clone https://github.com/AE-Hertz/llm-guardr41l.git
cd llm-guardr41l
npm install
npm run package
# Install the generated .vsix file via Extensions > ... > Install from VSIX
```

---

## Configuration

### API Keys

Set your API keys in VS Code settings:

1. Open VS Code Settings (`Cmd+,` or `Ctrl+,`)
2. Search for "LLM Guardrail"
3. Enter your API key:
   - `llm-guardrail.openaiApiKey`: Your OpenAI API key
   - `llm-guardrail.anthropicApiKey`: Your Anthropic API key

Or set them as environment variables:
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`

### Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `llm-guardrail.provider` | `openai` | LLM provider (`openai` or `anthropic`) |
| `llm-guardrail.model` | `gpt-4o` | Model to use |
| `llm-guardrail.openaiApiKey` | | OpenAI API key |
| `llm-guardrail.anthropicApiKey` | | Anthropic API key |
| `llm-guardrail.logPath` | `.llm-guardrail/logs.json` | Path to log file |
| `llm-guardrail.monitorEnabled` | `true` | Enable automatic monitoring of code changes |
| `llm-guardrail.monitorMinLines` | `3` | Minimum lines changed to trigger review |
| `llm-guardrail.monitorMinChars` | `50` | Minimum characters changed to trigger review |
| `llm-guardrail.monitorDebounceMs` | `500` | Debounce delay before processing changes |
| `llm-guardrail.monitorAutoRevert` | `true` | Auto-revert changes when rejected |
| `llm-guardrail.monitorIgnoredPatterns` | `["*.md", "*.json", ...]` | File patterns to ignore |
| `llm-guardrail.suggestionThreshold` | `3` | Number of rejections before suggesting a new rule |
| `llm-guardrail.dashboardPeriodDays` | `30` | Default time period for the metrics dashboard |

### Rules Configuration

Create a `rules.yaml` file in your project root to define guardrails:

```yaml
rules:
  # Scope isolation - restrict changes to specific files/functions
  - type: scope
    description: "Only modify the authentication module"
    files: ["src/auth/*.ts"]
    functions: ["login", "logout", "validateToken"]

  # Refactoring restrictions
  - type: refactor
    description: "Prevent unwanted refactoring"
    forbid:
      - variable_renames
      - add_error_handling
      - add_comments
      - change_formatting

  # Dependency management
  - type: dependencies
    description: "Limit dependencies"
    allowed:
      - lodash
      - axios
      - express
    forbidden:
      - moment  # Use date-fns instead

  # Content filters
  - type: content
    description: "Content restrictions"
    forbid:
      - console.log
      - debugger
    patterns:
      deny:
        - "eval\\("
        - "Function\\("

  # Change thresholds
  - type: threshold
    description: "Limit change scope"
    max_lines_changed: 50
    require_approval: true

# Global settings
global:
  require_approval_for_all: true
  log_all_interactions: true
  strict_mode: false
```

---

## Usage

### Automatic Change Monitoring (Recommended)

The extension automatically monitors code changes in real-time. When you use **any AI coding tool** (Copilot, Claude Code, Cursor, or even paste from ChatGPT), the guardrail will:

1. Detect significant code changes (configurable threshold)
2. Validate changes against your `rules.yaml`
3. Show a notification with options:
   - **Review**: Open full diff preview panel
   - **Approve**: Accept the changes
   - **Reject**: Revert to original code

The status bar shows `$(shield) Guardrail: ON` when monitoring is active. Click it or use `Guardrail: Toggle Monitor` to enable/disable.

### Generate Code with Guardrails

For direct LLM code generation with built-in guardrails:

1. Open a file in VS Code
2. Optionally select the code you want to modify
3. Run the command: `Guardrail: Generate Code` (Cmd+Shift+P or Ctrl+Shift+P)
4. Enter your prompt describing what you want the LLM to do
5. Review the diff preview showing:
   - Changes highlighted (green for additions, red for removals)
   - Any rule violations detected
   - Statistics on lines changed
6. Click "Approve & Apply" to apply the changes, or "Reject" to discard

### Commands

| Command | Description |
|---------|-------------|
| `Guardrail: Generate Code` | Generate code with LLM and guardrails |
| `Guardrail: Toggle Monitor` | Enable/disable automatic change monitoring |
| `Guardrail: Approve Current Change` | Approve pending monitored change |
| `Guardrail: Reject Current Change` | Reject and revert pending change |
| `Guardrail: Undo Last Rejection` | Restore the most recently rejected change |
| `Guardrail: Edit Rules` | Open or create rules.yaml |
| `Guardrail: Generate Rules` | Interactively generate rules from templates |
| `Guardrail: Create Local Override File` | Create a `.llm-guardrail.yaml` override in current folder |
| `Guardrail: Scan Project & Generate Rules` | Auto-generate rules from project config |
| `Guardrail: Show Metrics Dashboard` | View violation statistics and trends |
| `Guardrail: Show Problems Panel` | Open VS Code Problems panel |
| `Guardrail: View Logs` | View interaction history |

---

## Rule Types

### Scope Rules
Restrict changes to specific files, functions, or patterns:

```yaml
- type: scope
  description: "Isolate to feature B"
  files: ["features.py", "src/features/*.ts"]
  functions: ["addFeatureB", "updateFeature"]
  pattern: "class FeatureB"
```

### Refactor Rules
Prevent unwanted refactoring:

```yaml
- type: refactor
  forbid:
    - variable_renames      # Don't rename variables
    - add_error_handling    # Don't add try/catch
    - add_comments          # Don't add comments
    - change_formatting     # Don't reformat code
```

### Dependencies Rules
Control which packages can be used:

```yaml
- type: dependencies
  allowed:
    - lodash
    - axios
  forbidden:
    - moment
    - jquery
```

### Content Rules
Require or forbid certain content:

```yaml
- type: content
  require: "use_existing_patterns_only"
  forbid:
    - console.log
    - debugger
    - alert
  patterns:
    deny:
      - "eval\\("
      - "innerHTML"
```

### Threshold Rules
Limit the scope of changes:

```yaml
- type: threshold
  max_lines_changed: 50
  max_files_changed: 3
  require_approval: true
```

---

## Inline Diagnostics

Violations now appear directly in your editor as squiggly underlines, just like TypeScript or ESLint errors. No more disruptive popups!

- **Error violations** (red squiggles): Forbidden dependencies, forbidden content, scope violations
- **Warning violations** (yellow squiggles): Unsolicited comments, possible refactoring, threshold warnings

The status bar shows the current violation count. Click on any violation in the Problems panel to jump to the affected line.

## Metrics Dashboard

Run `Guardrail: Show Metrics Dashboard` to view:

- **Summary cards**: Total interactions, violations caught, approval/rejection rates
- **Trend chart**: Violations over time
- **Top violated rules**: Most frequently triggered rules
- **Period selector**: View data for 7, 30, or 90 days
- **Export**: Download metrics as CSV

## Project Scanner

Run `Guardrail: Scan Project & Generate Rules` to automatically generate rules based on your project configuration:

- **package.json**: Extracts existing dependencies to create an allowed dependencies list
- **.eslintrc**: Detects ESLint rules like `no-console`, `no-debugger`, `no-eval` and converts them to content rules
- **tsconfig.json**: Extracts include/exclude patterns for scope rules

This gives you a smart starting point instead of writing rules from scratch.

## Learning from Rejections

The extension tracks patterns in rejected changes. After you reject 3+ changes with similar patterns (configurable via `suggestionThreshold`), it will suggest adding a new rule:

- **Content patterns**: Detects repeated use of `console.log`, `debugger`, etc.
- **Dependency patterns**: Detects repeated unauthorized imports
- **Refactoring patterns**: Detects repeated unsolicited error handling or comments

When suggestions are available, you'll see a notification with the option to review and add them to your rules.

## Quick Fix Actions

When a violation is detected, click the lightbulb icon (or press `Cmd+.` / `Ctrl+.`) to see available quick fixes:

- **Dependency violations**: "Add X to allowed dependencies" or "Remove X from forbidden list"
- **Content violations**: "Allow X in content rules"
- **Refactor violations**: "Allow variable_renames in refactor rules"
- **Scope violations**: "Add filename.ts to allowed files"
- **Threshold violations**: "Increase max_lines_changed to N"
- **All violations**: "Dismiss this violation" (for this session only)

Quick fixes automatically update your `rules.yaml` file.

## Per-folder Rule Overrides

Create `.llm-guardrail.yaml` files in subdirectories to customize rules for specific parts of your codebase. Override files are applied hierarchically from the workspace root to the file's directory.

```yaml
# .llm-guardrail.yaml in src/tests/
# Allow console.log in test files

# Set to true to completely replace parent rules (default: false = merge)
replace: false

# Disable specific rules by type or description keyword
disable:
  - content           # Disable all content rules in this folder

# Additional rules for this directory
rules:
  - type: content
    description: "Test-specific content rules"
    forbid: []        # Allow everything

# Override global settings
global:
  require_approval_for_all: false
```

Use `Guardrail: Create Local Override File` to generate a template in the current folder.

## Undo Rejection

If you accidentally reject a change, use `Guardrail: Undo Last Rejection` to restore it. The extension keeps a history of the last 10 rejections, so you can recover recent changes even if you've made other edits since.

## Logging

All interactions are logged to `.llm-guardrail/logs.json` in your workspace:

```json
{
  "version": "1.0",
  "entries": [
    {
      "timestamp": "2024-01-15T10:30:00.000Z",
      "id": "1705312200000-abc123",
      "action": "generate",
      "prompt": "Add input validation",
      "violations": [],
      "rules": { ... },
      "metadata": {
        "fileName": "utils.ts",
        "model": "gpt-4o",
        "tokensUsed": 1500,
        "approved": true,
        "linesChanged": 12
      }
    }
  ]
}
```

---

## Roadmap

- [x] Core rule engine (v0.1)
- [x] Metrics dashboard (v0.2)
- [x] Quick fixes & per-folder overrides (v0.3)
- [ ] JetBrains port (help wanted!)
- [ ] Neovim plugin
- [ ] CLI tool for CI/CD
- [ ] Team/enterprise features

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

**Good first issues:**
- Improve error messages
- Add more rule examples to docs
- Expand test coverage

## Security

For security issues, please see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)

---

<div align="center">

**[Star us on GitHub](https://github.com/AE-Hertz/llm-guardr41l)** — it helps others discover the project!

Made with care for the AI-assisted coding era.

</div>
