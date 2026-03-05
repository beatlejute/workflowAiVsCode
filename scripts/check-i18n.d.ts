/**
 * Type declarations for scripts/check-i18n.js
 */

export interface TranslationResult {
  locale: string;
  fileType: string;
  error?: string;
  missingKeys: string[];
  hasError: boolean;
  isComplete?: boolean;
}

export function readJsonFile(filePath: string): object | null;
export function getKeys(obj: object | null): string[];
export function findMissingKeys(master: object, translation: object): string[];
export function checkTranslationFile(
  masterPath: string,
  translationPath: string,
  locale: string,
  fileType: string
): TranslationResult;
export function checkAllTranslations(
  masterPath: string,
  filePrefix: string,
  fileType: string,
  subDir?: string,
  baseDir?: string
): TranslationResult[];
export const SUPPORTED_LOCALES: string[];
