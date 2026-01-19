/**
 * check command - validate git staged or committed changes
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { loadRulesFromPath, loadRulesForFile, findRulesFile } from '../../core/rules-loader';
import { validateAgainstRules } from '../../core/validator';
import { ValidationResult } from '../../core/types';
import { formatResult, OutputFormat, formatText } from '../formatters';

export interface CheckOptions {
  staged?: boolean;
  commit?: string;
  rules?: string;
  format: OutputFormat;
  output?: string;
  verbose?: boolean;
  noColors?: boolean;
}

interface FileChange {
  fileName: string;
  before: string;
  after: string;
}

export async function check(options: CheckOptions): Promise<number> {
  try {
    // Find rules file
    let rulesPath = options.rules;
    if (!rulesPath) {
      rulesPath = findRulesFile(process.cwd());
      if (!rulesPath) {
        console.error('Error: No rules.yaml found. Create one or specify with --rules');
        return 1;
      }
    }

    const workspaceRoot = path.dirname(rulesPath);

    // Get file changes
    const changes = options.staged
      ? getStagedChanges()
      : getCommitChanges(options.commit || 'HEAD');

    if (changes.length === 0) {
      console.log('No changes to validate.');
      return 0;
    }

    // Validate each file
    const results: Array<{ fileName: string; result: ValidationResult }> = [];
    let hasErrors = false;

    for (const change of changes) {
      const rules = loadRulesForFile(
        path.join(workspaceRoot, change.fileName),
        workspaceRoot
      );

      const result = validateAgainstRules(
        change.before,
        change.after,
        rules,
        change.fileName
      );

      results.push({ fileName: change.fileName, result });

      if (!result.valid) {
        hasErrors = true;
      }
    }

    // Format output
    if (options.format === 'json') {
      const output = {
        valid: !hasErrors,
        filesChecked: results.length,
        results: results.map(r => ({
          fileName: r.fileName,
          valid: r.result.valid,
          violations: r.result.violations.map(v => ({
            ruleType: v.ruleType,
            severity: v.severity,
            description: v.description,
            details: v.details,
            lineNumbers: v.lineNumbers
          }))
        }))
      };
      const formatted = JSON.stringify(output, null, 2);

      if (options.output) {
        fs.writeFileSync(options.output, formatted, 'utf8');
        console.log(`Results written to ${options.output}`);
      } else {
        console.log(formatted);
      }
    } else if (options.format === 'sarif') {
      // Combine all results into single SARIF report
      const allViolations = results.flatMap(r =>
        r.result.violations.map(v => ({ ...v, fileName: r.fileName }))
      );

      const sarif = {
        $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
        version: '2.1.0',
        runs: [
          {
            tool: {
              driver: {
                name: 'llm-guardrail',
                version: '0.5.0',
                informationUri: 'https://github.com/Anggi-Permana-Harianja/llm-guardr41l'
              }
            },
            results: allViolations.map((v, index) => ({
              ruleId: v.ruleType,
              level: v.severity === 'error' ? 'error' : 'warning',
              message: { text: v.details || v.description },
              locations: [
                {
                  physicalLocation: {
                    artifactLocation: { uri: (v as any).fileName },
                    region: { startLine: v.lineNumbers?.[0] || 1 }
                  }
                }
              ]
            }))
          }
        ]
      };

      const formatted = JSON.stringify(sarif, null, 2);

      if (options.output) {
        fs.writeFileSync(options.output, formatted, 'utf8');
        console.log(`Results written to ${options.output}`);
      } else {
        console.log(formatted);
      }
    } else {
      // Text format
      const useColors = !options.noColors;
      console.log('');
      console.log(useColors ? '\x1b[1mLLM Guardrail Check Results\x1b[0m' : 'LLM Guardrail Check Results');
      console.log('='.repeat(40));

      for (const { fileName, result } of results) {
        const formatted = formatText(result, {
          fileName,
          verbose: options.verbose,
          colors: useColors
        });
        console.log(formatted);
      }

      // Summary
      const totalViolations = results.reduce((sum, r) => sum + r.result.violations.length, 0);
      const errorCount = results.reduce(
        (sum, r) => sum + r.result.violations.filter(v => v.severity === 'error').length,
        0
      );
      const warningCount = totalViolations - errorCount;

      console.log('='.repeat(40));
      console.log(`Files checked: ${results.length}`);
      console.log(`Total violations: ${totalViolations} (${errorCount} errors, ${warningCount} warnings)`);
      console.log(`Status: ${hasErrors ? (useColors ? '\x1b[31mFAILED\x1b[0m' : 'FAILED') : (useColors ? '\x1b[32mPASSED\x1b[0m' : 'PASSED')}`);
      console.log('');

      if (options.output) {
        // For text format, still write to file
        let fileContent = 'LLM Guardrail Check Results\n';
        fileContent += '='.repeat(40) + '\n';
        for (const { fileName, result } of results) {
          fileContent += formatText(result, { fileName, verbose: options.verbose, colors: false });
        }
        fs.writeFileSync(options.output, fileContent, 'utf8');
        console.log(`Results written to ${options.output}`);
      }
    }

    return hasErrors ? 1 : 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error: ${message}`);
    return 1;
  }
}

function getStagedChanges(): FileChange[] {
  const changes: FileChange[] = [];

  try {
    // Get list of staged files
    const stagedFiles = execSync('git diff --cached --name-only', { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(f => f.length > 0);

    for (const fileName of stagedFiles) {
      try {
        // Get original content (from HEAD)
        let before = '';
        try {
          before = execSync(`git show HEAD:${fileName}`, { encoding: 'utf8' });
        } catch {
          // File is new, no original content
        }

        // Get staged content
        const after = execSync(`git show :${fileName}`, { encoding: 'utf8' });

        changes.push({ fileName, before, after });
      } catch {
        // Skip files that can't be read (binary, etc.)
      }
    }
  } catch (error) {
    throw new Error('Failed to get staged changes. Make sure you are in a git repository.');
  }

  return changes;
}

function getCommitChanges(commit: string): FileChange[] {
  const changes: FileChange[] = [];

  try {
    // Get list of changed files in commit
    const changedFiles = execSync(`git diff-tree --no-commit-id --name-only -r ${commit}`, { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(f => f.length > 0);

    for (const fileName of changedFiles) {
      try {
        // Get content before commit
        let before = '';
        try {
          before = execSync(`git show ${commit}^:${fileName}`, { encoding: 'utf8' });
        } catch {
          // File was added in this commit
        }

        // Get content after commit
        const after = execSync(`git show ${commit}:${fileName}`, { encoding: 'utf8' });

        changes.push({ fileName, before, after });
      } catch {
        // Skip files that can't be read
      }
    }
  } catch (error) {
    throw new Error(`Failed to get changes for commit ${commit}. Make sure the commit exists.`);
  }

  return changes;
}
