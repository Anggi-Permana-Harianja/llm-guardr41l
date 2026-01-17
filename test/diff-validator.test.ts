import { computeDiff, validateAgainstRules, formatDiffForDisplay } from '../src/diff-validator';
import { RulesConfig } from '../src/rules';

describe('Diff Validator Module', () => {
  describe('computeDiff', () => {
    it('should detect no changes for identical content', () => {
      const original = 'const x = 1;\nconst y = 2;';
      const generated = 'const x = 1;\nconst y = 2;';

      const result = computeDiff(original, generated);

      expect(result.linesAdded).toBe(0);
      expect(result.linesRemoved).toBe(0);
      expect(result.totalLinesChanged).toBe(0);
    });

    it('should detect added lines', () => {
      const original = 'const x = 1;';
      const generated = 'const x = 1;\nconst y = 2;';

      const result = computeDiff(original, generated);

      expect(result.linesAdded).toBeGreaterThan(0);
      expect(result.changes.some(c => c.type === 'added')).toBe(true);
    });

    it('should detect removed lines', () => {
      const original = 'const x = 1;\nconst y = 2;';
      const generated = 'const x = 1;';

      const result = computeDiff(original, generated);

      expect(result.linesRemoved).toBeGreaterThan(0);
      expect(result.changes.some(c => c.type === 'removed')).toBe(true);
    });

    it('should detect modified lines', () => {
      const original = 'const x = 1;';
      const generated = 'const x = 2;';

      const result = computeDiff(original, generated);

      expect(result.totalLinesChanged).toBeGreaterThan(0);
    });

    it('should count multiple changes correctly', () => {
      const original = 'line1\nline2\nline3';
      const generated = 'line1\nnewline\nline3\nline4';

      const result = computeDiff(original, generated);

      expect(result.totalLinesChanged).toBeGreaterThan(0);
    });
  });

  describe('validateAgainstRules', () => {
    it('should pass validation with no rules', () => {
      const rules: RulesConfig = { rules: [] };
      const original = 'const x = 1;';
      const generated = 'const x = 2;';

      const result = validateAgainstRules(original, generated, rules);

      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should detect threshold violation', () => {
      const rules: RulesConfig = {
        rules: [
          {
            type: 'threshold',
            max_lines_changed: 1,
            require_approval: true
          }
        ]
      };
      const original = 'line1\nline2\nline3';
      const generated = 'newline1\nnewline2\nnewline3\nnewline4\nnewline5';

      const result = validateAgainstRules(original, generated, rules);

      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0].ruleType).toBe('threshold');
    });

    it('should detect forbidden dependency', () => {
      const rules: RulesConfig = {
        rules: [
          {
            type: 'dependencies',
            forbidden: ['moment']
          }
        ]
      };
      const original = '';
      const generated = "import moment from 'moment';";

      const result = validateAgainstRules(original, generated, rules);

      expect(result.violations.some(v => v.ruleType === 'dependencies')).toBe(true);
    });

    it('should detect unauthorized dependency', () => {
      const rules: RulesConfig = {
        rules: [
          {
            type: 'dependencies',
            allowed: ['lodash', 'axios']
          }
        ]
      };
      const original = '';
      const generated = "import express from 'express';";

      const result = validateAgainstRules(original, generated, rules);

      expect(result.violations.some(v => v.ruleType === 'dependencies')).toBe(true);
    });

    it('should allow authorized dependency', () => {
      const rules: RulesConfig = {
        rules: [
          {
            type: 'dependencies',
            allowed: ['lodash']
          }
        ]
      };
      const original = '';
      const generated = "import lodash from 'lodash';";

      const result = validateAgainstRules(original, generated, rules);

      const depViolations = result.violations.filter(v => v.ruleType === 'dependencies');
      expect(depViolations).toHaveLength(0);
    });

    it('should detect forbidden content', () => {
      const rules: RulesConfig = {
        rules: [
          {
            type: 'content',
            forbid: ['console.log']
          }
        ]
      };
      const original = 'function test() {}';
      const generated = 'function test() { console.log("debug"); }';

      const result = validateAgainstRules(original, generated, rules);

      expect(result.violations.some(v => v.ruleType === 'content')).toBe(true);
    });

    it('should not flag existing forbidden content', () => {
      const rules: RulesConfig = {
        rules: [
          {
            type: 'content',
            forbid: ['console.log']
          }
        ]
      };
      const original = 'function test() { console.log("existing"); }';
      const generated = 'function test() { console.log("existing"); }';

      const result = validateAgainstRules(original, generated, rules);

      const contentViolations = result.violations.filter(v => v.ruleType === 'content');
      expect(contentViolations).toHaveLength(0);
    });

    it('should detect scope violation for files', () => {
      const rules: RulesConfig = {
        rules: [
          {
            type: 'scope',
            description: 'Only modify utils',
            files: ['utils.ts']
          }
        ]
      };
      const original = 'const x = 1;';
      const generated = 'const x = 2;';

      const result = validateAgainstRules(original, generated, rules, 'main.ts');

      expect(result.violations.some(v => v.ruleType === 'scope')).toBe(true);
    });

    it('should pass scope check for allowed files', () => {
      const rules: RulesConfig = {
        rules: [
          {
            type: 'scope',
            description: 'Only modify utils',
            files: ['utils.ts']
          }
        ]
      };
      const original = 'const x = 1;';
      const generated = 'const x = 2;';

      const result = validateAgainstRules(original, generated, rules, 'utils.ts');

      const scopeViolations = result.violations.filter(v => v.ruleType === 'scope' && v.description.includes('outside allowed scope'));
      expect(scopeViolations).toHaveLength(0);
    });

    it('should detect possible variable renames', () => {
      const rules: RulesConfig = {
        rules: [
          {
            type: 'refactor',
            forbid: ['variable_renames']
          }
        ]
      };
      const original = 'const myVariable = 1;';
      const generated = 'const renamedVar = 1;';

      const result = validateAgainstRules(original, generated, rules);

      expect(result.violations.some(v => v.ruleType === 'refactor')).toBe(true);
    });

    it('should detect unsolicited error handling', () => {
      const rules: RulesConfig = {
        rules: [
          {
            type: 'refactor',
            forbid: ['add_error_handling']
          }
        ]
      };
      const original = 'async function fetch() { return data; }';
      const generated = 'async function fetch() { try { return data; } catch (e) { throw e; } }';

      const result = validateAgainstRules(original, generated, rules);

      expect(result.violations.some(v => v.ruleType === 'refactor')).toBe(true);
    });

    it('should set requiresApproval based on global config', () => {
      const rulesWithApproval: RulesConfig = {
        rules: [],
        global: {
          require_approval_for_all: true
        }
      };

      const rulesWithoutApproval: RulesConfig = {
        rules: [],
        global: {
          require_approval_for_all: false
        }
      };

      const original = 'const x = 1;';
      const generated = 'const x = 2;';

      const resultWithApproval = validateAgainstRules(original, generated, rulesWithApproval);
      const resultWithoutApproval = validateAgainstRules(original, generated, rulesWithoutApproval);

      expect(resultWithApproval.requiresApproval).toBe(true);
      expect(resultWithoutApproval.requiresApproval).toBe(false);
    });
  });

  describe('formatDiffForDisplay', () => {
    it('should format added lines with + prefix', () => {
      const diff = computeDiff('line1', 'line1\nline2');
      const formatted = formatDiffForDisplay(diff);

      expect(formatted).toContain('+');
    });

    it('should format removed lines with - prefix', () => {
      const diff = computeDiff('line1\nline2', 'line1');
      const formatted = formatDiffForDisplay(diff);

      expect(formatted).toContain('-');
    });

    it('should format unchanged lines with space prefix', () => {
      const diff = computeDiff('unchanged', 'unchanged');
      const formatted = formatDiffForDisplay(diff);

      expect(formatted).toContain('  unchanged');
    });
  });
});
