import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { getRulesFilePath, RulesConfig } from './rules';

/**
 * Provides Quick Fix actions (lightbulb menu) for guardrail violations
 */
export class GuardrailQuickFixProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix
  ];

  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    // Filter for guardrail diagnostics only
    const guardrailDiagnostics = context.diagnostics.filter(
      d => d.source === 'LLM Guardrail'
    );

    for (const diagnostic of guardrailDiagnostics) {
      const ruleType = diagnostic.code as string;

      // Add appropriate quick fixes based on rule type
      switch (ruleType) {
        case 'dependencies':
          actions.push(...this.createDependencyActions(diagnostic, document));
          break;
        case 'content':
          actions.push(...this.createContentActions(diagnostic, document));
          break;
        case 'refactor':
          actions.push(...this.createRefactorActions(diagnostic, document));
          break;
        case 'scope':
          actions.push(...this.createScopeActions(diagnostic, document));
          break;
        case 'threshold':
          actions.push(...this.createThresholdActions(diagnostic, document));
          break;
      }

      // Always add "Ignore this violation" action
      actions.push(this.createIgnoreAction(diagnostic, document));
    }

    return actions;
  }

  private createDependencyActions(
    diagnostic: vscode.Diagnostic,
    _document: vscode.TextDocument
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    // Extract dependency name from diagnostic message
    const match = diagnostic.message.match(/dependency "([^"]+)"/);
    if (match) {
      const depName = match[1];

      // Add to allowed dependencies
      const addAllowedAction = new vscode.CodeAction(
        `Add "${depName}" to allowed dependencies`,
        vscode.CodeActionKind.QuickFix
      );
      addAllowedAction.command = {
        command: 'llm-guardrail.addAllowedDependency',
        title: 'Add Allowed Dependency',
        arguments: [depName]
      };
      addAllowedAction.diagnostics = [diagnostic];
      addAllowedAction.isPreferred = true;
      actions.push(addAllowedAction);

      // Remove from forbidden (if applicable)
      if (diagnostic.message.includes('forbidden list')) {
        const removeForbiddenAction = new vscode.CodeAction(
          `Remove "${depName}" from forbidden list`,
          vscode.CodeActionKind.QuickFix
        );
        removeForbiddenAction.command = {
          command: 'llm-guardrail.removeForbiddenDependency',
          title: 'Remove Forbidden Dependency',
          arguments: [depName]
        };
        removeForbiddenAction.diagnostics = [diagnostic];
        actions.push(removeForbiddenAction);
      }
    }

    return actions;
  }

  private createContentActions(
    diagnostic: vscode.Diagnostic,
    _document: vscode.TextDocument
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    // Extract content from diagnostic message
    const match = diagnostic.message.match(/content "([^"]+)"/);
    if (match) {
      const content = match[1];

      const removeAction = new vscode.CodeAction(
        `Allow "${content}" in content rules`,
        vscode.CodeActionKind.QuickFix
      );
      removeAction.command = {
        command: 'llm-guardrail.removeContentForbid',
        title: 'Allow Content',
        arguments: [content]
      };
      removeAction.diagnostics = [diagnostic];
      removeAction.isPreferred = true;
      actions.push(removeAction);
    }

    return actions;
  }

  private createRefactorActions(
    diagnostic: vscode.Diagnostic,
    _document: vscode.TextDocument
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    // Determine which refactor action to allow
    let refactorType: string | null = null;

    if (diagnostic.message.includes('variable rename')) {
      refactorType = 'variable_renames';
    } else if (diagnostic.message.includes('error handling')) {
      refactorType = 'add_error_handling';
    } else if (diagnostic.message.includes('comments')) {
      refactorType = 'add_comments';
    } else if (diagnostic.message.includes('formatting')) {
      refactorType = 'change_formatting';
    }

    if (refactorType) {
      const allowAction = new vscode.CodeAction(
        `Allow "${refactorType}" in refactor rules`,
        vscode.CodeActionKind.QuickFix
      );
      allowAction.command = {
        command: 'llm-guardrail.removeRefactorForbid',
        title: 'Allow Refactor',
        arguments: [refactorType]
      };
      allowAction.diagnostics = [diagnostic];
      allowAction.isPreferred = true;
      actions.push(allowAction);
    }

    return actions;
  }

  private createScopeActions(
    diagnostic: vscode.Diagnostic,
    document: vscode.TextDocument
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    const fileName = path.basename(document.fileName);

    const addFileAction = new vscode.CodeAction(
      `Add "${fileName}" to allowed files`,
      vscode.CodeActionKind.QuickFix
    );
    addFileAction.command = {
      command: 'llm-guardrail.addAllowedFile',
      title: 'Add Allowed File',
      arguments: [fileName]
    };
    addFileAction.diagnostics = [diagnostic];
    addFileAction.isPreferred = true;
    actions.push(addFileAction);

    return actions;
  }

  private createThresholdActions(
    diagnostic: vscode.Diagnostic,
    _document: vscode.TextDocument
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    // Extract current threshold from message
    const match = diagnostic.message.match(/maximum allowed is (\d+)/);
    if (match) {
      const currentMax = parseInt(match[1], 10);
      const newMax = currentMax * 2;

      const increaseAction = new vscode.CodeAction(
        `Increase max_lines_changed to ${newMax}`,
        vscode.CodeActionKind.QuickFix
      );
      increaseAction.command = {
        command: 'llm-guardrail.increaseThreshold',
        title: 'Increase Threshold',
        arguments: ['max_lines_changed', newMax]
      };
      increaseAction.diagnostics = [diagnostic];
      increaseAction.isPreferred = true;
      actions.push(increaseAction);
    }

    return actions;
  }

  private createIgnoreAction(
    diagnostic: vscode.Diagnostic,
    document: vscode.TextDocument
  ): vscode.CodeAction {
    const ignoreAction = new vscode.CodeAction(
      'Dismiss this violation',
      vscode.CodeActionKind.QuickFix
    );
    ignoreAction.command = {
      command: 'llm-guardrail.dismissViolation',
      title: 'Dismiss Violation',
      arguments: [document.uri, diagnostic]
    };
    ignoreAction.diagnostics = [diagnostic];
    return ignoreAction;
  }
}

/**
 * Register quick fix commands
 */
export function registerQuickFixCommands(context: vscode.ExtensionContext): void {
  // Add allowed dependency
  context.subscriptions.push(
    vscode.commands.registerCommand('llm-guardrail.addAllowedDependency', async (depName: string) => {
      await modifyRules((rules) => {
        const existingRule = rules.rules.find(r => r.type === 'dependencies');
        if (existingRule && existingRule.type === 'dependencies') {
          if (!existingRule.allowed) {
            existingRule.allowed = [];
          }
          if (!existingRule.allowed.includes(depName)) {
            existingRule.allowed.push(depName);
          }
        } else {
          rules.rules.push({ type: 'dependencies', allowed: [depName] });
        }
        return rules;
      });
      vscode.window.showInformationMessage(`Added "${depName}" to allowed dependencies.`);
    })
  );

  // Remove forbidden dependency
  context.subscriptions.push(
    vscode.commands.registerCommand('llm-guardrail.removeForbiddenDependency', async (depName: string) => {
      await modifyRules((rules) => {
        const depRule = rules.rules.find(r => r.type === 'dependencies');
        if (depRule && depRule.type === 'dependencies' && depRule.forbidden) {
          depRule.forbidden = depRule.forbidden.filter(d => d !== depName);
        }
        return rules;
      });
      vscode.window.showInformationMessage(`Removed "${depName}" from forbidden list.`);
    })
  );

  // Remove content forbid
  context.subscriptions.push(
    vscode.commands.registerCommand('llm-guardrail.removeContentForbid', async (content: string) => {
      await modifyRules((rules) => {
        for (const rule of rules.rules) {
          if (rule.type === 'content' && rule.forbid) {
            rule.forbid = rule.forbid.filter(c => c !== content);
          }
        }
        return rules;
      });
      vscode.window.showInformationMessage(`Removed "${content}" from forbidden content.`);
    })
  );

  // Remove refactor forbid
  context.subscriptions.push(
    vscode.commands.registerCommand('llm-guardrail.removeRefactorForbid', async (refactorType: string) => {
      await modifyRules((rules) => {
        for (const rule of rules.rules) {
          if (rule.type === 'refactor' && rule.forbid) {
            rule.forbid = rule.forbid.filter(r => r !== refactorType);
          }
        }
        return rules;
      });
      vscode.window.showInformationMessage(`Allowed "${refactorType}" in refactor rules.`);
    })
  );

  // Add allowed file
  context.subscriptions.push(
    vscode.commands.registerCommand('llm-guardrail.addAllowedFile', async (fileName: string) => {
      await modifyRules((rules) => {
        const existingRule = rules.rules.find(r => r.type === 'scope');
        if (existingRule && existingRule.type === 'scope') {
          if (!existingRule.files) {
            existingRule.files = [];
          }
          if (!existingRule.files.includes(fileName)) {
            existingRule.files.push(fileName);
          }
        } else {
          rules.rules.push({ type: 'scope', description: 'Allowed files', files: [fileName] });
        }
        return rules;
      });
      vscode.window.showInformationMessage(`Added "${fileName}" to allowed files.`);
    })
  );

  // Increase threshold
  context.subscriptions.push(
    vscode.commands.registerCommand('llm-guardrail.increaseThreshold', async (thresholdType: string, newValue: number) => {
      await modifyRules((rules) => {
        const existingRule = rules.rules.find(r => r.type === 'threshold');
        if (existingRule && existingRule.type === 'threshold') {
          if (thresholdType === 'max_lines_changed') {
            existingRule.max_lines_changed = newValue;
          } else if (thresholdType === 'max_files_changed') {
            existingRule.max_files_changed = newValue;
          }
        } else {
          const newRule: { type: 'threshold'; require_approval: boolean; max_lines_changed?: number; max_files_changed?: number } = {
            type: 'threshold',
            require_approval: true
          };
          if (thresholdType === 'max_lines_changed') {
            newRule.max_lines_changed = newValue;
          } else if (thresholdType === 'max_files_changed') {
            newRule.max_files_changed = newValue;
          }
          rules.rules.push(newRule);
        }
        return rules;
      });
      vscode.window.showInformationMessage(`Updated ${thresholdType} to ${newValue}.`);
    })
  );

  // Dismiss violation (just clears the diagnostic for this session)
  context.subscriptions.push(
    vscode.commands.registerCommand('llm-guardrail.dismissViolation', async () => {
      // This will be handled by refreshing the diagnostics without this violation
      vscode.window.showInformationMessage('Violation dismissed for this session.');
    })
  );
}

/**
 * Modify rules.yaml file
 */
async function modifyRules(modifier: (rules: RulesConfig) => RulesConfig): Promise<void> {
  const rulesPath = getRulesFilePath();
  if (!rulesPath) {
    vscode.window.showErrorMessage('No workspace folder open.');
    return;
  }

  try {
    let rules: RulesConfig = { rules: [], global: {} };

    if (fs.existsSync(rulesPath)) {
      const content = fs.readFileSync(rulesPath, 'utf8');
      rules = yaml.load(content) as RulesConfig || { rules: [], global: {} };
    }

    if (!rules.rules) {
      rules.rules = [];
    }

    rules = modifier(rules);

    const newContent = yaml.dump(rules, { indent: 2, lineWidth: -1 });
    fs.writeFileSync(rulesPath, newContent, 'utf8');

    // Trigger rules reload
    vscode.commands.executeCommand('llm-guardrail.reloadRules');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    vscode.window.showErrorMessage(`Failed to modify rules: ${errorMessage}`);
  }
}
