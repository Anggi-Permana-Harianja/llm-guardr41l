import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Rule } from './rules';
import { LogEntry } from './metrics-calculator';

export interface RejectionExample {
  logId: string;
  timestamp: string;
  content: string;
  fileName?: string;
}

export interface RejectionPattern {
  id: string;
  patternType: 'content' | 'dependency' | 'scope' | 'refactor';
  description: string;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  examples: RejectionExample[];
  suggestedRule?: Rule;
}

export interface RejectionAnalysis {
  patterns: RejectionPattern[];
  totalRejections: number;
  analyzedPeriod: { start: string; end: string };
  lastAnalyzed: string;
}

export interface RuleSuggestion {
  pattern: RejectionPattern;
  rule: Rule;
  confidence: number;
  reason: string;
}

const REJECTION_ANALYSIS_FILENAME = 'rejection-analysis.json';

/**
 * Analyzes rejection patterns and suggests rules
 */
export class RejectionAnalyzer {
  private patterns: Map<string, RejectionPattern> = new Map();
  private suggestionThreshold: number;

  constructor(threshold: number = 3) {
    this.suggestionThreshold = threshold;
  }

  /**
   * Analyze log entries to find rejection patterns
   */
  public async analyze(logs: LogEntry[]): Promise<RejectionAnalysis> {
    const rejections = logs.filter(log => log.action === 'reject');

    // Reset patterns for fresh analysis
    this.patterns.clear();

    for (const rejection of rejections) {
      await this.analyzeRejection(rejection);
    }

    const timestamps = rejections.map(r => r.timestamp).sort();

    return {
      patterns: Array.from(this.patterns.values()),
      totalRejections: rejections.length,
      analyzedPeriod: {
        start: timestamps[0] || new Date().toISOString(),
        end: timestamps[timestamps.length - 1] || new Date().toISOString()
      },
      lastAnalyzed: new Date().toISOString()
    };
  }

  /**
   * Load patterns from existing analysis
   */
  public loadFromAnalysis(analysis: RejectionAnalysis): void {
    this.patterns.clear();
    for (const pattern of analysis.patterns) {
      this.patterns.set(pattern.id, pattern);
    }
  }

  /**
   * Analyze a single rejection and extract patterns
   */
  private async analyzeRejection(entry: LogEntry): Promise<void> {
    const content = entry.output || '';
    const originalContent = entry.context || '';

    // Extract content patterns (forbidden content that was added)
    const contentPatterns = this.detectForbiddenContent(originalContent, content);
    for (const pattern of contentPatterns) {
      this.addOrUpdatePattern(pattern, entry);
    }

    // Extract dependency patterns (unauthorized imports)
    const dependencyPatterns = this.detectUnauthorizedDependencies(originalContent, content);
    for (const pattern of dependencyPatterns) {
      this.addOrUpdatePattern(pattern, entry);
    }

    // Extract refactoring patterns
    const refactorPatterns = this.detectRefactoringPatterns(originalContent, content);
    for (const pattern of refactorPatterns) {
      this.addOrUpdatePattern(pattern, entry);
    }
  }

  private addOrUpdatePattern(pattern: RejectionPattern, entry: LogEntry): void {
    const existing = this.patterns.get(pattern.id);

    if (existing) {
      existing.occurrences++;
      existing.lastSeen = entry.timestamp;
      if (existing.examples.length < 5) {
        existing.examples.push({
          logId: entry.id,
          timestamp: entry.timestamp,
          content: pattern.examples[0]?.content || '',
          fileName: entry.metadata?.fileName
        });
      }
    } else {
      pattern.examples = [{
        logId: entry.id,
        timestamp: entry.timestamp,
        content: pattern.examples[0]?.content || '',
        fileName: entry.metadata?.fileName
      }];
      this.patterns.set(pattern.id, pattern);
    }
  }

  /**
   * Detect common forbidden content patterns
   */
  private detectForbiddenContent(original: string, generated: string): RejectionPattern[] {
    const patterns: RejectionPattern[] = [];

    const forbiddenPatterns = [
      { regex: /console\.(log|debug|info|warn|error)\s*\(/g, name: 'console.log' },
      { regex: /debugger\s*;?/g, name: 'debugger' },
      { regex: /alert\s*\(/g, name: 'alert' },
      { regex: /eval\s*\(/g, name: 'eval' },
      { regex: /document\.write\s*\(/g, name: 'document.write' },
      { regex: /innerHTML\s*=/g, name: 'innerHTML' },
      { regex: /TODO:|FIXME:|HACK:/gi, name: 'TODO comments' }
    ];

    for (const { regex, name } of forbiddenPatterns) {
      const originalMatches = original.match(regex) || [];
      const generatedMatches = generated.match(regex) || [];

      // Only flag if new instances were added
      if (generatedMatches.length > originalMatches.length) {
        patterns.push({
          id: `content:${name}`,
          patternType: 'content',
          description: `Added forbidden content: ${name}`,
          occurrences: 1,
          firstSeen: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
          examples: [{ logId: '', timestamp: '', content: name }],
          suggestedRule: {
            type: 'content',
            description: `Forbid ${name}`,
            forbid: [name.includes('console') ? 'console.log' : name]
          }
        });
      }
    }

    return patterns;
  }

  /**
   * Detect unauthorized dependency additions
   */
  private detectUnauthorizedDependencies(original: string, generated: string): RejectionPattern[] {
    const patterns: RejectionPattern[] = [];

    // Extract imports from generated content that weren't in original
    const importPatterns = [
      /import\s+.*?\s+from\s+['"]([^'"./][^'"]*)['"]/g,
      /require\s*\(\s*['"]([^'"./][^'"]*)['"]\s*\)/g
    ];

    const originalImports = new Set<string>();
    const generatedImports = new Set<string>();

    for (const pattern of importPatterns) {
      let match;
      const originalRegex = new RegExp(pattern.source, pattern.flags);
      while ((match = originalRegex.exec(original)) !== null) {
        originalImports.add(match[1].split('/')[0]);
      }

      const generatedRegex = new RegExp(pattern.source, pattern.flags);
      while ((match = generatedRegex.exec(generated)) !== null) {
        generatedImports.add(match[1].split('/')[0]);
      }
    }

    // Find new imports
    for (const imp of generatedImports) {
      if (!originalImports.has(imp)) {
        // Skip common built-ins
        const builtins = ['fs', 'path', 'http', 'https', 'os', 'util', 'events', 'stream', 'crypto', 'url', 'querystring'];
        if (builtins.includes(imp)) {
          continue;
        }

        patterns.push({
          id: `dependency:${imp}`,
          patternType: 'dependency',
          description: `Added unauthorized dependency: ${imp}`,
          occurrences: 1,
          firstSeen: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
          examples: [{ logId: '', timestamp: '', content: imp }],
          suggestedRule: {
            type: 'dependencies',
            description: `Forbid ${imp}`,
            forbidden: [imp]
          }
        });
      }
    }

    return patterns;
  }

  /**
   * Detect common refactoring patterns
   */
  private detectRefactoringPatterns(original: string, generated: string): RejectionPattern[] {
    const patterns: RejectionPattern[] = [];

    // Check for added try-catch blocks
    const originalTryCatch = (original.match(/try\s*{/g) || []).length;
    const generatedTryCatch = (generated.match(/try\s*{/g) || []).length;

    if (generatedTryCatch > originalTryCatch) {
      patterns.push({
        id: 'refactor:error_handling',
        patternType: 'refactor',
        description: 'Added unsolicited error handling',
        occurrences: 1,
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        examples: [{ logId: '', timestamp: '', content: 'try-catch block' }],
        suggestedRule: {
          type: 'refactor',
          description: 'Prevent adding error handling',
          forbid: ['add_error_handling']
        }
      });
    }

    // Check for added comments
    const originalComments = (original.match(/\/\/|\/\*|\*\//g) || []).length;
    const generatedComments = (generated.match(/\/\/|\/\*|\*\//g) || []).length;

    if (generatedComments > originalComments + 3) {
      patterns.push({
        id: 'refactor:comments',
        patternType: 'refactor',
        description: 'Added unsolicited comments',
        occurrences: 1,
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        examples: [{ logId: '', timestamp: '', content: 'comments' }],
        suggestedRule: {
          type: 'refactor',
          description: 'Prevent adding comments',
          forbid: ['add_comments']
        }
      });
    }

    return patterns;
  }

  /**
   * Get rule suggestions based on patterns that exceed threshold
   */
  public getSuggestedRules(): RuleSuggestion[] {
    const suggestions: RuleSuggestion[] = [];

    for (const pattern of this.patterns.values()) {
      if (pattern.occurrences >= this.suggestionThreshold && pattern.suggestedRule) {
        suggestions.push({
          pattern,
          rule: pattern.suggestedRule,
          confidence: Math.min(pattern.occurrences / 10, 1),
          reason: `Pattern "${pattern.description}" was rejected ${pattern.occurrences} times`
        });
      }
    }

    // Sort by occurrences (most common first)
    return suggestions.sort((a, b) => b.pattern.occurrences - a.pattern.occurrences);
  }

  /**
   * Check if there are new suggestions to show
   */
  public hasNewSuggestions(): boolean {
    return this.getSuggestedRules().length > 0;
  }
}

/**
 * Get the path to the rejection analysis file
 */
function getAnalysisFilePath(): string | undefined {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return undefined;
  }

  const guardrailDir = path.join(workspaceFolders[0].uri.fsPath, '.llm-guardrail');
  return path.join(guardrailDir, REJECTION_ANALYSIS_FILENAME);
}

/**
 * Save rejection analysis to file
 */
export function saveRejectionAnalysis(analysis: RejectionAnalysis): void {
  const filePath = getAnalysisFilePath();
  if (!filePath) {
    return;
  }

  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filePath, JSON.stringify(analysis, null, 2));
}

/**
 * Load rejection analysis from file
 */
export function loadRejectionAnalysis(): RejectionAnalysis | null {
  const filePath = getAnalysisFilePath();
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Show rule suggestions to the user
 */
export async function showRuleSuggestions(suggestions: RuleSuggestion[]): Promise<void> {
  if (suggestions.length === 0) {
    vscode.window.showInformationMessage('No rule suggestions at this time.');
    return;
  }

  const items = suggestions.map(s => ({
    label: s.pattern.description,
    description: `${s.pattern.occurrences} occurrences, ${Math.round(s.confidence * 100)}% confidence`,
    detail: s.reason,
    suggestion: s
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select rules to add to your rules.yaml',
    canPickMany: true,
    title: 'Guardrail: Rule Suggestions'
  });

  if (selected && selected.length > 0) {
    // TODO: Actually add the rules to rules.yaml
    const ruleDescriptions = selected.map(s => s.suggestion.rule.type).join(', ');
    vscode.window.showInformationMessage(
      `Would add ${selected.length} rule(s): ${ruleDescriptions}. (Feature coming soon)`
    );
  }
}
