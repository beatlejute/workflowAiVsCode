// ESM re-export of the CJS mock
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const vscode = require('./index.js');

export const {
  TreeItemCollapsibleState,
  CompletionItemKind,
  CompletionTriggerKind,
  DiagnosticSeverity,
  StatusBarAlignment,
  EndOfLine,
  ViewColumn,
  SymbolKind,
  CodeActionKind,
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
  workspace,
  window,
  commands,
  languages,
  extensions,
  env
} = vscode;

export default vscode;
