import { UI_LOCALES, type LocaleMode, type UiLocale } from "../model";

const UI_LOCALE_SET = new Set<string>(UI_LOCALES);
const NUMBER_FORMATTERS = new Map<UiLocale, Intl.NumberFormat>();

interface AttributeTarget {
	setAttr: (name: string, value: string) => unknown;
}

function canonicalLocale(value: string): string | null {
	try {
		return Intl.getCanonicalLocales(value)[0] ?? null;
	} catch {
		return null;
	}
}

function resolveChinese(locale: Intl.Locale): UiLocale {
	if (locale.script === "Hant") return "zh-TW";
	if (locale.script === "Hans") return "zh-CN";
	if (locale.region === "TW" || locale.region === "HK" || locale.region === "MO") {
		return "zh-TW";
	}
	return "zh-CN";
}

export function resolveUiLocale(mode: LocaleMode, obsidianLanguage: string): UiLocale {
	if (mode !== "auto") return mode;
	const canonical = canonicalLocale(obsidianLanguage);
	if (!canonical) return "en";
	const locale = new Intl.Locale(canonical);
	if (locale.language === "pt") return "pt-BR";
	if (locale.language === "zh") return resolveChinese(locale);
	return UI_LOCALE_SET.has(locale.language) ? locale.language as UiLocale : "en";
}

export function uiDirection(locale: UiLocale): "ltr" | "rtl" {
	return locale === "ar" ? "rtl" : "ltr";
}

export function applyUiChromeDirection(target: AttributeTarget, locale: UiLocale): void {
	target.setAttr("lang", locale);
	target.setAttr("dir", uiDirection(locale));
}

export function applyUserDataDirection(target: AttributeTarget): void {
	target.setAttr("dir", "auto");
}

export function formatUiNumber(value: number, locale: UiLocale): string {
	let formatter = NUMBER_FORMATTERS.get(locale);
	if (!formatter) {
		formatter = new Intl.NumberFormat(locale);
		NUMBER_FORMATTERS.set(locale, formatter);
	}
	return formatter.format(value);
}
