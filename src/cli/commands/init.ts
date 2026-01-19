/**
 * init command - initialize guardrails in a project
 */

import * as fs from 'fs';
import * as path from 'path';

export interface InitOptions {
  template?: 'minimal' | 'standard' | 'strict';
  force?: boolean;
}

const TEMPLATES = {
  minimal: `# LLM Guardrail Rules - Minimal Configuration
rules:
  - type: content
    description: "Prevent debug code"
    forbid:
      - console.log
      - debugger

  - type: threshold
    description: "Limit change scope"
    max_lines_changed: 30
    require_approval: true

global:
  require_approval_for_all: true
  log_all_interactions: true
`,

  standard: `# LLM Guardrail Rules - Standard Configuration
rules:
  - type: dependencies
    description: "Control dependencies"
    forbidden:
      - moment
      - jquery

  - type: content
    description: "Prevent debug and unsafe code"
    forbid:
      - console.log
      - debugger
      - alert
    patterns:
      deny:
        - "eval\\\\("
        - "Function\\\\("

  - type: refactor
    description: "Prevent unwanted refactoring"
    forbid:
      - variable_renames
      - add_error_handling

  - type: threshold
    description: "Limit change scope"
    max_lines_changed: 50
    require_approval: true

global:
  require_approval_for_all: true
  log_all_interactions: true
`,

  strict: `# LLM Guardrail Rules - Strict Configuration
rules:
  - type: dependencies
    description: "Strict dependency control"
    forbidden:
      - moment
      - jquery
      - underscore
      - lodash

  - type: content
    description: "Strict content rules"
    forbid:
      - console.log
      - console.debug
      - console.warn
      - debugger
      - alert
      - TODO
      - FIXME
      - HACK
    patterns:
      deny:
        - "eval\\\\("
        - "Function\\\\("
        - "innerHTML"
        - "document\\\\.write"

  - type: refactor
    description: "No refactoring allowed"
    forbid:
      - variable_renames
      - add_error_handling
      - add_comments
      - change_formatting

  - type: threshold
    description: "Tight change limits"
    max_lines_changed: 20
    require_approval: true

global:
  require_approval_for_all: true
  log_all_interactions: true
  strict_mode: true
`
};

export async function init(options: InitOptions): Promise<number> {
  const rulesPath = path.join(process.cwd(), 'rules.yaml');

  // Check if rules.yaml already exists
  if (fs.existsSync(rulesPath) && !options.force) {
    console.error('Error: rules.yaml already exists. Use --force to overwrite.');
    return 1;
  }

  const template = options.template || 'standard';
  const content = TEMPLATES[template];

  if (!content) {
    console.error(`Error: Unknown template "${template}". Use: minimal, standard, or strict`);
    return 1;
  }

  try {
    fs.writeFileSync(rulesPath, content, 'utf8');
    console.log(`✓ Created rules.yaml with "${template}" template`);
    console.log('');
    console.log('Next steps:');
    console.log('  1. Edit rules.yaml to customize your guardrails');
    console.log('  2. Run "guardrail check --staged" before committing');
    console.log('  3. Add to your CI pipeline for automated checks');
    console.log('');
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error: Failed to create rules.yaml: ${message}`);
    return 1;
  }
}
