import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { logRuleUpdate, RuleUpdateDetail } from './logger';

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

/**
 * Add exceptions to rules based on violations that were approved.
 * This modifies the rules.yaml file to allow the patterns that were previously forbidden.
 */
export async function addExceptionsToRules(violations: Array<{
  rule: Rule;
  ruleType: string;
  description: string;
  details?: string;
}>, sourceFile?: string): Promise<boolean> {
  const rulesPath = getRulesFilePath();
  if (!rulesPath || !fs.existsSync(rulesPath)) {
    console.log('Guardrail: No rules.yaml found at', rulesPath);
    return false;
  }

  try {
    const fileContent = fs.readFileSync(rulesPath, 'utf8');
    const rules = yaml.load(fileContent) as RulesConfig;

    if (!rules || !rules.rules) {
      console.log('Guardrail: Invalid rules config');
      return false;
    }

    let modified = false;
    const ruleUpdates: RuleUpdateDetail[] = [];

    for (const violation of violations) {
      console.log('Guardrail: Processing violation:', violation.ruleType, violation.details);

      // Find matching rule by type only (JSON.stringify comparison is too strict)
      const matchingRules = rules.rules.filter(r => r.type === violation.ruleType);

      for (const rule of matchingRules) {
        // Handle different rule types
        if (rule.type === 'dependencies' && violation.details) {
          // Extract dependency name from: "The dependency "moment" is not in the allowed list" or "is in the forbidden list"
          const match = violation.details.match(/The dependency "([^"]+)"/);
          if (match) {
            const dep = match[1];
            console.log('Guardrail: Found dependency to allow:', dep);

            // Add to allowed list
            if (!rule.allowed) {
              rule.allowed = [];
            }
            if (!rule.allowed.includes(dep)) {
              rule.allowed.push(dep);
              modified = true;
              ruleUpdates.push({
                ruleType: 'dependencies',
                action: 'added_to_allowed',
                value: dep
              });
              console.log('Guardrail: Added to allowed list:', dep);
            }

            // Remove from forbidden list if present
            if (rule.forbidden) {
              const forbidIndex = rule.forbidden.indexOf(dep);
              if (forbidIndex !== -1) {
                rule.forbidden.splice(forbidIndex, 1);
                modified = true;
                ruleUpdates.push({
                  ruleType: 'dependencies',
                  action: 'removed_from_forbidden',
                  value: dep
                });
                console.log('Guardrail: Removed from forbidden list:', dep);
              }
            }
          }
        } else if (rule.type === 'content' && violation.details) {
          // Extract pattern from: "The content "console.log" was added but is forbidden"
          // or "The pattern "console.log" was found in added content"
          const contentMatch = violation.details.match(/The content "([^"]+)"/);
          const patternMatch = violation.details.match(/The pattern "([^"]+)"/);
          const pattern = contentMatch ? contentMatch[1] : (patternMatch ? patternMatch[1] : null);

          if (pattern) {
            console.log('Guardrail: Found content pattern to allow:', pattern);

            // Remove from forbid list if present
            if (rule.forbid) {
              const forbidIndex = rule.forbid.indexOf(pattern);
              if (forbidIndex !== -1) {
                rule.forbid.splice(forbidIndex, 1);
                modified = true;
                ruleUpdates.push({
                  ruleType: 'content',
                  action: 'removed_from_forbid',
                  value: pattern
                });
                console.log('Guardrail: Removed from forbid list:', pattern);
              }
            }

            // Remove from patterns.deny if present
            if (rule.patterns?.deny) {
              const denyIndex = rule.patterns.deny.indexOf(pattern);
              if (denyIndex !== -1) {
                rule.patterns.deny.splice(denyIndex, 1);
                modified = true;
                ruleUpdates.push({
                  ruleType: 'content',
                  action: 'removed_from_deny',
                  value: pattern
                });
                console.log('Guardrail: Removed from patterns.deny:', pattern);
              }
            }
          }
        }
      }
    }

    console.log('Guardrail: Rules modified:', modified);
    if (modified) {
      const yamlContent = yaml.dump(rules, {
        lineWidth: -1,
        noRefs: true,
        quotingType: '"',
        forceQuotes: false
      });
      console.log('Guardrail: Writing updated rules to:', rulesPath);
      fs.writeFileSync(rulesPath, yamlContent, 'utf8');
      console.log('Guardrail: Rules file updated successfully');

      // Log the rule changes
      logRuleUpdate(ruleUpdates, sourceFile);

      return true;
    }

    return false;
  } catch (error) {
    console.error('Failed to update rules:', error);
    return false;
  }
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

/**
 * Load rules with per-folder overrides for a specific file.
 * Searches for .llm-guardrail.yaml files from the file's directory up to workspace root.
 * Override files can extend or replace parent rules.
 */
export async function loadRulesForFile(filePath: string): Promise<RulesConfig> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return loadRules();
  }

  const workspaceRoot = workspaceFolders[0].uri.fsPath;

  // Start with base rules
  let baseRules = await loadRules();

  // Find all .llm-guardrail.yaml files from workspace root to file's directory
  const fileDir = path.dirname(filePath);
  const overrideFiles = findOverrideFiles(workspaceRoot, fileDir);

  // Apply overrides in order (from root to most specific)
  for (const overridePath of overrideFiles) {
    try {
      const overrideContent = fs.readFileSync(overridePath, 'utf8');
      const override = yaml.load(overrideContent) as RulesOverride;

      if (override) {
        baseRules = applyRulesOverride(baseRules, override);
      }
    } catch (error) {
      console.error(`Failed to load override file ${overridePath}:`, error);
    }
  }

  return baseRules;
}

/**
 * Override configuration for .llm-guardrail.yaml files
 */
export interface RulesOverride {
  // If true, completely replace parent rules instead of merging
  replace?: boolean;

  // Rules to add (merged with parent)
  rules?: Rule[];

  // Rules to disable by type or description
  disable?: string[];

  // Global overrides
  global?: RulesConfig['global'];
}

/**
 * Find all .llm-guardrail.yaml files from root to target directory
 */
function findOverrideFiles(workspaceRoot: string, targetDir: string): string[] {
  const overrideFiles: string[] = [];
  const overrideFileName = '.llm-guardrail.yaml';

  // Normalize paths
  const normalizedRoot = path.normalize(workspaceRoot);
  let currentDir = path.normalize(targetDir);

  // Collect directories from target to root
  const directories: string[] = [];
  while (currentDir.startsWith(normalizedRoot) && currentDir.length >= normalizedRoot.length) {
    directories.unshift(currentDir); // Add to front so root comes first
    const parent = path.dirname(currentDir);
    if (parent === currentDir) {
      break; // Reached filesystem root
    }
    currentDir = parent;
  }

  // Check each directory for override file
  for (const dir of directories) {
    const overridePath = path.join(dir, overrideFileName);
    if (fs.existsSync(overridePath)) {
      overrideFiles.push(overridePath);
    }
  }

  return overrideFiles;
}

/**
 * Apply an override to base rules
 */
function applyRulesOverride(base: RulesConfig, override: RulesOverride): RulesConfig {
  // If replace mode, start fresh with just override rules
  if (override.replace) {
    return {
      rules: override.rules || [],
      global: {
        ...DEFAULT_RULES.global,
        ...(override.global || {})
      }
    };
  }

  // Merge mode: combine rules
  let mergedRules = [...base.rules];

  // Remove disabled rules
  if (override.disable && override.disable.length > 0) {
    mergedRules = mergedRules.filter(rule => {
      // Check if rule type or description matches any disable pattern
      const typeMatch = override.disable!.includes(rule.type);
      const descMatch = rule.description && override.disable!.some(d =>
        rule.description?.toLowerCase().includes(d.toLowerCase())
      );
      return !typeMatch && !descMatch;
    });
  }

  // Add new rules from override
  if (override.rules && override.rules.length > 0) {
    mergedRules = [...mergedRules, ...override.rules];
  }

  return {
    rules: mergedRules,
    global: {
      ...base.global,
      ...(override.global || {})
    }
  };
}

/**
 * Create a .llm-guardrail.yaml override file in current directory
 */
export async function createOverrideFile(directory?: string): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage('No workspace folder open.');
    return;
  }

  // Use provided directory or prompt for one
  let targetDir = directory;
  if (!targetDir) {
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      targetDir = path.dirname(activeEditor.document.uri.fsPath);
    } else {
      targetDir = workspaceFolders[0].uri.fsPath;
    }
  }

  const overridePath = path.join(targetDir, '.llm-guardrail.yaml');

  if (fs.existsSync(overridePath)) {
    const doc = await vscode.workspace.openTextDocument(overridePath);
    await vscode.window.showTextDocument(doc);
    return;
  }

  const content = `# LLM Guardrail - Local Override
# This file overrides rules from parent directories for files in this folder and subfolders

# Set to true to completely replace parent rules (default: false = merge)
replace: false

# Disable specific rules by type or description keyword
disable: []
  # - refactor           # Disable all refactor rules
  # - "console.log"      # Disable rules mentioning console.log

# Additional rules for this directory
rules: []
  # - type: content
  #   description: "Allow console.log in this folder"
  #   forbid: []

# Override global settings
# global:
#   require_approval_for_all: false
`;

  try {
    fs.writeFileSync(overridePath, content, 'utf8');
    const doc = await vscode.workspace.openTextDocument(overridePath);
    await vscode.window.showTextDocument(doc);
    vscode.window.showInformationMessage('Created .llm-guardrail.yaml override file.');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    vscode.window.showErrorMessage(`Failed to create override file: ${errorMessage}`);
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
