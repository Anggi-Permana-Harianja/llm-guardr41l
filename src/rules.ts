import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

export type RuleType = 'scope' | 'refactor' | 'dependencies' | 'content' | 'threshold';

export interface ScopeRule {
  type: 'scope';
  description: string;
  pattern?: string;
  files?: string[];
  functions?: string[];
}

export interface RefactorRule {
  type: 'refactor';
  description?: string;
  forbid: string[];
}

export interface DependenciesRule {
  type: 'dependencies';
  description?: string;
  allowed?: string[];
  forbidden?: string[];
}

export interface ContentRule {
  type: 'content';
  description?: string;
  require?: string;
  forbid?: string[];
  patterns?: {
    allow?: string[];
    deny?: string[];
  };
}

export interface ThresholdRule {
  type: 'threshold';
  description?: string;
  max_lines_changed?: number;
  max_files_changed?: number;
  require_approval: boolean;
}

export type Rule = ScopeRule | RefactorRule | DependenciesRule | ContentRule | ThresholdRule;

export interface RulesConfig {
  rules: Rule[];
  global?: {
    require_approval_for_all?: boolean;
    log_all_interactions?: boolean;
    strict_mode?: boolean;
  };
}

const DEFAULT_RULES: RulesConfig = {
  rules: [],
  global: {
    require_approval_for_all: true,
    log_all_interactions: true,
    strict_mode: false
  }
};

export function getRulesFilePath(): string | undefined {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return undefined;
  }
  return path.join(workspaceFolders[0].uri.fsPath, 'rules.yaml');
}

export async function loadRules(): Promise<RulesConfig> {
  const rulesPath = getRulesFilePath();

  if (!rulesPath) {
    vscode.window.showWarningMessage('No workspace folder open. Using default rules.');
    return DEFAULT_RULES;
  }

  try {
    if (!fs.existsSync(rulesPath)) {
      return DEFAULT_RULES;
    }

    const fileContent = fs.readFileSync(rulesPath, 'utf8');
    const parsed = yaml.load(fileContent) as RulesConfig;

    if (!parsed || !parsed.rules) {
      return DEFAULT_RULES;
    }

    return {
      ...DEFAULT_RULES,
      ...parsed,
      global: {
        ...DEFAULT_RULES.global,
        ...(parsed.global || {})
      }
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    vscode.window.showErrorMessage(`Failed to load rules.yaml: ${errorMessage}`);
    return DEFAULT_RULES;
  }
}

export function generatePromptDirectives(rules: RulesConfig): string {
  if (rules.rules.length === 0) {
    return '';
  }

  const directives: string[] = [
    '=== IMPORTANT: CODE GENERATION RULES ===',
    'You MUST follow these rules strictly when generating or modifying code:',
    ''
  ];

  let ruleNumber = 1;

  for (const rule of rules.rules) {
    switch (rule.type) {
      case 'scope':
        directives.push(`${ruleNumber}. SCOPE RESTRICTION${rule.description ? ` - ${rule.description}` : ''}:`);
        if (rule.files && rule.files.length > 0) {
          directives.push(`   - Only modify these files: ${rule.files.join(', ')}`);
        }
        if (rule.pattern) {
          directives.push(`   - Only modify code matching pattern: "${rule.pattern}"`);
        }
        if (rule.functions && rule.functions.length > 0) {
          directives.push(`   - Only modify these functions: ${rule.functions.join(', ')}`);
        }
        directives.push('   - Do NOT modify any code outside the specified scope');
        break;

      case 'refactor':
        directives.push(`${ruleNumber}. REFACTORING RESTRICTIONS${rule.description ? ` - ${rule.description}` : ''}:`);
        if (rule.forbid && rule.forbid.length > 0) {
          directives.push(`   - Do NOT perform these refactoring actions: ${rule.forbid.join(', ')}`);
        }
        directives.push('   - Keep existing code structure unless explicitly requested');
        break;

      case 'dependencies':
        directives.push(`${ruleNumber}. DEPENDENCY RULES${rule.description ? ` - ${rule.description}` : ''}:`);
        if (rule.allowed && rule.allowed.length > 0) {
          directives.push(`   - Only use these dependencies: ${rule.allowed.join(', ')}`);
        }
        if (rule.forbidden && rule.forbidden.length > 0) {
          directives.push(`   - Do NOT use these dependencies: ${rule.forbidden.join(', ')}`);
        }
        directives.push('   - Do NOT add any new import statements for packages not in the allowed list');
        break;

      case 'content':
        directives.push(`${ruleNumber}. CONTENT RULES${rule.description ? ` - ${rule.description}` : ''}:`);
        if (rule.require) {
          directives.push(`   - Content requirement: ${rule.require}`);
        }
        if (rule.forbid && rule.forbid.length > 0) {
          directives.push(`   - Forbidden content: ${rule.forbid.join(', ')}`);
        }
        if (rule.patterns) {
          if (rule.patterns.allow && rule.patterns.allow.length > 0) {
            directives.push(`   - Allowed patterns: ${rule.patterns.allow.join(', ')}`);
          }
          if (rule.patterns.deny && rule.patterns.deny.length > 0) {
            directives.push(`   - Denied patterns: ${rule.patterns.deny.join(', ')}`);
          }
        }
        break;

      case 'threshold':
        directives.push(`${ruleNumber}. CHANGE THRESHOLDS${rule.description ? ` - ${rule.description}` : ''}:`);
        if (rule.max_lines_changed !== undefined) {
          directives.push(`   - Maximum lines that can be changed: ${rule.max_lines_changed}`);
        }
        if (rule.max_files_changed !== undefined) {
          directives.push(`   - Maximum files that can be changed: ${rule.max_files_changed}`);
        }
        directives.push('   - Keep changes minimal and focused');
        break;
    }
    ruleNumber++;
    directives.push('');
  }

  directives.push('=== END OF RULES ===');
  directives.push('');

  return directives.join('\n');
}

export async function createDefaultRulesFile(): Promise<void> {
  const rulesPath = getRulesFilePath();

  if (!rulesPath) {
    vscode.window.showErrorMessage('No workspace folder open.');
    return;
  }

  const defaultContent = `# LLM Guardrail Rules Configuration
# Define rules to control how LLMs modify your code

rules:
  # Scope isolation - restrict changes to specific files/functions
  - type: scope
    description: "Example: Isolate changes to specific feature"
    files: ["src/feature.ts"]
    functions: ["myFunction"]
    # pattern: "class MyClass"

  # Refactoring restrictions - prevent unwanted refactoring
  - type: refactor
    description: "Prevent unwanted refactoring"
    forbid:
      - variable_renames
      - add_error_handling
      - add_comments
      - change_formatting

  # Dependency management - control which packages can be used
  - type: dependencies
    description: "Limit allowed dependencies"
    allowed:
      - lodash
      - axios
    forbidden:
      - moment  # Use date-fns instead

  # Content filters - require or forbid certain content
  - type: content
    description: "Content restrictions"
    require: "use_existing_patterns_only"
    forbid:
      - console.log
      - debugger
    patterns:
      deny:
        - "eval\\\\("
        - "Function\\\\("

  # Change thresholds - limit the scope of changes
  - type: threshold
    description: "Limit change scope"
    max_lines_changed: 50
    max_files_changed: 3
    require_approval: true

# Global settings
global:
  require_approval_for_all: true
  log_all_interactions: true
  strict_mode: false
`;

  try {
    fs.writeFileSync(rulesPath, defaultContent, 'utf8');
    const document = await vscode.workspace.openTextDocument(rulesPath);
    await vscode.window.showTextDocument(document);
    vscode.window.showInformationMessage('Created rules.yaml with example configuration.');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    vscode.window.showErrorMessage(`Failed to create rules.yaml: ${errorMessage}`);
  }
}

export interface RuleTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
}

export const RULE_TEMPLATES: RuleTemplate[] = [
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Basic rules: threshold limits and console.log prevention',
    content: `# LLM Guardrail Rules - Minimal Configuration
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
`
  },
  {
    id: 'standard',
    name: 'Standard',
    description: 'Common rules: dependencies, content filters, refactoring limits',
    content: `# LLM Guardrail Rules - Standard Configuration
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
`
  },
  {
    id: 'strict',
    name: 'Strict',
    description: 'Strict rules: all protections enabled with tight limits',
    content: `# LLM Guardrail Rules - Strict Configuration
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
  },
  {
    id: 'custom',
    name: 'Custom',
    description: 'Start with a blank template and add your own rules',
    content: `# LLM Guardrail Rules - Custom Configuration
# Add your own rules below

rules:
  # Example: Restrict to specific files
  # - type: scope
  #   description: "Only modify specific files"
  #   files: ["src/myfile.ts"]

  # Example: Forbid certain dependencies
  # - type: dependencies
  #   forbidden:
  #     - some-package

  # Example: Prevent certain content
  # - type: content
  #   forbid:
  #     - console.log

  # Example: Limit change size
  - type: threshold
    max_lines_changed: 50
    require_approval: true

global:
  require_approval_for_all: true
  log_all_interactions: true
`
  }
];

export async function generateRulesInteractive(): Promise<void> {
  const rulesPath = getRulesFilePath();

  if (!rulesPath) {
    vscode.window.showErrorMessage('No workspace folder open. Please open a folder first.');
    return;
  }

  // Check if rules.yaml already exists
  if (fs.existsSync(rulesPath)) {
    const overwrite = await vscode.window.showWarningMessage(
      'rules.yaml already exists. Do you want to replace it?',
      'Replace',
      'Open Existing',
      'Cancel'
    );

    if (overwrite === 'Open Existing') {
      const document = await vscode.workspace.openTextDocument(rulesPath);
      await vscode.window.showTextDocument(document);
      return;
    }

    if (overwrite !== 'Replace') {
      return;
    }
  }

  // Show template picker
  const templateItems = RULE_TEMPLATES.map(t => ({
    label: t.name,
    description: t.description,
    template: t
  }));

  const selected = await vscode.window.showQuickPick(templateItems, {
    placeHolder: 'Select a rules template',
    title: 'Guardrail: Generate Rules'
  });

  if (!selected) {
    return;
  }

  try {
    fs.writeFileSync(rulesPath, selected.template.content, 'utf8');
    const document = await vscode.workspace.openTextDocument(rulesPath);
    await vscode.window.showTextDocument(document);
    vscode.window.showInformationMessage(
      `Created rules.yaml with "${selected.template.name}" template. Edit to customize your guardrails.`
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    vscode.window.showErrorMessage(`Failed to create rules.yaml: ${errorMessage}`);
  }
}

export function rulesFileExists(): boolean {
  const rulesPath = getRulesFilePath();
  return rulesPath ? fs.existsSync(rulesPath) : false;
}

export function validateRulesConfig(config: unknown): config is RulesConfig {
  if (typeof config !== 'object' || config === null) {
    return false;
  }

  const obj = config as Record<string, unknown>;

  if (!Array.isArray(obj.rules)) {
    return false;
  }

  for (const rule of obj.rules) {
    if (typeof rule !== 'object' || rule === null) {
      return false;
    }

    const ruleObj = rule as Record<string, unknown>;

    if (!['scope', 'refactor', 'dependencies', 'content', 'threshold'].includes(ruleObj.type as string)) {
      return false;
    }
  }

  return true;
}
