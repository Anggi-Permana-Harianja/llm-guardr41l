// Mock VS Code API for testing

export const workspace = {
  workspaceFolders: [
    {
      uri: {
        fsPath: '/mock/workspace'
      }
    }
  ],
  getConfiguration: jest.fn().mockReturnValue({
    get: jest.fn((key: string, defaultValue: unknown) => defaultValue)
  }),
  openTextDocument: jest.fn().mockResolvedValue({})
};

export const window = {
  showInformationMessage: jest.fn().mockResolvedValue(undefined),
  showWarningMessage: jest.fn().mockResolvedValue(undefined),
  showErrorMessage: jest.fn().mockResolvedValue(undefined),
  showInputBox: jest.fn().mockResolvedValue(undefined),
  showTextDocument: jest.fn().mockResolvedValue(undefined),
  activeTextEditor: undefined,
  createWebviewPanel: jest.fn().mockReturnValue({
    webview: {
      html: '',
      onDidReceiveMessage: jest.fn(),
      asWebviewUri: jest.fn((uri: { fsPath: string }) => uri.fsPath)
    },
    reveal: jest.fn(),
    dispose: jest.fn(),
    onDidDispose: jest.fn()
  }),
  withProgress: jest.fn().mockImplementation(async (_options, task) => {
    return task({ report: jest.fn() });
  })
};

export const commands = {
  registerCommand: jest.fn().mockReturnValue({ dispose: jest.fn() }),
  executeCommand: jest.fn().mockResolvedValue(undefined)
};

export const Uri = {
  file: (path: string) => ({ fsPath: path }),
  joinPath: (base: { fsPath: string }, ...paths: string[]) => ({
    fsPath: [base.fsPath, ...paths].join('/')
  })
};

export const Range = class {
  constructor(
    public start: { line: number; character: number },
    public end: { line: number; character: number }
  ) {}
};

export const Position = class {
  constructor(public line: number, public character: number) {}
};

export const Selection = class {
  constructor(
    public anchor: { line: number; character: number },
    public active: { line: number; character: number }
  ) {}
  get isEmpty() {
    return this.anchor.line === this.active.line &&
           this.anchor.character === this.active.character;
  }
  get start() { return this.anchor; }
  get end() { return this.active; }
};

export enum ViewColumn {
  One = 1,
  Two = 2,
  Three = 3,
  Beside = -2
}

export enum ProgressLocation {
  Notification = 15
}

export const ExtensionContext = class {
  subscriptions: Array<{ dispose: () => void }> = [];
  extensionUri = { fsPath: '/mock/extension' };
};
