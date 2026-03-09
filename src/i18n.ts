import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Доступные локали
 */
export type Locale = 'auto' | 'en' | 'ru' | 'de' | 'fr' | 'es' | 'it' | 'pt' | 'zh' | 'ja' | 'ko';

/**
 * Кэш загруженных бандлов
 */
const bundleCache = new Map<Locale, Record<string, string>>();

/**
 * Получить путь к директории l10n
 */
function getL10nDir(): string {
  const extensionPath = vscode.extensions.getExtension('workflow-ai.workflow-vscode')?.extensionPath;
  if (!extensionPath) {
    // Fallback: используем путь относительно текущего файла
    return path.join(__dirname, '..', 'l10n');
  }
  return path.join(extensionPath, 'l10n');
}

/**
 * Загрузить бандл для указанной локали
 */
function loadBundle(locale: Locale): Record<string, string> {
  // Проверка кэша
  if (bundleCache.has(locale)) {
    return bundleCache.get(locale)!;
  }

  const l10nDir = getL10nDir();
  let bundlePath: string;

  if (locale === 'auto' || locale === 'en') {
    // Для auto и en используем дефолтный бандл
    bundlePath = path.join(l10nDir, 'bundle.l10n.json');
  } else {
    // Для остальных локалей используем специфичный бандл
    const localeMap: Record<string, string> = {
      'ru': 'bundle.l10n.ru.json',
      'de': 'bundle.l10n.de.json',
      'fr': 'bundle.l10n.fr.json',
      'es': 'bundle.l10n.es.json',
      'it': 'bundle.l10n.it.json',
      'pt': 'bundle.l10n.pt-br.json',
      'zh': 'bundle.l10n.zh-cn.json',
      'ja': 'bundle.l10n.ja.json',
      'ko': 'bundle.l10n.ko.json'
    };

    const bundleFile = localeMap[locale];
    if (!bundleFile) {
      // Fallback на английский
      bundlePath = path.join(l10nDir, 'bundle.l10n.json');
    } else {
      bundlePath = path.join(l10nDir, bundleFile);
    }
  }

  try {
    const content = fs.readFileSync(bundlePath, 'utf-8');
    const bundle = JSON.parse(content);
    bundleCache.set(locale, bundle);
    return bundle;
  } catch (error) {
    console.error(`Failed to load bundle for locale ${locale}:`, error);
    // Возвращаем пустой объект при ошибке
    return {};
  }
}

/**
 * Получить текущую локаль из настроек
 */
function getCurrentLocale(): Locale {
  const config = vscode.workspace.getConfiguration('workflow');
  const locale = config.get<Locale>('locale', 'auto');
  return locale;
}

/**
 * Функция локализации t()
 * 
 * @param key - Ключ строки локализации
 * @param args - Аргументы для подстановки (поддерживаются {0}, {1}, и т.д.)
 * @returns Локализованная строка
 * 
 * @example
 * t('Hello') // Простая строка
 * t('Hello {0}', 'World') // Строка с аргументом
 * t('Hello {0} {1}', 'Beautiful', 'World') // Несколько аргументов
 */
export function t(key: string, ...args: (string | number)[]): string {
  const locale = getCurrentLocale();

  // Если 'auto' - делегируем vscode.l10n.t()
  if (locale === 'auto') {
    const message = vscode.l10n.t(key);
    return formatMessage(message, args);
  }

  // Для явной локали читаем бандл напрямую
  const bundle = loadBundle(locale);
  let message = bundle[key] ?? key;

  // Если не нашли в бандле, пробуем fallback на английский
  if (message === key && locale !== 'en') {
    const enBundle = loadBundle('en');
    message = enBundle[key] ?? key;
  }

  return formatMessage(message, args);
}

/**
 * Форматировать сообщение с аргументами
 */
function formatMessage(message: string, args: (string | number)[]): string {
  if (args.length === 0) {
    return message;
  }

  return message.replace(/\{(\d+)\}/g, (match, index) => {
    const argIndex = parseInt(index, 10);
    if (argIndex >= 0 && argIndex < args.length) {
      return String(args[argIndex]);
    }
    return match;
  });
}

/**
 * Инициализировать i18n (очистить кэш при смене локали)
 */
export function initializeI18n(): void {
  bundleCache.clear();
}

/**
 * Обработчик изменения конфигурации локали
 */
export function onLocaleChanged(): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('workflow.locale')) {
      bundleCache.clear();

      // Refresh all UI components with new locale
      vscode.commands.executeCommand('workflow.refreshAll');

      const locale = getCurrentLocale();
      const message = locale === 'auto'
        ? t('Using VS Code locale')
        : t('Using locale: {0}', locale);

      vscode.window.showInformationMessage(message);
    }
  });
}
