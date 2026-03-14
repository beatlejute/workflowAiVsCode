'use strict';

const fs = require('fs');

// Enums
const TreeItemCollapsibleState = Object.freeze({ None: 0, Collapsed: 1, Expanded: 2 });
const ProgressLocation = Object.freeze({ SourceControl: 1, Window: 10, Notification: 15 });
const CompletionItemKind = Object.freeze({
  Text: 0, Method: 1, Function: 2, Constructor: 3, Field: 4,
  Variable: 5, Class: 6, Interface: 7, Module: 8, Property: 9,
  Unit: 10, Value: 11, Enum: 12, Keyword: 13, Snippet: 14,
  Color: 15, File: 16, Reference: 17, Folder: 18, EnumMember: 19,
  Constant: 20, Struct: 21, Event: 22, Operator: 23, TypeParameter: 24
});
const CompletionTriggerKind = Object.freeze({ Invoked: 0, TriggerCharacter: 1, TriggerForIncompleteCompletions: 2 });
const DiagnosticSeverity = Object.freeze({ Error: 0, Warning: 1, Information: 2, Hint: 3 });
const StatusBarAlignment = Object.freeze({ Left: 1, Right: 2 });
const EndOfLine = Object.freeze({ LF: 1, CRLF: 2 });
const ViewColumn = Object.freeze({ Active: -1, Beside: -2, One: 1, Two: 2, Three: 3 });
const SymbolKind = Object.freeze({ File: 0, Module: 1, Namespace: 2, Package: 3, Class: 4 });
const CodeActionKind = Object.freeze({ Empty: { value: '' }, QuickFix: { value: 'quickfix' } });
const ExtensionMode = Object.freeze({ Production: 1, Development: 2, Test: 3 });

// Classes
class Position {
  constructor(line, character) {
    this.line = line;
    this.character = character;
  }
  isEqual(other) { return this.line === other.line && this.character === other.character; }
  isBefore(other) { return this.line < other.line || (this.line === other.line && this.character < other.character); }
  isAfter(other) { return other.isBefore(this); }
  translate(lineDelta = 0, characterDelta = 0) {
    return new Position(this.line + lineDelta, this.character + characterDelta);
  }
  with(line = this.line, character = this.character) { return new Position(line, character); }
}

class Range {
  constructor(startOrLine, startCharOrEnd, endLine, endCharacter) {
    if (startOrLine instanceof Position) {
      this.start = startOrLine;
      this.end = startCharOrEnd;
    } else {
      this.start = new Position(startOrLine, startCharOrEnd);
      this.end = new Position(endLine, endCharacter);
    }
  }
  get isEmpty() { return this.start.isEqual(this.end); }
  get isSingleLine() { return this.start.line === this.end.line; }
  contains(positionOrRange) {
    if (positionOrRange instanceof Position) {
      return !positionOrRange.isBefore(this.start) && !this.end.isBefore(positionOrRange);
    }
    return this.contains(positionOrRange.start) && this.contains(positionOrRange.end);
  }
  intersection(range) {
    const start = this.start.isBefore(range.start) ? range.start : this.start;
    const end = this.end.isBefore(range.end) ? this.end : range.end;
    if (start.isBefore(end) || start.isEqual(end)) return new Range(start, end);
    return undefined;
  }
  union(other) {
    const start = this.start.isBefore(other.start) ? this.start : other.start;
    const end = this.end.isBefore(other.end) ? other.end : this.end;
    return new Range(start, end);
  }
}

class Uri {
  constructor(scheme, authority, path, query, fragment) {
    this.scheme = scheme || 'file';
    this.authority = authority || '';
    this.path = path || '';
    this.query = query || '';
    this.fragment = fragment || '';
    this.fsPath = this.path;
  }
  static file(path) {
    const uri = new Uri('file', '', path.replace(/\\/g, '/'), '', '');
    uri.fsPath = path;
    return uri;
  }
  static parse(str) {
    const match = str.match(/^([^:]+):\/\/([^/]*)(\/.*)$/);
    if (match) return new Uri(match[1], match[2], match[3], '', '');
    return new Uri('file', '', str, '', '');
  }
  static joinPath(uri, ...parts) {
    const newPath = [uri.path, ...parts].join('/').replace(/\/+/g, '/');
    return new Uri(uri.scheme, uri.authority, newPath, uri.query, uri.fragment);
  }
  with(change) {
    return new Uri(
      change.scheme !== undefined ? change.scheme : this.scheme,
      change.authority !== undefined ? change.authority : this.authority,
      change.path !== undefined ? change.path : this.path,
      change.query !== undefined ? change.query : this.query,
      change.fragment !== undefined ? change.fragment : this.fragment
    );
  }
  toString() { return `${this.scheme}://${this.authority}${this.path}`; }
  toJSON() { return { scheme: this.scheme, authority: this.authority, path: this.path }; }
}

class MarkdownString {
  constructor(value = '') {
    this.value = value;
    this.isTrusted = false;
    this.supportHtml = false;
    this.supportThemeIcons = false;
  }
  appendMarkdown(str) { this.value += str; return this; }
  appendText(str) { this.value += str.replace(/[\\`*_{}[\]()#+\-.!]/g, '\\$&'); return this; }
  appendCodeblock(code, language) { this.value += `\`\`\`${language || ''}\n${code}\n\`\`\``; return this; }
}

class ThemeColor {
  constructor(id) { this.id = id; }
}

class ThemeIcon {
  constructor(id, color) {
    this.id = id;
    this.color = color;
  }
  static File = new ThemeIcon('file');
  static Folder = new ThemeIcon('folder');
}

class TreeItem {
  constructor(labelOrUri, collapsibleState) {
    if (typeof labelOrUri === 'string') {
      this.label = labelOrUri;
    } else if (labelOrUri && typeof labelOrUri === 'object') {
      if (labelOrUri instanceof Uri) {
        this.resourceUri = labelOrUri;
        this.label = '';
      } else {
        this.label = labelOrUri.label || '';
      }
    }
    this.collapsibleState = collapsibleState !== undefined ? collapsibleState : TreeItemCollapsibleState.None;
    this.id = undefined;
    this.iconPath = undefined;
    this.description = undefined;
    this.tooltip = undefined;
    this.command = undefined;
    this.contextValue = undefined;
    this.accessibilityInformation = undefined;
  }
}

class EventEmitter {
  constructor() {
    this._listeners = [];
    this.event = (listener, thisArgs, disposables) => {
      this._listeners.push(listener.bind(thisArgs || this));
      const disposable = { dispose: () => {
        const idx = this._listeners.indexOf(listener);
        if (idx >= 0) this._listeners.splice(idx, 1);
      }};
      if (disposables) disposables.push(disposable);
      return disposable;
    };
  }
  fire(data) { this._listeners.forEach(l => l(data)); }
  dispose() { this._listeners = []; }
}

class Disposable {
  constructor(callOnDispose) { this._callOnDispose = callOnDispose; }
  dispose() { if (this._callOnDispose) this._callOnDispose(); }
  static from(...disposables) {
    return new Disposable(() => disposables.forEach(d => d.dispose()));
  }
}

class CancellationTokenSource {
  constructor() {
    this.token = { isCancellationRequested: false, onCancellationRequested: new EventEmitter().event };
  }
  cancel() { this.token.isCancellationRequested = true; }
  dispose() {}
}

class CompletionItem {
  constructor(label, kind) {
    this.label = label;
    this.kind = kind;
    this.detail = undefined;
    this.documentation = undefined;
    this.insertText = undefined;
    this.range = undefined;
  }
}

class CompletionList {
  constructor(items = [], isIncomplete = false) {
    this.items = items;
    this.isIncomplete = isIncomplete;
  }
}

class CodeLens {
  constructor(range, command) {
    this.range = range;
    this.command = command;
    this.isResolved = command !== undefined;
  }
}

class Diagnostic {
  constructor(range, message, severity = DiagnosticSeverity.Error) {
    this.range = range;
    this.message = message;
    this.severity = severity;
    this.source = undefined;
    this.code = undefined;
    this.tags = undefined;
    this.relatedInformation = undefined;
  }
}

class DiagnosticCollection {
  constructor(name) {
    this.name = name;
    this._map = new Map();
  }
  set(uri, diagnostics) {
    if (diagnostics === undefined) {
      this._map.delete(uri.toString());
    } else {
      this._map.set(uri.toString(), diagnostics);
    }
  }
  delete(uri) { this._map.delete(uri.toString()); }
  clear() { this._map.clear(); }
  forEach(callback) { this._map.forEach((v, k) => callback(Uri.parse(k), v, this)); }
  get(uri) { return this._map.get(uri.toString()); }
  has(uri) { return this._map.has(uri.toString()); }
  dispose() { this._map.clear(); }
}

class DocumentLink {
  constructor(range, target) {
    this.range = range;
    this.target = target;
    this.tooltip = undefined;
  }
}

class RelativePattern {
  constructor(base, pattern) {
    this.base = typeof base === 'string' ? base : (base.uri ? base.uri.fsPath : base.fsPath || '');
    this.pattern = pattern;
  }
}

class Hover {
  constructor(contents, range) {
    this.contents = contents;
    this.range = range;
  }
}

class FileSystemWatcher {
  constructor() {
    this.onDidCreate = new EventEmitter().event;
    this.onDidChange = new EventEmitter().event;
    this.onDidDelete = new EventEmitter().event;
  }
  dispose() {}
}

class StatusBarItem {
  constructor(alignment, priority) {
    this.alignment = alignment;
    this.priority = priority;
    this.text = '';
    this.tooltip = undefined;
    this.color = undefined;
    this.command = undefined;
    this.backgroundColor = undefined;
    this.accessibilityInformation = undefined;
    this.id = '';
    this.name = '';
  }
  show() {}
  hide() {}
  dispose() {}
}

// Workspace namespace
const workspace = {
  workspaceFolders: [],
  rootPath: undefined,
  name: undefined,
  onDidChangeConfiguration: new EventEmitter().event,
  onDidChangeWorkspaceFolders: new EventEmitter().event,
  onDidSaveTextDocument: new EventEmitter().event,
  onDidOpenTextDocument: new EventEmitter().event,
  onDidCloseTextDocument: new EventEmitter().event,
  onDidChangeTextDocument: new EventEmitter().event,
  createFileSystemWatcher: () => new FileSystemWatcher(),
  getConfiguration: (section) => ({
    get: (key, defaultValue) => defaultValue,
    has: () => false,
    inspect: () => undefined,
    update: async () => {}
  }),
  findFiles: async () => [],
  openTextDocument: async (uriOrPath) => {
    const filePath = typeof uriOrPath === 'string' ? uriOrPath :
      (uriOrPath && uriOrPath.fsPath ? uriOrPath.fsPath : String(uriOrPath));
    let content = '';
    try { content = fs.readFileSync(filePath, 'utf-8'); } catch (e) {}
    const fileUri = Uri.file(filePath);
    return {
      uri: fileUri,
      fileName: filePath,
      languageId: 'markdown',
      version: 1,
      isDirty: false,
      isClosed: false,
      getText: (range) => content,
      lineAt: (lineOrPos) => {
        const lineNum = typeof lineOrPos === 'number' ? lineOrPos : lineOrPos.line;
        const lines = content.split('\n');
        const text = lines[lineNum] || '';
        return { lineNumber: lineNum, text, range: new Range(lineNum, 0, lineNum, text.length), isEmptyOrWhitespace: text.trim() === '' };
      },
      lineCount: content.split('\n').length,
      save: async () => true,
      positionAt: (offset) => new Position(0, offset),
      offsetAt: (pos) => pos.character
    };
  },
  applyEdit: async () => true,
  fs: {
    readFile: async () => Buffer.from(''),
    writeFile: async () => {},
    delete: async () => {},
    stat: async () => ({ type: 1, ctime: 0, mtime: 0, size: 0 })
  }
};

// Window namespace
const window = {
  activeTextEditor: undefined,
  visibleTextEditors: [],
  onDidChangeActiveTextEditor: new EventEmitter().event,
  onDidChangeTextEditorSelection: new EventEmitter().event,
  showInformationMessage: async (...args) => undefined,
  showWarningMessage: async (...args) => undefined,
  showErrorMessage: async (...args) => undefined,
  showQuickPick: async (items, options) => undefined,
  showInputBox: async (options) => undefined,
  createOutputChannel: (name) => ({
    name,
    append: () => {},
    appendLine: () => {},
    show: () => {},
    hide: () => {},
    clear: () => {},
    dispose: () => {}
  }),
  createStatusBarItem: (alignment, priority) => new StatusBarItem(alignment, priority),
  createWebviewPanel: () => ({
    webview: { html: '', onDidReceiveMessage: new EventEmitter().event, postMessage: async () => {} },
    onDidDispose: new EventEmitter().event,
    reveal: () => {},
    dispose: () => {}
  }),
  withProgress: async (options, task) => {
    const tokenEmitter = new EventEmitter();
    const token = { isCancellationRequested: false, onCancellationRequested: tokenEmitter.event };
    return task({ report: () => {} }, token);
  },
  showTextDocument: async () => undefined,
  showOpenDialog: async () => undefined,
  showSaveDialog: async () => undefined,
  registerTreeDataProvider: (viewId, provider) => new Disposable(() => {}),
  createTreeView: (viewId, options) => ({
    title: viewId,
    description: '',
    message: '',
    selection: [],
    visible: true,
    onDidChangeSelection: new EventEmitter().event,
    onDidChangeVisibility: new EventEmitter().event,
    onDidCollapseElement: new EventEmitter().event,
    onDidExpandElement: new EventEmitter().event,
    reveal: async () => {},
    dispose: () => {}
  }),
  registerFileDecorationProvider: (provider) => new Disposable(() => {}),
  registerWebviewViewProvider: (viewId, provider) => new Disposable(() => {})
};

// Commands namespace
const _commandHandlers = new Map();
const commands = {
  registerCommand: (id, handler) => {
    _commandHandlers.set(id, handler);
    return new Disposable(() => { _commandHandlers.delete(id); });
  },
  registerTextEditorCommand: (id, handler) => new Disposable(() => {}),
  executeCommand: async (id, ...args) => {
    const handler = _commandHandlers.get(id);
    if (handler) {
      return await handler(...args);
    }
    return undefined;
  },
  getCommands: async () => Array.from(_commandHandlers.keys())
};

// Languages namespace
const languages = {
  createDiagnosticCollection: (name) => new DiagnosticCollection(name),
  registerCodeLensProvider: () => new Disposable(() => {}),
  registerHoverProvider: () => new Disposable(() => {}),
  registerCompletionItemProvider: () => new Disposable(() => {}),
  registerDocumentLinkProvider: () => new Disposable(() => {}),
  registerCodeActionsProvider: () => new Disposable(() => {}),
  registerDefinitionProvider: () => new Disposable(() => {})
};

// Extensions namespace
const extensions = {
  getExtension: () => undefined,
  all: []
};

// l10n namespace (localization)
const l10n = {
  t: (message, ...args) => {
    if (args.length === 0) return message;
    return message.replace(/\{(\d+)\}/g, (match, index) => {
      const i = parseInt(index, 10);
      return i >= 0 && i < args.length ? String(args[i]) : match;
    });
  },
  bundle: {}
};

// env namespace
const env = {
  language: 'en',
  appName: 'Visual Studio Code',
  appRoot: '',
  clipboard: {
    readText: async () => '',
    writeText: async () => {}
  },
  openExternal: async () => true,
  uriScheme: 'vscode'
};

module.exports = {
  // Enums
  TreeItemCollapsibleState,
  ProgressLocation,
  CompletionItemKind,
  CompletionTriggerKind,
  DiagnosticSeverity,
  StatusBarAlignment,
  EndOfLine,
  ViewColumn,
  SymbolKind,
  CodeActionKind,
  ExtensionMode,

  // Classes
  Position,
  Range,
  Uri,
  MarkdownString,
  ThemeColor,
  ThemeIcon,
  TreeItem,
  EventEmitter,
  Disposable,
  CancellationTokenSource,
  CompletionItem,
  CompletionList,
  CodeLens,
  Diagnostic,
  DiagnosticCollection,
  DocumentLink,
  RelativePattern,
  Hover,
  FileSystemWatcher,
  StatusBarItem,

  // l10n
  l10n,

  // Namespaces
  workspace,
  window,
  commands,
  languages,
  extensions,
  env
};
