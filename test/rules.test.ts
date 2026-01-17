import { generatePromptDirectives, validateRulesConfig, RulesConfig } from '../src/rules';

describe('Rules Module', () => {
  describe('generatePromptDirectives', () => {
    it('should return empty string for empty rules', () => {
      const rules: RulesConfig = { rules: [] };
      const result = generatePromptDirectives(rules);
      expect(result).toBe('');
    });

    it('should generate directives for scope rules', () => {
      const rules: RulesConfig = {
        rules: [
          {
            type: 'scope',
            description: 'Isolate to feature B',
            pattern: 'function addFeatureB',
            files: ['features.py']
          }
        ]
      };

      const result = generatePromptDirectives(rules);

      expect(result).toContain('SCOPE RESTRICTION');
      expect(result).toContain('Isolate to feature B');
      expect(result).toContain('features.py');
      expect(result).toContain('function addFeatureB');
    });

    it('should generate directives for refactor rules', () => {
      const rules: RulesConfig = {
        rules: [
          {
            type: 'refactor',
            forbid: ['variable_renames', 'add_error_handling']
          }
        ]
      };

      const result = generatePromptDirectives(rules);

      expect(result).toContain('REFACTORING RESTRICTIONS');
      expect(result).toContain('variable_renames');
      expect(result).toContain('add_error_handling');
    });

    it('should generate directives for dependencies rules', () => {
      const rules: RulesConfig = {
        rules: [
          {
            type: 'dependencies',
            allowed: ['numpy', 'pandas'],
            forbidden: ['tensorflow']
          }
        ]
      };

      const result = generatePromptDirectives(rules);

      expect(result).toContain('DEPENDENCY RULES');
      expect(result).toContain('numpy');
      expect(result).toContain('pandas');
      expect(result).toContain('tensorflow');
    });

    it('should generate directives for content rules', () => {
      const rules: RulesConfig = {
        rules: [
          {
            type: 'content',
            require: 'use_existing_only',
            forbid: ['console.log', 'debugger']
          }
        ]
      };

      const result = generatePromptDirectives(rules);

      expect(result).toContain('CONTENT RULES');
      expect(result).toContain('use_existing_only');
      expect(result).toContain('console.log');
      expect(result).toContain('debugger');
    });

    it('should generate directives for threshold rules', () => {
      const rules: RulesConfig = {
        rules: [
          {
            type: 'threshold',
            max_lines_changed: 10,
            require_approval: true
          }
        ]
      };

      const result = generatePromptDirectives(rules);

      expect(result).toContain('CHANGE THRESHOLDS');
      expect(result).toContain('10');
    });

    it('should handle multiple rules', () => {
      const rules: RulesConfig = {
        rules: [
          {
            type: 'scope',
            description: 'Test scope',
            files: ['test.ts']
          },
          {
            type: 'refactor',
            forbid: ['variable_renames']
          },
          {
            type: 'threshold',
            max_lines_changed: 50,
            require_approval: true
          }
        ]
      };

      const result = generatePromptDirectives(rules);

      expect(result).toContain('1. SCOPE RESTRICTION');
      expect(result).toContain('2. REFACTORING RESTRICTIONS');
      expect(result).toContain('3. CHANGE THRESHOLDS');
    });
  });

  describe('validateRulesConfig', () => {
    it('should return true for valid config', () => {
      const config: RulesConfig = {
        rules: [
          { type: 'scope', description: 'test', files: ['test.ts'] }
        ]
      };

      expect(validateRulesConfig(config)).toBe(true);
    });

    it('should return false for null', () => {
      expect(validateRulesConfig(null)).toBe(false);
    });

    it('should return false for non-object', () => {
      expect(validateRulesConfig('string')).toBe(false);
      expect(validateRulesConfig(123)).toBe(false);
    });

    it('should return false for missing rules array', () => {
      expect(validateRulesConfig({})).toBe(false);
      expect(validateRulesConfig({ rules: 'not-array' })).toBe(false);
    });

    it('should return false for invalid rule type', () => {
      const config = {
        rules: [
          { type: 'invalid_type' }
        ]
      };

      expect(validateRulesConfig(config)).toBe(false);
    });

    it('should return true for all valid rule types', () => {
      const config: RulesConfig = {
        rules: [
          { type: 'scope', description: 'test' },
          { type: 'refactor', forbid: [] },
          { type: 'dependencies', allowed: [] },
          { type: 'content', require: 'test' },
          { type: 'threshold', require_approval: true }
        ]
      };

      expect(validateRulesConfig(config)).toBe(true);
    });
  });
});
