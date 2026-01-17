import * as vscode from 'vscode';
import { loadRules, RulesConfig } from './rules';
import { validateAgainstRules, ValidationResult } from './diff-validator';
import { logGeneration } from './logger';

export interface ChangeEvent {
  document: vscode.TextDocument;
  originalContent: string;
  newContent: string;
  changeSize: number;
  timestamp: number;
}

export interface MonitorConfig {
  enabled: boolean;
  minLinesChanged: number;
  minCharsChanged: number;
  debounceMs: number;
  ignoredPatterns: string[];
  autoRevertOnReject: boolean;
}

type PendingChangeHandler = (event: ChangeEvent, validation: ValidationResult) => void;

export class ChangeMonitor {
  private disposables: vscode.Disposable[] = [];
  private documentSnapshots: Map<string, string> = new Map();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private pendingChanges: Map<string, ChangeEvent> = new Map();
  private config: MonitorConfig;
  private rules: RulesConfig | null = null;
  private onPendingChange: PendingChangeHandler | null = null;
  private isProcessing: Set<string> = new Set();
  private statusBarItem: vscode.StatusBarItem;

  constructor() {
    this.config = this.loadConfig();
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.updateStatusBar();
  }

  private loadConfig(): MonitorConfig {
    const config = vscode.workspace.getConfiguration('llm-guardrail');
    return {
      enabled: config.get<boolean>('monitorEnabled', true),
      minLinesChanged: config.get<number>('monitorMinLines', 3),
      minCharsChanged: config.get<number>('monitorMinChars', 50),
      debounceMs: config.get<number>('monitorDebounceMs', 500),
      ignoredPatterns: config.get<string[]>('monitorIgnoredPatterns', [
        '*.md', '*.txt', '*.json', '*.yaml', '*.yml', '*.lock'
      ]),
      autoRevertOnReject: config.get<boolean>('monitorAutoRevert', true)
    };
  }

  private updateStatusBar(): void {
    if (this.config.enabled) {
      this.statusBarItem.text = '$(shield) Guardrail: ON';
      this.statusBarItem.tooltip = 'LLM Guardrail is monitoring code changes. Click to disable.';
      this.statusBarItem.backgroundColor = undefined;
    } else {
      this.statusBarItem.text = '$(shield) Guardrail: OFF';
      this.statusBarItem.tooltip = 'LLM Guardrail monitoring is disabled. Click to enable.';
      this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }
    this.statusBarItem.command = 'llm-guardrail.toggleMonitor';
    this.statusBarItem.show();
  }

  public async start(): Promise<void> {
    // Load rules
    this.rules = await loadRules();

    // Take initial snapshots of all open documents
    for (const document of vscode.workspace.textDocuments) {
      if (this.shouldMonitorDocument(document)) {
        this.documentSnapshots.set(document.uri.toString(), document.getText());
      }
    }

    // Listen for document opens
    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument((document) => {
        if (this.shouldMonitorDocument(document)) {
          this.documentSnapshots.set(document.uri.toString(), document.getText());
        }
      })
    );

    // Listen for document closes
    this.disposables.push(
      vscode.workspace.onDidCloseTextDocument((document) => {
        const uri = document.uri.toString();
        this.documentSnapshots.delete(uri);
        this.pendingChanges.delete(uri);
        this.clearDebounce(uri);
      })
    );

    // Listen for document changes
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        this.handleDocumentChange(event);
      })
    );

    // Listen for document saves (update snapshot after intentional save)
    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument((document) => {
        const uri = document.uri.toString();
        // Only update snapshot if there's no pending review
        if (!this.pendingChanges.has(uri)) {
          this.documentSnapshots.set(uri, document.getText());
        }
      })
    );

    // Listen for configuration changes
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('llm-guardrail')) {
          this.config = this.loadConfig();
          this.updateStatusBar();
        }
      })
    );

    console.log('ChangeMonitor started');
  }

  public stop(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
    this.documentSnapshots.clear();
    this.pendingChanges.clear();
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this.statusBarItem.dispose();
    console.log('ChangeMonitor stopped');
  }

  public setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    this.updateStatusBar();

    // Update VS Code settings
    vscode.workspace.getConfiguration('llm-guardrail').update(
      'monitorEnabled',
      enabled,
      vscode.ConfigurationTarget.Global
    );

    if (enabled) {
      vscode.window.showInformationMessage('LLM Guardrail monitoring enabled');
    } else {
      vscode.window.showInformationMessage('LLM Guardrail monitoring disabled');
    }
  }

  public toggle(): void {
    this.setEnabled(!this.config.enabled);
  }

  public isEnabled(): boolean {
    return this.config.enabled;
  }

  public onPendingChangeDetected(handler: PendingChangeHandler): void {
    this.onPendingChange = handler;
  }

  public async approveChange(documentUri: string): Promise<void> {
    const change = this.pendingChanges.get(documentUri);
    if (change) {
      // Update snapshot to new content
      this.documentSnapshots.set(documentUri, change.newContent);
      this.pendingChanges.delete(documentUri);
      this.isProcessing.delete(documentUri);
    }
  }

  public async rejectChange(documentUri: string): Promise<void> {
    const change = this.pendingChanges.get(documentUri);
    if (change && this.config.autoRevertOnReject) {
      const originalContent = change.originalContent;
      this.pendingChanges.delete(documentUri);
      this.isProcessing.delete(documentUri);

      // Find the editor and revert
      const editor = vscode.window.visibleTextEditors.find(
        e => e.document.uri.toString() === documentUri
      );

      if (editor) {
        // Temporarily disable monitoring to avoid triggering on revert
        const wasEnabled = this.config.enabled;
        this.config.enabled = false;

        await editor.edit(editBuilder => {
          const fullRange = new vscode.Range(
            editor.document.positionAt(0),
            editor.document.positionAt(editor.document.getText().length)
          );
          editBuilder.replace(fullRange, originalContent);
        });

        // Re-enable monitoring
        this.config.enabled = wasEnabled;

        // Update snapshot
        this.documentSnapshots.set(documentUri, originalContent);
      }
    } else {
      this.pendingChanges.delete(documentUri);
      this.isProcessing.delete(documentUri);
    }
  }

  public getPendingChange(documentUri: string): ChangeEvent | undefined {
    return this.pendingChanges.get(documentUri);
  }

  public updateSnapshot(documentUri: string, content: string): void {
    this.documentSnapshots.set(documentUri, content);
  }

  private shouldMonitorDocument(document: vscode.TextDocument): boolean {
    // Skip non-file schemes
    if (document.uri.scheme !== 'file') {
      return false;
    }

    // Skip ignored patterns
    const fileName = document.fileName;
    for (const pattern of this.config.ignoredPatterns) {
      if (this.matchesPattern(fileName, pattern)) {
        return false;
      }
    }

    return true;
  }

  private matchesPattern(fileName: string, pattern: string): boolean {
    // Simple glob matching
    const regex = new RegExp(
      '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$'
    );
    return regex.test(fileName) || regex.test(fileName.split('/').pop() || '');
  }

  private handleDocumentChange(event: vscode.TextDocumentChangeEvent): void {
    if (!this.config.enabled) {
      return;
    }

    const document = event.document;
    const uri = document.uri.toString();

    if (!this.shouldMonitorDocument(document)) {
      return;
    }

    // Skip if we're currently processing this document
    if (this.isProcessing.has(uri)) {
      return;
    }

    // Clear existing debounce timer
    this.clearDebounce(uri);

    // Set new debounce timer
    const timer = setTimeout(() => {
      this.processChange(document);
    }, this.config.debounceMs);

    this.debounceTimers.set(uri, timer);
  }

  private clearDebounce(uri: string): void {
    const timer = this.debounceTimers.get(uri);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(uri);
    }
  }

  private async processChange(document: vscode.TextDocument): Promise<void> {
    const uri = document.uri.toString();
    const originalContent = this.documentSnapshots.get(uri);

    if (originalContent === undefined) {
      // First time seeing this document, just snapshot it
      this.documentSnapshots.set(uri, document.getText());
      return;
    }

    const newContent = document.getText();

    // Skip if content hasn't actually changed
    if (originalContent === newContent) {
      return;
    }

    // Calculate change size
    const changeStats = this.calculateChangeStats(originalContent, newContent);

    // Check if change is significant enough to review
    if (!this.isSignificantChange(changeStats)) {
      // Small change, just update snapshot
      this.documentSnapshots.set(uri, newContent);
      return;
    }

    // Mark as processing to avoid re-triggering
    this.isProcessing.add(uri);

    // Create change event
    const changeEvent: ChangeEvent = {
      document,
      originalContent,
      newContent,
      changeSize: changeStats.totalChanged,
      timestamp: Date.now()
    };

    // Store pending change
    this.pendingChanges.set(uri, changeEvent);

    // Validate against rules
    if (this.rules) {
      const validation = validateAgainstRules(
        originalContent,
        newContent,
        this.rules,
        document.fileName.split('/').pop()
      );

      // Log the change
      logGeneration(
        '[Auto-detected change]',
        originalContent,
        newContent,
        validation.violations,
        this.rules,
        {
          fileName: document.fileName.split('/').pop(),
          linesChanged: changeStats.linesChanged
        }
      );

      // Notify handler
      if (this.onPendingChange) {
        this.onPendingChange(changeEvent, validation);
      }
    }
  }

  private calculateChangeStats(original: string, modified: string): {
    linesAdded: number;
    linesRemoved: number;
    linesChanged: number;
    charsAdded: number;
    charsRemoved: number;
    totalChanged: number;
  } {
    const originalLines = original.split('\n');
    const modifiedLines = modified.split('\n');

    const linesAdded = Math.max(0, modifiedLines.length - originalLines.length);
    const linesRemoved = Math.max(0, originalLines.length - modifiedLines.length);

    // Count actually changed lines (simple comparison)
    let changedCount = 0;
    const maxLen = Math.max(originalLines.length, modifiedLines.length);
    for (let i = 0; i < maxLen; i++) {
      if (originalLines[i] !== modifiedLines[i]) {
        changedCount++;
      }
    }

    const charsAdded = Math.max(0, modified.length - original.length);
    const charsRemoved = Math.max(0, original.length - modified.length);

    return {
      linesAdded,
      linesRemoved,
      linesChanged: changedCount,
      charsAdded,
      charsRemoved,
      totalChanged: charsAdded + charsRemoved
    };
  }

  private isSignificantChange(stats: {
    linesChanged: number;
    totalChanged: number;
  }): boolean {
    return (
      stats.linesChanged >= this.config.minLinesChanged ||
      stats.totalChanged >= this.config.minCharsChanged
    );
  }
}

// Singleton instance
let monitorInstance: ChangeMonitor | null = null;

export function getChangeMonitor(): ChangeMonitor {
  if (!monitorInstance) {
    monitorInstance = new ChangeMonitor();
  }
  return monitorInstance;
}

export function disposeChangeMonitor(): void {
  if (monitorInstance) {
    monitorInstance.stop();
    monitorInstance = null;
  }
}
