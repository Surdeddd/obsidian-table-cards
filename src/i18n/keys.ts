import type { EN } from "./catalogs/en";

export type TranslationKey = keyof typeof EN;
export type TranslationCatalog = { [K in TranslationKey]: string };
export type TranslationVars = Record<string, string | number>;
export type Translator = (key: TranslationKey, vars?: TranslationVars) => string;
