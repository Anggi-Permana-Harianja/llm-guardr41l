import * as Diff from 'diff';
import { RulesConfig, Rule, ScopeRule, RefactorRule, DependenciesRule, ContentRule, ThresholdRule } from './rules';

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

export function computeDiff(original: string, generated: string): DiffResult {
  const changes = Diff.diffLines(original, generated);

  const result: DiffChange[] = [];
  let linesAdded = 0;
  let linesRemoved = 0;
  let currentLine = 1;

  for (const change of changes) {
    const lineCount = (change.value.match(/\n/g) || []).length + (change.value.endsWith('\n') ? 0 : 1);

    if (change.added) {
      result.push({
        type: 'added',
        value: change.value,
        lineNumber: currentLine,
        count: lineCount
      });
      linesAdded += lineCount;
      currentLine += lineCount;
    } else if (change.removed) {
      result.push({
        type: 'removed',
        value: change.value,
        lineNumber: currentLine,
        count: lineCount
      });
      linesRemoved += lineCount;
    } else {
      result.push({
        type: 'unchanged',
        value: change.value,
        lineNumber: currentLine,
        count: lineCount
      });
      currentLine += lineCount;
    }
  }

  return {
    changes: result,
    linesAdded,
    linesRemoved,
    totalLinesChanged: linesAdded + linesRemoved
  };
}

function getChangedLineNumbers(diff: DiffResult): number[] {
  const lineNumbers: number[] = [];
  for (const change of diff.changes) {
    if (change.type === 'added' && change.lineNumber !== undefined) {
      for (let i = 0; i < (change.count || 1); i++) {
        lineNumbers.push(change.lineNumber + i);
      }
    }
  }
  return lineNumbers.length > 0 ? lineNumbers : [1];
}

function validateScopeRule(rule: ScopeRule, original: string, generated: string, diff: DiffResult, fileName?: string): Violation[] {
  const violations: Violation[] = [];
  const changedLines = getChangedLineNumbers(diff);

  // Check file scope
  if (rule.files && rule.files.length > 0 && fileName) {
    const isAllowedFile = rule.files.some(pattern => {
      if (pattern.includes('*')) {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        return regex.test(fileName);
      }
      return fileName.includes(pattern) || pattern.includes(fileName);
    });

    if (!isAllowedFile) {
      violations.push({
        rule,
        ruleType: 'scope',
        description: 'File modification outside allowed scope',
        severity: 'error',
        details: `File "${fileName}" is not in the allowed files list: ${rule.files.join(', ')}`,
        lineNumbers: changedLines
      });
    }
  }

  // Check function scope
  if (rule.functions && rule.functions.length > 0) {
    const addedContent = diff.changes
      .filter(c => c.type === 'added')
      .map(c => c.value)
      .join('\n');

    const removedContent = diff.changes
      .filter(c => c.type === 'removed')
      .map(c => c.value)
      .join('\n');

    // Simple heuristic: check if changes are within expected function patterns
    const functionPatterns = rule.functions.map(fn => new RegExp(`(function\\s+${fn}|${fn}\\s*[=:]\\s*(?:function|\\(|async))`, 'g'));

    // Check if original has the functions
    const functionsInOriginal = functionPatterns.some(pattern => pattern.test(original));

    if (!functionsInOriginal && (addedContent || removedContent)) {
      // Changes made but the specified functions don't exist
      violations.push({
        rule,
        ruleType: 'scope',
        description: 'Changes outside function scope',
        severity: 'warning',
        details: `Expected changes only in functions: ${rule.functions.join(', ')}`,
        lineNumbers: changedLines
      });
    }
  }

  // Check pattern scope
  if (rule.pattern) {
    const patternRegex = new RegExp(rule.pattern, 'g');
    const matchesInOriginal = original.match(patternRegex);

    if (!matchesInOriginal || matchesInOriginal.length === 0) {
      const hasChanges = diff.changes.some(c => c.type === 'added' || c.type === 'removed');
      if (hasChanges) {
        violations.push({
          rule,
          ruleType: 'scope',
          description: 'Pattern not found in original code',
          severity: 'warning',
          details: `The pattern "${rule.pattern}" was not found in the original code`,
          lineNumbers: changedLines
        });
      }
    }
  }

  return violations;
}

function validateRefactorRule(rule: RefactorRule, original: string, generated: string, diff: DiffResult): Violation[] {
  const violations: Violation[] = [];
  const forbiddenActions = rule.forbid || [];
  const changedLines = getChangedLineNumbers(diff);

  for (const action of forbiddenActions) {
    switch (action.toLowerCase()) {
      case 'variable_renames':
      case 'variable_rename': {
        // Simple heuristic: look for variable declarations in removed lines that appear with different names in added lines
        const removedVars = extractVariableNames(diff.changes.filter(c => c.type === 'removed').map(c => c.value).join('\n'));
        const addedVars = extractVariableNames(diff.changes.filter(c => c.type === 'added').map(c => c.value).join('\n'));

        // Check if variables disappeared and new ones appeared
        const removedNotInAdded = removedVars.filter(v => !addedVars.includes(v));
        const addedNotInRemoved = addedVars.filter(v => !removedVars.includes(v));

        if (removedNotInAdded.length > 0 && addedNotInRemoved.length > 0) {
          violations.push({
            rule,
            ruleType: 'refactor',
            description: 'Possible variable rename detected',
            severity: 'warning',
            details: `Variables removed: ${removedNotInAdded.join(', ')}. Variables added: ${addedNotInRemoved.join(', ')}`,
            lineNumbers: changedLines
          });
        }
        break;
      }

      case 'add_error_handling':
      case 'error_handling': {
        const addedContent = diff.changes.filter(c => c.type === 'added').map(c => c.value).join('\n');
        const errorPatterns = [/try\s*{/, /catch\s*\(/, /\.catch\(/, /throw\s+new/, /if\s*\([^)]*error/i];

        for (const pattern of errorPatterns) {
          if (pattern.test(addedContent) && !pattern.test(original)) {
            violations.push({
              rule,
              ruleType: 'refactor',
              description: 'Unsolicited error handling added',
              severity: 'warning',
              details: 'New error handling code was added without being requested',
              lineNumbers: changedLines
            });
            break;
          }
        }
        break;
      }

      case 'add_comments':
      case 'comments': {
        const addedContent = diff.changes.filter(c => c.type === 'added').map(c => c.value).join('\n');
        const commentPatterns = [/\/\/[^\n]+/, /\/\*[\s\S]*?\*\//, /#[^\n]+/];

        for (const pattern of commentPatterns) {
          const addedComments = addedContent.match(pattern);
          const originalComments = original.match(pattern);

          if (addedComments && (!originalComments || addedComments.length > originalComments.length)) {
            violations.push({
              rule,
              ruleType: 'refactor',
              description: 'Unsolicited comments added',
              severity: 'warning',
              details: 'New comments were added without being requested',
              lineNumbers: changedLines
            });
            break;
          }
        }
        break;
      }

      case 'change_formatting':
      case 'formatting': {
        // Check for whitespace-only changes
        const normalizedOriginal = original.replace(/\s+/g, ' ').trim();
        const normalizedGenerated = generated.replace(/\s+/g, ' ').trim();

        if (normalizedOriginal === normalizedGenerated && original !== generated) {
          violations.push({
            rule,
            ruleType: 'refactor',
            description: 'Formatting-only changes detected',
            severity: 'warning',
            details: 'Code was reformatted without changing functionality',
            lineNumbers: changedLines
          });
        }
        break;
      }
    }
  }

  return violations;
}

function validateDependenciesRule(rule: DependenciesRule, original: string, generated: string, diff: DiffResult): Violation[] {
  const violations: Violation[] = [];
  const changedLines = getChangedLineNumbers(diff);

  const addedContent = diff.changes.filter(c => c.type === 'added').map(c => c.value).join('\n');

  // Extract imports from added content
  const importPatterns = [
    /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g,  // ES6 imports
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,     // CommonJS requires
    /from\s+(\S+)\s+import/g,                     // Python imports
    /import\s+(\S+)/g                             // Simple imports
  ];

  const newImports: string[] = [];

  for (const pattern of importPatterns) {
    let match;
    while ((match = pattern.exec(addedContent)) !== null) {
      const importName = match[1].split('/')[0].replace(/^@/, '');
      if (!newImports.includes(importName)) {
        newImports.push(importName);
      }
    }
  }

  // Check against allowed list
  if (rule.allowed && rule.allowed.length > 0) {
    const notAllowed = newImports.filter(imp => {
      // Skip relative imports
      if (imp.startsWith('.')) {return false;}
      // Skip built-in modules
      const builtins = ['fs', 'path', 'http', 'https', 'os', 'util', 'events', 'stream', 'crypto'];
      if (builtins.includes(imp)) {return false;}

      return !rule.allowed!.some(allowed => imp === allowed || imp.startsWith(allowed + '/'));
    });

    for (const imp of notAllowed) {
      violations.push({
        rule,
        ruleType: 'dependencies',
        description: 'Unauthorized dependency added',
        severity: 'error',
        details: `The dependency "${imp}" is not in the allowed list: ${rule.allowed.join(', ')}`,
        lineNumbers: changedLines
      });
    }
  }

  // Check against forbidden list
  if (rule.forbidden && rule.forbidden.length > 0) {
    const forbidden = newImports.filter(imp =>
      rule.forbidden!.some(f => imp === f || imp.startsWith(f + '/'))
    );

    for (const imp of forbidden) {
      violations.push({
        rule,
        ruleType: 'dependencies',
        description: 'Forbidden dependency added',
        severity: 'error',
        details: `The dependency "${imp}" is in the forbidden list`,
        lineNumbers: changedLines
      });
    }
  }

  return violations;
}

function validateContentRule(rule: ContentRule, original: string, generated: string, diff: DiffResult): Violation[] {
  const violations: Violation[] = [];
  const changedLines = getChangedLineNumbers(diff);

  const addedContent = diff.changes.filter(c => c.type === 'added').map(c => c.value).join('\n');

  // Check forbidden content
  if (rule.forbid && rule.forbid.length > 0) {
    for (const forbidden of rule.forbid) {
      if (addedContent.includes(forbidden) && !original.includes(forbidden)) {
        violations.push({
          rule,
          ruleType: 'content',
          description: 'Forbidden content added',
          severity: 'error',
          details: `The content "${forbidden}" was added but is forbidden`,
          lineNumbers: changedLines
        });
      }
    }
  }

  // Check forbidden patterns
  if (rule.patterns?.deny && rule.patterns.deny.length > 0) {
    for (const pattern of rule.patterns.deny) {
      try {
        const regex = new RegExp(pattern, 'g');
        const matches = addedContent.match(regex);
        const originalMatches = original.match(regex);

        if (matches && (!originalMatches || matches.length > originalMatches.length)) {
          violations.push({
            rule,
            ruleType: 'content',
            description: 'Forbidden pattern detected',
            severity: 'error',
            details: `The pattern "${pattern}" was found in added content`,
            lineNumbers: changedLines
          });
        }
      } catch {
        // Invalid regex, skip
      }
    }
  }

  // Check required patterns
  if (rule.patterns?.allow && rule.patterns.allow.length > 0) {
    // This is informational - we check if new code follows allowed patterns
  }

  // Check require directive
  if (rule.require === 'use_existing_only' || rule.require === 'use_existing_patterns_only') {
    // Heuristic: check if the generated code introduces significantly new patterns
    const originalFunctions = extractFunctionNames(original);
    const generatedFunctions = extractFunctionNames(generated);

    const newFunctions = generatedFunctions.filter(f => !originalFunctions.includes(f));

    if (newFunctions.length > 3) {
      violations.push({
        rule,
        ruleType: 'content',
        description: 'Too many new constructs introduced',
        severity: 'warning',
        details: `${newFunctions.length} new functions/methods were introduced: ${newFunctions.slice(0, 5).join(', ')}${newFunctions.length > 5 ? '...' : ''}`,
        lineNumbers: changedLines
      });
    }
  }

  return violations;
}

function validateThresholdRule(rule: ThresholdRule, diff: DiffResult, filesChanged?: number): Violation[] {
  const violations: Violation[] = [];
  const changedLines = getChangedLineNumbers(diff);

  if (rule.max_lines_changed !== undefined && diff.totalLinesChanged > rule.max_lines_changed) {
    violations.push({
      rule,
      ruleType: 'threshold',
      description: 'Too many lines changed',
      severity: 'error',
      details: `Changed ${diff.totalLinesChanged} lines, maximum allowed is ${rule.max_lines_changed}`,
      lineNumbers: changedLines
    });
  }

  // Check max_files_changed (when filesChanged count is provided, e.g., from CLI)
  if (rule.max_files_changed !== undefined && filesChanged !== undefined && filesChanged > rule.max_files_changed) {
    violations.push({
      rule,
      ruleType: 'threshold',
      description: 'Too many files changed',
      severity: 'error',
      details: `Changed ${filesChanged} files, maximum allowed is ${rule.max_files_changed}`,
      lineNumbers: [1]
    });
  }

  return violations;
}

// Helper functions
function extractVariableNames(code: string): string[] {
  const patterns = [
    /(?:const|let|var)\s+(\w+)/g,
    /(\w+)\s*=/g,
    /function\s+(\w+)/g
  ];

  const names: string[] = [];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(code)) !== null) {
      if (match[1] && !names.includes(match[1])) {
        names.push(match[1]);
      }
    }
  }
  return names;
}

function extractFunctionNames(code: string): string[] {
  const patterns = [
    /function\s+(\w+)/g,
    /(\w+)\s*:\s*function/g,
    /(\w+)\s*=\s*function/g,
    /(\w+)\s*=\s*\(/g,
    /(\w+)\s*=\s*async\s*\(/g,
    /def\s+(\w+)/g,  // Python
    /(\w+)\s*\([^)]*\)\s*{/g
  ];

  const names: string[] = [];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(code)) !== null) {
      if (match[1] && !names.includes(match[1]) && match[1] !== 'if' && match[1] !== 'while' && match[1] !== 'for') {
        names.push(match[1]);
      }
    }
  }
  return names;
}

export function validateAgainstRules(
  original: string,
  generated: string,
  rules: RulesConfig,
  fileName?: string,
  filesChanged?: number  // Optional: total files changed (for multi-file validation)
): ValidationResult {
  const diff = computeDiff(original, generated);
  const violations: Violation[] = [];
  let requiresApproval = rules.global?.require_approval_for_all ?? true;

  for (const rule of rules.rules) {
    switch (rule.type) {
      case 'scope':
        violations.push(...validateScopeRule(rule, original, generated, diff, fileName));
        break;
      case 'refactor':
        violations.push(...validateRefactorRule(rule, original, generated, diff));
        break;
      case 'dependencies':
        violations.push(...validateDependenciesRule(rule, original, generated, diff));
        break;
      case 'content':
        violations.push(...validateContentRule(rule, original, generated, diff));
        break;
      case 'threshold':
        violations.push(...validateThresholdRule(rule, diff, filesChanged));
        if (rule.require_approval) {
          requiresApproval = true;
        }
        break;
    }
  }

  const hasErrors = violations.some(v => v.severity === 'error');

  return {
    valid: !hasErrors,
    violations,
    diff,
    requiresApproval
  };
}

export function formatDiffForDisplay(diff: DiffResult): string {
  let output = '';

  for (const change of diff.changes) {
    const lines = change.value.split('\n');
    for (const line of lines) {
      if (!line && lines.indexOf(line) === lines.length - 1) {continue;}

      switch (change.type) {
        case 'added':
          output += `+ ${line}\n`;
          break;
        case 'removed':
          output += `- ${line}\n`;
          break;
        default:
          output += `  ${line}\n`;
      }
    }
  }

  return output;
}
