/**
 * Rules loading for CLI
 * Pure functions with no VS Code dependencies
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { RulesConfig, RulesOverride, Rule, DEFAULT_RULES } from './types';

/**
 * Load rules from a specific file path
 */
export function loadRulesFromPath(rulesPath: string): RulesConfig {
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
    throw new Error(`Failed to load rules from ${rulesPath}: ${errorMessage}`);
  }
}

/**
 * Load rules with per-folder overrides for a specific file
 */
export function loadRulesForFile(filePath: string, workspaceRoot: string): RulesConfig {
  const rulesPath = path.join(workspaceRoot, 'rules.yaml');
  let baseRules = loadRulesFromPath(rulesPath);

  const fileDir = path.dirname(filePath);
  const overrideFiles = findOverrideFiles(workspaceRoot, fileDir);

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
 * Find all .llm-guardrail.yaml files from root to target directory
 */
function findOverrideFiles(workspaceRoot: string, targetDir: string): string[] {
  const overrideFiles: string[] = [];
  const overrideFileName = '.llm-guardrail.yaml';

  const normalizedRoot = path.normalize(workspaceRoot);
  let currentDir = path.normalize(targetDir);

  const directories: string[] = [];
  while (currentDir.startsWith(normalizedRoot) && currentDir.length >= normalizedRoot.length) {
    directories.unshift(currentDir);
    const parent = path.dirname(currentDir);
    if (parent === currentDir) {
      break;
    }
    currentDir = parent;
  }

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
  if (override.replace) {
    return {
      rules: override.rules || [],
      global: {
        ...DEFAULT_RULES.global,
        ...(override.global || {})
      }
    };
  }

  let mergedRules = [...base.rules];

  if (override.disable && override.disable.length > 0) {
    mergedRules = mergedRules.filter(rule => {
      const typeMatch = override.disable!.includes(rule.type);
      const descMatch = rule.description && override.disable!.some(d =>
        rule.description?.toLowerCase().includes(d.toLowerCase())
      );
      return !typeMatch && !descMatch;
    });
  }

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
 * Validate that a config object is a valid RulesConfig
 */
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

/**
 * Find the rules.yaml file starting from a directory
 */
export function findRulesFile(startDir: string): string | undefined {
  let currentDir = path.resolve(startDir);
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const rulesPath = path.join(currentDir, 'rules.yaml');
    if (fs.existsSync(rulesPath)) {
      return rulesPath;
    }
    currentDir = path.dirname(currentDir);
  }

  return undefined;
}
