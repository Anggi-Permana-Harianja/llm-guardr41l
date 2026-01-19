/**
 * Output formatters for CLI
 */

import { ValidationResult, Violation } from '../core/types';

export type OutputFormat = 'text' | 'json' | 'sarif';

export interface FormatterOptions {
  fileName?: string;
  verbose?: boolean;
  colors?: boolean;
}

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
  bold: '\x1b[1m'
};

function colorize(text: string, color: keyof typeof colors, useColors: boolean): string {
  return useColors ? `${colors[color]}${text}${colors.reset}` : text;
}

/**
 * Format validation result as human-readable text
 */
export function formatText(result: ValidationResult, options: FormatterOptions = {}): string {
  const useColors = options.colors ?? true;
  const lines: string[] = [];

  // Header
  if (options.fileName) {
    lines.push(colorize(`\nFile: ${options.fileName}`, 'bold', useColors));
  }

  // Summary
  const status = result.valid
    ? colorize('✓ PASSED', 'green', useColors)
    : colorize('✗ FAILED', 'red', useColors);

  lines.push(`Status: ${status}`);
  lines.push(`Lines changed: +${result.diff.linesAdded} / -${result.diff.linesRemoved}`);

  // Violations
  if (result.violations.length > 0) {
    lines.push('');
    lines.push(colorize(`Violations (${result.violations.length}):`, 'bold', useColors));

    for (const violation of result.violations) {
      const severity = violation.severity === 'error'
        ? colorize('ERROR', 'red', useColors)
        : colorize('WARNING', 'yellow', useColors);

      const lineInfo = violation.lineNumbers?.length
        ? colorize(` (lines ${violation.lineNumbers.slice(0, 3).join(', ')}${violation.lineNumbers.length > 3 ? '...' : ''})`, 'gray', useColors)
        : '';

      lines.push(`  ${severity} [${violation.ruleType}] ${violation.description}${lineInfo}`);

      if (violation.details && options.verbose) {
        lines.push(colorize(`    → ${violation.details}`, 'gray', useColors));
      }
    }
  }

  // Diff preview (if verbose)
  if (options.verbose && result.diff.changes.length > 0) {
    lines.push('');
    lines.push(colorize('Diff:', 'bold', useColors));

    for (const change of result.diff.changes) {
      const changeLines = change.value.split('\n').filter(l => l.length > 0);
      for (const line of changeLines.slice(0, 10)) {
        if (change.type === 'added') {
          lines.push(colorize(`+ ${line}`, 'green', useColors));
        } else if (change.type === 'removed') {
          lines.push(colorize(`- ${line}`, 'red', useColors));
        }
      }
      if (changeLines.length > 10) {
        lines.push(colorize(`  ... (${changeLines.length - 10} more lines)`, 'gray', useColors));
      }
    }
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Format validation result as JSON
 */
export function formatJson(result: ValidationResult, options: FormatterOptions = {}): string {
  const output = {
    valid: result.valid,
    fileName: options.fileName,
    summary: {
      linesAdded: result.diff.linesAdded,
      linesRemoved: result.diff.linesRemoved,
      totalLinesChanged: result.diff.totalLinesChanged,
      violationCount: result.violations.length,
      errorCount: result.violations.filter(v => v.severity === 'error').length,
      warningCount: result.violations.filter(v => v.severity === 'warning').length
    },
    violations: result.violations.map(v => ({
      ruleType: v.ruleType,
      severity: v.severity,
      description: v.description,
      details: v.details,
      lineNumbers: v.lineNumbers
    })),
    requiresApproval: result.requiresApproval
  };

  return JSON.stringify(output, null, 2);
}

/**
 * Format validation result as SARIF (Static Analysis Results Interchange Format)
 * Compatible with GitHub Code Scanning
 */
export function formatSarif(result: ValidationResult, options: FormatterOptions = {}): string {
  const sarif = {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'llm-guardrail',
            version: '0.5.0',
            informationUri: 'https://github.com/AE-Hertz/llm-guardr41l',
            rules: getUniqueRules(result.violations)
          }
        },
        results: result.violations.map((v, index) => ({
          ruleId: `${v.ruleType}/${index}`,
          level: v.severity === 'error' ? 'error' : 'warning',
          message: {
            text: v.details || v.description
          },
          locations: options.fileName ? [
            {
              physicalLocation: {
                artifactLocation: {
                  uri: options.fileName
                },
                region: {
                  startLine: v.lineNumbers?.[0] || 1
                }
              }
            }
          ] : []
        }))
      }
    ]
  };

  return JSON.stringify(sarif, null, 2);
}

function getUniqueRules(violations: Violation[]): Array<{ id: string; name: string; shortDescription: { text: string } }> {
  const seen = new Set<string>();
  const rules: Array<{ id: string; name: string; shortDescription: { text: string } }> = [];

  for (const v of violations) {
    if (!seen.has(v.ruleType)) {
      seen.add(v.ruleType);
      rules.push({
        id: v.ruleType,
        name: v.ruleType.charAt(0).toUpperCase() + v.ruleType.slice(1) + ' Rule',
        shortDescription: { text: `LLM Guardrail ${v.ruleType} rule` }
      });
    }
  }

  return rules;
}

/**
 * Format result using specified format
 */
export function formatResult(
  result: ValidationResult,
  format: OutputFormat,
  options: FormatterOptions = {}
): string {
  switch (format) {
    case 'json':
      return formatJson(result, options);
    case 'sarif':
      return formatSarif(result, options);
    case 'text':
    default:
      return formatText(result, options);
  }
}
