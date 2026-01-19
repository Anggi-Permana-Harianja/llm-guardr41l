#!/usr/bin/env node

/**
 * LLM Guardr41l CLI
 * Validate code changes against guardrail rules
 */

import { Command } from 'commander';
import { validate } from './commands/validate';
import { check } from './commands/check';
import { init } from './commands/init';
import { OutputFormat } from './formatters';

const program = new Command();

program
  .name('guardrail')
  .description('LLM Guardr41l - Validate AI-generated code changes against rules')
  .version('0.5.0');

// validate command
program
  .command('validate')
  .description('Validate code changes between two files')
  .requiredOption('-b, --before <file>', 'Original file (use - for stdin)')
  .requiredOption('-a, --after <file>', 'Modified file (use - for stdin)')
  .option('-r, --rules <file>', 'Path to rules.yaml (auto-detected if not specified)')
  .option('-f, --format <format>', 'Output format: text, json, sarif', 'text')
  .option('-o, --output <file>', 'Write output to file')
  .option('-n, --file-name <name>', 'File name for context (used in reports)')
  .option('-v, --verbose', 'Show detailed output including diff')
  .option('--no-colors', 'Disable colored output')
  .action(async (options) => {
    const exitCode = await validate({
      before: options.before,
      after: options.after,
      rules: options.rules,
      format: options.format as OutputFormat,
      output: options.output,
      fileName: options.fileName,
      verbose: options.verbose,
      noColors: !options.colors
    });
    process.exit(exitCode);
  });

// check command
program
  .command('check')
  .description('Validate git staged or committed changes')
  .option('-s, --staged', 'Check staged changes (default)')
  .option('-c, --commit <sha>', 'Check a specific commit')
  .option('-r, --rules <file>', 'Path to rules.yaml (auto-detected if not specified)')
  .option('-f, --format <format>', 'Output format: text, json, sarif', 'text')
  .option('-o, --output <file>', 'Write output to file')
  .option('-v, --verbose', 'Show detailed output')
  .option('--no-colors', 'Disable colored output')
  .action(async (options) => {
    const exitCode = await check({
      staged: options.staged || !options.commit,
      commit: options.commit,
      rules: options.rules,
      format: options.format as OutputFormat,
      output: options.output,
      verbose: options.verbose,
      noColors: !options.colors
    });
    process.exit(exitCode);
  });

// init command
program
  .command('init')
  .description('Initialize guardrails in the current directory')
  .option('-t, --template <name>', 'Template to use: minimal, standard, strict', 'standard')
  .option('--force', 'Overwrite existing rules.yaml')
  .action(async (options) => {
    const exitCode = await init({
      template: options.template,
      force: options.force
    });
    process.exit(exitCode);
  });

program.parse();
