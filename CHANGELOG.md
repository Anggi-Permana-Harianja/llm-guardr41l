# Changelog

All notable changes to LLM Guardr41l will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] - 2026-01-19

### Added
- **CLI Tool** - Command-line interface for CI/CD integration
  - `guardrail init` - Initialize rules.yaml with templates (minimal, standard, strict)
  - `guardrail check --staged` - Validate git staged changes
  - `guardrail check --commit <sha>` - Validate specific commits
  - `guardrail validate` - Compare two files against rules
- **Multiple Output Formats**
  - Text (human-readable with colors)
  - JSON (for programmatic use)
  - SARIF (for GitHub Code Scanning integration)
- **Core Module Extraction** - Shared validation logic between CLI and extension
- Pre-commit hook support
- GitHub Actions / GitLab CI integration examples

### Changed
- Refactored validation logic into reusable `src/core/` module
- Updated README with CLI documentation

## [0.4.0] - 2026-01-19

### Added
- **Open Source Release** - Project is now MIT licensed and open for contributions
- CONTRIBUTING.md with development setup and guidelines
- SECURITY.md with vulnerability reporting policy
- CHANGELOG.md for version history
- GitHub Actions CI workflow for automated testing
- Issue and PR templates for better community contributions

### Changed
- Updated README with badges, improved structure, and Quick Start guide
- Added repository, bugs, and homepage links to package.json

## [0.3.0] - 2025-01-17

### Added
- **Quick Fix Actions** - Lightbulb menu with one-click fixes:
  - Add/remove dependencies from allowed/forbidden lists
  - Adjust threshold values
  - Dismiss violations for current session
- **Per-Folder Rule Overrides** - Create `.llm-guardrail.yaml` in subdirectories to customize rules per folder
  - Support for merge or replace modes
  - Disable specific rules in certain directories
- **Undo Rejection** - Recover from accidental rejections
  - Stores last 10 rejected changes
  - Quick command to restore previous state

### Changed
- Improved violation messages with more context
- Better performance for large file diffs

## [0.2.0] - 2025-01-14

### Added
- **Inline Diagnostics** - VS Code native integration
  - Squiggly underlines (red for errors, yellow for warnings)
  - Problems panel integration
  - No more disruptive popup notifications
- **Metrics Dashboard** - Interactive analytics webview
  - Approval/rejection rates over time
  - Violation trends and patterns
  - Top violated rules breakdown
  - Configurable time periods (7/30/90 days)
- **Project Scanner** - Auto-generate rules from your project
  - Scans `package.json` for dependencies
  - Parses `.eslintrc` for existing rules
  - Extracts patterns from `tsconfig.json`
- **Rejection Pattern Learning** - Smart rule suggestions
  - Tracks rejection patterns
  - Suggests new rules after repeated rejections
  - Analyzes content, dependency, and refactoring patterns

### Changed
- Moved from popup notifications to inline diagnostics
- Improved diff algorithm accuracy

### Fixed
- Fixed issue with multi-file changes not being tracked correctly
- Fixed debounce timing for rapid edits

## [0.1.3] - 2025-01-10

### Fixed
- Fixed marketplace icon display
- Improved extension activation performance

## [0.1.0] - 2025-01-08

### Added
- **Initial Release**
- **Real-time Change Monitoring**
  - Detects changes from Copilot, Claude, Cursor, ChatGPT
  - Configurable thresholds (min lines, chars, debounce)
  - Document snapshots for accurate diffing
  - Ignored file patterns support
- **Rule-Based Validation** with 5 rule types:
  - **Scope Rules** - Restrict changes to specific files/functions
  - **Refactor Rules** - Prevent unwanted refactoring
  - **Dependency Rules** - Whitelist/blacklist imports
  - **Content Rules** - Forbid patterns (console.log, debugger, eval)
  - **Threshold Rules** - Limit change size
- **LLM Code Generation** with guardrails
  - OpenAI (GPT-4o) support
  - Anthropic (Claude 3.5 Sonnet) support
  - System prompt injection for rule awareness
- **Diff Preview UI**
  - React-based interactive diff viewer
  - Split and unified view modes
  - Approve/reject workflow
  - Auto-revert on rejection
- **Comprehensive Logging**
  - JSON log format
  - CSV export support
  - Tracks all interactions and violations

[0.5.0]: https://github.com/AE-Hertz/llm-guardr41l/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/AE-Hertz/llm-guardr41l/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/AE-Hertz/llm-guardr41l/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/AE-Hertz/llm-guardr41l/compare/v0.1.3...v0.2.0
[0.1.3]: https://github.com/AE-Hertz/llm-guardr41l/compare/v0.1.0...v0.1.3
[0.1.0]: https://github.com/AE-Hertz/llm-guardr41l/releases/tag/v0.1.0
