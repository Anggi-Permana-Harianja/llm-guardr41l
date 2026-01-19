/**
 * Core types for LLM Guardr41l
 * Shared between CLI and VS Code extension
 */

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

export interface RulesOverride {
  replace?: boolean;
  rules?: Rule[];
  disable?: string[];
  global?: RulesConfig['global'];
}

export interface DiffChange {
  type: 'added' | 'removed' | 'unchanged';
  value: string;
  lineNumber?: number;
  count?: number;
}

export interface DiffResult {
  changes: DiffChange[];
  linesAdded: number;
  linesRemoved: number;
  totalLinesChanged: number;
}

export interface Violation {
  rule: Rule;
  ruleType: string;
  description: string;
  severity: 'error' | 'warning';
  details?: string;
  lineNumbers?: number[];
}

export interface ValidationResult {
  valid: boolean;
  violations: Violation[];
  diff: DiffResult;
  requiresApproval: boolean;
}

export const DEFAULT_RULES: RulesConfig = {
  rules: [],
  global: {
    require_approval_for_all: true,
    log_all_interactions: true,
    strict_mode: false
  }
};
