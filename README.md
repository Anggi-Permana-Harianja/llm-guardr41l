# LLM Guardr41l

A VS Code extension that prevents LLMs from making unsolicited changes to your codebase by enforcing user-defined rules, injecting guardrails into prompts, validating outputs with diffs, and requiring approvals for changes.

## Features

- **Real-time Change Monitoring**: Automatically detects code changes from any source (Copilot, Claude Code, Cursor, ChatGPT pastes, etc.) and validates them against your rules
- **Rule Configuration**: Define rules in a `rules.yaml` file to control how LLMs can modify your code
- **Prompt Guardrails**: Automatically inject rule directives into LLM prompts
- **LLM Proxy**: Support for OpenAI and Anthropic APIs with rule-aware code generation
- **Diff Validation**: Compare original vs. generated code and flag rule violations
- **UI Preview**: Visual diff preview with highlighted changes and approval workflow
- **Auto-Revert**: Automatically revert rejected changes to maintain code integrity
- **Logging**: Track all LLM interactions and approvals in a JSON log file

## Installation

**From VS Code Marketplace (Recommended):**
1. Open VS Code
2. Go to Extensions (Cmd+Shift+X or Ctrl+Shift+X)
3. Search for "LLM Guardr41l"
4. Click Install

**From VSIX file:**
1. Download the `.vsix` file
2. In VS Code, go to Extensions
3. Click the `...` menu → "Install from VSIX..."
4. Select the downloaded file

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
| `Guardrail: Edit Rules` | Open or create rules.yaml |
| `Guardrail: View Logs` | View interaction history |

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

## License

MIT
