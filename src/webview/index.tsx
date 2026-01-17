import React from 'react';
import { createRoot } from 'react-dom/client';
import { DiffPreview } from './DiffPreview';
import './styles.css';

declare global {
  interface Window {
    acquireVsCodeApi: () => {
      postMessage: (message: unknown) => void;
      getState: () => unknown;
      setState: (state: unknown) => void;
    };
    initialData?: {
      original: string;
      generated: string;
      violations: Array<{
        ruleType: string;
        description: string;
        severity: 'error' | 'warning';
        details?: string;
      }>;
      diff: {
        linesAdded: number;
        linesRemoved: number;
        totalLinesChanged: number;
      };
      fileName: string;
      requiresApproval: boolean;
      valid: boolean;
    };
  }
}

const vscode = window.acquireVsCodeApi();

function App() {
  const data = window.initialData;

  if (!data) {
    return (
      <div className="container">
        <div className="error-message">
          No data available. Please try generating code again.
        </div>
      </div>
    );
  }

  const handleApprove = () => {
    vscode.postMessage({ type: 'approve' });
  };

  const handleReject = () => {
    vscode.postMessage({ type: 'reject' });
  };

  const handleEditRules = () => {
    vscode.postMessage({ type: 'editRules' });
  };

  return (
    <div className="container">
      <DiffPreview
        original={data.original}
        generated={data.generated}
        violations={data.violations}
        diff={data.diff}
        fileName={data.fileName}
        requiresApproval={data.requiresApproval}
        valid={data.valid}
        onApprove={handleApprove}
        onReject={handleReject}
        onEditRules={handleEditRules}
      />
    </div>
  );
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
