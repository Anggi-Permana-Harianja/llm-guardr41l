import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Violation } from './diff-validator';
import { RulesConfig } from './rules';

export interface LogEntry {
  timestamp: string;
  id: string;
  action: 'generate' | 'approve' | 'reject' | 'error';
  prompt: string;
  context?: string;
  output?: string;
  violations: Violation[];
  rules: RulesConfig;
  metadata: {
    fileName?: string;
    model?: string;
    tokensUsed?: number;
    approved?: boolean;
    linesChanged?: number;
  };
}

interface LogFile {
  version: string;
  entries: LogEntry[];
}

function getLogFilePath(): string | undefined {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return undefined;
  }

  const config = vscode.workspace.getConfiguration('llm-guardrail');
  const logPath = config.get<string>('logPath', '.llm-guardrail/logs.json');

  return path.join(workspaceFolders[0].uri.fsPath, logPath);
}

function ensureLogDirectory(logPath: string): void {
  const logDir = path.dirname(logPath);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
}

function readLogFile(logPath: string): LogFile {
  try {
    if (fs.existsSync(logPath)) {
      const content = fs.readFileSync(logPath, 'utf8');
      return JSON.parse(content) as LogFile;
    }
  } catch (error) {
    console.error('Failed to read log file:', error);
  }

  return {
    version: '1.0',
    entries: []
  };
}

function writeLogFile(logPath: string, logFile: LogFile): void {
  ensureLogDirectory(logPath);
  fs.writeFileSync(logPath, JSON.stringify(logFile, null, 2), 'utf8');
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function log(entry: Omit<LogEntry, 'timestamp' | 'id'>): string | undefined {
  const logPath = getLogFilePath();

  if (!logPath) {
    console.warn('No workspace folder open, cannot log entry');
    return undefined;
  }

  const logFile = readLogFile(logPath);
  const id = generateId();

  const fullEntry: LogEntry = {
    ...entry,
    timestamp: new Date().toISOString(),
    id
  };

  logFile.entries.push(fullEntry);
  writeLogFile(logPath, logFile);

  return id;
}

export function logGeneration(
  prompt: string,
  context: string | undefined,
  output: string | undefined,
  violations: Violation[],
  rules: RulesConfig,
  metadata: LogEntry['metadata']
): string | undefined {
  return log({
    action: 'generate',
    prompt,
    context,
    output,
    violations,
    rules,
    metadata
  });
}

export function logApproval(
  logId: string,
  linesChanged: number
): void {
  const logPath = getLogFilePath();
  if (!logPath) {return;}

  const logFile = readLogFile(logPath);
  const entry = logFile.entries.find(e => e.id === logId);

  if (entry) {
    entry.action = 'approve';
    entry.metadata.approved = true;
    entry.metadata.linesChanged = linesChanged;
    writeLogFile(logPath, logFile);
  }
}

export function logRejection(logId: string): void {
  const logPath = getLogFilePath();
  if (!logPath) {return;}

  const logFile = readLogFile(logPath);
  const entry = logFile.entries.find(e => e.id === logId);

  if (entry) {
    entry.action = 'reject';
    entry.metadata.approved = false;
    writeLogFile(logPath, logFile);
  }
}

export function logError(
  prompt: string,
  error: string,
  rules: RulesConfig
): void {
  log({
    action: 'error',
    prompt,
    violations: [],
    rules,
    metadata: {},
    output: error
  });
}

export function getRecentLogs(limit: number = 50): LogEntry[] {
  const logPath = getLogFilePath();
  if (!logPath) {return [];}

  const logFile = readLogFile(logPath);
  return logFile.entries.slice(-limit).reverse();
}

export function clearLogs(): void {
  const logPath = getLogFilePath();
  if (!logPath) {return;}

  const logFile: LogFile = {
    version: '1.0',
    entries: []
  };

  writeLogFile(logPath, logFile);
}

export function exportLogs(format: 'json' | 'csv' = 'json'): string {
  const logPath = getLogFilePath();
  if (!logPath) {return '';}

  const logFile = readLogFile(logPath);

  if (format === 'json') {
    return JSON.stringify(logFile, null, 2);
  }

  // CSV format
  const headers = ['timestamp', 'id', 'action', 'prompt', 'violations_count', 'approved', 'model', 'tokens_used', 'lines_changed'];
  const rows = logFile.entries.map(entry => [
    entry.timestamp,
    entry.id,
    entry.action,
    `"${entry.prompt.replace(/"/g, '""')}"`,
    entry.violations.length.toString(),
    entry.metadata.approved?.toString() ?? '',
    entry.metadata.model ?? '',
    entry.metadata.tokensUsed?.toString() ?? '',
    entry.metadata.linesChanged?.toString() ?? ''
  ]);

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

export async function showLogsInEditor(): Promise<void> {
  const logs = getRecentLogs(100);

  if (logs.length === 0) {
    vscode.window.showInformationMessage('No logs found.');
    return;
  }

  const content = logs.map(entry => {
    const violationSummary = entry.violations.length > 0
      ? `Violations: ${entry.violations.map(v => v.description).join(', ')}`
      : 'No violations';

    return `=== ${entry.timestamp} [${entry.action.toUpperCase()}] ===
ID: ${entry.id}
Prompt: ${entry.prompt}
${violationSummary}
Approved: ${entry.metadata.approved ?? 'N/A'}
Model: ${entry.metadata.model ?? 'N/A'}
${entry.output ? `Output preview: ${entry.output.substring(0, 200)}...` : ''}
`;
  }).join('\n');

  const doc = await vscode.workspace.openTextDocument({
    content,
    language: 'plaintext'
  });

  await vscode.window.showTextDocument(doc);
}
