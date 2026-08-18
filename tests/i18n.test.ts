import { describe, expect, it } from "vitest";
import {
	CATALOGS,
	EN,
	UI_LOCALES,
	createTranslator,
	formatUiNumber,
	resolveUiLocale,
	uiDirection,
	type TranslationKey,
} from "../src/i18n";

const TOKENS = /\{([a-zA-Z0-9_]+)\}/g;
const SHARED_TERMS = ["Obsidian", "Markdown", "Table Cards"] as const;
const IDENTICAL_ALLOWED = new Set<TranslationKey>([
	"modal.deck",
	"settings.appearance.preset",
	"settings.appearance.preset.custom",
	"settings.decks.heading",
	"settings.deck.name",
	"settings.deck.sources",
	"editor.source.folder",
	"editor.column.unique",
	"editor.type.text",
	"editor.type.date",
	"editor.type.link",
	"editor.type.markdown",
	"editor.card.accent",
	"editor.image.top",
	"editor.color.aaa",
	"editor.color.aa",
	"editor.style.chips",
	"editor.style.text",
	"preset.phrases",
]);

function tokens(value: string): string[] {
	return Array.from(value.matchAll(TOKENS), (match) => match[1] ?? "").sort();
}

describe("localization", () => {
	it.each([
		["uk-UA", "uk"],
		["pt-PT", "pt-BR"],
		["pt-BR", "pt-BR"],
		["zh-Hans", "zh-CN"],
		["zh-Hant", "zh-TW"],
		["zh-HK", "zh-TW"],
		["ar-EG", "ar"],
		["xx-ZZ", "en"],
	] as const)("maps %s to %s", (input, expected) => {
		expect(resolveUiLocale("auto", input)).toBe(expected);
	});

	it("keeps an explicit supported locale", () => {
		expect(resolveUiLocale("de", "ru")).toBe("de");
	});

	it("keeps all sixteen catalogs in exact parity", () => {
		const expected = Object.keys(CATALOGS.en).sort();
		expect(UI_LOCALES).toHaveLength(16);
		for (const locale of UI_LOCALES) {
			expect(Object.keys(CATALOGS[locale]).sort()).toEqual(expected);
			expect(Object.values(CATALOGS[locale]).every((value) => value.trim().length > 0)).toBe(true);
		}
	});

	it("preserves every interpolation token across catalogs", () => {
		for (const key of Object.keys(EN) as TranslationKey[]) {
			for (const locale of UI_LOCALES) {
				expect(tokens(CATALOGS[locale][key]), `${locale}:${key}`).toEqual(tokens(EN[key]));
			}
		}
	});

	it("preserves brand and technical terms without transport artifacts", () => {
		for (const key of Object.keys(EN) as TranslationKey[]) {
			for (const locale of UI_LOCALES) {
				const value = CATALOGS[locale][key];
				expect(value, `${locale}:${key}`).not.toMatch(/XQZ|QZX\d+XZQ/);
				for (const term of SHARED_TERMS) {
					if (EN[key].includes(term)) expect(value, `${locale}:${key}`).toContain(term);
				}
			}
		}
	});

	it("has no obvious English sentence fallbacks", () => {
		for (const locale of UI_LOCALES.filter((item) => item !== "en")) {
			const unexpected = (Object.keys(EN) as TranslationKey[]).filter((key) =>
				CATALOGS[locale][key] === EN[key]
				&& !key.startsWith("settings.language.")
				&& !IDENTICAL_ALLOWED.has(key),
			);
			expect(unexpected, locale).toEqual([]);
		}
	});

	it("interpolates values in the active catalog", () => {
		expect(createTranslator("ru")("launcher.open", { count: "583" })).toBe("Открыть карточки: 583");
		expect(createTranslator("en")("launcher.summary", { cards: "3", tables: "2" }))
			.toBe("3 cards · 2 tables");
	});

	it("leaves missing interpolation variables visible", () => {
		expect(createTranslator("en")("launcher.summary", { cards: 3 })).toBe("3 cards · {tables} tables");
	});

	it("scopes RTL to Arabic only", () => {
		expect(uiDirection("ar")).toBe("rtl");
		for (const locale of UI_LOCALES.filter((item) => item !== "ar")) {
			expect(uiDirection(locale)).toBe("ltr");
		}
	});

	it("formats visible numbers with the active locale", () => {
		expect(formatUiNumber(12_345, "de")).toBe(new Intl.NumberFormat("de").format(12_345));
		expect(formatUiNumber(12_345, "hi")).toBe(new Intl.NumberFormat("hi").format(12_345));
	});
});
