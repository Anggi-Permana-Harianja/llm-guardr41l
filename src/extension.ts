import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { loadRules, createDefaultRulesFile, getRulesFilePath, generateRulesInteractive, rulesFileExists, createOverrideFile, addExceptionsToRules } from './rules';
import { generateCode, isConfigured, getCurrentProvider, getCurrentModel } from './llm-proxy';
import { validateAgainstRules, ValidationResult } from './diff-validator';
import { logGeneration, logApproval, logRejection, logError, showLogsInEditor, getRecentLogs } from './logger';
import { getChangeMonitor, disposeChangeMonitor, ChangeEvent } from './change-monitor';
import { disposeDiagnosticsManager, getDiagnosticsManager } from './diagnostics-manager';
import { MetricsCalculator } from './metrics-calculator';
import { scanProjectInteractive } from './project-scanner';
import { GuardrailQuickFixProvider, registerQuickFixCommands } from './quick-fix-provider';

let currentPanel: vscode.WebviewPanel | undefined;
let dashboardPanel: vscode.WebviewPanel | undefined;
let currentValidation: ValidationResult | undefined;
let currentGeneratedCode: string | undefined;
let currentLogId: string | undefined;
let currentEditor: vscode.TextEditor | undefined;
let currentDocumentUri: string | undefined;
let isMonitoredChange: boolean = false;
let missingRulesStatusBar: vscode.StatusBarItem | undefined;

export function activate(context: vscode.ExtensionContext) {
  console.log('LLM Guardrail extension is now active');

  // Initialize and start the change monitor
  const monitor = getChangeMonitor();
  monitor.start();

  // Set up handler for detected changes
  monitor.onPendingChangeDetected((changeEvent: ChangeEvent, validation: ValidationResult) => {
    console.log('Guardrail: onPendingChangeDetected callback fired');
    console.log('Guardrail: violations count:', validation.violations.length);
    handleMonitoredChange(context, changeEvent, validation);
  });

  // Register the main command
  const generateCodeCommand = vscode.commands.registerCommand(
    'llm-guardrail.generateCode',
    async () => {
      await handleGenerateCode(context);
    }
  );

  // Register edit rules command
  const editRulesCommand = vscode.commands.registerCommand(
    'llm-guardrail.editRules',
    async () => {
      await handleEditRules();
    }
  );

  // Register view logs command
  const viewLogsCommand = vscode.commands.registerCommand(
    'llm-guardrail.viewLogs',
    async () => {
      await showLogsInEditor();
    }
  );

  // Register toggle monitor command
  const toggleMonitorCommand = vscode.commands.registerCommand(
    'llm-guardrail.toggleMonitor',
    () => {
      monitor.toggle();
    }
  );

  // Register approve change command
  const approveChangeCommand = vscode.commands.registerCommand(
    'llm-guardrail.approveChange',
    async () => {
      if (isMonitoredChange && currentDocumentUri) {
        await handleMonitorApprove();
      } else {
        await handleApprove();
      }
    }
  );

  // Register reject change command
  const rejectChangeCommand = vscode.commands.registerCommand(
    'llm-guardrail.rejectChange',
    async () => {
      const monitor = getChangeMonitor();
      const allPending = monitor.getAllPendingChanges();

      console.log('Guardrail: Reject command - pending changes count:', allPending.size);

      // Just reject the first pending change we find
      for (const [uri, _change] of allPending) {
        console.log('Guardrail: Reject command - rejecting URI:', uri);
        const success = await monitor.rejectChange(uri);
        if (success) {
          vscode.window.showInformationMessage('Changes rejected and reverted');
          const diagnosticsManager = getDiagnosticsManager();
          diagnosticsManager.clearDiagnostics(vscode.Uri.parse(uri));
          resetState();
          return;
        }
      }

      // Nothing worked - show error
      vscode.window.showWarningMessage('No pending changes to revert. Use Cmd+Z to undo manually.');
      resetState();
    }
  );

  // Register generate rules command
  const generateRulesCommand = vscode.commands.registerCommand(
    'llm-guardrail.generateRules',
    async () => {
      await generateRulesInteractive();
    }
  );

  // Register show review panel command (opens Review panel for pending changes)
  const showReviewCommand = vscode.commands.registerCommand(
    'llm-guardrail.showReviewPanel',
    () => {
      // If there's a pending change, show the review panel
      if (currentValidation && currentDocumentUri) {
        const monitor = getChangeMonitor();
        const pendingChange = monitor.getPendingChange(currentDocumentUri);
        if (pendingChange) {
          const fileName = path.basename(pendingChange.document.fileName);
          showDiffPreview(context, {
            original: pendingChange.originalContent,
            generated: pendingChange.newContent,
            violations: currentValidation.violations.map(v => ({
              ruleType: v.ruleType,
              description: v.description,
              severity: v.severity,
              details: v.details,
              lineNumbers: v.lineNumbers
            })),
            diff: {
              linesAdded: currentValidation.diff.linesAdded,
              linesRemoved: currentValidation.diff.linesRemoved,
              totalLinesChanged: currentValidation.diff.totalLinesChanged
            },
            fileName,
            requiresApproval: currentValidation.requiresApproval,
            valid: currentValidation.valid
          });
          return;
        }
      }
      vscode.window.showInformationMessage('No pending changes to review.');
    }
  );

  // Register show dashboard command
  const showDashboardCommand = vscode.commands.registerCommand(
    'llm-guardrail.showDashboard',
    async () => {
      await showMetricsDashboard(context);
    }
  );

  // Register scan project command
  const scanProjectCommand = vscode.commands.registerCommand(
    'llm-guardrail.scanProject',
    async () => {
      await scanProjectInteractive();
    }
  );

  // Register undo rejection command
  const undoRejectionCommand = vscode.commands.registerCommand(
    'llm-guardrail.undoRejection',
    async () => {
      const success = await monitor.undoLastRejection();
      if (success) {
        vscode.window.showInformationMessage('Rejection undone. Changes restored.');
      } else {
        vscode.window.showWarningMessage('No rejection to undo.');
      }
    }
  );

  // Register create override file command
  const createOverrideCommand = vscode.commands.registerCommand(
    'llm-guardrail.createOverride',
    async () => {
      await createOverrideFile();
    }
  );

  // Register reload rules command (used by quick fixes)
  const reloadRulesCommand = vscode.commands.registerCommand(
    'llm-guardrail.reloadRules',
    async () => {
      // Reload rules in the monitor
      await monitor.start();
      vscode.window.showInformationMessage('Rules reloaded.');
    }
  );

  // Register Quick Fix provider for code actions
  const quickFixProvider = vscode.languages.registerCodeActionsProvider(
    { scheme: 'file' },
    new GuardrailQuickFixProvider(),
    {
      providedCodeActionKinds: GuardrailQuickFixProvider.providedCodeActionKinds
    }
  );

  // Register quick fix commands
  registerQuickFixCommands(context);

  context.subscriptions.push(
    generateCodeCommand,
    editRulesCommand,
    viewLogsCommand,
    toggleMonitorCommand,
    approveChangeCommand,
    rejectChangeCommand,
    generateRulesCommand,
    showReviewCommand,
    showDashboardCommand,
    scanProjectCommand,
    undoRejectionCommand,
    createOverrideCommand,
    reloadRulesCommand,
    quickFixProvider
  );

  // Set up missing rules status bar and file watcher
  setupMissingRulesWarning(context);
}

/**
 * Creates a status bar warning when rules.yaml is missing.
 * The warning is clickable and disappears once rules are created.
 */
function setupMissingRulesWarning(context: vscode.ExtensionContext): void {
  // Only set up if workspace is open
  if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
    return;
  }

  // Create the status bar item (positioned to the left of the main guardrail status)
  missingRulesStatusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    99  // Slightly lower priority than main status bar (100)
  );
  missingRulesStatusBar.command = 'llm-guardrail.generateRules';
  context.subscriptions.push(missingRulesStatusBar);

  // Update status bar based on current state
  updateMissingRulesStatusBar();

  // Watch for rules.yaml creation/deletion
  const rulesPattern = new vscode.RelativePattern(
    vscode.workspace.workspaceFolders[0],
    'rules.yaml'
  );
  const watcher = vscode.workspace.createFileSystemWatcher(rulesPattern);

  watcher.onDidCreate(() => updateMissingRulesStatusBar());
  watcher.onDidDelete(() => updateMissingRulesStatusBar());

  context.subscriptions.push(watcher);
}

/**
 * Updates the missing rules status bar visibility and appearance.
 * Also syncs the diagnostics manager to show/hide "Clean" status accordingly.
 */
function updateMissingRulesStatusBar(): void {
  const hasRules = rulesFileExists();

  // Sync change monitor - show "OFF" when no rules
  getChangeMonitor().setHasRules(hasRules);

  // Sync diagnostics manager - hide "Clean" status when no rules
  getDiagnosticsManager().setHasRules(hasRules);

  if (!missingRulesStatusBar) {
    return;
  }

  if (!hasRules) {
    missingRulesStatusBar.text = '$(warning) No Rules';
    missingRulesStatusBar.tooltip = 'No rules.yaml found. Click to create one and start protecting your code.';
    missingRulesStatusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    missingRulesStatusBar.show();
  } else {
    missingRulesStatusBar.hide();
  }
}

async function handleMonitoredChange(
  context: vscode.ExtensionContext,
  changeEvent: ChangeEvent,
  validation: ValidationResult
): Promise<void> {
  // Store state for monitored change
  currentValidation = validation;
  currentGeneratedCode = changeEvent.newContent;
  currentDocumentUri = changeEvent.document.uri.toString();
  isMonitoredChange = true;

  // Find the editor for this document
  currentEditor = vscode.window.visibleTextEditors.find(
    e => e.document.uri.toString() === currentDocumentUri
  );

  // Violations are shown via:
  // 1. Status bar: "Guardrail: X violations" (clickable to open Review)
  // 2. Inline squiggles in editor
  // No auto-open, no popup - user clicks status bar to review
}

async function handleMonitorApprove(): Promise<void> {
  if (!currentDocumentUri) {
    return;
  }

  const monitor = getChangeMonitor();
  await monitor.approveChange(currentDocumentUri);

  vscode.window.showInformationMessage('Changes approved');

  if (currentPanel) {
    currentPanel.dispose();
  }

  resetState();
}

async function handleMonitorReject(): Promise<void> {
  if (!currentDocumentUri) {
    return;
  }

  const monitor = getChangeMonitor();
  const success = await monitor.rejectChange(currentDocumentUri);

  if (success) {
    vscode.window.showInformationMessage('Changes rejected and reverted');
  } else {
    vscode.window.showWarningMessage('Changes rejected but revert failed - please undo manually (Cmd+Z)');
  }

  if (currentPanel) {
    currentPanel.dispose();
  }

  resetState();
}

async function handleGenerateCode(context: vscode.ExtensionContext): Promise<void> {
  // Check if configured
  if (!isConfigured()) {
    const action = await vscode.window.showErrorMessage(
      `No API key configured for ${getCurrentProvider()}. Please set it in settings.`,
      'Open Settings'
    );
    if (action === 'Open Settings') {
      await vscode.commands.executeCommand(
        'workbench.action.openSettings',
        'llm-guardrail'
      );
    }
    return;
  }

  // Get active editor
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No active editor. Please open a file first.');
    return;
  }

  currentEditor = editor;
  const document = editor.document;
  const selection = editor.selection;

  // Get context code (selected text or entire file)
  let contextCode: string;
  let contextDescription: string;

  if (!selection.isEmpty) {
    contextCode = document.getText(selection);
    contextDescription = `Selected code (${selection.end.line - selection.start.line + 1} lines)`;
  } else {
    contextCode = document.getText();
    contextDescription = `Entire file (${document.lineCount} lines)`;
  }

  // Get prompt from user
  const prompt = await vscode.window.showInputBox({
    title: 'LLM Guardrail - Code Generation',
    prompt: `Enter your request. Context: ${contextDescription}`,
    placeHolder: 'e.g., Add a function to validate email addresses',
    ignoreFocusOut: true
  });

  if (!prompt) {
    return;
  }

  // Load rules
  const rules = await loadRules();

  // Show progress
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'LLM Guardrail',
      cancellable: false
    },
    async (progress) => {
      progress.report({ message: 'Loading rules...' });

      // Get file info
      const fileName = path.basename(document.fileName);
      const language = document.languageId;

      progress.report({ message: `Generating code with ${getCurrentModel()}...` });

      // Generate code
      const response = await generateCode({
        prompt,
        context: contextCode,
        rules,
        fileName,
        language
      });

      if (!response.success || !response.generatedCode) {
        logError(prompt, response.error || 'Unknown error', rules);
        vscode.window.showErrorMessage(`Code generation failed: ${response.error}`);
        return;
      }

      progress.report({ message: 'Validating against rules...' });

      // Validate the generated code
      const validation = validateAgainstRules(
        contextCode,
        response.generatedCode,
        rules,
        fileName
      );

      // Log the generation
      const logId = logGeneration(
        prompt,
        contextCode,
        response.generatedCode,
        validation.violations,
        rules,
        {
          fileName,
          model: response.model,
          tokensUsed: response.tokensUsed
        }
      );

      currentValidation = validation;
      currentGeneratedCode = response.generatedCode;
      currentLogId = logId;

      // Show the diff preview panel
      showDiffPreview(context, {
        original: contextCode,
        generated: response.generatedCode,
        violations: validation.violations.map(v => ({
          ruleType: v.ruleType,
          description: v.description,
          severity: v.severity,
          details: v.details
        })),
        diff: {
          linesAdded: validation.diff.linesAdded,
          linesRemoved: validation.diff.linesRemoved,
          totalLinesChanged: validation.diff.totalLinesChanged
        },
        fileName,
        requiresApproval: validation.requiresApproval,
        valid: validation.valid
      });
    }
  );
}

interface DiffPreviewData {
  original: string;
  generated: string;
  violations: Array<{
    ruleType: string;
    description: string;
    severity: 'error' | 'warning';
    details?: string;
    lineNumbers?: number[];
  }>;
  diff: {
    linesAdded: number;
    linesRemoved: number;
    totalLinesChanged: number;
  };
  fileName: string;
  requiresApproval: boolean;
  valid: boolean;
}

function showDiffPreview(context: vscode.ExtensionContext, data: DiffPreviewData): void {
  const column = vscode.window.activeTextEditor
    ? vscode.ViewColumn.Beside
    : vscode.ViewColumn.One;

  if (currentPanel) {
    currentPanel.reveal(column);
  } else {
    currentPanel = vscode.window.createWebviewPanel(
      'llmGuardrailPreview',
      'LLM Guardrail - Review Changes',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, 'out', 'webview')
        ]
      }
    );

    currentPanel.onDidDispose(() => {
      currentPanel = undefined;
    });

    // Handle messages from webview
    currentPanel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.type) {
          case 'approve':
            await handleApprove();
            break;
          case 'reject':
            // Use the proper reject command that actually reverts code
            await vscode.commands.executeCommand('llm-guardrail.rejectChange');
            break;
          case 'editRules':
            await handleEditRules();
            break;
        }
      },
      undefined,
      context.subscriptions
    );
  }

  currentPanel.webview.html = getWebviewContent(currentPanel.webview, context, data);
}

function getWebviewContent(
  webview: vscode.Webview,
  context: vscode.ExtensionContext,
  data: DiffPreviewData
): string {
  // Try to load the bundled webview, fall back to inline HTML
  const webviewPath = vscode.Uri.joinPath(context.extensionUri, 'out', 'webview', 'webview.js');

  if (fs.existsSync(webviewPath.fsPath)) {
    const scriptUri = webview.asWebviewUri(webviewPath);
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${webview.cspSource} 'unsafe-inline'; style-src ${webview.cspSource} 'unsafe-inline';">
  <title>LLM Guardrail - Review Changes</title>
</head>
<body>
  <div id="root"></div>
  <script>
    window.initialData = ${JSON.stringify(data)};
  </script>
  <script src="${scriptUri}"></script>
</body>
</html>`;
  }

  // Fallback inline HTML for when webview bundle is not built
  return getInlineWebviewContent(data);
}

function getInlineWebviewContent(data: DiffPreviewData): string {
  // Format violations with line numbers
  const violations = data.violations
    .map(v => {
      const lineInfo = v.lineNumbers && v.lineNumbers.length > 0
        ? `<span class="line-info">Line ${v.lineNumbers.length === 1 ? v.lineNumbers[0] : `${v.lineNumbers[0]}-${v.lineNumbers[v.lineNumbers.length - 1]}`}</span>`
        : '';
      return `<li class="violation ${v.severity}">
        <span class="type">[${v.ruleType}]</span>
        ${lineInfo}
        <span class="desc">${escapeHtml(v.description)}</span>
        ${v.details ? `<span class="details">${escapeHtml(v.details)}</span>` : ''}
      </li>`;
    })
    .join('');

  // Generate GitHub-style unified diff
  const diffHtml = generateGitHubDiff(data.original, data.generated);

  const errorCount = data.violations.filter(v => v.severity === 'error').length;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LLM Guardrail - Review Changes</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background, #1e1e1e);
      --fg: var(--vscode-editor-foreground, #d4d4d4);
      --border: var(--vscode-panel-border, #3c3c3c);
      --error: var(--vscode-errorForeground, #f14c4c);
      --warning: var(--vscode-editorWarning-foreground, #cca700);
      --success: var(--vscode-terminal-ansiGreen, #23d18b);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family, sans-serif);
      font-size: 13px;
      background: var(--bg);
      color: var(--fg);
      padding: 16px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 16px;
    }
    .header h2 { font-size: 16px; }
    .stats { display: flex; gap: 12px; font-size: 12px; }
    .stats .added { color: var(--success); }
    .stats .removed { color: var(--error); }
    .violations {
      background: rgba(0,0,0,0.2);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 12px;
      margin-bottom: 16px;
    }
    .violations h3 { font-size: 14px; margin-bottom: 8px; }
    .violations ul { list-style: none; }
    .violation {
      padding: 8px;
      margin-bottom: 4px;
      border-radius: 4px;
      font-size: 12px;
    }
    .violation.error {
      background: rgba(218, 54, 51, 0.2);
      border-left: 3px solid var(--error);
    }
    .violation.warning {
      background: rgba(204, 167, 0, 0.1);
      border-left: 3px solid var(--warning);
    }
    .violation .type {
      font-family: monospace;
      font-weight: bold;
      font-size: 10px;
      margin-right: 8px;
    }
    .violation .line-info {
      font-family: monospace;
      font-size: 10px;
      background: rgba(255,255,255,0.1);
      padding: 2px 6px;
      border-radius: 3px;
      margin-right: 8px;
    }
    .violation .details {
      display: block;
      font-size: 11px;
      opacity: 0.8;
      margin-top: 4px;
    }
    .diff-container {
      border: 1px solid var(--border);
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 16px;
    }
    .diff-header {
      padding: 8px 12px;
      background: rgba(0,0,0,0.2);
      border-bottom: 1px solid var(--border);
      font-size: 12px;
      font-weight: bold;
    }
    .diff-content {
      max-height: 400px;
      overflow: auto;
      font-family: monospace;
      font-size: 12px;
    }
    .diff-line {
      display: flex;
      line-height: 1.5;
    }
    .diff-line .diff-marker {
      width: 20px;
      text-align: center;
      user-select: none;
    }
    .diff-line .line-num {
      min-width: 40px;
      padding: 0 8px;
      text-align: right;
      opacity: 0.5;
      user-select: none;
    }
    .diff-line .line-content {
      flex: 1;
      padding: 0 8px;
      white-space: pre;
    }
    .diff-line.added {
      background: rgba(35, 134, 54, 0.2);
    }
    .diff-line.added .diff-marker {
      color: #23d18b;
    }
    .diff-line.added .line-content {
      background: rgba(35, 134, 54, 0.15);
    }
    .diff-line.removed {
      background: rgba(218, 54, 51, 0.2);
    }
    .diff-line.removed .diff-marker {
      color: #f14c4c;
    }
    .diff-line.removed .line-content {
      background: rgba(218, 54, 51, 0.15);
    }
    .diff-line.unchanged {
      background: transparent;
    }
    .diff-line.unchanged .diff-marker {
      opacity: 0.3;
    }
    .actions {
      display: flex;
      gap: 12px;
      padding-top: 16px;
      border-top: 1px solid var(--border);
    }
    button {
      padding: 10px 20px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
    }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .approve { background: var(--success); color: #000; }
    .reject { background: var(--error); color: #fff; }
    .edit-rules {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--fg);
    }
    .blocked-message {
      padding: 12px;
      background: rgba(218, 54, 51, 0.2);
      border: 1px solid var(--error);
      border-radius: 4px;
      text-align: center;
      font-size: 12px;
      margin-top: 16px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h2>Review: ${escapeHtml(data.fileName)}</h2>
    <div class="stats">
      <span class="added">+${data.diff.linesAdded}</span>
      <span class="removed">-${data.diff.linesRemoved}</span>
      <span>${data.diff.totalLinesChanged} lines changed</span>
    </div>
  </div>

  ${data.violations.length > 0 ? `
  <div class="violations">
    <h3>Violations (${data.violations.length})</h3>
    <ul>${violations}</ul>
  </div>
  ` : ''}

  <div class="diff-container">
    <div class="diff-header">Changes</div>
    <div class="diff-content">${diffHtml}</div>
  </div>

  <div class="actions">
    <button class="approve" onclick="approve()">
      ${data.requiresApproval ? 'Approve and update rules' : 'Apply Changes'}
    </button>
    <button class="reject" onclick="reject()">Reject</button>
    <button class="edit-rules" onclick="editRules()">Edit Rules</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    function approve() { vscode.postMessage({ type: 'approve' }); }
    function reject() { vscode.postMessage({ type: 'reject' }); }
    function editRules() { vscode.postMessage({ type: 'editRules' }); }
  </script>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Generate GitHub-style unified diff HTML
 */
function generateGitHubDiff(original: string, generated: string): string {
  const originalLines = original.split('\n');
  const generatedLines = generated.split('\n');

  const diffLines: string[] = [];
  let newLineNum = 1;

  // Create a simple diff by comparing lines
  const originalSet = new Set(originalLines);
  const generatedSet = new Set(generatedLines);

  // Find removed lines (in original but not in generated)
  const removedLines = originalLines.filter(line => !generatedSet.has(line));
  // Find added lines (in generated but not in original)
  const addedLines = generatedLines.filter(line => !originalSet.has(line));

  // Build unified diff output
  for (let i = 0; i < generatedLines.length; i++) {
    const line = generatedLines[i];
    const isAdded = addedLines.includes(line) && !originalLines.includes(line);

    if (isAdded) {
      diffLines.push(`<div class="diff-line added"><span class="diff-marker">+</span><span class="line-num new">${newLineNum}</span><span class="line-content">${escapeHtml(line)}</span></div>`);
    } else {
      diffLines.push(`<div class="diff-line unchanged"><span class="diff-marker"> </span><span class="line-num">${newLineNum}</span><span class="line-content">${escapeHtml(line)}</span></div>`);
    }
    newLineNum++;
  }

  // Show removed lines at the top or inline (simplified approach: show them separately)
  const removedHtml = removedLines.map((line, i) =>
    `<div class="diff-line removed"><span class="diff-marker">-</span><span class="line-num old">${i + 1}</span><span class="line-content">${escapeHtml(line)}</span></div>`
  ).join('');

  return removedHtml + diffLines.join('');
}

async function handleApprove(): Promise<void> {
  if (!currentGeneratedCode || !currentValidation || !currentDocumentUri) {
    vscode.window.showErrorMessage('No pending changes to apply.');
    return;
  }

  try {
    // Use WorkspaceEdit for more reliable editing (works even if editor not visible)
    const uri = vscode.Uri.parse(currentDocumentUri);
    const document = await vscode.workspace.openTextDocument(uri);

    const fullRange = new vscode.Range(
      document.positionAt(0),
      document.positionAt(document.getText().length)
    );

    const workspaceEdit = new vscode.WorkspaceEdit();
    workspaceEdit.replace(uri, fullRange, currentGeneratedCode);

    const success = await vscode.workspace.applyEdit(workspaceEdit);
    if (!success) {
      throw new Error('Failed to apply edit');
    }

    // Log approval
    if (currentLogId) {
      logApproval(currentLogId, currentValidation.diff.totalLinesChanged);
    }

    // Clear diagnostics and pending state from monitor
    const monitor = getChangeMonitor();
    await monitor.approveChange(currentDocumentUri);
    const diagnosticsManager = getDiagnosticsManager();
    diagnosticsManager.clearDiagnostics(uri);

    // Update rules if there were violations that are being approved
    if (currentValidation.violations && currentValidation.violations.length > 0) {
      console.log('Guardrail: Attempting to update rules for violations:', currentValidation.violations);
      const rulesUpdated = await addExceptionsToRules(currentValidation.violations);
      console.log('Guardrail: Rules updated:', rulesUpdated);
      if (rulesUpdated) {
        // Reload rules in the monitor
        await monitor.start();
        vscode.window.showInformationMessage('Changes applied and rules updated!');
      } else {
        vscode.window.showInformationMessage('Changes applied (rules not updated - pattern not found in rules).');
      }
    } else {
      vscode.window.showInformationMessage('Changes applied successfully!');
    }

    // Close panel
    if (currentPanel) {
      currentPanel.dispose();
    }

    // Reset state
    resetState();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    vscode.window.showErrorMessage(`Failed to apply changes: ${errorMessage}`);
  }
}

function handleReject(): void {
  if (currentLogId) {
    logRejection(currentLogId);
  }

  vscode.window.showInformationMessage('Changes rejected.');

  if (currentPanel) {
    currentPanel.dispose();
  }

  resetState();
}

async function handleEditRules(): Promise<void> {
  const rulesPath = getRulesFilePath();

  if (!rulesPath) {
    vscode.window.showErrorMessage('No workspace folder open.');
    return;
  }

  if (!fs.existsSync(rulesPath)) {
    const action = await vscode.window.showInformationMessage(
      'No rules.yaml found. Create one with example rules?',
      'Create',
      'Cancel'
    );
    if (action === 'Create') {
      await createDefaultRulesFile();
    }
    return;
  }

  const document = await vscode.workspace.openTextDocument(rulesPath);
  await vscode.window.showTextDocument(document);
}

function resetState(): void {
  currentValidation = undefined;
  currentGeneratedCode = undefined;
  currentLogId = undefined;
  currentEditor = undefined;
  currentDocumentUri = undefined;
  isMonitoredChange = false;
}

async function showMetricsDashboard(context: vscode.ExtensionContext): Promise<void> {
  if (dashboardPanel) {
    dashboardPanel.reveal();
    return;
  }

  dashboardPanel = vscode.window.createWebviewPanel(
    'llmGuardrailDashboard',
    'LLM Guardrail - Metrics Dashboard',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true
    }
  );

  const calculator = new MetricsCalculator();
  const logs = getRecentLogs(1000);
  const metrics = calculator.calculate(logs, 30);

  dashboardPanel.webview.html = getDashboardWebviewContent(metrics);

  dashboardPanel.webview.onDidReceiveMessage(
    async (message) => {
      if (message.type === 'refresh') {
        const newLogs = getRecentLogs(1000);
        const newMetrics = calculator.calculate(newLogs, message.period || 30);
        dashboardPanel!.webview.postMessage({ type: 'metrics', data: newMetrics });
      } else if (message.type === 'export') {
        const csvContent = calculator.exportAsCsv(metrics);
        const uri = await vscode.window.showSaveDialog({
          filters: { 'CSV': ['csv'] },
          defaultUri: vscode.Uri.file('guardrail-metrics.csv')
        });
        if (uri) {
          fs.writeFileSync(uri.fsPath, csvContent);
          vscode.window.showInformationMessage(`Metrics exported to ${uri.fsPath}`);
        }
      }
    },
    undefined,
    context.subscriptions
  );

  dashboardPanel.onDidDispose(() => {
    dashboardPanel = undefined;
  });
}

function getDashboardWebviewContent(metrics: import('./metrics-calculator').MetricsSummary): string {
  const violationsByTypeHtml = Object.entries(metrics.violationsByType)
    .map(([type, count]) => `<div class="stat-item"><span class="type-badge ${type}">${type}</span><span class="count">${count}</span></div>`)
    .join('') || '<div class="empty">No violations recorded</div>';

  const topRulesHtml = metrics.topViolatedRules
    .map(rule => `
      <tr>
        <td><span class="type-badge ${rule.ruleType}">${rule.ruleType}</span></td>
        <td>${escapeHtml(rule.description)}</td>
        <td>${rule.count}</td>
        <td>${(rule.percentage * 100).toFixed(1)}%</td>
      </tr>
    `)
    .join('') || '<tr><td colspan="4" class="empty">No violations recorded</td></tr>';

  const trendsData = JSON.stringify(metrics.trendsOverTime);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Guardrail Metrics Dashboard</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background, #1e1e1e);
      --fg: var(--vscode-editor-foreground, #d4d4d4);
      --border: var(--vscode-panel-border, #3c3c3c);
      --card-bg: var(--vscode-editorWidget-background, #252526);
      --error: var(--vscode-errorForeground, #f14c4c);
      --warning: var(--vscode-editorWarning-foreground, #cca700);
      --success: var(--vscode-terminal-ansiGreen, #23d18b);
      --info: var(--vscode-textLink-foreground, #3794ff);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family, sans-serif);
      font-size: 13px;
      background: var(--bg);
      color: var(--fg);
      padding: 20px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding-bottom: 15px;
      border-bottom: 1px solid var(--border);
    }
    .header h1 { font-size: 20px; font-weight: 500; }
    .controls { display: flex; gap: 10px; }
    .controls select, .controls button {
      padding: 6px 12px;
      border: 1px solid var(--border);
      border-radius: 4px;
      background: var(--card-bg);
      color: var(--fg);
      cursor: pointer;
    }
    .controls button:hover { background: var(--border); }
    .summary-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin-bottom: 25px;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 20px;
    }
    .card h3 { font-size: 12px; opacity: 0.7; margin-bottom: 8px; text-transform: uppercase; }
    .card .value { font-size: 28px; font-weight: 600; }
    .card .value.success { color: var(--success); }
    .card .value.warning { color: var(--warning); }
    .card .value.error { color: var(--error); }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 25px; }
    .section-title { font-size: 14px; font-weight: 500; margin-bottom: 15px; }
    .chart-container { height: 200px; display: flex; align-items: flex-end; gap: 2px; padding: 10px 0; }
    .chart-bar {
      flex: 1;
      background: var(--info);
      min-height: 2px;
      border-radius: 2px 2px 0 0;
      transition: height 0.3s;
    }
    .chart-bar:hover { opacity: 0.8; }
    .stat-item { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border); }
    .stat-item:last-child { border-bottom: none; }
    .type-badge {
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
    }
    .type-badge.scope { background: rgba(55, 148, 255, 0.2); color: var(--info); }
    .type-badge.content { background: rgba(241, 76, 76, 0.2); color: var(--error); }
    .type-badge.dependencies { background: rgba(204, 167, 0, 0.2); color: var(--warning); }
    .type-badge.refactor { background: rgba(35, 209, 139, 0.2); color: var(--success); }
    .type-badge.threshold { background: rgba(156, 108, 214, 0.2); color: #9c6cd6; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 10px; text-align: left; border-bottom: 1px solid var(--border); }
    th { font-size: 11px; text-transform: uppercase; opacity: 0.7; }
    .empty { text-align: center; opacity: 0.5; padding: 20px; }
    .severity-bar { display: flex; height: 24px; border-radius: 4px; overflow: hidden; margin-top: 10px; }
    .severity-bar .error { background: var(--error); }
    .severity-bar .warning { background: var(--warning); }
    .severity-bar span { display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 500; color: #000; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Guardrail Metrics Dashboard</h1>
    <div class="controls">
      <select id="period">
        <option value="7">Last 7 days</option>
        <option value="30" selected>Last 30 days</option>
        <option value="90">Last 90 days</option>
      </select>
      <button onclick="refresh()">Refresh</button>
      <button onclick="exportCsv()">Export CSV</button>
    </div>
  </div>

  <div class="summary-cards">
    <div class="card">
      <h3>Total Interactions</h3>
      <div class="value">${metrics.totalInteractions}</div>
    </div>
    <div class="card">
      <h3>Violations Caught</h3>
      <div class="value warning">${metrics.totalViolations}</div>
    </div>
    <div class="card">
      <h3>Approval Rate</h3>
      <div class="value success">${(metrics.approvalRate * 100).toFixed(1)}%</div>
    </div>
    <div class="card">
      <h3>Rejection Rate</h3>
      <div class="value error">${(metrics.rejectionRate * 100).toFixed(1)}%</div>
    </div>
  </div>

  <div class="grid-2">
    <div class="card">
      <div class="section-title">Violations Over Time</div>
      <div class="chart-container" id="trendChart"></div>
    </div>
    <div class="card">
      <div class="section-title">Violations by Type</div>
      ${violationsByTypeHtml}
    </div>
  </div>

  <div class="card" style="margin-bottom: 25px;">
    <div class="section-title">Severity Distribution</div>
    <div class="severity-bar">
      <span class="error" style="flex: ${metrics.violationsBySeverity.error || 0.1}">Errors: ${metrics.violationsBySeverity.error}</span>
      <span class="warning" style="flex: ${metrics.violationsBySeverity.warning || 0.1}">Warnings: ${metrics.violationsBySeverity.warning}</span>
    </div>
  </div>

  <div class="card">
    <div class="section-title">Top Violated Rules</div>
    <table>
      <thead>
        <tr><th>Type</th><th>Description</th><th>Count</th><th>%</th></tr>
      </thead>
      <tbody>${topRulesHtml}</tbody>
    </table>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const trendsData = ${trendsData};

    function renderChart() {
      const container = document.getElementById('trendChart');
      const maxViolations = Math.max(...trendsData.map(d => d.violations), 1);
      container.innerHTML = trendsData.map(d =>
        '<div class="chart-bar" style="height: ' + (d.violations / maxViolations * 100) + '%" title="' + d.date + ': ' + d.violations + ' violations"></div>'
      ).join('');
    }

    function refresh() {
      const period = document.getElementById('period').value;
      vscode.postMessage({ type: 'refresh', period: parseInt(period) });
    }

    function exportCsv() {
      vscode.postMessage({ type: 'export' });
    }

    window.addEventListener('message', event => {
      if (event.data.type === 'metrics') {
        location.reload(); // Simple refresh for now
      }
    });

    renderChart();
  </script>
</body>
</html>`;
}

export function deactivate() {
  if (currentPanel) {
    currentPanel.dispose();
  }
  if (dashboardPanel) {
    dashboardPanel.dispose();
  }
  disposeChangeMonitor();
  disposeDiagnosticsManager();
}
