import * as vscode from 'vscode';

/**
 * CommandRegistry - централизованная регистрация и управление VSCode командами.
 * 
 * Устраняет ~500 строк boilerplate в extension.ts с repeated vscode.commands.registerCommand(...).
 * Реализует паттерн register/dispose для безопасного управления жизненным циклом команд.
 * 
 * @example
 * ```typescript
 * const registry = new CommandRegistry();
 * registry.register('my.command', () => { ... });
 * context.subscriptions.push(registry);
 * ```
 */
export class CommandRegistry implements vscode.Disposable {
  protected disposables: vscode.Disposable[] = [];

  /**
   * Зарегистрировать команду в VSCode.
   * 
   * @param id - Идентификатор команды (например, 'workflow.openTicket')
   * @param handler - Функция-обработчик команды
   */
  register(id: string, handler: (...args: unknown[]) => unknown): void {
    const disposable = vscode.commands.registerCommand(id, handler);
    this.disposables.push(disposable);
  }

  /**
   * Освободить все зарегистрированные команды.
   * Вызывается автоматически при деактивации расширения.
   */
  dispose(): void {
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }

  /**
   * Получить количество зарегистрированных команд.
   * Полезно для тестирования и отладки.
   */
  getCount(): number {
    return this.disposables.length;
  }

  /**
   * Добавить disposable вручную.
   * Используется только для тестирования.
   * @internal
   */
  addDisposable(disposable: vscode.Disposable): void {
    this.disposables.push(disposable);
  }
}
