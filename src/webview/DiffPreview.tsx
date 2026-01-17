import React, { useState } from 'react';

interface Violation {
  ruleType: string;
  description: string;
  severity: 'error' | 'warning';
  details?: string;
}

interface DiffStats {
  linesAdded: number;
  linesRemoved: number;
  totalLinesChanged: number;
}

interface DiffPreviewProps {
  original: string;
  generated: string;
  violations: Violation[];
  diff: DiffStats;
  fileName: string;
  requiresApproval: boolean;
  valid: boolean;
  onApprove: () => void;
  onReject: () => void;
  onEditRules: () => void;
}

type ViewMode = 'split' | 'unified';

export function DiffPreview({
  original,
  generated,
  violations,
  diff,
  fileName,
  requiresApproval,
  valid,
  onApprove,
  onReject,
  onEditRules
}: DiffPreviewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('split');

  const originalLines = original.split('\n');
  const generatedLines = generated.split('\n');

  const computeLineDiff = () => {
    const result: Array<{
      type: 'unchanged' | 'added' | 'removed' | 'modified';
      originalLine?: string;
      generatedLine?: string;
      originalLineNum?: number;
      generatedLineNum?: number;
    }> = [];

    let i = 0;
    let j = 0;
    let origLineNum = 1;
    let genLineNum = 1;

    while (i < originalLines.length || j < generatedLines.length) {
      if (i >= originalLines.length) {
        result.push({
          type: 'added',
          generatedLine: generatedLines[j],
          generatedLineNum: genLineNum++
        });
        j++;
      } else if (j >= generatedLines.length) {
        result.push({
          type: 'removed',
          originalLine: originalLines[i],
          originalLineNum: origLineNum++
        });
        i++;
      } else if (originalLines[i] === generatedLines[j]) {
        result.push({
          type: 'unchanged',
          originalLine: originalLines[i],
          generatedLine: generatedLines[j],
          originalLineNum: origLineNum++,
          generatedLineNum: genLineNum++
        });
        i++;
        j++;
      } else {
        // Simple diff: check if next lines match
        let foundMatch = false;

        // Look ahead in generated for current original line
        for (let k = j + 1; k < Math.min(j + 5, generatedLines.length); k++) {
          if (originalLines[i] === generatedLines[k]) {
            // Lines were added before this
            for (let m = j; m < k; m++) {
              result.push({
                type: 'added',
                generatedLine: generatedLines[m],
                generatedLineNum: genLineNum++
              });
            }
            j = k;
            foundMatch = true;
            break;
          }
        }

        if (!foundMatch) {
          // Look ahead in original for current generated line
          for (let k = i + 1; k < Math.min(i + 5, originalLines.length); k++) {
            if (originalLines[k] === generatedLines[j]) {
              // Lines were removed
              for (let m = i; m < k; m++) {
                result.push({
                  type: 'removed',
                  originalLine: originalLines[m],
                  originalLineNum: origLineNum++
                });
              }
              i = k;
              foundMatch = true;
              break;
            }
          }
        }

        if (!foundMatch) {
          // Lines were modified
          result.push({
            type: 'modified',
            originalLine: originalLines[i],
            generatedLine: generatedLines[j],
            originalLineNum: origLineNum++,
            generatedLineNum: genLineNum++
          });
          i++;
          j++;
        }
      }
    }

    return result;
  };

  const lineDiff = computeLineDiff();

  const renderSplitView = () => (
    <div className="diff-split">
      <div className="diff-panel original">
        <div className="diff-panel-header">Original</div>
        <div className="diff-content">
          {lineDiff.map((line, idx) => {
            if (line.type === 'added') {
              return (
                <div key={idx} className="diff-line empty">
                  <span className="line-number"></span>
                  <span className="line-content"></span>
                </div>
              );
            }
            return (
              <div
                key={idx}
                className={`diff-line ${line.type === 'removed' || line.type === 'modified' ? 'removed' : ''}`}
              >
                <span className="line-number">{line.originalLineNum}</span>
                <span className="line-content">{line.originalLine}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="diff-panel generated">
        <div className="diff-panel-header">Generated</div>
        <div className="diff-content">
          {lineDiff.map((line, idx) => {
            if (line.type === 'removed') {
              return (
                <div key={idx} className="diff-line empty">
                  <span className="line-number"></span>
                  <span className="line-content"></span>
                </div>
              );
            }
            return (
              <div
                key={idx}
                className={`diff-line ${line.type === 'added' || line.type === 'modified' ? 'added' : ''}`}
              >
                <span className="line-number">{line.generatedLineNum}</span>
                <span className="line-content">{line.generatedLine}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  const renderUnifiedView = () => (
    <div className="diff-unified">
      <div className="diff-content">
        {lineDiff.map((line, idx) => {
          if (line.type === 'unchanged') {
            return (
              <div key={idx} className="diff-line">
                <span className="line-number">{line.originalLineNum}</span>
                <span className="line-number">{line.generatedLineNum}</span>
                <span className="line-prefix"> </span>
                <span className="line-content">{line.originalLine}</span>
              </div>
            );
          }
          if (line.type === 'removed') {
            return (
              <div key={idx} className="diff-line removed">
                <span className="line-number">{line.originalLineNum}</span>
                <span className="line-number"></span>
                <span className="line-prefix">-</span>
                <span className="line-content">{line.originalLine}</span>
              </div>
            );
          }
          if (line.type === 'added') {
            return (
              <div key={idx} className="diff-line added">
                <span className="line-number"></span>
                <span className="line-number">{line.generatedLineNum}</span>
                <span className="line-prefix">+</span>
                <span className="line-content">{line.generatedLine}</span>
              </div>
            );
          }
          // Modified
          return (
            <React.Fragment key={idx}>
              <div className="diff-line removed">
                <span className="line-number">{line.originalLineNum}</span>
                <span className="line-number"></span>
                <span className="line-prefix">-</span>
                <span className="line-content">{line.originalLine}</span>
              </div>
              <div className="diff-line added">
                <span className="line-number"></span>
                <span className="line-number">{line.generatedLineNum}</span>
                <span className="line-prefix">+</span>
                <span className="line-content">{line.generatedLine}</span>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );

  const errorCount = violations.filter(v => v.severity === 'error').length;
  const warningCount = violations.filter(v => v.severity === 'warning').length;

  return (
    <div className="diff-preview">
      <div className="header">
        <h2>Code Review: {fileName}</h2>
        <div className="stats">
          <span className="stat added">+{diff.linesAdded}</span>
          <span className="stat removed">-{diff.linesRemoved}</span>
          <span className="stat total">{diff.totalLinesChanged} lines changed</span>
        </div>
      </div>

      {violations.length > 0 && (
        <div className="violations">
          <div className="violations-header">
            <h3>
              Violations Found
              {errorCount > 0 && <span className="badge error">{errorCount} errors</span>}
              {warningCount > 0 && <span className="badge warning">{warningCount} warnings</span>}
            </h3>
          </div>
          <ul className="violations-list">
            {violations.map((v, idx) => (
              <li key={idx} className={`violation ${v.severity}`}>
                <span className="violation-type">[{v.ruleType}]</span>
                <span className="violation-desc">{v.description}</span>
                {v.details && <span className="violation-details">{v.details}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!valid && (
        <div className="warning-banner">
          <strong>Warning:</strong> This code change has rule violations. Review carefully before approving.
        </div>
      )}

      <div className="view-controls">
        <button
          className={`view-button ${viewMode === 'split' ? 'active' : ''}`}
          onClick={() => setViewMode('split')}
        >
          Split View
        </button>
        <button
          className={`view-button ${viewMode === 'unified' ? 'active' : ''}`}
          onClick={() => setViewMode('unified')}
        >
          Unified View
        </button>
      </div>

      <div className="diff-container">
        {viewMode === 'split' ? renderSplitView() : renderUnifiedView()}
      </div>

      <div className="actions">
        <button
          className="action-button approve"
          onClick={onApprove}
          disabled={!valid && errorCount > 0}
        >
          {requiresApproval ? 'Approve & Apply' : 'Apply Changes'}
        </button>
        <button className="action-button reject" onClick={onReject}>
          Reject
        </button>
        <button className="action-button edit-rules" onClick={onEditRules}>
          Edit Rules
        </button>
      </div>

      {!valid && errorCount > 0 && (
        <div className="approval-blocked">
          Approval blocked due to rule errors. Fix violations or edit rules to proceed.
        </div>
      )}
    </div>
  );
}
