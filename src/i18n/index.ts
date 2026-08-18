import type { UiLocale } from "../model";
import { CATALOGS, EN } from "./catalogs";
import type { Translator } from "./keys";

export * from "./catalogs";
export * from "./keys";
export * from "./locale";
export * from "./ribbon-icons";
export { UI_LOCALES } from "../model";

const TOKEN = /\{([a-zA-Z0-9_]+)\}/g;

export function createTranslator(locale: UiLocale): Translator {
	const catalog = CATALOGS[locale] ?? EN;
	return (key, vars) => (catalog[key] ?? EN[key]).replace(TOKEN, (token, name: string) => {
		const value = vars?.[name];
		return value === undefined ? token : String(value);
	});
}
