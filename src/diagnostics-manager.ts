import * as vscode from 'vscode';
import { Violation, DiffChange } from './diff-validator';

/**
 * Manages VS Code diagnostics (inline squiggles) for rule violations.
 * Replaces popup notifications with Problems panel integration.
 */
export class DiagnosticsManager {
  private diagnosticCollection: vscode.DiagnosticCollection;
  private statusBarItem: vscode.StatusBarItem;
  private currentViolationCount: number = 0;

  constructor() {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('llm-guardrail');
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      99 // Just below the monitor status bar (priority 100)
    );
    this.statusBarItem.command = 'llm-guardrail.showProblemsPanel';
    this.updateStatusBar(0);
  }

  /**
   * Update diagnostics for a document based on violations
   */
  public updateDiagnostics(
    document: vscode.TextDocument,
    violations: Violation[],
    diffChanges?: DiffChange[]
  ): void {
    const diagnostics: vscode.Diagnostic[] = [];

    for (const violation of violations) {
      const diagnostic = this.violationToDiagnostic(document, violation, diffChanges);
      diagnostics.push(diagnostic);
    }

    this.diagnosticCollection.set(document.uri, diagnostics);
    this.updateStatusBar(violations.length);
  }

  /**
   * Convert a Violation to a VS Code Diagnostic
   */
  private violationToDiagnostic(
    document: vscode.TextDocument,
    violation: Violation,
    diffChanges?: DiffChange[]
  ): vscode.Diagnostic {
    // Determine the range for the diagnostic
    let range: vscode.Range;

    if (violation.lineNumbers && violation.lineNumbers.length > 0) {
      // Use specific line numbers if available
      const startLine = Math.max(0, violation.lineNumbers[0] - 1); // Convert to 0-indexed
      const endLine = Math.max(0, violation.lineNumbers[violation.lineNumbers.length - 1] - 1);
      const safeEndLine = Math.min(endLine, document.lineCount - 1);

      range = new vscode.Range(
        startLine, 0,
        safeEndLine, document.lineAt(safeEndLine).text.length
      );
    } else if (diffChanges) {
      // Try to find range from diff changes
      range = this.getRangeFromDiff(document, diffChanges);
    } else {
      // Default to first line of document
      range = new vscode.Range(0, 0, 0, document.lineAt(0).text.length);
    }

    const severity = violation.severity === 'error'
      ? vscode.DiagnosticSeverity.Error
      : vscode.DiagnosticSeverity.Warning;

    const message = violation.details
      ? `${violation.description}\n${violation.details}`
      : violation.description;

    const diagnostic = new vscode.Diagnostic(range, message, severity);

    diagnostic.source = 'LLM Guardrail';
    diagnostic.code = violation.ruleType;

    return diagnostic;
  }

  /**
   * Try to determine range from diff changes (for added lines)
   */
  private getRangeFromDiff(
    document: vscode.TextDocument,
    diffChanges: DiffChange[]
  ): vscode.Range {
    const addedChanges = diffChanges.filter(c => c.type === 'added');

    if (addedChanges.length > 0 && addedChanges[0].lineNumber !== undefined) {
      const startLine = Math.max(0, addedChanges[0].lineNumber - 1);
      const lastChange = addedChanges[addedChanges.length - 1];
      const endLine = Math.max(0,
        (lastChange.lineNumber || 1) + (lastChange.count || 1) - 2
      );
      const safeEndLine = Math.min(endLine, document.lineCount - 1);

      return new vscode.Range(
        startLine, 0,
        safeEndLine, document.lineAt(safeEndLine).text.length
      );
    }

    // Default to first line
    return new vscode.Range(0, 0, 0, document.lineAt(0).text.length);
  }

  /**
   * Update the status bar with violation count
   */
  private updateStatusBar(count: number): void {
    this.currentViolationCount = count;

    if (count === 0) {
      this.statusBarItem.text = '$(check) Guardrail: Clean';
      this.statusBarItem.backgroundColor = undefined;
      this.statusBarItem.tooltip = 'No violations detected';
    } else {
      const icon = '$(warning)';
      this.statusBarItem.text = `${icon} Guardrail: ${count} violation${count !== 1 ? 's' : ''}`;
      this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      this.statusBarItem.tooltip = `Click to view ${count} violation${count !== 1 ? 's' : ''} in Problems panel`;
    }

    this.statusBarItem.show();
  }

  /**
   * Clear diagnostics for a specific document
   */
  public clearDiagnostics(uri: vscode.Uri): void {
    this.diagnosticCollection.delete(uri);
    this.updateStatusBar(0);
  }

  /**
   * Clear all diagnostics
   */
  public clearAll(): void {
    this.diagnosticCollection.clear();
    this.updateStatusBar(0);
  }

  /**
   * Get current violation count
   */
  public getViolationCount(): number {
    return this.currentViolationCount;
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    this.diagnosticCollection.dispose();
    this.statusBarItem.dispose();
  }
}

// Singleton instance
let diagnosticsManager: DiagnosticsManager | null = null;

export function getDiagnosticsManager(): DiagnosticsManager {
  if (!diagnosticsManager) {
    diagnosticsManager = new DiagnosticsManager();
  }
  return diagnosticsManager;
}

export function disposeDiagnosticsManager(): void {
  if (diagnosticsManager) {
    diagnosticsManager.dispose();
    diagnosticsManager = null;
  }
}
