/**
 * validate command - validate code changes against rules
 */

import * as fs from 'fs';
import * as path from 'path';
import { loadRulesFromPath, loadRulesForFile, findRulesFile } from '../../core/rules-loader';
import { validateAgainstRules } from '../../core/validator';
import { formatResult, OutputFormat } from '../formatters';

export interface ValidateOptions {
  before: string;
  after: string;
  rules?: string;
  format: OutputFormat;
  output?: string;
  fileName?: string;
  verbose?: boolean;
  noColors?: boolean;
}

export async function validate(options: ValidateOptions): Promise<number> {
  try {
    // Read before content
    let beforeContent: string;
    if (options.before === '-') {
      beforeContent = await readStdin();
    } else {
      if (!fs.existsSync(options.before)) {
        console.error(`Error: File not found: ${options.before}`);
        return 1;
      }
      beforeContent = fs.readFileSync(options.before, 'utf8');
    }

    // Read after content
    let afterContent: string;
    if (options.after === '-') {
      afterContent = await readStdin();
    } else {
      if (!fs.existsSync(options.after)) {
        console.error(`Error: File not found: ${options.after}`);
        return 1;
      }
      afterContent = fs.readFileSync(options.after, 'utf8');
    }

    // Load rules
    let rulesPath = options.rules;
    if (!rulesPath) {
      rulesPath = findRulesFile(process.cwd());
      if (!rulesPath) {
        console.error('Error: No rules.yaml found. Create one or specify with --rules');
        return 1;
      }
    }

    const rules = options.fileName
      ? loadRulesForFile(options.fileName, path.dirname(rulesPath))
      : loadRulesFromPath(rulesPath);

    // Validate
    const result = validateAgainstRules(
      beforeContent,
      afterContent,
      rules,
      options.fileName || options.after
    );

    // Format output
    const formatted = formatResult(result, options.format, {
      fileName: options.fileName || options.after,
      verbose: options.verbose,
      colors: !options.noColors && options.format === 'text'
    });

    // Output
    if (options.output) {
      fs.writeFileSync(options.output, formatted, 'utf8');
      console.log(`Results written to ${options.output}`);
    } else {
      console.log(formatted);
    }

    // Return exit code based on validation result
    return result.valid ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error: ${message}`);
    return 1;
  }
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');

    process.stdin.on('data', (chunk) => {
      data += chunk;
    });

    process.stdin.on('end', () => {
      resolve(data);
    });

    process.stdin.on('error', reject);
  });
}
