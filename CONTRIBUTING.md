# Contributing to LLM Guardr41l

First off, thanks for taking the time to contribute! This project aims to make AI-generated code safer for everyone.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## Getting Started

LLM Guardr41l is a VS Code extension built with TypeScript and React. The main components are:

- **Extension Host** (`src/extension.ts`) - Main entry point and command handlers
- **Change Monitor** (`src/change-monitor.ts`) - Detects code changes from any source
- **Rules Engine** (`src/rules.ts`) - Parses and manages YAML rules
- **Diff Validator** (`src/diff-validator.ts`) - Validates changes against rules
- **Webview UI** (`src/webview/`) - React-based diff preview interface

## Development Setup

### Prerequisites

- Node.js 18+
- npm 9+
- VS Code 1.85+
- Git

### Installation

1. Fork the repository on GitHub

2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/llm-guardr41l.git
   cd llm-guardr41l
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Open in VS Code:
   ```bash
   code .
   ```

5. Start the compiler in watch mode:
   ```bash
   npm run watch
   ```

6. Press `F5` to launch the Extension Development Host

### Project Structure

```
llm-guardr41l/
├── src/
│   ├── extension.ts          # Main extension entry
│   ├── change-monitor.ts     # Change detection
│   ├── rules.ts              # Rule parsing
│   ├── diff-validator.ts     # Validation logic
│   ├── llm-proxy.ts          # LLM API integration
│   ├── logger.ts             # Interaction logging
│   ├── diagnostics-manager.ts # VS Code diagnostics
│   ├── metrics-calculator.ts  # Analytics
│   ├── project-scanner.ts    # Auto-detection
│   ├── rejection-analyzer.ts # Pattern learning
│   ├── quick-fix-provider.ts # Quick actions
│   └── webview/              # React UI components
├── test/                     # Unit tests
├── rules.yaml.example        # Example configuration
└── package.json
```

## Making Changes

1. Create a new branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes following our [coding standards](#coding-standards)

3. Add tests for new functionality

4. Run the test suite:
   ```bash
   npm test
   ```

5. Run the linter:
   ```bash
   npm run lint
   ```

6. Commit your changes with a clear message:
   ```bash
   git commit -m "feat: add support for custom rule validators"
   ```

### Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation only
- `style:` - Code style (formatting, semicolons, etc.)
- `refactor:` - Code change that neither fixes a bug nor adds a feature
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

## Submitting a Pull Request

1. Push your branch to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

2. Open a Pull Request against `main`

3. Fill out the PR template completely

4. Wait for CI checks to pass

5. Request a review

### PR Checklist

- [ ] Tests pass (`npm test`)
- [ ] Linting passes (`npm run lint`)
- [ ] New features have tests
- [ ] Documentation updated if needed
- [ ] Commit messages follow conventional commits

## Coding Standards

- **TypeScript** - Use strict types, avoid `any` where possible
- **ESLint** - Follow the existing ESLint configuration
- **Formatting** - Use consistent indentation (tabs for this project)
- **Comments** - Add comments for complex logic, but prefer self-documenting code
- **Error Handling** - Always handle errors gracefully with user-friendly messages

### Code Style Examples

```typescript
// Good: Explicit types, clear naming
function validateRule(rule: Rule, diff: DiffResult): Violation[] {
  const violations: Violation[] = [];
  // ...
  return violations;
}

// Avoid: Implicit any, unclear naming
function validate(r, d) {
  const v = [];
  // ...
  return v;
}
```

## Testing

We use Jest for unit testing. Tests are located in the `test/` directory.

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run specific test file
npm test -- diff-validator.test.ts
```

### Writing Tests

- Place tests in `test/` directory
- Name test files `*.test.ts`
- Use descriptive test names
- Mock VS Code API using the provided mock in `test/__mocks__/vscode.ts`

Example:

```typescript
describe('DiffValidator', () => {
  it('should detect forbidden content patterns', () => {
    const rules = { rules: [{ type: 'content', forbid: ['console.log'] }] };
    const diff = { added: ['console.log("debug");'] };

    const violations = validateDiff(diff, rules);

    expect(violations).toHaveLength(1);
    expect(violations[0].type).toBe('content');
  });
});
```

## Reporting Bugs

Use the [Bug Report template](https://github.com/AE-Hertz/llm-guardr41l/issues/new?template=bug_report.md) and include:

- VS Code version
- Extension version
- Steps to reproduce
- Expected vs actual behavior
- Your `rules.yaml` (if relevant)
- Any error messages from the Output panel

## Suggesting Features

Use the [Feature Request template](https://github.com/AE-Hertz/llm-guardr41l/issues/new?template=feature_request.md) and include:

- Clear description of the feature
- Use case / problem it solves
- Proposed implementation (if you have ideas)

## Good First Issues

Looking for something to work on? Check out issues labeled [`good first issue`](https://github.com/AE-Hertz/llm-guardr41l/labels/good%20first%20issue).

## Questions?

- Open a [Discussion](https://github.com/AE-Hertz/llm-guardr41l/discussions) for general questions
- Check existing issues before opening new ones

---

Thank you for contributing to LLM Guardr41l!
