import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { RulesConfig, Rule } from './rules';

export interface EslintRuleSet {
  noConsole: boolean;
  noDebugger: boolean;
  noEval: boolean;
  noAlert: boolean;
  customForbiddenPatterns: string[];
}

export interface TypeScriptConfig {
  strict: boolean;
  include: string[];
  exclude: string[];
}

export interface ProjectConfig {
  dependencies: string[];
  devDependencies: string[];
  eslintRules: EslintRuleSet;
  tsConfig: TypeScriptConfig;
  projectType: 'typescript' | 'javascript' | 'python' | 'unknown';
  hasTests: boolean;
  hasPrettier: boolean;
}

export interface ScanResult {
  config: ProjectConfig;
  suggestedRules: RulesConfig;
  confidence: number; // 0-1 how confident we are in suggestions
  detectedFiles: string[];
}

/**
 * Scan the project for configuration files and generate smart rules
 */
export async function scanProject(workspaceRoot: string): Promise<ScanResult> {
  const detectedFiles: string[] = [];

  // Scan for various config files
  const packageJson = await scanPackageJson(workspaceRoot, detectedFiles);
  const eslintRules = await scanEslintConfig(workspaceRoot, detectedFiles);
  const tsConfig = await scanTsConfig(workspaceRoot, detectedFiles);
  const projectType = detectProjectType(workspaceRoot, packageJson);
  const hasTests = detectTestFramework(workspaceRoot, packageJson);
  const hasPrettier = detectPrettier(workspaceRoot, packageJson, detectedFiles);

  const config: ProjectConfig = {
    dependencies: packageJson.dependencies,
    devDependencies: packageJson.devDependencies,
    eslintRules,
    tsConfig,
    projectType,
    hasTests,
    hasPrettier
  };

  const suggestedRules = generateRulesFromScan(config);
  const confidence = calculateConfidence(detectedFiles);

  return {
    config,
    suggestedRules,
    confidence,
    detectedFiles
  };
}

interface PackageJsonResult {
  dependencies: string[];
  devDependencies: string[];
  raw: Record<string, unknown> | null;
}

async function scanPackageJson(workspaceRoot: string, detectedFiles: string[]): Promise<PackageJsonResult> {
  const packagePath = path.join(workspaceRoot, 'package.json');

  if (!fs.existsSync(packagePath)) {
    return { dependencies: [], devDependencies: [], raw: null };
  }

  detectedFiles.push('package.json');

  try {
    const content = fs.readFileSync(packagePath, 'utf8');
    const pkg = JSON.parse(content);

    return {
      dependencies: Object.keys(pkg.dependencies || {}),
      devDependencies: Object.keys(pkg.devDependencies || {}),
      raw: pkg
    };
  } catch {
    return { dependencies: [], devDependencies: [], raw: null };
  }
}

async function scanEslintConfig(workspaceRoot: string, detectedFiles: string[]): Promise<EslintRuleSet> {
  const defaultRules: EslintRuleSet = {
    noConsole: false,
    noDebugger: false,
    noEval: false,
    noAlert: false,
    customForbiddenPatterns: []
  };

  // Check for various ESLint config file formats
  const eslintFiles = [
    '.eslintrc',
    '.eslintrc.json',
    '.eslintrc.js',
    '.eslintrc.cjs',
    '.eslintrc.yaml',
    '.eslintrc.yml',
    'eslint.config.js',
    'eslint.config.mjs'
  ];

  for (const file of eslintFiles) {
    const eslintPath = path.join(workspaceRoot, file);
    if (fs.existsSync(eslintPath)) {
      detectedFiles.push(file);

      try {
        // Only parse JSON files directly
        if (file.endsWith('.json') || file === '.eslintrc') {
          const content = fs.readFileSync(eslintPath, 'utf8');
          const config = JSON.parse(content);
          return extractEslintRules(config);
        }
        // For JS files, we can't safely eval, so just note we found config
        return defaultRules;
      } catch {
        // Failed to parse, continue with defaults
      }
      break;
    }
  }

  // Check for eslintConfig in package.json
  const packagePath = path.join(workspaceRoot, 'package.json');
  if (fs.existsSync(packagePath)) {
    try {
      const content = fs.readFileSync(packagePath, 'utf8');
      const pkg = JSON.parse(content);
      if (pkg.eslintConfig) {
        return extractEslintRules(pkg.eslintConfig);
      }
    } catch {
      // Failed to parse
    }
  }

  return defaultRules;
}

function extractEslintRules(config: Record<string, unknown>): EslintRuleSet {
  const rules = (config.rules || {}) as Record<string, unknown>;

  const isRuleEnabled = (rule: unknown): boolean => {
    if (rule === 'error' || rule === 'warn' || rule === 2 || rule === 1) {
      return true;
    }
    if (Array.isArray(rule) && (rule[0] === 'error' || rule[0] === 'warn' || rule[0] === 2 || rule[0] === 1)) {
      return true;
    }
    return false;
  };

  return {
    noConsole: isRuleEnabled(rules['no-console']),
    noDebugger: isRuleEnabled(rules['no-debugger']),
    noEval: isRuleEnabled(rules['no-eval']),
    noAlert: isRuleEnabled(rules['no-alert']),
    customForbiddenPatterns: []
  };
}

async function scanTsConfig(workspaceRoot: string, detectedFiles: string[]): Promise<TypeScriptConfig> {
  const defaultConfig: TypeScriptConfig = {
    strict: false,
    include: [],
    exclude: ['node_modules']
  };

  const tsConfigPath = path.join(workspaceRoot, 'tsconfig.json');
  if (!fs.existsSync(tsConfigPath)) {
    return defaultConfig;
  }

  detectedFiles.push('tsconfig.json');

  try {
    const content = fs.readFileSync(tsConfigPath, 'utf8');
    // Remove comments (simple approach for single-line comments)
    const cleanContent = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const config = JSON.parse(cleanContent);

    return {
      strict: config.compilerOptions?.strict ?? false,
      include: config.include || [],
      exclude: config.exclude || ['node_modules']
    };
  } catch {
    return defaultConfig;
  }
}

function detectProjectType(workspaceRoot: string, packageJson: PackageJsonResult): 'typescript' | 'javascript' | 'python' | 'unknown' {
  // Check for TypeScript
  if (
    packageJson.devDependencies.includes('typescript') ||
    packageJson.dependencies.includes('typescript') ||
    fs.existsSync(path.join(workspaceRoot, 'tsconfig.json'))
  ) {
    return 'typescript';
  }

  // Check for Python
  if (
    fs.existsSync(path.join(workspaceRoot, 'requirements.txt')) ||
    fs.existsSync(path.join(workspaceRoot, 'pyproject.toml')) ||
    fs.existsSync(path.join(workspaceRoot, 'setup.py'))
  ) {
    return 'python';
  }

  // Check for JavaScript (package.json exists)
  if (packageJson.raw) {
    return 'javascript';
  }

  return 'unknown';
}

function detectTestFramework(workspaceRoot: string, packageJson: PackageJsonResult): boolean {
  const testPackages = ['jest', 'mocha', 'vitest', 'ava', 'tap', 'jasmine', '@testing-library/react'];

  for (const pkg of testPackages) {
    if (packageJson.devDependencies.includes(pkg) || packageJson.dependencies.includes(pkg)) {
      return true;
    }
  }

  // Check for test directories
  const testDirs = ['test', 'tests', '__tests__', 'spec'];
  for (const dir of testDirs) {
    if (fs.existsSync(path.join(workspaceRoot, dir))) {
      return true;
    }
  }

  return false;
}

function detectPrettier(workspaceRoot: string, packageJson: PackageJsonResult, detectedFiles: string[]): boolean {
  if (packageJson.devDependencies.includes('prettier') || packageJson.dependencies.includes('prettier')) {
    return true;
  }

  const prettierFiles = ['.prettierrc', '.prettierrc.json', '.prettierrc.js', 'prettier.config.js'];
  for (const file of prettierFiles) {
    if (fs.existsSync(path.join(workspaceRoot, file))) {
      detectedFiles.push(file);
      return true;
    }
  }

  return false;
}

function calculateConfidence(detectedFiles: string[]): number {
  // More config files = higher confidence in suggestions
  if (detectedFiles.length >= 4) {
    return 0.9;
  }
  if (detectedFiles.length >= 2) {
    return 0.7;
  }
  if (detectedFiles.length >= 1) {
    return 0.5;
  }
  return 0.2;
}

/**
 * Generate rules configuration from scanned project config
 */
export function generateRulesFromScan(config: ProjectConfig): RulesConfig {
  const rules: Rule[] = [];

  // Generate scope rules from tsconfig include patterns
  if (config.tsConfig.include.length > 0) {
    rules.push({
      type: 'scope',
      description: 'Restrict to source files (from tsconfig)',
      files: config.tsConfig.include.map(pattern => {
        // Convert tsconfig patterns to simpler glob
        return pattern.replace(/\*\*\/\*/, '**/*');
      })
    });
  }

  // Generate dependency rules
  if (config.dependencies.length > 0) {
    // Common packages to forbid (outdated or problematic)
    const commonForbidden = ['moment', 'request', 'lodash'].filter(
      pkg => !config.dependencies.includes(pkg) && !config.devDependencies.includes(pkg)
    );

    if (commonForbidden.length > 0) {
      rules.push({
        type: 'dependencies',
        description: 'Forbid commonly problematic packages',
        forbidden: commonForbidden
      });
    }
  }

  // Generate content rules from ESLint config
  const forbidContent: string[] = [];
  const forbidPatterns: string[] = [];

  if (config.eslintRules.noConsole) {
    forbidContent.push('console.log');
    forbidContent.push('console.debug');
  }
  if (config.eslintRules.noDebugger) {
    forbidContent.push('debugger');
  }
  if (config.eslintRules.noAlert) {
    forbidContent.push('alert(');
  }
  if (config.eslintRules.noEval) {
    forbidPatterns.push('eval\\(');
    forbidPatterns.push('Function\\(');
  }

  // Always add some security patterns
  forbidPatterns.push('innerHTML\\s*=');

  if (forbidContent.length > 0 || forbidPatterns.length > 0) {
    rules.push({
      type: 'content',
      description: 'Content rules from ESLint and security best practices',
      forbid: forbidContent.length > 0 ? forbidContent : undefined,
      patterns: forbidPatterns.length > 0 ? { deny: forbidPatterns } : undefined
    });
  }

  // Generate refactor rules if prettier is detected
  if (config.hasPrettier) {
    rules.push({
      type: 'refactor',
      description: 'Prevent formatting changes (Prettier detected)',
      forbid: ['change_formatting']
    });
  }

  // Always add a reasonable threshold rule
  rules.push({
    type: 'threshold',
    description: 'Limit change scope',
    max_lines_changed: 50,
    require_approval: true
  });

  return {
    rules,
    global: {
      require_approval_for_all: true,
      log_all_interactions: true,
      strict_mode: false
    }
  };
}

/**
 * Interactive wizard to scan project and generate rules
 */
export async function scanProjectInteractive(): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage('No workspace folder open. Please open a folder first.');
    return;
  }

  const workspaceRoot = workspaceFolders[0].uri.fsPath;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Scanning project...',
      cancellable: false
    },
    async (progress) => {
      progress.report({ message: 'Analyzing project configuration...' });

      const scanResult = await scanProject(workspaceRoot);

      progress.report({ message: 'Generating rules...' });

      // Show summary to user
      const detectedSummary = scanResult.detectedFiles.length > 0
        ? `Detected: ${scanResult.detectedFiles.join(', ')}`
        : 'No configuration files detected';

      const ruleCount = scanResult.suggestedRules.rules.length;
      const confidence = Math.round(scanResult.confidence * 100);

      const choice = await vscode.window.showInformationMessage(
        `Project scan complete (${confidence}% confidence). ${detectedSummary}. Generated ${ruleCount} rules.`,
        'Create rules.yaml',
        'Preview Rules',
        'Cancel'
      );

      if (choice === 'Create rules.yaml') {
        await writeRulesFile(workspaceRoot, scanResult.suggestedRules);
      } else if (choice === 'Preview Rules') {
        await previewRules(scanResult.suggestedRules);
      }
    }
  );
}

async function writeRulesFile(workspaceRoot: string, rules: RulesConfig): Promise<void> {
  const rulesPath = path.join(workspaceRoot, 'rules.yaml');

  // Check if file already exists
  if (fs.existsSync(rulesPath)) {
    const overwrite = await vscode.window.showWarningMessage(
      'rules.yaml already exists. Overwrite?',
      'Overwrite',
      'Cancel'
    );
    if (overwrite !== 'Overwrite') {
      return;
    }
  }

  const yamlContent = generateYamlContent(rules);
  fs.writeFileSync(rulesPath, yamlContent, 'utf8');

  const document = await vscode.workspace.openTextDocument(rulesPath);
  await vscode.window.showTextDocument(document);

  vscode.window.showInformationMessage('Created rules.yaml with project-aware configuration.');
}

async function previewRules(rules: RulesConfig): Promise<void> {
  const yamlContent = generateYamlContent(rules);

  const document = await vscode.workspace.openTextDocument({
    content: yamlContent,
    language: 'yaml'
  });
  await vscode.window.showTextDocument(document);
}

function generateYamlContent(rules: RulesConfig): string {
  const lines: string[] = [
    '# LLM Guardrail Rules - Auto-generated from project configuration',
    '# Review and customize these rules for your needs',
    '',
    'rules:'
  ];

  for (const rule of rules.rules) {
    lines.push(`  - type: ${rule.type}`);

    if ('description' in rule && rule.description) {
      lines.push(`    description: "${rule.description}"`);
    }

    switch (rule.type) {
      case 'scope':
        if (rule.files && rule.files.length > 0) {
          lines.push('    files:');
          for (const file of rule.files) {
            lines.push(`      - "${file}"`);
          }
        }
        if (rule.functions && rule.functions.length > 0) {
          lines.push('    functions:');
          for (const fn of rule.functions) {
            lines.push(`      - "${fn}"`);
          }
        }
        break;

      case 'refactor':
        if (rule.forbid && rule.forbid.length > 0) {
          lines.push('    forbid:');
          for (const f of rule.forbid) {
            lines.push(`      - ${f}`);
          }
        }
        break;

      case 'dependencies':
        if (rule.allowed && rule.allowed.length > 0) {
          lines.push('    allowed:');
          for (const a of rule.allowed) {
            lines.push(`      - ${a}`);
          }
        }
        if (rule.forbidden && rule.forbidden.length > 0) {
          lines.push('    forbidden:');
          for (const f of rule.forbidden) {
            lines.push(`      - ${f}`);
          }
        }
        break;

      case 'content':
        if (rule.forbid && rule.forbid.length > 0) {
          lines.push('    forbid:');
          for (const f of rule.forbid) {
            lines.push(`      - "${f}"`);
          }
        }
        if (rule.patterns) {
          lines.push('    patterns:');
          if (rule.patterns.deny && rule.patterns.deny.length > 0) {
            lines.push('      deny:');
            for (const d of rule.patterns.deny) {
              lines.push(`        - "${d}"`);
            }
          }
        }
        break;

      case 'threshold':
        if (rule.max_lines_changed !== undefined) {
          lines.push(`    max_lines_changed: ${rule.max_lines_changed}`);
        }
        if (rule.max_files_changed !== undefined) {
          lines.push(`    max_files_changed: ${rule.max_files_changed}`);
        }
        lines.push(`    require_approval: ${rule.require_approval}`);
        break;
    }

    lines.push('');
  }

  lines.push('global:');
  lines.push(`  require_approval_for_all: ${rules.global?.require_approval_for_all ?? true}`);
  lines.push(`  log_all_interactions: ${rules.global?.log_all_interactions ?? true}`);
  lines.push(`  strict_mode: ${rules.global?.strict_mode ?? false}`);

  return lines.join('\n');
}
