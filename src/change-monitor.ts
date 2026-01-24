import * as vscode from 'vscode';
import { loadRules, RulesConfig, rulesFileExists } from './rules';
import { validateAgainstRules, ValidationResult, Violation } from './diff-validator';
import { logGeneration } from './logger';
import { getDiagnosticsManager } from './diagnostics-manager';

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
  batchWindowMs: number;  // Time window to group multi-file changes
  ignoredPatterns: string[];
  autoRevertOnReject: boolean;
}

/**
 * Tracks a batch of file changes that happen within a time window
 * (likely from a single AI operation that modifies multiple files)
 */
export interface ChangeBatch {
  files: Set<string>;  // URIs of files changed in this batch
  startTime: number;
  totalLinesChanged: number;
}

type PendingChangeHandler = (event: ChangeEvent, validation: ValidationResult) => void;

/**
 * Stores a rejected change for potential undo
 */
export interface RejectedChange {
  documentUri: string;
  originalContent: string;
  rejectedContent: string;
  timestamp: number;
  fileName: string;
}

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
  // Store last rejected changes for undo (keyed by document URI)
  private rejectedChanges: Map<string, RejectedChange> = new Map();
  // Global stack of recent rejections for quick undo
  private rejectionHistory: RejectedChange[] = [];
  // Track multi-file change batches
  private currentBatch: ChangeBatch | null = null;
  private batchTimer: NodeJS.Timeout | null = null;
  // Track if rules are configured
  private hasRules: boolean = false;

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
      batchWindowMs: config.get<number>('monitorBatchWindowMs', 2000),  // 2 second window for multi-file changes
      ignoredPatterns: config.get<string[]>('monitorIgnoredPatterns', [
        '*.md', '*.txt', '*.json', '*.yaml', '*.yml', '*.lock'
      ]),
      autoRevertOnReject: config.get<boolean>('monitorAutoRevert', true)
    };
  }

  private updateStatusBar(): void {
    // Show OFF if no rules configured (takes priority)
    if (!this.hasRules) {
      this.statusBarItem.text = '$(shield) Guardrail: OFF';
      this.statusBarItem.tooltip = 'No rules.yaml configured. Click the "No Rules" warning to create one.';
      this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else if (this.config.enabled) {
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

  /**
   * Set whether rules are configured (affects status bar display)
   */
  public setHasRules(hasRules: boolean): void {
    this.hasRules = hasRules;
    this.updateStatusBar();
  }

  public async start(): Promise<void> {
    // Load rules
    this.rules = await loadRules();

    // Update rules status for status bar and diagnostics manager
    const hasRules = rulesFileExists();
    this.setHasRules(hasRules);
    getDiagnosticsManager().setHasRules(hasRules);

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

        // Clear diagnostics for closed document
        const diagnosticsManager = getDiagnosticsManager();
        diagnosticsManager.clearDiagnostics(document.uri);
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
        // Only update snapshot if there's no pending review AND no pending debounce
        // This prevents the race condition where save fires before debounce processes the change
        if (!this.pendingChanges.has(uri) && !this.debounceTimers.has(uri)) {
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

      // Clear diagnostics for this document
      const diagnosticsManager = getDiagnosticsManager();
      diagnosticsManager.clearDiagnostics(vscode.Uri.parse(documentUri));
    }
  }

  public async rejectChange(documentUri: string): Promise<boolean> {
    console.log('Guardrail: rejectChange called with URI:', documentUri);
    console.log('Guardrail: pendingChanges keys:', Array.from(this.pendingChanges.keys()));
    console.log('Guardrail: isProcessing keys:', Array.from(this.isProcessing));

    const change = this.pendingChanges.get(documentUri);

    // Clear diagnostics for this document
    const diagnosticsManager = getDiagnosticsManager();
    diagnosticsManager.clearDiagnostics(vscode.Uri.parse(documentUri));

    if (!change) {
      console.log('Guardrail: No pending change found for', documentUri);
      this.isProcessing.delete(documentUri);
      return false;
    }

    console.log('Guardrail: Found pending change, originalContent length:', change.originalContent.length);
    console.log('Guardrail: Found pending change, newContent length:', change.newContent.length);

    if (!this.config.autoRevertOnReject) {
      console.log('Guardrail: Auto-revert is disabled');
      this.pendingChanges.delete(documentUri);
      this.isProcessing.delete(documentUri);
      return false;
    }

    const originalContent = change.originalContent;
    const rejectedContent = change.newContent;

    // Store the rejected change for potential undo
    const rejectedChange: RejectedChange = {
      documentUri,
      originalContent,
      rejectedContent,
      timestamp: Date.now(),
      fileName: change.document.fileName.split('/').pop() || 'unknown'
    };
    this.rejectedChanges.set(documentUri, rejectedChange);
    this.rejectionHistory.unshift(rejectedChange);

    // Keep only last 10 rejections in history
    if (this.rejectionHistory.length > 10) {
      this.rejectionHistory.pop();
    }

    this.pendingChanges.delete(documentUri);
    this.isProcessing.delete(documentUri);

    // Temporarily disable monitoring to avoid triggering on revert
    const wasEnabled = this.config.enabled;
    this.config.enabled = false;

    try {
      // Use WorkspaceEdit for more reliable editing (works even if editor not visible)
      const uri = vscode.Uri.parse(documentUri);
      const document = await vscode.workspace.openTextDocument(uri);

      const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(document.getText().length)
      );

      const workspaceEdit = new vscode.WorkspaceEdit();
      workspaceEdit.replace(uri, fullRange, originalContent);

      const success = await vscode.workspace.applyEdit(workspaceEdit);

      if (success) {
        // Update snapshot
        this.documentSnapshots.set(documentUri, originalContent);
        console.log('Guardrail: Successfully reverted changes');
      } else {
        console.error('Guardrail: Failed to apply revert edit');
      }

      return success;
    } catch (error) {
      console.error('Guardrail: Error reverting changes:', error);
      return false;
    } finally {
      // Re-enable monitoring
      this.config.enabled = wasEnabled;
    }
  }

  /**
   * Undo the last rejection for a specific document
   */
  public async undoRejection(documentUri: string): Promise<boolean> {
    const rejectedChange = this.rejectedChanges.get(documentUri);

    if (!rejectedChange) {
      return false;
    }

    // Find the editor
    const editor = vscode.window.visibleTextEditors.find(
      e => e.document.uri.toString() === documentUri
    );

    if (!editor) {
      // Try to open the document
      try {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(documentUri));
        await vscode.window.showTextDocument(doc);
      } catch {
        return false;
      }
    }

    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor || activeEditor.document.uri.toString() !== documentUri) {
      return false;
    }

    // Temporarily disable monitoring
    const wasEnabled = this.config.enabled;
    this.config.enabled = false;

    // Restore the rejected content
    await activeEditor.edit(editBuilder => {
      const fullRange = new vscode.Range(
        activeEditor.document.positionAt(0),
        activeEditor.document.positionAt(activeEditor.document.getText().length)
      );
      editBuilder.replace(fullRange, rejectedChange.rejectedContent);
    });

    // Re-enable monitoring
    this.config.enabled = wasEnabled;

    // Update snapshot to the restored content
    this.documentSnapshots.set(documentUri, rejectedChange.rejectedContent);

    // Remove from rejected changes
    this.rejectedChanges.delete(documentUri);
    this.rejectionHistory = this.rejectionHistory.filter(r => r.documentUri !== documentUri);

    return true;
  }

  /**
   * Undo the most recent rejection across all documents
   */
  public async undoLastRejection(): Promise<boolean> {
    if (this.rejectionHistory.length === 0) {
      return false;
    }

    const lastRejection = this.rejectionHistory[0];
    return this.undoRejection(lastRejection.documentUri);
  }

  /**
   * Get the last rejected change for a document
   */
  public getLastRejectedChange(documentUri: string): RejectedChange | undefined {
    return this.rejectedChanges.get(documentUri);
  }

  /**
   * Get recent rejection history
   */
  public getRejectionHistory(): RejectedChange[] {
    return [...this.rejectionHistory];
  }

  /**
   * Check if there's a rejection that can be undone
   */
  public canUndoRejection(documentUri?: string): boolean {
    if (documentUri) {
      return this.rejectedChanges.has(documentUri);
    }
    return this.rejectionHistory.length > 0;
  }

  /**
   * Clear rejection history
   */
  public clearRejectionHistory(): void {
    this.rejectedChanges.clear();
    this.rejectionHistory = [];
  }

  public getPendingChange(documentUri: string): ChangeEvent | undefined {
    return this.pendingChanges.get(documentUri);
  }

  /**
   * Get all pending changes - useful for rejecting any pending change
   */
  public getAllPendingChanges(): Map<string, ChangeEvent> {
    return this.pendingChanges;
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

    // If we're currently processing this document, check if content actually changed
    // Only clear pending state if user made a real change (cut/edited without approving/rejecting)
    if (this.isProcessing.has(uri)) {
      const pendingChange = this.pendingChanges.get(uri);
      const currentContent = document.getText();

      console.log('Guardrail: handleDocumentChange - isProcessing=true for', uri);
      console.log('Guardrail: pendingChange exists:', !!pendingChange);
      if (pendingChange) {
        console.log('Guardrail: content matches pending:', currentContent === pendingChange.newContent);
      }

      // Only clear if content is different from what we're waiting to review
      if (pendingChange && currentContent !== pendingChange.newContent) {
        console.log('Guardrail: Content changed, clearing pending state');
        this.pendingChanges.delete(uri);
        this.isProcessing.delete(uri);
        // Clear old diagnostics since the code has changed
        const diagnosticsManager = getDiagnosticsManager();
        diagnosticsManager.clearDiagnostics(document.uri);
      } else {
        // Content hasn't changed from pending state, skip re-processing
        console.log('Guardrail: Content unchanged, skipping re-processing');
        return;
      }
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

    // Track this file in the current batch (for multi-file change detection)
    this.addToBatch(uri, changeStats.linesChanged);

    // Mark as processing to avoid re-triggering
    this.isProcessing.add(uri);
    console.log('Guardrail: processChange - added to isProcessing:', uri);

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
    console.log('Guardrail: processChange - stored pendingChange for:', uri);

    // Validate against rules
    if (this.rules) {
      const validation = validateAgainstRules(
        originalContent,
        newContent,
        this.rules,
        document.fileName.split('/').pop()
      );

      // Check for multi-file threshold violation
      const batchViolation = this.checkBatchThreshold();
      if (batchViolation) {
        validation.violations.push(batchViolation);
        validation.valid = false;
      }

      // Update inline diagnostics (squiggles in editor)
      const diagnosticsManager = getDiagnosticsManager();
      diagnosticsManager.updateDiagnostics(document, validation.violations, validation.diff.changes);

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

      // Notify handler (only if there are violations requiring attention)
      if (this.onPendingChange && validation.violations.length > 0) {
        this.onPendingChange(changeEvent, validation);
      }
    }
  }

  /**
   * Add a file to the current change batch (for multi-file detection)
   */
  private addToBatch(uri: string, linesChanged: number): void {
    const now = Date.now();

    // If no current batch or batch window expired, start a new batch
    if (!this.currentBatch || (now - this.currentBatch.startTime) > this.config.batchWindowMs) {
      this.currentBatch = {
        files: new Set(),
        startTime: now,
        totalLinesChanged: 0
      };
    }

    // Add this file to the batch
    this.currentBatch.files.add(uri);
    this.currentBatch.totalLinesChanged += linesChanged;

    // Reset the batch cleanup timer
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }
    this.batchTimer = setTimeout(() => {
      this.currentBatch = null;
    }, this.config.batchWindowMs);
  }

  /**
   * Check if the current batch exceeds max_files_changed threshold
   */
  private checkBatchThreshold(): Violation | null {
    if (!this.currentBatch || !this.rules) {
      return null;
    }

    // Find threshold rules with max_files_changed
    for (const rule of this.rules.rules) {
      if (rule.type === 'threshold' && 'max_files_changed' in rule) {
        const maxFiles = (rule as { max_files_changed?: number }).max_files_changed;
        if (maxFiles !== undefined && this.currentBatch.files.size > maxFiles) {
          return {
            rule,
            ruleType: 'threshold',
            description: 'Too many files changed',
            severity: 'error',
            details: `Changed ${this.currentBatch.files.size} files in this batch, maximum allowed is ${maxFiles}. Files: ${Array.from(this.currentBatch.files).map(f => f.split('/').pop()).join(', ')}`,
            lineNumbers: [1]
          };
        }
      }
    }

    return null;
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
