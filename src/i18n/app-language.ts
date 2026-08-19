import { getLanguage } from "obsidian";

export interface AppLanguageSources {
	apiLanguage?: (() => string) | undefined;
	storage?: Pick<Storage, "getItem"> | null | undefined;
	momentLocale?: (() => string) | undefined;
	navigatorLanguage?: string | null | undefined;
}

function callSafely(source: (() => string) | undefined): string {
	if (typeof source !== "function") return "";
	try {
		const value = source();
		return typeof value === "string" ? value : "";
	} catch {
		return "";
	}
}

function readStoredLanguage(storage: Pick<Storage, "getItem"> | null | undefined): string {
	if (!storage) return "";
	try {
		return storage.getItem("language") ?? "";
	} catch {
		return "";
	}
}

export function readAppLanguage(sources: AppLanguageSources): string {
	return (
		callSafely(sources.apiLanguage) ||
		readStoredLanguage(sources.storage) ||
		callSafely(sources.momentLocale) ||
		(sources.navigatorLanguage ?? "") ||
		"en"
	);
}

export function appLanguage(): string {
	const languageApi: unknown = getLanguage;
	const scope = typeof window === "undefined" ? undefined : window;
	const moment = (scope as { moment?: { locale?: () => string } } | undefined)?.moment;
	return readAppLanguage({
		apiLanguage: typeof languageApi === "function" ? (languageApi as () => string) : undefined,
		storage: scope?.localStorage ?? null,
		momentLocale: typeof moment?.locale === "function" ? () => moment.locale?.() ?? "" : undefined,
		navigatorLanguage: scope?.navigator?.language ?? null,
	});
}
